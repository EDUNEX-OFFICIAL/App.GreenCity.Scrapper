import { NextResponse } from 'next/server';
import { getPrisma } from '@greencity/db';
import { enqueueScrapeJob } from '@greencity/queue';
import { getSequentialAdminModules } from '@greencity/shared';

export async function POST() {
  try {
    const prisma = getPrisma();

    const active = await prisma.scrapeRun.findFirst({
      where: {
        moduleKey: 'portal_sequential',
        status: { in: ['pending', 'running'] },
      },
    });

    if (active) {
      return NextResponse.json(
        { error: 'Sequential portal scrape already in progress', runId: active.id },
        { status: 409 },
      );
    }

    const modules = getSequentialAdminModules();
    const run = await prisma.scrapeRun.create({
      data: {
        moduleKey: 'portal_sequential',
        portal: 'admin',
        status: 'pending',
        metadata: { totalModules: modules.length },
      },
    });

    await enqueueScrapeJob({
      moduleKey: 'portal_sequential',
      portal: 'admin',
      runId: run.id,
      triggeredBy: 'sequential',
    });

    return NextResponse.json({ runId: run.id, totalModules: modules.length, queued: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start sequential scrape' },
      { status: 500 },
    );
  }
}
