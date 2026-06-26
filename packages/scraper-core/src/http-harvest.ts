import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';
import type { GenealogyLeg, GenealogyModalData, GenealogyNodeRef, GenealogyScrapeResult } from '@greencity/shared';
import { createLogger, loadConfig } from '@greencity/shared';
import type { CapturedRequest } from './network-capture.js';
import {
  buildGenealogyResultFromDtreeHtml,
  fetchGenealogyHtmlPage,
} from './genealogy-html-harvest.js';
import { loginBpViaHttp } from './http-bp-login.js';

const log = createLogger('http-harvest');

let httpDispatcherReady = false;

function ensureHttpDispatcher(): void {
  if (httpDispatcherReady) return;
  const connections = Number.parseInt(process.env.GENEALOGY_HTTP_CONNECTIONS ?? '200', 10);
  setGlobalDispatcher(
    new Agent({
      connections: Number.isFinite(connections) ? connections : 200,
      pipelining: 1,
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 120_000,
    }),
  );
  httpDispatcherReady = true;
}

export function isHttpGenealogyHtmlEnabled(): boolean {
  return process.env.GENEALOGY_HTTP_HTML === 'true';
}

export function isHttpGenealogyConfigured(): boolean {
  return Boolean(process.env.GENEALOGY_HTTP_TREE_URL?.trim()) || isHttpGenealogyHtmlEnabled();
}

export function isHttpGenealogyOnly(): boolean {
  return process.env.GENEALOGY_HTTP_ONLY === 'true' && isHttpGenealogyConfigured();
}

export function getGenealogyWorkerConcurrency(): number {
  if (isHttpGenealogyOnly()) {
    const http = Number.parseInt(process.env.GENEALOGY_HTTP_CONCURRENCY ?? '150', 10);
    return Number.isFinite(http) ? http : 150;
  }
  return Number.parseInt(process.env.GENEALOGY_CONCURRENCY ?? '50', 10);
}

export interface HttpHarvestConfig {
  treeEndpointUrl?: string;
  cookieHeader?: string;
  password?: string;
}

export async function cookieHeaderFromStorageState(storageStatePath: string): Promise<string | null> {
  try {
    const raw = await readFile(storageStatePath, 'utf8');
    const state = JSON.parse(raw) as { cookies?: Array<{ name: string; value: string }> };
    if (!state.cookies?.length) return null;
    return state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return null;
  }
}

async function resolveCookieHeader(bpCode: string, config: HttpHarvestConfig): Promise<string | null> {
  if (config.cookieHeader) return config.cookieHeader;
  if (process.env.GENEALOGY_HTTP_COOKIE) return process.env.GENEALOGY_HTTP_COOKIE;

  const cfg = loadConfig();
  const fromState = await cookieHeaderFromStorageState(join(cfg.storageStateDir, `bp-${bpCode}.json`));
  if (fromState) return fromState;

  if (config.password) {
    return loginBpViaHttp(bpCode, config.password);
  }
  return null;
}

function resolveEndpointUrl(
  bpCode: string,
  treeType: 'sponsor' | 'binary',
  config: HttpHarvestConfig,
): string | null {
  const template = config.treeEndpointUrl ?? process.env.GENEALOGY_HTTP_TREE_URL;
  if (!template) return null;
  return template.replaceAll('{bpCode}', encodeURIComponent(bpCode)).replaceAll('{treeType}', treeType);
}

/**
 * Rank captured XHR/fetch calls that likely return tree JSON (Phase 9 discovery helper).
 */
export function suggestGenealogyHttpEndpoints(captures: CapturedRequest[]): string[] {
  const suggestions: string[] = [];
  for (const c of captures) {
    if (c.status !== 200) continue;
    const preview = c.responsePreview ?? '';
    const contentType = c.responseContentType ?? '';
    const looksJson =
      contentType.includes('json') ||
      preview.trimStart().startsWith('{') ||
      preview.trimStart().startsWith('[');
    const treeRelated =
      /tree|genealogy|orgchart|sponsor|binary|member|team/i.test(c.url) ||
      /tree|genealogy|orgchart|sponsor|binary/i.test(c.phase);
    if (looksJson && treeRelated) {
      suggestions.push(`${c.phase}: ${c.method} ${c.url}`);
    }
  }
  return suggestions;
}

async function fetchGenealogyViaHttpHtml(
  bpCode: string,
  treeType: 'sponsor' | 'binary',
  config: HttpHarvestConfig = {},
): Promise<GenealogyScrapeResult | null> {
  try {
    ensureHttpDispatcher();

    let cookie = await resolveCookieHeader(bpCode, config);
    let html = cookie ? await fetchGenealogyHtmlPage(cookie, treeType) : null;

    // Stale cached cookies often return 404 — force fresh login when password is available.
    if (!html && config.password) {
      cookie = await loginBpViaHttp(bpCode, config.password);
      if (cookie) html = await fetchGenealogyHtmlPage(cookie, treeType);
    }

    if (!html) {
      if (!cookie) log.debug({ bpCode }, 'No HTTP cookie available — HTML harvest skipped');
      return null;
    }

    const normalized = buildGenealogyResultFromDtreeHtml(html, bpCode, treeType);
    if (!normalized) {
      log.warn({ bpCode, treeType }, 'HTML dtree response not recognized');
      return null;
    }

    log.info({ bpCode, treeType, source: 'html' }, 'HTTP HTML harvest parsed');
    return normalized;
  } catch (err) {
    log.warn(
      { bpCode, treeType, err: err instanceof Error ? err.message : String(err) },
      'HTTP HTML harvest error',
    );
    return null;
  }
}

/**
 * HTTP harvest — JSON endpoint (GENEALOGY_HTTP_TREE_URL) or HTML dtree (GENEALOGY_HTTP_HTML).
 * Returns null when endpoint/cookie unavailable or response cannot be parsed.
 */
export async function fetchGenealogyViaHttp(
  bpCode: string,
  treeType: 'sponsor' | 'binary',
  config: HttpHarvestConfig = {},
): Promise<GenealogyScrapeResult | null> {
  if (isHttpGenealogyHtmlEnabled() && !resolveEndpointUrl(bpCode, treeType, config)) {
    return fetchGenealogyViaHttpHtml(bpCode, treeType, config);
  }

  const endpoint = resolveEndpointUrl(bpCode, treeType, config);
  if (!endpoint) {
    log.debug('GENEALOGY_HTTP_TREE_URL not set — HTTP harvest skipped');
    return null;
  }

  const cookie = await resolveCookieHeader(bpCode, config);
  if (!cookie) {
    log.debug({ bpCode }, 'No HTTP cookie available — HTTP harvest skipped');
    return null;
  }

  try {
    ensureHttpDispatcher();
    const res = await fetch(endpoint, {
      headers: {
        Cookie: cookie,
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (!res.ok) {
      log.warn({ endpoint, status: res.status }, 'HTTP harvest request failed — falling back to Playwright');
      return null;
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      log.warn({ endpoint }, 'HTTP response is not JSON — falling back to Playwright');
      return null;
    }

    const normalized = normalizeHttpTreeResponse(bpCode, treeType, parsed);
    if (!normalized) {
      log.warn({ endpoint, bpCode, treeType }, 'HTTP response shape not recognized — falling back to Playwright');
      return null;
    }

    log.info({ bpCode, treeType, endpoint }, 'HTTP harvest response parsed');
    return normalized;
  } catch (err) {
    log.warn(
      { bpCode, treeType, err: err instanceof Error ? err.message : String(err) },
      'HTTP harvest error — falling back to Playwright',
    );
    return null;
  }
}

function parseChildNode(raw: unknown): GenealogyNodeRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const bpCode = String(
    obj.bpCode ?? obj.BPCode ?? obj.code ?? obj.Code ?? obj.memberId ?? obj.MemberId ?? obj.id ?? '',
  ).trim();
  if (!bpCode) return null;
  const bpName = obj.bpName ?? obj.BPName ?? obj.name ?? obj.Name ?? obj.label ?? obj.Label;
  return {
    bpCode,
    bpName: bpName ? String(bpName) : undefined,
    label: obj.label ? String(obj.label) : undefined,
  };
}

function extractChildren(data: unknown): GenealogyNodeRef[] {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;

  const candidates = [
    obj.children,
    obj.Children,
    obj.nodes,
    obj.Nodes,
    obj.items,
    obj.Items,
    (obj.data as Record<string, unknown> | undefined)?.children,
    (obj.Data as Record<string, unknown> | undefined)?.children,
    (obj.d as Record<string, unknown> | undefined)?.children,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(parseChildNode).filter((n): n is GenealogyNodeRef => n !== null);
    }
  }

  if (Array.isArray(data)) {
    return data.map(parseChildNode).filter((n): n is GenealogyNodeRef => n !== null);
  }

  return [];
}

function extractModal(data: unknown): GenealogyModalData {
  if (!data || typeof data !== 'object') return {};
  const obj = data as Record<string, unknown>;
  const modal =
    (obj.modal as Record<string, string> | undefined) ??
    (obj.Modal as Record<string, string> | undefined) ??
    (obj.node as Record<string, string> | undefined) ??
    (obj.root as Record<string, string> | undefined);
  if (modal && typeof modal === 'object') return modal as GenealogyModalData;
  return {};
}


function normalizeHttpTreeResponse(
  bpCode: string,
  treeType: 'sponsor' | 'binary',
  data: unknown,
): GenealogyScrapeResult | null {
  if (!data || typeof data !== 'object') return null;

  const rawChildren = extractChildren(data);
  const children: GenealogyNodeRef[] =
    treeType === 'binary'
      ? rawChildren.slice(0, 2).map((c, idx) => ({
          ...c,
          leg: (idx === 0 ? 'left' : 'right') as GenealogyLeg,
        }))
      : rawChildren.map((c) => ({ ...c, leg: 'sponsor' as GenealogyLeg }));

  const modalData = enrichModalWithLegChildren(extractModal(data), children);
  const rootBpCode = bpCode;

  return {
    nodes: [
      {
        bpCode: rootBpCode,
        treeType,
        modalData,
        children,
      },
    ],
    edges: children.map((child) => ({
      parentBpCode: rootBpCode,
      childBpCode: child.bpCode,
      treeType,
      leg: child.leg ?? (treeType === 'sponsor' ? 'sponsor' : 'unknown'),
    })),
  };
}

function enrichModalWithLegChildren(
  modalData: GenealogyModalData,
  children: GenealogyNodeRef[],
): GenealogyModalData {
  const left = children.find((c) => c.leg === 'left');
  const right = children.find((c) => c.leg === 'right');
  return {
    ...modalData,
    leftChildBpCode: left?.bpCode ?? modalData.leftChildBpCode,
    leftChildName: left?.bpName ?? modalData.leftChildName,
    rightChildBpCode: right?.bpCode ?? modalData.rightChildBpCode,
    rightChildName: right?.bpName ?? modalData.rightChildName,
  };
}

/** Sponsor + binary trees via HTTP. Returns partial result when one tree succeeds. */
export async function fetchBothGenealogyViaHttp(
  bpCode: string,
  config: HttpHarvestConfig = {},
): Promise<GenealogyScrapeResult | null> {
  if (!isHttpGenealogyConfigured()) return null;

  const [sponsor, binary] = await Promise.all([
    fetchGenealogyViaHttp(bpCode, 'sponsor', config),
    fetchGenealogyViaHttp(bpCode, 'binary', config),
  ]);

  if (!sponsor && !binary) return null;

  return {
    nodes: [...(sponsor?.nodes ?? []), ...(binary?.nodes ?? [])],
    edges: [...(sponsor?.edges ?? []), ...(binary?.edges ?? [])],
  };
}

export function compareHarvestResults(
  playwright: GenealogyScrapeResult,
  http: GenealogyScrapeResult,
): { match: boolean; differences: string[] } {
  const differences: string[] = [];
  if (playwright.nodes.length !== http.nodes.length) {
    differences.push(`node count: pw=${playwright.nodes.length} http=${http.nodes.length}`);
  }
  if (playwright.edges.length !== http.edges.length) {
    differences.push(`edge count: pw=${playwright.edges.length} http=${http.edges.length}`);
  }
  for (const pwNode of playwright.nodes) {
    const httpNode = http.nodes.find((n) => n.bpCode === pwNode.bpCode && n.treeType === pwNode.treeType);
    if (!httpNode) {
      differences.push(`missing http node ${pwNode.bpCode}/${pwNode.treeType}`);
      continue;
    }
    if (pwNode.children.length !== httpNode.children.length) {
      differences.push(
        `children count ${pwNode.bpCode}/${pwNode.treeType}: pw=${pwNode.children.length} http=${httpNode.children.length}`,
      );
    }
  }
  return { match: differences.length === 0, differences };
}
