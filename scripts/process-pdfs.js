#!/usr/bin/env node

/**
 * Batch PDF Processing Script
 *
 * Usage:
 *   node scripts/process-pdfs.js           # Process all unprocessed PDFs
 *   node scripts/process-pdfs.js --all     # Reprocess all PDFs
 *   node scripts/process-pdfs.js --test    # Test Claude API connection
 */

require('dotenv/config');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;
const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const APARTMENTS = ['1', '3', '5', '6', '7', '10', '11', '14'];
const PDF_DIR = path.join(process.cwd(), 'data', 'pdfs');

// Status mapping
const hebrewStatusMap = {
  'בוצע': 'COMPLETED',
  'בוצע - תקין': 'COMPLETED_OK',
  'תקין': 'COMPLETED_OK',
  'לא תקין': 'NOT_OK',
  'ליקוי': 'DEFECT',
  'בטיפול': 'IN_PROGRESS',
  'טופל': 'HANDLED',
  'ממתין': 'PENDING',
  'לא התחיל': 'NOT_STARTED',
  'בביצוע': 'IN_PROGRESS',
  'הושלם': 'COMPLETED',
  'נמצא ליקוי': 'DEFECT',
  'תוקן': 'HANDLED',
  // Additional statuses found in PDFs
  'קיימים אי תאומים': 'DEFECT',
  'קיימים אי תיאומים': 'DEFECT',
  'אי תאומים': 'DEFECT',
  'אי תיאומים': 'DEFECT',
  'יש הערות': 'DEFECT',
  'בוצע - יש הערות': 'DEFECT',
  'בוצע - יש ליקויים': 'DEFECT',
  'בוצע - נמצאו אי תאומים': 'DEFECT',
  'בוצע - נמצאו אי תיאומים': 'DEFECT',
  'נמצאו אי תאומים': 'DEFECT',
  'נמצאו אי תיאומים': 'DEFECT',
  'בוצע חלקי': 'IN_PROGRESS',
  'לטיפול': 'PENDING',
  'נדרש מעקב': 'PENDING',
  'נדרש ביצוע': 'PENDING',
  'בוצע עם הערות': 'DEFECT',
};

// Category mapping
const hebrewCategoryMap = {
  'חשמל': 'ELECTRICAL',
  'אינסטלציה': 'PLUMBING',
  'מיזוג': 'AC',
  'מיזוג אויר': 'AC',
  'דלת כניסה': 'ENTRY_DOOR',
  'סניטריה': 'SANITARY',
  'ריצוף': 'FLOORING',
  'חיפוי': 'TILING',
  'ספרינקלרים': 'SPRINKLERS',
  'ספרינקלר': 'SPRINKLERS',
  'איטום': 'WATERPROOFING',
  'צביעה': 'PAINTING',
  'חלונות': 'WINDOWS',
  'מטבח': 'KITCHEN',
  'כללי': 'GENERAL',
  'פיתוח': 'DEVELOPMENT',
  'עבודות פיתוח': 'DEVELOPMENT',
};

function normalizeStatus(hebrewStatus) {
  const trimmed = hebrewStatus.trim();
  if (hebrewStatusMap[trimmed]) return hebrewStatusMap[trimmed];
  for (const [hebrew, status] of Object.entries(hebrewStatusMap)) {
    if (trimmed.includes(hebrew)) return status;
  }
  console.warn(`Unknown status: "${hebrewStatus}", defaulting to IN_PROGRESS`);
  return 'IN_PROGRESS';
}

function normalizeCategory(hebrewCategory) {
  const trimmed = hebrewCategory.trim();
  if (hebrewCategoryMap[trimmed]) return hebrewCategoryMap[trimmed];
  for (const [hebrew, category] of Object.entries(hebrewCategoryMap)) {
    if (trimmed.includes(hebrew)) return category;
  }
  console.warn(`Unknown category: "${hebrewCategory}", defaulting to GENERAL`);
  return 'GENERAL';
}

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const trimmed = dateStr.trim();
  
  // Skip dates that contain status text like "תקין - 17.9.25"
  if (trimmed.includes('תקין') || trimmed.includes('לא תקין') || trimmed.includes('קיימים')) {
    return null;
  }
  
  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try DD.MM.YY format (e.g., "1.7.25" -> 2025-07-01)
  const ddmmyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (ddmmyy) {
    let day = parseInt(ddmmyy[1]);
    let month = parseInt(ddmmyy[2]) - 1; // JS months are 0-indexed
    let year = parseInt(ddmmyy[3]);
    if (year < 100) year += 2000; // Convert YY to YYYY
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try generic Date parsing
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) return date;
  
  // Invalid date
  console.warn(`Invalid date format: "${dateStr}", skipping`);
  return null;
}

const EXTRACTION_PROMPT = `You are analyzing a Hebrew construction progress report PDF for a TAMA 38/2 urban renewal project at Mosinzon 5, Tel Aviv.

Extract the following information and return it as a valid JSON object:

1. **Report Metadata**:
   - reportDate: The date of the report in YYYY-MM-DD format
   - inspector: The name of the inspector if mentioned
   - projectName: The project name/address

2. **Apartments Data**: For each apartment mentioned (typically apartments 1, 3, 5, 6, 7, 10, 11, 14):
   - apartmentNumber: The apartment number as a string
   - workItems: Array of work items with:
     - category: Work category in Hebrew (חשמל, אינסטלציה, מיזוג, דלת כניסה, סניטריה, ריצוף, חיפוי, ספרינקלרים, איטום, etc.)
     - location: Specific location within the apartment if mentioned
     - description: Description of the work item
     - status: Status in Hebrew (בוצע, בוצע - תקין, לא תקין, ליקוי, בטיפול, טופל, etc.)
     - notes: Any additional notes
     - hasPhoto: true if there's a photo associated with this item
   - inspectionDates: Object mapping category to inspection date if available

3. **Development Items**: Site-level work not specific to an apartment:
   - Same structure as workItems but for general/building-level work

4. **Progress Tracking Table**: If there's a tracking table showing inspection dates by apartment and category:
   - apartmentNumber
   - category
   - inspectionDate
   - status

Return ONLY valid JSON, no explanations. Example structure:
{
  "reportDate": "2025-01-15",
  "inspector": "שם המפקח",
  "projectName": "מוסינזון 5 תל אביב",
  "apartments": [
    {
      "apartmentNumber": "1",
      "workItems": [
        {
          "category": "חשמל",
          "location": "סלון",
          "description": "התקנת נקודות חשמל",
          "status": "בוצע - תקין",
          "notes": null,
          "hasPhoto": false
        }
      ],
      "inspectionDates": {
        "חשמל": "2025-01-10",
        "אינסטלציה": "2025-01-12"
      }
    }
  ],
  "developmentItems": [],
  "progressTracking": []
}`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractPdfData(pdfPath, retries = 3) {
  const absolutePath = path.resolve(pdfPath);
  const pdfBuffer = fs.readFileSync(absolutePath);
  const base64Pdf = pdfBuffer.toString('base64');

  console.log(`Processing PDF: ${path.basename(pdfPath)}`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf,
                },
              },
              {
                type: 'text',
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      });
      
      // Success - process response
      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      let extractedData;
      try {
        const codeBlockMatch = textContent.text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          extractedData = JSON.parse(codeBlockMatch[1]);
        } else {
          const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON found in response');
          extractedData = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Failed to parse Claude response:', textContent.text.substring(0, 500));
        throw new Error(`Failed to parse extraction result: ${parseError.message}`);
      }

      if (!extractedData.reportDate) {
        const filename = path.basename(pdfPath);
        const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          extractedData.reportDate = dateMatch[1];
        } else {
          throw new Error('Could not determine report date');
        }
      }

      return extractedData;
      
    } catch (error) {
      if (error.status === 429 && attempt < retries) {
        // Rate limit - wait and retry
        const retryAfter = error.headers?.get('retry-after') || 60;
        const waitTime = Math.max(parseInt(retryAfter) * 1000, 60000); // At least 60 seconds
        console.log(`Rate limited. Waiting ${waitTime/1000}s before retry ${attempt + 1}/${retries}...`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

async function testConnection() {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Say "OK" if you can read this.' }],
    });
    const textContent = response.content.find((c) => c.type === 'text');
    return textContent?.type === 'text' && textContent.text.includes('OK');
  } catch (error) {
    console.error('Claude API connection test failed:', error);
    return false;
  }
}

async function ensureProjectAndApartments() {
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

  for (const aptNum of APARTMENTS) {
    await prisma.apartment.upsert({
      where: { projectId_number: { projectId: project.id, number: aptNum } },
      create: { projectId: project.id, number: aptNum },
      update: {},
    });
  }

  return project.id;
}

async function processPdf(filePath, projectId) {
  const fileName = path.basename(filePath);

  const existing = await prisma.report.findUnique({ where: { fileName } });
  if (existing?.processed) {
    console.log(`Skipping already processed: ${fileName}`);
    return { success: true, fileName, reportId: existing.id, workItemsCreated: 0, inspectionsCreated: 0 };
  }

  try {
    const extractedData = await extractPdfData(filePath);
    const reportDate = new Date(extractedData.reportDate);
    if (isNaN(reportDate.getTime())) throw new Error(`Invalid date: ${extractedData.reportDate}`);

    const report = await prisma.report.upsert({
      where: { fileName },
      create: {
        projectId,
        fileName,
        filePath,
        reportDate,
        inspector: extractedData.inspector,
        rawExtraction: JSON.stringify(extractedData),
        processed: false,
      },
      update: {
        reportDate,
        inspector: extractedData.inspector,
        rawExtraction: JSON.stringify(extractedData),
      },
    });

    let workItemsCreated = 0;
    let inspectionsCreated = 0;

    const apartments = await prisma.apartment.findMany({ where: { projectId } });
    const apartmentMap = new Map(apartments.map((a) => [a.number, a.id]));

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

      if (aptData.inspectionDates) {
        for (const [category, dateStr] of Object.entries(aptData.inspectionDates)) {
          const inspectionDate = parseDate(dateStr);
          // Skip if date is invalid or null
          if (!inspectionDate) {
            console.warn(`Skipping invalid inspection date for ${category}: "${dateStr}"`);
            continue;
          }
          
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
            update: { inspectionDate },
          });
          inspectionsCreated++;
        }
      }
    }

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

    for (const tracking of extractedData.progressTracking || []) {
      const apartmentId = apartmentMap.get(tracking.apartmentNumber);
      if (!apartmentId) continue;

      const inspectionDate = parseDate(tracking.inspectionDate);
      // Skip if no valid date
      if (!inspectionDate) {
        console.warn(`Skipping tracking with invalid date: "${tracking.inspectionDate}"`);
        continue;
      }

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
          status: tracking.status ? normalizeStatus(tracking.status) : undefined,
        },
        update: {
          inspectionDate,
          status: tracking.status ? normalizeStatus(tracking.status) : undefined,
        },
      });
      inspectionsCreated++;
    }

    await prisma.report.update({
      where: { id: report.id },
      data: { processed: true },
    });

    console.log(`Processed ${fileName}: ${workItemsCreated} work items, ${inspectionsCreated} inspections`);
    return { success: true, fileName, reportId: report.id, workItemsCreated, inspectionsCreated };
  } catch (error) {
    console.error(`Error processing ${fileName}:`, error);
    return { success: false, fileName, error: error.message };
  }
}

async function processAllPdfs() {
  const projectId = await ensureProjectAndApartments();
  const files = fs.readdirSync(PDF_DIR).filter((f) => f.endsWith('.pdf'));
  console.log(`Found ${files.length} PDF files to process`);
  files.sort();

  const results = [];
  for (const file of files) {
    const filePath = path.join(PDF_DIR, file);
    const result = await processPdf(filePath, projectId);
    results.push(result);

    if (result.success && result.workItemsCreated > 0) {
      // Wait 30 seconds between successful PDFs to avoid rate limits
      console.log('Waiting 30s before next PDF to avoid rate limits...');
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }

  return results;
}

async function getUnprocessedPdfs() {
  const files = fs.readdirSync(PDF_DIR).filter((f) => f.endsWith('.pdf'));
  const processedFiles = await prisma.report.findMany({
    where: { processed: true },
    select: { fileName: true },
  });
  const processedSet = new Set(processedFiles.map((r) => r.fileName));
  return files.filter((f) => !processedSet.has(f));
}

async function main() {
  const args = process.argv.slice(2);

  console.log('Construction Progress PDF Processor\n');

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-api-key-here') {
    console.error('Error: ANTHROPIC_API_KEY is not configured in .env file');
    console.log('\nPlease add your Anthropic API key to the .env file:');
    console.log('ANTHROPIC_API_KEY="sk-ant-..."');
    process.exit(1);
  }

  if (args.includes('--test')) {
    console.log('Testing Claude API connection...');
    const connected = await testConnection();
    if (connected) {
      console.log('✓ Claude API connection successful');
    } else {
      console.log('✗ Claude API connection failed');
    }
    await prisma.$disconnect();
    return;
  }

  const unprocessed = await getUnprocessedPdfs();

  if (args.includes('--all')) {
    console.log('Processing all PDF files (including previously processed)...\n');
    await prisma.report.updateMany({ data: { processed: false } });
    await prisma.workItem.deleteMany();
    await prisma.inspection.deleteMany();
  } else if (unprocessed.length === 0) {
    console.log('All PDFs have already been processed.');
    console.log('Use --all flag to reprocess everything.');
    await prisma.$disconnect();
    return;
  } else {
    console.log(`Found ${unprocessed.length} unprocessed PDF(s):\n`);
    unprocessed.forEach((f) => console.log(`  - ${f}`));
    console.log('');
  }

  const results = await processAllPdfs();

  console.log('\n--- Processing Summary ---\n');

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`Total files: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length > 0) {
    const totalWorkItems = successful.reduce((sum, r) => sum + (r.workItemsCreated || 0), 0);
    const totalInspections = successful.reduce((sum, r) => sum + (r.inspectionsCreated || 0), 0);
    console.log(`\nWork items created: ${totalWorkItems}`);
    console.log(`Inspections recorded: ${totalInspections}`);
  }

  if (failed.length > 0) {
    console.log('\nFailed files:');
    failed.forEach((r) => console.log(`  - ${r.fileName}: ${r.error}`));
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  prisma.$disconnect();
  process.exit(1);
});
