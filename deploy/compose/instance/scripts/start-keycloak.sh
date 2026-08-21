#!/usr/bin/env bash
set -Eeuo pipefail

KC_DB_PASSWORD="$(< /run/secrets/iam-db-password)"
KC_BOOTSTRAP_ADMIN_PASSWORD="$(< /run/secrets/iam-admin-password)"
STUDIO_IAM_CLIENT_SECRET="$(< /run/secrets/studio-iam-client-secret)"
NEON_IAM_CLIENT_SECRET="$(< /run/secrets/neon-iam-client-secret)"
MESH_IAM_CLIENT_SECRET="$(< /run/secrets/mesh-iam-client-secret)"
RUNTIME_IAM_CLIENT_SECRET="$(< /run/secrets/runtime-iam-client-secret)"
export KC_DB_PASSWORD KC_BOOTSTRAP_ADMIN_PASSWORD
export STUDIO_IAM_CLIENT_SECRET NEON_IAM_CLIENT_SECRET MESH_IAM_CLIENT_SECRET
export RUNTIME_IAM_CLIENT_SECRET
exec /opt/keycloak/bin/kc.sh start-dev --import-realm
