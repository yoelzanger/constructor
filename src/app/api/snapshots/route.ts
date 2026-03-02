export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSnapshots, getSnapshotDetails } from '@/lib/snapshot';

/**
 * GET /api/snapshots - List available snapshots
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    // If ID is provided, get details for that snapshot
    if (id) {
      const details = await getSnapshotDetails(id);
      if (!details) {
        return NextResponse.json(
          { error: 'Snapshot not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(details);
    }

    // Otherwise, return list of snapshots
    const snapshots = await getSnapshots(limit);
    return NextResponse.json(snapshots);
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshots' },
      { status: 500 }
    );
  }
}
