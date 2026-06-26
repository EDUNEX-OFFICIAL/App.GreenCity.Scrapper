import { getPrisma } from './client.js';

export interface ScrapedDataCounts {
  scrapeRuns: number;
  rawRows: number;
  genealogyNodes: number;
  genealogyEdges: number;
  scrapeFailures: number;
  bpSessions: number;
}

export async function getScrapedDataCounts(): Promise<ScrapedDataCounts> {
  const prisma = getPrisma();
  const [scrapeRuns, rawRows, genealogyNodes, genealogyEdges, scrapeFailures, bpSessions] =
    await Promise.all([
      prisma.scrapeRun.count(),
      prisma.rawModuleRow.count(),
      prisma.genealogyNode.count(),
      prisma.genealogyEdge.count(),
      prisma.scrapeFailure.count(),
      prisma.bpSession.count(),
    ]);
  return { scrapeRuns, rawRows, genealogyNodes, genealogyEdges, scrapeFailures, bpSessions };
}

export async function cancelActiveScrapeRuns(): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.scrapeRun.updateMany({
    where: { status: { in: ['pending', 'running'] } },
    data: { status: 'cancelled', finishedAt: new Date() },
  });
  return result.count;
}

const GENEALOGY_MODULE_KEYS = ['genealogy_batch', 'genealogy_bp', 'bp_harvest'] as const;

export async function cancelGenealogyScrapeRuns(): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.scrapeRun.updateMany({
    where: {
      moduleKey: { in: [...GENEALOGY_MODULE_KEYS] },
      status: { in: ['pending', 'running'] },
    },
    data: { status: 'cancelled', finishedAt: new Date() },
  });
  return result.count;
}

export async function cancelModuleScrapeRuns(moduleKey: string): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.scrapeRun.updateMany({
    where: {
      moduleKey,
      status: { in: ['pending', 'running'] },
    },
    data: { status: 'cancelled', finishedAt: new Date() },
  });
  return result.count;
}

/** Delete all scraped ingest data for a fresh start. Keeps module schedules. */
export async function resetAllScrapedData(): Promise<ScrapedDataCounts> {
  const prisma = getPrisma();
  const before = await getScrapedDataCounts();

  await prisma.$transaction([
    prisma.genealogyEdge.deleteMany(),
    prisma.genealogyNode.deleteMany(),
    prisma.scrapeFailure.deleteMany(),
    prisma.rawModuleRow.deleteMany(),
    prisma.scrapeRun.deleteMany(),
    prisma.bpSession.deleteMany(),
    prisma.backfillProgress.deleteMany(),
  ]);

  return before;
}
