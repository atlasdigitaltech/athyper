#!/usr/bin/env bash
# ============================================================
# athyper Mesh - Setup Environment File
# Location:
#   mesh/scripts/setup-env.sh
# Usage:
#   ./setup-env.sh              -> prompted for environment
#   ./setup-env.sh local        -> copies local.env.example to .env
#   ./setup-env.sh staging      -> copies staging.env.example to .env
#   ./setup-env.sh production   -> copies production.env.example to .env
# ============================================================

set -euo pipefail

# ----------------------------
# Resolve base directories
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_DIR="$MESH_DIR/env"
ENV_FILE="$ENV_DIR/.env"

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
case "$ENV_NAME" in
  local)      TEMPLATE="$ENV_DIR/local.env.example" ;;
  staging)    TEMPLATE="$ENV_DIR/staging.env.example" ;;
  production) TEMPLATE="$ENV_DIR/production.env.example" ;;
esac

if [[ ! -f "$TEMPLATE" ]]; then
  echo "ERROR: Template not found: $TEMPLATE"
  echo ""
  echo "Available templates:"
  ls -1 "$ENV_DIR"/*.example 2>/dev/null || echo "(none found)"
  exit 1
fi

# ----------------------------
# Backup existing .env if present
# ----------------------------
if [[ -f "$ENV_FILE" ]]; then
  echo "Backing up existing .env to .env.bak ..."
  cp "$ENV_FILE" "$ENV_FILE.bak"
fi

# ----------------------------
# Copy template to .env
# ----------------------------
cp "$TEMPLATE" "$ENV_FILE"

echo ""
echo "=========================="
echo "Environment : $ENV_NAME"
echo "Template    : $TEMPLATE"
echo "Target      : $ENV_FILE"
echo "=========================="
echo ""
echo "Done: .env created for \"$ENV_NAME\" environment."
