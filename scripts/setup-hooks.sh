#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# setup-hooks.sh — athyper
# Configures local git to use the team's shared hooks in .githooks/
#
# Run once after cloning:
#   bash scripts/setup-hooks.sh
# ─────────────────────────────────────────────────────────────

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"

if [ -z "$REPO_ROOT" ]; then
  echo "Error: must be run from inside the athyper git repository."
  exit 1
fi

HOOKS_DIR="$REPO_ROOT/.githooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "Error: .githooks directory not found at $HOOKS_DIR"
  exit 1
fi

# Make all hooks executable
chmod +x "$HOOKS_DIR"/*

# Point git to the shared hooks directory
git config core.hooksPath .githooks

echo ""
echo "  ✔  Git hooks configured."
echo "     core.hooksPath = .githooks"
echo ""
echo "  Active hooks:"
for hook in "$HOOKS_DIR"/*; do
  echo "     - $(basename "$hook")"
done
echo ""
echo "  Branch workflow enforced:"
echo "     • No direct commits to 'main'"
echo "     • No direct pushes to 'main'"
echo "     • All changes via feature branch + Pull Request"
echo ""
