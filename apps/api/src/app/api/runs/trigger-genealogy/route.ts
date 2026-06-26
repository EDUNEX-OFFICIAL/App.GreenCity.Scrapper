import { NextResponse } from 'next/server';
import {
  createScrapeRun,
  deleteGenealogyForBps,
  findActiveGenealogyBatch,
  getFailedGenealogyBpCodes,
} from '@greencity/db';
import { enqueueGenealogyBatch } from '@greencity/queue';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const retryFailedOnly = body?.retryFailedOnly === true;
    const clearFailedFirst = body?.clearFailedFirst !== false;

    const existing = await findActiveGenealogyBatch();
    if (existing) {
      return NextResponse.json(
        { error: 'Genealogy batch already in progress', runId: existing.id },
        { status: 409 },
      );
    }

    let cleared: { nodes: number; edges: number; bpCount: number } | undefined;
    if (retryFailedOnly && clearFailedFirst) {
      const failedCodes = [...(await getFailedGenealogyBpCodes())];
      const deleted = await deleteGenealogyForBps(failedCodes);
      cleared = { ...deleted, bpCount: failedCodes.length };
    }

    const run = await createScrapeRun({
      moduleKey: 'genealogy_batch',
      portal: 'bp',
      metadata: {
        triggeredBy: retryFailedOnly ? 'retry_failed' : 'manual',
        retryFailedOnly,
      },
    });

    await enqueueGenealogyBatch({
      moduleKey: 'genealogy_batch',
      runId: run.id,
      triggeredBy: retryFailedOnly ? 'retry_failed' : 'manual',
      retryFailedOnly,
    });

    return NextResponse.json({ runId: run.id, queued: true, retryFailedOnly, cleared });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to trigger genealogy' },
      { status: 500 },
    );
  }
}
