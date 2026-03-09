export const dynamic = 'force-dynamic';
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

    // Check if download is requested
    const searchParams = request.nextUrl.searchParams;
    const download = searchParams.get('download') === 'true';

    let fileBuffer: Buffer;

    if (report.filePath && report.filePath.startsWith('http')) {
      // Vercel Blob URL
      try {
        const response = await fetch(report.filePath, {
          headers: {
            Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Blob fetch failed: ${response.statusText}`);
        }

        fileBuffer = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        console.error('Error fetching PDF from Blob:', error);
        return NextResponse.json(
          { error: 'Failed to access PDF file from storage' },
          { status: 500 }
        );
      }
    } else {
      // Local fallback
      const pdfPath = path.join(process.cwd(), 'data', 'pdfs', report.fileName);

      if (!fs.existsSync(pdfPath)) {
        return NextResponse.json(
          { error: 'PDF file not found' },
          { status: 404 }
        );
      }

      fileBuffer = fs.readFileSync(pdfPath);
    }

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

    return new NextResponse(fileBuffer as unknown as BodyInit, { headers });
  } catch (error) {
    console.error('Error serving PDF:', error);
    return NextResponse.json(
      { error: 'Failed to serve PDF' },
      { status: 500 }
    );
  }
}
