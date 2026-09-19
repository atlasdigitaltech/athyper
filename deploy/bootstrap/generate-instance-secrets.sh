#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
instance="${1:-}"
case "$instance" in
  qa|stg) ;;
  *) echo "usage: $0 qa|stg" >&2; exit 2 ;;
esac

runtime_root="${ATHYPER_RUNTIME_ROOT:-$HOME/.athyper}"
instance_root="$runtime_root/instances/$instance"
secret_root="$instance_root/secrets"

command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }
preserve_stg_vapid=false
if [[ -e "$secret_root" ]]; then
  if [[ "$instance" != "stg" || -e "$instance_root/secrets-receipt.json" ]]; then
    echo "Refusing to overwrite existing $instance secrets: $secret_root" >&2
    exit 1
  fi
  existing_count="$(find "$secret_root" -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d ' ')"
  [[ "$existing_count" == "3" ]] || { echo "Refusing unrecognized pre-existing STG secret set" >&2; exit 1; }
  for name in vapid-subject vapid-public-key vapid-private-key; do
    [[ -f "$secret_root/$name" && -s "$secret_root/$name" ]] \
      || { echo "Refusing incomplete pre-existing STG VAPID set" >&2; exit 1; }
    mode="$(stat -c '%a' "$secret_root/$name")"
    [[ "$mode" == "600" ]] || { echo "Pre-existing STG VAPID files must be owner-only" >&2; exit 1; }
  done
  preserve_stg_vapid=true
fi

mkdir -p "$instance_root"
chmod 700 "$runtime_root" "$runtime_root/instances" "$instance_root" 2>/dev/null || true
staging="$(mktemp -d "$instance_root/.secrets-staging.XXXXXXXX")"
preserved="$instance_root/.preserved-vapid"
installed=false
receipt="${instance_root}/secrets-receipt.json"
receipt_staging=""
cleanup() {
  rm -rf -- "$staging"
  rm -f -- "$receipt_staging"
  if [[ "$installed" == "true" ]]; then rm -rf -- "$secret_root" "$receipt"; fi
  if [[ -d "$preserved" ]]; then mv -- "$preserved" "$secret_root"; fi
}
trap cleanup EXIT INT TERM

if [[ "$preserve_stg_vapid" == "true" ]]; then
  cp -- "$secret_root/vapid-subject" "$secret_root/vapid-public-key" "$secret_root/vapid-private-key" "$staging/"
fi

random_urlsafe() { openssl rand -base64 48 | tr -d '\r\n' | tr '+/' '-_'; }
random_base64_32() { openssl rand -base64 32 | tr -d '\r\n'; }

for name in \
  analytics-db-password grafana-admin-password infisical-auth-secret \
  infisical-db-password infisical-encryption-key \
  iam-admin-password iam-db-password mesh-iam-client-secret minio-root-password \
  neon-iam-client-secret objectstorage-app-secret-key objectstorage-artifacts-writer-secret-key postgres-password redis-password \
  runtime-db-password runtime-iam-client-secret search-master-key \
  studio-iam-client-secret worker-db-password; do
  random_urlsafe > "$staging/$name"
done
openssl rand -hex 10 > "$staging/objectstorage-app-access-key"
openssl rand -hex 10 > "$staging/objectstorage-artifacts-writer-access-key"
random_base64_32 > "$staging/session-token-encryption-key"

if [[ "$preserve_stg_vapid" == "false" ]]; then
  ATHYPER_VAPID_INSTANCE="$instance" node - "$staging" <<'NODE'
const { generateKeyPairSync } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const root = process.argv[2];
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const { x, y, d } = privateKey.export({ format: "jwk" });
writeFileSync(`${root}/vapid-subject`, `mailto:notifications@${process.env.ATHYPER_VAPID_INSTANCE}.athyper.test\n`, { mode: 0o600 });
writeFileSync(`${root}/vapid-public-key`, `${Buffer.concat([Buffer.from([4]), Buffer.from(x, "base64url"), Buffer.from(y, "base64url")]).toString("base64url")}\n`, { mode: 0o600 });
writeFileSync(`${root}/vapid-private-key`, `${d}\n`, { mode: 0o600 });
NODE
fi

chmod 600 "$staging"/*
expected=25
count="$(find "$staging" -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d ' ')"
[[ "$count" == "$expected" ]] || { echo "Expected $expected secrets, generated $count" >&2; exit 1; }
if [[ "$preserve_stg_vapid" == "true" ]]; then
  mv "$secret_root" "$preserved"
  mv "$staging" "$secret_root"
else
  mv "$staging" "$secret_root"
fi
installed=true

generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
receipt_staging="$(mktemp "$instance_root/.secrets-receipt.XXXXXXXX")"
cat > "$receipt_staging" <<EOF
{
  "apiVersion": "athyper.io/v1alpha1",
  "kind": "InstanceSecretsReceipt",
  "generatedAt": "$generated_at",
  "instance": "$instance",
  "secretCount": $expected,
  "directoryMode": "0700",
  "fileMode": "0600",
  "source": "cryptographic-random-isolated-instance",
  "devSecretsReused": false
}
EOF
chmod 600 "$receipt_staging"
mv "$receipt_staging" "$receipt"
receipt_staging=""
rm -rf -- "$preserved"
trap - EXIT INT TERM
echo "Generated $expected owner-only $instance secrets under $secret_root; values were not printed."
