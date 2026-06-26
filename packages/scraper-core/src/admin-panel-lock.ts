import type { Locator, Page } from 'playwright';

function adminPanelSlots(): number {
  const raw = process.env.GENEALOGY_ADMIN_PANEL_SLOTS ?? process.env.GENEALOGY_CONCURRENCY ?? '12';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 12;
}

let activeSlots = 0;
const waitQueue: Array<() => void> = [];

async function acquireAdminPanelSlot(): Promise<void> {
  if (activeSlots < adminPanelSlots()) {
    activeSlots += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
  activeSlots += 1;
}

function releaseAdminPanelSlot(): void {
  activeSlots = Math.max(0, activeSlots - 1);
  const next = waitQueue.shift();
  if (next) next();
}

/** Limit parallel admin BP List → Settings → Panel opens (N slots, not global serial). */
export async function withAdminPanelLock<T>(fn: () => Promise<T>): Promise<T> {
  await acquireAdminPanelSlot();
  try {
    return await fn();
  } finally {
    releaseAdminPanelSlot();
  }
}

/** Find a BP list grid row whose cells contain bpCode (case-insensitive). */
export async function findBpListRow(page: Page, bpCode: string): Promise<Locator | null> {
  const rows = page.locator('table[id*="GridView"] tr').filter({ has: page.locator('td') });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const count = await rows.count();
      const codeLower = bpCode.toLowerCase();
      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const text = ((await row.innerText().catch(() => '')) ?? '').toLowerCase();
        if (text.includes(codeLower)) return row;
      }
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Execution context was destroyed') || attempt === 2) throw err;
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
  }
  return null;
}
