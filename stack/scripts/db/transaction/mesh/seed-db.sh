#!/usr/bin/env bash
# =======================================================================
# Athyper - Mesh Database Seed Script
# Location:
#   stack/scripts/db/transaction/mesh/seed-db.sh
#
# Seeds the standalone athyper_mesh database.
#
# Usage:
#   ./seed-db.sh                 Run Mesh DDL + shared refs + demo exchange seed
#   ./seed-db.sh --ddl-only      Run only Mesh DDL
#   ./seed-db.sh --seed-only     Run only shared ref + Mesh seed data
#   ./seed-db.sh --status        Show checksum status, no data changes
#   ./seed-db.sh --reset         Drop shared/mesh schemas, then re-run
#   ./seed-db.sh --reset --confirm LOCAL-AUTH-V2-RESET
#                                Local shorthand for the guarded athyper_mesh reset.
#                                The disposable DB marker/fingerprint must already match.
#   ./seed-db.sh --drop-only     Drop shared/mesh schemas only
#   ./seed-db.sh --force         Re-run even when checksums match
#   ./seed-db.sh --discover      Print the Mesh file set
#   --confirm is valid only with --reset or --drop-only.
#   ./seed-db.sh --docker        Run from a temporary Node container on the
#                                internal Docker network.
#
# Environment:
#   MESH_DATABASE_ADMIN_URL      Direct Postgres URL to athyper_mesh.
#   DATABASE_ADMIN_URL           Fallback; database name is rewritten to athyper_mesh.
#   DB_ADMIN_USER/PASSWORD       Final fallback for localhost:5432.
#
# DDL requires direct Postgres on 5432. PgBouncer ports 6432/6433 are rejected.
# =======================================================================

set -euo pipefail

export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

if ! SERVER_DIR="$(cd "$STACK_DIR/../server" 2>/dev/null && pwd)"; then
  echo "ERROR: server directory not found at \"$STACK_DIR/../server\""
  exit 1
fi

if [ -f "${STACK_DIR}/env/.env" ]; then
  ENV_FILE="${STACK_DIR}/env/.env"
else
  ENV_FILE="${STACK_DIR}/env/.env.example"
fi

source "${SCRIPT_DIR}/../../../lib/constants.sh"

GREEN="$CLR_GREEN"; YELLOW="$CLR_YELLOW"; RED="$CLR_RED"; NC="$CLR_NC"

DOCKER_MODE=false
DOCKER_NETWORK=""
DOCKER_NODE_IMAGE="node:20-bookworm"

MESH_ONLY_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --docker)              DOCKER_MODE=true ;;
    --docker-network=*)    DOCKER_NETWORK="${arg#--docker-network=}" ;;
    --docker-image=*)      DOCKER_NODE_IMAGE="${arg#--docker-image=}" ;;
    *)                     MESH_ONLY_ARGS+=("$arg") ;;
  esac
done
set -- "${MESH_ONLY_ARGS[@]+"${MESH_ONLY_ARGS[@]}"}"

env_value() {
  local key="$1"
  local file="$2"
  [ -f "$file" ] || return 0
  grep -E "^${key}=" "$file" | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true
}

SECRETS_FILE="${ATHYPER_SECRETS_ROOT:-/opt/stack/athyper/secrets}/.env"

DISCOVER_ONLY=false
for arg in "$@"; do
  if [ "$arg" = "--discover" ]; then
    DISCOVER_ONLY=true
  fi
done

if [ "$DISCOVER_ONLY" = "true" ]; then
  echo -e "${GREEN}=== Athyper Mesh Database Seed ===${NC}"
  echo -e "${GREEN}Database : (not required for --discover)${NC}"
  echo -e "${GREEN}Server   : ${SERVER_DIR}${NC}"
  echo -e "${GREEN}Arguments: ${*}${NC}"
  echo ""

  cd "$SERVER_DIR"
  # shellcheck disable=SC2086
  npx tsx db/scripts/provision-mesh.ts $*
  exit $?
fi

if [ -z "${MESH_DATABASE_ADMIN_URL:-}" ]; then
  MESH_DATABASE_ADMIN_URL="$(env_value MESH_DATABASE_ADMIN_URL "$ENV_FILE")"
fi
if [ -z "${MESH_DATABASE_ADMIN_URL:-}" ] && [ -f "$SECRETS_FILE" ]; then
  MESH_DATABASE_ADMIN_URL="$(env_value MESH_DATABASE_ADMIN_URL "$SECRETS_FILE")"
fi

if [ -z "${MESH_DATABASE_ADMIN_URL:-}" ]; then
  DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL:-}"
  if [ -z "$DATABASE_ADMIN_URL" ]; then
    DATABASE_ADMIN_URL="$(env_value DATABASE_ADMIN_URL "$ENV_FILE")"
  fi
  if [ -z "$DATABASE_ADMIN_URL" ] && [ -f "$SECRETS_FILE" ]; then
    DATABASE_ADMIN_URL="$(env_value DATABASE_ADMIN_URL "$SECRETS_FILE")"
  fi

  if [ -n "$DATABASE_ADMIN_URL" ]; then
    MESH_DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL/\/athyper_neon/\/athyper_mesh}"
    MESH_DATABASE_ADMIN_URL="${MESH_DATABASE_ADMIN_URL/\/athyper_dev1/\/athyper_mesh}"
  fi
fi

if [ -z "${MESH_DATABASE_ADMIN_URL:-}" ]; then
  DB_HOST="${DB_HOST:-$APP_DB_DEFAULT_HOST}"
  DB_PORT="${DB_PORT:-$APP_DB_DEFAULT_PORT}"
  DB_ADMIN_USER="${DB_ADMIN_USER:-$(env_value DB_ADMIN_USER "$ENV_FILE")}"
  DB_ADMIN_USER="${DB_ADMIN_USER:-athyperadmin}"
  DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:-$(env_value DB_ADMIN_PASSWORD "$ENV_FILE")}"
  if [ -z "$DB_ADMIN_PASSWORD" ] && [ -f "$SECRETS_FILE" ]; then
    DB_ADMIN_PASSWORD="$(env_value DB_ADMIN_PASSWORD "$SECRETS_FILE")"
  fi

  if [ -z "$DB_ADMIN_PASSWORD" ]; then
    echo -e "${RED}Error: Cannot determine Mesh database credentials.${NC}"
    echo -e "${YELLOW}Set MESH_DATABASE_ADMIN_URL or DB_ADMIN_PASSWORD.${NC}"
    exit 1
  fi

  MESH_DATABASE_ADMIN_URL="postgresql://${DB_ADMIN_USER}:${DB_ADMIN_PASSWORD}@${DB_HOST}:${DB_PORT}/athyper_mesh?sslmode=disable"
fi

if [ "$DOCKER_MODE" = "false" ]; then
  MESH_DATABASE_ADMIN_URL="${MESH_DATABASE_ADMIN_URL//@db:/@localhost:}"
  MESH_DATABASE_ADMIN_URL="${MESH_DATABASE_ADMIN_URL//@athyper-db-1:/@localhost:}"
  MESH_DATABASE_ADMIN_URL="${MESH_DATABASE_ADMIN_URL//@${COMPOSE_PROJECT_NAME}-db-1:/@localhost:}"

  if echo "$MESH_DATABASE_ADMIN_URL" | grep -qE ':6432|:6433'; then
    echo -e "${RED}ERROR: MESH_DATABASE_ADMIN_URL appears to use a PgBouncer port (:6432 or :6433).${NC}"
    echo -e "${RED}       Mesh DDL requires a direct Postgres connection (port 5432).${NC}"
    exit 1
  fi
else
  MESH_DATABASE_ADMIN_URL="${MESH_DATABASE_ADMIN_URL//@localhost:5432/@db:5432}"
  MESH_DATABASE_ADMIN_URL="${MESH_DATABASE_ADMIN_URL//@127.0.0.1:5432/@db:5432}"
  MESH_DATABASE_ADMIN_URL="${MESH_DATABASE_ADMIN_URL//@athyper-db-1:/@db:}"
  MESH_DATABASE_ADMIN_URL="${MESH_DATABASE_ADMIN_URL//@${COMPOSE_PROJECT_NAME}-db-1:/@db:}"
fi

export MESH_DATABASE_ADMIN_URL

echo -e "${GREEN}=== Athyper Mesh Database Seed ===${NC}"
echo -e "${GREEN}Database : ${MESH_DATABASE_ADMIN_URL#*@}${NC}"
echo -e "${GREEN}Server   : ${SERVER_DIR}${NC}"
echo -e "${GREEN}Arguments: ${*:-<none>}${NC}"
echo ""

MIGRATE_ARGS="${*:---all}"

if [ "$DOCKER_MODE" = "true" ]; then
  if [ -z "$DOCKER_NETWORK" ]; then
    DOCKER_NETWORK="$NETWORK_NAME"
  fi

  DB_DIR="${SERVER_DIR}/db"
  SAFE_IMAGE="${DOCKER_NODE_IMAGE//:/_}"
  SAFE_IMAGE="${SAFE_IMAGE//\//_}"
  NM_VOLUME="athyper_mesh_seed_nm_${SAFE_IMAGE}"
  PKG_HASH=$(md5sum "${DB_DIR}/package.json" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
  HASH_FILE="/tmp/.athyper_mesh_seed_nm_hash_${SAFE_IMAGE}"

  if [ -f "$HASH_FILE" ] && [ "$(cat "$HASH_FILE")" != "$PKG_HASH" ]; then
    echo -e "${YELLOW}package.json changed - clearing node_modules cache...${NC}"
    docker volume rm "$NM_VOLUME" >/dev/null 2>&1 || true
    rm -f "$HASH_FILE"
  fi

  echo -e "${GREEN}Docker mode: network=${DOCKER_NETWORK} image=${DOCKER_NODE_IMAGE}${NC}"

  # shellcheck disable=SC2086
  SEED_CID=$(docker create \
      -e MESH_DATABASE_ADMIN_URL="$MESH_DATABASE_ADMIN_URL" \
      -v "${DB_DIR}:/app" \
      -v "${NM_VOLUME}:/app/node_modules" \
      -w /app \
      "$DOCKER_NODE_IMAGE" \
      sh -c "npm install --no-fund --no-audit && npx tsx scripts/provision-mesh.ts $MIGRATE_ARGS")

  docker network connect "$DOCKER_NETWORK" "$SEED_CID"
  docker start -a "$SEED_CID"
  SEED_EXIT=$?
  docker rm "$SEED_CID" >/dev/null 2>&1 || true
  [ "$SEED_EXIT" -eq 0 ] && echo "$PKG_HASH" > "$HASH_FILE"

  if [ "$SEED_EXIT" -ne 0 ]; then
    echo -e "${RED}Mesh seed failed!${NC}"
    exit 1
  fi
else
  if ! command -v npx >/dev/null 2>&1; then
    echo -e "${RED}Error: npx not found in PATH - install Node.js/npm.${NC}"
    exit 1
  fi

  cd "$SERVER_DIR"
  # shellcheck disable=SC2086
  if ! npx tsx db/scripts/provision-mesh.ts $MIGRATE_ARGS; then
    echo -e "${RED}Mesh seed failed!${NC}"
    exit 1
  fi
fi

echo ""
echo -e "${GREEN}=== Mesh seed complete ===${NC}"
