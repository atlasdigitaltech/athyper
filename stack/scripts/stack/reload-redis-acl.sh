#!/usr/bin/env bash
# ============================================================
# athyper Stack - Reload Redis ACL into live memorycache container
# Location:
#   stack/scripts/stack/reload-redis-acl.sh
# Usage:
#   reload-redis-acl.sh [container_name]
#   Default container: athyper-memorycache-1
#
# Re-runs `ACL LOAD` inside the container so edits to the mounted
# redis-acl.conf take effect without restarting Redis (sessions stay).
# Reads REDIS_ADMIN_PASSWORD from stack/env/.env.
# ============================================================
set -euo pipefail

CONTAINER="${1:-athyper-memorycache-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$STACK_DIR/env/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

ADMIN_PWD="$(
  grep -E '^[[:space:]]*REDIS_ADMIN_PASSWORD=' "$ENV_FILE" \
    | head -n1 \
    | cut -d= -f2- \
    | sed -e 's/[[:space:]]*#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
)"

if [[ -z "$ADMIN_PWD" ]]; then
  echo "ERROR: REDIS_ADMIN_PASSWORD not set in $ENV_FILE" >&2
  exit 1
fi

echo "Reloading ACL in $CONTAINER..."
docker exec "$CONTAINER" redis-cli -a "$ADMIN_PWD" --user admin --no-auth-warning ACL LOAD

echo ""
echo "Live app user key patterns:"
docker exec "$CONTAINER" redis-cli -a "$ADMIN_PWD" --user admin --no-auth-warning ACL GETUSER app

echo ""
echo "Done."
