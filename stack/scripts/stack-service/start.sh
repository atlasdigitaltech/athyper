#!/usr/bin/env bash
# ============================================================
# athyper Stack - CONTAINER START - Linux/macOS
# Location: stack/scripts/stack-service/start.sh
# Usage:
#   ./start.sh iam                 -> start by alias
#   ./start.sh db redis gateway    -> start multiple at once
#   ./start.sh athyper-stack-iam-1 -> raw container name passthrough
#
# Aliases:
#   iam         Keycloak          (athyper-stack-iam-1)
#   db          Postgres          (athyper-stack-db-1)
#   dbpool-session PgBouncer session (athyper-stack-dbpool-session-1)
#   dbpool-apps PgBouncer apps    (athyper-stack-dbpool-apps-1)
#   gateway     Traefik ingress   (athyper-stack-gateway-1)
#   redis       Redis cache       (athyper-stack-memorycache-1)
#   minio       MinIO storage     (athyper-stack-objectstorage-1)
#   mail        Mailhog           (athyper-stack-mailhog-1)
#   web         Next.js frontend  (athyper-stack-athyper-neon-web-1)
#   api         Backend API       (athyper-stack-athyper-api-1)
#   search      Meilisearch       (athyper-stack-meilisearch-1)
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

if [[ $# -eq 0 ]]; then
  echo "Usage: $(basename "$0") <alias|name> [alias|name ...]"
  echo "Aliases: iam  db  dbpool-session  dbpool-apps  gateway  redis  minio  mail  web  api  search"
  exit 1
fi

docker version &>/dev/null || { echo "ERROR: Docker is not running. Start Docker and re-run."; exit 1; }

for arg in "$@"; do
  name="$(_resolve "$arg")"
  echo "Starting: $name"
  docker start "$name"
done

echo ""
echo "Done."
