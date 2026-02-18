import { writeFile } from 'fs/promises';
import { prisma } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse');

import {
    validateExtractedData,
    createFullValidationResult,
    ExtractedReportData as ValidationExtractedData,
} from '@/lib/upload-validation';
import { createSnapshot, cleanupOldSnapshots } from '@/lib/snapshot';

// Initialize Providers
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');

// Status mapping
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

// Category mapping
const hebrewCategoryMap: Record<string, string> = {
    'חשמל': 'ELECTRICAL',
    'אינסטלציה': 'PLUMBING',
    'מיזוג': 'AC',
    'מיזוג אויר': 'AC',
    'מ"א': 'AC', // Added AC abbreviation
    'ריצוף': 'FLOORING',
    'חיפוי': 'FLOORING',
    'ספרינקלרים': 'SPRINKLERS',
    'ספרינקלר': 'SPRINKLERS',
    'כיבוי': 'SPRINKLERS',
    'כיבוי אש': 'SPRINKLERS',
    'גבס': 'DRYWALL',
    'הנמכות': 'DRYWALL',
    'הנמכה': 'DRYWALL', // Added singular
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

// Keywords to search in description if category is unclear or "OTHER"
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    'ELECTRICAL': ['חשמל', 'שקע', 'מפסק', 'תאורה', 'לוח', 'כבל', 'חוטים'],
    'AC': ['מ"א', 'מיזוג', 'מזגן', 'דמפר', 'תריס', 'VRF', 'vrf', 'צנרת גז'],
    'SPRINKLERS': ['ספרינקלר', 'מתז', 'כיבוי אש', 'גלאי', 'ספרינקלרים'],
    'DRYWALL': ['גבס', 'הנמכות', 'הנמכה', 'קרניז', 'נישה', 'תקרה אקוסטית'],
    'FLOORING': ['ריצוף', 'חיפוי', 'פוגה', 'רובה', 'שיפועים', 'קרמיקה', 'פורצלן', 'פרקט', 'פנלים'],
    'PLUMBING': ['אינסטלציה', 'צנרת', 'ביוב', 'דלוחין', 'נקז', 'סיפון', 'ברז', 'אסלה', 'כיור', 'מקלחת', 'אמבטיה'],
    'WATERPROOFING': ['איטום', 'יריעות', 'פריימר', 'זפת', 'רולקות', 'סף הפרדה'],
    'PAINTING': ['צבע', 'צביעה', 'סיוד', 'תיקוני שפכטל', 'צביעת קירות', 'צביעת תקרה'],
    'KITCHEN': ['מטבח', 'ארונות', 'שיש', 'כיור מטבח'],
};

// Defect keywords
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

// Extract date from filename - supports multiple formats
export function extractDateFromFilename(filename: string): Date | null {
    // Format 1: YYYY-MM-DD at the start (e.g., "2024-11-03 - מוסינזון...")
    const isoMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
        const date = new Date(isoMatch[1]);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }

    // Format 2: DD.MM.YY or DD.MM.YYYY at the end (e.g., "...18.9.23.pdf")
    const ddmmyyMatch = filename.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\.pdf)?$/i);
    if (ddmmyyMatch) {
        const day = parseInt(ddmmyyMatch[1]);
        const month = parseInt(ddmmyyMatch[2]) - 1;
        let year = parseInt(ddmmyyMatch[3]);
        if (year < 100) {
            year = year < 50 ? 2000 + year : 1900 + year;
        }
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }

    // Format 3: DD.MM.YY anywhere in the filename
    const middleMatch = filename.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (middleMatch) {
        const day = parseInt(middleMatch[1]);
        const month = parseInt(middleMatch[2]) - 1;
        let year = parseInt(middleMatch[3]);
        if (year < 100) {
            year = year < 50 ? 2000 + year : 1900 + year;
        }
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }

    return null;
}

function normalizeStatus(hebrewStatus: string, notes: string | null = null): string {
    const trimmed = hebrewStatus.trim().toLowerCase();
    const combinedText = [hebrewStatus, notes].filter(Boolean).join(' ').toLowerCase();

    for (const keyword of DEFECT_KEYWORDS) {
        if (combinedText.includes(keyword.toLowerCase())) {
            return 'DEFECT';
        }
    }

    for (const keyword of PARTIAL_KEYWORDS) {
        if (trimmed.includes(keyword.toLowerCase())) {
            return 'IN_PROGRESS';
        }
    }

    if (hebrewStatusMap[hebrewStatus.trim()]) {
        return hebrewStatusMap[hebrewStatus.trim()];
    }

    const sortedEntries = Object.entries(hebrewStatusMap).sort((a, b) => b[0].length - a[0].length);
    for (const [hebrew, status] of sortedEntries) {
        if (trimmed.includes(hebrew.toLowerCase())) {
            return status;
        }
    }

    return 'IN_PROGRESS';
}

export function normalizeCategory(hebrewCategory: string, description: string = ''): string {
    const trimmedCategory = hebrewCategory.trim();
    let normalizedCategory = 'OTHER';

    // 1. Try exact match from map
    if (hebrewCategoryMap[trimmedCategory]) {
        normalizedCategory = hebrewCategoryMap[trimmedCategory];
    } else {
        // 2. Try partial match from map
        for (const [hebrew, category] of Object.entries(hebrewCategoryMap)) {
            if (trimmedCategory.includes(hebrew)) {
                normalizedCategory = category;
                break;
            }
        }
    }

    // 3. If category is OTHER or unclear, check description for keywords
    if (normalizedCategory === 'OTHER' && description) {
        const descLower = description.toLowerCase();

        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            for (const keyword of keywords) {
                if (descLower.includes(keyword.toLowerCase())) {
                    return category;
                }
            }
        }
    }

    return normalizedCategory;
}

function parseDate(dateStr: string | null): Date | null {
    if (!dateStr || typeof dateStr !== 'string') return null;

    const trimmed = dateStr.trim();

    if (trimmed.includes('תקין') || trimmed.includes('לא תקין') || trimmed.includes('קיימים')) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) return date;
    }

    const ddmmyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (ddmmyy) {
        let year = parseInt(ddmmyy[3]);
        if (year < 100) year += 2000;
        const date = new Date(year, parseInt(ddmmyy[2]) - 1, parseInt(ddmmyy[1]));
        if (!isNaN(date.getTime())) return date;
    }

    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) return date;

    return null;
}

const EXTRACTION_PROMPT = `You are analyzing a Hebrew construction progress report PDF for a TAMA 38/2 urban renewal project at Mosinzon 5, Tel Aviv.

Extract the following information and return it as a valid JSON object:

1. **Report Metadata**:
   - reportDate: The date of the report in YYYY-MM-DD format
   - inspector: The name of the inspector if mentioned
   - projectName: The project name/address

2. **Apartments Data**: For each apartment mentioned (typically apartments 1, 3, 5, 6, 7, 10, 11, 14):
   - apartmentNumber: The apartment number as a string
   - workItems: Array of work items with:
     - category: Work category in Hebrew (חשמל, אינסטלציה, מיזוג, דלת כניסה, סניטריה, ריצוף, חיפוי, ספרינקלרים, איטום, etc.)
     - location: Specific location within the apartment if mentioned
     - description: Description of the work item
     - status: Status in Hebrew (בוצע, בוצע - תקין, לא תקין, ליקוי, בטיפול, טופל, etc.)
     - notes: Any additional notes
     - hasPhoto: true if there's a photo associated with this item
   - inspectionDates: Object mapping category to inspection date if available

3. **Development Items**: Site-level work not specific to an apartment:
   - Same structure as workItems but for general/building-level work

4. **Progress Tracking Table**: If there's a tracking table showing inspection dates by apartment and category:
   - apartmentNumber
   - category
   - inspectionDate
   - status

5. **Completeness Check**:
   - Verify checking against the document page count.
   - EXTRACT EVERY SINGLE WORK ITEM. Do not summarize or group items.
   - If there are lists of defects, include ALL of them.

Return ONLY valid JSON, no explanations.`;

const APARTMENT_LIST_PROMPT = `You are analyzing a Hebrew construction progress report PDF.
Return a valid JSON object containing a list of all apartment numbers mentioned in the report for which there is specific data or work items.
Format: { "apartments": ["1", "3", "7", ...] }
Return ONLY JSON.`;

const CHUNK_EXTRACTION_PROMPT = (apartments: string[]) => `You are analyzing a Hebrew construction progress report PDF.
EXTRACT DATA ONLY FOR THE FOLLOWING APARTMENTS: ${apartments.join(', ')}.
Do NOT extract data for other apartments.
Do NOT extract Report Metadata or Development Items (those are extracted separately).

Return a valid JSON object with the following structure:
{
  "apartmentsData": [
    {
      "apartmentNumber": "X",
      "workItems": [...],
      "inspectionDates": {...}
    }
  ]
}
Follow the same detailed extraction rules as before (extract ALL items, statuses, notes, photos).
Return ONLY valid JSON.`;

const METADATA_DEV_PROMPT = `You are analyzing a Hebrew construction progress report PDF.
Extract ONLY:
1. Report Metadata (date, inspector, project name)
2. Development Items (site-level work)
3. Progress Tracking Table

Do NOT extract per-apartment data matching specific apartment numbers.
Return a valid JSON object with keys: "reportMetadata", "developmentItems", "progressTracking".
Return ONLY valid JSON.`;

interface ExtractedWorkItem {
    category: string;
    location?: string;
    description: string;
    status: string;
    notes?: string;
    hasPhoto?: boolean;
}

interface ExtractedApartmentData {
    apartmentNumber: string;
    workItems: ExtractedWorkItem[];
    inspectionDates?: Record<string, string>;
}

interface ExtractedReportData {
    reportDate: string;
    inspector?: string;
    projectName?: string;
    apartments: ExtractedApartmentData[];
    developmentItems?: ExtractedWorkItem[];
    progressTracking?: {
        apartmentNumber: string;
        category: string;
        inspectionDate?: string;
        status?: string;
    }[];
}

// Custom error for blocking issues (API limits, Auth)
class BlockingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BlockingError';
    }
}

// --- AI Providers Setup ---

interface AIProvider {
    name: string;
    extract(prompt: string, buffer: Buffer, mimeType: string): Promise<string>;
}

class AnthropicAdapter implements AIProvider {
    name = 'Anthropic (Claude)';

    async extract(prompt: string, buffer: Buffer, mimeType: string): Promise<string> {
        if (mimeType !== 'application/pdf') {
            throw new Error('Anthropic adapter currently supports only PDF');
        }
        const base64Data = buffer.toString('base64');
        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20240620', // Explicit version
            max_tokens: 8192,
            messages: [{
                role: 'user',
                content: [
                    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
                    { type: 'text', text: prompt }
                ]
            }]
        });
        return response.content.find(c => c.type === 'text')?.text || '';
    }
}

class OpenAIAdapter implements AIProvider {
    name = 'OpenAI (GPT-4o)';

    async extract(prompt: string, buffer: Buffer, mimeType: string): Promise<string> {
        // OpenAI GPT-4o doesn't support PDF base64 directly in messages yet (except via File Search/Assistants).
        // Best approach for immediate fallback: Extract text and send as text.
        let content = '';
        if (mimeType === 'application/pdf') {
            try {
                // Fix: Ensure we use the correct default export from pdf-parse
                const parsed = await pdf(buffer);
                content = `Document Content:\n${parsed.text}\n\n`;
            } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
                console.error("OpenAI Adapter PDF Parse Error:", e);
                // Fallback: Try to proceed with empty content? No, fail.
                throw new Error("Failed to parse PDF text for OpenAI fallback");
            }
        } else {
            // If we ever support images
            content = "Unsupported Mime Type for OpenAI Direct Raw";
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a helpful assistant that extracts data from construction reports. Output valid JSON only." },
                { role: "user", content: content + prompt }
            ],
            response_format: { type: "json_object" },
            max_tokens: 4096
        });

        return response.choices[0].message.content || '';
    }
}

class GeminiAdapter implements AIProvider {
    name = 'Gemini (Flash 1.5)';

    async extract(prompt: string, buffer: Buffer, mimeType: string): Promise<string> {
        // Updated to gemini-1.5-flash
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const base64Data = buffer.toString('base64');
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            }
        ]);

        return result.response.text();
    }
}

const providers: AIProvider[] = [
    new AnthropicAdapter(),      // Primary
    new OpenAIAdapter(),         // Secondary (Reliable Text Fallback)
    new GeminiAdapter()          // Tertiary (Cost effective, large context)
];

// --- Extraction Logic ---

async function tryExtractWithProviders(prompt: string, buffer: Buffer): Promise<string> {
    const errors: string[] = [];

    for (const provider of providers) {
        console.log(`Attempting extraction with ${provider.name}...`);
        try {
            const result = await provider.extract(prompt, buffer, 'application/pdf');
            if (result && result.length > 20) { // Basic sanity check
                console.log(`Success with ${provider.name}`);
                return result;
            }
            errors.push(`${provider.name}: Returned empty result`);
        } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            console.error(`Failed with ${provider.name}:`, error.message);
            // Detect specific blocking errors if strictly needed, but generally we just want to fall through
            // If manual "Block" is needed (e.g. Stop All), we might need logic.
            // For now, assume any error means "Try Next".
            errors.push(`${provider.name}: ${error.message}`);
        }
    }

    throw new BlockingError(`All providers failed: ${errors.join('; ')}`);
}

async function extractApartmentList(buffer: Buffer): Promise<string[]> {
    try {
        const text = await tryExtractWithProviders(APARTMENT_LIST_PROMPT, buffer);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return [];

        try {
            const data = JSON.parse(jsonMatch[0]);
            return data.apartments || [];
        } catch {
            return [];
        }
    } catch (error) {
        console.error('Error fetching apartment list:', error);
        return [];
    }
}

async function extractPdfDataChunked(buffer: Buffer): Promise<ExtractedReportData> {
    console.log('Falling back to chunked extraction...');

    // 1. Get List of Apartments
    const apartmentList = await extractApartmentList(buffer);
    console.log(`Found apartments: ${apartmentList.join(', ')}`);

    // 2. Extract Metadata & Development Items
    let fullData: ExtractedReportData = {
        reportDate: '',
        apartments: [],
        developmentItems: [],
        progressTracking: []
    };

    try {
        const metadataText = await tryExtractWithProviders(METADATA_DEV_PROMPT, buffer);
        const metadataJsonMatch = metadataText.match(/\{[\s\S]*\}/);

        if (metadataJsonMatch) {
            try {
                const meta = JSON.parse(repairJson(metadataJsonMatch[0]));
                fullData = { ...fullData, ...meta };
            } catch (e) {
                console.error('Failed to parse metadata chunk:', e);
            }
        }
    } catch (error) {
        console.error('Failed to extract metadata in chunked mode', error);
        // Don't throw, try to act best effort? Or throw blocking?
        // If metadata fails, the whole report might be toast.
        if (error instanceof BlockingError) throw error;
    }

    // 3. Extract Apartments in Chunks of 3
    const CHUNK_SIZE = 3;
    const allApartmentsData: ExtractedApartmentData[] = [];

    for (let i = 0; i < apartmentList.length; i += CHUNK_SIZE) {
        const chunk = apartmentList.slice(i, i + CHUNK_SIZE);
        console.log(`Extracting chunk: ${chunk.join(', ')}`);

        try {
            // We use the same generic 'tryExtractWithProviders' but we need to format the prompt freshly
            const prompt = CHUNK_EXTRACTION_PROMPT(chunk);
            const text = await tryExtractWithProviders(prompt, buffer);

            const jsonMatch = text.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const chunkData = JSON.parse(repairJson(jsonMatch[0]));
                if (chunkData.apartmentsData) {
                    allApartmentsData.push(...chunkData.apartmentsData);
                }
            }
        } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            console.error(`Failed to extract chunk ${chunk.join(', ')}:`, e);
            // If it's a BlockingError (all providers failed), we probably should stop?
            // Or just continue best effort? 
            // If all providers are down, we definitely stop.
            if (e instanceof BlockingError) throw e;
        }
    }

    fullData.apartments = allApartmentsData;
    return fullData;
}

export async function extractPdfData(pdfBuffer: Buffer): Promise<ExtractedReportData> {
    console.log('Starting standard extraction...');

    try {
        // Attempt standard extraction using the provider chain
        const textContent = await tryExtractWithProviders(EXTRACTION_PROMPT, pdfBuffer);

        let extractedData: ExtractedReportData;
        try {
            const codeBlockMatch = textContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (codeBlockMatch) {
                extractedData = JSON.parse(repairJson(codeBlockMatch[1]));
            } else {
                const jsonMatch = textContent.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error('No JSON found in response');
                extractedData = JSON.parse(repairJson(jsonMatch[0]));
            }

            // Check for potentially incomplete extractions (truncation or halluncination)
            const aptCount = extractedData.apartments?.length || 0;
            const totalItems = (extractedData.apartments || []).reduce((sum, a) => sum + (a.workItems?.length || 0), 0) + (extractedData.developmentItems?.length || 0);

            console.log(`Standard extraction result: ${aptCount} apartments, ${totalItems} items.`);

            if (aptCount === 0 || totalItems < 5) {
                console.log('Result looks incomplete. Triggering chunked extraction...');
                throw new Error('Incomplete extraction result');
            }

        } catch (parseError) {
            console.log('JSON parse failed or result incomplete, attempting chunked extraction fallback...');
            // LOG THE ERROR for visibility but don't fail yet
            try {
                // @ts-expect-error - just logging for debug
                const debugPath = path.join(process.cwd(), 'upload_json_error_pre_chunk.log');
                await writeFile(debugPath, `TIMESTAMP: ${new Date().toISOString()}\nERROR: ${parseError}\n\nRAW RESPONSE:\n${textContent}\n\n`);
            } catch { }

            // Fallback to chunked extraction
            return await extractPdfDataChunked(pdfBuffer);
        }

        return extractedData;
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (error instanceof BlockingError) throw error; // All providers failed

        console.error('Extraction fatal error:', error);
        throw error;
    }
}

function repairJson(jsonStr: string): string {
    let repaired = jsonStr.trim();
    // Remove potential leading/trailing non-json chars if match didn't catch them
    // (Result of match is usually clean, but just in case)

    // Fix common trailing comma issues
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

    return repaired;
}

export interface ProcessingResult {
    success: boolean;
    messages: string[];
    reportId?: string;
    hasErrors?: boolean;
    errorDetails?: string;
    validationWarnings?: string[];
    requiresConfirmation?: boolean;
    workItemsCreated?: number;
}


/**
 * Heuristic check to see if the PDF likely contains apartment data
 * Returns true if it finds apartment headers (e.g. "דירה 1", "דירה 7")
 */
async function checkForApartmentData(buffer: Buffer): Promise<boolean> {
    try {
        const parsed = await pdf(buffer);
        const text = parsed.text || '';

        // Check for "Apartment X" pattern in Hebrew
        // דירה \d+
        const apartmentMatch = text.match(/דירה\s+\d+/);

        // Also check for "Defects" keyword which usually implies a table exists
        const defectsMatch = text.includes('ליקויים') || text.includes('ביצוע') || text.includes('סטטוס');

        return !!(apartmentMatch || defectsMatch);
    } catch (e) {
        console.error("Heuristic check failed:", e);
        return true; // Safety: If check fails, assume data exists to trigger error if 0 items extracted
    }
}

export async function processReport(
    buffer: Buffer,
    fileName: string,
    projectId: string,
    filePath: string,
    forceUpload: boolean = false,
    existingReportId?: string
): Promise<ProcessingResult> {
    let reportId = existingReportId;
    let workItemsCreated = 0;

    // 1. Create Snapshot
    const snapshot = await createSnapshot(`pre-process: ${fileName}`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const snapshotId = snapshot.id;
    await cleanupOldSnapshots(20);

    // 2. Extract Data
    let extractedData: ExtractedReportData | null = null;
    let extractionError: string | null = null;
    let heuristicHasApartments = false;

    try {
        // Run heuristic check first
        heuristicHasApartments = await checkForApartmentData(buffer);
        console.log(`Heuristic Check for ${fileName}: Has Apartment Data? ${heuristicHasApartments}`);

        extractedData = await extractPdfData(buffer);
    } catch (error) {
        console.error('Extraction error:', error);
        if (error instanceof BlockingError) {
            // For blocking errors, we want to FAIL the process and NOT save ambiguous data.
            // We return a failure result immediately.
            return {
                success: false,
                messages: [error.message],
                reportId: existingReportId,
                hasErrors: true,
                errorDetails: error.message
            };
        }
        extractionError = error instanceof Error ? error.message : 'Unknown extraction error';
    }

    // 3. Determine Report Date
    let reportDate: Date;
    const filenameDate = extractDateFromFilename(fileName);

    if (extractedData?.reportDate) {
        reportDate = new Date(extractedData.reportDate);
        if (isNaN(reportDate.getTime())) {
            reportDate = filenameDate || new Date();
        }
    } else {
        reportDate = filenameDate || new Date();
    }

    // Fallback: Use filename date *before* validation if extracted date is missing
    if (extractedData && !extractedData.reportDate && filenameDate) {
        extractedData.reportDate = filenameDate.toISOString().split('T')[0];
    }

    // 4. Handle Extraction Failure
    if (!extractedData || extractionError) {
        const errorDetails = JSON.stringify({ error: extractionError || 'Extraction failed' });

        if (existingReportId) {
            await prisma.report.update({
                where: { id: existingReportId },
                data: {
                    reportDate,
                    processed: false,
                    hasErrors: true,
                    errorDetails,
                    rawExtraction: null,
                }
            });
        } else {
            const report = await prisma.report.create({
                data: {
                    projectId,
                    fileName,
                    filePath,
                    reportDate,
                    processed: false,
                    hasErrors: true,
                    errorDetails,
                    rawExtraction: null,
                },
            });
            reportId = report.id;
        }

        return {
            success: false,
            messages: [extractionError || 'הקובץ הועלה אך לא ניתן היה לחלץ ממנו נתונים.'],
            reportId,
            hasErrors: true,
            errorDetails: extractionError || 'Extraction failed',
        };
    }

    // 5. Validation
    // Pass heuristic result to validation or check locally
    const dataValidation = validateExtractedData(extractedData as ValidationExtractedData);
    let fullValidation = createFullValidationResult({ valid: true }, dataValidation);

    // SPECIAL CHECK: Zero Items Heuristic
    // Calculate total items
    let totalItems = (extractedData.apartments || []).reduce((sum, a) => sum + (a.workItems?.length || 0), 0) + (extractedData.developmentItems?.length || 0);

    if (totalItems === 0) {
        if (heuristicHasApartments) {
            // ERROR: We found apartment data in text, but extracted 0 items. This is a failure.
            console.log("CRITICAL: Heuristic found apartments, but extraction yielded 0 items. Marking as ERROR.");
            fullValidation = {
                ...fullValidation,
                canProceed: false, // Do not auto-proceed
                dataValid: false,
                confidence: 'invalid', // Force invalid
                dataErrors: [...fullValidation.dataErrors, 'נמצאו נתוני דירות בקובץ אך לא חולצו פריטי עבודה (Extraction Mismatch)'],
            };
        } else {
            // VALID EMPTY: We didn't find apartment data, and extracted 0 items. PROBABLY OK.
            console.log("INFO: No apartment data found in heuristic, and 0 items extracted. Likely empty report.");
            // We treat this as valid, but maybe add a warning to be safe
            fullValidation = {
                ...fullValidation,
                canProceed: true,
                confidence: 'high', // It's likely correct
                dataWarnings: [...fullValidation.dataWarnings, 'הדוח ריק מפריטי עבודה (אומת מול תוכן הקובץ)'],
                requiresConfirmation: true, // Still ask user to confirm just in case
            };
        }
    }

    // 6. Handle Critical Validation Failure
    if (!fullValidation.canProceed) {
        const errorDetails = JSON.stringify({
            errors: fullValidation.dataErrors,
            warnings: fullValidation.dataWarnings
        });

        if (existingReportId) {
            await prisma.report.update({
                where: { id: existingReportId },
                data: {
                    reportDate,
                    inspector: extractedData.inspector || null,
                    rawExtraction: JSON.stringify(extractedData),
                    processed: false,
                    hasErrors: true,
                    errorDetails,
                }
            });
        } else {
            const report = await prisma.report.create({
                data: {
                    projectId,
                    fileName,
                    filePath,
                    reportDate,
                    inspector: extractedData.inspector || null,
                    rawExtraction: JSON.stringify(extractedData),
                    processed: false,
                    hasErrors: true,
                    errorDetails,
                },
            });
            reportId = report.id;
        }

        return {
            success: true, // It "succeeds" in processing (saving), but has errors
            messages: [`Report processed with errors (0 items mismatch)`],
            reportId,
            hasErrors: true,
            errorDetails: fullValidation.dataErrors.join('\n'),
        };
    }

    // 7. Handle Warnings (Confirmation Required)
    if (fullValidation.requiresConfirmation && !forceUpload) {
        return {
            success: false,
            messages: ['נדרש אישור המשתמש'],
            requiresConfirmation: true,
            validationWarnings: fullValidation.dataWarnings,
        };
    }

    // 8. Save Valid Data
    // Transaction to clean old data if retrying (though prisma create is simpler for upsert logic if we delete first)
    // For simplicity, if existingReportId is present, we delete its items first to avoid duplication/orphans
    if (existingReportId) {
        await prisma.workItem.deleteMany({ where: { reportId: existingReportId } });
        await prisma.inspection.deleteMany({ where: { reportId: existingReportId } });

        await prisma.report.update({
            where: { id: existingReportId },
            data: {
                reportDate,
                inspector: extractedData.inspector || null,
                rawExtraction: JSON.stringify(extractedData),
                processed: true, // Now processed!
                hasErrors: false,
                errorDetails: null,
                hasWarnings: fullValidation.dataWarnings.length > 0,
                warningDetails: fullValidation.dataWarnings.length > 0 ? JSON.stringify(fullValidation.dataWarnings) : null,
            }
        });
        reportId = existingReportId;
    } else {
        const report = await prisma.report.create({
            data: {
                projectId,
                fileName,
                filePath,
                reportDate,
                inspector: extractedData.inspector || null,
                rawExtraction: JSON.stringify(extractedData),
                processed: true,
                hasErrors: false,
                hasWarnings: fullValidation.dataWarnings.length > 0,
                warningDetails: fullValidation.dataWarnings.length > 0 ? JSON.stringify(fullValidation.dataWarnings) : null,
            }
        });
        reportId = report.id;
    }

    if (!reportId) throw new Error("Report ID missing after save");

    // Save Items
    const apartments = await prisma.apartment.findMany({ where: { projectId } });
    const apartmentMap = new Map(apartments.map((a) => [a.number, a.id]));

    // Process apartments
    for (const aptData of extractedData.apartments || []) {
        const apartmentId = apartmentMap.get(aptData.apartmentNumber);
        if (!apartmentId) continue;

        for (const item of aptData.workItems || []) {
            const category = normalizeCategory(item.category || '', item.description || '');
            const status = normalizeStatus(item.status || '', item.notes || null);

            await prisma.workItem.create({
                data: {
                    reportId: reportId!,
                    apartmentId,
                    category,
                    location: item.location || null,
                    description: item.description || '',
                    status,
                    notes: item.notes || null,
                    hasPhoto: item.hasPhoto || false,
                },
            });
            workItemsCreated++;
        }

        if (aptData.inspectionDates) {
            for (const [category, dateStr] of Object.entries(aptData.inspectionDates)) {
                const inspectionDate = parseDate(dateStr);
                if (!inspectionDate) continue;

                await prisma.inspection.upsert({
                    where: {
                        reportId_apartmentId_category: {
                            reportId: reportId!,
                            apartmentId,
                            category: normalizeCategory(category),
                        },
                    },
                    create: {
                        reportId: reportId!,
                        apartmentId,
                        category: normalizeCategory(category),
                        inspectionDate,
                    },
                    update: { inspectionDate },
                });
            }
        }
    }

    // Process development items
    const devItems = Array.isArray(extractedData.developmentItems) ? extractedData.developmentItems : [];
    for (const item of devItems) {
        const category = normalizeCategory(item.category || '', item.description || '');
        const status = normalizeStatus(item.status || '', item.notes || null);

        await prisma.workItem.create({
            data: {
                reportId: reportId!,
                apartmentId: null,
                category,
                location: item.location || null,
                description: item.description || '',
                status,
                notes: item.notes || null,
                hasPhoto: item.hasPhoto || false,
            },
        });
        workItemsCreated++;
    }

    // Process tracking
    const trackingItems = Array.isArray(extractedData.progressTracking) ? extractedData.progressTracking : [];
    for (const tracking of trackingItems) {
        const apartmentId = apartmentMap.get(tracking.apartmentNumber);
        if (!apartmentId) continue;

        const inspectionDate = parseDate(tracking.inspectionDate || null);
        if (!inspectionDate) continue;

        await prisma.inspection.upsert({
            where: {
                reportId_apartmentId_category: {
                    reportId: reportId!,
                    apartmentId,
                    category: normalizeCategory(tracking.category),
                },
            },
            create: {
                reportId: reportId!,
                apartmentId,
                category: normalizeCategory(tracking.category),
                inspectionDate,
                status: tracking.status ? normalizeStatus(tracking.status) : undefined,
            },
            update: {
                inspectionDate,
                status: tracking.status ? normalizeStatus(tracking.status) : undefined,
            },
        });
    }

    return {
        success: true,
        messages: [`Report processed with ${workItemsCreated} items`],
        reportId,
        hasErrors: false,
        validationWarnings: fullValidation.dataWarnings,
        workItemsCreated,
    };
}
