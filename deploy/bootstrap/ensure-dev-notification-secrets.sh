#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
runtime_root="${ATHYPER_RUNTIME_ROOT:-$HOME/.athyper}"
instance_root="$runtime_root/instances/dev"
secret_root="$instance_root/secrets"

[[ -d "$secret_root" ]] || { echo "DEV secret root is absent: $secret_root" >&2; exit 1; }
for name in vapid-subject vapid-public-key vapid-private-key; do
  [[ ! -e "$secret_root/$name" ]] || existing=true
done
if [[ "${existing:-false}" == "true" ]]; then
  for name in vapid-subject vapid-public-key vapid-private-key; do
    [[ -f "$secret_root/$name" && -s "$secret_root/$name" ]] || { echo "Refusing incomplete DEV VAPID secret set" >&2; exit 1; }
    [[ "$(stat -c '%a' "$secret_root/$name")" == "600" ]] || { echo "DEV VAPID secrets must be owner-only" >&2; exit 1; }
  done
  echo "DEV VAPID secrets already exist; no files changed."
  exit 0
fi

staging="$(mktemp -d "$instance_root/.vapid-staging.XXXXXXXX")"
cleanup(){ rm -rf -- "$staging"; }
trap cleanup EXIT INT TERM
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
for name in vapid-subject vapid-public-key vapid-private-key; do mv "$staging/$name" "$secret_root/$name"; done
node - "$instance_root/secrets-receipt.json" <<'NODE'
const fs=require("node:fs"),path=process.argv[2],receipt=JSON.parse(fs.readFileSync(path,"utf8"));
receipt.secretCount=18;receipt.notificationProviderKeysAddedAt=new Date().toISOString();
fs.writeFileSync(path,`${JSON.stringify(receipt,null,2)}\n`,{mode:0o600});
NODE
trap - EXIT INT TERM
rmdir "$staging"
echo "Generated three owner-only DEV VAPID secrets; values were not printed."
