import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { prisma } from './db';
import { extractPdfData } from './claude';
import { normalizeStatus, normalizeCategory } from './status-mapper';

/**
 * Compute SHA256 hash of a file for duplicate detection
 */
function computeFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

const APARTMENTS = ['1', '3', '5', '6', '7', '10', '11', '14'];
const PDF_DIR = path.join(process.cwd(), 'data', 'pdfs');

export interface ProcessingResult {
  success: boolean;
  fileName: string;
  reportId?: string;
  error?: string;
  workItemsCreated?: number;
  inspectionsCreated?: number;
}

async function ensureProjectAndApartments(): Promise<string> {
  // Create or get the project
  let project = await prisma.project.findFirst();

  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'מוסינזון 5 תל אביב',
        address: 'מוסינזון 5, תל אביב',
      },
    });
    console.log('Created project:', project.id);
  }

  // Ensure all apartments exist
  for (const aptNum of APARTMENTS) {
    await prisma.apartment.upsert({
      where: {
        projectId_number: {
          projectId: project.id,
          number: aptNum,
        },
      },
      create: {
        projectId: project.id,
        number: aptNum,
      },
      update: {},
    });
  }

  return project.id;
}

export async function processPdf(
  filePath: string,
  projectId: string
): Promise<ProcessingResult> {
  const fileName = path.basename(filePath);

  // Compute file hash for duplicate detection
  const fileHash = computeFileHash(filePath);

  // Check if already processed by filename
  const existingByName = await prisma.report.findUnique({
    where: { fileName },
  });

  if (existingByName?.processed) {
    console.log(`Skipping already processed: ${fileName}`);
    return {
      success: true,
      fileName,
      reportId: existingByName.id,
      workItemsCreated: 0,
      inspectionsCreated: 0,
    };
  }

  // Check if a report with the same content (hash) already exists
  const existingByHash = await prisma.report.findFirst({
    where: { 
      fileHash,
      processed: true,
    },
  });

  if (existingByHash) {
    console.log(`Skipping duplicate content: ${fileName} (same as ${existingByHash.fileName})`);
    return {
      success: true,
      fileName,
      reportId: existingByHash.id,
      workItemsCreated: 0,
      inspectionsCreated: 0,
      error: `Duplicate of ${existingByHash.fileName}`,
    };
  }

  try {
    // Extract data from PDF using Claude
    const extractedData = await extractPdfData(filePath);

    // Parse report date
    const reportDate = new Date(extractedData.reportDate);
    if (isNaN(reportDate.getTime())) {
      throw new Error(`Invalid date: ${extractedData.reportDate}`);
    }

    // Create or update report
    const report = await prisma.report.upsert({
      where: { fileName },
      create: {
        projectId,
        fileName,
        filePath,
        fileHash,
        reportDate,
        inspector: extractedData.inspector,
        rawExtraction: JSON.stringify(extractedData),
        processed: false,
      },
      update: {
        reportDate,
        fileHash,
        inspector: extractedData.inspector,
        rawExtraction: JSON.stringify(extractedData),
      },
    });

    let workItemsCreated = 0;
    let inspectionsCreated = 0;

    // Get apartment lookup
    const apartments = await prisma.apartment.findMany({
      where: { projectId },
    });
    const apartmentMap = new Map(apartments.map((a) => [a.number, a.id]));

    // Process apartment work items
    for (const aptData of extractedData.apartments || []) {
      const apartmentId = apartmentMap.get(aptData.apartmentNumber);
      if (!apartmentId) {
        console.warn(`Unknown apartment: ${aptData.apartmentNumber}`);
        continue;
      }

      for (const item of aptData.workItems || []) {
        await prisma.workItem.create({
          data: {
            reportId: report.id,
            apartmentId,
            category: normalizeCategory(item.category),
            location: item.location || null,
            description: item.description,
            status: normalizeStatus(item.status),
            notes: item.notes || null,
            hasPhoto: item.hasPhoto || false,
          },
        });
        workItemsCreated++;
      }

      // Process inspection dates
      if (aptData.inspectionDates) {
        for (const [category, dateStr] of Object.entries(
          aptData.inspectionDates
        )) {
          const inspectionDate = dateStr ? new Date(dateStr) : null;
          await prisma.inspection.upsert({
            where: {
              reportId_apartmentId_category: {
                reportId: report.id,
                apartmentId,
                category: normalizeCategory(category),
              },
            },
            create: {
              reportId: report.id,
              apartmentId,
              category: normalizeCategory(category),
              inspectionDate,
            },
            update: {
              inspectionDate,
            },
          });
          inspectionsCreated++;
        }
      }
    }

    // Process development items (site-level work)
    for (const item of extractedData.developmentItems || []) {
      await prisma.workItem.create({
        data: {
          reportId: report.id,
          apartmentId: null,
          category: normalizeCategory(item.category),
          location: item.location || null,
          description: item.description,
          status: normalizeStatus(item.status),
          notes: item.notes || null,
          hasPhoto: item.hasPhoto || false,
        },
      });
      workItemsCreated++;
    }

    // Process progress tracking table
    for (const tracking of extractedData.progressTracking || []) {
      const apartmentId = apartmentMap.get(tracking.apartmentNumber);
      if (!apartmentId) continue;

      const inspectionDate = tracking.inspectionDate
        ? new Date(tracking.inspectionDate)
        : null;

      await prisma.inspection.upsert({
        where: {
          reportId_apartmentId_category: {
            reportId: report.id,
            apartmentId,
            category: normalizeCategory(tracking.category),
          },
        },
        create: {
          reportId: report.id,
          apartmentId,
          category: normalizeCategory(tracking.category),
          inspectionDate,
          status: tracking.status
            ? normalizeStatus(tracking.status)
            : undefined,
        },
        update: {
          inspectionDate,
          status: tracking.status
            ? normalizeStatus(tracking.status)
            : undefined,
        },
      });
      inspectionsCreated++;
    }

    // Mark as processed
    await prisma.report.update({
      where: { id: report.id },
      data: { processed: true },
    });

    console.log(
      `Processed ${fileName}: ${workItemsCreated} work items, ${inspectionsCreated} inspections`
    );

    return {
      success: true,
      fileName,
      reportId: report.id,
      workItemsCreated,
      inspectionsCreated,
    };
  } catch (error) {
    console.error(`Error processing ${fileName}:`, error);
    return {
      success: false,
      fileName,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function processAllPdfs(): Promise<ProcessingResult[]> {
  const projectId = await ensureProjectAndApartments();

  // Get all PDF files
  const files = fs.readdirSync(PDF_DIR).filter((f) => f.endsWith('.pdf'));
  console.log(`Found ${files.length} PDF files to process`);

  // Sort by date (filename starts with date)
  files.sort();

  const results: ProcessingResult[] = [];

  for (const file of files) {
    const filePath = path.join(PDF_DIR, file);
    const result = await processPdf(filePath, projectId);
    results.push(result);

    // Add a small delay between API calls to avoid rate limiting
    if (result.success && result.workItemsCreated && result.workItemsCreated > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}

export async function getUnprocessedPdfs(): Promise<string[]> {
  const files = fs.readdirSync(PDF_DIR).filter((f) => f.endsWith('.pdf'));

  const processedFiles = await prisma.report.findMany({
    where: { processed: true },
    select: { fileName: true },
  });

  const processedSet = new Set(processedFiles.map((r) => r.fileName));

  return files.filter((f) => !processedSet.has(f));
}
