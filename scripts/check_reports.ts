
import { prisma } from '@/lib/db';

async function main() {
    const count = await prisma.report.count();
    console.log(`Report count: ${count}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
