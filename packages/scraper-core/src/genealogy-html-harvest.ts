import {
  bpUrl,
  createLogger,
  loadConfig,
  type GenealogyLeg,
  type GenealogyModalData,
  type GenealogyNodeRef,
  type GenealogyScrapeResult,
  type GenealogyTreeType,
} from '@greencity/shared';

const log = createLogger('genealogy-html-harvest');

const BP_LABEL_PATTERN = /\(([A-Za-z0-9_-]+)\)\s*(.*)/;
const DTREE_ADD_PATTERN =
  /mytree\.add\(\s*(\d+)\s*,\s*(-?\d+)\s*,\s*'((?:\\'|[^'])*)'/g;

export interface DtreeNode {
  id: number;
  parentId: number;
  bpCode: string;
  bpName?: string;
  label: string;
}

export function parseDtreeNodes(html: string): DtreeNode[] {
  const nodes: DtreeNode[] = [];
  for (const match of html.matchAll(DTREE_ADD_PATTERN)) {
    const id = Number.parseInt(match[1], 10);
    const parentId = Number.parseInt(match[2], 10);
    const rawLabel = match[3].replace(/\\'/g, "'");
    const bpMatch = rawLabel.match(BP_LABEL_PATTERN);
    if (!bpMatch || !Number.isFinite(id)) continue;
    nodes.push({
      id,
      parentId,
      bpCode: bpMatch[1],
      bpName: bpMatch[2].trim() || undefined,
      label: `(${bpMatch[1]}) ${bpMatch[2].trim()}`.trim(),
    });
  }
  return nodes;
}

export function parseModalFromHtml(html: string, uid: number): GenealogyModalData {
  const markers = [`id='${uid}'`, `id="${uid}"`];
  let start = -1;
  for (const marker of markers) {
    start = html.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) return {};

  const chunk = html.slice(start, start + 20_000);
  const fields: Record<string, string> = {};
  for (const match of chunk.matchAll(
    /<td[^>]*>([^<]+?)<\/td>\s*<td[^>]*>\s*([\s\S]*?)\s*<\/td>/gi,
  )) {
    const key = match[1].replace(/:$/, '').replace(/\s+/g, ' ').trim();
    const value = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (key) fields[key] = value;
  }

  let statusDate: string | undefined;
  let plotStatus: string | undefined;
  const bannerMatch = chunk.match(/#CC0000[^>]*>\s*([^<]+)/i);
  if (bannerMatch) {
    const bannerText = bannerMatch[1].replace(/\s+/g, ' ').trim();
    const dateMatch = bannerText.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    if (dateMatch) statusDate = dateMatch[0];
    plotStatus = bannerText.replace(dateMatch?.[0] ?? '', '').trim() || undefined;
  }

  return {
    position: fields.POSITION ?? fields.Position,
    leftPoint: fields['LEFT POINT'] ?? fields['Left Point'],
    rightPoint: fields['RIGHT POINT'] ?? fields['Right Point'],
    selfPoint: fields['SELF POINT'] ?? fields['Self Point'],
    sponsorBpId: fields['Sponsor ID'] ?? fields['Sponsor BP ID'],
    sponsorName: fields['Sponsor Name'],
    percentage: fields.Percentage,
    totalMembers: fields['Total Members'],
    selfBusiness: fields['Self Business'],
    totalBusiness: fields['Total Business'],
    registeredAt: fields['Add On'] ?? fields['Registered On'],
    statusDate,
    plotStatus,
    raw: fields,
  };
}

function bpCodesMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function findRootNode(nodes: DtreeNode[], rootBpCode: string): DtreeNode | null {
  return nodes.find((n) => bpCodesMatch(n.bpCode, rootBpCode)) ?? null;
}

function directChildNodes(nodes: DtreeNode[], root: DtreeNode): DtreeNode[] {
  const childIds = new Set<number>();
  const children: DtreeNode[] = [];
  for (const node of nodes) {
    if (node.parentId !== root.id) continue;
    if (childIds.has(node.id)) continue;
    childIds.add(node.id);
    children.push(node);
  }
  return children;
}

function assignBinaryLegs(
  children: DtreeNode[],
): Array<GenealogyNodeRef & { leg: 'left' | 'right' }> {
  if (children.length === 0) return [];
  if (children.length === 1) {
    const child = children[0];
    return [{ bpCode: child.bpCode, bpName: child.bpName, label: child.label, leg: 'left' }];
  }
  const left = children[0];
  const right = children[children.length - 1];
  const result: Array<GenealogyNodeRef & { leg: 'left' | 'right' }> = [
    { bpCode: left.bpCode, bpName: left.bpName, label: left.label, leg: 'left' },
  ];
  if (!bpCodesMatch(left.bpCode, right.bpCode)) {
    result.push({ bpCode: right.bpCode, bpName: right.bpName, label: right.label, leg: 'right' });
  }
  return result;
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

export function buildGenealogyResultFromDtreeHtml(
  html: string,
  rootBpCode: string,
  treeType: GenealogyTreeType,
): GenealogyScrapeResult | null {
  const nodes = parseDtreeNodes(html);
  if (nodes.length === 0) return null;

  const root =
    findRootNode(nodes, rootBpCode) ??
    nodes.find((n) => n.parentId === -1) ??
    nodes[0];
  if (!root) {
    log.warn({ rootBpCode, treeType, nodeCount: nodes.length }, 'Root node not found in dtree HTML');
    return null;
  }

  if (!bpCodesMatch(root.bpCode, rootBpCode)) {
    log.debug(
      { rootBpCode, portalRootCode: root.bpCode, treeType },
      'Portal root code differs from bp_list ID — storing under bp_list ID',
    );
  }

  const childNodes = directChildNodes(nodes, root);
  const children: GenealogyNodeRef[] =
    treeType === 'binary'
      ? assignBinaryLegs(childNodes)
      : childNodes.map((child) => ({
          bpCode: child.bpCode,
          bpName: child.bpName,
          label: child.label,
          leg: 'sponsor' as GenealogyLeg,
        }));

  const modalData = enrichModalWithLegChildren(parseModalFromHtml(html, root.id), children);

  return {
    nodes: [
      {
        bpCode: rootBpCode,
        bpName: root.bpName,
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

export function genealogyHtmlTreeUrl(treeType: GenealogyTreeType): string {
  if (treeType === 'binary') {
    const from = process.env.GENEALOGY_BINARY_FROM ?? '01/01/2010';
    const to = process.env.GENEALOGY_BINARY_TO ?? '31/12/2030';
    return `/team/TreeBinary.aspx?startdate=${encodeURIComponent(from)}&enddate=${encodeURIComponent(to)}`;
  }
  return '/team/TreeSponsor.aspx';
}

export async function fetchGenealogyHtmlPage(
  cookieHeader: string,
  treeType: GenealogyTreeType,
): Promise<string | null> {
  const cfg = loadConfig();
  const url = bpUrl(cfg.erpBaseUrl, genealogyHtmlTreeUrl(treeType));
  const res = await fetch(url, {
    headers: {
      Cookie: cookieHeader,
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!res.ok) {
    log.warn({ url, status: res.status, treeType }, 'Genealogy HTML fetch failed');
    return null;
  }

  const html = await res.text();
  if (res.status === 404) {
    log.warn({ treeType }, 'Genealogy HTML fetch returned 404 — session likely expired');
    return null;
  }
  if (/Login\.aspx/i.test(html) && html.includes('PasswordTextBox')) {
    log.warn({ treeType }, 'Genealogy HTML fetch returned login page — session expired');
    return null;
  }

  if (!html.includes('mytree.add')) {
    log.warn({ treeType, htmlLength: html.length }, 'Genealogy HTML missing dtree data');
    return null;
  }

  return html;
}
