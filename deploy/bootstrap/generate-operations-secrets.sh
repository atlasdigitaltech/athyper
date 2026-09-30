#!/bin/sh
set -eu

runtime_root="${ATHYPER_RUNTIME_ROOT:-${HOME}/.athyper}"
secret_directory="${runtime_root}/operations/secrets"
secret_path="${secret_directory}/grafana-admin-password"

umask 077
mkdir -p "$secret_directory"
chmod 700 "$secret_directory"

if [ -e "$secret_path" ]; then
  echo "operations secret already exists: $secret_path"
  exit 0
fi

temporary="$(mktemp "${secret_directory}/.grafana-admin-password.XXXXXX")"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
openssl rand -base64 48 > "$temporary"
chmod 600 "$temporary"
mv "$temporary" "$secret_path"
trap - EXIT HUP INT TERM
echo "created owner-only operations secret: $secret_path"
