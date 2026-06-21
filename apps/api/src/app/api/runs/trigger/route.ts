import { NextResponse } from 'next/server';
import { getPrisma } from '@greencity/db';
import { enqueueScrapeJob } from '@greencity/queue';
import { getModuleConfig } from '@greencity/shared';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { moduleKey, portal = 'admin', bpCode } = body as {
      moduleKey: string;
      portal?: 'admin' | 'bp';
      bpCode?: string;
    };

    if (!moduleKey) {
      return NextResponse.json({ error: 'moduleKey required' }, { status: 400 });
    }

    const config = getModuleConfig(moduleKey);
    if (portal === 'admin' && !config) {
      return NextResponse.json({ error: `Unknown module: ${moduleKey}` }, { status: 404 });
    }

    const prisma = getPrisma();
    const run = await prisma.scrapeRun.create({
      data: {
        moduleKey,
        portal,
        bpCode: bpCode ?? null,
        status: 'pending',
      },
    });

    await enqueueScrapeJob({
      moduleKey,
      portal,
      bpCode,
      runId: run.id,
      triggeredBy: 'dashboard',
    });

    return NextResponse.json({ runId: run.id, queued: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to enqueue' },
      { status: 500 },
    );
  }
}
