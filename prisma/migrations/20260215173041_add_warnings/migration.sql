-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN "photoNotes" TEXT;

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reason" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "reportCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileHash" TEXT,
    "inspector" TEXT,
    "rawExtraction" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "hasErrors" BOOLEAN NOT NULL DEFAULT false,
    "errorDetails" TEXT,
    "hasWarnings" BOOLEAN NOT NULL DEFAULT false,
    "warningDetails" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("createdAt", "fileName", "filePath", "id", "inspector", "processed", "projectId", "rawExtraction", "reportDate", "updatedAt") SELECT "createdAt", "fileName", "filePath", "id", "inspector", "processed", "projectId", "rawExtraction", "reportDate", "updatedAt" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
CREATE UNIQUE INDEX "Report_fileName_key" ON "Report"("fileName");
CREATE INDEX "Report_reportDate_idx" ON "Report"("reportDate");
CREATE INDEX "Report_fileHash_idx" ON "Report"("fileHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Snapshot_createdAt_idx" ON "Snapshot"("createdAt");
