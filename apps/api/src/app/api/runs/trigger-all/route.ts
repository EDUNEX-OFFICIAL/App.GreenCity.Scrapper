import { NextResponse } from 'next/server';
import { getPrisma } from '@greencity/db';
import { enqueueScrapeJob } from '@greencity/queue';
import { getAllAdminModules } from '@greencity/shared';

export async function POST() {
  try {
    const prisma = getPrisma();
    const modules = getAllAdminModules();
    let count = 0;

    for (const mod of modules) {
      const run = await prisma.scrapeRun.create({
        data: { moduleKey: mod.key, portal: 'admin', status: 'pending' },
      });
      await enqueueScrapeJob(
        { moduleKey: mod.key, portal: 'admin', runId: run.id, triggeredBy: 'bulk' },
        { delay: count * 2000 },
      );
      count++;
    }

    return NextResponse.json({ queued: count });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bulk enqueue failed' },
      { status: 500 },
    );
  }
}
