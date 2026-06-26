import type { Job } from 'bullmq';
import { getGenealogyQueue, getGenealogyQueueCounts } from './genealogy-queue.js';
import { getBpHarvestQueue, getBpHarvestQueueCounts } from './harvest-queue.js';
import { getScrapeQueue } from './index.js';

type ModuleJobData = { moduleKey?: string };

async function removeMatchingJobs(
  jobs: Job[],
  match?: (data: ModuleJobData) => boolean,
): Promise<number> {
  let removedJobs = 0;
  for (const job of jobs) {
    const data = (job.data ?? {}) as ModuleJobData;
    if (match && !match(data)) continue;
    try {
      await job.remove();
      removedJobs++;
    } catch {
      try {
        await job.discard();
        removedJobs++;
      } catch {
        // Active job may still be locked by a worker until it exits.
      }
    }
  }
  return removedJobs;
}

async function drainQueueJobs(
  q: ReturnType<typeof getScrapeQueue>,
  match?: (data: ModuleJobData) => boolean,
): Promise<number> {
  const jobs = await q.getJobs(['active', 'waiting', 'delayed'], 0, 5000);
  return removeMatchingJobs(jobs, match);
}

export async function isGenealogyScrapePaused(): Promise<boolean> {
  const [genealogy, harvest] = await Promise.all([
    getGenealogyQueue().isPaused(),
    getBpHarvestQueue().isPaused(),
  ]);
  return genealogy || harvest;
}

export async function isAdminScrapePaused(): Promise<boolean> {
  return getScrapeQueue().isPaused();
}

export async function pauseGenealogyScrape(): Promise<void> {
  await Promise.all([getGenealogyQueue().pause(), getBpHarvestQueue().pause()]);
}

export async function resumeGenealogyScrape(): Promise<void> {
  await Promise.all([getGenealogyQueue().resume(), getBpHarvestQueue().resume()]);
}

export async function pauseAdminScrape(): Promise<void> {
  await getScrapeQueue().pause();
}

export async function resumeAdminScrape(): Promise<void> {
  await getScrapeQueue().resume();
}

/** Pause admin queue and remove waiting/delayed/active jobs. */
export async function stopAdminScrape(): Promise<{ removedJobs: number }> {
  const q = getScrapeQueue();
  await q.pause();
  const cleaned = (
    await Promise.all([
      q.clean(0, 1_000_000, 'waiting'),
      q.clean(0, 1_000_000, 'delayed'),
    ])
  ).flat();
  const interrupted = await drainQueueJobs(q);
  return { removedJobs: cleaned.length + interrupted };
}

/** Stop one admin module — pause queue and remove its queued/active jobs. */
export async function stopAdminModuleScrape(moduleKey: string): Promise<{ removedJobs: number }> {
  const q = getScrapeQueue();
  await q.pause();
  const removedJobs = await drainQueueJobs(q, (data) => data.moduleKey === moduleKey);
  return { removedJobs };
}

/** Pause genealogy queues and remove waiting/delayed/active jobs. */
export async function stopGenealogyScrape(): Promise<{ removedJobs: number }> {
  const genealogyQ = getGenealogyQueue();
  const harvestQ = getBpHarvestQueue();
  await Promise.all([genealogyQ.pause(), harvestQ.pause()]);

  const cleaned = (
    await Promise.all([
      genealogyQ.clean(0, 1_000_000, 'waiting'),
      genealogyQ.clean(0, 1_000_000, 'delayed'),
      harvestQ.clean(0, 1_000_000, 'waiting'),
      harvestQ.clean(0, 1_000_000, 'delayed'),
    ])
  ).flat();

  const genealogyJobs = await genealogyQ.getJobs(['active', 'waiting', 'delayed'], 0, 5000);
  const harvestJobs = await harvestQ.getJobs(['active', 'waiting', 'delayed'], 0, 5000);
  const interrupted =
    (await removeMatchingJobs(genealogyJobs)) + (await removeMatchingJobs(harvestJobs));

  return { removedJobs: cleaned.length + interrupted };
}

export async function getScrapeControlStatus(): Promise<{
  genealogyPaused: boolean;
  adminPaused: boolean;
  genealogyQueue: Awaited<ReturnType<typeof getGenealogyQueueCounts>>;
  harvestQueue: Awaited<ReturnType<typeof getBpHarvestQueueCounts>>;
}> {
  const [genealogyPaused, adminPaused, genealogyQueue, harvestQueue] = await Promise.all([
    isGenealogyScrapePaused(),
    isAdminScrapePaused(),
    getGenealogyQueueCounts(),
    getBpHarvestQueueCounts(),
  ]);
  return { genealogyPaused, adminPaused, genealogyQueue, harvestQueue };
}
