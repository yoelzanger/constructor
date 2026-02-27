import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processReport } from '@/lib/report-processing';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const reportId = params.id;
        const { force } = await request.json().catch(() => ({ force: false }));

        // 1. Fetch existing report
        const report = await prisma.report.findUnique({ where: { id: reportId } });

        if (!report) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        if (!report.filePath) {
            return NextResponse.json({ error: 'Report file path is missing' }, { status: 400 });
        }

        // 2. Fetch the PDF (from Blob URL or local disk)
        let fileBuffer: Buffer;
        try {
            if (report.filePath.startsWith('http')) {
                // Fetch from Vercel Blob
                const response = await fetch(report.filePath);
                if (!response.ok) throw new Error(`Blob fetch failed: ${response.statusText}`);
                fileBuffer = Buffer.from(await response.arrayBuffer());
            } else {
                // Read from local disk
                const { readFile } = await import('fs/promises');
                fileBuffer = await readFile(report.filePath);
            }
        } catch (error) {
            console.error('Error fetching file:', error);
            return NextResponse.json(
                { error: 'Failed to fetch report file from storage' },
                { status: 500 }
            );
        }

        // 3. Reprocess the report
        const result = await processReport(
            fileBuffer,
            report.fileName,
            report.projectId,
            report.filePath,
            force,
            report.id
        );

        return NextResponse.json({
            success: result.success,
            reportId: result.reportId,
            hasErrors: result.hasErrors,
            errorDetails: result.errorDetails,
            validationWarnings: result.validationWarnings,
            requiresConfirmation: result.requiresConfirmation,
            workItemsCreated: result.workItemsCreated,
            message: result.hasErrors
                ? 'עיבוד חוזר נכשל.'
                : result.requiresConfirmation
                    ? 'נדרש אישור לאזהרות חדשות.'
                    : 'עיבוד חוזר הושלם בהצלחה.'
        });

    } catch (error) {
        console.error('Error reprocessing report:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to reprocess report' },
            { status: 500 }
        );
    }
}

