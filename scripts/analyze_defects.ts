
import { prisma } from '@/lib/db';

async function main() {
    // Get reports since May 2025
    const reports = await prisma.report.findMany({
        where: {
            reportDate: {
                gte: new Date('2025-05-01')
            }
        },
        include: {
            workItems: true
        },
        orderBy: { reportDate: 'asc' }
    });

    console.log(`Found ${reports.length} reports since May 2025.`);

    for (const r of reports) {
        const total = r.workItems.length;
        const defects = r.workItems.filter(i => i.status === 'DEFECT').length;
        const completed = r.workItems.filter(i => i.status === 'COMPLETED' || i.status === 'COMPLETED_OK').length;
        const pending = r.workItems.filter(i => i.status === 'PENDING' || i.status === 'IN_PROGRESS' || i.status === 'NOT_STARTED').length;

        console.log(`Date: ${r.reportDate.toISOString().split('T')[0]}, File: ${r.fileName}`);
        console.log(`  Total: ${total}, Defects: ${defects}, Completed: ${completed}, Pending: ${pending}`);

        if (defects === 0 && total > 0) {
            // Print sample statuses to see what they are
            const sampleStatuses = r.workItems.slice(0, 5).map(i => `${i.category}: ${i.status} (Raw: ${i.description?.substring(0, 20)}...)`);
            console.log(`  Sample Items:`, sampleStatuses);
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
