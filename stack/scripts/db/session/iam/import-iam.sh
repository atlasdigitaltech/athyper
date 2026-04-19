#!/usr/bin/env bash
# =======================================================================
# Keycloak IAM Import Script
# Location:
#   stack/scripts/db/session/iam/import-iam.sh
# Imports realm configuration from stack/config/iam/realm-demosetup.json
# Works in both Git Bash (MSYS) and WSL on Windows
# =======================================================================

set -euo pipefail

# Disable MSYS/Git Bash path conversion — prevents mangled paths in Docker
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CONFIG_DIR="${STACK_DIR}/config/iam"
IMPORT_FILE="${CONFIG_DIR}/realm-demosetup.json"
PLATFORM_IMPORT_FILE="${CONFIG_DIR}/realm-platform-control.json"

# ---------------------------------------------------------------------------
# Shared constants + .env + credential helpers
# ---------------------------------------------------------------------------
source "${SCRIPT_DIR}/../../../lib/constants.sh"
source "${SCRIPT_DIR}/../../../lib/resolve-iam-credentials.sh"

GREEN="$CLR_GREEN"; YELLOW="$CLR_YELLOW"; RED="$CLR_RED"; NC="$CLR_NC"
init_stack_env "$STACK_DIR"

KEYCLOAK_IMAGE_TAG="${KEYCLOAK_IMAGE_TAG:-$(env_val KEYCLOAK_IMAGE_TAG)}"
KEYCLOAK_IMAGE_TAG="${KEYCLOAK_IMAGE_TAG:?Set KEYCLOAK_IMAGE_TAG in stack/env/.env}"

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

# Mount the import file directly into the container — no temp directory needed
docker run --rm \
  --network "$NETWORK_NAME" \
  -v "${IMPORT_FILE}:/opt/keycloak/data/import/athyper-realm.json:ro" \
  -e KC_DB=postgres \
  -e KC_DB_URL="${DB_URL}" \
  -e KC_DB_USERNAME="${DB_USER}" \
  -e KC_DB_PASSWORD="${DB_PASS}" \
  quay.io/keycloak/keycloak:${KEYCLOAK_IMAGE_TAG} \
  import \
  --dir /opt/keycloak/data/import \
  --override true

echo -e "${GREEN}✓ athyper realm imported${NC}"

# Import platform-control realm (if the file exists)
if [ -f "${PLATFORM_IMPORT_FILE}" ]; then
  echo -e "${GREEN}[2b/5] Importing platform-control realm...${NC}"
  docker run --rm \
    --network "$NETWORK_NAME" \
    -v "${PLATFORM_IMPORT_FILE}:/opt/keycloak/data/import/platform-control-realm.json:ro" \
    -e KC_DB=postgres \
    -e KC_DB_URL="${DB_URL}" \
    -e KC_DB_USERNAME="${DB_USER}" \
    -e KC_DB_PASSWORD="${DB_PASS}" \
    quay.io/keycloak/keycloak:${KEYCLOAK_IMAGE_TAG} \
    import \
    --dir /opt/keycloak/data/import \
    --override true
  echo -e "${GREEN}✓ platform-control realm imported${NC}"
else
  echo -e "${YELLOW}Skipping platform-control realm (file not found: ${PLATFORM_IMPORT_FILE})${NC}"
fi

echo -e "${GREEN}[3/5] Import complete${NC}"

echo -e "${GREEN}[4/5] Restarting Keycloak container...${NC}"
if docker ps --format '{{.Names}}' | grep -q "$CONTAINER_IAM"; then
  docker restart "$CONTAINER_IAM"
  echo -e "${YELLOW}Waiting for Keycloak to be ready...${NC}"
  sleep 10

  # Wait for Docker health check to pass
  for i in {1..30}; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_IAM" 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "healthy" ]; then
      echo -e "\n${GREEN}✓ Keycloak is ready${NC}"
      break
    fi
    echo -n "."
    sleep 2
  done
  if [ "$STATUS" != "healthy" ]; then
    echo -e "\n${YELLOW}Warning: Keycloak may still be starting (status: ${STATUS})${NC}"
  fi
else
  echo -e "${YELLOW}Keycloak container not running, start it to apply changes:${NC}"
  echo -e "  cd stack/scripts/stack-profile && ./up.sh"
fi

echo -e "\n${GREEN}[5/5] Provisioning users (passwords + MFA)...${NC}"
PROVISION_SCRIPT="${STACK_DIR}/../tools/devtools/keycloackgen/provision-keycloak-users.mjs"
if [ -f "${PROVISION_SCRIPT}" ]; then
  if command -v node &> /dev/null; then
    if node "${PROVISION_SCRIPT}"; then
      echo -e "${GREEN}✓ Users provisioned${NC}"
    else
      echo -e "${YELLOW}Warning: user provisioning exited with errors (exit code $?)${NC}"
      echo -e "${YELLOW}Import itself succeeded — only user password/MFA setup may be incomplete.${NC}"
    fi
  else
    echo -e "${YELLOW}Warning: node not found — run manually:${NC}"
    echo -e "  node tools/devtools/keycloackgen/provision-keycloak-users.mjs"
  fi
else
  echo -e "${YELLOW}Warning: provision script not found at: ${PROVISION_SCRIPT}${NC}"
  echo -e "  Run manually: node tools/devtools/keycloackgen/provision-keycloak-users.mjs"
fi

echo -e "\n${GREEN}✓ Import completed successfully!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "  1. Access Keycloak Admin Console"
echo -e "  2. Verify realms: athyper, platform-control"
echo -e "  3. Check clients, users, roles"
echo -e "  4. Demo user password is controlled by IAM_DEMO_USER_PASSWORD in stack/env/.env"
echo -e "     Default (if unset): Demo@1234  |  Run seed-iam-credentials.sh to re-apply"
echo -e "\n${GREEN}Keycloak Admin URL: http://localhost/auth${NC}"
