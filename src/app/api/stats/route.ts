export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { WorkStatus, isNegativeStatus, isPositiveStatus, hasNegativeNotes } from '@/lib/status-mapper';
import {
  calculateItemProgressV2,
  calculateOverallProgressWithAllCategories,
  CATEGORY_HEBREW_NAMES,
  CATEGORY_WEIGHTS,
  PROGRESS_THRESHOLDS,
} from '@/lib/progress-calculator';

// Item tracking for "disappeared = fixed" logic
interface ItemHistory {
  category: string;
  status: string;
  notes: string | null;
  description: string;
  location: string | null;
  id: string;
  reportDate: Date;
  apartmentNumber: string;
  firstSeenReportIndex: number;
  lastSeenReportIndex: number;
  isInLatestReport: boolean;
  hadDefectEver: boolean;
  defectReportDate: Date | null;
}

// Helper: Check if item has a defect (status OR notes indicate issues)
function itemHasDefect(status: string, notes: string | null): boolean {
  return isNegativeStatus(status as WorkStatus) || hasNegativeNotes(notes);
}

// Helper: Check if item is completed (positive status AND no negative notes)
function itemIsCompleted(status: string, notes: string | null): boolean {
  return isPositiveStatus(status as WorkStatus) && !hasNegativeNotes(notes);
}

export async function GET() {
  try {
    const reports = await prisma.report.findMany({
      where: { processed: true },
      orderBy: { reportDate: 'asc' },
    });

    if (reports.length === 0) {
      return NextResponse.json({
        totalReports: 0,
        totalApartments: 0,
        overallProgress: 0,
        totalIssues: 0,
        categoryStats: [],
        apartmentStats: [],
        recentIssues: [],
        allCompletedItems: [],
        allDefectItems: [],
        allInProgressItems: [],
      });
    }

    const latestReport = reports[reports.length - 1];
    const latestReportIndex = reports.length - 1;
    const totalReports = reports.length;
    const totalApartments = await prisma.apartment.count();
    const apartments = await prisma.apartment.findMany();

    // Build item history tracking when each item was first/last seen
    const itemHistory = new Map<string, ItemHistory>();
    const categoriesEverSeen = new Set<string>();
    const apartmentCategoriesEverSeen = new Map<string, Set<string>>();
    
    for (const apt of apartments) {
      apartmentCategoriesEverSeen.set(apt.number, new Set());
    }
    apartmentCategoriesEverSeen.set('פיתוח', new Set());

    // Get items in the latest report for "disappeared" detection
    const latestReportItems = await prisma.workItem.findMany({
      where: { reportId: latestReport.id },
      include: { apartment: true },
    });
    const itemsInLatestReport = new Set<string>();
    for (const item of latestReportItems) {
      const aptNumber = item.apartment?.number || 'פיתוח';
      const key = `${aptNumber}|${item.category}|${item.description}`;
      itemsInLatestReport.add(key);
    }

    // Process all reports to build history
    for (let reportIndex = 0; reportIndex < reports.length; reportIndex++) {
      const report = reports[reportIndex];
      const items = await prisma.workItem.findMany({
        where: { reportId: report.id },
        include: { apartment: true },
      });

      for (const item of items) {
        const aptNumber = item.apartment?.number || 'פיתוח';
        const key = `${aptNumber}|${item.category}|${item.description}`;
        
        categoriesEverSeen.add(item.category);
        const aptCats = apartmentCategoriesEverSeen.get(aptNumber);
        if (aptCats) aptCats.add(item.category);
        
        const isDefectNow = itemHasDefect(item.status, item.notes);
        const existing = itemHistory.get(key);
        if (existing) {
          existing.status = item.status;
          existing.notes = item.notes;
          existing.reportDate = report.reportDate;
          existing.lastSeenReportIndex = reportIndex;
          existing.isInLatestReport = itemsInLatestReport.has(key);
          if (isDefectNow && !existing.hadDefectEver) {
            existing.hadDefectEver = true;
            existing.defectReportDate = report.reportDate;
          }
        } else {
          itemHistory.set(key, {
            category: item.category,
            status: item.status,
            notes: item.notes,
            description: item.description,
            location: item.location,
            id: item.id,
            reportDate: report.reportDate,
            apartmentNumber: aptNumber,
            firstSeenReportIndex: reportIndex,
            lastSeenReportIndex: reportIndex,
            isInLatestReport: itemsInLatestReport.has(key),
            hadDefectEver: isDefectNow,
            defectReportDate: isDefectNow ? report.reportDate : null,
          });
        }
      }
    }

    // Calculate progress with "disappeared = fixed" logic
    const allItems = Array.from(itemHistory.values());
    
    // Calculate item progress considering if item is in latest report
    const calculateEffectiveProgress = (item: ItemHistory): number => {
      if (item.isInLatestReport) {
        // Item is in latest report - use its actual status
        const isFirstTime = item.firstSeenReportIndex === latestReportIndex;
        return calculateItemProgressV2(item.status, item.notes, { isFirstTimeSeen: isFirstTime }).progress;
      } else {
        // Item was seen before but NOT in latest report = FIXED/GRADUATED
        return PROGRESS_THRESHOLDS.ITEM_FIXED;
      }
    };
    
    // Count issues
    const currentIssues = allItems.filter(i => 
      i.isInLatestReport && itemHasDefect(i.status, i.notes)
    ).length;
    
    const cumulativeIssues = allItems.filter(i => i.hadDefectEver).length;
    
    const completedItemsList = allItems.filter(i => 
      !i.isInLatestReport || itemIsCompleted(i.status, i.notes)
    );
    const defectItemsList = allItems.filter(i => i.hadDefectEver); // All items that ever had defects
    const currentDefectItemsList = allItems.filter(i => 
      i.isInLatestReport && itemHasDefect(i.status, i.notes)
    );
    const inProgressItemsList = allItems.filter(i => 
      i.isInLatestReport && !itemIsCompleted(i.status, i.notes) && !itemHasDefect(i.status, i.notes)
    );

    // Category stats
    const categoryProgress = new Map<string, number>();
    const categoryItems = new Map<string, ItemHistory[]>();
    
    for (const item of allItems) {
      const existing = categoryItems.get(item.category) || [];
      existing.push(item);
      categoryItems.set(item.category, existing);
    }
    
    for (const [cat, items] of Array.from(categoryItems.entries())) {
      const avgProgress = Math.round(
        items.reduce((sum, i) => sum + calculateEffectiveProgress(i), 0) / items.length
      );
      categoryProgress.set(cat, avgProgress);
    }
    
    const overallProgress = calculateOverallProgressWithAllCategories(categoryProgress, categoriesEverSeen);

    const categoryStats = Array.from(categoryProgress.entries()).map(([cat, progress]) => {
      const catItems = categoryItems.get(cat) || [];
      return {
        category: cat,
        categoryHebrew: CATEGORY_HEBREW_NAMES[cat] || cat,
        progress,
        itemCount: catItems.length,
        issues: catItems.filter(i => i.isInLatestReport && itemHasDefect(i.status, i.notes)).length,
        weight: CATEGORY_WEIGHTS[cat] || 10,
      };
    });
    categoryStats.sort((a, b) => a.progress - b.progress);

    // Apartment stats
    const apartmentStats: Array<{
      number: string;
      progress: number;
      issues: number;
      currentIssues: number;
      itemCount: number;
      categoryProgress: Record<string, number>;
    }> = [];

    for (const apt of apartments) {
      const aptItems = allItems.filter(i => i.apartmentNumber === apt.number);
      if (aptItems.length === 0) continue;
      
      const aptCatProgress = new Map<string, number>();
      const aptCatItems = new Map<string, ItemHistory[]>();
      
      for (const item of aptItems) {
        const existing = aptCatItems.get(item.category) || [];
        existing.push(item);
        aptCatItems.set(item.category, existing);
      }
      
      for (const [cat, items] of Array.from(aptCatItems.entries())) {
        const avgProgress = Math.round(
          items.reduce((sum, i) => sum + calculateEffectiveProgress(i), 0) / items.length
        );
        aptCatProgress.set(cat, avgProgress);
      }
      
      const aptCatsSeen = apartmentCategoriesEverSeen.get(apt.number) || new Set();
      const aptProgress = calculateOverallProgressWithAllCategories(aptCatProgress, aptCatsSeen);
      
      apartmentStats.push({
        number: apt.number,
        progress: aptProgress,
        issues: aptItems.filter(i => i.hadDefectEver).length, // Cumulative issues
        currentIssues: aptItems.filter(i => i.isInLatestReport && itemHasDefect(i.status, i.notes)).length,
        itemCount: aptItems.length,
        categoryProgress: Object.fromEntries(aptCatProgress),
      });
    }

    // Dev stats
    const devItems = allItems.filter(i => i.apartmentNumber === 'פיתוח');
    if (devItems.length > 0) {
      const devCatProgress = new Map<string, number>();
      const devCatItems = new Map<string, ItemHistory[]>();
      
      for (const item of devItems) {
        const existing = devCatItems.get(item.category) || [];
        existing.push(item);
        devCatItems.set(item.category, existing);
      }
      
      for (const [cat, items] of Array.from(devCatItems.entries())) {
        const avgProgress = Math.round(
          items.reduce((sum, i) => sum + calculateEffectiveProgress(i), 0) / items.length
        );
        devCatProgress.set(cat, avgProgress);
      }
      
      const devCatsSeen = apartmentCategoriesEverSeen.get('פיתוח') || new Set();
      const devProgress = calculateOverallProgressWithAllCategories(devCatProgress, devCatsSeen);
      
      apartmentStats.push({
        number: 'פיתוח',
        progress: devProgress,
        issues: devItems.filter(i => i.hadDefectEver).length, // Cumulative issues
        currentIssues: devItems.filter(i => i.isInLatestReport && itemHasDefect(i.status, i.notes)).length,
        itemCount: devItems.length,
        categoryProgress: Object.fromEntries(devCatProgress),
      });
    }

    apartmentStats.sort((a, b) => {
      if (a.number === 'פיתוח') return 1;
      if (b.number === 'פיתוח') return -1;
      return parseInt(a.number) - parseInt(b.number);
    });

    // Format item for response
    const formatItem = (i: ItemHistory) => ({
      id: i.id,
      apartment: i.apartmentNumber,
      category: i.category,
      categoryHebrew: CATEGORY_HEBREW_NAMES[i.category] || i.category,
      description: i.description,
      status: i.status,
      notes: i.notes,
      location: i.location,
      progress: calculateEffectiveProgress(i),
      reportDate: i.reportDate,
      hadDefectEver: i.hadDefectEver,
      defectReportDate: i.defectReportDate,
      isCurrentDefect: i.isInLatestReport && itemHasDefect(i.status, i.notes),
    });

    // Recent issues (only from latest report)
    const recentIssues = defectItemsList.slice(0, 10).map(formatItem);

    return NextResponse.json({
      totalReports,
      totalApartments,
      overallProgress,
      totalIssues: cumulativeIssues, // All items that ever had defects
      currentIssues, // Issues currently in latest report
      totalItems: allItems.length,
      totalCompleted: completedItemsList.length,
      totalInProgress: inProgressItemsList.length,
      categoryStats,
      apartmentStats,
      recentIssues,
      allCompletedItems: completedItemsList.map(formatItem),
      allDefectItems: defectItemsList.map(formatItem), // All historical defects
      allCurrentDefectItems: currentDefectItemsList.map(formatItem), // Current defects only
      allInProgressItems: inProgressItemsList.map(formatItem),
      latestReportDate: latestReport.reportDate,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
