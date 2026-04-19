#!/usr/bin/env bash
# =======================================================================
# Shared .env + IAM credential helpers — sourced by db/*.sh scripts.
#
# Provides:
#   init_stack_env "$STACK_DIR"   — locate .env and set up env_val()
#   env_val KEY                   — read KEY from the resolved .env file
#   resolve_iam_credentials       — full IAM credential cascade
#
# Usage:
#   source "$(dirname "$0")/../lib/constants.sh"     # must come first
#   source "$(dirname "$0")/../lib/resolve-iam-credentials.sh"
#   init_stack_env "$STACK_DIR"
#   MY_VAR="$(env_val MY_KEY)"
#   resolve_iam_credentials
#   # → sets IAM_RESOLVED_URL, IAM_RESOLVED_USER, IAM_RESOLVED_PASS
# =======================================================================

# Ensure constants are loaded (guard inside constants.sh prevents double-load)
if [[ -z "${_ATHYPER_CONSTANTS_LOADED:-}" ]]; then
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/constants.sh"
fi

# Internal state — set by init_stack_env
_STACK_ENV_FILE=""
_STACK_ENV_DIR=""

# ---------------------------------------------------------------------------
# init_stack_env: locate .env (or .env.example fallback)
# ---------------------------------------------------------------------------
init_stack_env() {
  local stack_dir="${1:?init_stack_env: STACK_DIR argument required}"
  _STACK_ENV_DIR="${stack_dir}"
  if [[ -f "${stack_dir}/env/.env" ]]; then
    _STACK_ENV_FILE="${stack_dir}/env/.env"
  else
    _STACK_ENV_FILE="${stack_dir}/env/.env.example"
  fi
}

# ---------------------------------------------------------------------------
# env_val: read a single key from the resolved .env file
# ---------------------------------------------------------------------------
env_val() {
  local key="${1:?env_val: KEY argument required}"
  grep -E "^${key}=" "$_STACK_ENV_FILE" 2>/dev/null \
    | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'"
}

# ---------------------------------------------------------------------------
# resolve_iam_credentials
#   Resolution order (first non-empty wins):
#     1. Running Keycloak container env vars (KC_DB_*)
#     2. Shell environment variables (IAM_DB_*)
#     3. .env file (IAM_DB_PASSWORD key)
#   Sets: IAM_RESOLVED_URL, IAM_RESOLVED_USER, IAM_RESOLVED_PASS
# ---------------------------------------------------------------------------
resolve_iam_credentials() {
  # Start with shell env vars → .env fallback
  IAM_RESOLVED_URL="${IAM_DB_URL:-$(env_val IAM_DB_URL)}"
  IAM_RESOLVED_URL="${IAM_RESOLVED_URL:-$IAM_DB_DEFAULT_URL}"
  IAM_RESOLVED_USER="${IAM_DB_USERNAME:-$(env_val IAM_DB_USERNAME)}"
  IAM_RESOLVED_USER="${IAM_RESOLVED_USER:-$IAM_DB_DEFAULT_USER}"
  IAM_RESOLVED_PASS="${IAM_DB_PASSWORD:-}"

  # Step 1: Try reading from running KC container (preferred — always fresh)
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$CONTAINER_IAM"; then
    local c_url c_user c_pass
    c_url=$(docker exec "$CONTAINER_IAM" printenv KC_DB_URL 2>/dev/null || echo "")
    c_user=$(docker exec "$CONTAINER_IAM" printenv KC_DB_USERNAME 2>/dev/null || echo "")
    c_pass=$(docker exec "$CONTAINER_IAM" printenv KC_DB_PASSWORD 2>/dev/null || echo "")
    [[ -n "$c_url" ]]  && IAM_RESOLVED_URL="$c_url"
    [[ -n "$c_user" ]] && IAM_RESOLVED_USER="$c_user"
    [[ -n "$c_pass" ]] && IAM_RESOLVED_PASS="$c_pass"
  fi

  # Step 2: Fall back to .env file if password still empty
  if [[ -z "$IAM_RESOLVED_PASS" ]]; then
    IAM_RESOLVED_PASS="$(env_val IAM_DB_PASSWORD)"
  fi

  # Step 3: Fail if password is still empty
  if [[ -z "$IAM_RESOLVED_PASS" ]]; then
    echo -e "\033[0;31mError: Cannot determine IAM database password\033[0m"
    echo -e "\033[1;33mSet IAM_DB_PASSWORD in stack/env/.env or as an environment variable\033[0m"
    return 1
  fi

  export IAM_RESOLVED_URL IAM_RESOLVED_USER IAM_RESOLVED_PASS
}
