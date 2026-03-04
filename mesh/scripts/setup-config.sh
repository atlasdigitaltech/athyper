#!/usr/bin/env bash
# ============================================================
# athyper Mesh - Setup Kernel Config File
# Location:
#   mesh/scripts/setup-config.sh
# Usage:
#   ./setup-config.sh              -> prompted for environment
#   ./setup-config.sh local        -> copies kernel.config.local.parameter.json
#   ./setup-config.sh staging      -> copies kernel.config.staging.parameter.json
#   ./setup-config.sh production   -> copies kernel.config.production.parameter.json
# ============================================================

set -euo pipefail

# ----------------------------
# Resolve base directories
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$MESH_DIR/config/apps/athyper"
TARGET_FILE="$CONFIG_DIR/kernel.config.parameter.json"

# ----------------------------
# Determine environment
# ----------------------------
ENV_NAME="${1:-}"

if [[ -z "$ENV_NAME" ]]; then
  echo ""
  echo "Available environments: local, staging, production"
  echo ""
  read -p "Select environment (blank=local): " ENV_NAME
  ENV_NAME="${ENV_NAME:-local}"
fi

# ----------------------------
# Validate environment name
# ----------------------------
case "$ENV_NAME" in
  local|staging|production) ;;
  *)
    echo "ERROR: Invalid environment \"$ENV_NAME\". Must be: local, staging, or production"
    exit 1
    ;;
esac

# ----------------------------
# Resolve template file
# ----------------------------
TEMPLATE="$CONFIG_DIR/kernel.config.${ENV_NAME}.parameter.json"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "ERROR: Template not found: $TEMPLATE"
  echo ""
  echo "Available templates:"
  ls -1 "$CONFIG_DIR"/kernel.config.*.parameter.json 2>/dev/null || echo "(none found)"
  exit 1
fi

# ----------------------------
# Backup existing config if present
# ----------------------------
if [[ -f "$TARGET_FILE" ]]; then
  echo "Backing up existing kernel.config.parameter.json to kernel.config.parameter.json.bak ..."
  cp "$TARGET_FILE" "$TARGET_FILE.bak"
fi

# ----------------------------
# Copy template to target
# ----------------------------
cp "$TEMPLATE" "$TARGET_FILE"

echo ""
echo "=========================="
echo "Environment : $ENV_NAME"
echo "Template    : $TEMPLATE"
echo "Target      : $TARGET_FILE"
echo "=========================="
echo ""
echo "Done: kernel.config.parameter.json created for \"$ENV_NAME\" environment."
