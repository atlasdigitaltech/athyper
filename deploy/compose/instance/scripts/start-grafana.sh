#!/bin/bash
set -euo pipefail

secret_file="${GF_SECURITY_ADMIN_PASSWORD__FILE:?Grafana admin password file is required}"
if [[ ! -s "${secret_file}" ]]; then
  echo "Grafana admin password file is absent or empty" >&2
  exit 1
fi

# Compose file-backed secrets preserve the host file ownership. Read the
# owner-only secret during bootstrap, then run Grafana as its image UID.
export GF_SECURITY_ADMIN_PASSWORD="$(<"${secret_file}")"
unset GF_SECURITY_ADMIN_PASSWORD__FILE

exec su -p -s /bin/bash grafana -c "exec /run.sh"
