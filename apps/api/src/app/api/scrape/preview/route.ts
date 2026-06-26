import { NextResponse } from 'next/server';
import { getLatestScrapePreview } from '@greencity/db';

export async function GET() {
  try {
    const preview = await getLatestScrapePreview();
    return NextResponse.json({ preview, timestamp: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preview failed' },
      { status: 500 },
    );
  }
}
