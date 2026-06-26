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

  type LegChild = { bpCode?: string; bpName?: string; leg?: string };
  const nodes = await prisma.genealogyNode.findMany({ orderBy: { bpCode: 'asc' } });
  const cols = [
    'bpCode',
    'bpName',
    'uid',
    'treeType',
    'scrapeStatus',
    'scrapeError',
    'position',
    'leftPoint',
    'rightPoint',
    'selfPoint',
    'leftChildBpCode',
    'leftChildName',
    'rightChildBpCode',
    'rightChildName',
    'scrapedAt',
  ];
  const lines = [cols.join(',')];
  for (const n of nodes) {
    const modal = (n.modalData ?? {}) as Record<string, string | undefined>;
    const children = (Array.isArray(n.childrenJson) ? n.childrenJson : []) as LegChild[];
    const leftChild = children.find((c) => c.leg === 'left');
    const rightChild = children.find((c) => c.leg === 'right');
    lines.push(
      [
        n.bpCode,
        n.bpName ?? '',
        n.uid ?? '',
        n.treeType,
        n.scrapeStatus,
        n.scrapeError ?? '',
        modal.position ?? '',
        modal.leftPoint ?? '',
        modal.rightPoint ?? '',
        modal.selfPoint ?? '',
        modal.leftChildBpCode ?? leftChild?.bpCode ?? '',
        modal.leftChildName ?? leftChild?.bpName ?? '',
        modal.rightChildBpCode ?? rightChild?.bpCode ?? '',
        modal.rightChildName ?? rightChild?.bpName ?? '',
        n.scrapedAt.toISOString(),
      ]
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
