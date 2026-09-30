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

# Grafana logs missing optional provisioning directories as errors. Assemble a
# complete runtime tree and include Tempo only when tracing mode is selected.
provisioning=/tmp/grafana-provisioning
mkdir -p "${provisioning}"/{alerting,dashboards,datasources,plugins}
cp /athyper/provisioning-source/datasources/datasources.yaml \
  "${provisioning}/datasources/platform.yaml"
cp /athyper/provisioning-source/dashboards/business-partner.yaml \
  "${provisioning}/dashboards/business-partner.yaml"
mkdir -p "${provisioning}/dashboards/json"
cp /athyper/provisioning-source/dashboards/json/business-partner-p9.json \
  "${provisioning}/dashboards/json/business-partner-p9.json"
cp /athyper/provisioning-source/dashboards/json/business-partner-360.json \
  "${provisioning}/dashboards/json/business-partner-360.json"
if [[ "${ATHYPER_OPERATIONS_MODE:-lite}" == "tracing" ]]; then
  cp /athyper/provisioning-source/tracing/tempo.yaml \
    "${provisioning}/datasources/tempo.yaml"
else
  # Remove Tempo left by a previous tracing or pre-mode-aware deployment.
  cp /athyper/provisioning-source/lite/delete-tempo.yaml \
    "${provisioning}/datasources/delete-tempo.yaml"
fi
export GF_PATHS_PROVISIONING="${provisioning}"

exec su -p -s /bin/bash grafana -c "exec /run.sh"
