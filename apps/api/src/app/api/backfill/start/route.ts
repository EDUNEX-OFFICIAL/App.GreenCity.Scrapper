import { NextResponse } from 'next/server';
import { runBackfillOrchestrator } from '@greencity/queue';

export async function POST() {
  try {
    await runBackfillOrchestrator();
    return NextResponse.redirect(new URL('/backfill', 'http://localhost:3010'));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backfill failed' },
      { status: 500 },
    );
  }
}
