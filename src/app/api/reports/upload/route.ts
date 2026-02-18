import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/db';
import { isValidPdfBuffer } from '@/lib/upload-validation';
import { processReport, extractDateFromFilename } from '@/lib/report-processing';

const PDF_DIR = path.join(process.cwd(), 'data', 'pdfs');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const forceUpload = formData.get('force') === 'true'; // Allow bypassing warnings

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    // Read file buffer for validation
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // === VALIDATION STEP 1: PDF Magic Bytes ===
    const pdfValidation = isValidPdfBuffer(buffer);
    if (!pdfValidation.valid) {
      return NextResponse.json(
        {
          error: pdfValidation.error,
          validationFailed: true,
          validationType: 'pdf_format',
        },
        { status: 400 }
      );
    }

    // Check if file already exists by filename
    const existingByName = await prisma.report.findUnique({
      where: { fileName: file.name },
    });

    if (existingByName) {
      // If it exists but has errors, allows overwrite implicitly or we could demand a force flag?
      // Logic from before: duplicate check fails. 
      // User might want to re-upload to fix a bad file.
      // For now, keep original behavior: block duplicate names.
      // But if it has errors, maybe we should allow?
      // Let's stick to strict duplicate check for now.
      return NextResponse.json(
        { error: 'קובץ עם שם זה כבר קיים במערכת', duplicate: true },
        { status: 409 }
      );
    }

    // Also check by date extracted from filename
    const reportDateFromFilename = extractDateFromFilename(file.name);
    if (reportDateFromFilename) {
      const existingByDate = await prisma.report.findFirst({
        where: {
          reportDate: reportDateFromFilename,
        },
      });

      if (existingByDate) {
        return NextResponse.json(
          {
            error: `כבר קיים דוח מתאריך ${reportDateFromFilename.toLocaleDateString('he-IL')} (${existingByDate.fileName})`,
            duplicate: true,
            existingFileName: existingByDate.fileName,
          },
          { status: 409 }
        );
      }
    }

    // Ensure PDF directory exists
    if (!existsSync(PDF_DIR)) {
      await mkdir(PDF_DIR, { recursive: true });
    }

    // Save the file
    const filePath = path.join(PDF_DIR, file.name);
    await writeFile(filePath, buffer);

    // Get or create project
    let project = await prisma.project.findFirst();
    if (!project) {
      project = await prisma.project.create({
        data: {
          name: 'מוסינזון 5 תל אביב',
          address: 'מוסינזון 5, תל אביב',
        },
      });
    }

    // Ensure apartments exist
    const APARTMENTS = ['1', '3', '5', '6', '7', '10', '11', '14'];
    for (const aptNum of APARTMENTS) {
      await prisma.apartment.upsert({
        where: { projectId_number: { projectId: project.id, number: aptNum } },
        create: { projectId: project.id, number: aptNum },
        update: {},
      });
    }

    // === PROCESS REPORT ===
    const result = await processReport(
      buffer,
      file.name,
      project.id,
      filePath,
      forceUpload
    );

    if (!result.success && result.requiresConfirmation) {
      // Clean up file if not confirmed? Original logic did this.
      // But processReport doesn't handle file cleanup.
      // Let's delete the file here if we need confirmation
      try {
        await unlink(filePath);
      } catch { }

      return NextResponse.json(
        {
          requiresConfirmation: true,
          validationWarnings: result.validationWarnings,
          // confidence: ... // we'd need to thread this through if needed
          message: 'הקובץ עבר אימות בסיסי אך נמצאו אזהרות. האם להמשיך?',
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      success: true,
      reportId: result.reportId,
      fileName: file.name,
      // reportDate: ... // not strictly needed for frontend confirmation
      message: result.hasErrors ? 'הקובץ הועלה אך עם שגיאות.' : 'הקובץ הועלה בהצלחה.',
      hasErrors: result.hasErrors,
      error: result.errorDetails,
      workItemsCreated: result.workItemsCreated,
      validation: {
        warnings: result.validationWarnings
      }
    });

  } catch (error) {
    console.error('Error uploading report:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to upload report',
      },
      { status: 500 }
    );
  }
}
