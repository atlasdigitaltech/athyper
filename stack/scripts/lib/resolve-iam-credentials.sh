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
  elif [[ "${ALLOW_ENV_EXAMPLE:-0}" == "1" ]]; then
    _STACK_ENV_FILE="${stack_dir}/env/.env.example"
  else
    echo "ERROR: Missing stack env file: ${stack_dir}/env/.env" >&2
    echo "Set ALLOW_ENV_EXAMPLE=1 if you intentionally want to use .env.example in CI smoke tests." >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# env_val: read a single key from the resolved .env file
#
# `|| true` on grep is required: callers run with `set -e -o pipefail`, and a
# missing key would otherwise propagate grep's exit-1 through the pipeline,
# making the assignment fail and killing the calling script before it can fall
# back to secrets/.env. This is the staging case where IAM_ADMIN_PASSWORD lives
# in secrets/.env, not stack/env/.env.
# ---------------------------------------------------------------------------
env_val() {
  local key="${1:?env_val: KEY argument required}"
  read_env_value "$_STACK_ENV_FILE" "$key"
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
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx -- "$CONTAINER_IAM"; then
    local c_url c_user c_pass
    if read -r c_url c_user c_pass < <(docker exec "$CONTAINER_IAM" sh -c 'printf "%s\t%s\t%s" "$KC_DB_URL" "$KC_DB_USERNAME" "$KC_DB_PASSWORD"' 2>/dev/null); then
      :
    else
      c_url=""
      c_user=""
      c_pass=""
    fi
    [[ -n "$c_url" ]]  && IAM_RESOLVED_URL="$c_url"
    [[ -n "$c_user" ]] && IAM_RESOLVED_USER="$c_user"
    [[ -n "$c_pass" ]] && IAM_RESOLVED_PASS="$c_pass"
  fi

  # Step 2: Fall back to .env file if password still empty
  if [[ -z "$IAM_RESOLVED_PASS" ]]; then
    IAM_RESOLVED_PASS="$(env_val IAM_DB_PASSWORD)"
  fi

  # Step 2.5: Try secrets/.env (staging/production — IAM_DB_PASSWORD lives there)
  if [[ -z "$IAM_RESOLVED_PASS" ]]; then
    local secrets_file="${ATHYPER_SECRETS_ROOT:-/opt/stack/athyper/secrets}/.env"
    if [[ -f "$secrets_file" ]]; then
      IAM_RESOLVED_PASS="$(read_env_value "$secrets_file" IAM_DB_PASSWORD 2>/dev/null || true)"
    fi
  fi

  # Step 3: Fail if password is still empty
  if [[ -z "$IAM_RESOLVED_PASS" ]]; then
    echo -e "${CLR_RED}Error: Cannot determine IAM database password${CLR_NC}" >&2
    echo -e "${CLR_YELLOW}Set IAM_DB_PASSWORD in stack/env/.env, secrets/.env, or as an environment variable${CLR_NC}" >&2
    return 1
  fi

  export IAM_RESOLVED_URL IAM_RESOLVED_USER IAM_RESOLVED_PASS
}
