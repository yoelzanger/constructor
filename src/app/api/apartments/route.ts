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

// Item history for "disappeared = fixed" tracking
interface ItemHistory {
  category: string;
  status: string;
  notes: string | null;
  lastSeenReportIndex: number;
  hadDefectEver: boolean;
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
      return NextResponse.json([]);
    }

    const apartments = await prisma.apartment.findMany({
      orderBy: { number: 'asc' },
    });

    const lastReportIndex = reports.length - 1;
    const lastReport = reports[lastReportIndex];

    // Get items in the latest report for "disappeared" detection
    const latestReportItems = await prisma.workItem.findMany({
      where: { reportId: lastReport.id },
    });
    
    const latestItemsByApartment = new Map<string | null, Set<string>>();
    for (const item of latestReportItems) {
      const aptId = item.apartmentId;
      if (!latestItemsByApartment.has(aptId)) {
        latestItemsByApartment.set(aptId, new Set());
      }
      latestItemsByApartment.get(aptId)!.add(`${item.category}|${item.description}`);
    }

    // Build item history for each apartment
    const apartmentHistory = new Map<string, Map<string, ItemHistory>>();
    const apartmentCategoriesSeen = new Map<string, Set<string>>();
    
    for (const apt of apartments) {
      apartmentHistory.set(apt.id, new Map());
      apartmentCategoriesSeen.set(apt.id, new Set());
    }

    // Process all reports to build history
    for (let reportIndex = 0; reportIndex < reports.length; reportIndex++) {
      const report = reports[reportIndex];
      const items = await prisma.workItem.findMany({
        where: { reportId: report.id },
      });

      for (const item of items) {
        if (!item.apartmentId) continue;
        
        const history = apartmentHistory.get(item.apartmentId);
        const catsSeen = apartmentCategoriesSeen.get(item.apartmentId);
        if (!history || !catsSeen) continue;
        
        const key = `${item.category}|${item.description}`;
        catsSeen.add(item.category);
        
        const isDefectNow = itemHasDefect(item.status, item.notes);
        const existing = history.get(key);
        if (existing) {
          existing.status = item.status;
          existing.notes = item.notes;
          existing.lastSeenReportIndex = reportIndex;
          if (isDefectNow) existing.hadDefectEver = true;
        } else {
          history.set(key, {
            category: item.category,
            status: item.status,
            notes: item.notes,
            lastSeenReportIndex: reportIndex,
            hadDefectEver: isDefectNow,
          });
        }
      }
    }

    // Calculate stats for each apartment with "disappeared = fixed" logic
    const apartmentData = apartments.map((apt) => {
      const history = apartmentHistory.get(apt.id);
      const catsSeen = apartmentCategoriesSeen.get(apt.id);
      const latestItems = latestItemsByApartment.get(apt.id) || new Set();
      
      if (!history || history.size === 0 || !catsSeen) {
        return {
          id: apt.id,
          number: apt.number,
          floor: apt.floor,
          progress: 0,
          issues: 0,
          completed: 0,
          inProgress: 0,
          itemCount: 0,
          categoryStats: [],
        };
      }

      // Calculate progress with "disappeared = fixed" logic
      const catProgress = new Map<string, number>();
      const catItems = new Map<string, Array<{ progress: number; isInLatest: boolean; status: string; notes: string | null }>>();
      
      for (const [key, item] of Array.from(history.entries())) {
        const isInLatestReport = latestItems.has(key);
        let itemProgress: number;
        
        if (isInLatestReport) {
          itemProgress = calculateItemProgressV2(item.status, item.notes, { isFirstTimeSeen: false }).progress;
        } else {
          // Item disappeared = FIXED
          itemProgress = PROGRESS_THRESHOLDS.ITEM_FIXED;
        }
        
        const existing = catItems.get(item.category) || [];
        existing.push({ progress: itemProgress, isInLatest: isInLatestReport, status: item.status, notes: item.notes });
        catItems.set(item.category, existing);
      }
      
      for (const [cat, items] of Array.from(catItems.entries())) {
        const avgProgress = Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length);
        catProgress.set(cat, avgProgress);
      }
      
      const progress = calculateOverallProgressWithAllCategories(catProgress, catsSeen);
      
      // Count issues/completed/inProgress
      let completed = 0;
      let currentIssues = 0; // Issues in latest report
      let cumulativeIssues = 0; // All items that ever had defects
      let inProgress = 0;
      
      for (const [key, item] of Array.from(history.entries())) {
        const isInLatestReport = latestItems.has(key);
        
        // Count cumulative issues (all items that ever had defects)
        if (item.hadDefectEver) {
          cumulativeIssues++;
        }
        
        // Count current status
        if (!isInLatestReport) {
          // Disappeared = completed/fixed
          completed++;
        } else if (itemHasDefect(item.status, item.notes)) {
          currentIssues++;
        } else if (itemIsCompleted(item.status, item.notes)) {
          completed++;
        } else {
          inProgress++;
        }
      }

      const categoryStats = Array.from(catProgress.entries()).map(([cat, prog]) => {
        const items = catItems.get(cat) || [];
        const activeIssues = items.filter(i => i.isInLatest && itemHasDefect(i.status, i.notes));
        return {
          category: cat,
          categoryHebrew: CATEGORY_HEBREW_NAMES[cat] || cat,
          progress: prog,
          itemCount: items.length,
          issues: activeIssues.length,
          weight: CATEGORY_WEIGHTS[cat] || 10,
        };
      });

      return {
        id: apt.id,
        number: apt.number,
        floor: apt.floor,
        progress,
        issues: cumulativeIssues, // All items that ever had defects
        currentIssues, // Issues currently in latest report
        completed,
        inProgress,
        itemCount: history.size,
        categoryStats,
      };
    });

    apartmentData.sort((a, b) => parseInt(a.number) - parseInt(b.number));

    // Add development (פיתוח) with same logic
    const devHistory = new Map<string, ItemHistory>();
    const devCatsSeen = new Set<string>();
    const latestDevItems = latestItemsByApartment.get(null) || new Set();
    
    for (let reportIndex = 0; reportIndex < reports.length; reportIndex++) {
      const report = reports[reportIndex];
      const devItems = await prisma.workItem.findMany({
        where: { reportId: report.id, apartmentId: null },
      });
      for (const item of devItems) {
        const key = `${item.category}|${item.description}`;
        devCatsSeen.add(item.category);
        const isDefectNow = itemHasDefect(item.status, item.notes);
        const existing = devHistory.get(key);
        if (existing) {
          existing.status = item.status;
          existing.notes = item.notes;
          existing.lastSeenReportIndex = reportIndex;
          if (isDefectNow) existing.hadDefectEver = true;
        } else {
          devHistory.set(key, {
            category: item.category,
            status: item.status,
            notes: item.notes,
            lastSeenReportIndex: reportIndex,
            hadDefectEver: isDefectNow,
          });
        }
      }
    }

    if (devHistory.size > 0) {
      const catProgress = new Map<string, number>();
      const catItems = new Map<string, Array<{ progress: number; isInLatest: boolean; status: string; notes: string | null }>>();
      
      for (const [key, item] of Array.from(devHistory.entries())) {
        const isInLatestReport = latestDevItems.has(key);
        let itemProgress: number;
        
        if (isInLatestReport) {
          itemProgress = calculateItemProgressV2(item.status, item.notes, { isFirstTimeSeen: false }).progress;
        } else {
          itemProgress = PROGRESS_THRESHOLDS.ITEM_FIXED;
        }
        
        const existing = catItems.get(item.category) || [];
        existing.push({ progress: itemProgress, isInLatest: isInLatestReport, status: item.status, notes: item.notes });
        catItems.set(item.category, existing);
      }
      
      for (const [cat, items] of Array.from(catItems.entries())) {
        const avgProgress = Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length);
        catProgress.set(cat, avgProgress);
      }
      
      const progress = calculateOverallProgressWithAllCategories(catProgress, devCatsSeen);
      
      let completed = 0;
      let currentIssues = 0;
      let cumulativeIssues = 0;
      let inProgress = 0;
      
      for (const [key, item] of Array.from(devHistory.entries())) {
        const isInLatestReport = latestDevItems.has(key);
        
        if (item.hadDefectEver) cumulativeIssues++;
        
        if (!isInLatestReport) {
          completed++;
        } else if (itemHasDefect(item.status, item.notes)) {
          currentIssues++;
        } else if (itemIsCompleted(item.status, item.notes)) {
          completed++;
        } else {
          inProgress++;
        }
      }
      
      apartmentData.push({
        id: 'development',
        number: 'פיתוח',
        floor: null,
        progress,
        issues: cumulativeIssues,
        currentIssues,
        completed,
        inProgress,
        itemCount: devHistory.size,
        categoryStats: [],
      });
    }

    return NextResponse.json(apartmentData);
  } catch (error) {
    console.error('Error fetching apartments:', error);
    return NextResponse.json({ error: 'Failed to fetch apartments' }, { status: 500 });
  }
}
