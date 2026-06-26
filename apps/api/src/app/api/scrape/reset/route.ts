import { NextResponse } from 'next/server';
import {
  resetAllScrapedData,
  getScrapedDataCounts,
  cancelActiveScrapeRuns,
} from '@greencity/db';
import {
  stopGenealogyScrape,
  obliterateGenealogyQueue,
  obliterateBpHarvestQueue,
  pauseAdminScrape,
  getScrapeQueue,
} from '@greencity/queue';

const CONFIRM_PHRASE = 'DELETE ALL';

export async function GET() {
  try {
    const counts = await getScrapedDataCounts();
    return NextResponse.json({ counts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read counts' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { confirm?: string };
    if (body.confirm !== CONFIRM_PHRASE) {
      return NextResponse.json(
        {
          error: `Confirmation required. Send { "confirm": "${CONFIRM_PHRASE}" }`,
          counts: await getScrapedDataCounts(),
        },
        { status: 400 },
      );
    }

    await stopGenealogyScrape();
    await pauseAdminScrape();
    await getScrapeQueue().clean(0, 1_000_000, 'waiting');
    await getScrapeQueue().clean(0, 1_000_000, 'delayed');
    await cancelActiveScrapeRuns();
    await obliterateGenealogyQueue();
    await obliterateBpHarvestQueue();

    const deleted = await resetAllScrapedData();

    return NextResponse.json({
      ok: true,
      message: 'All scraped data deleted. Queues cleared. Fresh start ready.',
      deleted,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reset failed' },
      { status: 500 },
    );
  }
}
