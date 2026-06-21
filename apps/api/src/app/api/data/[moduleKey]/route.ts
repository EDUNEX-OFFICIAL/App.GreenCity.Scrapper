import { NextResponse } from 'next/server';
import { getPrisma } from '@greencity/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ moduleKey: string }> },
) {
  const { moduleKey } = await params;
  const url = new URL(_req.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = 50;

  const prisma = getPrisma();
  const [rows, total] = await Promise.all([
    prisma.rawModuleRow.findMany({
      where: { moduleKey },
      orderBy: { lastSeenAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.rawModuleRow.count({ where: { moduleKey } }),
  ]);

  return NextResponse.json({ rows, total, page, pageSize });
}
