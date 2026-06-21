import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GenealogyLeg, GenealogyModalData, GenealogyNodeRef, GenealogyScrapeResult } from '@greencity/shared';
import { createLogger, loadConfig } from '@greencity/shared';
import type { CapturedRequest } from './network-capture.js';

const log = createLogger('http-harvest');

export interface HttpHarvestConfig {
  treeEndpointUrl?: string;
  cookieHeader?: string;
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
  return cookieHeaderFromStorageState(join(cfg.storageStateDir, `bp-${bpCode}.json`));
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

/**
 * HTTP harvest — used when GENEALOGY_HTTP_TREE_URL is configured (Phase 10).
 * Returns null when endpoint/cookie unavailable or response cannot be parsed.
 */
export async function fetchGenealogyViaHttp(
  bpCode: string,
  treeType: 'sponsor' | 'binary',
  config: HttpHarvestConfig = {},
): Promise<GenealogyScrapeResult | null> {
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

function inferLeg(position: string | undefined, treeType: 'sponsor' | 'binary'): GenealogyLeg {
  if (!position) return treeType === 'sponsor' ? 'sponsor' : 'unknown';
  const p = position.toLowerCase();
  if (p.includes('left')) return 'left';
  if (p.includes('right')) return 'right';
  if (p.includes('sponsor')) return 'sponsor';
  return treeType === 'sponsor' ? 'sponsor' : 'unknown';
}

function normalizeHttpTreeResponse(
  bpCode: string,
  treeType: 'sponsor' | 'binary',
  data: unknown,
): GenealogyScrapeResult | null {
  if (!data || typeof data !== 'object') return null;

  const children = extractChildren(data);
  const modalData = extractModal(data);
  const rootBpCode =
    String(
      (data as Record<string, unknown>).bpCode ??
        (data as Record<string, unknown>).BPCode ??
        (data as Record<string, unknown>).rootBpCode ??
        bpCode,
    ) || bpCode;

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
      leg: inferLeg(modalData.position, treeType),
    })),
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
