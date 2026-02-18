
import { prisma } from '@/lib/db';

async function main() {
    // Find apartment 7
    const apt = await prisma.apartment.findFirst({
        where: { number: '7' },
    });

    if (!apt) {
        console.error('Apartment 7 not found');
        return;
    }

    // Get first 5 reports
    const reports = await prisma.report.findMany({
        orderBy: { reportDate: 'asc' },
        take: 5,
    });

    console.log('--- Checking first 5 reports for Apartment 7 ---');
    for (const report of reports) {
        const items = await prisma.workItem.findMany({
            where: {
                reportId: report.id,
                apartmentId: apt.id,
            },
        });

        console.log(`Report: ${report.fileName} (${report.reportDate.toISOString()})`);
        console.log(`Total Items: ${items.length}`);

        // Group by status
        const statusCounts: Record<string, number> = {};
        for (const item of items) {
            statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
        }
        console.log('Statuses:', JSON.stringify(statusCounts, null, 2));

        // Sample a few items to see notes
        const potentialDefects = items.filter(i => i.status !== 'completed' && i.status !== 'tackled');
        if (potentialDefects.length > 0) {
            console.log('Sample non-completed items:');
            potentialDefects.slice(0, 3).forEach(i => {
                console.log(` - [${i.status}] ${i.description} (Notes: ${i.notes})`);
            });
        }
        console.log('-----------------------------------');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
