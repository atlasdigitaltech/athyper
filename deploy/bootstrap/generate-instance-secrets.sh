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
if [[ -e "$secret_root" ]]; then
  echo "Refusing to overwrite existing $instance secrets: $secret_root" >&2
  exit 1
fi

mkdir -p "$instance_root"
chmod 700 "$runtime_root" "$runtime_root/instances" "$instance_root" 2>/dev/null || true
staging="$(mktemp -d "$instance_root/.secrets-staging.XXXXXXXX")"
cleanup() { rm -rf -- "$staging"; }
trap cleanup EXIT INT TERM

random_urlsafe() { openssl rand -base64 48 | tr -d '\r\n' | tr '+/' '-_'; }
random_base64_32() { openssl rand -base64 32 | tr -d '\r\n'; }

for name in \
  iam-admin-password iam-db-password mesh-iam-client-secret minio-root-password \
  neon-iam-client-secret objectstorage-app-secret-key postgres-password redis-password \
  runtime-db-password runtime-iam-client-secret search-master-key \
  studio-iam-client-secret worker-db-password; do
  random_urlsafe > "$staging/$name"
done
openssl rand -hex 10 > "$staging/objectstorage-app-access-key"
random_base64_32 > "$staging/session-token-encryption-key"

chmod 600 "$staging"/*
count="$(find "$staging" -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d ' ')"
[[ "$count" == "15" ]] || { echo "Expected 15 secrets, generated $count" >&2; exit 1; }
mv "$staging" "$secret_root"
trap - EXIT INT TERM

receipt="$instance_root/secrets-receipt.json"
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$receipt" <<EOF
{
  "apiVersion": "athyper.io/v1alpha1",
  "kind": "InstanceSecretsReceipt",
  "generatedAt": "$generated_at",
  "instance": "$instance",
  "secretCount": 15,
  "directoryMode": "0700",
  "fileMode": "0600",
  "source": "cryptographic-random-isolated-instance",
  "devSecretsReused": false
}
EOF
chmod 600 "$receipt"
echo "Generated 15 owner-only $instance secrets under $secret_root; values were not printed."
