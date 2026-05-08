#!/usr/bin/env bash
# ============================================================
# athyper Stack — Config Deploy Script
# Location:
#   stack/scripts/setup/setup-config.sh
# Usage:
#   ./setup-config.sh [local|staging|production] [--diff|--update]
#
# Modes:
#   (no flag)   First-deploy: copy each file only if absent. Safe to re-run.
#   --diff      Report which live files differ from templates. No writes.
#   --update    Update repo-managed files automatically (with backup);
#               prompt before operator-edited files.
#
# Operator-edited files — never auto-updated; --update will prompt:
#   gateway/dynamic/athyper.tls.yml
#   gateway/dynamic/athyper.workbench.yml
#   gateway/dynamic/athyper.api.yml
#
# Env-variant files — staging/production select environment-specific
# source templates (e.g. cache.staging.conf → cache.conf).
#
# MANIFEST — written to the parent of ATHYPER_CONFIG_ROOT on the server
#   (e.g. /opt/stack/athyper/MANIFEST). Skipped when LIVE_CFG == REPO_CFG
#   (local dev, where both resolve to stack/config/).
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_CFG="$STACK_DIR/config"

# Target: server overrides ATHYPER_CONFIG_ROOT (or legacy ATHYPER_CONFIG) via
# systemd Environment= lines. Local dev falls back to the repo config dir.
LIVE_CFG="${ATHYPER_CONFIG_ROOT:-${ATHYPER_CONFIG:-$STACK_DIR/config}}"

# ── Environment name ─────────────────────────────────────────────────────────
ENV_NAME="${1:-}"
if [[ -z "$ENV_NAME" ]]; then
  echo ""
  echo "Available environments: local, staging, production"
  read -p "Select environment (blank=local): " ENV_NAME
  ENV_NAME="${ENV_NAME:-local}"
fi

case "$ENV_NAME" in
  local|staging|production) ;;
  *)
    echo "ERROR: Invalid environment \"$ENV_NAME\". Must be: local, staging, or production"
    exit 1
    ;;
esac

MODE="${2:-}"  # --diff | --update | (empty = first-deploy)

# MANIFEST location: parent of config root (e.g. /opt/stack/athyper)
STACK_RUNTIME_ROOT="$(dirname "$LIVE_CFG")"
MANIFEST_FILE="$STACK_RUNTIME_ROOT/MANIFEST"

# ── Operator-managed files (prompt before overwrite in --update mode) ─────────
OPERATOR_MANAGED=(
  "gateway/dynamic/athyper.tls.yml"
  "gateway/dynamic/athyper.workbench.yml"
  "gateway/dynamic/athyper.api.yml"
)

is_operator_managed() {
  local file="$1"
  for om in "${OPERATOR_MANAGED[@]}"; do [[ "$file" == "$om" ]] && return 0; done
  return 1
}

# ── Environment-specific source selection ─────────────────────────────────────
case "$ENV_NAME" in
  staging)
    MEMORYCACHE_SRC="memorycache/environments/cache.staging.conf"
    GOTENBERG_SRC="render/environments/gotenberg.staging.conf"
    TIKA_SRC="render/environments/tika-config.staging.xml"
    GATEWAY_TLS_SRC="gateway/environments/athyper.tls.staging.yml"
    WORKBENCH_SRC="gateway/environments/neon-workbench-routes.staging.yml"
    ;;
  production)
    MEMORYCACHE_SRC="memorycache/environments/cache.production.conf"
    GOTENBERG_SRC="render/environments/gotenberg.production.conf"
    TIKA_SRC="render/environments/tika-config.production.xml"
    GATEWAY_TLS_SRC="gateway/environments/athyper.tls.production.yml"
    WORKBENCH_SRC="gateway/environments/neon-workbench-routes.prod.yml"
    ;;
  *)
    # local: env-variant files happen to be the same as the canonical files
    MEMORYCACHE_SRC="memorycache/cache.conf"
    GOTENBERG_SRC="render/gotenberg.conf"
    TIKA_SRC="render/tika-config.xml"
    GATEWAY_TLS_SRC="gateway/dynamic/athyper.tls.yml"
    WORKBENCH_SRC="gateway/dynamic/athyper.workbench.yml"
    ;;
esac

# ── FILE_MAP: source (relative to REPO_CFG) → dest (relative to LIVE_CFG) ────
# Declare separately to avoid bash 3 associative-array issues (macOS ships bash 3).
declare -A FILE_MAP

# apps — kernel config (env-specific template → canonical runtime file)
FILE_MAP["apps/kernel.config.${ENV_NAME}.parameter.json"]="apps/kernel.config.parameter.json"

# gateway — operator-managed; deployed once, then operator edits live copy
FILE_MAP["$GATEWAY_TLS_SRC"]="gateway/dynamic/athyper.tls.yml"
FILE_MAP["$WORKBENCH_SRC"]="gateway/dynamic/athyper.workbench.yml"
FILE_MAP["gateway/dynamic/athyper.api.yml"]="gateway/dynamic/athyper.api.yml"

# db — env-specific postgres configs (compose mounts db/${ENVIRONMENT:-local}/* so each
# environment gets its own tuned postgresql.conf, pg_hba.conf, and init-databases.sh)
FILE_MAP["db/${ENV_NAME}/postgresql.conf"]="db/${ENV_NAME}/postgresql.conf"
FILE_MAP["db/${ENV_NAME}/pg_hba.conf"]="db/${ENV_NAME}/pg_hba.conf"
FILE_MAP["db/${ENV_NAME}/init-databases.sh"]="db/${ENV_NAME}/init-databases.sh"

# db pgbouncer configs — local uses flat dbpool/, staging/production use env-specific paths
# (DBPOOL_APPS_CONFIG / DBPOOL_SESSION_CONFIG in .env point to the correct subpath)
if [[ "$ENV_NAME" == "local" ]]; then
  FILE_MAP["db/local/dbpool/pgbouncer-apps.ini"]="db/local/dbpool/pgbouncer-apps.ini"
  FILE_MAP["db/local/dbpool/pgbouncer-auth.ini"]="db/local/dbpool/pgbouncer-auth.ini"
  FILE_MAP["db/local/dbpool/pgbouncer-session.ini"]="db/local/dbpool/pgbouncer-session.ini"
  FILE_MAP["db/local/dbpool/userlist.txt"]="db/local/dbpool/userlist.txt"
else
  FILE_MAP["db/${ENV_NAME}/dbpool/apps/pgbouncer-apps.ini"]="db/${ENV_NAME}/dbpool/apps/pgbouncer-apps.ini"
  FILE_MAP["db/${ENV_NAME}/dbpool/session/pgbouncer-session.ini"]="db/${ENV_NAME}/dbpool/session/pgbouncer-session.ini"
fi

# iam — realm JSON (themes copied as a directory below)
FILE_MAP["iam/realm-demosetup.json"]="iam/realm-demosetup.json"
FILE_MAP["iam/realm-platform-control.json"]="iam/realm-platform-control.json"

# memorycache — env-variant selects staging/production conf
# redis-acl.conf is seeded from the .tpl (tokens intact) so that
# validate-env.sh can render the password hashes in-place before stack start.
FILE_MAP["$MEMORYCACHE_SRC"]="memorycache/cache.conf"
FILE_MAP["memorycache/redis-acl.conf.tpl"]="memorycache/redis-acl.conf"

# telemetry — repo-managed (safe to auto-update)
FILE_MAP["telemetry/logging/config.yml"]="telemetry/logging/config.yml"
FILE_MAP["telemetry/logging/alloy.alloy"]="telemetry/logging/alloy.alloy"
FILE_MAP["telemetry/alertmanager/config.yml.tpl"]="telemetry/alertmanager/config.yml.tpl"
FILE_MAP["telemetry/metrics/config.yml"]="telemetry/metrics/config.yml"
FILE_MAP["telemetry/metrics/governance-alerts.yml"]="telemetry/metrics/governance-alerts.yml"
FILE_MAP["telemetry/metrics/redis-alerts.yml"]="telemetry/metrics/redis-alerts.yml"
FILE_MAP["telemetry/metrics/document-registry-alerts.yml"]="telemetry/metrics/document-registry-alerts.yml"
FILE_MAP["telemetry/metrics/document-registry-slo.yml"]="telemetry/metrics/document-registry-slo.yml"
FILE_MAP["telemetry/tracing/config.yml"]="telemetry/tracing/config.yml"
# Grafana: env-specific dashboard provisioning config
FILE_MAP["telemetry/provisioning.env/dashboards.${ENV_NAME}.yml"]="telemetry/provisioning.env/dashboards.${ENV_NAME}.yml"

# render — env-variant selects staging/production conf
FILE_MAP["$GOTENBERG_SRC"]="render/gotenberg.conf"
FILE_MAP["$TIKA_SRC"]="render/tika-config.xml"

# ── Directory copies (whole subtree) ─────────────────────────────────────────
declare -a DIR_COPIES=(
  "iam/themes/neon"
  "telemetry/provisioning"
)

# ── Helper functions ──────────────────────────────────────────────────────────
copy_if_absent() {
  local src="$1" dst="$2"
  [[ "$src" == "$dst" ]] && return 0   # local dev: source == dest, skip
  if [[ ! -f "$dst" ]]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "  COPIED  $dst"
  else
    echo "  EXISTS  $(basename "$dst")  (skipped)"
  fi
}

backup_and_replace() {
  local src="$1" dst="$2"
  [[ "$src" == "$dst" ]] && return 0
  if [[ -f "$dst" ]]; then
    cp "$dst" "${dst}.bak.$(date +%Y%m%d-%H%M%S)"
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "  UPDATED $dst"
}

show_diff() {
  local src="$1" dst="$2" key="$3"
  if [[ "$src" == "$dst" ]]; then
    echo "  OK       $key  (local=repo)"
    return 0
  fi
  if [[ ! -f "$dst" ]]; then
    echo "  MISSING  $key"
  elif ! diff -q "$src" "$dst" &>/dev/null; then
    echo "  DRIFTED  $key"
    [[ -n "${VERBOSE:-}" ]] && diff "$src" "$dst" || true
  else
    echo "  OK       $key"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
echo ""
echo "ENV_NAME = $ENV_NAME"
echo "REPO_CFG = $REPO_CFG"
echo "LIVE_CFG = $LIVE_CFG"
echo "MODE     = ${MODE:-first-deploy}"
echo ""

# ── Write-access pre-flight (server mode) ─────────────────────────────────────
# config/ is root:athyper-config; dirs 755, files 644.
# 755/644 so container processes (not in athyper-config) can traverse dirs and
# read :ro bind-mounted files. Only root can write (root-owned). This script
# applies ownership and modes automatically at the end of each write run.
# Abort here with a clear message rather than a cryptic "Permission denied" on the
# first cp.  Skipped for --diff (read-only) and for local dev (LIVE_CFG == REPO_CFG).
if [[ "$LIVE_CFG" != "$REPO_CFG" ]] && [[ "$MODE" != "--diff" ]]; then
  if [[ ! -w "$LIVE_CFG" ]]; then
    echo ""
    echo "ERROR: No write access to LIVE_CFG=$LIVE_CFG"
    echo ""
    echo "  On servers, config/ is root-owned (dirs 755, files 644) — only root can write."
    echo "  Run this script as root:"
    echo ""
    echo "    sudo ATHYPER_CONFIG_ROOT=\"$LIVE_CFG\" ATHYPER_SECRETS_ROOT=\"${ATHYPER_SECRETS_ROOT:-}\" \\"
    echo "      bash $0 $ENV_NAME"
    echo ""
    echo "  On servers, config/ is owned by root:athyper-config."
    echo "  Permissions (755/644) are applied automatically at the end of this script."
    echo ""
    echo "  See stack/docs/infrastructure-plan.md Phase 7 for the full procedure."
    exit 1
  fi
fi

for src_rel in "${!FILE_MAP[@]}"; do
  dst_rel="${FILE_MAP[$src_rel]}"
  src="$REPO_CFG/$src_rel"
  dst="$LIVE_CFG/$dst_rel"

  if [[ ! -f "$src" ]]; then
    echo "  WARN: template not found: $src_rel"
    continue
  fi

  case "$MODE" in
    --diff)
      show_diff "$src" "$dst" "$dst_rel"
      ;;
    --update)
      if is_operator_managed "$dst_rel"; then
        if [[ "$src" != "$dst" ]] && ! diff -q "$src" "$dst" &>/dev/null 2>&1; then
          read -p "  OPERATOR-MANAGED $dst_rel differs from template. Overwrite? [y/N] " ans
          [[ "${ans,,}" == "y" ]] && backup_and_replace "$src" "$dst" || echo "  SKIPPED $dst_rel"
        else
          echo "  OK      $dst_rel"
        fi
      else
        backup_and_replace "$src" "$dst"
      fi
      ;;
    *)
      copy_if_absent "$src" "$dst"
      ;;
  esac
done

# ── Directory copies ──────────────────────────────────────────────────────────
for dir_rel in "${DIR_COPIES[@]}"; do
  src_dir="$REPO_CFG/$dir_rel"
  dst_dir="$LIVE_CFG/$dir_rel"

  if [[ ! -d "$src_dir" ]]; then
    echo "  WARN: dir not found: $dir_rel"
    continue
  fi

  if [[ "$src_dir" == "$dst_dir" ]]; then
    echo "  EXISTS   $dir_rel  (local=repo)"
    continue
  fi

  case "$MODE" in
    --diff)
      diff -rq "$src_dir" "$dst_dir" &>/dev/null \
        && echo "  OK       $dir_rel" \
        || echo "  DRIFTED  $dir_rel"
      ;;
    --update)
      cp -r "$src_dir/." "$dst_dir/"
      echo "  UPDATED  $dir_rel"
      ;;
    *)
      if [[ ! -d "$dst_dir" ]]; then
        cp -r "$src_dir" "$dst_dir"
        echo "  COPIED   $dir_rel"
      else
        echo "  EXISTS   $dir_rel  (skipped)"
      fi
      ;;
  esac
done

# ── MANIFEST ──────────────────────────────────────────────────────────────────
# Written on server only (LIVE_CFG != REPO_CFG). Preserves initialized_at and
# initialized_from_commit across runs so first-boot timestamp is not overwritten.
if [[ "$LIVE_CFG" != "$REPO_CFG" ]] && [[ -d "$STACK_RUNTIME_ROOT" ]]; then
  GIT_SHA="$(git -C "$STACK_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  INIT_AT="$(grep -m1 '^initialized_at=' "$MANIFEST_FILE" 2>/dev/null | cut -d= -f2- || date -Iseconds)"
  INIT_COMMIT="$(grep -m1 '^initialized_from_commit=' "$MANIFEST_FILE" 2>/dev/null | cut -d= -f2- || echo "$GIT_SHA")"
  PRODUCT_ROOT="$(cd "$STACK_DIR/../.." && pwd)"
  cat > "$MANIFEST_FILE" <<EOF
product_root=$PRODUCT_ROOT
initialized_at=$INIT_AT
initialized_from_commit=$INIT_COMMIT
last_setup_config_run=$(date -Iseconds)
last_setup_config_commit=$GIT_SHA
schema_version=11
EOF
  echo ""
  echo "MANIFEST updated: $MANIFEST_FILE"
fi

# ── Config tree permissions (server mode) ─────────────────────────────────────
# Applied after every write run so re-runs after manual edits always leave the
# tree in the correct state.  Skipped for --diff and local dev.
#
# dirs 755: container processes (UID 999 etc.) need +x to traverse bind-mount
#           paths even when they are not in the athyper-config group.
# files 644: container processes need +r to read mounted :ro config files.
# Secrets tree (/opt/stack/athyper/secrets) is never touched here — it stays
# at 750 dirs / 600 files.
if [[ "$LIVE_CFG" != "$REPO_CFG" ]] && [[ "$MODE" != "--diff" ]]; then
  echo ""
  echo "Locking config tree permissions..."
  chown -R root:athyper-config "$LIVE_CFG"
  find "$LIVE_CFG" -type d -exec chmod 755 {} \;
  find "$LIVE_CFG" -type f -exec chmod 644 {} \;
  echo "  owner: root:athyper-config  dirs: 755  files: 644"

  # redis-acl.conf exception:
  #   - athyper owns the file so validate-env.sh (running as athyper) can write it.
  #   - Group svc-redis so the memorycache container (UID 9100) can read it via
  #     the :ro bind mount without world-read.
  #   - Mode 0640: no world-read (file contains SHA-256 password hashes).
  ACL_FILE="$LIVE_CFG/memorycache/redis-acl.conf"
  if [[ -f "$ACL_FILE" ]]; then
    chown athyper:svc-redis "$ACL_FILE"
    chmod 0640 "$ACL_FILE"
    echo "  owner: athyper:svc-redis 0640  $ACL_FILE"
  fi
fi

echo ""
echo "Done. Run with --diff to check for future drift."
