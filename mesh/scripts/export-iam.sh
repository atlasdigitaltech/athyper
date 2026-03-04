#!/bin/bash
# =======================================================================
# Keycloak IAM Export Script
# Exports athyper realm configuration to mesh/config/iam/
# =======================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESH_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="${MESH_DIR}/config/iam"
EXPORT_FILE="${CONFIG_DIR}/realm-demosetup.json"
PLATFORM_EXPORT_FILE="${CONFIG_DIR}/realm-platform-control.json"
TEMP_EXPORT_DIR="${MESH_DIR}/temp/keycloak-export"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Keycloak Realm Export ===${NC}"
echo -e "${YELLOW}Exporting athyper + platform-control realms${NC}\n"

# Ensure config directory exists
mkdir -p "${CONFIG_DIR}"

# Check if IAM container is running
if ! docker ps --format '{{.Names}}' | grep -q 'athyper-mesh-iam'; then
  echo -e "${RED}Error: Keycloak (IAM) container is not running${NC}"
  echo -e "${YELLOW}Start it with: cd mesh && ./up.sh --profile mesh${NC}"
  exit 1
fi

# Get database credentials from running Keycloak container
echo -e "${YELLOW}Reading database credentials from Keycloak container...${NC}"
DB_URL=$(docker exec athyper-mesh-iam-1 printenv KC_DB_URL 2>/dev/null || echo "jdbc:postgresql://dbpool-auth:6433/athyperauth_dev1")
DB_USER=$(docker exec athyper-mesh-iam-1 printenv KC_DB_USERNAME 2>/dev/null || echo "athyperadmin")
DB_PASS=$(docker exec athyper-mesh-iam-1 printenv KC_DB_PASSWORD 2>/dev/null || echo "")

if [ -z "$DB_PASS" ]; then
  echo -e "${RED}Error: Cannot determine database password${NC}"
  echo -e "${YELLOW}Set IAM_DB_PASSWORD environment variable or check container${NC}"
  exit 1
fi

echo -e "${GREEN}[1/4] Creating temporary export directory...${NC}"
rm -rf "${TEMP_EXPORT_DIR}"
mkdir -p "${TEMP_EXPORT_DIR}"

echo -e "${GREEN}[2/4] Running Keycloak export (athyper + platform-control)...${NC}"
# Disable MSYS path conversion for Docker volume mounts on Git Bash/Windows
export MSYS_NO_PATHCONV=1

# Export athyper realm
docker run --rm \
  --network athyper-mesh-internal \
  -v "${TEMP_EXPORT_DIR}:/opt/keycloak/data/export" \
  -e KC_DB=postgres \
  -e KC_DB_URL="${DB_URL}" \
  -e KC_DB_USERNAME="${DB_USER}" \
  -e KC_DB_PASSWORD="${DB_PASS}" \
  quay.io/keycloak/keycloak:26.5.1 \
  export \
  --dir /opt/keycloak/data/export \
  --users realm_file \
  --realm athyper

# Export platform-control realm
docker run --rm \
  --network athyper-mesh-internal \
  -v "${TEMP_EXPORT_DIR}:/opt/keycloak/data/export" \
  -e KC_DB=postgres \
  -e KC_DB_URL="${DB_URL}" \
  -e KC_DB_USERNAME="${DB_USER}" \
  -e KC_DB_PASSWORD="${DB_PASS}" \
  quay.io/keycloak/keycloak:26.5.1 \
  export \
  --dir /opt/keycloak/data/export \
  --users realm_file \
  --realm platform-control

unset MSYS_NO_PATHCONV

echo -e "${GREEN}[3/4] Moving exports to config directory...${NC}"
if [ -f "${TEMP_EXPORT_DIR}/athyper-realm.json" ]; then
  mv "${TEMP_EXPORT_DIR}/athyper-realm.json" "${EXPORT_FILE}"
  chmod 644 "${EXPORT_FILE}"
else
  echo -e "${RED}Error: athyper realm export file not found${NC}"
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
echo -e "  ./initdb-iam.sh"
