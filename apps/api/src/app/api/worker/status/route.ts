import { NextResponse } from 'next/server';
import { getWorkerStatus } from '@greencity/queue';

export async function GET() {
  try {
    const status = await getWorkerStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Status check failed', online: false },
      { status: 500 },
    );
  }
}
