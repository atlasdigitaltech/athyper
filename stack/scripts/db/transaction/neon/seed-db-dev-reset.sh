#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

pnpm --dir "$REPO_ROOT/server/db" run db:verify:authorization-v2-zero-scans
exec "$SCRIPT_DIR/seed-db.sh" \
  --reset \
  --confirm LOCAL-AUTH-V2-RESET \
  "$@"
