import { getPrisma } from './client.js';

export interface ModuleDeleteResult {
  rawRows: number;
  scrapeRuns: number;
  scrapeFailures: number;
}

export interface GenealogyDeleteResult {
  nodes: number;
  edges: number;
  scrapeRuns: number;
  bpSessions: number;
}

export async function getModuleDataCount(moduleKey: string): Promise<number> {
  const prisma = getPrisma();
  return prisma.rawModuleRow.count({ where: { moduleKey } });
}

export async function deleteModuleData(moduleKey: string): Promise<ModuleDeleteResult> {
  const prisma = getPrisma();

  const runIds = (
    await prisma.scrapeRun.findMany({
      where: { moduleKey },
      select: { id: true },
    })
  ).map((r) => r.id);

  const [rawRows, scrapeRuns, scrapeFailures] = await prisma.$transaction([
    prisma.rawModuleRow.deleteMany({ where: { moduleKey } }),
    prisma.scrapeRun.deleteMany({ where: { moduleKey } }),
    runIds.length > 0
      ? prisma.scrapeFailure.deleteMany({ where: { scrapeRunId: { in: runIds } } })
      : prisma.scrapeFailure.deleteMany({ where: { moduleKey } }),
  ]);

  return {
    rawRows: rawRows.count,
    scrapeRuns: scrapeRuns.count,
    scrapeFailures: scrapeFailures.count,
  };
}

export async function getGenealogyDataCounts(): Promise<{ nodes: number; edges: number }> {
  const prisma = getPrisma();
  const [nodes, edges] = await Promise.all([
    prisma.genealogyNode.count(),
    prisma.genealogyEdge.count(),
  ]);
  return { nodes, edges };
}

export async function deleteGenealogyData(): Promise<GenealogyDeleteResult> {
  const prisma = getPrisma();

  const genealogyRunIds = (
    await prisma.scrapeRun.findMany({
      where: { moduleKey: { in: ['genealogy_bp', 'genealogy_batch', 'bp_harvest'] } },
      select: { id: true },
    })
  ).map((r) => r.id);

  const [edges, nodes, scrapeRuns, bpSessions, failures] = await prisma.$transaction([
    prisma.genealogyEdge.deleteMany(),
    prisma.genealogyNode.deleteMany(),
    prisma.scrapeRun.deleteMany({
      where: { moduleKey: { in: ['genealogy_bp', 'genealogy_batch', 'bp_harvest'] } },
    }),
    prisma.bpSession.deleteMany(),
    genealogyRunIds.length > 0
      ? prisma.scrapeFailure.deleteMany({ where: { scrapeRunId: { in: genealogyRunIds } } })
      : prisma.scrapeFailure.deleteMany({
          where: { moduleKey: { in: ['genealogy_bp', 'genealogy_batch', 'bp_harvest'] } },
        }),
  ]);

  return {
    nodes: nodes.count,
    edges: edges.count,
    scrapeRuns: scrapeRuns.count,
    bpSessions: bpSessions.count,
  };
}

export async function getAllModuleRowCounts(): Promise<Record<string, number>> {
  const prisma = getPrisma();
  const groups = await prisma.rawModuleRow.groupBy({
    by: ['moduleKey'],
    _count: { id: true },
  });
  const out: Record<string, number> = {};
  for (const g of groups) out[g.moduleKey] = g._count.id;
  return out;
}
