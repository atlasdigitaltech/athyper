#!/usr/bin/env bash
# =======================================================================
# Athyper — Database Seed Script
# Location:
#   stack/scripts/db/transaction/neon/seed-db.sh
# Seeds the application database via the provisioning system.
#
# Usage:
#   ./seed-db.sh                 # Phase 1+2+3 — DDL + 010_system + 020_blueprint
#                                #               + 030_tenant + 040_prod_tenant
#   ./seed-db.sh --ddl-only      # Phase 1 only — schemas/tables, no seed data
#   ./seed-db.sh --system-only   # Phase 2 only — 010_system (system/lookup seed only)
#                                #               DDL must already exist
#   ./seed-db.sh --no-demo       # Phase 1+2   — DDL + 010_system (system/lookup seed)
#                                #               020_blueprint / 030_tenant / 040_prod_tenant skipped
#   ./seed-db.sh --demo-only     # Phase 1+2+3 — all phases; checksum tracking skips already-done files
#                                #               safe to run on any DB state (fresh or partial)
#   ./seed-db.sh --reset         # DROP all schemas + schema_provisions, then re-seed Phase 1+2+3
#   ./seed-db.sh --drop-only     # DROP all schemas + schema_provisions only (no re-seed)
#   ./seed-db.sh --status        # Read-only report — shows OK / PENDING / CHANGED per file
#   ./seed-db.sh --force         # Re-run all phases even if checksum unchanged
#
# Phase layout (migrate.ts):
#   Phase 1 — DDL        : all dirs under server/db/sql/ except 900_seed_data/
#   Phase 2 — System     : 900_seed_data/010_system/
#   Phase 3 — Blueprint  : 900_seed_data/020_blueprint/
#             Tenant     : 900_seed_data/030_tenant/
#             Prod Tenant: 900_seed_data/040_prod_tenant/
#
# Requires: Docker running with athyper-stack-db-1 container
# =======================================================================

set -euo pipefail

# Disable MSYS/Git Bash path conversion
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# server/ sits next to stack/ at the repo root
if ! SERVER_DIR="$(cd "$STACK_DIR/../server" 2>/dev/null && pwd)"; then
  echo "ERROR: server directory not found at \"$STACK_DIR/../server\""
  echo "Ensure the full repo is cloned (stack/ and server/ must be siblings)."
  exit 1
fi

if [ -f "${STACK_DIR}/env/.env" ]; then
  ENV_FILE="${STACK_DIR}/env/.env"
else
  ENV_FILE="${STACK_DIR}/env/.env.example"
fi

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------
source "${SCRIPT_DIR}/../../../lib/constants.sh"

GREEN="$CLR_GREEN"; YELLOW="$CLR_YELLOW"; RED="$CLR_RED"; NC="$CLR_NC"

echo -e "${GREEN}=== Athyper Database Seed ===${NC}"

# ---------------------------------------------------------------------------
# Read DATABASE_ADMIN_URL from .env or environment
# ---------------------------------------------------------------------------
if [ -z "${DATABASE_ADMIN_URL:-}" ]; then
  if [ -f "$ENV_FILE" ]; then
    DATABASE_ADMIN_URL=$(grep -E '^DATABASE_ADMIN_URL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  fi
fi

if [ -z "${DATABASE_ADMIN_URL:-}" ]; then
  # Fallback: construct from individual vars (mirrors bat defaults)
  DB_HOST="${DB_HOST:-$APP_DB_DEFAULT_HOST}"
  DB_PORT="${DB_PORT:-$APP_DB_DEFAULT_PORT}"
  DB_NAME="${DB_NAME:-$DB_NAME_APPS}"
  DB_USER="${DB_USER:-athyperadmin}"

  DB_PASSWORD="${DB_PASSWORD:-}"
  if [ -z "$DB_PASSWORD" ] && [ -f "$ENV_FILE" ]; then
    DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  fi

  if [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}Error: Cannot determine database credentials${NC}"
    echo -e "${YELLOW}Set DATABASE_ADMIN_URL or DB_PASSWORD in stack/env/.env${NC}"
    echo -e "${YELLOW}Example: DATABASE_ADMIN_URL=postgres://user:pass@localhost:5432/athyper_dev1${NC}"
    exit 1
  fi

  DATABASE_ADMIN_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

# ---------------------------------------------------------------------------
# Rewrite Docker-internal hostnames to localhost (this script runs on the host)
# The .env file uses Docker service names (e.g. @db:5432) which only resolve
# inside the Docker network. Replace them with localhost equivalents.
# ---------------------------------------------------------------------------
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@db:/@localhost:}"
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@dbpool-apps:/@localhost:}"
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@dbpool-session:/@localhost:}"

export DATABASE_ADMIN_URL

# Show connection target (mask password — strip everything up to first @)
DB_TARGET="${DATABASE_ADMIN_URL#*@}"
echo -e "${GREEN}Database: ${DB_TARGET}${NC}"
echo -e "${GREEN}Server directory: ${SERVER_DIR}${NC}"
echo -e "${GREEN}Arguments: ${*:-<none>}${NC}"
echo ""

# ---------------------------------------------------------------------------
# Pre-flight: verify npx (ships with Node/npm) is available
# ---------------------------------------------------------------------------
if ! command -v npx &>/dev/null; then
  echo -e "${RED}Error: npx not found in PATH — install Node.js (>= 18) and npm${NC}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Pass args directly to migrate.ts — it understands all flags natively:
#   (no args) / --all / --ddl-only / --system-only / --no-demo / --demo-only
#   --reset / --drop-only / --status / --force / --phase=N
# ---------------------------------------------------------------------------
MIGRATE_ARGS="${*:---all}"

# ---------------------------------------------------------------------------
# Run the provisioner (cd to server/ so node_modules and tsconfig resolve correctly)
# ---------------------------------------------------------------------------
cd "$SERVER_DIR"
# shellcheck disable=SC2086  # intentional word-split for MIGRATE_ARGS
if ! npx tsx db/seed/migrate.ts $MIGRATE_ARGS; then
  echo ""
  echo -e "${RED}Seed failed!${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}=== Seed complete ===${NC}"
