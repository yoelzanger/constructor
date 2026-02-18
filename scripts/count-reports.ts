
import { prisma } from '../src/lib/db';

async function countReports() {
    const count = await prisma.report.count();
    console.log(`Total reports: ${count}`);
}

countReports()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
