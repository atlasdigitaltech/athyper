#!/usr/bin/env bash
# =======================================================================
# Keycloak IAM Reset Script
# Location:
#   stack/scripts/db/session/iam/reset-iam.sh
#
# Performs a FULL reset of Keycloak IAM data:
#   1. Regenerates realm-demosetup.json via update-realm-demosetup.cjs
#   2. Stops the KC container
#   3. Drops and recreates the entire KC database schema (true clean slate)
#   4. Starts KC — it initializes master realm (admin user created from
#      KC_BOOTSTRAP_ADMIN_* env vars) and auto-imports all realm JSON files
#      mounted at /opt/keycloak/data/import/ (athyper + platform-control)
#   5. Waits for healthy status
#   6. Seeds demo user passwords via kcadm.sh (realm JSON does NOT contain
#      plaintext credentials — see seed-iam-credentials.sh)
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
STACK_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
REPO_DIR="$(cd "$STACK_DIR/.." && pwd)"
CONFIG_DIR="${STACK_DIR}/config/iam"
IMPORT_FILE="${CONFIG_DIR}/realm-demosetup.json"
UPDATE_SCRIPT="${REPO_DIR}/tools/scripts/update-realm-demosetup.cjs"

# ---------------------------------------------------------------------------
# Shared constants + .env + credential helpers
# ---------------------------------------------------------------------------
source "${SCRIPT_DIR}/../../../lib/constants.sh"
source "${SCRIPT_DIR}/../../../lib/resolve-iam-credentials.sh"

# Aliases for colour codes (shorter names used throughout this script)
GREEN="$CLR_GREEN"; YELLOW="$CLR_YELLOW"; RED="$CLR_RED"; CYAN="$CLR_CYAN"; NC="$CLR_NC"
init_stack_env "$STACK_DIR"

echo -e "${RED}=== Keycloak IAM FULL RESET ===${NC}"
echo -e "${YELLOW}WARNING: This will DELETE ALL KC data and reimport from JSON seed files.${NC}"
echo -e "${YELLOW}Press Ctrl+C to cancel, or wait 10 seconds to continue...${NC}"
sleep 10

# ─── Step 0: Regenerate realm JSON ─────────────────────────────────────────────
echo -e "\n${CYAN}[0/5] Regenerating realm-demosetup.json...${NC}"

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
echo -e "\n${CYAN}[1/5] Stopping Keycloak container...${NC}"

if docker ps --format '{{.Names}}' | grep -q "$CONTAINER_IAM"; then
  docker stop "$CONTAINER_IAM"
  echo -e "${GREEN}✓ Keycloak stopped${NC}"
else
  echo -e "${YELLOW}  KC container not running — proceeding with DB wipe${NC}"
fi

# ─── Step 2: Wipe KC database (true clean slate) ────────────────────────────────
echo -e "\n${CYAN}[2/5] Wiping KC database (drop + recreate schema)...${NC}"

if ! docker ps --format '{{.Names}}' | grep -q "$CONTAINER_DBPOOL_SESSION"; then
  echo -e "${RED}Error: Session pool (dbpool-session) container is not running${NC}"
  echo -e "${YELLOW}Start the stack first: cd stack/scripts/stack-profile && ./up.sh${NC}"
  exit 1
fi

# Resolve DB credentials (container is stopped, so cascade skips container env)
resolve_iam_credentials || exit 1

docker exec "$CONTAINER_DB" \
  psql -U "$IAM_RESOLVED_USER" -d "$DB_NAME_AUTH" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${IAM_RESOLVED_USER}; GRANT ALL ON SCHEMA public TO public;" \
  > /dev/null
echo -e "${GREEN}✓ KC database wiped — all tables removed${NC}"

# ─── Step 3: Start KC (creates master realm + admin + imports realm files) ───────
echo -e "\n${CYAN}[3/5] Starting Keycloak (fresh init + realm import)...${NC}"
echo -e "${YELLOW}  KC will: initialize schema → create master realm → bootstrap admin → import realm files${NC}"
echo -e "${YELLOW}  Realm files in container import dir: realm-demosetup.json + realm-platform-control.json${NC}"

docker start "$CONTAINER_IAM"
echo -e "${YELLOW}Waiting for Keycloak to be ready (may take ~30 seconds)...${NC}"
sleep 10

STATUS="unknown"
for i in {1..35}; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_IAM" 2>/dev/null || echo "unknown")
  if [ "$STATUS" = "healthy" ]; then
    echo -e "\n${GREEN}✓ Keycloak is healthy${NC}"
    break
  fi
  echo -n "."
  sleep 3
done

if [ "$STATUS" != "healthy" ]; then
  echo -e "\n${YELLOW}Warning: Keycloak may still be starting (status: ${STATUS})${NC}"
  echo -e "${YELLOW}Check: docker logs ${CONTAINER_IAM} --tail=30${NC}"
fi

# ─── Step 4: Seed demo credentials (passwords NOT in realm JSON) ────────────────
echo -e "\n${CYAN}[4/5] Seeding demo user passwords via kcadm.sh...${NC}"
if [ "$STATUS" = "healthy" ]; then
  if ! "${SCRIPT_DIR}/seed-iam-credentials.sh"; then
    echo -e "${RED}Error: credential seeding failed — demo users have no passwords${NC}"
    echo -e "${YELLOW}Re-run manually: ${SCRIPT_DIR}/seed-iam-credentials.sh${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}  Skipped — KC not healthy. Run manually once KC is up:${NC}"
  echo -e "${YELLOW}    ${SCRIPT_DIR}/seed-iam-credentials.sh${NC}"
fi

# ─── Step 5: Done ───────────────────────────────────────────────────────────────
echo -e "\n${CYAN}[5/5] Reset complete.${NC}"
echo -e "${GREEN}✓ Keycloak IAM fully reset from JSON seed files${NC}"
echo -e "\n${YELLOW}What was loaded:${NC}"
echo -e "  • realm-demosetup.json  → athyper realm (users, orgs, groups, roles)"
echo -e "  • realm-platform-control.json → platform-control realm"
echo -e "\n${YELLOW}Verify:${NC}"
IAM_ADMIN_USER="${IAM_ADMIN:-$(env_val IAM_ADMIN)}"
IAM_ADMIN_PASS="${IAM_ADMIN_PASSWORD:-$(env_val IAM_ADMIN_PASSWORD)}"
echo -e "  docker exec ${CONTAINER_IAM} bash -c '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user \$IAM_ADMIN --password \$IAM_ADMIN_PASSWORD --client admin-cli && /opt/keycloak/bin/kcadm.sh get realms --fields realm'"
echo -e "\n${YELLOW}Keycloak Admin Console: http://localhost/auth (via proxy)${NC}"
