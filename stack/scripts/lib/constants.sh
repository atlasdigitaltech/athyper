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

# ---------------------------------------------------------------------------
# Resolve COMPOSE_PROJECT_NAME from .env if not already in the environment.
# constants.sh lives at stack/scripts/lib/ — two levels up is stack/.
# ---------------------------------------------------------------------------
if [[ -z "${COMPOSE_PROJECT_NAME:-}" ]]; then
  _CONST_STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  _CONST_ENV="${_CONST_STACK_DIR}/env/.env"
  if [[ -f "${_CONST_ENV}" ]]; then
    COMPOSE_PROJECT_NAME="$(grep -E '^COMPOSE_PROJECT_NAME=' "${_CONST_ENV}" | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")"
  fi
  unset _CONST_STACK_DIR _CONST_ENV
fi
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-athyper-stack}"

# ---------------------------------------------------------------------------
# Docker container names
# Derived from COMPOSE_PROJECT_NAME + service name.
# Each can be overridden individually via DOCKER_CONTAINER_* env vars.
# ---------------------------------------------------------------------------
readonly CONTAINER_IAM="${DOCKER_CONTAINER_IAM:-${COMPOSE_PROJECT_NAME}-iam-1}"
readonly CONTAINER_DB="${DOCKER_CONTAINER_DB:-${COMPOSE_PROJECT_NAME}-db-1}"
readonly CONTAINER_DBPOOL_SESSION="${DOCKER_CONTAINER_DBPOOL_SESSION:-${COMPOSE_PROJECT_NAME}-dbpool-session-1}"
readonly CONTAINER_DBPOOL_APPS="${DOCKER_CONTAINER_DBPOOL_APPS:-${COMPOSE_PROJECT_NAME}-dbpool-apps-1}"

# ---------------------------------------------------------------------------
# Docker network
# ---------------------------------------------------------------------------
readonly NETWORK_NAME="${DOCKER_NETWORK:-athyper-internal}"

# ---------------------------------------------------------------------------
# Database names
# ---------------------------------------------------------------------------
readonly DB_NAME_APPS="${DB_NAME_APPS:-athyper_dev1}"
readonly DB_NAME_AUTH="${DB_NAME_AUTH:-athyper_iam}"

# ---------------------------------------------------------------------------
# Default IAM database connection (fallback when container is not running)
# ---------------------------------------------------------------------------
readonly IAM_DB_DEFAULT_URL="${IAM_DB_DEFAULT_URL:-jdbc:postgresql://dbpool-session:6433/${DB_NAME_AUTH}}"
readonly IAM_DB_DEFAULT_USER="${IAM_DB_DEFAULT_USER:-athyperadmin}"

# ---------------------------------------------------------------------------
# Default app database connection parts (host-side, for seed-db.sh)
# ---------------------------------------------------------------------------
readonly APP_DB_DEFAULT_HOST="${APP_DB_DEFAULT_HOST:-localhost}"
readonly APP_DB_DEFAULT_PORT="${APP_DB_DEFAULT_PORT:-5432}"

# ---------------------------------------------------------------------------
# Terminal colours (safe no-ops when piped)
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  readonly CLR_GREEN='\033[0;32m'
  readonly CLR_YELLOW='\033[1;33m'
  readonly CLR_RED='\033[0;31m'
  readonly CLR_CYAN='\033[0;36m'
  readonly CLR_NC='\033[0m'
else
  readonly CLR_GREEN=''
  readonly CLR_YELLOW=''
  readonly CLR_RED=''
  readonly CLR_CYAN=''
  readonly CLR_NC=''
fi
