# Phase 0 — Source of Truth Reconcile Report

## Summary

Production was running **dist** with fan-out parallel genealogy; **src** was stale and would regress on rebuild. **src is now reconciled** to match production dist behavior.

## Recommendation Applied

**Update src to match dist** (NOT dist as permanent source of truth).

## Files Reconciled

| File | Change |
|------|--------|
| `apps/scraper/src/genealogy-orchestrator.ts` | Fan-out coordinator + leaf-first skip |
| `apps/scraper/src/genealogy-runner.ts` | Batch progress hooks |
| `apps/scraper/src/extractors/genealogy-tree.ts` | Snapshot scrape model |
| `packages/db/src/genealogy.ts` | Leaf-first ordering, batch progress, completed skip |
| `packages/queue/src/genealogy-queue.ts` | `enqueueGenealogyBpJobs`, obliterate |
| `packages/shared/src/config.ts` | `genealogyConcurrency`, `genealogyBpOrder` |
| `packages/shared/src/modules/genealogy-types.ts` | `statusDate`, `plotStatus` |
| `apps/api/src/app/api/scrape/live/route.ts` | Queue depth, ETA, parallel counts |

## Verification

- `pnpm bootstrap` — success
- `node scripts/verify-genealogy-dist.mjs` — critical exports check

## Rollback

Restore pre-Phase-0 dist tarball or revert src commit; production dist backup recommended before deploy.
