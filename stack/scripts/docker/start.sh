#!/usr/bin/env bash
# ============================================================
# athyper - Docker START - Linux/macOS
# Location: stack/scripts/docker/start.sh
#
# Starts the Docker engine and waits for the daemon to be ready.
#   macOS  -> starts Docker Desktop via `open -a Docker`
#   Linux  -> starts Docker Engine via systemctl
# ============================================================

set -euo pipefail

if docker version >/dev/null 2>&1; then
  echo "Docker is already running."
  echo ""
  docker version
  exit 0
fi

echo ""
echo "Starting Docker..."

if [[ "$OSTYPE" == "darwin"* ]]; then
  open -a Docker
  echo "Waiting for Docker daemon (this may take up to 60 seconds)..."
  ATTEMPTS=0
  while ! docker version >/dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [[ $ATTEMPTS -gt 40 ]]; then
      echo ""
      echo "ERROR: Docker did not become ready within 120 seconds."
      echo "Check Docker Desktop manually, then re-run."
      exit 1
    fi
    sleep 3
  done
  echo ""
  echo "Docker is ready (took ~$((ATTEMPTS * 3)) seconds)."
  echo ""
  docker version
else
  sudo systemctl start docker
  echo "Docker started via systemctl."
  echo ""
  docker version
fi
