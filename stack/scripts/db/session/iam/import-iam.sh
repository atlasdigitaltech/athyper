#!/usr/bin/env bash
# =======================================================================
# Keycloak IAM Import Script
# Location:
#   stack/scripts/db/session/iam/import-iam.sh
#
# Imports realm configuration from stack/config/iam/ into a running
# Keycloak instance via `kc import --override true`.
# Works in both Git Bash (MSYS) and WSL on Windows.
#
# Steps:
#   [1/5] Check database connection (via db container)
#   [2/5] Import unified athyper realm (5-second countdown to cancel)
#         Mounts realm-athyper.json directly into the docker run container
#   [2b/5] Import platform-control realm (only if realm-platform-control.json
#          exists in stack/config/iam/)
#   [3/5] Import complete (marker step)
#   [4/5] Restart Keycloak container; wait for healthy status
#   [5/5] Run seed-iam-credentials.sh to seed demo passwords
#
# Requires: running dbpool-session container; KEYCLOAK_IMAGE_TAG in stack/env/.env
# =======================================================================

set -euo pipefail

# Disable MSYS/Git Bash path conversion — prevents mangled paths in Docker
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
REPO_DIR="$(cd "$STACK_DIR/.." && pwd)"
CONFIG_DIR="${STACK_DIR}/config/iam"
IMPORT_FILE="${CONFIG_DIR}/realm-athyper.json"
PLATFORM_IMPORT_FILE="${CONFIG_DIR}/realm-platform-control.json"
DEMO_FILE="${CONFIG_DIR}/realm-athyper-demosetup.json"
PLATFORM_DEMO_FILE="${CONFIG_DIR}/realm-platform-control-demosetup.json"

node "${REPO_DIR}/tools/scripts/generate-athyper-demo-iam.cjs" --check
node "${REPO_DIR}/tools/scripts/verify-athyper-demo-iam.cjs"

# ---------------------------------------------------------------------------
# Shared constants + .env + credential helpers
# ---------------------------------------------------------------------------
source "${SCRIPT_DIR}/../../../lib/constants.sh"
source "${SCRIPT_DIR}/../../../lib/resolve-iam-credentials.sh"

GREEN="$CLR_GREEN"; YELLOW="$CLR_YELLOW"; RED="$CLR_RED"; NC="$CLR_NC"
init_stack_env "$STACK_DIR"

KEYCLOAK_IMAGE_TAG="${KEYCLOAK_IMAGE_TAG:-$(env_val KEYCLOAK_IMAGE_TAG)}"
KEYCLOAK_IMAGE_TAG="${KEYCLOAK_IMAGE_TAG:?Set KEYCLOAK_IMAGE_TAG in stack/env/.env}"
IMPORT_ENVIRONMENT="${ENVIRONMENT:-$(env_val ENVIRONMENT)}"
IMPORT_ENVIRONMENT="${IMPORT_ENVIRONMENT:-local}"

env_or_default() {
  local name="$1"
  local fallback="${2:-}"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    value="$(env_val "$name")"
  fi
  printf '%s' "${value:-$fallback}"
}

KC_IMPORT_ENV_ARGS=(
  -e "KC_SMTP_HOST=$(env_or_default KC_SMTP_HOST mailtrap)"
  -e "KC_SMTP_PORT=$(env_or_default KC_SMTP_PORT 1025)"
  -e "KC_SMTP_FROM=$(env_or_default KC_SMTP_FROM noreply@athyper.local)"
  -e "KC_SMTP_FROM_DISPLAY_NAME=$(env_or_default KC_SMTP_FROM_DISPLAY_NAME Athyper)"
  -e "KC_SMTP_AUTH=$(env_or_default KC_SMTP_AUTH false)"
  -e "KC_SMTP_SSL=$(env_or_default KC_SMTP_SSL false)"
  -e "KC_SMTP_STARTTLS=$(env_or_default KC_SMTP_STARTTLS false)"
  -e "KC_SMTP_USERNAME=$(env_or_default KC_SMTP_USERNAME)"
  -e "KC_SMTP_PASSWORD=$(env_or_default KC_SMTP_PASSWORD)"
  -e "KC_WEBAUTHN_RP_ID=$(env_or_default KC_WEBAUTHN_RP_ID athyper.local)"
  -e "NEON_PUBLIC_WEB_URL=https://$(env_or_default APPS_ATHYPER_NEON_HOST neon.athyper.local)"
  -e "MESH_PUBLIC_WEB_URL=https://$(env_or_default APPS_ATHYPER_MESH_HOST mesh.athyper.local)"
  -e "STUDIO_PUBLIC_WEB_URL=https://$(env_or_default APPS_ATHYPER_STUDIO_HOST studio.athyper.local)"
  -e "STUDIO_WEB_CLIENT_SECRET=$(env_or_default STUDIO_WEB_CLIENT_SECRET)"
  -e "ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET=$(env_or_default ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET)"
  -e "NEON_SVC_BFF_CLIENT_SECRET=$(env_or_default NEON_SVC_BFF_CLIENT_SECRET)"
  -e "GITHUB_OAUTH_CLIENT_ID=$(env_or_default GITHUB_OAUTH_CLIENT_ID)"
  -e "GITHUB_OAUTH_CLIENT_SECRET=$(env_or_default GITHUB_OAUTH_CLIENT_SECRET)"
  -e "GOOGLE_CLIENT_ID=$(env_or_default GOOGLE_CLIENT_ID)"
  -e "GOOGLE_CLIENT_SECRET=$(env_or_default GOOGLE_CLIENT_SECRET)"
  -e "MICROSOFT_CLIENT_ID=$(env_or_default MICROSOFT_CLIENT_ID)"
  -e "MICROSOFT_CLIENT_SECRET=$(env_or_default MICROSOFT_CLIENT_SECRET)"
  -e "LINKEDIN_CLIENT_ID=$(env_or_default LINKEDIN_CLIENT_ID)"
  -e "LINKEDIN_CLIENT_SECRET=$(env_or_default LINKEDIN_CLIENT_SECRET)"
  -e "ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED=$(env_or_default ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED false)"
)

echo -e "${GREEN}=== Keycloak Realm Import ===${NC}"
echo -e "${YELLOW}Importing from: ${IMPORT_FILE}${NC}\n"

# Check if import file exists
if [ ! -f "${IMPORT_FILE}" ]; then
  echo -e "${RED}Error: Import file not found: ${IMPORT_FILE}${NC}"
  echo -e "\n${YELLOW}To create this file:${NC}"
  echo -e "  1. Export from existing Keycloak: ./export-iam.sh"
  echo -e "  2. Or manually export from Keycloak Admin Console"
  echo -e "  3. Save to: ${IMPORT_FILE}"
  exit 1
fi

# Check if file is valid JSON
if ! command -v jq &> /dev/null; then
  echo -e "${YELLOW}Warning: jq not installed, skipping JSON validation${NC}"
else
  if ! jq empty "${IMPORT_FILE}" 2>/dev/null; then
    echo -e "${RED}Error: Invalid JSON in import file${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ JSON validation passed${NC}"
fi

# Check if database containers are running
if ! docker ps --format '{{.Names}}' | grep -q "$CONTAINER_DBPOOL_SESSION"; then
  echo -e "${RED}Error: Session pool (dbpool-session) container is not running${NC}"
  echo -e "${YELLOW}Start it with: cd stack/scripts/stack-profile && ./up.sh${NC}"
  exit 1
fi

# Resolve DB credentials (container → env var → .env cascade)
echo -e "${YELLOW}Resolving database credentials...${NC}"
resolve_iam_credentials || exit 1
DB_URL="$IAM_RESOLVED_URL"
DB_USER="$IAM_RESOLVED_USER"
DB_PASS="$IAM_RESOLVED_PASS"

echo -e "${GREEN}[1/5] Checking database connection...${NC}"
docker exec "$CONTAINER_DB" \
  psql -U "${DB_USER}" -d "$DB_NAME_AUTH" \
  -c "SELECT version();" > /dev/null 2>&1 || {
    echo -e "${RED}Error: Cannot connect to database${NC}"
    exit 1
  }
echo -e "${GREEN}✓ Database connection successful${NC}"

echo -e "${GREEN}[2/5] Importing realm configuration...${NC}"
echo -e "${YELLOW}This will override existing realm data!${NC}"
echo -e "${YELLOW}Press Ctrl+C to cancel, or wait 5 seconds...${NC}"
sleep 5

IMPORT_REALM_NAME="$(node -e 'const fs=require("fs"); const file=process.argv[1]; const realm=JSON.parse(fs.readFileSync(file,"utf8")).realm; if(!realm) process.exit(1); process.stdout.write(realm);' "${IMPORT_FILE}")"
if [ -z "${IMPORT_REALM_NAME}" ]; then
  echo -e "${RED}Error: Cannot determine realm name from ${IMPORT_FILE}${NC}"
  exit 1
fi

# Resolve admin credentials for the post-restart admin API readiness check.
IAM_ADMIN_USER="${IAM_ADMIN:-$(env_val IAM_ADMIN)}"
IAM_ADMIN_PASS="${IAM_ADMIN_PASSWORD:-$(env_val IAM_ADMIN_PASSWORD)}"
if [ -z "${IAM_ADMIN_USER}" ] || [ -z "${IAM_ADMIN_PASS}" ]; then
  echo -e "${RED}Error: IAM_ADMIN / IAM_ADMIN_PASSWORD required for post-restart API check${NC}"
  exit 1
fi

# Trap ensures temp dirs are cleaned up on any exit (success, failure, or set -e abort).
TEMP_IMPORT_DIR=""
TEMP_PLATFORM_DIR=""
cleanup_temps() {
  [[ -n "${TEMP_IMPORT_DIR}" ]] && rm -rf "${TEMP_IMPORT_DIR}" 2>/dev/null || true
  [[ -n "${TEMP_PLATFORM_DIR}" ]] && rm -rf "${TEMP_PLATFORM_DIR}" 2>/dev/null || true
}
trap cleanup_temps EXIT

TEMP_IMPORT_DIR="$(mktemp -d)"
cp -f "${IMPORT_FILE}" "${TEMP_IMPORT_DIR}/${IMPORT_REALM_NAME}-realm.json"
node "${STACK_DIR}/../tools/scripts/prepare-keycloak-realm-import.cjs" \
  --realm-file "${TEMP_IMPORT_DIR}/${IMPORT_REALM_NAME}-realm.json" \
  --demo-file "${DEMO_FILE}"
node "${STACK_DIR}/../tools/scripts/apply-iam-realm-policy.cjs" \
  --environment "${IMPORT_ENVIRONMENT}" \
  --root "${TEMP_IMPORT_DIR}" \
  --write

# Mount the import file using Keycloak's required <realm>-realm.json filename.
docker run --rm \
  --network "$NETWORK_NAME" \
  -v "${TEMP_IMPORT_DIR}:/opt/keycloak/data/import:ro" \
  -e KC_DB=postgres \
  -e KC_DB_URL="${DB_URL}" \
  -e KC_DB_USERNAME="${DB_USER}" \
  -e KC_DB_PASSWORD="${DB_PASS}" \
  "${KC_IMPORT_ENV_ARGS[@]}" \
  quay.io/keycloak/keycloak:${KEYCLOAK_IMAGE_TAG} \
  import \
  --dir /opt/keycloak/data/import \
  --override true

echo -e "${GREEN}✓ ${IMPORT_REALM_NAME} realm imported${NC}"
rm -rf "${TEMP_IMPORT_DIR}"

# Import platform-control realm (if the file exists)
if [ -f "${PLATFORM_IMPORT_FILE}" ]; then
  echo -e "${GREEN}[2b/5] Importing platform-control realm...${NC}"
  TEMP_PLATFORM_DIR="$(mktemp -d)"  # picked up by cleanup_temps trap
  cp -f "${PLATFORM_IMPORT_FILE}" "${TEMP_PLATFORM_DIR}/platform-control-realm.json"
  if [ -f "${PLATFORM_DEMO_FILE}" ]; then
    node "${STACK_DIR}/../tools/scripts/prepare-keycloak-realm-import.cjs" \
      --realm-file "${TEMP_PLATFORM_DIR}/platform-control-realm.json" \
      --demo-file "${PLATFORM_DEMO_FILE}"
  fi
  node "${STACK_DIR}/../tools/scripts/apply-iam-realm-policy.cjs" \
    --environment "${IMPORT_ENVIRONMENT}" \
    --root "${TEMP_PLATFORM_DIR}" \
    --write
  docker run --rm \
    --network "$NETWORK_NAME" \
    -v "${TEMP_PLATFORM_DIR}:/opt/keycloak/data/import:ro" \
    -e KC_DB=postgres \
    -e KC_DB_URL="${DB_URL}" \
    -e KC_DB_USERNAME="${DB_USER}" \
    -e KC_DB_PASSWORD="${DB_PASS}" \
    "${KC_IMPORT_ENV_ARGS[@]}" \
    quay.io/keycloak/keycloak:${KEYCLOAK_IMAGE_TAG} \
    import \
    --dir /opt/keycloak/data/import \
    --override true
  echo -e "${GREEN}✓ platform-control realm imported${NC}"
  rm -rf "${TEMP_PLATFORM_DIR}"
else
  echo -e "${YELLOW}Skipping platform-control realm (file not found: ${PLATFORM_IMPORT_FILE})${NC}"
fi

echo -e "${GREEN}[3/5] Import complete${NC}"

echo -e "${GREEN}[4/5] Recreating Keycloak container with current compose mounts...${NC}"
LIVE_CONFIG_ROOT="${ATHYPER_CONFIG_ROOT:-$(env_val ATHYPER_CONFIG_ROOT)}"
LIVE_CONFIG_ROOT="${LIVE_CONFIG_ROOT:-${STACK_DIR}/config}"
LIVE_IAM_DIR="${LIVE_CONFIG_ROOT}/iam"
mkdir -p "${LIVE_IAM_DIR}"
cp -f "${IMPORT_FILE}" "${LIVE_IAM_DIR}/realm-athyper.json" || echo -e "${YELLOW}Warning: failed to sync realm-athyper.json to ${LIVE_IAM_DIR}${NC}"
[ -f "${DEMO_FILE}" ] && cp -f "${DEMO_FILE}" "${LIVE_IAM_DIR}/realm-athyper-demosetup.json"
if [ -f "${PLATFORM_IMPORT_FILE}" ]; then
  cp -f "${PLATFORM_IMPORT_FILE}" "${LIVE_IAM_DIR}/realm-platform-control.json" || echo -e "${YELLOW}Warning: failed to sync realm-platform-control.json to ${LIVE_IAM_DIR}${NC}"
else
  echo -e "${YELLOW}Skipping platform-control sync (file not found: ${PLATFORM_IMPORT_FILE})${NC}"
fi
[ -f "${PLATFORM_DEMO_FILE}" ] && cp -f "${PLATFORM_DEMO_FILE}" "${LIVE_IAM_DIR}/realm-platform-control-demosetup.json"

node "${STACK_DIR}/../tools/scripts/apply-iam-realm-policy.cjs" \
  --environment "${IMPORT_ENVIRONMENT}" \
  --root "${LIVE_IAM_DIR}" \
  --write

docker rm -f "$CONTAINER_IAM" >/dev/null 2>&1 || true
if [ -f "${STACK_DIR}/scripts/stack-profile/up.sh" ]; then
  "${STACK_DIR}/scripts/stack-profile/up.sh" core
else
  echo -e "${RED}Error: stack-profile up script not found at ${STACK_DIR}/scripts/stack-profile/up.sh${NC}"
  exit 1
fi

echo -e "${YELLOW}Waiting for Keycloak to be ready...${NC}"
sleep 10

# Wait for Docker health check to pass
for i in {1..100}; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_IAM" 2>/dev/null || echo "unknown")
  if [ "$STATUS" = "healthy" ]; then
    echo -e "\n${GREEN}? Keycloak is ready${NC}"
    break
  fi
  echo -n "."
  sleep 3
done
if [ "$STATUS" != "healthy" ]; then
  echo -e "\n${YELLOW}Warning: Keycloak may still be starting after 300 seconds (status: ${STATUS})${NC}"
fi

echo -e "${YELLOW}Waiting for Keycloak admin API...${NC}"
ADMIN_READY=0
for i in {1..60}; do
  if docker exec "$CONTAINER_IAM" /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 \
    --realm master \
    --user "$IAM_ADMIN_USER" \
    --password "$IAM_ADMIN_PASS" \
    >/dev/null 2>&1; then
    ADMIN_READY=1
    echo -e "${GREEN}Keycloak admin API is ready${NC}"
    break
  fi
  sleep 3
done
if [ "$ADMIN_READY" != "1" ]; then
  echo -e "${YELLOW}Warning: Keycloak admin API was not ready after 180 seconds.${NC}"
fi

echo -e "\n${GREEN}[5/5] Seeding demo credentials...${NC}"
if [ -f "${SCRIPT_DIR}/seed-iam-credentials.sh" ]; then
  if "${SCRIPT_DIR}/seed-iam-credentials.sh"; then
    echo -e "${GREEN}✓ Demo credentials seeded${NC}"
  else
    echo -e "${YELLOW}Warning: demo credential seeding failed. Import itself succeeded.${NC}"
    echo -e "${YELLOW}Re-run manually: ${SCRIPT_DIR}/seed-iam-credentials.sh${NC}"
  fi
else
  echo -e "${YELLOW}Warning: seed script not found at: ${SCRIPT_DIR}/seed-iam-credentials.sh${NC}"
  echo -e "  Run manually: ${SCRIPT_DIR}/seed-iam-credentials.sh"
fi

echo -e "\n${GREEN}✓ Import completed successfully!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "  1. Access Keycloak Admin Console"
echo -e "  2. Verify realms: athyper, platform-control"
echo -e "  3. Check clients, users, roles"
echo -e "  4. Demo user passwords are controlled by IAM_DEMO_USER_PASSWORD,"
echo -e "     IAM_ADMIN_REALM_USER_PASSWORD, and IAM_PLATFORM_CONTROL_USER_PASSWORD."
echo -e "     Run seed-iam-credentials.sh to re-apply."
echo -e "\n${GREEN}Keycloak Admin URL: http://localhost/auth${NC}"
