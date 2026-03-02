export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { WorkStatus, isNegativeStatus, hasNegativeNotes } from '@/lib/status-mapper';
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
  firstSeenReportIndex: number;
  lastSeenReportIndex: number;
  hadDefect: boolean;
}

export async function GET() {
  try {
    const reports = await prisma.report.findMany({
      where: { processed: true },
      orderBy: { reportDate: 'asc' },
      include: { workItems: { include: { apartment: true } } },
    });

    if (reports.length === 0) {
      return NextResponse.json({
        timelineData: [],
        apartments: [],
        categories: [],
        dateRange: { start: null, end: null },
      });
    }

    const apartments = await prisma.apartment.findMany({ orderBy: { number: 'asc' } });

    // Track item history for each apartment
    // Key: apartmentId -> itemKey -> ItemHistory
    const apartmentItemHistory = new Map<string, Map<string, ItemHistory>>();
    const devItemHistory = new Map<string, ItemHistory>();
    const projectItemHistory = new Map<string, ItemHistory>();

    // Track categories ever seen for each apartment
    const apartmentCategoriesEverSeen = new Map<string, Set<string>>();
    const devCategoriesEverSeen = new Set<string>();
    const projectCategoriesEverSeen = new Set<string>();

    for (const apt of apartments) {
      apartmentItemHistory.set(apt.id, new Map());
      apartmentCategoriesEverSeen.set(apt.id, new Set());
    }

    const timelineData: Array<{
      date: Date;
      reportId: string;
      overallProgress: number;
      totalIssues: number;
      totalItems: number;
      apartmentProgress: Record<string, { progress: number; issues: number; categoryProgress: Record<string, number> }>;
    }> = [];

    const categoryProgress: Array<{
      date: Date;
      categories: Record<string, { progress: number; issues: number }>;
    }> = [];

    for (let reportIndex = 0; reportIndex < reports.length; reportIndex++) {
      const report = reports[reportIndex];

      // Track which items are in THIS report (for "disappeared" detection)
      const itemsInThisReport = new Set<string>();
      const aptItemsInThisReport = new Map<string, Set<string>>();
      const devItemsInThisReport = new Set<string>();

      for (const apt of apartments) {
        aptItemsInThisReport.set(apt.id, new Set());
      }

      // Process items in this report
      for (const item of report.workItems) {
        const key = `${item.category}|${item.description}`;
        itemsInThisReport.add(key);
        projectCategoriesEverSeen.add(item.category);

        const isDefect = isNegativeStatus(item.status as WorkStatus) || hasNegativeNotes(item.notes);

        // Update project-level history
        const existingProject = projectItemHistory.get(key);
        if (existingProject) {
          existingProject.status = item.status;
          existingProject.notes = item.notes;
          existingProject.lastSeenReportIndex = reportIndex;
          if (isDefect) existingProject.hadDefect = true;
        } else {
          projectItemHistory.set(key, {
            category: item.category,
            status: item.status,
            notes: item.notes,
            firstSeenReportIndex: reportIndex,
            lastSeenReportIndex: reportIndex,
            hadDefect: isDefect,
          });
        }

        if (item.apartmentId) {
          const aptHistory = apartmentItemHistory.get(item.apartmentId);
          const aptCatsSeen = apartmentCategoriesEverSeen.get(item.apartmentId);
          const aptItems = aptItemsInThisReport.get(item.apartmentId);

          if (aptHistory && aptCatsSeen && aptItems) {
            aptItems.add(key);
            aptCatsSeen.add(item.category);

            const existing = aptHistory.get(key);
            if (existing) {
              existing.status = item.status;
              existing.notes = item.notes;
              existing.lastSeenReportIndex = reportIndex;
              if (isDefect) existing.hadDefect = true;
            } else {
              aptHistory.set(key, {
                category: item.category,
                status: item.status,
                notes: item.notes,
                firstSeenReportIndex: reportIndex,
                lastSeenReportIndex: reportIndex,
                hadDefect: isDefect,
              });
            }
          }
        } else {
          devItemsInThisReport.add(key);
          devCategoriesEverSeen.add(item.category);

          const existing = devItemHistory.get(key);
          if (existing) {
            existing.status = item.status;
            existing.notes = item.notes;
            existing.lastSeenReportIndex = reportIndex;
            if (isDefect) existing.hadDefect = true;
          } else {
            devItemHistory.set(key, {
              category: item.category,
              status: item.status,
              notes: item.notes,
              firstSeenReportIndex: reportIndex,
              lastSeenReportIndex: reportIndex,
              hadDefect: isDefect,
            });
          }
        }
      }

      // Calculate apartment progress with new algorithm
      const apartmentProgressMap: Record<string, { progress: number; issues: number; categoryProgress: Record<string, number> }> = {};

      for (const apt of apartments) {
        const aptHistory = apartmentItemHistory.get(apt.id);
        const aptCatsSeen = apartmentCategoriesEverSeen.get(apt.id);
        const aptItemsNow = aptItemsInThisReport.get(apt.id);

        if (!aptHistory || !aptCatsSeen || !aptItemsNow) {
          apartmentProgressMap[apt.number] = { progress: 0, issues: 0, categoryProgress: {} };
          continue;
        }

        if (aptHistory.size === 0) {
          apartmentProgressMap[apt.number] = { progress: 0, issues: 0, categoryProgress: {} };
          continue;
        }

        // Calculate progress for each category
        const catProgress = new Map<string, number>();
        const catItems = new Map<string, Array<{ progress: number; isIssue: boolean }>>();
        let totalIssues = 0;

        // Group items by category
        for (const [itemKey, history] of Array.from(aptHistory.entries())) {
          const isInCurrentReport = aptItemsNow.has(itemKey);
          const isFirstTime = history.firstSeenReportIndex === reportIndex;

          let itemProgress: number;
          let isIssue = false;

          if (isInCurrentReport) {
            // Item is in current report - calculate based on status
            const result = calculateItemProgressV2(history.status, history.notes, {
              isFirstTimeSeen: isFirstTime,
            });
            itemProgress = result.progress;
            isIssue = isNegativeStatus(history.status as WorkStatus) || hasNegativeNotes(history.notes);
          } else {
            // Item was seen before but NOT in current report = FIXED/GRADUATED
            itemProgress = PROGRESS_THRESHOLDS.ITEM_FIXED;
            isIssue = false;
          }

          if (isIssue) totalIssues++;

          const existing = catItems.get(history.category) || [];
          existing.push({ progress: itemProgress, isIssue });
          catItems.set(history.category, existing);
        }

        // Calculate average progress per category
        for (const [cat, items] of Array.from(catItems.entries())) {
          const avgProgress = Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length);
          catProgress.set(cat, avgProgress);
        }

        // Calculate overall progress considering ALL categories
        const overallProgress = calculateOverallProgressWithAllCategories(catProgress, aptCatsSeen);

        apartmentProgressMap[apt.number] = {
          progress: overallProgress,
          issues: totalIssues,
          categoryProgress: Object.fromEntries(catProgress),
        };
      }

      // Development progress
      if (devItemHistory.size > 0) {
        const catProgress = new Map<string, number>();
        const catItems = new Map<string, Array<{ progress: number; isIssue: boolean }>>();
        let totalIssues = 0;

        for (const [itemKey, history] of Array.from(devItemHistory.entries())) {
          const isInCurrentReport = devItemsInThisReport.has(itemKey);
          const isFirstTime = history.firstSeenReportIndex === reportIndex;

          let itemProgress: number;
          let isIssue = false;

          if (isInCurrentReport) {
            const result = calculateItemProgressV2(history.status, history.notes, {
              isFirstTimeSeen: isFirstTime,
            });
            itemProgress = result.progress;
            isIssue = isNegativeStatus(history.status as WorkStatus) || hasNegativeNotes(history.notes);
          } else {
            itemProgress = PROGRESS_THRESHOLDS.ITEM_FIXED;
            isIssue = false;
          }

          if (isIssue) totalIssues++;

          const existing = catItems.get(history.category) || [];
          existing.push({ progress: itemProgress, isIssue });
          catItems.set(history.category, existing);
        }

        for (const [cat, items] of Array.from(catItems.entries())) {
          const avgProgress = Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length);
          catProgress.set(cat, avgProgress);
        }

        const overallProgress = calculateOverallProgressWithAllCategories(catProgress, devCategoriesEverSeen);
        apartmentProgressMap['פיתוח'] = {
          progress: overallProgress,
          issues: totalIssues,
          categoryProgress: Object.fromEntries(catProgress),
        };
      } else {
        apartmentProgressMap['פיתוח'] = { progress: 0, issues: 0, categoryProgress: {} };
      }

      // Overall project progress
      const projectCatProgress = new Map<string, number>();
      const projectCatItems = new Map<string, Array<{ progress: number; isIssue: boolean }>>();
      let projectTotalIssues = 0;

      for (const [itemKey, history] of Array.from(projectItemHistory.entries())) {
        const isInCurrentReport = itemsInThisReport.has(itemKey);
        const isFirstTime = history.firstSeenReportIndex === reportIndex;

        let itemProgress: number;
        let isIssue = false;

        if (isInCurrentReport) {
          const result = calculateItemProgressV2(history.status, history.notes, {
            isFirstTimeSeen: isFirstTime,
          });
          itemProgress = result.progress;
          isIssue = isNegativeStatus(history.status as WorkStatus) || hasNegativeNotes(history.notes);
        } else {
          itemProgress = PROGRESS_THRESHOLDS.ITEM_FIXED;
          isIssue = false;
        }

        if (isIssue) projectTotalIssues++;

        const existing = projectCatItems.get(history.category) || [];
        existing.push({ progress: itemProgress, isIssue });
        projectCatItems.set(history.category, existing);
      }

      for (const [cat, items] of Array.from(projectCatItems.entries())) {
        const avgProgress = Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length);
        projectCatProgress.set(cat, avgProgress);
      }

      const overallProgress = calculateOverallProgressWithAllCategories(projectCatProgress, projectCategoriesEverSeen);

      timelineData.push({
        date: report.reportDate,
        reportId: report.id,
        overallProgress,
        totalIssues: projectTotalIssues,
        totalItems: projectItemHistory.size,
        apartmentProgress: apartmentProgressMap,
      });

      // Category progress for the chart
      const categoryStats: Record<string, { progress: number; issues: number }> = {};
      for (const [cat, items] of Array.from(projectCatItems.entries())) {
        categoryStats[cat] = {
          progress: projectCatProgress.get(cat) || 0,
          issues: items.filter(i => i.isIssue).length,
        };
      }
      categoryProgress.push({ date: report.reportDate, categories: categoryStats });
    }

    return NextResponse.json({
      timelineData,
      categoryProgress,
      apartments: [...apartments.map(a => a.number), 'פיתוח'],
      categories: Array.from(projectCategoriesEverSeen).map(cat => ({
        id: cat,
        name: CATEGORY_HEBREW_NAMES[cat] || cat,
        weight: CATEGORY_WEIGHTS[cat] || 10,
      })),
      dateRange: {
        start: reports[0].reportDate,
        end: reports[reports.length - 1].reportDate,
      },
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 });
  }
}
