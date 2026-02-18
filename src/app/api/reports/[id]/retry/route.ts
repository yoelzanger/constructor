import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readFile } from 'fs/promises';
import { processReport } from '@/lib/report-processing';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const reportId = params.id;
        const { force } = await request.json().catch(() => ({ force: false })); // Optional force flag from body

        // 1. Fetch existing report
        const report = await prisma.report.findUnique({
            where: { id: reportId },
        });

        if (!report) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        if (!report.filePath) {
            return NextResponse.json({ error: 'Report file path is missing' }, { status: 400 });
        }

        // 2. Read file from disk
        let fileBuffer: Buffer;
        try {
            fileBuffer = await readFile(report.filePath);
        } catch (error) {
            console.error('Error reading file:', error);
            return NextResponse.json(
                { error: 'Failed to read report file from disk' },
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
            report.id // Pass existing ID to update it
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
