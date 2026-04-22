#!/usr/bin/env bash
# =======================================================================
# Keycloak IAM Seed Credentials
# Location:
#   stack/scripts/db/session/iam/seed-iam-credentials.sh
#
# Seeds passwords for demo users in both KC realms (athyper, platform-control)
# after a realm import. Passwords are NEVER committed to realm JSON — they
# are set here via `kcadm.sh set-password` inside the running KC container.
#
# Password resolution order:
#   1. Shell env var (IAM_DEMO_USER_PASSWORD / IAM_PLATFORM_CONTROL_USER_PASSWORD)
#   2. stack/env/.env file
#   3. Safe defaults (Demo@1234 / admin) — local dev only
#
# Steps:
#   [1/2] Seed all athyper realm users
#   [2/2] Seed all platform-control realm users
#
# Invoked by reset-iam.sh. Can also be run standalone:
#     stack/scripts/db/session/iam/seed-iam-credentials.sh
#
# Idempotent: re-running overwrites existing passwords and removes the
# UPDATE_PASSWORD required action so the next login skips the forced reset.
#
# Requires: running Keycloak container; IAM_ADMIN + IAM_ADMIN_PASSWORD
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

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
if ! docker ps --format '{{.Names}}' | grep -q "$CONTAINER_IAM"; then
  echo -e "${RED}Error: Keycloak container ${CONTAINER_IAM} is not running${NC}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Resolve seed passwords
# ---------------------------------------------------------------------------
IAM_ADMIN_USER="${IAM_ADMIN:-$(env_val IAM_ADMIN)}"
IAM_ADMIN_PASS="${IAM_ADMIN_PASSWORD:-$(env_val IAM_ADMIN_PASSWORD)}"

if [[ -z "$IAM_ADMIN_USER" || -z "$IAM_ADMIN_PASS" ]]; then
  echo -e "${RED}Error: IAM_ADMIN / IAM_ADMIN_PASSWORD not resolvable (env or stack/env/.env)${NC}" >&2
  exit 1
fi

DEMO_PASS="${IAM_DEMO_USER_PASSWORD:-$(env_val IAM_DEMO_USER_PASSWORD)}"
DEMO_PASS="${DEMO_PASS:-Demo@1234}"

PCC_PASS="${IAM_PLATFORM_CONTROL_USER_PASSWORD:-$(env_val IAM_PLATFORM_CONTROL_USER_PASSWORD)}"
PCC_PASS="${PCC_PASS:-admin}"

# ---------------------------------------------------------------------------
# User lists — must stay in sync with:
#   - stack/config/iam/realm-demosetup.json (via update-realm-demosetup.cjs)
#   - stack/config/iam/realm-platform-control.json
# ---------------------------------------------------------------------------
ATHYPER_USERS=(
  athq.viewer athq.reporter athq.requester athq.agent athq.manager
  athq.owner  athq.admin    aqtu.manager   asac.manager auic.manager
  asgf.manager athq.cfo     partner.viewer partner.agent partner.manager
  partner.owner karim.dual
  # Technostat Group (tenant: technostat) — 5 admin users
  tksa.owner tksa.admin ssk.admin tegy.admin sdtx.admin
)

PCC_USERS=(product.admin tenant.manager support.admin)

# ---------------------------------------------------------------------------
# kcadm helper — runs inside the KC container
# ---------------------------------------------------------------------------
kcadm() { docker exec "$CONTAINER_IAM" /opt/keycloak/bin/kcadm.sh "$@"; }

echo -e "${CYAN}=== Seeding IAM credentials ===${NC}"
echo -e "  realm athyper:          ${#ATHYPER_USERS[@]} users"
echo -e "  realm platform-control: ${#PCC_USERS[@]} users"

# Authenticate kcadm once — credentials cached at /opt/keycloak/.keycloak/kcadm.config
kcadm config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "$IAM_ADMIN_USER" \
  --password "$IAM_ADMIN_PASS" \
  >/dev/null

seed_user() {
  local realm="$1" user="$2" pass="$3"
  # set-password is idempotent; --temporary=false so KC does not force reset
  if ! kcadm set-password -r "$realm" --username "$user" --new-password "$pass" 2>/dev/null; then
    echo -e "${YELLOW}  ! ${realm}/${user} — skipped (user missing?)${NC}"
    return 0
  fi
  # Clear UPDATE_PASSWORD required action so next login is clean
  local uid
  uid=$(kcadm get users -r "$realm" -q "username=${user}" --fields id --format csv --noquotes 2>/dev/null | tail -n +2 | head -1 || true)
  if [[ -n "$uid" ]]; then
    kcadm update "users/${uid}" -r "$realm" -s 'requiredActions=[]' >/dev/null 2>&1 || true
  fi
  echo -e "${GREEN}  ✓ ${realm}/${user}${NC}"
}

echo -e "\n${CYAN}[1/2] realm=athyper${NC}"
for u in "${ATHYPER_USERS[@]}"; do
  seed_user athyper "$u" "$DEMO_PASS"
done

echo -e "\n${CYAN}[2/2] realm=platform-control${NC}"
for u in "${PCC_USERS[@]}"; do
  seed_user platform-control "$u" "$PCC_PASS"
done

echo -e "\n${GREEN}✓ Credential seeding complete${NC}"
echo -e "${YELLOW}Demo user password (athyper realm):          set from IAM_DEMO_USER_PASSWORD${NC}"
echo -e "${YELLOW}Demo user password (platform-control realm): set from IAM_PLATFORM_CONTROL_USER_PASSWORD${NC}"
