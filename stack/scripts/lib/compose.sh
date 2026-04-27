#!/usr/bin/env bash
# =======================================================================
# Shared Docker Compose helpers for stack lifecycle scripts (up/down/logs).
#
# Provides:
#   init_compose_env          — read ENVIRONMENT + STACK_PROFILE from .env
#   resolve_compose_override  — pick the correct override file
#   build_compose_file_list   — populate COMPOSE_FILE_ARGS array
#   docker_preflight          — verify Docker is reachable
#
# After sourcing, callers have access to:
#   STACK_DIR, COMPOSE_DIR, ENV_DIR, ENV_FILE,
#   ENVIRONMENT, STACK_PROFILE,
#   OVERRIDE (path to selected override file),
#   COMPOSE_FILE_ARGS (bash array of -f <file> args — safe with spaces)
#
# Usage:
#   source "$(dirname "$0")/../lib/compose.sh"
#   init_compose_env
#   resolve_compose_override
#   build_compose_file_list
#   docker_preflight
#   docker compose ... "${COMPOSE_FILE_ARGS[@]}" ...
# =======================================================================

# Guard: only load once per shell session
[[ -n "${_ATHYPER_COMPOSE_LOADED:-}" ]] && return 0
_ATHYPER_COMPOSE_LOADED=1

# ---------------------------------------------------------------------------
# Resolve base directories (caller must have SCRIPT_DIR set)
# ---------------------------------------------------------------------------
: "${SCRIPT_DIR:?compose.sh: SCRIPT_DIR must be set before sourcing}"

STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_DIR="$STACK_DIR/compose"
ENV_DIR="$STACK_DIR/env"

# Pre-read stack/env/.env for ATHYPER_*_ROOT overrides BEFORE applying fallbacks.
# Local dev: .env sets paths like D:/Stack/athyper/config so the six-var model
#   works on Windows without changing this lib file.
# Server: systemd Environment= lines are already in the shell environment, so
#   ${VAR:-} is non-empty → pre-read is a no-op, systemd values win.
_prereq_read_root_var() {
  local _var="$1" _line _val
  _line="$(grep -m1 "^${_var}=" "$ENV_DIR/.env" 2>/dev/null || true)"
  [[ -z "$_line" ]] && return 0
  _val="${_line#*=}"
  _val="${_val%%#*}"         # strip inline comment
  _val="${_val//\"/}"        # strip double-quotes
  _val="${_val//\'/}"        # strip single-quotes
  _val="${_val#"${_val%%[![:space:]]*}"}"  # ltrim
  _val="${_val%"${_val##*[![:space:]]}"}"  # rtrim
  [[ -z "${!_var:-}" && -n "$_val" ]] && export "$_var=$_val"
}
if [[ -f "$ENV_DIR/.env" ]]; then
  _prereq_read_root_var ATHYPER_CONFIG_ROOT
  _prereq_read_root_var ATHYPER_SECRETS_ROOT
  _prereq_read_root_var ATHYPER_DATA_ROOT
  _prereq_read_root_var ATHYPER_LOG_ROOT
  _prereq_read_root_var ATHYPER_BACKUP_ROOT
fi
unset -f _prereq_read_root_var

# Six env-var roots — each accepts an override so staging/production can set
# server paths (e.g. /opt/stack/athyper/*) via systemd Environment= lines without
# touching this file. Local dev falls back to repo-relative paths.
export ATHYPER_CONFIG_ROOT="${ATHYPER_CONFIG_ROOT:-$STACK_DIR/config}"
export ATHYPER_SECRETS_ROOT="${ATHYPER_SECRETS_ROOT:-}"    # empty → use ENV_DIR fallback below
export ATHYPER_DATA_ROOT="${ATHYPER_DATA_ROOT:-$STACK_DIR/data}"
export ATHYPER_LOG_ROOT="${ATHYPER_LOG_ROOT:-$STACK_DIR/logs}"
export ATHYPER_BACKUP_ROOT="${ATHYPER_BACKUP_ROOT:-$STACK_DIR/backups}"

# Backwards-compat aliases — compose bind mounts in 47 yml files still reference
# ${ATHYPER_CONFIG} and ${ATHYPER_DATA}; those variable names do not change.
export ATHYPER_CONFIG="$ATHYPER_CONFIG_ROOT"
export ATHYPER_DATA="$ATHYPER_DATA_ROOT"

# .env location: server uses ATHYPER_SECRETS_ROOT/.env; local dev uses stack/env/.env.
if [[ -n "${ATHYPER_SECRETS_ROOT:-}" ]]; then
  ENV_FILE="$ATHYPER_SECRETS_ROOT/.env"
else
  ENV_FILE="$ENV_DIR/.env"
fi

if [[ ! -d "$COMPOSE_DIR" ]]; then
  echo "ERROR: COMPOSE_DIR not found: $COMPOSE_DIR"
  exit 1
fi

# ---------------------------------------------------------------------------
# init_compose_env — read ENVIRONMENT + STACK_PROFILE from .env
#   Sets: ENVIRONMENT, STACK_PROFILE (module-level vars)
#   Returns 1 if .env not found (caller decides whether that's fatal)
# ---------------------------------------------------------------------------
ENVIRONMENT=""
STACK_PROFILE=""

init_compose_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi

  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    key=$(echo "$key" | xargs)
    [[ -z "$key" ]] && continue
    value=$(echo "$value" | sed 's/#.*//' | xargs | tr -d '"')
    case "$key" in
      ENVIRONMENT)   ENVIRONMENT="$value" ;;
      STACK_PROFILE) STACK_PROFILE="$value" ;;
    esac
  done < <(tr -d '\r' < "$ENV_FILE")
}

# ---------------------------------------------------------------------------
# resolve_compose_override — set OVERRIDE based on ENVIRONMENT
# ---------------------------------------------------------------------------
OVERRIDE=""

resolve_compose_override() {
  case "$ENVIRONMENT" in
    local)      OVERRIDE="$COMPOSE_DIR/athyper.override.local.yml" ;;
    staging)    OVERRIDE="$COMPOSE_DIR/athyper.override.staging.yml" ;;
    production) OVERRIDE="$COMPOSE_DIR/athyper.override.production.yml" ;;
    *)          OVERRIDE="$COMPOSE_DIR/athyper.override.yml" ;;
  esac

  if [[ ! -f "$OVERRIDE" ]]; then
    if [[ -f "$COMPOSE_DIR/athyper.dev.yml" ]]; then
      OVERRIDE="$COMPOSE_DIR/athyper.dev.yml"
    else
      OVERRIDE="$COMPOSE_DIR/athyper.prod.yml"
    fi
  fi
}

# ---------------------------------------------------------------------------
# build_compose_file_list — populate COMPOSE_FILE_ARGS as a bash array
#   Uses an array instead of a flat string to avoid word-splitting issues
#   when paths contain spaces.  (#12 fix)
# ---------------------------------------------------------------------------
COMPOSE_FILE_ARGS=()

build_compose_file_list() {
  COMPOSE_FILE_ARGS=()

  _add_file() {
    if [[ -f "$1" ]]; then
      COMPOSE_FILE_ARGS+=( -f "$1" )
    else
      echo "WARNING: compose file missing, skipping: $1"
    fi
  }

  _add_file "$COMPOSE_DIR/athyper.base.yml"
  _add_file "$COMPOSE_DIR/db/athyper-db.yml"
  _add_file "$COMPOSE_DIR/db/athyper-dbpool-apps.yml"
  _add_file "$COMPOSE_DIR/db/athyper-dbpool-session.yml"
  _add_file "$COMPOSE_DIR/security/athyper-socket-proxy-gateway.yml"
  _add_file "$COMPOSE_DIR/security/athyper-socket-proxy-logshipper.yml"
  _add_file "$COMPOSE_DIR/gateway/athyper-gateway.yml"
  _add_file "$COMPOSE_DIR/mail/athyper-mailhog.yml"
  _add_file "$COMPOSE_DIR/iam/athyper-iam.yml"
  _add_file "$COMPOSE_DIR/objectstorage/athyper-objectstorage.yml"
  _add_file "$COMPOSE_DIR/security/athyper-clamav.yml"
  _add_file "$COMPOSE_DIR/memorycache/athyper-memorycache.yml"
  _add_file "$COMPOSE_DIR/memorycache/athyper-memorycache-exporter.yml"
  _add_file "$COMPOSE_DIR/telemetry/athyper-metrics.yml"
  _add_file "$COMPOSE_DIR/telemetry/athyper-tracing.yml"
  _add_file "$COMPOSE_DIR/telemetry/athyper-logging.yml"
  _add_file "$COMPOSE_DIR/telemetry/athyper-logshipper.yml"
  _add_file "$COMPOSE_DIR/telemetry/athyper-telemetry.yml"
  _add_file "$COMPOSE_DIR/apps/athyper-apps.yml"
  _add_file "$COMPOSE_DIR/render/athyper-gotenberg.yml"
  _add_file "$COMPOSE_DIR/render/athyper-tika.yml"
  _add_file "$COMPOSE_DIR/search/athyper-meilisearch.yml"
  _add_file "$COMPOSE_DIR/monitoring/athyper-glitchtip.yml"
  _add_file "$COMPOSE_DIR/monitoring/athyper-healthchecks.yml"
  _add_file "$COMPOSE_DIR/monitoring/athyper-uptime-kuma.yml"
  _add_file "$COMPOSE_DIR/analytics/athyper-metabase.yml"
  _add_file "$COMPOSE_DIR/security/athyper-infisical.yml"
  _add_file "$COMPOSE_DIR/admin/athyper-bullboard.yml"
  _add_file "$COMPOSE_DIR/admin/athyper-pgweb.yml"
  _add_file "$COMPOSE_DIR/memorycache/athyper-memorycache-jobs.yml"
  _add_file "$OVERRIDE"

  unset -f _add_file
}

# ---------------------------------------------------------------------------
# docker_preflight — fail fast if Docker is unreachable
# ---------------------------------------------------------------------------
docker_preflight() {
  if ! docker version &>/dev/null; then
    echo "ERROR: Docker does not seem to be running or accessible."
    echo "Start Docker and re-run."
    exit 1
  fi
}
