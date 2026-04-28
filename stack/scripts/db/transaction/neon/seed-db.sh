#!/usr/bin/env bash
# =======================================================================
# Athyper — Database Seed Script
# Location:
#   stack/scripts/db/transaction/neon/seed-db.sh
# Seeds the application database via the provisioning system.
#
# Usage:
#   ./seed-db.sh                 # Run all phases (DDL + platform seed + blueprints + tenants)
#   ./seed-db.sh --all           # Same as default
#   ./seed-db.sh --ddl-only      # Phase 1 only — DDL (schemas/tables/indexes/triggers)
#   ./seed-db.sh --system-only   # Phase 2 only — 010_platform/ (platform seed; DDL must exist)
#   ./seed-db.sh --no-demo       # Phase 1+2    — DDL + platform seed only
#                                #   blueprints (020_universal/ 030_industry/) and
#                                #   tenant data (040_tenants/) are skipped
#   ./seed-db.sh --demo-only     # Phase 1+2+3  — same as default; alias for clarity
#   ./seed-db.sh --reset         # DROP all app schemas + tracking tables, then re-seed
#                                #   can combine: --reset --ddl-only  (drop + DDL only)
#                                #                --reset --no-demo   (drop + Phase 1+2 only)
#   ./seed-db.sh --drop-only     # DROP all app schemas + tracking tables only (no re-seed)
#   ./seed-db.sh --status        # Read-only report — shows OK / PENDING / CHANGED per file
#   ./seed-db.sh --force         # Re-run all phases even if checksum unchanged
#   ./seed-db.sh --phase=N       # Low-level: run explicit phase(s) — N is 1, 2, or 3
#                                #   e.g. --phase=1 --phase=2 for DDL + platform seed only
#   ./seed-db.sh --tenant-id=UUID  # Set app.seed_tenant_id for the entire Phase 3 session
#                                #   Blueprints (020_universal/ 030_industry/) and tenant
#                                #   instance files use this UUID to scope their inserts.
#                                #   Can also be set via SEED_TENANT_ID env var.
#                                #   If omitted, each SQL file uses its own baked-in UUID
#                                #   (correct for the demo tenant; required for new clients).
#
# Environment variables:
#   DATABASE_ADMIN_URL   Direct Postgres connection URL. Must NOT point to PgBouncer.
#                        e.g. postgres://athyperadmin:pass@localhost:5432/athyper_dev1
#                        Resolution order: shell env → stack/env/.env → (error)
#                        Docker-internal hostnames are rewritten to localhost automatically:
#                          @db:           → @localhost:
#                          @dbpool-apps:  → @localhost:
#                          @dbpool-session: → @localhost:
#                        Script aborts if the resolved URL targets a PgBouncer port
#                        (:6432 or :6433) — migrate.ts requires a direct connection.
#
#   DB_HOST              Fallback host when DATABASE_ADMIN_URL is absent (default: localhost)
#                        Used to build: postgres://DB_USER:DB_PASSWORD@DB_HOST:DB_PORT/DB_NAME
#   DB_PORT              Fallback port (default: 5432). Must be direct Postgres, not PgBouncer.
#   DB_NAME              Fallback database name (default: athyper_dev1)
#   DB_USER              Fallback database user (default: athyperadmin)
#   DB_PASSWORD          Fallback password. Resolution order: shell env → stack/env/.env
#                        Required when DATABASE_ADMIN_URL is not set.
#
#   SEED_TENANT_ID       UUID of target tenant for Phase 3 provisioning.
#                        Resolution order: shell env → stack/env/.env
#                        Overridden by --tenant-id=UUID CLI flag.
#                        If omitted, each Phase 3 SQL file uses its own baked-in UUID.
#
# Phase layout (migrate.ts):
#   Phase 1 — DDL        : all dirs under server/db/sql/ except 900_seed_data/
#   Phase 2 — Platform   : 900_seed_data/010_platform/
#   Phase 3 — Blueprint  : 900_seed_data/020_universal/  (TIER 1 foundation + TIER 2a COA)
#                        : 900_seed_data/030_industry/   (TIER 2b industry packs + TIER 3 modules)
#             Tenant     : 900_seed_data/040_tenants/{client}/
#
# Requires: Node.js with tsx available (npx tsx)
#           DATABASE_ADMIN_URL must be a DIRECT Postgres connection — not PgBouncer.
#           DDL (CREATE SCHEMA, ALTER TABLE …) fails over a pooled connection.
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
# Read DATABASE_ADMIN_URL — check env, then bootstrap .env, then secrets .env.
# Secrets file wins over bootstrap (same precedence as Docker Compose loading).
# ---------------------------------------------------------------------------
if [ -z "${DATABASE_ADMIN_URL:-}" ]; then
  if [ -f "$ENV_FILE" ]; then
    DATABASE_ADMIN_URL=$(grep -E '^DATABASE_ADMIN_URL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
  fi
fi

# Also check secrets .env (staging/production — DATABASE_ADMIN_URL lives there).
# Path matches write-env-staging.sh: /opt/stack/athyper/secrets/.env
SECRETS_FILE="${ATHYPER_SECRETS_ROOT:-/opt/stack/athyper/secrets}/.env"
if [ -z "${DATABASE_ADMIN_URL:-}" ] && [ -f "$SECRETS_FILE" ]; then
  DATABASE_ADMIN_URL=$(grep -E '^DATABASE_ADMIN_URL=' "$SECRETS_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
fi

if [ -z "${DATABASE_ADMIN_URL:-}" ]; then
  # Fallback: construct from individual vars
  DB_HOST="${DB_HOST:-$APP_DB_DEFAULT_HOST}"
  DB_PORT="${DB_PORT:-$APP_DB_DEFAULT_PORT}"
  DB_NAME="${DB_NAME:-athyper_neon}"
  DB_USER="${DB_USER:-postgres}"

  DB_PASSWORD="${DB_PASSWORD:-}"
  if [ -z "$DB_PASSWORD" ] && [ -f "$ENV_FILE" ]; then
    DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
  fi
  if [ -z "$DB_PASSWORD" ] && [ -f "$SECRETS_FILE" ]; then
    DB_PASSWORD=$(grep -E '^DB_ADMIN_PASSWORD=' "$SECRETS_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
  fi

  if [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}Error: Cannot determine database credentials${NC}"
    echo -e "${YELLOW}Set DATABASE_ADMIN_URL in stack/env/.env or /opt/stack/athyper/secrets/.env${NC}"
    echo -e "${YELLOW}Example: DATABASE_ADMIN_URL=postgres://postgres:pass@localhost:5432/athyper_neon${NC}"
    exit 1
  fi

  DATABASE_ADMIN_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

# ---------------------------------------------------------------------------
# Rewrite Docker-internal hostnames to localhost (this script runs on the host).
# Handles both the Docker service name (@db:) and the Compose container name
# (@athyper-db-1: / @${COMPOSE_PROJECT_NAME}-db-1:) used in staging secrets.
# PgBouncer ports (:6432/:6433) are rejected — DDL requires a direct connection.
# ---------------------------------------------------------------------------
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@db:/@localhost:}"
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@athyper-db-1:/@localhost:}"
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@${COMPOSE_PROJECT_NAME}-db-1:/@localhost:}"

# Warn and abort if the URL still routes through PgBouncer (ports 6432/6433).
if echo "$DATABASE_ADMIN_URL" | grep -qE ':6432|:6433'; then
  echo -e "${RED}ERROR: DATABASE_ADMIN_URL appears to use a PgBouncer port (:6432 or :6433).${NC}"
  echo -e "${RED}       migrate.ts requires a direct Postgres connection (port 5432).${NC}"
  echo -e "${YELLOW}       Set DATABASE_ADMIN_URL to the direct DB URL, e.g.:${NC}"
  echo -e "${YELLOW}         postgres://postgres:<pass>@localhost:5432/athyper_neon${NC}"
  exit 1
fi
# Rewrite dbpool hostnames only after the port check
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@dbpool-apps:/@localhost:}"
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@dbpool-session:/@localhost:}"

export DATABASE_ADMIN_URL

# ---------------------------------------------------------------------------
# Read SEED_TENANT_ID — environment variable takes precedence over .env file.
# Optional — only used by Phase 3 (blueprint + tenant provisioning).
# ---------------------------------------------------------------------------
if [ -z "${SEED_TENANT_ID:-}" ]; then
  if [ -f "$ENV_FILE" ]; then
    SEED_TENANT_ID=$(grep -E '^SEED_TENANT_ID=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
  fi
fi
# If --tenant-id=UUID was passed on the command line, migrate.ts handles that
# precedence internally; we export SEED_TENANT_ID here only as the env fallback.
export SEED_TENANT_ID

# Show connection target (mask password — strip everything up to first @)
DB_TARGET="${DATABASE_ADMIN_URL#*@}"
echo -e "${GREEN}Database : ${DB_TARGET}${NC}"
echo -e "${GREEN}Server   : ${SERVER_DIR}${NC}"
if [ -n "${SEED_TENANT_ID:-}" ]; then
  echo -e "${GREEN}Tenant ID: ${SEED_TENANT_ID}${NC}"
else
  echo -e "${YELLOW}Tenant ID: (not set — Phase 3 files use baked-in UUIDs)${NC}"
fi
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
# Pass all args directly to migrate.ts.
# Supported flags:
#   (no args) / --all / --ddl-only / --system-only / --no-demo / --demo-only
#   --reset [--ddl-only | --no-demo] / --drop-only / --status / --force
#   --phase=N  (repeatable, N = 1 | 2 | 3)
#   --tenant-id=UUID  (sets app.seed_tenant_id for Phase 3; overrides SEED_TENANT_ID)
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
