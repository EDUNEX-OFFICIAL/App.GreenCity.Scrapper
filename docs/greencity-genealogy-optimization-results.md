# Green City Genealogy Optimization — Implementation Summary

**Branch:** `fix/genealogy-speed`  
**Baseline:** ~20 BP/min (single-host, pre-optimization)  
**Target context:** Playwright required — optimize concurrency and remove sequential bottlenecks (not eliminate browser).

## Fixes implemented

| Fix | Summary | Key env flags |
|-----|---------|---------------|
| 1 | Replaced `jitteredDelay` on genealogy hot path with selector waits (`genealogy-waits.ts`, `navigation.ts`, `panel.ts`) | — |
| 2 | Sponsor + binary trees scraped in parallel on two `Page` tabs (`GENEALOGY_PARALLEL_TREES`) | `GENEALOGY_PARALLEL_TREES=true` |
| 3 | Profile + genealogy modules parallel when both requested (`GENEALOGY_PARALLEL_MODULES`) | `GENEALOGY_PARALLEL_MODULES=true` |
| 4 | Default worker concurrency raised to **50**; benchmark + validation CLIs added | `GENEALOGY_CONCURRENCY=50` |
| 5 | `upsertModuleRows` batched via `createMany` + `updateMany` (500-row chunks) | — |
| 6 | Staggered job enqueue, transient portal retry, blank-tree tolerance | `GENEALOGY_ENQUEUE_STAGGER_MS=50`, `GENEALOGY_PORTAL_RETRY_*` |

## Benchmark / validation commands

```bash
# Fix 2 — sequential vs parallel trees (5 BPs)
GENEALOGY_BENCHMARK_MAX=5 pnpm --filter @greencity/scraper benchmark:parallel-trees

# Fix 3 — sequential vs parallel modules
GENEALOGY_BENCHMARK_MAX=5 pnpm --filter @greencity/scraper benchmark:parallel-modules

# Fix 4 — concurrency ramp (50–100 BPs recommended)
GENEALOGY_BENCHMARK_MAX=50 GENEALOGY_BENCHMARK_LEVELS=25,50,75,100 \
  pnpm --filter @greencity/scraper benchmark:concurrency

# Final validation sample
GENEALOGY_VALIDATION_MAX=100 pnpm --filter @greencity/scraper validation:genealogy
```

## Realistic throughput ceiling (honest assessment)

**60 BP/sec (3,600/min) is not achievable on a single Playwright host.** Each BP job holds 2–3 browser pages (sponsor, binary, optional profile). Practical single-host ceiling is typically **50–150 BP/min** depending on CPU/RAM and portal response times — tune with `benchmark:concurrency`.

To scale beyond that:

- Run **N `genealogy-scraper` worker containers**, each at the tuned `GENEALOGY_CONCURRENCY` (e.g. 4 replicas × 50 concurrency).
- Keep `GENEALOGY_ENQUEUE_STAGGER_MS` to avoid thundering-herd portal errors at batch start.
- Monitor `/api/scrape/live` for `bpPerMin`, `failRate`, and queue depth.

## Rollback

| Flag | Set to |
|------|--------|
| `GENEALOGY_PARALLEL_TREES` | `false` |
| `GENEALOGY_PARALLEL_MODULES` | `false` |
| `GENEALOGY_CONCURRENCY` | `25` |
| `GENEALOGY_ENQUEUE_STAGGER_MS` | `0` |

## Live validation status

Automated live runs were **not executed** in the audit environment (no Postgres/Docker/portal on this host). Run `validation:genealogy` on your deployment stack to capture actual `bpPerMin` and speedup multiplier.
