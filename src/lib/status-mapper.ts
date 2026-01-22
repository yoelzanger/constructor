// Status enums and Hebrew mapping for construction progress tracking

export enum WorkStatus {
  COMPLETED = 'COMPLETED',
  COMPLETED_OK = 'COMPLETED_OK',
  NOT_OK = 'NOT_OK',
  DEFECT = 'DEFECT',
  IN_PROGRESS = 'IN_PROGRESS',
  HANDLED = 'HANDLED',
  PENDING = 'PENDING',
  NOT_STARTED = 'NOT_STARTED',
}

// Hebrew to English status mapping
const hebrewStatusMap: Record<string, WorkStatus> = {
  'בוצע': WorkStatus.COMPLETED,
  'בוצע - תקין': WorkStatus.COMPLETED_OK,
  'תקין': WorkStatus.COMPLETED_OK,
  'לא תקין': WorkStatus.NOT_OK,
  'ליקוי': WorkStatus.DEFECT,
  'בטיפול': WorkStatus.IN_PROGRESS,
  'טופל': WorkStatus.HANDLED,
  'ממתין': WorkStatus.PENDING,
  'לא התחיל': WorkStatus.NOT_STARTED,
  'בביצוע': WorkStatus.IN_PROGRESS,
  'הושלם': WorkStatus.COMPLETED,
  'נמצא ליקוי': WorkStatus.DEFECT,
  'תוקן': WorkStatus.HANDLED,
  // Additional statuses found in PDFs
  'קיימים אי תאומים': WorkStatus.DEFECT,
  'קיימים אי תיאומים': WorkStatus.DEFECT,
  'אי תאומים': WorkStatus.DEFECT,
  'אי תיאומים': WorkStatus.DEFECT,
  'יש הערות': WorkStatus.DEFECT,
  'בוצע - יש הערות': WorkStatus.DEFECT,
  'בוצע - יש ליקויים': WorkStatus.DEFECT,
  'בוצע - נמצאו אי תאומים': WorkStatus.DEFECT,
  'בוצע - נמצאו אי תיאומים': WorkStatus.DEFECT,
  'נמצאו אי תאומים': WorkStatus.DEFECT,
  'נמצאו אי תיאומים': WorkStatus.DEFECT,
  'בוצע חלקי': WorkStatus.IN_PROGRESS,
  'לטיפול': WorkStatus.PENDING,
  'נדרש מעקב': WorkStatus.PENDING,
  'נדרש ביצוע': WorkStatus.PENDING,
  'בוצע עם הערות': WorkStatus.DEFECT,
};

export function normalizeStatus(hebrewStatus: string): WorkStatus {
  const trimmed = hebrewStatus.trim();

  // Direct match
  if (hebrewStatusMap[trimmed]) {
    return hebrewStatusMap[trimmed];
  }

  // Partial match - check if any key is contained in the status
  for (const [hebrew, status] of Object.entries(hebrewStatusMap)) {
    if (trimmed.includes(hebrew)) {
      return status;
    }
  }

  // Default to IN_PROGRESS if unknown
  console.warn(`Unknown status: "${hebrewStatus}", defaulting to IN_PROGRESS`);
  return WorkStatus.IN_PROGRESS;
}

// English display names for statuses
export const statusDisplayNames: Record<WorkStatus, string> = {
  [WorkStatus.COMPLETED]: 'Completed',
  [WorkStatus.COMPLETED_OK]: 'Completed OK',
  [WorkStatus.NOT_OK]: 'Not OK',
  [WorkStatus.DEFECT]: 'Defect',
  [WorkStatus.IN_PROGRESS]: 'In Progress',
  [WorkStatus.HANDLED]: 'Handled',
  [WorkStatus.PENDING]: 'Pending',
  [WorkStatus.NOT_STARTED]: 'Not Started',
};

// Hebrew display names for statuses
export const statusHebrewNames: Record<WorkStatus, string> = {
  [WorkStatus.COMPLETED]: 'בוצע',
  [WorkStatus.COMPLETED_OK]: 'בוצע - תקין',
  [WorkStatus.NOT_OK]: 'לא תקין',
  [WorkStatus.DEFECT]: 'ליקוי',
  [WorkStatus.IN_PROGRESS]: 'בטיפול',
  [WorkStatus.HANDLED]: 'טופל',
  [WorkStatus.PENDING]: 'ממתין',
  [WorkStatus.NOT_STARTED]: 'לא התחיל',
};

// Status colors for UI
export const statusColors: Record<WorkStatus, string> = {
  [WorkStatus.COMPLETED]: '#22c55e', // green-500
  [WorkStatus.COMPLETED_OK]: '#22c55e', // green-500
  [WorkStatus.NOT_OK]: '#ef4444', // red-500
  [WorkStatus.DEFECT]: '#f97316', // orange-500
  [WorkStatus.IN_PROGRESS]: '#3b82f6', // blue-500
  [WorkStatus.HANDLED]: '#a855f7', // purple-500
  [WorkStatus.PENDING]: '#6b7280', // gray-500
  [WorkStatus.NOT_STARTED]: '#9ca3af', // gray-400
};

// Check if status is considered "positive" (completed successfully)
export function isPositiveStatus(status: WorkStatus): boolean {
  return status === WorkStatus.COMPLETED ||
         status === WorkStatus.COMPLETED_OK ||
         status === WorkStatus.HANDLED;
}

// Check if status is considered "negative" (has issues)
export function isNegativeStatus(status: WorkStatus): boolean {
  return status === WorkStatus.NOT_OK || status === WorkStatus.DEFECT;
}

// Work categories
export enum WorkCategory {
  ELECTRICAL = 'ELECTRICAL',
  PLUMBING = 'PLUMBING',
  AC = 'AC',
  ENTRY_DOOR = 'ENTRY_DOOR',
  SANITARY = 'SANITARY',
  FLOORING = 'FLOORING',
  TILING = 'TILING',
  SPRINKLERS = 'SPRINKLERS',
  WATERPROOFING = 'WATERPROOFING',
  PAINTING = 'PAINTING',
  WINDOWS = 'WINDOWS',
  KITCHEN = 'KITCHEN',
  GENERAL = 'GENERAL',
  DEVELOPMENT = 'DEVELOPMENT',
}

// Hebrew to English category mapping
const hebrewCategoryMap: Record<string, WorkCategory> = {
  'חשמל': WorkCategory.ELECTRICAL,
  'אינסטלציה': WorkCategory.PLUMBING,
  'מיזוג': WorkCategory.AC,
  'מיזוג אויר': WorkCategory.AC,
  'דלת כניסה': WorkCategory.ENTRY_DOOR,
  'סניטריה': WorkCategory.SANITARY,
  'ריצוף': WorkCategory.FLOORING,
  'חיפוי': WorkCategory.TILING,
  'ספרינקלרים': WorkCategory.SPRINKLERS,
  'ספרינקלר': WorkCategory.SPRINKLERS,
  'איטום': WorkCategory.WATERPROOFING,
  'צביעה': WorkCategory.PAINTING,
  'חלונות': WorkCategory.WINDOWS,
  'מטבח': WorkCategory.KITCHEN,
  'כללי': WorkCategory.GENERAL,
  'פיתוח': WorkCategory.DEVELOPMENT,
  'עבודות פיתוח': WorkCategory.DEVELOPMENT,
};

export function normalizeCategory(hebrewCategory: string): WorkCategory {
  const trimmed = hebrewCategory.trim();

  // Direct match
  if (hebrewCategoryMap[trimmed]) {
    return hebrewCategoryMap[trimmed];
  }

  // Partial match
  for (const [hebrew, category] of Object.entries(hebrewCategoryMap)) {
    if (trimmed.includes(hebrew)) {
      return category;
    }
  }

  // Default to GENERAL if unknown
  console.warn(`Unknown category: "${hebrewCategory}", defaulting to GENERAL`);
  return WorkCategory.GENERAL;
}

// English display names for categories
export const categoryDisplayNames: Record<WorkCategory, string> = {
  [WorkCategory.ELECTRICAL]: 'Electrical',
  [WorkCategory.PLUMBING]: 'Plumbing',
  [WorkCategory.AC]: 'Air Conditioning',
  [WorkCategory.ENTRY_DOOR]: 'Entry Door',
  [WorkCategory.SANITARY]: 'Sanitary',
  [WorkCategory.FLOORING]: 'Flooring',
  [WorkCategory.TILING]: 'Tiling',
  [WorkCategory.SPRINKLERS]: 'Sprinklers',
  [WorkCategory.WATERPROOFING]: 'Waterproofing',
  [WorkCategory.PAINTING]: 'Painting',
  [WorkCategory.WINDOWS]: 'Windows',
  [WorkCategory.KITCHEN]: 'Kitchen',
  [WorkCategory.GENERAL]: 'General',
  [WorkCategory.DEVELOPMENT]: 'Development',
};

// Hebrew display names for categories
export const categoryHebrewNames: Record<WorkCategory, string> = {
  [WorkCategory.ELECTRICAL]: 'חשמל',
  [WorkCategory.PLUMBING]: 'אינסטלציה',
  [WorkCategory.AC]: 'מיזוג אויר',
  [WorkCategory.ENTRY_DOOR]: 'דלת כניסה',
  [WorkCategory.SANITARY]: 'סניטריה',
  [WorkCategory.FLOORING]: 'ריצוף',
  [WorkCategory.TILING]: 'חיפוי',
  [WorkCategory.SPRINKLERS]: 'ספרינקלרים',
  [WorkCategory.WATERPROOFING]: 'איטום',
  [WorkCategory.PAINTING]: 'צביעה',
  [WorkCategory.WINDOWS]: 'חלונות',
  [WorkCategory.KITCHEN]: 'מטבח',
  [WorkCategory.GENERAL]: 'כללי',
  [WorkCategory.DEVELOPMENT]: 'פיתוח',
};

// Category colors for UI
export const categoryColors: Record<WorkCategory, string> = {
  [WorkCategory.ELECTRICAL]: '#f59e0b', // amber-500
  [WorkCategory.PLUMBING]: '#3b82f6', // blue-500
  [WorkCategory.AC]: '#06b6d4', // cyan-500
  [WorkCategory.ENTRY_DOOR]: '#8b5cf6', // violet-500
  [WorkCategory.SANITARY]: '#14b8a6', // teal-500
  [WorkCategory.FLOORING]: '#a3e635', // lime-400
  [WorkCategory.TILING]: '#22d3ee', // cyan-400
  [WorkCategory.SPRINKLERS]: '#ef4444', // red-500
  [WorkCategory.WATERPROOFING]: '#6366f1', // indigo-500
  [WorkCategory.PAINTING]: '#ec4899', // pink-500
  [WorkCategory.WINDOWS]: '#84cc16', // lime-500
  [WorkCategory.KITCHEN]: '#f97316', // orange-500
  [WorkCategory.GENERAL]: '#6b7280', // gray-500
  [WorkCategory.DEVELOPMENT]: '#10b981', // emerald-500
};
