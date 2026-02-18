import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { WorkStatus, isNegativeStatus, hasNegativeNotes, isPositiveStatus } from '@/lib/status-mapper';
import {
  calculateItemProgressV2,
  calculateOverallProgressWithAllCategories,
  PROGRESS_THRESHOLDS,
} from '@/lib/progress-calculator';

// Item history for cumulative progress
interface ItemHistory {
  category: string;
  status: string;
  notes: string | null;
}

export async function GET() {
  try {
    // Get reports in chronological order for cumulative calculation
    const reports = await prisma.report.findMany({
      where: {
        OR: [
          { processed: true },
          { hasErrors: true }
        ]
      },
      orderBy: { reportDate: 'asc' },
      include: {
        workItems: true,
      },
    });

    // Build cumulative progress at each report date
    const itemHistory = new Map<string, ItemHistory>();
    const categoriesEverSeen = new Set<string>();

    // Store cumulative progress for each report
    const reportProgressMap = new Map<string, {
      progress: number;
      totalCumulative: number;
      completedCumulative: number;
      defectsCumulative: number;
      inProgressCumulative: number;
    }>();

    for (let reportIndex = 0; reportIndex < reports.length; reportIndex++) {
      const report = reports[reportIndex];
      const itemsInThisReport = new Set<string>();

      // Update item history with items from this report
      for (const item of report.workItems) {
        const key = `${item.category}|${item.description}`;
        itemsInThisReport.add(key);
        categoriesEverSeen.add(item.category);

        itemHistory.set(key, {
          category: item.category,
          status: item.status,
          notes: item.notes,
        });
      }

      // Calculate cumulative progress with "disappeared = fixed" logic
      const catProgress = new Map<string, number>();
      const catItems = new Map<string, number[]>();

      let completedCount = 0;
      let defectsCount = 0;
      let inProgressCount = 0;

      for (const [key, item] of Array.from(itemHistory.entries())) {
        const isInCurrentReport = itemsInThisReport.has(key);
        let itemProgress: number;

        if (isInCurrentReport) {
          // Item is in current report - use its status
          itemProgress = calculateItemProgressV2(item.status, item.notes, { isFirstTimeSeen: false }).progress;

          // Count by status
          if (isNegativeStatus(item.status as WorkStatus) || hasNegativeNotes(item.notes)) {
            defectsCount++;
          } else if (isPositiveStatus(item.status as WorkStatus) && !hasNegativeNotes(item.notes)) {
            completedCount++;
          } else {
            inProgressCount++;
          }
        } else {
          // Item was seen before but NOT in current report = FIXED
          itemProgress = PROGRESS_THRESHOLDS.ITEM_FIXED;
          completedCount++;
        }

        const existing = catItems.get(item.category) || [];
        existing.push(itemProgress);
        catItems.set(item.category, existing);
      }

      // Calculate category averages
      for (const [cat, items] of Array.from(catItems.entries())) {
        const avgProgress = Math.round(items.reduce((sum, p) => sum + p, 0) / items.length);
        catProgress.set(cat, avgProgress);
      }

      const overallProgress = calculateOverallProgressWithAllCategories(catProgress, categoriesEverSeen);

      reportProgressMap.set(report.id, {
        progress: overallProgress,
        totalCumulative: itemHistory.size,
        completedCumulative: completedCount,
        defectsCumulative: defectsCount,
        inProgressCumulative: inProgressCount,
      });
    }

    // Build response with progress delta
    // First, create array in chronological order to calculate deltas
    const reportsWithProgress = reports.map((report, index) => {
      const cumulative = reportProgressMap.get(report.id) || {
        progress: 0,
        totalCumulative: 0,
        completedCumulative: 0,
        defectsCumulative: 0,
        inProgressCumulative: 0,
      };

      // Get previous report's progress (if exists)
      let previousProgress = 0;
      if (index > 0) {
        const prevReport = reports[index - 1];
        const prevCumulative = reportProgressMap.get(prevReport.id);
        previousProgress = prevCumulative?.progress || 0;
      }

      const progressDelta = cumulative.progress - previousProgress;

      return {
        id: report.id,
        fileName: report.fileName,
        reportDate: report.reportDate,
        inspector: report.inspector,
        progress: cumulative.progress,
        progressDelta, // התקדמות לדוח - progress since last report
        total: report.workItems.length, // Items in this specific report
        completed: cumulative.completedCumulative,
        defects: cumulative.defectsCumulative,
        inProgress: cumulative.inProgressCumulative,
        hasErrors: report.hasErrors,
        errorDetails: report.errorDetails,
        hasWarnings: report.hasWarnings,
        warningDetails: report.warningDetails,
      };
    });

    // Return in descending order (newest first)
    return NextResponse.json(reportsWithProgress.reverse());
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}
