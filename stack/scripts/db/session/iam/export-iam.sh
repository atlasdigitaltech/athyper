#!/usr/bin/env bash
# =======================================================================
# Keycloak IAM Export Script
# Location:
#   stack/scripts/db/session/iam/export-iam.sh
#
# Exports athyper + platform-control realms to stack/config/iam/ via a
# temporary `docker run` container connected to the IAM database.
#
# Steps:
#   [1/4] Create temp export directory (stack/.tmp/ — avoids WSL2 /tmp)
#   [2/4] Run Keycloak export for athyper realm, then platform-control realm
#   [3/4] Move exported JSON files to stack/config/iam/
#           -> realm-athyper.json (athyper)
#           -> realm-platform-control.json (platform-control, if provisioned)
#   [4/4] Clean up temp directory
#
# Platform-control export produces a warning (not an error) if the realm
# is not yet provisioned in Keycloak.
#
# Requires: running IAM container; KEYCLOAK_IMAGE_TAG in stack/env/.env
# =======================================================================

set -euo pipefail

# Disable MSYS/Git Bash path conversion — prevents mangled paths in Docker volume mounts
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CONFIG_DIR="${STACK_DIR}/config/iam"
EXPORT_FILE="${CONFIG_DIR}/realm-athyper.json"
PLATFORM_EXPORT_FILE="${CONFIG_DIR}/realm-platform-control.json"
# Use a path inside STACK_DIR so it is always reachable from the host regardless
# of whether MSYS_NO_PATHCONV is active (avoids /tmp being routed into WSL2).
TEMP_EXPORT_DIR="${STACK_DIR}/.tmp/keycloak-export-$$"

# ---------------------------------------------------------------------------
# Shared constants + .env + credential helpers
# ---------------------------------------------------------------------------
source "${SCRIPT_DIR}/../../../lib/constants.sh"
source "${SCRIPT_DIR}/../../../lib/resolve-iam-credentials.sh"

GREEN="$CLR_GREEN"; YELLOW="$CLR_YELLOW"; RED="$CLR_RED"; NC="$CLR_NC"
init_stack_env "$STACK_DIR"

echo -e "${GREEN}=== Keycloak Realm Export ===${NC}"
echo -e "${YELLOW}Exporting athyper + platform-control realms${NC}\n"

# Ensure config directory exists
mkdir -p "${CONFIG_DIR}"

# Check if IAM container is running
if ! docker ps --format '{{.Names}}' | grep -q "$CONTAINER_IAM"; then
  echo -e "${RED}Error: Keycloak (IAM) container is not running${NC}"
  echo -e "${YELLOW}Start it with: cd stack/scripts/stack-profile && ./up.sh${NC}"
  exit 1
fi

KEYCLOAK_IMAGE_TAG="${KEYCLOAK_IMAGE_TAG:-$(env_val KEYCLOAK_IMAGE_TAG)}"
KEYCLOAK_IMAGE_TAG="${KEYCLOAK_IMAGE_TAG:?Set KEYCLOAK_IMAGE_TAG in stack/env/.env}"

echo -e "${YELLOW}Resolving database credentials...${NC}"
resolve_iam_credentials || exit 1
DB_URL="$IAM_RESOLVED_URL"
DB_USER="$IAM_RESOLVED_USER"
DB_PASS="$IAM_RESOLVED_PASS"

echo -e "${GREEN}[1/4] Creating temporary export directory...${NC}"
rm -rf "${TEMP_EXPORT_DIR}"
mkdir -p "${TEMP_EXPORT_DIR}"

DEMO_REALM_NAME="${KEYCLOAK_REALM:-}"
if [ -z "${DEMO_REALM_NAME}" ] && [ -f "${EXPORT_FILE}" ]; then
  DEMO_REALM_NAME="$(node -e 'const fs=require("fs"); const file=process.argv[1]; const realm=JSON.parse(fs.readFileSync(file,"utf8")).realm; if(!realm) process.exit(1); process.stdout.write(realm);' "${EXPORT_FILE}" 2>/dev/null || true)"
fi
DEMO_REALM_NAME="${DEMO_REALM_NAME:-athyper}"

echo -e "${GREEN}[2/4] Running Keycloak export (${DEMO_REALM_NAME} + platform-control)...${NC}"

# Export unified Athyper realm
docker run --rm \
  --network "$NETWORK_NAME" \
  -v "${TEMP_EXPORT_DIR}:/opt/keycloak/data/export" \
  -e KC_DB=postgres \
  -e KC_DB_URL="${DB_URL}" \
  -e KC_DB_USERNAME="${DB_USER}" \
  -e KC_DB_PASSWORD="${DB_PASS}" \
  quay.io/keycloak/keycloak:${KEYCLOAK_IMAGE_TAG} \
  export \
  --dir /opt/keycloak/data/export \
  --users realm_file \
  --realm "${DEMO_REALM_NAME}"

# Export platform-control realm (|| true: not yet provisioned is a warning, not a fatal error)
docker run --rm \
  --network "$NETWORK_NAME" \
  -v "${TEMP_EXPORT_DIR}:/opt/keycloak/data/export" \
  -e KC_DB=postgres \
  -e KC_DB_URL="${DB_URL}" \
  -e KC_DB_USERNAME="${DB_USER}" \
  -e KC_DB_PASSWORD="${DB_PASS}" \
  quay.io/keycloak/keycloak:${KEYCLOAK_IMAGE_TAG} \
  export \
  --dir /opt/keycloak/data/export \
  --users realm_file \
  --realm platform-control || true

echo -e "${GREEN}[3/4] Moving exports to config directory...${NC}"
if [ -f "${TEMP_EXPORT_DIR}/${DEMO_REALM_NAME}-realm.json" ]; then
  mv "${TEMP_EXPORT_DIR}/${DEMO_REALM_NAME}-realm.json" "${EXPORT_FILE}"
  chmod 644 "${EXPORT_FILE}"
else
  echo -e "${RED}Error: ${DEMO_REALM_NAME} realm export file not found${NC}"
  rm -rf "${TEMP_EXPORT_DIR}"
  exit 1
fi

if [ -f "${TEMP_EXPORT_DIR}/platform-control-realm.json" ]; then
  mv "${TEMP_EXPORT_DIR}/platform-control-realm.json" "${PLATFORM_EXPORT_FILE}"
  chmod 644 "${PLATFORM_EXPORT_FILE}"
  echo -e "${GREEN}✓ platform-control realm exported${NC}"
else
  echo -e "${YELLOW}Warning: platform-control realm not found in Keycloak (not yet provisioned?)${NC}"
fi

echo -e "${GREEN}[4/4] Cleaning up...${NC}"
rm -rf "${TEMP_EXPORT_DIR}"

echo -e "\n${GREEN}✓ Export completed successfully!${NC}"
echo -e "${YELLOW}Exported to: ${EXPORT_FILE}${NC}"
echo -e "\nFile size: $(du -h "${EXPORT_FILE}" | cut -f1)"

echo -e "\n${YELLOW}What's exported:${NC}"
echo -e "  ✓ Realm configuration (athyper + platform-control)"
echo -e "  ✓ Clients and client scopes"
echo -e "  ✓ Roles (realm and client)"
echo -e "  ✓ Groups and users"
echo -e "  ✓ Authentication flows"
echo -e "  ✓ Organizations"

echo -e "\n${GREEN}To import this configuration:${NC}"
echo -e "  ./import-iam.sh"
