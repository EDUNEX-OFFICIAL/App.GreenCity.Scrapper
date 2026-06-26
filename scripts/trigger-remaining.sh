#!/usr/bin/env bash
# Trigger portal_sequential (skips bp_list) after genealogy is complete.
set -euo pipefail
curl -sf -X POST http://localhost:3010/api/runs/trigger-remaining | jq .
