import { readdir, readFile, mkdir } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db';
import { processReport } from '@/lib/report-processing';
import { existsSync } from 'fs';

const PDF_DIR = path.join(process.cwd(), 'data', 'pdfs');

async function main() {
    console.log('Starting batch reprocessing...');

    // Ensure PDF directory exists
    if (!existsSync(PDF_DIR)) {
        console.error('PDF directory not found:', PDF_DIR);
        return;
    }

    // Get or create project
    let project = await prisma.project.findFirst();
    if (!project) {
        console.log('Creating project...');
        project = await prisma.project.create({
            data: {
                name: 'מוסינזון 5 תל אביב',
                address: 'מוסינזון 5, תל אביב',
            },
        });
    }
    console.log('Using project:', project.id);

    // Ensure apartments exist
    const APARTMENTS = ['1', '3', '5', '6', '7', '10', '11', '14'];
    for (const aptNum of APARTMENTS) {
        await prisma.apartment.upsert({
            where: { projectId_number: { projectId: project.id, number: aptNum } },
            create: { projectId: project.id, number: aptNum },
            update: {},
        });
    }

    // Get all files
    const files = await readdir(PDF_DIR);
    const pdfFiles = files.filter(f => {
        if (!f.toLowerCase().endsWith('.pdf')) return false;

        // Filter by date: May 2025 onwards
        const match = f.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            const year = parseInt(match[1]);
            const month = parseInt(match[2]);
            // Target: May 2025 onwards
            if (year > 2025 || (year === 2025 && month >= 5)) {
                return true;
            }
        }
        // If date not in filename start, include it just in case? Or exclude?
        // Let's assume most have the date. If not, we skip them to save API.
        return false;
    });

    console.log(`Found ${pdfFiles.length} target PDF files (May 2025+).`);

    let successCount = 0;
    let failCount = 0;

    for (const fileName of pdfFiles) {
        console.log(`Processing: ${fileName}...`);
        try {
            const filePath = path.join(PDF_DIR, fileName);
            const buffer = await readFile(filePath);

            // check if report already exists to avoid duplication if running multiple times?
            // processReport handles updates if ID is passed, but here we are treating as new uploads mostly.
            // But if we just reset the DB, there are no reports.
            // However, we should check if a report with this filename already exists to be safe
            const existing = await prisma.report.findUnique({ where: { fileName } });

            let result;
            if (existing) {
                console.log(`  - Report exists, updating...`);
                result = await processReport(buffer, fileName, project.id, filePath, true, existing.id);
            } else {
                result = await processReport(buffer, fileName, project.id, filePath, true);
            }

            if (result.success || result.hasErrors) {
                console.log(`  - Done. ID: ${result.reportId} (Errors: ${result.hasErrors}, Warnings: ${result.validationWarnings?.length || 0})`);
                successCount++;
            } else {
                console.error(`  - Failed: ${result.messages.join(', ')}`);
                failCount++;
            }

        } catch (error) {
            console.error(`  - Error processing ${fileName}:`, error);
            failCount++;
        }
    }

    console.log('------------------------------------------------');
    console.log(`Finished. Success: ${successCount}, Failed: ${failCount}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
