import type { GenealogyScrapeResult } from '@greencity/shared';

const TRANSIENT_PORTAL_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /net::ERR_/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /\b502\b/,
  /\b503\b/,
  /\b504\b/,
  /server error/i,
  /temporarily unavailable/i,
  /navigation.*interrupted/i,
  /target (?:page|closed)/i,
];

/** Portal returned a transient fault — safe to retry (Bihar thundering-herd class). */
export function isTransientPortalError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return TRANSIENT_PORTAL_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Soft warning banners (e.g. lblMsg) that may appear alongside valid grid/tree data.
 * Do not treat the whole page as failed when data selectors also matched.
 */
export function pageHasSoftPortalWarning(html: string): boolean {
  if (!/lblMsg/i.test(html)) return false;
  if (/invalid session|session expired|login/i.test(html)) return false;
  return true;
}

/** BP with no downline — empty orgchart/children is valid, not a scraper failure. */
export function isConfirmedBlankGenealogy(result: GenealogyScrapeResult): boolean {
  if (result.nodes.length === 0) return true;
  return result.nodes.every(
    (node) =>
      node.children.length === 0 &&
      !node.modalData.position &&
      !node.modalData.totalMembers &&
      !node.modalData.sponsorBpId,
  );
}
