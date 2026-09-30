#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
runtime_root="${ATHYPER_RUNTIME_ROOT:-$HOME/.athyper}"
instance_root="$runtime_root/instances/dev"
secret_root="$instance_root/secrets"
disposition="${ATHYPER_STACK_V1_DISPOSITION:-/mnt/d/ATHYPER/qualification/stack-v1/disposition.json}"

command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
[[ -f "$disposition" ]] || { echo "Clean-slate disposition is absent: $disposition" >&2; exit 1; }

node - "$disposition" <<'NODE'
const fs = require("fs");
const document = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (document.kind !== "StackV1Disposition"
    || document.decision !== "clean-slate"
    || document.legacyData !== "disposable"
    || document.restoreAuthorized !== false
    || document.oldSecretsReuseAuthorized !== false
    || document.rawVolumeReuseAuthorized !== false) {
  throw new Error("Disposition does not authorize clean-slate secret generation.");
}
NODE

if [[ -e "$secret_root" ]]; then
  echo "Refusing to overwrite existing DEV secrets: $secret_root" >&2
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
node - "$staging" <<'NODE'
const { generateKeyPairSync } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const root = process.argv[2];
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const { x, y, d } = privateKey.export({ format: "jwk" });
writeFileSync(`${root}/vapid-subject`, "mailto:notifications@dev.athyper.test\n", { mode: 0o600 });
writeFileSync(`${root}/vapid-public-key`, `${Buffer.concat([Buffer.from([4]), Buffer.from(x, "base64url"), Buffer.from(y, "base64url")]).toString("base64url")}\n`, { mode: 0o600 });
writeFileSync(`${root}/vapid-private-key`, `${d}\n`, { mode: 0o600 });
NODE

chmod 600 "$staging"/*
expected=25
count="$(find "$staging" -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d ' ')"
[[ "$count" == "$expected" ]] || { echo "Expected $expected secrets, generated $count" >&2; exit 1; }
mv "$staging" "$secret_root"
trap - EXIT INT TERM

receipt="$instance_root/secrets-receipt.json"
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$receipt" <<EOF
{
  "apiVersion": "athyper.io/v1alpha1",
  "kind": "DevSecretsReceipt",
  "generatedAt": "$generated_at",
  "instance": "dev",
  "secretCount": $expected,
  "directoryMode": "0700",
  "fileMode": "0600",
  "source": "cryptographic-random-clean-slate",
  "oldSecretsReused": false
}
EOF
chmod 600 "$receipt"
echo "Generated $expected owner-only DEV secrets under $secret_root; values were not printed."
