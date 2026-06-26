import { NextResponse } from 'next/server';
import {
  pauseGenealogyScrape,
  resumeGenealogyScrape,
  stopGenealogyScrape,
  pauseAdminScrape,
  resumeAdminScrape,
  stopAdminScrape,
  stopAdminModuleScrape,
  getScrapeControlStatus,
} from '@greencity/queue';
import {
  cancelActiveScrapeRuns,
  cancelGenealogyScrapeRuns,
  cancelModuleScrapeRuns,
} from '@greencity/db';

type ControlAction = 'pause' | 'resume' | 'stop';

function resolveTarget(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return 'genealogy';
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; target?: string };
    const action = (body.action ?? 'pause') as ControlAction;
    const target = resolveTarget(body.target);

    if (target === 'genealogy') {
      if (action === 'pause') {
        await pauseGenealogyScrape();
      } else if (action === 'resume') {
        await resumeGenealogyScrape();
      } else if (action === 'stop') {
        const { removedJobs } = await stopGenealogyScrape();
        const cancelledRuns = await cancelGenealogyScrapeRuns();
        const status = await getScrapeControlStatus();
        return NextResponse.json({ ok: true, action: 'stopped', target, removedJobs, cancelledRuns, ...status });
      } else {
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
      }
      const status = await getScrapeControlStatus();
      return NextResponse.json({ ok: true, action, target, ...status });
    }

    if (target === 'admin') {
      if (action === 'pause') {
        await pauseAdminScrape();
      } else if (action === 'resume') {
        await resumeAdminScrape();
      } else if (action === 'stop') {
        const { removedJobs } = await stopAdminScrape();
        const cancelledRuns = await cancelActiveScrapeRuns();
        const status = await getScrapeControlStatus();
        return NextResponse.json({ ok: true, action: 'stopped', target, removedJobs, cancelledRuns, ...status });
      } else {
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
      }
      const status = await getScrapeControlStatus();
      return NextResponse.json({ ok: true, action, target, ...status });
    }

    // Single admin module (bp_list, sale_list, portal_sequential, …)
    if (action === 'pause') {
      await pauseAdminScrape();
    } else if (action === 'resume') {
      await resumeAdminScrape();
    } else if (action === 'stop') {
      const { removedJobs } = await stopAdminModuleScrape(target);
      const cancelledRuns = await cancelModuleScrapeRuns(target);
      const status = await getScrapeControlStatus();
      return NextResponse.json({ ok: true, action: 'stopped', target, removedJobs, cancelledRuns, ...status });
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    const status = await getScrapeControlStatus();
    return NextResponse.json({ ok: true, action, target, ...status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Control action failed' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const status = await getScrapeControlStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get control status' },
      { status: 500 },
    );
  }
}
