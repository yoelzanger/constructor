
import { prisma } from '../src/lib/db';
import { processReport } from '../src/lib/report-processing';
import { readFile } from 'fs/promises';

async function reprocessRemainingReports() {
    console.log('Fetching remaining reports (skipping top 10 newest)...');

    // Skip the 10 we already processed
    const reports = await prisma.report.findMany({
        orderBy: { reportDate: 'desc' },
        skip: 10,
    });

    console.log(`Found ${reports.length} reports to reprocess.`);

    for (const [index, report] of reports.entries()) {
        console.log(`[${index + 1}/${reports.length}] Processing report: ${report.fileName} (${report.reportDate.toISOString().split('T')[0]})`);

        try {
            const buffer = await readFile(report.filePath);

            const result = await processReport(
                buffer,
                report.fileName,
                report.projectId,
                report.filePath,
                true, // forceUpload to update existing data
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

    console.log('Reprocessing of remaining reports complete.');
}

reprocessRemainingReports()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
