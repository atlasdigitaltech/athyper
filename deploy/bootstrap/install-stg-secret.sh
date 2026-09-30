#!/bin/sh
set -eu

usage() {
  echo "Usage: install-stg-secret.sh <secret-name> [--from-file <path>]" >&2
  exit 2
}

[ "$#" -eq 1 ] || [ "$#" -eq 3 ] || usage
name="$1"
case "$name" in
  analytics-db-password|grafana-admin-password|infisical-auth-secret|infisical-db-password|infisical-encryption-key|publication-infisical-token|iam-admin-password|iam-db-password|mesh-iam-client-secret|minio-root-password|neon-iam-client-secret|objectstorage-app-access-key|objectstorage-app-secret-key|objectstorage-artifacts-writer-access-key|objectstorage-artifacts-writer-secret-key|postgres-password|redis-password|runtime-db-password|runtime-iam-client-secret|search-master-key|session-token-encryption-key|smtp-from|smtp-host|smtp-password|smtp-port|smtp-secure|smtp-user|studio-iam-client-secret|vapid-subject|vapid-public-key|vapid-private-key|worker-db-password) ;;
  *) echo "Unsupported STG secret name: $name" >&2; exit 2 ;;
esac

runtime_root="${ATHYPER_RUNTIME_ROOT:-${HOME}/.athyper}"
directory="${runtime_root}/instances/stg/secrets"
mkdir -p "$directory"
chmod 700 "$directory"
temporary="$(mktemp "${directory}/.${name}.XXXXXX")"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
chmod 600 "$temporary"

if [ "$#" -eq 3 ]; then
  [ "$2" = "--from-file" ] || usage
  [ -f "$3" ] || { echo "Secret source must be a regular file" >&2; exit 2; }
  [ -s "$3" ] || { echo "Secret source is empty" >&2; exit 2; }
  cp "$3" "$temporary"
else
  [ -t 0 ] || { echo "Interactive secret entry requires a terminal; use --from-file for secret-manager output" >&2; exit 2; }
  printf 'Enter %s (input hidden): ' "$name" >&2
  stty -echo
  trap 'stty echo; rm -f "$temporary"' EXIT HUP INT TERM
  IFS= read -r value
  stty echo
  printf '\n' >&2
  [ -n "$value" ] || { echo "Secret value is empty" >&2; exit 2; }
  printf '%s' "$value" > "$temporary"
  unset value
fi

[ -s "$temporary" ] || { echo "Secret value is empty" >&2; exit 2; }
# Database/cache consumers require exact, single-line password bytes. Do not
# trim or silently repair imported passwords: that would change credentials.
# Other secret formats remain byte-preserving, including multiline key files.
case "$name" in
  *-password)
    bytes=$(wc -c < "$temporary")
    clean_bytes=$(LC_ALL=C tr -d '\000\r\n' < "$temporary" | wc -c)
    [ "$bytes" -eq "$clean_bytes" ] || { echo "Password must not contain NUL, CR or LF" >&2; exit 2; }
    [ "$bytes" -le 1024 ] || { echo "Password must contain at most 1024 bytes" >&2; exit 2; }
    node -e 'const b=require("fs").readFileSync(process.argv[1]);process.exit(Buffer.from(b.toString("utf8")).equals(b)?0:1)' "$temporary" || {
      echo "Password must be valid UTF-8 (Node.js is required for validation)" >&2; exit 2;
    }
    ;;
esac
mv "$temporary" "${directory}/${name}"
chmod 600 "${directory}/${name}"
trap - EXIT HUP INT TERM
echo "Installed owner-only STG secret: $name"
