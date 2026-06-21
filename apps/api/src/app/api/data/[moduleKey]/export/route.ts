import { NextResponse } from 'next/server';
import { getPrisma } from '@greencity/db';
import { getModuleConfig } from '@greencity/shared';
import { rowsToCsv } from '@/lib/csv';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ moduleKey: string }> },
) {
  const { moduleKey } = await params;
  const config = getModuleConfig(moduleKey);
  const prisma = getPrisma();

  const dbRows = await prisma.rawModuleRow.findMany({
    where: { moduleKey },
    orderBy: { lastSeenAt: 'desc' },
  });

  const rows = dbRows.map((r) => r.rowJson as Record<string, string>);
  const csv = rowsToCsv(rows);
  const label = config?.label?.replace(/[^\w.-]+/g, '_') ?? moduleKey;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${moduleKey}_${label}.csv"`,
    },
  });
}
