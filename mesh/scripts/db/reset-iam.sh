#!/bin/bash
# =======================================================================
# Keycloak IAM Reset Script
# Location:
#   mesh/scripts/db/reset-iam.sh
#
# Performs a FULL reset of Keycloak IAM data:
#   1. Regenerates realm-demosetup.json via update-realm-demosetup.cjs
#   2. Stops the KC container
#   3. Drops and recreates the entire KC database schema (true clean slate)
#   4. Starts KC — it initializes master realm (admin user created from
#      KC_BOOTSTRAP_ADMIN_* env vars) and auto-imports all realm JSON files
#      mounted at /opt/keycloak/data/import/ (athyper + platform-control)
#   5. Waits for healthy status
#
# Use when: stale users/roles/orgs exist in KC that are not in the JSON,
# or when a full clean-slate reset is needed.
#
# NOTE: kc import --override is NOT used here because it does not create
# the master realm bootstrap admin. Letting kc start handle a fresh DB
# creates the admin AND imports realm files in one step.
# =======================================================================

set -euo pipefail

# Disable MSYS/Git Bash path conversion — prevents mangled paths in Docker
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESH_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
REPO_DIR="$(dirname "$MESH_DIR")"
CONFIG_DIR="${MESH_DIR}/config/iam"
IMPORT_FILE="${CONFIG_DIR}/realm-demosetup.json"
UPDATE_SCRIPT="${REPO_DIR}/tools/scripts/update-realm-demosetup.cjs"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${RED}=== Keycloak IAM FULL RESET ===${NC}"
echo -e "${YELLOW}WARNING: This will DELETE ALL KC data and reimport from JSON seed files.${NC}"
echo -e "${YELLOW}Press Ctrl+C to cancel, or wait 10 seconds to continue...${NC}"
sleep 10

# ─── Step 0: Regenerate realm JSON ─────────────────────────────────────────────
echo -e "\n${CYAN}[0/4] Regenerating realm-demosetup.json...${NC}"

if [ ! -f "$UPDATE_SCRIPT" ]; then
  echo -e "${RED}Error: update script not found: ${UPDATE_SCRIPT}${NC}"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo -e "${RED}Error: node not found in PATH${NC}"
  exit 1
fi

node "$UPDATE_SCRIPT"
echo -e "${GREEN}✓ realm-demosetup.json regenerated${NC}"

# Validate JSON
if command -v jq &>/dev/null; then
  if ! jq empty "$IMPORT_FILE" 2>/dev/null; then
    echo -e "${RED}Error: realm-demosetup.json is not valid JSON after regeneration${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ JSON validation passed${NC}"
fi

# ─── Step 1: Stop KC container ──────────────────────────────────────────────────
echo -e "\n${CYAN}[1/4] Stopping Keycloak container...${NC}"

if docker ps --format '{{.Names}}' | grep -q 'athyper-mesh-iam'; then
  docker stop athyper-mesh-iam-1
  echo -e "${GREEN}✓ Keycloak stopped${NC}"
else
  echo -e "${YELLOW}  KC container not running — proceeding with DB wipe${NC}"
fi

# ─── Step 2: Wipe KC database (true clean slate) ────────────────────────────────
echo -e "\n${CYAN}[2/4] Wiping KC database (drop + recreate schema)...${NC}"

if ! docker ps --format '{{.Names}}' | grep -q 'athyper-mesh-dbpool-auth'; then
  echo -e "${RED}Error: Database (dbpool-auth) container is not running${NC}"
  echo -e "${YELLOW}Start the stack first: cd mesh/scripts/stack && ./up.sh${NC}"
  exit 1
fi

# Resolve DB credentials from env file
DB_USER="${IAM_DB_USERNAME:-athyperadmin}"
env_file="${MESH_DIR}/env/.env"
[ ! -f "$env_file" ] && env_file="${MESH_DIR}/env/.env.example"
DB_PASS=""
if [ -f "$env_file" ]; then
  DB_PASS=$(grep IAM_DB_PASSWORD "$env_file" | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "")
fi
DB_PASS="${IAM_DB_PASSWORD:-${DB_PASS}}"
if [ -z "$DB_PASS" ]; then
  echo -e "${RED}Error: Cannot determine IAM_DB_PASSWORD from mesh/env/.env${NC}"
  exit 1
fi

docker exec athyper-mesh-db-1 \
  psql -U "$DB_USER" -d athyperauth_dev1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${DB_USER}; GRANT ALL ON SCHEMA public TO public;" \
  > /dev/null
echo -e "${GREEN}✓ KC database wiped — all tables removed${NC}"

# ─── Step 3: Start KC (creates master realm + admin + imports realm files) ───────
echo -e "\n${CYAN}[3/4] Starting Keycloak (fresh init + realm import)...${NC}"
echo -e "${YELLOW}  KC will: initialize schema → create master realm → bootstrap admin → import realm files${NC}"
echo -e "${YELLOW}  Realm files in container import dir: realm-demosetup.json + realm-platform-control.json${NC}"

docker start athyper-mesh-iam-1
echo -e "${YELLOW}Waiting for Keycloak to be ready (may take ~30 seconds)...${NC}"
sleep 10

STATUS="unknown"
for i in {1..35}; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' athyper-mesh-iam-1 2>/dev/null || echo "unknown")
  if [ "$STATUS" = "healthy" ]; then
    echo -e "\n${GREEN}✓ Keycloak is healthy${NC}"
    break
  fi
  echo -n "."
  sleep 3
done

if [ "$STATUS" != "healthy" ]; then
  echo -e "\n${YELLOW}Warning: Keycloak may still be starting (status: ${STATUS})${NC}"
  echo -e "${YELLOW}Check: docker logs athyper-mesh-iam-1 --tail=30${NC}"
fi

# ─── Step 4: Done ───────────────────────────────────────────────────────────────
echo -e "\n${CYAN}[4/4] Reset complete.${NC}"
echo -e "${GREEN}✓ Keycloak IAM fully reset from JSON seed files${NC}"
echo -e "\n${YELLOW}What was loaded:${NC}"
echo -e "  • realm-demosetup.json  → athyper realm (users, orgs, groups, roles)"
echo -e "  • realm-platform-control.json → platform-control realm"
echo -e "\n${YELLOW}Verify:${NC}"
echo -e "  docker exec athyper-mesh-iam-1 bash -c '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user athyperadmin --password athyperadmin --client admin-cli && /opt/keycloak/bin/kcadm.sh get realms --fields realm'"
echo -e "\n${YELLOW}Keycloak Admin Console: http://localhost/auth (via proxy)${NC}"
