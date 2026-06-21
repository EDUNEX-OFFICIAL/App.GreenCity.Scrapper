import { NextResponse } from 'next/server';
import { getPrisma } from '@greencity/db';
import { escapeCsvCell } from '@/lib/csv';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? 'nodes';
  const prisma = getPrisma();

  if (type === 'edges') {
    const edges = await prisma.genealogyEdge.findMany({ orderBy: { createdAt: 'asc' } });
    const cols = ['parentBpCode', 'childBpCode', 'leg', 'treeType', 'createdAt'];
    const lines = [cols.join(',')];
    for (const e of edges) {
      lines.push(
        [e.parentBpCode, e.childBpCode, e.leg, e.treeType, e.createdAt.toISOString()]
          .map(escapeCsvCell)
          .join(','),
      );
    }
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="genealogy_edges.csv"',
      },
    });
  }

  const nodes = await prisma.genealogyNode.findMany({ orderBy: { bpCode: 'asc' } });
  const cols = ['bpCode', 'bpName', 'uid', 'treeType', 'scrapedAt'];
  const lines = [cols.join(',')];
  for (const n of nodes) {
    lines.push(
      [n.bpCode, n.bpName ?? '', n.uid ?? '', n.treeType, n.scrapedAt.toISOString()]
        .map(escapeCsvCell)
        .join(','),
    );
  }
  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="genealogy_nodes.csv"',
    },
  });
}
