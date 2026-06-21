import { NextResponse } from 'next/server';
import { getPrisma } from '@greencity/db';
import { enqueueScrapeJob } from '@greencity/queue';
import { getSequentialAdminModules } from '@greencity/shared';

const SKIP_MODULES = ['bp_list'];

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

    const allModules = getSequentialAdminModules();
    const modules = allModules.filter((m) => !SKIP_MODULES.includes(m.key));

    const run = await prisma.scrapeRun.create({
      data: {
        moduleKey: 'portal_sequential',
        portal: 'admin',
        status: 'pending',
        metadata: {
          totalModules: modules.length,
          skipModuleKeys: SKIP_MODULES,
          mode: 'remaining_after_bp_list',
        },
      },
    });

    await enqueueScrapeJob({
      moduleKey: 'portal_sequential',
      portal: 'admin',
      runId: run.id,
      triggeredBy: 'remaining',
      skipModuleKeys: SKIP_MODULES,
    });

    return NextResponse.json({
      runId: run.id,
      totalModules: modules.length,
      skippedModules: SKIP_MODULES,
      queued: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start remaining scrape' },
      { status: 500 },
    );
  }
}
