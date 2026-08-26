#!/bin/sh
set -eu

usage() {
  echo "Usage: install-stg-secret.sh <secret-name> [--from-file <path>]" >&2
  exit 2
}

[ "$#" -eq 1 ] || [ "$#" -eq 3 ] || usage
name="$1"
case "$name" in
  iam-admin-password|iam-db-password|mesh-iam-client-secret|minio-root-password|neon-iam-client-secret|objectstorage-app-access-key|objectstorage-app-secret-key|postgres-password|redis-password|runtime-db-password|runtime-iam-client-secret|search-master-key|session-token-encryption-key|smtp-from|smtp-host|smtp-password|smtp-port|smtp-secure|smtp-user|studio-iam-client-secret|vapid-subject|vapid-public-key|vapid-private-key|worker-db-password) ;;
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
  printf '%s\n' "$value" > "$temporary"
  unset value
fi

[ -s "$temporary" ] || { echo "Secret value is empty" >&2; exit 2; }
mv "$temporary" "${directory}/${name}"
chmod 600 "${directory}/${name}"
trap - EXIT HUP INT TERM
echo "Installed owner-only STG secret: $name"
