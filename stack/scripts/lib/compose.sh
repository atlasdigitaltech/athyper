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

# env-parse.sh lives next to this file — resolve relative to BASH_SOURCE,
# not the caller's SCRIPT_DIR (which points at the caller's script dir).
if [[ -z "${_ATHYPER_ENV_PARSE_LOADED:-}" ]]; then
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env-parse.sh"
fi

# Pre-read stack/env/.env for ATHYPER_*_ROOT overrides BEFORE applying fallbacks.
# Local dev: .env sets paths like D:/Stack/athyper/config so the six-var model
#   works on Windows without changing this lib file.
# Server: systemd Environment= lines are already in the shell environment, so
#   ${VAR:-} is non-empty → pre-read is a no-op, systemd values win.
_prereq_read_root_var() {
  local _var="$1" _line _val
  _val="$(read_env_value "$ENV_DIR/.env" "$_var" || true)"
  [[ -z "$_val" ]] && return 0
  [[ -z "${!_var:-}" && -n "$_val" ]] && export "$_var=$_val"
}
if [[ -f "$ENV_DIR/.env" ]]; then
  _prereq_read_root_var ATHYPER_CONFIG_ROOT  || true
  _prereq_read_root_var ATHYPER_SECRETS_ROOT || true
  _prereq_read_root_var ATHYPER_DATA_ROOT    || true
  _prereq_read_root_var ATHYPER_LOG_ROOT     || true
  _prereq_read_root_var ATHYPER_BACKUP_ROOT  || true
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
_BOOTSTRAP_ENVIRONMENT="$(read_env_value "$ENV_DIR/.env" ENVIRONMENT || true)"
if [[ "$_BOOTSTRAP_ENVIRONMENT" != "local" && -n "${ATHYPER_SECRETS_ROOT:-}" ]]; then
  ENV_FILE="$ATHYPER_SECRETS_ROOT/.env"
else
  ENV_FILE="$ENV_DIR/.env"
fi
unset _BOOTSTRAP_ENVIRONMENT

# Build env-file arg list for all docker compose calls.
# Server mode (ENV_FILE != ENV_DIR/.env): pass bootstrap file first (provides non-secret
# staging config: memory limits, image tags, usernames, hostnames) then secrets file last
# so secrets win on any duplicate keys.
# Local dev (ENV_FILE == ENV_DIR/.env): single --env-file arg, no duplicate.
ENV_FILE_ARGS=()
if [[ -f "$ENV_DIR/.env" ]] && [[ "$ENV_DIR/.env" != "$ENV_FILE" ]]; then
  ENV_FILE_ARGS+=( --env-file "$ENV_DIR/.env" )
fi
ENV_FILE_ARGS+=( --env-file "$ENV_FILE" )

if [[ ! -d "$COMPOSE_DIR" ]]; then
  echo "ERROR: COMPOSE_DIR not found: $COMPOSE_DIR" >&2
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
  # ENVIRONMENT and STACK_PROFILE live in the bootstrap (ENV_DIR/.env). In
  # staging/prod the secrets file (ENV_FILE) is consulted only as a fallback —
  # it should not normally carry these keys, but reading it costs nothing and
  # avoids a confusing failure if someone duplicated them there.
  local _files=()
  [[ -f "$ENV_DIR/.env" ]] && _files+=( "$ENV_DIR/.env" )
  [[ "$ENV_FILE" != "$ENV_DIR/.env" && -f "$ENV_FILE" ]] && _files+=( "$ENV_FILE" )

  if [[ ${#_files[@]} -eq 0 ]]; then
    return 1
  fi

  ENVIRONMENT="$(read_env_value "${_files[0]}" ENVIRONMENT || true)"
  STACK_PROFILE="$(read_env_value "${_files[0]}" STACK_PROFILE || true)"
  if [[ ${#_files[@]} -gt 1 ]]; then
    ENVIRONMENT="${ENVIRONMENT:-$(read_env_value "${_files[1]}" ENVIRONMENT || true)}"
    STACK_PROFILE="${STACK_PROFILE:-$(read_env_value "${_files[1]}" STACK_PROFILE || true)}"
  fi
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
    *)
      echo "ERROR: Unrecognized ENVIRONMENT='$ENVIRONMENT'. Expected local|staging|production." >&2
      return 1
      ;;
  esac

  if [[ ! -f "$OVERRIDE" ]]; then
    echo "ERROR: Missing compose override file for ENVIRONMENT='$ENVIRONMENT': $OVERRIDE" >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# build_compose_file_list — populate COMPOSE_FILE_ARGS as a bash array
#   Uses an array instead of a flat string to avoid word-splitting issues
#   when paths contain spaces.  (#12 fix)
#
#   Also exports COMPOSE_PROFILES so every profiled service is visible to
#   Docker Compose during dependency validation (depends_on resolution).
#   Without this, services in inactive profiles appear as "no such service"
#   even when --no-deps is passed. Individual up/restart commands use
#   --no-deps to prevent actually starting the dependencies.
# ---------------------------------------------------------------------------
ALL_COMPOSE_PROFILES="admin,analytics,apps,core,db,dev,emergency,gateway,iam,memorycache,memorycache-jobs,monitoring,objectstorage,render,search,security-infisical,telemetry"
COMPOSE_FILE_ARGS=()

build_compose_file_list() {
  COMPOSE_FILE_ARGS=()

  # Activate all profiles so every service is reachable for depends_on
  # validation. The caller is responsible for using --no-deps when it only
  # wants to (re)start a single service without touching its dependencies.
  export COMPOSE_PROFILES="${COMPOSE_PROFILES:-$ALL_COMPOSE_PROFILES}"

  _add_file() {
    if [[ -f "$1" ]]; then
      COMPOSE_FILE_ARGS+=( -f "$1" )
    else
      echo "WARNING: compose file missing, skipping: $1" >&2
    fi
  }

  _add_file "$COMPOSE_DIR/compose.yml"
  _add_file "$OVERRIDE"
  unset -f _add_file
  return 0

  # Drift check: compare non-override files on disk vs the explicit list.
  # Overrides are excluded on both sides (multiple variants live on disk, but
  # only the active one is in the list — see _add_file above).
  local _actual_non_override_count
  _actual_non_override_count="$(find "$COMPOSE_DIR" -type f -name 'athyper*.yml' ! -name 'athyper.override*.yml' | wc -l | tr -d '[:space:]')"
  if [[ "$_actual_non_override_count" -ne "$_expected_non_override_count" ]]; then
    echo "WARNING: compose file drift detected in $COMPOSE_DIR. Expected $_expected_non_override_count tracked non-override files, found $_actual_non_override_count on disk." >&2
  fi

  unset -f _add_file
}

# ---------------------------------------------------------------------------
# docker_preflight — fail fast if Docker is unreachable
# ---------------------------------------------------------------------------
docker_preflight() {
  if ! docker version &>/dev/null; then
    echo "ERROR: Docker does not seem to be running or accessible." >&2
    echo "Start Docker and re-run." >&2
    exit 1
  fi
  if ! docker compose version &>/dev/null; then
    echo "ERROR: docker compose command is unavailable. Install or enable Docker Compose V2." >&2
    exit 1
  fi
}
