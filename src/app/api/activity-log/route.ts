import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logActivity, getClientIp } from '@/lib/activity-logger';

/**
 * GET /api/activity-log
 * Returns the last 200 activity log entries, newest first.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500);
        const offset = parseInt(searchParams.get('offset') ?? '0');

        const [entries, total] = await Promise.all([
            prisma.activityLog.findMany({
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.activityLog.count(),
        ]);

        return NextResponse.json({ entries, total, limit, offset });
    } catch (error) {
        console.error('Error fetching activity log:', error);
        return NextResponse.json({ error: 'Failed to fetch activity log' }, { status: 500 });
    }
}

/**
 * POST /api/activity-log
 * Internal endpoint used by client-side pages to log site visits.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { activityType, description, details } = body;

        if (!activityType || !description) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const ip = getClientIp(request.headers);

        await logActivity({
            activityType,
            description,
            ipAddress: ip ?? undefined,
            details,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error writing activity log:', error);
        return NextResponse.json({ error: 'Failed to write activity log' }, { status: 500 });
    }
}
