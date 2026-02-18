
import { readFile } from 'fs/promises';
import path from 'path';
import { processReport } from '@/lib/report-processing';
import { prisma } from '@/lib/db';

async function main() {
    const targetFile = '2025-09-04 - מוסינזון 5 תל אביב.pdf';
    const filePath = path.join(process.cwd(), 'data', 'pdfs', targetFile);

    console.log(`Processing ${targetFile}...`);

    const buffer = await readFile(filePath);
    const project = await prisma.project.findFirst();

    if (!project) throw new Error("No project found");

    // Check for existing report
    const existing = await prisma.report.findUnique({ where: { fileName: targetFile } });
    if (existing) {
        console.log(`Existing report ID: ${existing.id}`);
    }

    try {
        const result = await processReport(
            buffer,
            targetFile,
            project!.id,
            filePath,
            true, // force
            existing?.id
        );

        console.log('Result:', JSON.stringify(result, null, 2));

        if (result.reportId) {
            const report = await prisma.report.findUnique({
                where: { id: result.reportId },
                include: { workItems: true }
            });
            console.log(`Report created/updated. Total Items: ${report?.workItems.length}`);

            // Fetch apartments to map IDs
            const apartments = await prisma.apartment.findMany();
            const aptMap = Object.fromEntries(apartments.map(a => [a.id, a.number]));

            const itemsByApt: Record<string, number> = {};
            report?.workItems.forEach(i => {
                const num = i.apartmentId ? aptMap[i.apartmentId] : 'Development';
                itemsByApt[num] = (itemsByApt[num] || 0) + 1;
            });

            console.log('Items by Apartment:', itemsByApt);
        }
    } catch (e) {
        console.error(e);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
