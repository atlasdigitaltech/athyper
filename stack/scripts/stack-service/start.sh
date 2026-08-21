#!/usr/bin/env bash
# ============================================================
# athyper Stack - CONTAINER START - Linux/macOS
# Location: stack/scripts/stack-service/start.sh
# Usage:
#   ./start.sh iam                 -> start by alias
#   ./start.sh db redis gateway    -> start multiple at once
#   ./start.sh athyper-iam-1 -> raw container name passthrough
#
# Aliases (case-insensitive; also accepts raw container names):
#   iam                        -> Keycloak          (athyper-iam-1)
#   db                         -> Postgres          (athyper-db-1)
#   dbpool-session             -> PgBouncer session (athyper-dbpool-session-1)
#   dbpool-apps                -> PgBouncer apps    (athyper-dbpool-apps-1)
#   gateway | traefik          -> Traefik ingress   (athyper-gateway-1)
#   redis | cache | memorycache -> Redis cache      (athyper-memorycache-1)
#   minio | storage            -> MinIO object store (athyper-objectstorage-1)
#   mail | mailtrap            -> mailtrap          (athyper-mailtrap-1)
#   web | frontend | neon      -> Neon frontend     (${COMPOSE_PROJECT_NAME}-neon-web-1)
#   mesh                       -> Mesh frontend     (${COMPOSE_PROJECT_NAME}-mesh-web-1)
#   admin                      -> Studio frontend    (${COMPOSE_PROJECT_NAME}-studio-web-1)
#   api | backend              -> Backend API       (${COMPOSE_PROJECT_NAME}-api-1)
#   search | searchcore        -> searchcore        (athyper-searchcore-1)
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
    gateway|traefik)         echo "${CONTAINER_GATEWAY}" ;;
    redis|cache|memorycache) echo "${CONTAINER_MEMORYCACHE}" ;;
    minio|storage)           echo "${CONTAINER_OBJECTSTORAGE}" ;;
    mail|mailtrap)           echo "${CONTAINER_MAILTRAP}" ;;
    web|frontend|neon)       echo "${CONTAINER_NEON_WEB}" ;;
    mesh)                    echo "${CONTAINER_MESH_WEB}" ;;
    admin)                   echo "${CONTAINER_STUDIO_WEB}" ;;
    api|backend)             echo "${CONTAINER_API}" ;;
    search|searchcore)       echo "${CONTAINER_SEARCHCORE}" ;;
    *)                       echo "$1" ;;
  esac
}

if [[ $# -eq 0 ]]; then
  echo "Usage: $(basename "$0") <alias|name> [alias|name ...]"
  echo "Aliases: iam  db  dbpool-session  dbpool-apps  gateway  redis  minio  mail  web  neon  mesh  studio  api  search"
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
