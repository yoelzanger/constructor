
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

    // Find reports that have items for this apartment
    const reportsWithItems = await prisma.report.findMany({
        where: {
            workItems: {
                some: {
                    apartmentId: apt.id
                }
            }
        },
        select: {
            fileName: true,
            reportDate: true,
            _count: {
                select: { workItems: { where: { apartmentId: apt.id } } }
            }
        },
        orderBy: { reportDate: 'asc' }
    });

    console.log(`Found ${reportsWithItems.length} reports with items for Apartment 7:`);
    reportsWithItems.forEach(r => {
        console.log(`- ${r.reportDate.toISOString().split('T')[0]} (${r.fileName}): ${r._count.workItems} items`);
    });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
