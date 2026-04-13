#!/bin/bash
# =======================================================================
# Keycloak Realm Import Script
# Supports both JSON realm files and PostgreSQL seed files
# =======================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Parse command line arguments
IMPORT_TYPE="${1:-json}"  # json | full-dump | seed
SOURCE_FILE="${2}"

usage() {
  echo -e "${YELLOW}Usage:${NC}"
  echo -e "  $0 json <file.json>      - Import JSON realm export via Keycloak CLI"
  echo -e "  $0 full-dump <dump.sql>  - Import full PostgreSQL dump"
  echo -e "  $0 seed <file.sql>       - Import raw SQL seed file"
  echo -e ""
  echo -e "${YELLOW}For fresh installations, use: mesh/scripts/initdb-iam.sh${NC}"
  exit 1
}

# =======================================================================
# Method 1: Import Seed File (SQL)
# =======================================================================
import_seed() {
  local SEED_FILE="${SOURCE_FILE}"

  if [ -z "${SEED_FILE}" ] || [ ! -f "${SEED_FILE}" ]; then
    echo -e "${RED}Error: SQL seed file required. Provide path as argument.${NC}"
    echo -e "${YELLOW}For fresh installations, use: mesh/scripts/initdb-iam.sh${NC}"
    exit 1
  fi

  echo -e "${GREEN}Importing seed file: ${SEED_FILE}${NC}"
  echo -e "${YELLOW}Warning: This will modify the Keycloak database${NC}"
  echo -e "${YELLOW}Press Ctrl+C to cancel, or wait 5 seconds to continue...${NC}"
  sleep 5

  # Execute via dbpool-auth container
  docker exec -i athyper-mesh-dbpool-auth-1 \
    psql -U athyperauth -d athyperauth_dev1 < "${SEED_FILE}"

  echo -e "${GREEN}✓ Seed import completed${NC}"
  echo -e "${YELLOW}Restart Keycloak container to apply changes:${NC}"
  echo -e "  docker compose restart iam"
}

# =======================================================================
# Method 2: Import JSON Realm Export
# =======================================================================
import_json() {
  local JSON_FILE="${SOURCE_FILE}"

  if [ ! -f "${JSON_FILE}" ]; then
    echo -e "${RED}Error: JSON file not found: ${JSON_FILE}${NC}"
    exit 1
  fi

  local IMPORT_DIR="./imports"
  mkdir -p "${IMPORT_DIR}"
  cp "${JSON_FILE}" "${IMPORT_DIR}/"

  echo -e "${GREEN}Importing JSON realm: ${JSON_FILE}${NC}"

  # Run temporary Keycloak container with import
  docker run --rm \
    --network athyper-mesh-internal \
    -v "$(pwd)/${IMPORT_DIR}:/opt/keycloak/data/import" \
    -e KC_DB=postgres \
    -e KC_DB_URL="${IAM_DB_URL:-jdbc:postgresql://dbpool-auth:5432/athyperauth_dev1}" \
    -e KC_DB_USERNAME="${IAM_DB_USERNAME:-athyperauth}" \
    -e KC_DB_PASSWORD="${IAM_DB_PASSWORD}" \
    quay.io/keycloak/keycloak:26.5.1 \
    import \
    --dir /opt/keycloak/data/import \
    --override true

  echo -e "${GREEN}✓ JSON import completed${NC}"
}

# =======================================================================
# Method 3: Import Full PostgreSQL Dump
# =======================================================================
import_full_dump() {
  local DUMP_FILE="${SOURCE_FILE}"

  if [ ! -f "${DUMP_FILE}" ]; then
    echo -e "${RED}Error: Dump file not found: ${DUMP_FILE}${NC}"
    exit 1
  fi

  echo -e "${GREEN}Importing full database dump: ${DUMP_FILE}${NC}"
  echo -e "${RED}WARNING: This will DROP and RECREATE the entire database!${NC}"
  echo -e "${YELLOW}Press Ctrl+C to cancel, or wait 10 seconds to continue...${NC}"
  sleep 10

  # Import full dump
  docker exec -i athyper-mesh-dbpool-auth-1 \
    psql -U athyperauth -d athyperauth_dev1 < "${DUMP_FILE}"

  echo -e "${GREEN}✓ Full dump import completed${NC}"
  echo -e "${YELLOW}Restart Keycloak:${NC}"
  echo -e "  docker compose restart iam"
}

# =======================================================================
# Main
# =======================================================================
case "${IMPORT_TYPE}" in
  seed)
    import_seed
    ;;
  json)
    if [ -z "${SOURCE_FILE}" ]; then
      echo -e "${RED}Error: JSON file required${NC}"
      usage
    fi
    import_json
    ;;
  full-dump)
    if [ -z "${SOURCE_FILE}" ]; then
      echo -e "${RED}Error: Dump file required${NC}"
      usage
    fi
    import_full_dump
    ;;
  *)
    usage
    ;;
esac
