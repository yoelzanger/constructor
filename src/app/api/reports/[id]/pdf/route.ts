import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get report from database
    const report = await prisma.report.findUnique({
      where: { id },
      select: { fileName: true, filePath: true },
    });

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // Construct the full path to the PDF
    const pdfPath = path.join(process.cwd(), 'data', 'pdfs', report.fileName);

    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      return NextResponse.json(
        { error: 'PDF file not found' },
        { status: 404 }
      );
    }

    // Read the file
    const fileBuffer = fs.readFileSync(pdfPath);

    // Check if download is requested
    const searchParams = request.nextUrl.searchParams;
    const download = searchParams.get('download') === 'true';

    // Return the PDF
    const headers: HeadersInit = {
      'Content-Type': 'application/pdf',
      'Content-Length': fileBuffer.length.toString(),
    };

    if (download) {
      headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(report.fileName)}"`;
    } else {
      headers['Content-Disposition'] = `inline; filename="${encodeURIComponent(report.fileName)}"`;
    }

    return new NextResponse(fileBuffer, { headers });
  } catch (error) {
    console.error('Error serving PDF:', error);
    return NextResponse.json(
      { error: 'Failed to serve PDF' },
      { status: 500 }
    );
  }
}
