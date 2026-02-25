import { NextRequest, NextResponse } from 'next/server';
import { restoreSnapshot, getSnapshotDetails } from '@/lib/snapshot';
import { logActivity, getClientIp } from '@/lib/activity-logger';

/**
 * POST /api/snapshots/rollback - Restore database from a snapshot
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { snapshotId } = body;

    if (!snapshotId) {
      return NextResponse.json(
        { error: 'Snapshot ID is required' },
        { status: 400 }
      );
    }

    // Get snapshot details first to verify it exists
    const snapshotDetails = await getSnapshotDetails(snapshotId);
    if (!snapshotDetails) {
      return NextResponse.json(
        { error: 'Snapshot not found' },
        { status: 404 }
      );
    }

    // Perform the rollback
    const result = await restoreSnapshot(snapshotId);

    // Log the activity
    const ip = getClientIp(request.headers);
    await logActivity({
      activityType: 'rollback',
      description: `שחזור מצב: ${snapshotDetails.reason}`,
      ipAddress: ip,
      details: {
        snapshotId,
        snapshotReason: snapshotDetails.reason,
        reportsRestored: result.reportsRestored,
        workItemsRestored: result.workItemsRestored,
        inspectionsRestored: result.inspectionsRestored,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'המערכת שוחזרה בהצלחה',
      snapshotId,
      snapshotDate: snapshotDetails.createdAt,
      snapshotReason: snapshotDetails.reason,
      restored: {
        reports: result.reportsRestored,
        workItems: result.workItemsRestored,
        inspections: result.inspectionsRestored,
      },
    });
  } catch (error) {
    console.error('Error restoring snapshot:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore snapshot' },
      { status: 500 }
    );
  }
}
