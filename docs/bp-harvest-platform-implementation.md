# GreenCity BP Harvest Platform — Implementation Summary

All phases (0–10) implemented. Enable features via environment flags.

## Phase 0 — Source of Truth

- Reconciled `src` with production `dist` (fan-out, snapshot scrape, leaf-first ordering)
- Report: [phase-0-reconcile-report.md](./phase-0-reconcile-report.md)
- Guard: `pnpm verify:genealogy-dist`

## Phase 1 — `@greencity/scraper-core`

New package: `packages/scraper-core/`

| Module | Path |
|--------|------|
| SessionManager | `src/session-manager.ts` |
| BrowserPool | `src/browser-pool.ts` |
| Retry | `src/retry.ts` |
| Navigation | `src/navigation.ts` |
| Metrics | `src/metrics.ts` |
| Resource blocker | `src/resource-blocker.ts` |
| Admin context | `src/admin-context.ts` |
| BP modules | `src/bp-module.ts`, `src/modules/*` |

## Phase 2 — Browser Pool

- **Flag:** `SCRAPER_BROWSER_POOL=true` (default; set `false` to rollback)
- One Chromium per worker process, shared across job contexts
- Health check + SIGTERM graceful shutdown

## Phase 3 — Performance + Metrics

- Replaced fixed sleeps with selector waits in `genealogy-tree.ts`, `session-manager.ts`, `panel.ts`
- Structured timing logs: `genealogy.login_ms`, `navigation_ms`, `tree_extract_ms`, `db_upsert_ms`, `harvest_ms`

## Phase 4 — Resource Blocking

- **Flag:** `SCRAPER_BLOCK_RESOURCES=true` (default `false`)
- Blocks images, fonts, media; preserves XHR/fetch/scripts

## Phase 5 — Auth Mode

- **Flag:** `GENEALOGY_AUTH_MODE=auto|admin_panel|direct_login` (default `auto`)
- `auto`: admin panel first, direct login fallback
- `admin_panel`: admin only
- `direct_login`: direct first, admin fallback (legacy)

## Phase 6 — Long-Lived Admin Context

- **Flag:** `SCRAPER_ADMIN_CONTEXT=true` (default `false`)
- Warm admin session per worker; BP tabs open/close independently
- Session refresh every 15 minutes

## Phase 7 — BP Module Framework

- `BpModule` interface with `ProfileModule` + `GenealogyModule`
- Genealogy runner uses module registry

## Phase 8 — BP Harvest Queue

- **Flag:** `BP_HARVEST_QUEUE=true` (default `false`)
- Queue: `greencity-bp-harvest`
- Payload: `{ bpCode, modules: ['profile', 'genealogy'] }`
- Orchestrator enqueues harvest jobs when flag enabled

## Phase 9 — Network Reverse Engineering

```bash
GENEALOGY_INSPECT_BP=BP123 pnpm --filter @greencity/scraper inspect:genealogy
```

Output: `.data/network-capture/{bpCode}-{ts}.md` + `.json`

## Phase 10 — HTTP Harvest Prototype

```bash
GENEALOGY_HTTP_TREE_URL='https://...?bp={bpCode}&tree={treeType}'
GENEALOGY_HTTP_COOKIE='...'
GENEALOGY_INSPECT_BP=BP123 pnpm --filter @greencity/scraper inspect:http-harvest
```

Compares Playwright vs HTTP when endpoints are configured.

## Recommended Rollout

| Stage | Flags |
|-------|-------|
| Stage 1 (20→35 BP/min) | `SCRAPER_BROWSER_POOL=true` |
| Stage 2 (35→60 BP/min) | + `GENEALOGY_AUTH_MODE=auto`, `SCRAPER_BLOCK_RESOURCES=true`, `SCRAPER_ADMIN_CONTEXT=true` |
| Stage 3 (60→100+ BP/min) | + `BP_HARVEST_QUEUE=true` |
| Stage 4 (HTTP) | Configure HTTP env vars after Phase 9 report |

## Rollback

Set flags to `false` or revert git commit. Browser pool: `SCRAPER_BROWSER_POOL=false`. Harvest queue: `BP_HARVEST_QUEUE=false`.
