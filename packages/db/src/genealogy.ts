import { Prisma } from '@prisma/client';
import type { GenealogyLeg, GenealogyModalData, GenealogyNodeRef, GenealogyTreeType } from '@greencity/shared';
import { getPrisma } from './client.js';

export interface BpListEntry {
  bpCode: string;
  bpName?: string;
  uid?: string;
  uidNum?: number;
  password?: string;
  sponsorBpId?: string;
}

const DEFAULT_DEFER_BP_CODES = [
  'vistaar',
  'vistaarcity01',
  'vistaarcity02',
  'vistaarcity03',
  'vistaar03',
  'sbtpl010',
  'sbtpl011',
];

function parseDeferCodes(): Set<string> {
  const raw = process.env.GENEALOGY_DEFER_BP_CODES ?? DEFAULT_DEFER_BP_CODES.join(',');
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function loadAllBpListEntries(): Promise<BpListEntry[]> {
  const prisma = getPrisma();
  const rows = await prisma.rawModuleRow.findMany({
    where: { moduleKey: 'bp_list', portal: 'admin', scrapeStatus: 'ok' },
    select: { rowJson: true, lastSeenAt: true },
    orderBy: { lastSeenAt: 'desc' },
  });

  const seen = new Map<string, BpListEntry>();
  for (const row of rows) {
    const data = row.rowJson as Record<string, string>;
    const bpCode = data['BP ID']?.trim();
    if (!bpCode || /^\d+$/.test(bpCode) || bpCode === '>>' || bpCode === '...') continue;
    if (/&nbsp;|&#\d+;|<[^>]+>/i.test(bpCode)) continue;
    if (!/[a-zA-Z0-9]/.test(bpCode) || bpCode.length < 3) continue;
    const uid = data.UID?.trim();
    if (!uid) continue;
    if (!seen.has(uid)) {
      const uidNum = Number.parseInt(uid, 10);
      seen.set(uid, {
        bpCode,
        bpName: data.Name?.trim() || undefined,
        uid,
        uidNum: Number.isFinite(uidNum) ? uidNum : undefined,
        password: data.Password?.trim() || undefined,
        sponsorBpId: data['Sponsor BP ID']?.trim() || undefined,
      });
    }
  }
  return [...seen.values()];
}

export async function getDistinctBpListEntries(): Promise<BpListEntry[]> {
  const entries = await loadAllBpListEntries();
  return entries.sort((a, b) => a.bpCode.localeCompare(b.bpCode));
}

/**
 * BP list ordered for genealogy scraping: leaves/newer BPs first, root Vistaar last.
 * Default: leaf_first — sort by UID descending (UID 1 Vistaar at tail), defer known root codes.
 */
export async function getBpListEntriesForGenealogy(): Promise<BpListEntry[]> {
  const order = process.env.GENEALOGY_BP_ORDER ?? 'leaf_first';
  const entries = await loadAllBpListEntries();
  const deferCodes = parseDeferCodes();
  const sponsorRefCount = new Map<string, number>();

  for (const e of entries) {
    const sponsor = e.sponsorBpId?.trim();
    if (!sponsor) continue;
    sponsorRefCount.set(sponsor.toLowerCase(), (sponsorRefCount.get(sponsor.toLowerCase()) ?? 0) + 1);
  }

  const isDeferred = (bp: BpListEntry) => deferCodes.has(bp.bpCode.toLowerCase());
  const sorted = [...entries].sort((a, b) => {
    const aDefer = isDeferred(a) ? 1 : 0;
    const bDefer = isDeferred(b) ? 1 : 0;
    if (aDefer !== bDefer) return aDefer - bDefer;
    if (order === 'forward') return a.bpCode.localeCompare(b.bpCode);
    if (order === 'reverse') return b.bpCode.localeCompare(a.bpCode);
    const aUid = a.uidNum ?? 0;
    const bUid = b.uidNum ?? 0;
    if (aUid !== bUid) return bUid - aUid;
    const aRefs = sponsorRefCount.get(a.bpCode.toLowerCase()) ?? 0;
    const bRefs = sponsorRefCount.get(b.bpCode.toLowerCase()) ?? 0;
    if (aRefs !== bRefs) return aRefs - bRefs;
    return b.bpCode.localeCompare(a.bpCode);
  });
  return sorted;
}

/** UIDs with both sponsor and binary genealogy nodes already scraped. */
export async function getCompletedBpUids(): Promise<Set<string>> {
  const prisma = getPrisma();
  const nodes = await prisma.genealogyNode.findMany({
    where: { scrapeStatus: 'ok' },
    select: { uid: true, treeType: true },
  });
  const byUid = new Map<string, Set<string>>();
  for (const n of nodes) {
    if (!byUid.has(n.uid)) byUid.set(n.uid, new Set());
    byUid.get(n.uid)!.add(n.treeType);
  }
  const done = new Set<string>();
  for (const [uid, trees] of byUid) {
    if (trees.has('sponsor') && trees.has('binary')) done.add(uid);
  }
  return done;
}

/** @deprecated Use getCompletedBpUids — returns completed UIDs (not bpCodes). */
export async function getCompletedBpCodes(): Promise<Set<string>> {
  return getCompletedBpUids();
}

/** BPs from bp_list missing sponsor and/or binary genealogy nodes. */
export async function getIncompleteGenealogyBpCodes(): Promise<BpListEntry[]> {
  const [allBps, completedSet] = await Promise.all([
    getBpListEntriesForGenealogy(),
    getCompletedBpUids(),
  ]);
  return allBps.filter((bp) => !bp.uid || !completedSet.has(bp.uid));
}

/** Sponsor BP IDs referenced in bp_list but missing as their own BP row. */
export async function getMissingSponsorBpCodes(): Promise<string[]> {
  const entries = await loadAllBpListEntries();
  const knownBpCodes = new Set(entries.map((e) => e.bpCode.toLowerCase()));
  const sponsors = new Set<string>();

  for (const e of entries) {
    const sponsor = e.sponsorBpId?.trim();
    if (!sponsor || sponsor === '>>' || sponsor === '...') continue;
    if (/&nbsp;|&#\d+;|<[^>]+>/i.test(sponsor)) continue;
    if (!/[a-zA-Z0-9]/.test(sponsor) || sponsor.length < 3) continue;
    if (!knownBpCodes.has(sponsor.toLowerCase())) {
      sponsors.add(sponsor);
    }
  }

  return [...sponsors].sort((a, b) => a.localeCompare(b));
}

/** BPs with at least one failed genealogy node (sponsor/binary scrape error). */
export async function getFailedGenealogyBpCodes(): Promise<Set<string>> {
  const prisma = getPrisma();
  const rows = await prisma.genealogyNode.findMany({
    where: { scrapeStatus: 'failed' },
    select: { bpCode: true },
    distinct: ['bpCode'],
  });
  return new Set(rows.map((r) => r.bpCode));
}

/** Remove genealogy nodes/edges for specific UIDs (retry prep). */
export async function deleteGenealogyForUids(uids: string[]): Promise<{ nodes: number; edges: number }> {
  if (uids.length === 0) return { nodes: 0, edges: 0 };
  const prisma = getPrisma();
  const nodes = await prisma.genealogyNode.findMany({
    where: { uid: { in: uids } },
    select: { bpCode: true },
  });
  const bpCodes = [...new Set(nodes.map((n) => n.bpCode))];
  const [edges, deletedNodes] = await prisma.$transaction([
    prisma.genealogyEdge.deleteMany({
      where: {
        OR: [
          { parentBpCode: { in: bpCodes } },
          { childBpCode: { in: bpCodes } },
        ],
      },
    }),
    prisma.genealogyNode.deleteMany({ where: { uid: { in: uids } } }),
  ]);
  return { nodes: deletedNodes.count, edges: edges.count };
}

/** Remove genealogy nodes/edges and bp_list failure stubs for specific BPs (retry prep). */
export async function deleteGenealogyForBps(bpCodes: string[]): Promise<{ nodes: number; edges: number }> {
  if (bpCodes.length === 0) return { nodes: 0, edges: 0 };
  const prisma = getPrisma();
  const failedRefs = bpCodes.map((c) => `bp:${c}`);
  const [edges, nodes] = await prisma.$transaction([
    prisma.genealogyEdge.deleteMany({
      where: {
        OR: [{ parentBpCode: { in: bpCodes } }, { childBpCode: { in: bpCodes } }],
      },
    }),
    prisma.genealogyNode.deleteMany({ where: { bpCode: { in: bpCodes } } }),
  ]);
  await prisma.rawModuleRow.deleteMany({
    where: {
      moduleKey: 'bp_list',
      scrapeStatus: 'failed',
      failedRef: { in: failedRefs },
    },
  });
  return { nodes: nodes.count, edges: edges.count };
}

export async function incrementGenealogyBatchProgress(
  batchRunId: string,
  update: { completed?: number; failed?: number },
): Promise<{ completed: number; failed: number; totalBps: number }> {
  const prisma = getPrisma();
  const batch = await prisma.scrapeRun.findUnique({ where: { id: batchRunId } });
  if (!batch) throw new Error(`Batch run not found: ${batchRunId}`);

  const meta = (batch.metadata ?? {}) as Record<string, number | string | null>;
  const totalBps = (meta.totalBps as number) ?? 0;
  const completed = ((meta.completed as number) ?? 0) + (update.completed ?? 0);
  const failed = ((meta.failed as number) ?? 0) + (update.failed ?? 0);

  await prisma.scrapeRun.update({
    where: { id: batchRunId },
    data: {
      metadata: {
        ...meta,
        totalBps,
        completed,
        failed,
        lastUpdatedAt: new Date().toISOString(),
      },
    },
  });

  if (totalBps > 0 && completed + failed >= totalBps) {
    const { finishScrapeRun } = await import('./upsert.js');
    await finishScrapeRun(batchRunId, {
      status: failed > 0 ? 'partial' : 'completed',
      rowCount: completed,
      rowsInserted: completed,
      rowsUpdated: 0,
      metadata: { ...meta, totalBps, completed, failed, currentBp: null },
    });
  }

  return { completed, failed, totalBps };
}

export async function upsertGenealogyNode(params: {
  bpCode: string;
  bpName?: string;
  uid: string;
  treeType: GenealogyTreeType;
  modalData: GenealogyModalData;
  children: GenealogyNodeRef[];
  scrapeRunId: string;
}) {
  const prisma = getPrisma();
  return prisma.genealogyNode.upsert({
    where: { uid_treeType: { uid: params.uid, treeType: params.treeType } },
    create: {
      bpCode: params.bpCode,
      bpName: params.bpName ?? null,
      uid: params.uid,
      treeType: params.treeType,
      modalData: params.modalData as Prisma.InputJsonValue,
      childrenJson: params.children as unknown as Prisma.InputJsonValue,
      scrapeRunId: params.scrapeRunId,
    },
    update: {
      bpCode: params.bpCode,
      bpName: params.bpName ?? null,
      uid: params.uid,
      modalData: params.modalData as Prisma.InputJsonValue,
      childrenJson: params.children as unknown as Prisma.InputJsonValue,
      scrapeRunId: params.scrapeRunId,
      scrapedAt: new Date(),
    },
  });
}

export async function upsertGenealogyEdge(params: {
  parentBpCode: string;
  childBpCode: string;
  treeType: GenealogyTreeType;
  leg: GenealogyLeg;
  scrapeRunId: string;
}) {
  const prisma = getPrisma();
  return prisma.genealogyEdge.upsert({
    where: {
      parentBpCode_childBpCode_treeType: {
        parentBpCode: params.parentBpCode,
        childBpCode: params.childBpCode,
        treeType: params.treeType,
      },
    },
    create: {
      parentBpCode: params.parentBpCode,
      childBpCode: params.childBpCode,
      treeType: params.treeType,
      leg: params.leg,
      scrapeRunId: params.scrapeRunId,
    },
    update: {
      leg: params.leg,
      scrapeRunId: params.scrapeRunId,
    },
  });
}

export async function upsertBpSession(params: {
  bpCode: string;
  bpName?: string;
  storageStatePath: string;
  source?: 'panel' | 'direct_login';
}) {
  const prisma = getPrisma();
  const source = params.source ?? 'panel';
  return prisma.bpSession.upsert({
    where: { bpCode: params.bpCode },
    create: {
      bpCode: params.bpCode,
      bpName: params.bpName ?? null,
      storageStatePath: params.storageStatePath,
      source,
      lastValidatedAt: new Date(),
    },
    update: {
      bpName: params.bpName ?? null,
      storageStatePath: params.storageStatePath,
      source,
      lastValidatedAt: new Date(),
    },
  });
}

export async function findActiveGenealogyBatch(): Promise<{ id: string } | null> {
  const prisma = getPrisma();
  return prisma.scrapeRun.findFirst({
    where: {
      moduleKey: 'genealogy_batch',
      status: { in: ['pending', 'running'] },
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function countRunningGenealogyBpJobs(): Promise<number> {
  const prisma = getPrisma();
  return prisma.scrapeRun.count({
    where: {
      moduleKey: { in: ['genealogy_bp', 'bp_harvest'] },
      status: 'running',
    },
  });
}

export async function setGenealogyBatchCurrentBp(batchRunId: string, bpCode: string): Promise<void> {
  const prisma = getPrisma();
  const batch = await prisma.scrapeRun.findUnique({ where: { id: batchRunId } });
  if (!batch) return;

  const meta = (batch.metadata ?? {}) as Record<string, number | string | null>;
  const completed = (meta.completed as number) ?? 0;
  const failed = (meta.failed as number) ?? 0;

  await prisma.scrapeRun.update({
    where: { id: batchRunId },
    data: {
      metadata: {
        ...meta,
        currentBp: bpCode,
        index: completed + failed + 1,
        lastUpdatedAt: new Date().toISOString(),
      },
    },
  });
}

export async function upsertGenealogyResults(params: {
  nodes: Array<{
    bpCode: string;
    bpName?: string;
    uid: string;
    treeType: GenealogyTreeType;
    modalData: GenealogyModalData;
    children: GenealogyNodeRef[];
    scrapeRunId: string;
  }>;
  edges: Array<{
    parentBpCode: string;
    childBpCode: string;
    treeType: GenealogyTreeType;
    leg: GenealogyLeg;
    scrapeRunId: string;
  }>;
}): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction([
    ...params.nodes.map((node) =>
      prisma.genealogyNode.upsert({
        where: { uid_treeType: { uid: node.uid, treeType: node.treeType } },
        create: {
          bpCode: node.bpCode,
          bpName: node.bpName ?? null,
          uid: node.uid,
          treeType: node.treeType,
          modalData: node.modalData as Prisma.InputJsonValue,
          childrenJson: node.children as unknown as Prisma.InputJsonValue,
          scrapeRunId: node.scrapeRunId,
          scrapeStatus: 'ok',
        },
        update: {
          bpCode: node.bpCode,
          bpName: node.bpName ?? null,
          uid: node.uid,
          modalData: node.modalData as Prisma.InputJsonValue,
          childrenJson: node.children as unknown as Prisma.InputJsonValue,
          scrapeRunId: node.scrapeRunId,
          scrapedAt: new Date(),
          scrapeStatus: 'ok',
          scrapeError: null,
        },
      }),
    ),
    ...params.edges.map((edge) =>
      prisma.genealogyEdge.upsert({
        where: {
          parentBpCode_childBpCode_treeType: {
            parentBpCode: edge.parentBpCode,
            childBpCode: edge.childBpCode,
            treeType: edge.treeType,
          },
        },
        create: {
          parentBpCode: edge.parentBpCode,
          childBpCode: edge.childBpCode,
          treeType: edge.treeType,
          leg: edge.leg,
          scrapeRunId: edge.scrapeRunId,
        },
        update: {
          leg: edge.leg,
          scrapeRunId: edge.scrapeRunId,
        },
      }),
    ),
  ]);
}
