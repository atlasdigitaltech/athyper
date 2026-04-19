#!/bin/bash
# =======================================================================
# Keycloak Realm Export Script
# Exports realms with users, groups, clients, and configurations
# Exports both athyper and platform-control realms by default
# =======================================================================

set -e

EXPORT_DIR="./exports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Realms to export
REALMS=("athyper" "platform-control")

echo -e "${GREEN}=== Keycloak Realm Export ===${NC}"
echo -e "${YELLOW}Exporting realms: ${REALMS[*]}${NC}\n"

echo -e "${GREEN}[1/3] Creating export directory...${NC}"
mkdir -p "${EXPORT_DIR}"

echo -e "${GREEN}[2/3] Running Keycloak export containers...${NC}"

for REALM in "${REALMS[@]}"; do
  CONTAINER_NAME="keycloak-export-${REALM}-${TIMESTAMP}"
  echo -e "${YELLOW}Exporting realm: ${REALM}${NC}"

  docker run --rm \
    --name "${CONTAINER_NAME}" \
    --network athyper-internal \
    -v "$(pwd)/${EXPORT_DIR}:/opt/keycloak/data/export" \
    -e KC_DB=postgres \
    -e KC_DB_URL="${IAM_DB_URL:-jdbc:postgresql://dbpool-auth:5432/athyperauth_dev1}" \
    -e KC_DB_USERNAME="${IAM_DB_USERNAME:-athyperauth}" \
    -e KC_DB_PASSWORD="${IAM_DB_PASSWORD}" \
    quay.io/keycloak/keycloak:26.5.1 \
    export \
    --dir /opt/keycloak/data/export \
    --users realm_file \
    --realm "${REALM}"

  echo -e "${GREEN}✓ ${REALM} realm exported${NC}"
done

echo -e "${GREEN}[3/3] Files created in: ${EXPORT_DIR}/${NC}"
ls -lh "${EXPORT_DIR}"

echo -e "\n${GREEN}✓ Export successful!${NC}"
echo -e "${YELLOW}Note: Export files are in JSON format${NC}"
echo -e "${YELLOW}To update version-controlled realm configs:${NC}"
echo -e "  cp exports/athyper-realm.json ../../stack/config/iam/realm-demosetup.json"
echo -e "  cp exports/platform-control-realm.json ../../stack/config/iam/realm-platform-control.json"
