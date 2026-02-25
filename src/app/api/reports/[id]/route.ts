import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { logActivity, getClientIp } from '@/lib/activity-logger';

// GET - fetch single report details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        workItems: true,
        inspections: true,
      },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch report' },
      { status: 500 }
    );
  }
}

// DELETE - remove report and all associated data
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Find the report first
    const report = await prisma.report.findUnique({
      where: { id },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Delete associated work items
    await prisma.workItem.deleteMany({
      where: { reportId: id },
    });

    // Delete associated inspections
    await prisma.inspection.deleteMany({
      where: { reportId: id },
    });

    // Delete the report record
    await prisma.report.delete({
      where: { id },
    });

    // Try to delete the PDF file (optional - don't fail if file doesn't exist)
    if (report.filePath && existsSync(report.filePath)) {
      try {
        await unlink(report.filePath);
      } catch (fileError) {
        console.warn('Could not delete PDF file:', fileError);
        // Continue even if file deletion fails
      }
    }

    // Log the activity
    const ip = getClientIp(request.headers);
    await logActivity({
      activityType: 'delete',
      description: `מחיקת דוח: ${report.fileName}`,
      ipAddress: ip,
      details: {
        reportId: id,
        fileName: report.fileName,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'הדוח נמחק בהצלחה',
      fileName: report.fileName,
    });
  } catch (error) {
    console.error('Error deleting report:', error);
    return NextResponse.json(
      { error: 'Failed to delete report' },
      { status: 500 }
    );
  }
}
