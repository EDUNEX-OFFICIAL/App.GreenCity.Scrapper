import type { GenealogyModalData } from '@greencity/shared';
import { getPrisma } from './client.js';

export interface PreviewRow {
  columns: string[];
  values: Record<string, string | number | null>;
  meta: {
    source: 'genealogy_node' | 'raw_module_row';
    moduleKey?: string;
    bpCode?: string | null;
    scrapedAt?: string | null;
    totalRows: number;
  };
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function flattenGenealogyNode(node: {
  bpCode: string;
  bpName: string | null;
  uid: string | null;
  treeType: string;
  scrapedAt: Date;
  scrapeStatus: string;
  scrapeError: string | null;
  modalData: unknown;
  childrenJson: unknown;
}): Record<string, string | number | null> {
  const modal = (node.modalData ?? {}) as GenealogyModalData;
  const children = (Array.isArray(node.childrenJson) ? node.childrenJson : []) as Array<{
    bpCode?: string;
    bpName?: string;
    leg?: string;
  }>;
  const leftChild = children.find((c) => c.leg === 'left');
  const rightChild = children.find((c) => c.leg === 'right');
  const row: Record<string, string | number | null> = {
    scrapeStatus: node.scrapeStatus,
    scrapeError: node.scrapeError,
    bpCode: node.bpCode,
    bpName: node.bpName,
    uid: node.uid,
    treeType: node.treeType,
    scrapedAt: node.scrapedAt.toISOString(),
    childrenCount: children.length,
    position: modal.position ?? null,
    leftPoint: modal.leftPoint ?? null,
    rightPoint: modal.rightPoint ?? null,
    selfPoint: modal.selfPoint ?? null,
    leftChildBpCode: modal.leftChildBpCode ?? leftChild?.bpCode ?? null,
    leftChildName: modal.leftChildName ?? leftChild?.bpName ?? null,
    rightChildBpCode: modal.rightChildBpCode ?? rightChild?.bpCode ?? null,
    rightChildName: modal.rightChildName ?? rightChild?.bpName ?? null,
    sponsorBpId: modal.sponsorBpId ?? null,
    sponsorName: modal.sponsorName ?? null,
    percentage: modal.percentage ?? null,
    totalMembers: modal.totalMembers ?? null,
    selfBusiness: modal.selfBusiness ?? null,
    totalBusiness: modal.totalBusiness ?? null,
    registeredAt: modal.registeredAt ?? null,
    statusDate: modal.statusDate ?? null,
    plotStatus: modal.plotStatus ?? null,
  };
  if (modal.raw && typeof modal.raw === 'object') {
    for (const [k, v] of Object.entries(modal.raw)) {
      if (!(k in row)) row[k] = asString(v);
    }
  }
  return row;
}

export async function getLatestScrapePreview(): Promise<PreviewRow | null> {
  const prisma = getPrisma();

  const [latestNode, nodeTotal] = await Promise.all([
    prisma.genealogyNode.findFirst({ orderBy: { scrapedAt: 'desc' } }),
    prisma.genealogyNode.count(),
  ]);

  if (latestNode) {
    const values = flattenGenealogyNode(latestNode);
    return {
      columns: Object.keys(values),
      values,
      meta: {
        source: 'genealogy_node',
        bpCode: latestNode.bpCode,
        scrapedAt: latestNode.scrapedAt.toISOString(),
        totalRows: nodeTotal,
      },
    };
  }

  const [latestRaw, rawTotal] = await Promise.all([
    prisma.rawModuleRow.findFirst({ orderBy: { lastSeenAt: 'desc' } }),
    prisma.rawModuleRow.count(),
  ]);

  if (!latestRaw) return null;

  const data = latestRaw.rowJson as Record<string, unknown>;
  const values: Record<string, string | number | null> = {
    scrapeStatus: latestRaw.scrapeStatus,
    scrapeError: latestRaw.scrapeError,
    failedRef: latestRaw.failedRef,
  };
  for (const [k, v] of Object.entries(data)) {
    if (k === 'Status') continue;
    values[k] = asString(v);
  }

  return {
    columns: Object.keys(values),
    values,
    meta: {
      source: 'raw_module_row',
      moduleKey: latestRaw.moduleKey,
      bpCode: latestRaw.bpCode,
      scrapedAt: latestRaw.lastSeenAt.toISOString(),
      totalRows: rawTotal,
    },
  };
}
