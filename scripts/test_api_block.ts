
import { processReport } from '@/lib/report-processing';
import { prisma } from '@/lib/db';
import path from 'path';
import { readFile } from 'fs/promises';

// Mock Anthropic SDK to force error... 
// Actually difficult to mock the internal import. 
// Instead, I will rely on the fact that I *am* blocked, so running `debug_single_file.ts` on the problematic file SHOULD significantly fail now with the specific message.

async function main() {
    const targetFile = '2025-09-04 - מוסינזון 5 תל אביב.pdf';
    const filePath = path.join(process.cwd(), 'data', 'pdfs', targetFile);
    const existing = await prisma.report.findUnique({ where: { fileName: targetFile } });
    const project = await prisma.project.findFirst();

    console.log(`Running test on ${targetFile} (expecting API Block error)...`);

    // We expect processReport to return success: false, hasErrors: true, messages: ['API Usage Limit...']
    const buffer = await readFile(filePath);

    try {
        const result = await processReport(
            buffer,
            targetFile,
            project!.id,
            filePath,
            true,
            existing?.id
        );

        console.log('Result:', JSON.stringify(result, null, 2));

        if (result.success === false && result.hasErrors === true && result.messages.some(m => m.includes('Limit'))) {
            console.log('PASS: Correctly handled API block!');
        } else {
            console.log('FAIL: Did not handle block correctly.');
        }

    } catch (e) {
        console.error('UNEXPECTED CRASH:', e);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
