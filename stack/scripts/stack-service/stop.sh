#!/usr/bin/env bash
# ============================================================
# athyper Stack - CONTAINER STOP - Linux/macOS
# Location: stack/scripts/stack-service/stop.sh
# Usage:
#   ./stop.sh iam                  -> stop by alias
#   ./stop.sh db redis             -> stop multiple at once
#   ./stop.sh --time 30 gateway    -> graceful stop timeout (seconds)
#
# Aliases: iam  db  dbpool-session  dbpool-apps  gateway
#          redis  minio  mail  web  api  search
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/constants.sh"

_resolve() {
  case "$1" in
    iam)                     echo "${CONTAINER_IAM}" ;;
    db)                      echo "${CONTAINER_DB}" ;;
    dbpool-session)          echo "${CONTAINER_DBPOOL_SESSION}" ;;
    dbpool-apps)             echo "${CONTAINER_DBPOOL_APPS}" ;;
    gateway|traefik)         echo "${DOCKER_CONTAINER_GATEWAY:-athyper-stack-gateway-1}" ;;
    redis|cache|memorycache) echo "${DOCKER_CONTAINER_REDIS:-athyper-stack-memorycache-1}" ;;
    minio|storage)           echo "${DOCKER_CONTAINER_MINIO:-athyper-stack-objectstorage-1}" ;;
    mail|mailhog)            echo "${DOCKER_CONTAINER_MAIL:-athyper-stack-mailhog-1}" ;;
    web|frontend)            echo "${DOCKER_CONTAINER_WEB:-athyper-stack-athyper-neon-web-1}" ;;
    api|backend)             echo "${DOCKER_CONTAINER_API:-athyper-stack-athyper-api-1}" ;;
    search|meilisearch)      echo "${DOCKER_CONTAINER_SEARCH:-athyper-stack-meilisearch-1}" ;;
    *)                       echo "$1" ;;
  esac
}

TIME_ARG=""
TARGETS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --time|-t) TIME_ARG="--time $2"; shift 2 ;;
    *)         TARGETS+=("$1"); shift ;;
  esac
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "Usage: $(basename "$0") [--time N] <alias|name> [alias|name ...]"
  echo "Aliases: iam  db  dbpool-session  dbpool-apps  gateway  redis  minio  mail  web  api  search"
  exit 1
fi

docker version &>/dev/null || { echo "ERROR: Docker is not running. Start Docker and re-run."; exit 1; }

for arg in "${TARGETS[@]}"; do
  name="$(_resolve "$arg")"
  echo "Stopping: $name"
  # shellcheck disable=SC2086
  docker stop $TIME_ARG "$name"
done

echo ""
echo "Done."
