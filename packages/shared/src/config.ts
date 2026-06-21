export interface AppConfig {
  databaseUrl: string;
  redisUrl: string;
  erpBaseUrl: string;
  adminUsername: string;
  adminPassword: string;
  bpUsername: string;
  bpPassword: string;
  playwrightHeadless: boolean;
  scraperConcurrency: number;
  scraperDelayMs: number;
  genealogyConcurrency: number;
  genealogyBpOrder: string;
  storageStateDir: string;
  failureHtmlDir: string;
  dashboardPassword: string;
  port: number;
}

export function loadConfig(): AppConfig {
  return {
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
    erpBaseUrl: (process.env.ERP_BASE_URL ?? 'http://app.greencity.org.in').replace(/\/$/, ''),
    adminUsername: process.env.ADMIN_USERNAME ?? '',
    adminPassword: process.env.ADMIN_PASSWORD ?? '',
    bpUsername: process.env.BP_USERNAME ?? '',
    bpPassword: process.env.BP_PASSWORD ?? '',
    playwrightHeadless: (process.env.PLAYWRIGHT_HEADLESS ?? 'true') !== 'false',
    scraperConcurrency: Number.parseInt(process.env.SCRAPER_CONCURRENCY ?? '2', 10),
    scraperDelayMs: Number.parseInt(process.env.SCRAPER_DELAY_MS ?? '1500', 10),
    genealogyConcurrency: Number.parseInt(process.env.GENEALOGY_CONCURRENCY ?? '15', 10),
    genealogyBpOrder: process.env.GENEALOGY_BP_ORDER ?? 'leaf_first',
    storageStateDir: process.env.STORAGE_STATE_DIR ?? './.data/sessions',
    failureHtmlDir: process.env.FAILURE_HTML_DIR ?? './.data/failures',
    dashboardPassword: process.env.DASHBOARD_PASSWORD ?? '',
    port: Number.parseInt(process.env.PORT ?? '3010', 10),
  };
}

export function adminUrl(base: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized.startsWith('/_admin')) return `${base}${normalized}`;
  return `${base}/_admin${normalized}`;
}

export function bpUrl(base: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized.startsWith('/_bp')) return `${base}${normalized}`;
  return `${base}/_bp${normalized}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jitteredDelay(baseMs: number): Promise<void> {
  const jitter = Math.floor(Math.random() * (baseMs * 0.3));
  return sleep(baseMs + jitter);
}
