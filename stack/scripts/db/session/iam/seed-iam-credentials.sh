#!/usr/bin/env bash
# =======================================================================
# Keycloak IAM Seed Credentials
# Location:
#   stack/scripts/db/session/iam/seed-iam-credentials.sh
#
# Seeds passwords for checked-in demo users across the local IAM realms:
# athyper and platform-control.
#
# Passwords are never committed to realm JSON. They are set here through
# kcadm.sh inside the running Keycloak container.
# =======================================================================

set -euo pipefail

export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

source "${SCRIPT_DIR}/../../../lib/constants.sh"
source "${SCRIPT_DIR}/../../../lib/resolve-iam-credentials.sh"

GREEN="$CLR_GREEN"; YELLOW="$CLR_YELLOW"; RED="$CLR_RED"; CYAN="$CLR_CYAN"; NC="$CLR_NC"
init_stack_env "$STACK_DIR"

if ! docker ps --format '{{.Names}}' | grep -q "$CONTAINER_IAM"; then
  echo -e "${RED}Error: Keycloak container ${CONTAINER_IAM} is not running${NC}" >&2
  exit 1
fi

IAM_ADMIN_USER="${IAM_ADMIN:-$(env_val IAM_ADMIN)}"
IAM_ADMIN_PASS="${IAM_ADMIN_PASSWORD:-$(env_val IAM_ADMIN_PASSWORD)}"

if [[ -z "$IAM_ADMIN_USER" || -z "$IAM_ADMIN_PASS" ]]; then
  secrets_env="${ATHYPER_SECRETS_ROOT:-/opt/stack/athyper/secrets}/.env"
  if [[ -f "$secrets_env" ]]; then
    [[ -z "$IAM_ADMIN_USER" ]] && IAM_ADMIN_USER="$(grep -E '^IAM_ADMIN=' "$secrets_env" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")"
    [[ -z "$IAM_ADMIN_PASS" ]] && IAM_ADMIN_PASS="$(grep -E '^IAM_ADMIN_PASSWORD=' "$secrets_env" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")"
  fi
fi

if [[ -z "$IAM_ADMIN_USER" || -z "$IAM_ADMIN_PASS" ]]; then
  echo -e "${RED}Error: IAM_ADMIN / IAM_ADMIN_PASSWORD not resolvable (env, stack/env/.env, or secrets/.env)${NC}" >&2
  exit 1
fi

STACK_ENVIRONMENT="${ENVIRONMENT:-$(env_val ENVIRONMENT)}"
STACK_ENVIRONMENT="${STACK_ENVIRONMENT:-local}"

DEMO_PASS="${IAM_DEMO_USER_PASSWORD:-$(env_val IAM_DEMO_USER_PASSWORD)}"
if [[ -z "$DEMO_PASS" ]]; then
  DEMO_PASS="Demo@1234"
fi

PCC_PASS="${IAM_PLATFORM_CONTROL_USER_PASSWORD:-$(env_val IAM_PLATFORM_CONTROL_USER_PASSWORD)}"
PCC_PASS="${PCC_PASS:-Platform@1234}"

ADMIN_REALM_PASS="${IAM_ADMIN_REALM_USER_PASSWORD:-$(env_val IAM_ADMIN_REALM_USER_PASSWORD)}"
ADMIN_REALM_PASS="${ADMIN_REALM_PASS:-AdminDemo@1234}"

realm_name_from_file() {
  node -e 'const fs=require("fs"); const file=process.argv[1]; const realm=JSON.parse(fs.readFileSync(file,"utf8")).realm; if(!realm) process.exit(1); process.stdout.write(realm);' "$1"
}

users_from_file() {
  node -e 'const fs=require("fs"); const file=process.argv[1]; const realm=JSON.parse(fs.readFileSync(file,"utf8")); for (const user of realm.users || []) if (!user.serviceAccountClientId && user.username) console.log(user.username);' "$1"
}

admin_users_from_file() {
  node -e '
    const fs=require("fs");
    const file=process.argv[1];
    const bucket=process.argv[2];
    const realm=JSON.parse(fs.readFileSync(file,"utf8"));
    const isTenant=(user) =>
      Array.isArray(user.attributes?.principal_type) && user.attributes.principal_type.includes("tenant_admin") ||
      Array.isArray(user.attributes?.source_realm) && user.attributes.source_realm.includes("neon");
    for (const user of realm.users || []) {
      if (user.serviceAccountClientId || !user.username) continue;
      if ((bucket === "tenant") === isTenant(user)) console.log(user.username);
    }
  ' "$1" "$2"
}

REALM_FILE="${STACK_DIR}/config/iam/realm-athyper.json"
DEMO_FILE="${STACK_DIR}/config/iam/realm-athyper-demosetup.json"
DEMO_REALM_NAME="$(realm_name_from_file "$REALM_FILE")"
USERS_FILE="$REALM_FILE"
[[ -f "$DEMO_FILE" ]] && USERS_FILE="$DEMO_FILE"
mapfile -t DEMO_USERS < <(users_from_file "$USERS_FILE")
if [[ -z "$DEMO_REALM_NAME" ]]; then
  echo -e "${RED}Error: Cannot derive demo realm from ${REALM_FILE}${NC}" >&2
  exit 1
fi

PLATFORM_REALM_FILE="${STACK_DIR}/config/iam/realm-platform-control.json"
PLATFORM_DEMO_FILE="${STACK_DIR}/config/iam/realm-platform-control-demosetup.json"
PCC_USERS=(product.admin tenant.manager support.admin)
if [[ -f "$PLATFORM_DEMO_FILE" ]]; then
  mapfile -t PCC_USERS < <(users_from_file "$PLATFORM_DEMO_FILE")
fi

kcadm() {
  docker exec "$CONTAINER_IAM" /opt/keycloak/bin/kcadm.sh "$@"
}

apply_demo_setup() {
  local realm_file="$1" demo_file="$2"
  [[ -f "$realm_file" && -f "$demo_file" ]] || return 0

  node "${STACK_DIR}/../tools/scripts/apply-realm-demo-setup.cjs" \
    --container "$CONTAINER_IAM" \
    --admin-user "$IAM_ADMIN_USER" \
    --admin-password "$IAM_ADMIN_PASS" \
    --realm-file "$realm_file" \
    --demo-file "$demo_file"
}

echo -e "${CYAN}=== Seeding IAM credentials ===${NC}"
echo -e "  realm ${DEMO_REALM_NAME}:          ${#DEMO_USERS[@]} users"
echo -e "  realm platform-control: ${#PCC_USERS[@]} users"

echo -e "\n${CYAN}[0/2] Applying demo setup fixtures${NC}"
apply_demo_setup "$REALM_FILE" "$DEMO_FILE"
apply_demo_setup "$PLATFORM_REALM_FILE" "$PLATFORM_DEMO_FILE"

kcadm config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "$IAM_ADMIN_USER" \
  --password "$IAM_ADMIN_PASS" \
  >/dev/null

seed_user() {
  local realm="$1" user="$2" pass="$3"
  if ! kcadm set-password -r "$realm" --username "$user" --new-password "$pass" 2>/dev/null; then
    echo -e "${YELLOW}  ! ${realm}/${user} - skipped (user missing?)${NC}"
    return 0
  fi

  local uid
  uid=$(kcadm get users -r "$realm" -q "username=${user}" --fields id --format csv --noquotes 2>/dev/null | tail -n +2 | head -1 || true)
  if [[ -n "$uid" ]]; then
    kcadm update "users/${uid}" -r "$realm" -s 'requiredActions=[]' >/dev/null 2>&1 || true
  fi
  echo -e "${GREEN}  OK ${realm}/${user}${NC}"
}

echo -e "\n${CYAN}[1/2] realm=${DEMO_REALM_NAME}${NC}"
for user in "${DEMO_USERS[@]}"; do
  seed_user "$DEMO_REALM_NAME" "$user" "$DEMO_PASS"
done

echo -e "\n${CYAN}[2/2] realm=platform-control${NC}"
for user in "${PCC_USERS[@]}"; do
  seed_user platform-control "$user" "$PCC_PASS"
done

echo -e "\n${GREEN}Credential seeding complete${NC}"
echo -e "${YELLOW}Demo user password (${DEMO_REALM_NAME} realm): set from IAM_DEMO_USER_PASSWORD${NC}"
echo -e "${YELLOW}Demo user password (platform-control realm): set from IAM_PLATFORM_CONTROL_USER_PASSWORD${NC}"
