#!/usr/bin/env bash
# ============================================================
# athyper — Setup Environment Files
# Location:
#   stack/scripts/setup/setup-env.sh
#
# Usage:
#   setup-env.sh [environment] [target]
#
#   environment : local (default) | staging | production
#   target      : all (default)  | stack   | runtime | server | apps
#
#   Targets:
#     all     — stack + server + apps  (single-server / local dev)
#     stack   — stack Docker env only  (stack-only server)
#     runtime — server + apps          (split-server: app machine)
#     server  — server only
#     apps    — apps/web only
#
# Template resolution per target:
#   stack   → stack/env/{env}.env.example   (falls back to .env.example for local)
#   server  → server/{env}.env.example      (falls back to .env.example)
#   apps    → apps/web/{env}.env.example    (falls back to .env.example)
#
# Split-server deployment:
#   Stack machine  : setup-env.sh staging stack
#   Runtime machine: setup-env.sh staging runtime
#
# Examples:
#   ./setup-env.sh                      # local env, all targets
#   ./setup-env.sh local                # local env, all targets
#   ./setup-env.sh local server         # local env, server only
#   ./setup-env.sh staging runtime      # staging env, server + apps
#   ./setup-env.sh staging stack        # staging env, stack only
#   ./setup-env.sh production all       # production env, all targets
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT_DIR="$(cd "$STACK_DIR/.." && pwd)"
ENV_DIR="$STACK_DIR/env"
SERVER_DIR="$ROOT_DIR/server"
WEB_DIR="$ROOT_DIR/apps/web"

# ----------------------------
# Parse arguments
# ----------------------------
ENV_NAME="${1:-}"
TARGET="${2:-}"

if [[ -z "$ENV_NAME" ]]; then
  echo ""
  echo "Available environments: local, staging, production"
  read -rp "Select environment (blank=local): " ENV_NAME
  ENV_NAME="${ENV_NAME:-local}"
fi

if [[ -z "$TARGET" ]]; then
  echo ""
  echo "Available targets: all, stack, runtime, server, apps"
  read -rp "Select target (blank=all): " TARGET
  TARGET="${TARGET:-all}"
fi

# ----------------------------
# Validate
# ----------------------------
case "$ENV_NAME" in
  local|staging|production) ;;
  *)
    echo "ERROR: Invalid environment \"$ENV_NAME\". Must be: local, staging, or production"
    exit 1
    ;;
esac

case "$TARGET" in
  all|stack|runtime|server|apps) ;;
  *)
    echo "ERROR: Invalid target \"$TARGET\". Must be: all, stack, runtime, server, or apps"
    exit 1
    ;;
esac

# ----------------------------
# resolve_template <dir> <env> <fallback-name>
# Prints the resolved template path, or exits with error.
# ----------------------------
resolve_template() {
  local dir="$1"
  local env="$2"
  local fallback="$3"   # filename of the fallback template (e.g. ".env.example")
  local label="$4"

  local primary="$dir/${env}.env.example"
  local fallback_path="$dir/${fallback}"

  if [[ -f "$primary" ]]; then
    echo "$primary"
  elif [[ -f "$fallback_path" ]]; then
    echo "$fallback_path"
  else
    echo "ERROR: No template found for [$label] environment=$env" >&2
    echo "  Tried: $primary" >&2
    echo "  Tried: $fallback_path" >&2
    exit 1
  fi
}

# ----------------------------
# backup_and_copy <src> <dst> <label>
# ----------------------------
backup_and_copy() {
  local src="$1"
  local dst="$2"
  local label="$3"

  if [[ -f "$dst" ]]; then
    local ts
    ts="$(date +%Y%m%d-%H%M%S)"
    cp "$dst" "${dst}.bak.$ts"
    echo "  Backing up $label → ${dst}.bak.$ts"
  fi
  cp "$src" "$dst"
  echo "  [$label]"
  echo "    src : $src"
  echo "    dst : $dst"
}

# ----------------------------
# setup_stack
# ----------------------------
setup_stack() {
  local template
  template="$(resolve_template "$ENV_DIR" "$ENV_NAME" ".env.example" "stack")"
  backup_and_copy "$template" "$ENV_DIR/.env" "stack"
}

# ----------------------------
# setup_server
# ----------------------------
setup_server() {
  if [[ "$ENV_NAME" == "local" && -f "$SERVER_DIR/.env.example" ]]; then
    backup_and_copy "$SERVER_DIR/.env.example" "$SERVER_DIR/.env" "server"
    return 0
  fi
  if [[ "$ENV_NAME" == "local" ]]; then
    echo "  [server] skipped — api-up.sh reads stack/env/.env directly (no server/.env needed)"
    return 0
  fi
  local template
  template="$(resolve_template "$SERVER_DIR" "$ENV_NAME" ".env.example" "server")"
  backup_and_copy "$template" "$SERVER_DIR/.env" "server"
}

# ----------------------------
# setup_apps
# ----------------------------
setup_apps() {
  if [[ "$ENV_NAME" == "local" ]]; then
    echo "  [apps/web] skipped — web-up.sh reads stack/env/.env directly (no .env.local needed)"
    return 0
  fi
  local template
  template="$(resolve_template "$WEB_DIR" "$ENV_NAME" ".env.example" "apps/web")"
  backup_and_copy "$template" "$WEB_DIR/.env.local" "apps/web"
}

# ----------------------------
# Run
# ----------------------------
echo ""
echo "=================================="
echo "Environment : $ENV_NAME"
echo "Target      : $TARGET"
echo "=================================="
echo ""

case "$TARGET" in
  all)
    setup_stack
    setup_server
    setup_apps
    ;;
  stack)   setup_stack  ;;
  runtime)
    setup_server
    setup_apps
    ;;
  server)  setup_server ;;
  apps)    setup_apps   ;;
esac

echo ""
echo "Done."
echo ""
echo "Next steps:"
[[ "$TARGET" == "all" || "$TARGET" == "stack" ]] && echo "  • stack    : Open stack/env/.env and fill in any \${VAR} placeholders."
if [[ "$ENV_NAME" == "local" ]]; then
  [[ "$TARGET" == "all" || "$TARGET" == "runtime" || "$TARGET" == "server" ]] && echo "  • server   : Generated server/.env is for direct pnpm dev / IDE runs."
  [[ "$TARGET" == "all" ]] && echo "  • api-up.sh / web-up.sh still load stack/env/.env directly."
else
  [[ "$TARGET" == "all" || "$TARGET" == "runtime" || "$TARGET" == "server" ]] && echo "  • server   : Open server/.env — set credentials and external service URLs."
  [[ "$TARGET" == "all" || "$TARGET" == "runtime" || "$TARGET" == "apps"   ]] && echo "  • apps/web : Open apps/web/.env.local — verify RUNTIME_API_URL and KEYCLOAK_BASE_URL."
fi
echo ""
