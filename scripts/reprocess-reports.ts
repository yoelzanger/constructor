
import { prisma } from '../src/lib/db';
import { processReport } from '../src/lib/report-processing';
import { readFile } from 'fs/promises';
import { join } from 'path';

async function reprocessReports() {
    console.log('Fetching top 10 reports (newest first)...');

    // Get reports - assuming user sees newest first, so desc by date
    // Also filter only those that have a filePath
    const reports = await prisma.report.findMany({
        orderBy: { reportDate: 'desc' },
        take: 10,
    });

    console.log(`Found ${reports.length} reports to reprocess.`);

    for (const report of reports) {
        console.log(`Processing report: ${report.fileName} (${report.reportDate.toISOString().split('T')[0]})`);

        try {
            // Read file buffer
            // Ensure path is correct. Report stores absolute path or relative?
            // Usually full path if uploaded locally.
            // Let's assume it's accessible.
            const buffer = await readFile(report.filePath);

            // Reprocess
            // We pass existingReportId to update the existing record instead of creating new
            const result = await processReport(
                buffer,
                report.fileName,
                report.projectId,
                report.filePath,
                true, // forceUpload - maybe not needed if we pass ID, but harmless
                report.id
            );

            if (result.success) {
                console.log(`✅ Successfully reprocessed report ${report.id}. Items created: ${result.workItemsCreated}`);
            } else {
                console.error(`❌ Failed to reprocess report ${report.id}:`, result.messages);
            }

        } catch (error) {
            console.error(`❌ Error processing report ${report.id}:`, error);
        }
    }

    console.log('Reprocessing complete.');
}

reprocessReports()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
