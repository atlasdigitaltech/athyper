#!/usr/bin/env bash
# ============================================================
# athyper — Patch Missing Secrets
# Location:
#   stack/scripts/setup/patch-missing-secrets.sh
#
# Adds any secrets that are in the canonical list (write-env-staging.sh)
# but missing from /opt/stack/athyper/secrets/.env.
# Also deduplicates any key that appears more than once (keeps the FIRST
# occurrence — the value that was originally provisioned).
#
# SAFE to run on a live server: it never modifies or removes an existing key.
#
# When to use this:
#   - A new secret was added to write-env-staging.sh after the server was
#     originally provisioned (e.g. CREDENTIAL_MASTER_KEY added in fec510d).
#   - A key was accidentally duplicated by manual append (echo KEY=val >>).
#
# When NOT to use this:
#   - Rotating an existing key value → edit .env directly (see §6 of
#     docs/secrets-management.md).
#   - Re-provisioning a fresh server → use write-env-staging.sh instead.
#
# Usage (run as root):
#   sudo bash /opt/products/athyper/stack/scripts/setup/patch-missing-secrets.sh
#
# Exit codes:
#   0  — success (patch applied, or nothing to do)
#   1  — pre-flight failure
# ============================================================

set -euo pipefail

ENV_FILE="/opt/stack/athyper/secrets/.env"

# ─── Pre-flight ───────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: run as root.  sudo bash $0" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found." >&2
  echo "       Run write-env-staging.sh first for a fresh server." >&2
  exit 1
fi

# Suppress shell history — we're about to echo secrets into the env file.
unset HISTFILE
set +o history

# ─── Helpers ──────────────────────────────────────────────────────────────────
has_key() { grep -qE "^${1}=" "$ENV_FILE" 2>/dev/null; }

get_key() { grep -E "^${1}=" "$ENV_FILE" | head -1 | cut -d= -f2-; }

_added=()
_skipped=()
_dupes_removed=()

add_key() {
  local key="$1" value="$2" note="${3:-}"
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  _added+=("$key")
  if [[ -n "$note" ]]; then
    echo "  + ADDED   ${key}  [${note}]"
  else
    echo "  + ADDED   ${key}"
  fi
}

skip_key() { _skipped+=("$1"); echo "  . exists  ${1}"; }

# ─── Step 1: Deduplicate ──────────────────────────────────────────────────────
# Some operators append a second copy of a key via 'echo KEY=val >> .env'.
# This strips all but the first occurrence of every key, preserving blank
# lines and comments, and printing the removed duplicates to stderr.

echo ""
echo "=== Step 1/3  Deduplicating ==="

DUPES=$(awk -F= '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ || NF==0 { next }
  { key=$1; count[key]++ }
  END { for (k in count) if (count[k]>1) print k }
' "$ENV_FILE" || true)

if [[ -n "$DUPES" ]]; then
  mapfile -t _dupes_removed <<< "$DUPES"
  echo "  Duplicates found: ${_dupes_removed[*]}"
  cp "$ENV_FILE" "${ENV_FILE}.pre-dedup"

  awk -F= '
    /^[[:space:]]*#/ { print; next }
    /^[[:space:]]*$/ { print; next }
    NF == 0          { print; next }
    { key=$1; if (!seen[key]++) { print } else { print "  [removed duplicate: "$0"]" > "/dev/stderr" } }
  ' "$ENV_FILE" > "${ENV_FILE}.tmp"

  mv "${ENV_FILE}.tmp" "$ENV_FILE"
  echo "  Done. Original backed up to ${ENV_FILE}.pre-dedup"
else
  echo "  No duplicates found."
fi

# ─── Step 2: Add missing secrets ──────────────────────────────────────────────
# Generation methods mirror write-env-staging.sh exactly.
# Keep this list in sync when adding new secrets to that script.

echo ""
echo "=== Step 2/3  Checking canonical secret list ==="
echo ""

# ── Credentials ───────────────────────────────────────────────────────────────
# WARNING: CREDENTIAL_MASTER_KEY encrypts all tenant credential rows (webhook
# signing keys, endpoint auth tokens).  Once encrypted rows exist this key
# MUST NOT be changed without first running the B3.4 re-encryption migration.
# See docs/secrets-management.md §6.
if has_key "CREDENTIAL_MASTER_KEY"; then
  skip_key "CREDENTIAL_MASTER_KEY"
else
  add_key "CREDENTIAL_MASTER_KEY" \
    "$(openssl rand -base64 48 | tr -d '\n=')" \
    "BACK UP THIS VALUE — rotating requires re-encryption migration (B3.4)"
fi

# ── Database ──────────────────────────────────────────────────────────────────
# DB_ADMIN_PASSWORD uses hex so it embeds safely in libpq connection URLs.
if has_key "DB_ADMIN_PASSWORD"; then
  skip_key "DB_ADMIN_PASSWORD"
else
  add_key "DB_ADMIN_PASSWORD" "$(openssl rand -hex 32)"
fi

# DBPOOL_*_PASSWORD must equal DB_ADMIN_PASSWORD — PgBouncer auth and
# backend auth both use the same postgres superuser credential.
for pool_key in DBPOOL_APPS_PASSWORD DBPOOL_SESSION_PASSWORD; do
  if has_key "$pool_key"; then
    skip_key "$pool_key"
  else
    if has_key "DB_ADMIN_PASSWORD"; then
      add_key "$pool_key" "$(get_key DB_ADMIN_PASSWORD)" "set to match DB_ADMIN_PASSWORD"
    else
      add_key "$pool_key" "$(get_key DB_ADMIN_PASSWORD 2>/dev/null || openssl rand -hex 32)"
    fi
  fi
done

# ── IAM ───────────────────────────────────────────────────────────────────────
if has_key "IAM_ADMIN_PASSWORD"; then
  skip_key "IAM_ADMIN_PASSWORD"
else
  add_key "IAM_ADMIN_PASSWORD" "$(openssl rand -base64 32 | tr -d '\n=')"
fi

if has_key "IAM_CLIENT_SECRET"; then
  skip_key "IAM_CLIENT_SECRET"
else
  add_key "IAM_CLIENT_SECRET" "$(openssl rand -hex 32)"
fi

# ── Redis / MemoryCache ───────────────────────────────────────────────────────
# hex avoids %, +, = characters that break Redis ACL config and URL embedding.
for redis_key in MEMORYCACHE_PASSWORD REDIS_EXPORTER_PASSWORD \
                 REDIS_GLITCHTIP_PASSWORD REDIS_INFISICAL_PASSWORD REDIS_ADMIN_PASSWORD; do
  if has_key "$redis_key"; then
    skip_key "$redis_key"
  else
    add_key "$redis_key" "$(openssl rand -base64 32 | tr -d '\n=')"
  fi
done

# ── Object Storage (MinIO) ────────────────────────────────────────────────────
for s3_key in S3_SECRET_KEY APP_S3_SECRET_KEY BACKUP_S3_SECRET_KEY \
              TEMPO_S3_SECRET_KEY LOKI_S3_SECRET_KEY; do
  if has_key "$s3_key"; then
    skip_key "$s3_key"
  else
    add_key "$s3_key" "$(openssl rand -base64 32 | tr -d '\n=')"
  fi
done

# ── Renderer ──────────────────────────────────────────────────────────────────
if has_key "RENDERER_INTERNAL_TOKEN"; then
  skip_key "RENDERER_INTERNAL_TOKEN"
else
  add_key "RENDERER_INTERNAL_TOKEN" "$(openssl rand -hex 32)"
fi

# ── Infisical ─────────────────────────────────────────────────────────────────
if has_key "INFISICAL_ENCRYPTION_KEY"; then
  skip_key "INFISICAL_ENCRYPTION_KEY"
else
  # Must be exactly 32 hex chars (128-bit key).
  add_key "INFISICAL_ENCRYPTION_KEY" "$(openssl rand -hex 16)"
fi

if has_key "INFISICAL_AUTH_SECRET"; then
  skip_key "INFISICAL_AUTH_SECRET"
else
  add_key "INFISICAL_AUTH_SECRET" "$(openssl rand -base64 32 | tr -d '\n=')"
fi

# ── Telemetry (Grafana) ───────────────────────────────────────────────────────
if has_key "TELEMETRY_ADMIN_PASSWORD"; then
  skip_key "TELEMETRY_ADMIN_PASSWORD"
else
  add_key "TELEMETRY_ADMIN_PASSWORD" "$(openssl rand -base64 16 | tr -d '\n=')"
fi

# ── Search ────────────────────────────────────────────────────────────────────
if has_key "MEILI_MASTER_KEY"; then
  skip_key "MEILI_MASTER_KEY"
else
  add_key "MEILI_MASTER_KEY" "$(openssl rand -base64 32 | tr -d '\n=')"
fi

# ── Monitoring ────────────────────────────────────────────────────────────────
if has_key "HEALTHCHECKS_SECRET_KEY"; then
  skip_key "HEALTHCHECKS_SECRET_KEY"
else
  add_key "HEALTHCHECKS_SECRET_KEY" "$(openssl rand -base64 32 | tr -d '\n=')"
fi

if has_key "GLITCHTIP_SECRET_KEY"; then
  skip_key "GLITCHTIP_SECRET_KEY"
else
  add_key "GLITCHTIP_SECRET_KEY" "$(openssl rand -base64 32 | tr -d '\n=')"
fi

# ── Gateway htpasswd ──────────────────────────────────────────────────────────
# Cannot be auto-generated here — requires the bcrypt hash of IAM_ADMIN_PASSWORD.
# If missing, print instructions and skip.
if has_key "GATEWAY_DASHBOARD_HTPASSWD"; then
  skip_key "GATEWAY_DASHBOARD_HTPASSWD"
else
  echo "  ! MISSING  GATEWAY_DASHBOARD_HTPASSWD — cannot auto-generate (requires bcrypt)"
  echo "             Run manually:"
  IAM_PASS="$(get_key IAM_ADMIN_PASSWORD 2>/dev/null || echo '<IAM_ADMIN_PASSWORD>')"
  echo "             docker run --rm httpd:alpine htpasswd -nbB admin '${IAM_PASS}' | sed 's/\\\$/\\\$\\\$/g'"
  echo "             Then append: GATEWAY_DASHBOARD_HTPASSWD=<output> >> $ENV_FILE"
fi

# ─── Step 3: Restore permissions ──────────────────────────────────────────────
chown athyper:athyper "$ENV_FILE"
chmod 0600 "$ENV_FILE"

set -o history
export HISTFILE=~/.bash_history

echo ""
echo "=== Step 3/3  Permissions ==="
stat -c "  %U:%G %a %n" "$ENV_FILE"

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Done ==="
echo ""
echo "  Duplicates removed : ${#_dupes_removed[@]}"
echo "  Secrets added      : ${#_added[@]}"
echo "  Secrets existing   : ${#_skipped[@]}"

if [[ ${#_dupes_removed[@]} -gt 0 || ${#_added[@]} -gt 0 ]]; then
  echo ""
  echo "  Restart affected services to pick up the changes:"
  echo ""
  echo "    cd /opt/products/athyper/stack/compose"
  echo "    docker compose \\"
  echo "      --env-file /opt/products/athyper/stack/env/.env \\"
  echo "      --env-file /opt/stack/athyper/secrets/.env \\"
  echo "      restart athyper-api athyper-worker athyper-scheduler"
  echo ""
  echo "  Then re-validate:"
  echo "    bash /opt/products/athyper/stack/scripts/setup/validate-env.sh \\"
  echo "         /opt/products/athyper/stack/env/.env \\"
  echo "         /opt/stack/athyper/secrets/.env"
else
  echo ""
  echo "  All secrets already present and no duplicates — nothing changed."
fi
echo ""
