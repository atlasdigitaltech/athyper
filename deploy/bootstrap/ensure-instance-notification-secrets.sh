#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
instance="${1:-}"
case "$instance" in qa|stg) ;; *) echo "usage: $0 qa|stg" >&2; exit 2 ;; esac
runtime_root="${ATHYPER_RUNTIME_ROOT:-$HOME/.athyper}"
instance_root="$runtime_root/instances/$instance"
secret_root="$instance_root/secrets"
[[ -d "$secret_root" && -f "$instance_root/secrets-receipt.json" ]] \
  || { echo "$instance secret authority is absent" >&2; exit 1; }

present=0
for name in vapid-subject vapid-public-key vapid-private-key; do [[ -e "$secret_root/$name" ]] && present=$((present+1)); done
if [[ "$present" -ne 0 ]]; then
  [[ "$present" -eq 3 ]] || { echo "Refusing incomplete $instance VAPID set" >&2; exit 1; }
  for name in vapid-subject vapid-public-key vapid-private-key; do
    [[ -s "$secret_root/$name" && "$(stat -c '%a' "$secret_root/$name")" == 600 ]] \
      || { echo "$instance VAPID secrets must be non-empty and owner-only" >&2; exit 1; }
  done
  echo "$instance VAPID secrets already exist; no files changed."
  exit 0
fi

staging="$(mktemp -d "$instance_root/.vapid-staging.XXXXXXXX")"
cleanup(){ rm -rf -- "$staging"; }
trap cleanup EXIT INT TERM
ATHYPER_VAPID_INSTANCE="$instance" node - "$staging" <<'NODE'
const { generateKeyPairSync } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const root = process.argv[2], instance = process.env.ATHYPER_VAPID_INSTANCE;
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const { x, y, d } = privateKey.export({ format: "jwk" });
writeFileSync(`${root}/vapid-subject`, `mailto:notifications@${instance}.athyper.test\n`, { mode: 0o600 });
writeFileSync(`${root}/vapid-public-key`, `${Buffer.concat([Buffer.from([4]), Buffer.from(x, "base64url"), Buffer.from(y, "base64url")]).toString("base64url")}\n`, { mode: 0o600 });
writeFileSync(`${root}/vapid-private-key`, `${d}\n`, { mode: 0o600 });
NODE
chmod 600 "$staging"/*
for name in vapid-subject vapid-public-key vapid-private-key; do mv "$staging/$name" "$secret_root/$name"; done
node - "$instance_root/secrets-receipt.json" <<'NODE'
const fs=require("node:fs"),path=process.argv[2],receipt=JSON.parse(fs.readFileSync(path,"utf8"));
receipt.secretCount=Number(receipt.secretCount||0)+3;receipt.notificationProviderKeysAddedAt=new Date().toISOString();
fs.writeFileSync(path,`${JSON.stringify(receipt,null,2)}\n`,{mode:0o600});
NODE
trap - EXIT INT TERM
rmdir "$staging"
echo "Generated three owner-only $instance VAPID secrets; values were not printed."
