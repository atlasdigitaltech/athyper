#!/usr/bin/env bash
# ============================================================
# athyper - Docker STOP - Linux/macOS
# Location: stack/scripts/docker/stop.sh
#
# Gracefully stops the Docker engine.
#   macOS  -> quits Docker Desktop via osascript
#   Linux  -> stops Docker Engine via systemctl
# ============================================================

set -euo pipefail

if ! docker version >/dev/null 2>&1; then
  echo "Docker is not running."
  exit 0
fi

echo ""
echo "Stopping Docker..."

if [[ "$OSTYPE" == "darwin"* ]]; then
  osascript -e 'quit app "Docker"' 2>/dev/null || true
  echo "Docker Desktop stop initiated."
else
  sudo systemctl stop docker
  echo "Docker stopped via systemctl."
fi

echo ""
