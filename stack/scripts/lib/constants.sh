#!/usr/bin/env bash
# =======================================================================
# Shared constants for athyper stack scripts.
#
# Centralises container names, network names, database names, and other
# values that were previously hardcoded across multiple scripts.
#
# Usage:
#   source "$(dirname "$0")/../lib/constants.sh"
#   # or, when SCRIPT_DIR is already resolved:
#   source "${SCRIPT_DIR}/../lib/constants.sh"
#
# Every variable honours an env-var override so CI / alternate stacks
# can inject different values without patching the file.
# =======================================================================

# Guard: only load once per shell session
[[ -n "${_ATHYPER_CONSTANTS_LOADED:-}" ]] && return 0
_ATHYPER_CONSTANTS_LOADED=1
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env-parse.sh"

# ---------------------------------------------------------------------------
# Resolve COMPOSE_PROJECT_NAME from .env if not already in the environment.
# constants.sh lives at stack/scripts/lib/ — two levels up is stack/.
# ---------------------------------------------------------------------------
if [[ -z "${COMPOSE_PROJECT_NAME:-}" ]]; then
  _CONST_STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  _CONST_ENV="${_CONST_STACK_DIR}/env/.env"
  if [[ -f "${_CONST_ENV}" ]]; then
    COMPOSE_PROJECT_NAME="$(read_env_value "${_CONST_ENV}" COMPOSE_PROJECT_NAME || true)"
  fi
  unset _CONST_STACK_DIR _CONST_ENV
fi
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-athyper}"

# ---------------------------------------------------------------------------
# Docker container names
# Derived from COMPOSE_PROJECT_NAME + service name.
# Each can be overridden individually via DOCKER_CONTAINER_* env vars.
# ---------------------------------------------------------------------------
CONTAINER_IAM="${DOCKER_CONTAINER_IAM:-${COMPOSE_PROJECT_NAME}-iam-1}"
CONTAINER_DB="${DOCKER_CONTAINER_DB:-${COMPOSE_PROJECT_NAME}-db-1}"
CONTAINER_DBPOOL_SESSION="${DOCKER_CONTAINER_DBPOOL_SESSION:-${COMPOSE_PROJECT_NAME}-dbpool-session-1}"
CONTAINER_DBPOOL_APPS="${DOCKER_CONTAINER_DBPOOL_APPS:-${COMPOSE_PROJECT_NAME}-dbpool-apps-1}"
CONTAINER_GATEWAY="${DOCKER_CONTAINER_GATEWAY:-${COMPOSE_PROJECT_NAME}-gateway-1}"
CONTAINER_MEMORYCACHE="${DOCKER_CONTAINER_MEMORYCACHE:-${DOCKER_CONTAINER_REDIS:-${COMPOSE_PROJECT_NAME}-memorycache-1}}"
CONTAINER_OBJECTSTORAGE="${DOCKER_CONTAINER_OBJECTSTORAGE:-${DOCKER_CONTAINER_MINIO:-${COMPOSE_PROJECT_NAME}-objectstorage-1}}"
CONTAINER_MAILTRAP="${DOCKER_CONTAINER_MAILTRAP:-${DOCKER_CONTAINER_MAIL:-${COMPOSE_PROJECT_NAME}-mailtrap-1}}"
CONTAINER_NEON_WEB="${DOCKER_CONTAINER_NEON_WEB:-${DOCKER_CONTAINER_WEB:-${COMPOSE_PROJECT_NAME}-neon-web-1}}"
CONTAINER_MESH_WEB="${DOCKER_CONTAINER_MESH_WEB:-${COMPOSE_PROJECT_NAME}-mesh-web-1}"
CONTAINER_STUDIO_WEB="${DOCKER_CONTAINER_STUDIO_WEB:-${COMPOSE_PROJECT_NAME}-studio-web-1}"
CONTAINER_API="${DOCKER_CONTAINER_API:-${COMPOSE_PROJECT_NAME}-api-1}"
CONTAINER_SEARCHCORE="${DOCKER_CONTAINER_SEARCHCORE:-${DOCKER_CONTAINER_SEARCH:-${COMPOSE_PROJECT_NAME}-searchcore-1}}"

# ---------------------------------------------------------------------------
# Docker network
# ---------------------------------------------------------------------------
NETWORK_NAME="${DOCKER_NETWORK:-athyper-internal}"

# ---------------------------------------------------------------------------
# Database names
# ---------------------------------------------------------------------------
DB_NAME_APPS="${DB_NAME_APPS:-athyper_dev1}"
DB_NAME_AUTH="${DB_NAME_AUTH:-athyper_iam}"

# ---------------------------------------------------------------------------
# Default IAM database connection (fallback when container is not running)
# ---------------------------------------------------------------------------
IAM_DB_DEFAULT_URL="${IAM_DB_DEFAULT_URL:-jdbc:postgresql://dbpool-session:6433/${DB_NAME_AUTH}}"
IAM_DB_DEFAULT_USER="${IAM_DB_DEFAULT_USER:-athyperadmin}"

# ---------------------------------------------------------------------------
# Default app database connection parts (host-side, for seed-db.sh)
# ---------------------------------------------------------------------------
APP_DB_DEFAULT_HOST="${APP_DB_DEFAULT_HOST:-localhost}"
APP_DB_DEFAULT_PORT="${APP_DB_DEFAULT_PORT:-5432}"

# ---------------------------------------------------------------------------
# Terminal colours (safe no-ops when piped)
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  CLR_GREEN='\033[0;32m'
  CLR_YELLOW='\033[1;33m'
  CLR_RED='\033[0;31m'
  CLR_CYAN='\033[0;36m'
  CLR_NC='\033[0m'
else
  CLR_GREEN=''
  CLR_YELLOW=''
  CLR_RED=''
  CLR_CYAN=''
  CLR_NC=''
fi
