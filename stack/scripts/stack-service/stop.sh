#!/usr/bin/env bash
# ============================================================
# athyper Stack - CONTAINER STOP - Linux/macOS
# Location: stack/scripts/stack-service/stop.sh
# Usage:
#   ./stop.sh iam                  -> stop by alias
#   ./stop.sh db redis             -> stop multiple at once
#   ./stop.sh --time 30 gateway    -> graceful stop timeout (seconds)
#   ./stop.sh -t 30 gateway        -> same as above
#
# Aliases (case-insensitive; also accepts raw container names):
#   iam                        -> Keycloak          (athyper-iam-1)
#   db                         -> Postgres          (athyper-db-1)
#   dbpool-session             -> PgBouncer session (athyper-dbpool-session-1)
#   dbpool-apps                -> PgBouncer apps    (athyper-dbpool-apps-1)
#   gateway | traefik          -> Traefik ingress   (athyper-gateway-1)
#   redis | cache | memorycache -> Redis cache      (athyper-memorycache-1)
#   minio | storage            -> MinIO object store (athyper-objectstorage-1)
#   mail | mailhog             -> Mailhog           (athyper-mailhog-1)
#   web | frontend             -> Next.js frontend  (athyper-athyper-neon-web-1)
#   api | backend              -> Backend API       (athyper-athyper-api-1)
#   search | meilisearch       -> Meilisearch       (athyper-meilisearch-1)
#
# Container name prefix is derived from COMPOSE_PROJECT_NAME in stack/env/.env
# (defaults to athyper). Override per-container via DOCKER_CONTAINER_* env vars.
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
    gateway|traefik)         echo "${DOCKER_CONTAINER_GATEWAY:-athyper-gateway-1}" ;;
    redis|cache|memorycache) echo "${DOCKER_CONTAINER_REDIS:-athyper-memorycache-1}" ;;
    minio|storage)           echo "${DOCKER_CONTAINER_MINIO:-athyper-objectstorage-1}" ;;
    mail|mailhog)            echo "${DOCKER_CONTAINER_MAIL:-athyper-mailhog-1}" ;;
    web|frontend)            echo "${DOCKER_CONTAINER_WEB:-athyper-athyper-neon-web-1}" ;;
    api|backend)             echo "${DOCKER_CONTAINER_API:-athyper-athyper-api-1}" ;;
    search|meilisearch)      echo "${DOCKER_CONTAINER_SEARCH:-athyper-meilisearch-1}" ;;
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
