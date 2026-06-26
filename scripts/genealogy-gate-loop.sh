#!/usr/bin/env bash
# Run until genealogy gate passes: check → wait for active batch → retry incomplete → repeat.
set -euo pipefail
cd "$(dirname "$0")/.."
MAX_ROUNDS="${1:-20}"
SLEEP_SEC="${2:-60}"

run_gate() {
  docker compose exec -T genealogy-scraper node apps/scraper/dist/cli-genealogy-gate.js 2>&1
}

active_batch() {
  docker compose exec -T genealogy-scraper node -e "
const { findActiveGenealogyBatch } = await import('/app/packages/db/dist/genealogy.js');
const b = await findActiveGenealogyBatch();
if (!b) { console.log('none'); process.exit(0); }
const m = b.metadata || {};
console.log(b.id, b.status, m.completed ?? 0, m.failed ?? 0, m.totalBps ?? 0);
" 2>/dev/null
}

for ((round=1; round<=MAX_ROUNDS; round++)); do
  echo "=== Gate round $round/$MAX_ROUNDS ==="
  if run_gate; then
    echo "Genealogy complete."
    exit 0
  fi
  batch=$(active_batch || echo "none")
  echo "Active batch: $batch"
  if [[ "$batch" == "none" ]]; then
    echo "Enqueueing incomplete BPs..."
    docker compose run --rm genealogy-scraper node apps/scraper/dist/cli-retry-failed-genealogy.js
  else
    echo "Waiting ${SLEEP_SEC}s for batch..."
    sleep "$SLEEP_SEC"
  fi
done

echo "Max rounds reached — gate still failing"
run_gate || true
exit 1
