/**
 * Export genealogy nodes/edges to data/exports/*.csv
 * Usage: node apps/scraper/dist/cli-export-genealogy.js
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getPrisma } from '@greencity/db';

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function main(): Promise<void> {
  const prisma = getPrisma();
  const outDir = join(process.cwd(), 'data', 'exports');
  await mkdir(outDir, { recursive: true });

  const nodes = await prisma.genealogyNode.findMany({ orderBy: { bpCode: 'asc' } });
  const nodeCols = [
    'bpCode', 'bpName', 'uid', 'treeType', 'scrapeStatus', 'scrapeError', 'scrapedAt',
  ];
  const nodeLines = [nodeCols.join(',')];
  for (const n of nodes) {
    nodeLines.push(
      [n.bpCode, n.bpName ?? '', n.uid ?? '', n.treeType, n.scrapeStatus, n.scrapeError ?? '', n.scrapedAt.toISOString()]
        .map(escapeCsvCell)
        .join(','),
    );
  }
  const nodesPath = join(outDir, 'genealogy_nodes.csv');
  await writeFile(nodesPath, nodeLines.join('\n'), 'utf8');

  const edges = await prisma.genealogyEdge.findMany({ orderBy: { createdAt: 'asc' } });
  const edgeCols = ['parentBpCode', 'childBpCode', 'leg', 'treeType', 'createdAt'];
  const edgeLines = [edgeCols.join(',')];
  for (const e of edges) {
    edgeLines.push(
      [e.parentBpCode, e.childBpCode, e.leg, e.treeType, e.createdAt.toISOString()]
        .map(escapeCsvCell)
        .join(','),
    );
  }
  const edgesPath = join(outDir, 'genealogy_edges.csv');
  await writeFile(edgesPath, edgeLines.join('\n'), 'utf8');

  console.log('Exported', nodes.length, 'nodes ->', nodesPath);
  console.log('Exported', edges.length, 'edges ->', edgesPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
