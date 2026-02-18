
import { prisma } from '@/lib/db';

async function main() {
    const apt7 = await prisma.apartment.findFirst({
        where: { number: '7' }
    });

    if (!apt7) {
        console.log('Apartment 7 not found in DB');
        return;
    }

    const reportsWithItems = await prisma.report.findMany({
        where: {
            workItems: {
                some: {
                    apartmentId: apt7.id
                }
            }
        },
        select: {
            id: true,
            fileName: true,
            reportDate: true,
            _count: {
                select: { workItems: { where: { apartmentId: apt7.id } } }
            }
        },
        orderBy: { reportDate: 'asc' }
    });

    console.log(`Found ${reportsWithItems.length} reports with items for Apartment 7.`);

    reportsWithItems.forEach(r => {
        console.log(`${r.reportDate.toISOString().split('T')[0]} - ${r.fileName}: ${r._count.workItems} items`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
