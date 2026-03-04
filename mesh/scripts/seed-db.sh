#!/usr/bin/env bash
# =======================================================================
# Athyper — Database Seed Script
# Seeds the application database via the provisioning system.
#
# Usage:
#   ./seed-db.sh                 # Full seed (DDL + standard + demo)
#   ./seed-db.sh --no-demo       # Production-like (DDL + standard, no demo data)
#   ./seed-db.sh --demo-only     # Demo data only (requires standard already seeded)
#   ./seed-db.sh --reset         # Drop all schemas and re-seed from scratch
#   ./seed-db.sh --status        # Show provision status
#
# Requires: Docker running with athyper-mesh-db-1 container
# =======================================================================

set -euo pipefail

# Disable MSYS/Git Bash path conversion
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESH_DIR="$(dirname "$SCRIPT_DIR")"
SEED_DIR="$(cd "$MESH_DIR/../framework/adapters/db" && pwd)"
if [ -f "${MESH_DIR}/env/.env" ]; then
  ENV_FILE="${MESH_DIR}/env/.env"
else
  ENV_FILE="${MESH_DIR}/env/.env.example"
fi

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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
  # Fallback: construct from individual vars or use default
  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5432}"
  DB_NAME="${DB_NAME:-athyper_dev1}"
  DB_USER="${DB_USER:-athyperadmin}"
  DB_PASS="${DB_PASSWORD:-}"

  if [ -z "$DB_PASS" ] && [ -f "$ENV_FILE" ]; then
    DB_PASS=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  fi

  if [ -z "$DB_PASS" ]; then
    echo -e "${RED}Error: Cannot determine database credentials${NC}"
    echo -e "${YELLOW}Set DATABASE_ADMIN_URL or DB_PASSWORD in mesh/env/.env${NC}"
    echo -e "${YELLOW}Example: DATABASE_ADMIN_URL=postgres://user:pass@localhost:5432/athyper_dev1${NC}"
    exit 1
  fi

  DATABASE_ADMIN_URL="postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

# ---------------------------------------------------------------------------
# Rewrite Docker-internal hostnames to localhost (this script runs on the host)
# The .env file uses Docker service names (e.g. @db:5432) which only resolve
# inside the Docker network. Replace them with localhost equivalents.
# ---------------------------------------------------------------------------
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@db:/@localhost:}"
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@dbpool-apps:/@localhost:}"
DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL//@dbpool-auth:/@localhost:}"

export DATABASE_ADMIN_URL

# Show connection target (mask password)
DB_TARGET="${DATABASE_ADMIN_URL#*@}"
echo -e "${GREEN}Database: ${DB_TARGET}${NC}"
echo -e "${GREEN}Seed directory: ${SEED_DIR}${NC}"
echo -e "${GREEN}Arguments: ${*:-<none>}${NC}"
echo ""

# ---------------------------------------------------------------------------
# Run the provisioner
# ---------------------------------------------------------------------------
cd "$SEED_DIR"
npx tsx src/seed/seed.ts "$@"

echo ""
echo -e "${GREEN}=== Seed complete ===${NC}"
