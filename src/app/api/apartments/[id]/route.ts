export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { WorkStatus, isNegativeStatus, isPositiveStatus, hasNegativeNotes } from '@/lib/status-mapper';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {
  calculateItemProgressV3 as calculateItemProgressV2,
  calculateOverallProgressWithAllCategories,
  PROGRESS_THRESHOLDS,
  CATEGORY_HEBREW_NAMES,
  getCategoryWeights,
} from '@/lib/progress-calculator-v3';

// Item history tracking
interface ItemHistory {
  id: string;
  category: string;
  status: string;
  notes: string | null;
  description: string;
  location: string | null;
  hasPhoto: boolean;
  reportDate: Date;
  firstSeenReportIndex: number;
  lastSeenReportIndex: number;
  // Track if this item EVER had a defect
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Special case: "פיתוח" (development) - items with no apartment
    const isDevelopment = id === 'פיתוח' || id === 'development';

    let apartment: { id: string; number: string; floor: number | null } | null = null;

    if (isDevelopment) {
      apartment = { id: 'development', number: 'פיתוח', floor: null };
    } else {
      apartment = await prisma.apartment.findUnique({ where: { id } });
      if (!apartment) {
        apartment = await prisma.apartment.findFirst({ where: { number: id } });
      }
    }

    if (!apartment) {
      return NextResponse.json({ error: 'Apartment not found' }, { status: 404 });
    }

    const apartmentIdFilter = isDevelopment ? null : apartment.id;

    // Get all reports ordered by date
    const reports = await prisma.report.findMany({
      where: { processed: true },
      orderBy: { reportDate: 'asc' },
    });

    // Track item history with first/last seen
    const itemHistory = new Map<string, ItemHistory>();
    const categoriesEverSeen = new Set<string>();

    const progressHistory: Array<{
      date: Date;
      progress: number;
      categoryProgress: Record<string, number>;
      issues: number;
      itemCount: number;
    }> = [];

    const defectHistoryByCategory: Array<{
      date: Date;
      categoryDefects: Record<string, number>;
    }> = [];

    for (let reportIndex = 0; reportIndex < reports.length; reportIndex++) {
      const report = reports[reportIndex];
      const items = await prisma.workItem.findMany({
        where: { reportId: report.id, apartmentId: apartmentIdFilter },
      });

      // Track which items are in THIS report
      const itemsInThisReport = new Set<string>();

      // Update item history
      for (const item of items) {
        const key = `${item.category}| ${item.description} `;
        itemsInThisReport.add(key);
        categoriesEverSeen.add(item.category);

        const isDefectNow = itemHasDefect(item.status, item.notes);
        const existing = itemHistory.get(key);
        if (existing) {
          existing.status = item.status;
          existing.notes = item.notes;
          existing.reportDate = report.reportDate;
          existing.lastSeenReportIndex = reportIndex;
          existing.id = item.id;
          existing.location = item.location;
          existing.hasPhoto = item.hasPhoto;
          // Track if this item ever had a defect
          if (isDefectNow && !existing.hadDefectEver) {
            existing.hadDefectEver = true;
            existing.defectReportDate = report.reportDate;
          }
        } else {
          itemHistory.set(key, {
            id: item.id,
            category: item.category,
            status: item.status,
            notes: item.notes,
            description: item.description,
            location: item.location,
            hasPhoto: item.hasPhoto,
            reportDate: report.reportDate,
            firstSeenReportIndex: reportIndex,
            lastSeenReportIndex: reportIndex,
            hadDefectEver: isDefectNow,
            defectReportDate: isDefectNow ? report.reportDate : null,
          });
        }
      }

      // Calculate defect counts by category for this report
      const categoryDefectCounts: Record<string, number> = {};
      for (const item of items) {
        if (itemHasDefect(item.status, item.notes)) {
          categoryDefectCounts[item.category] = (categoryDefectCounts[item.category] || 0) + 1;
        }
      }

      defectHistoryByCategory.push({
        date: report.reportDate,
        categoryDefects: categoryDefectCounts,
      });

      // Calculate progress at this point using "disappeared = fixed" logic
      if (itemHistory.size > 0) {
        const catProgress = new Map<string, number>();
        const catItems = new Map<string, Array<{ progress: number; isIssue: boolean }>>();
        let totalIssues = 0;

        for (const [itemKey, history] of Array.from(itemHistory.entries())) {
          const isInCurrentReport = itemsInThisReport.has(itemKey);
          const isFirstTime = history.firstSeenReportIndex === reportIndex;

          let itemProgress: number;
          let isIssue = false;

          if (isInCurrentReport) {
            // Item is in current report - calculate based on status
            const result = calculateItemProgressV2(history.status, history.notes, {
              isFirstTimeSeen: isFirstTime,
            });
            itemProgress = result.progress;
            isIssue = itemHasDefect(history.status, history.notes);
          } else {
            // Item was seen before but NOT in current report = FIXED
            itemProgress = PROGRESS_THRESHOLDS.ITEM_FIXED;
            isIssue = false;
          }

          if (isIssue) totalIssues++;

          const existing = catItems.get(history.category) || [];
          existing.push({ progress: itemProgress, isIssue });
          catItems.set(history.category, existing);
        }

        // Calculate average progress per category
        for (const [cat, catItemsList] of Array.from(catItems.entries())) {
          const avgProgress = Math.round(catItemsList.reduce((sum, i) => sum + i.progress, 0) / catItemsList.length);
          catProgress.set(cat, avgProgress);
        }

        const progress = calculateOverallProgressWithAllCategories(catProgress, categoriesEverSeen);

        progressHistory.push({
          date: report.reportDate,
          progress,
          categoryProgress: Object.fromEntries(catProgress),
          issues: totalIssues,
          itemCount: itemHistory.size,
        });
      }
    }

    // Get items in the latest report for "current issues" detection
    const lastReportIndex = reports.length - 1;
    const latestReportItemKeys = new Set<string>();
    if (reports.length > 0) {
      const latestItems = await prisma.workItem.findMany({
        where: { reportId: reports[lastReportIndex].id, apartmentId: apartmentIdFilter },
      });
      for (const item of latestItems) {
        latestReportItemKeys.add(`${item.category}| ${item.description} `);
      }
    }

    // Calculate final stats with "disappeared = fixed" logic
    const allItems = Array.from(itemHistory.values());

    // Calculate effective progress for each item
    const calculateEffectiveProgress = (item: ItemHistory): number => {
      const isInLatestReport = latestReportItemKeys.has(`${item.category}| ${item.description} `);
      if (isInLatestReport) {
        const isFirstTime = item.firstSeenReportIndex === lastReportIndex;
        return calculateItemProgressV2(item.status, item.notes, { isFirstTimeSeen: isFirstTime }).progress;
      } else {
        return PROGRESS_THRESHOLDS.ITEM_FIXED; // Disappeared = fixed
      }
    };

    const catProgress = new Map<string, number>();
    const catItemsList = new Map<string, ItemHistory[]>();

    for (const item of allItems) {
      const existing = catItemsList.get(item.category) || [];
      existing.push(item);
      catItemsList.set(item.category, existing);
    }

    for (const [cat, items] of Array.from(catItemsList.entries())) {
      const avgProgress = Math.round(
        items.reduce((sum, i) => sum + calculateEffectiveProgress(i), 0) / items.length
      );
      catProgress.set(cat, avgProgress);
    }

    const currentProgress = calculateOverallProgressWithAllCategories(catProgress, categoriesEverSeen);

    // Filter items by EFFECTIVE status (considering disappeared = fixed)

    // CUMULATIVE DEFECTS: ALL items that EVER had a defect (historical view)
    const cumulativeDefectItems = allItems.filter(item => item.hadDefectEver);

    // CURRENT DEFECTS: Items in latest report with defect status (for progress calc)
    const currentDefectItems = allItems.filter(item => {
      const isInLatestReport = latestReportItemKeys.has(`${item.category}| ${item.description} `);
      if (!isInLatestReport) return false;
      return itemHasDefect(item.status, item.notes);
    });

    // COMPLETED: Items that disappeared (fixed) OR items in latest with positive status and no negative notes
    const cumulativeCompletedItems = allItems.filter(item => {
      const isInLatestReport = latestReportItemKeys.has(`${item.category}| ${item.description} `);
      if (!isInLatestReport) return true; // Disappeared = completed/fixed
      return itemIsCompleted(item.status, item.notes);
    });

    // IN PROGRESS: Items in latest that are neither completed nor defects
    const cumulativeInProgressItems = allItems.filter(item => {
      const isInLatestReport = latestReportItemKeys.has(`${item.category}| ${item.description} `);
      if (!isInLatestReport) return false; // Disappeared = not in progress
      return !itemIsCompleted(item.status, item.notes) && !itemHasDefect(item.status, item.notes);
    });

    // Format items
    const formatItem = (item: ItemHistory) => ({
      id: item.id,
      category: item.category,
      categoryHebrew: CATEGORY_HEBREW_NAMES[item.category] || item.category,
      description: item.description,
      status: item.status,
      notes: item.notes,
      location: item.location,
      hasPhoto: item.hasPhoto,
      reportDate: item.reportDate,
      // For cumulative defects, also show when the defect was first seen
      hadDefectEver: item.hadDefectEver,
      defectReportDate: item.defectReportDate,
      // Is this item currently a defect?
      isCurrentDefect: latestReportItemKeys.has(`${item.category}| ${item.description} `) && itemHasDefect(item.status, item.notes),
    });

    const completedItems = cumulativeCompletedItems.map(formatItem);
    const defectItems = cumulativeDefectItems.map(formatItem);
    const inProgressItems = cumulativeInProgressItems.map(formatItem);
    const currentDefectItemsFormatted = currentDefectItems.map(formatItem);

    // Category progress details
    const detailedProgress = Array.from(catProgress.entries()).map(([category, progress]) => {
      const catItems = catItemsList.get(category) || [];
      const activeIssues = catItems.filter(item => {
        const isInLatestReport = latestReportItemKeys.has(`${item.category}| ${item.description} `);
        return isInLatestReport && itemHasDefect(item.status, item.notes);
      });
      return {
        category,
        categoryHebrew: CATEGORY_HEBREW_NAMES[category] || category,
        progress,
        itemCount: catItems.length,
        completed: catItems.filter(i => {
          const isInLatestReport = latestReportItemKeys.has(`${i.category}| ${i.description} `);
          return !isInLatestReport || itemIsCompleted(i.status, i.notes);
        }).length,
        hasIssues: activeIssues.length > 0,
        issues: activeIssues.map(i => i.notes).filter(Boolean) as string[],
        weight: getCategoryWeights()[category] || 10,
      };
    });

    // Group items by category
    const categoryGroups: Record<string, Array<ReturnType<typeof formatItem>>> = {};
    for (const item of allItems) {
      if (!categoryGroups[item.category]) categoryGroups[item.category] = [];
      categoryGroups[item.category].push(formatItem(item));
    }

    // Latest report stats - based ONLY on items in the latest report
    const lastReport = reports[reports.length - 1];
    let latestReportStats = null;

    if (lastReport) {
      const latestItems = await prisma.workItem.findMany({
        where: { reportId: lastReport.id, apartmentId: apartmentIdFilter },
      });

      const latestCompleted = latestItems.filter(i => itemIsCompleted(i.status, i.notes));
      const latestDefects = latestItems.filter(i => itemHasDefect(i.status, i.notes));
      const latestInProgress = latestItems.filter(i =>
        !itemIsCompleted(i.status, i.notes) && !itemHasDefect(i.status, i.notes)
      );

      const formatLatestItem = (item: typeof latestItems[0]) => ({
        id: item.id,
        category: item.category,
        categoryHebrew: CATEGORY_HEBREW_NAMES[item.category] || item.category,
        description: item.description,
        status: item.status,
        notes: item.notes,
        location: item.location,
        hasPhoto: item.hasPhoto,
        reportDate: lastReport.reportDate,
      });

      latestReportStats = {
        date: lastReport.reportDate,
        itemCount: latestItems.length,
        completed: latestCompleted.length,
        defects: latestDefects.length,
        inProgress: latestInProgress.length,
        completedItems: latestCompleted.map(formatLatestItem),
        defectItems: latestDefects.map(formatLatestItem),
        inProgressItems: latestInProgress.map(formatLatestItem),
      };
    }

    return NextResponse.json({
      apartment: {
        id: apartment.id,
        number: apartment.number,
        floor: apartment.floor,
      },
      cumulative: {
        progress: currentProgress,
        itemCount: allItems.length,
        completed: cumulativeCompletedItems.length,
        defects: cumulativeDefectItems.length, // All items that EVER had defects
        currentDefects: currentDefectItems.length, // Items with defects in latest report
        inProgress: cumulativeInProgressItems.length,
        fullyComplete: cumulativeCompletedItems.length,
        completedItems,
        defectItems, // All historical defects
        currentDefectItems: currentDefectItemsFormatted, // Current defects only
        inProgressItems,
      },
      latestReport: latestReportStats,
      detailedProgress,
      categoryGroups,
      progressHistory,
      defectHistoryByCategory,
    });
  } catch (error) {
    console.error('Error fetching apartment:', error);
    return NextResponse.json({ error: 'Failed to fetch apartment' }, { status: 500 });
  }
}
