import { NextResponse } from 'next/server';
import { reconcileStaleRuns, reconcilePendingRuns } from '@greencity/db';

export async function POST() {
  try {
    const stale = await reconcileStaleRuns(15);
    const pending = await reconcilePendingRuns(60);
    return NextResponse.json({ stale, pending, total: stale + pending });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reconcile failed' },
      { status: 500 },
    );
  }
}
