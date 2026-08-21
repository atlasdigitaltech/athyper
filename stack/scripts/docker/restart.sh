#!/usr/bin/env bash
# ============================================================
# athyper - Docker RESTART - Linux/macOS
# Location: stack/scripts/docker/restart.sh
#
# Stops the Docker engine, waits for it to exit, then starts
# it again and waits for the daemon to be ready.
#
#   macOS  -> stop:  osascript -e 'quit app "Docker"'
#             wait:  polls `docker version` at 2s intervals,
#                    up to 30 attempts (60 seconds max)
#             start: `open -a Docker`; polls at 3s intervals,
#                    up to 40 attempts (120 seconds max)
#   Linux  -> single `sudo systemctl restart docker` (no polling)
#
# If Docker is not running when called, the stop step is skipped.
# ============================================================

set -euo pipefail

if [[ "$OSTYPE" == "darwin"* ]]; then
  # ----------------------------
  # macOS: stop then start
  # ----------------------------
  if docker version >/dev/null 2>&1; then
    echo ""
    echo "Stopping Docker Desktop..."
    osascript -e 'quit app "Docker"' 2>/dev/null || true
    echo "Waiting for Docker to stop..."
    STOP_ATTEMPTS=0
    while docker version >/dev/null 2>&1; do
      STOP_ATTEMPTS=$((STOP_ATTEMPTS + 1))
      if [[ $STOP_ATTEMPTS -gt 30 ]]; then
        echo "WARNING: Docker did not stop within 60 seconds — continuing anyway."
        break
      fi
      sleep 2
    done
    echo "Docker stopped."
  else
    echo "Docker is not running — skipping stop step."
  fi

  echo ""
  echo "Starting Docker Desktop..."
  open -a Docker
  echo "Waiting for Docker daemon (this may take up to 60 seconds)..."
  ATTEMPTS=0
  while ! docker version >/dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [[ $ATTEMPTS -gt 40 ]]; then
      echo ""
      echo "ERROR: Docker did not become ready within 120 seconds."
      exit 1
    fi
    sleep 3
  done
  echo ""
  echo "Docker is ready (took ~$((ATTEMPTS * 3)) seconds)."
  echo ""
  docker version

else
  # ----------------------------
  # Linux: single systemctl restart
  # ----------------------------
  echo ""
  echo "Restarting Docker via systemctl..."
  sudo systemctl restart docker
  echo "Docker restarted."
  echo ""
  docker version
fi

echo ""
