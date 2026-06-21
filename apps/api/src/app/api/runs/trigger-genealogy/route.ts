import { NextResponse } from 'next/server';
import { createScrapeRun, findActiveGenealogyBatch } from '@greencity/db';
import { enqueueGenealogyBatch } from '@greencity/queue';

export async function POST() {
  try {
    const existing = await findActiveGenealogyBatch();
    if (existing) {
      return NextResponse.json(
        { error: 'Genealogy batch already in progress', runId: existing.id },
        { status: 409 },
      );
    }

    const run = await createScrapeRun({
      moduleKey: 'genealogy_batch',
      portal: 'bp',
      metadata: { triggeredBy: 'manual' },
    });

    await enqueueGenealogyBatch({
      moduleKey: 'genealogy_batch',
      runId: run.id,
      triggeredBy: 'manual',
    });

    return NextResponse.json({ runId: run.id, queued: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to trigger genealogy' },
      { status: 500 },
    );
  }
}
