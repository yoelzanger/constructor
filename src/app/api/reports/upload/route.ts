import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { prisma } from '@/lib/db';
import { isValidPdfBuffer } from '@/lib/upload-validation';
import { processReport, extractDateFromFilename } from '@/lib/report-processing';
import { logActivity, getClientIp } from '@/lib/activity-logger';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  let blobUrl: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const forceUpload = formData.get('force') === 'true';

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
        { error: pdfValidation.error, validationFailed: true, validationType: 'pdf_format' },
        { status: 400 }
      );
    }

    // Check if file already exists by filename
    const existingByName = await prisma.report.findUnique({ where: { fileName: file.name } });
    if (existingByName) {
      return NextResponse.json(
        { error: 'קובץ עם שם זה כבר קיים במערכת', duplicate: true },
        { status: 409 }
      );
    }

    // Also check by date extracted from filename
    const reportDateFromFilename = extractDateFromFilename(file.name);
    if (reportDateFromFilename) {
      const existingByDate = await prisma.report.findFirst({ where: { reportDate: reportDateFromFilename } });
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

    // === Upload PDF to Vercel Blob or Local Fallback ===
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`reports/${file.name}`, buffer, {
        access: 'public',
        contentType: 'application/pdf',
      });
      blobUrl = blob.url;
    } else {
      // Local fallback for development
      console.log('BLOB_READ_WRITE_TOKEN missing, using local storage fallback');
      const PDF_DIR = path.join(process.cwd(), 'data', 'pdfs');
      if (!existsSync(PDF_DIR)) {
        await mkdir(PDF_DIR, { recursive: true });
      }
      const filePath = path.join(PDF_DIR, file.name);
      await writeFile(filePath, buffer);
      // In local mode, we use the absolute path as the identifier
      blobUrl = filePath;
    }

    // Get or create project
    let project = await prisma.project.findFirst();
    if (!project) {
      project = await prisma.project.create({
        data: { name: 'מוסינזון 5 תל אביב', address: 'מוסינזון 5, תל אביב' },
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

    // === PROCESS REPORT (filePath = blob URL) ===
    const result = await processReport(buffer, file.name, project.id, blobUrl, forceUpload);

    if (!result.success && result.requiresConfirmation) {
      // Clean up if user needs to confirm first
      if (process.env.BLOB_READ_WRITE_TOKEN && blobUrl) {
        try { await del(blobUrl); } catch { }
      }
      // Note: we don't delete local files on confirmation request to keep things simple for dev
      blobUrl = null;
      return NextResponse.json(
        {
          requiresConfirmation: true,
          validationWarnings: result.validationWarnings,
          message: 'הקובץ עבר אימות בסיסי אך נמצאו אזהרות. האם להמשיך?',
        },
        { status: 202 }
      );
    }

    const responseData = {
      success: true,
      reportId: result.reportId,
      fileName: file.name,
      message: result.hasErrors ? 'הקובץ הועלה אך עם שגיאות.' : 'הקובץ הועלה בהצלחה.',
      hasErrors: result.hasErrors,
      error: result.errorDetails,
      workItemsCreated: result.workItemsCreated,
      validation: { warnings: result.validationWarnings },
    };

    // Log the activity
    const ip = getClientIp(request.headers);
    await logActivity({
      activityType: 'upload',
      description: `העלאת דוח: ${file.name}`,
      ipAddress: ip,
      details: {
        reportId: result.reportId,
        hasErrors: result.hasErrors,
        workItemsCreated: result.workItemsCreated,
      },
    });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error uploading report:', error);
    // Clean up blob on unhandled error
    if (blobUrl) {
      try { await del(blobUrl); } catch { }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload report' },
      { status: 500 }
    );
  }
}

