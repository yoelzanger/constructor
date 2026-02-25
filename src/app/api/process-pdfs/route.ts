import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Hebrew normalization helpers (same as upload route) ─────────────────────

const hebrewStatusMap: Record<string, string> = {
    'בוצע': 'COMPLETED',
    'בוצע - תקין': 'COMPLETED_OK',
    'תקין': 'COMPLETED_OK',
    'לא תקין': 'NOT_OK',
    'ליקוי': 'DEFECT',
    'בטיפול': 'IN_PROGRESS',
    'טופל': 'HANDLED',
    'ממתין': 'PENDING',
    'לא התחיל': 'NOT_STARTED',
    'בביצוע': 'IN_PROGRESS',
    'הושלם': 'COMPLETED',
    'נמצא ליקוי': 'DEFECT',
    'תוקן': 'HANDLED',
    'קיימים אי תאומים': 'DEFECT',
    'קיימים אי תיאומים': 'DEFECT',
    'אי תאומים': 'DEFECT',
    'אי תיאומים': 'DEFECT',
    'יש הערות': 'DEFECT',
    'בוצע - יש הערות': 'DEFECT',
    'בוצע - יש ליקויים': 'DEFECT',
    'בוצע - נמצאו אי תאומים': 'DEFECT',
    'בוצע - נמצאו אי תיאומים': 'DEFECT',
    'נמצאו אי תאומים': 'DEFECT',
    'נמצאו אי תיאומים': 'DEFECT',
    'בוצע חלקי': 'IN_PROGRESS',
    'לטיפול': 'PENDING',
    'נדרש מעקב': 'PENDING',
    'נדרש ביצוע': 'PENDING',
    'בוצע עם הערות': 'DEFECT',
};

const hebrewCategoryMap: Record<string, string> = {
    'חשמל': 'ELECTRICAL',
    'אינסטלציה': 'PLUMBING',
    'מיזוג': 'AC',
    'מיזוג אויר': 'AC',
    'ריצוף': 'FLOORING',
    'חיפוי': 'FLOORING',
    'ספרינקלרים': 'SPRINKLERS',
    'ספרינקלר': 'SPRINKLERS',
    'כיבוי': 'SPRINKLERS',
    'כיבוי אש': 'SPRINKLERS',
    'גבס': 'DRYWALL',
    'הנמכות': 'DRYWALL',
    'איטום': 'WATERPROOFING',
    'צביעה': 'PAINTING',
    'צבע': 'PAINTING',
    'מטבח': 'KITCHEN',
    'חלונות': 'OTHER',
    'דלת כניסה': 'OTHER',
    'כללי': 'OTHER',
    'סניטריה': 'OTHER',
    'פיתוח': 'OTHER',
    'עבודות פיתוח': 'OTHER',
    'אחר': 'OTHER',
};

const DEFECT_KEYWORDS = [
    'אי תיאומים', 'אי תאומים', 'נמצאו אי', 'קיימים אי',
    'יש הערות', 'יש ליקויים', 'ליקוי', 'ליקויים',
    'לא תקין', 'חסר', 'חסרה', 'חסרות', 'חסרים',
    'שבור', 'שבורה', 'שבורים', 'סדוק', 'סדוקה', 'סדוקים',
    'פגם', 'פגמים', 'בעיה', 'בעיות', 'לתקן', 'תיקון',
    'לא בוצע', 'לא הותקן', 'לא הותקנו', 'חתוך', 'חתוכים',
    'להחליף', 'החלפה', 'נזק', 'נזקים', 'לא הושלם', 'טעון',
];

const PARTIAL_KEYWORDS = ['חלקי', 'חלקית', 'בביצוע', 'בטיפול'];

function normalizeStatus(hebrewStatus: string, notes: string | null = null): string {
    const trimmed = hebrewStatus.trim().toLowerCase();
    const combined = [hebrewStatus, notes].filter(Boolean).join(' ').toLowerCase();
    for (const kw of DEFECT_KEYWORDS) if (combined.includes(kw.toLowerCase())) return 'DEFECT';
    for (const kw of PARTIAL_KEYWORDS) if (trimmed.includes(kw.toLowerCase())) return 'IN_PROGRESS';
    if (hebrewStatusMap[hebrewStatus.trim()]) return hebrewStatusMap[hebrewStatus.trim()];
    const sorted = Object.entries(hebrewStatusMap).sort((a, b) => b[0].length - a[0].length);
    for (const [heb, s] of sorted) if (trimmed.includes(heb.toLowerCase())) return s;
    return 'IN_PROGRESS';
}

function normalizeCategory(hebrewCategory: string): string {
    const trimmed = hebrewCategory.trim();
    if (hebrewCategoryMap[trimmed]) return hebrewCategoryMap[trimmed];
    for (const [heb, cat] of Object.entries(hebrewCategoryMap)) if (trimmed.includes(heb)) return cat;
    return 'OTHER';
}

function parseDate(dateStr: string | null): Date | null {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    if (trimmed.includes('תקין') || trimmed.includes('לא תקין') || trimmed.includes('קיימים')) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) { const d = new Date(trimmed); if (!isNaN(d.getTime())) return d; }
    const m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (m) {
        let yr = parseInt(m[3]); if (yr < 100) yr += 2000;
        const d = new Date(yr, parseInt(m[2]) - 1, parseInt(m[1]));
        if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
    return null;
}

const EXTRACTION_PROMPT = `You are analyzing a Hebrew construction progress report PDF for a TAMA 38/2 urban renewal project at Mosinzon 5, Tel Aviv.

Extract the following information and return it as a valid JSON object:

1. **Report Metadata**: reportDate (YYYY-MM-DD), inspector, projectName
2. **Apartments Data**: For each apartment (1,3,5,6,7,10,11,14):
   - apartmentNumber, workItems (category in Hebrew, location, description, status in Hebrew, notes, hasPhoto), inspectionDates
3. **Development Items**: Site-level work (same structure)
4. **Progress Tracking Table**: apartmentNumber, category, inspectionDate, status

Return ONLY valid JSON, no explanations.`;

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    // Verify this is called by Vercel Cron (or an authorized user)
    const authHeader = request.headers.get('authorization');
    if (
        process.env.CRON_SECRET &&
        authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Find unprocessed reports
        const unprocessed = await prisma.report.findMany({
            where: { processed: false },
            take: 3, // Process max 3 per cron run to stay within Vercel's 60s timeout
        });

        if (unprocessed.length === 0) {
            return NextResponse.json({ message: 'No unprocessed reports.', processed: 0 });
        }

        const apartments = await prisma.apartment.findMany();
        const apartmentMap = new Map(apartments.map((a) => [a.number, a.id]));

        let totalProcessed = 0;
        const errors: string[] = [];

        for (const report of unprocessed) {
            try {
                // Fetch the PDF from Vercel Blob using the stored URL
                const pdfResponse = await fetch(report.filePath);
                if (!pdfResponse.ok) {
                    throw new Error(`Failed to fetch PDF from blob: ${pdfResponse.statusText}`);
                }
                const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
                const base64Pdf = pdfBuffer.toString('base64');

                // Extract data with Claude
                const response = await anthropic.messages.create({
                    model: 'claude-3-5-sonnet-20241022',
                    max_tokens: 8192,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
                                { type: 'text', text: EXTRACTION_PROMPT },
                            ],
                        },
                    ],
                });

                const textContent = response.content.find((c) => c.type === 'text');
                if (!textContent || textContent.type !== 'text') throw new Error('No text response from Claude');

                let extracted: Record<string, unknown>;
                const codeBlockMatch = textContent.text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (codeBlockMatch) {
                    extracted = JSON.parse(codeBlockMatch[1]);
                } else {
                    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) throw new Error('No JSON found in response');
                    extracted = JSON.parse(jsonMatch[0]);
                }

                // Process apartments
                const aptData = extracted.apartments as Array<{
                    apartmentNumber: string;
                    workItems?: Array<{ category: string; location?: string; description: string; status: string; notes?: string; hasPhoto?: boolean }>;
                    inspectionDates?: Record<string, string>;
                }>;

                for (const apt of aptData || []) {
                    const apartmentId = apartmentMap.get(apt.apartmentNumber);
                    if (!apartmentId) continue;

                    for (const item of apt.workItems || []) {
                        await prisma.workItem.create({
                            data: {
                                reportId: report.id,
                                apartmentId,
                                category: normalizeCategory(item.category),
                                location: item.location || null,
                                description: item.description,
                                status: normalizeStatus(item.status, item.notes || null),
                                notes: item.notes || null,
                                hasPhoto: item.hasPhoto || false,
                            },
                        });
                    }

                    for (const [cat, dateStr] of Object.entries(apt.inspectionDates || {})) {
                        const inspDate = parseDate(dateStr);
                        if (!inspDate) continue;
                        await prisma.inspection.upsert({
                            where: { reportId_apartmentId_category: { reportId: report.id, apartmentId, category: normalizeCategory(cat) } },
                            create: { reportId: report.id, apartmentId, category: normalizeCategory(cat), inspectionDate: inspDate },
                            update: { inspectionDate: inspDate },
                        });
                    }
                }

                // Process development items
                const devItems = extracted.developmentItems as Array<{ category: string; location?: string; description: string; status: string; notes?: string; hasPhoto?: boolean }>;
                for (const item of devItems || []) {
                    await prisma.workItem.create({
                        data: {
                            reportId: report.id,
                            apartmentId: null,
                            category: normalizeCategory(item.category),
                            location: item.location || null,
                            description: item.description,
                            status: normalizeStatus(item.status, item.notes || null),
                            notes: item.notes || null,
                            hasPhoto: item.hasPhoto || false,
                        },
                    });
                }

                // Mark as processed
                await prisma.report.update({ where: { id: report.id }, data: { processed: true } });
                totalProcessed++;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`${report.fileName}: ${msg}`);
                console.error(`[process-pdfs] Error processing ${report.fileName}:`, err);
            }
        }

        return NextResponse.json({ processed: totalProcessed, errors });
    } catch (error) {
        console.error('[process-pdfs] Fatal error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
