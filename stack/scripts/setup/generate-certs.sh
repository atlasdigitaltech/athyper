#!/usr/bin/env bash
# =====================================================
# athyper Stack - Local TLS Certificate Generator
# Location:
#   stack/scripts/setup/generate-certs.sh
# Usage:
#   ./generate-certs.sh
#
# Generates a wildcard TLS certificate for local dev using mkcert.
# SANs covered:
#   *.athyper.local, neon.athyper.local, gateway.athyper.local,
#   api.athyper.local, iam.athyper.local, objectstorage.athyper.local
# Output: ATHYPER_SECRETS_ROOT/gateway/certs/athyper.tls.local.{crt,key}
#         (read from stack/env/.env; defaults to stack/secrets)
#
# Requires: mkcert (https://github.com/FiloSottile/mkcert)
#   macOS:  brew install mkcert
#   Linux:  https://github.com/FiloSottile/mkcert#linux
#   Win:    winget install FiloSottile.mkcert (see generate-certs.bat)
# =====================================================

set -euo pipefail

echo ""
echo "=========================================="
echo " athyper Stack - mkcert TLS Generator"
echo "=========================================="
echo ""

# Resolve directories. Precedence: process env > stack/env/.env value > default.
# Defaults are applied AFTER the .env loop so that an env-file value can win
# when the variable is unset in the calling shell.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$STACK_DIR/env/.env"

if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r _l || [[ -n "$_l" ]]; do
    [[ "$_l" =~ ^[[:space:]]*# ]] && continue
    [[ "$_l" =~ ^[[:space:]]*$ ]] && continue
    _k="${_l%%=*}"; _k="${_k//[[:space:]]/}"
    _v="${_l#*=}"; _v="${_v%%#*}"; _v="${_v%"${_v##*[![:space:]]}"}"
    [[ "$_v" =~ ^\"(.*)\"$ ]] && _v="${BASH_REMATCH[1]}"
    if [[ "$_k" == "ATHYPER_SECRETS_ROOT" && -z "${ATHYPER_SECRETS_ROOT:-}" ]]; then
      ATHYPER_SECRETS_ROOT="$_v"
    fi
    if [[ "$_k" == "ATHYPER_CONFIG_ROOT" && -z "${ATHYPER_CONFIG_ROOT:-}" ]]; then
      ATHYPER_CONFIG_ROOT="$_v"
    fi
  done < "$ENV_FILE"
fi
ATHYPER_CONFIG_ROOT="${ATHYPER_CONFIG_ROOT:-$STACK_DIR/config}"
ATHYPER_SECRETS_ROOT="${ATHYPER_SECRETS_ROOT:-$STACK_DIR/secrets}"
CERT_DIR="$ATHYPER_SECRETS_ROOT/gateway/certs"

# Ensure mkcert exists
if ! command -v mkcert &>/dev/null; then
  echo "ERROR: mkcert not found in PATH"
  echo "Install from https://github.com/FiloSottile/mkcert"
  echo ""
  echo "On macOS:   brew install mkcert"
  echo "On Linux:   See https://github.com/FiloSottile/mkcert#linux"
  exit 1
fi

# Create cert directory
if [[ ! -d "$CERT_DIR" ]]; then
  echo "Creating cert directory:"
  echo "  $CERT_DIR"
  mkdir -p "$CERT_DIR"
fi

# Install local CA (idempotent)
echo ""
echo "Installing mkcert local CA..."
mkcert -install

# Generate certificate
echo ""
echo "Generating athyper TLS certificates..."
mkcert \
  -cert-file "$CERT_DIR/athyper.tls.local.crt" \
  -key-file "$CERT_DIR/athyper.tls.local.key" \
  "*.athyper.local" \
  "neon.athyper.local" "gateway.athyper.local" \
  "api.athyper.local" "iam.athyper.local" "objectstorage.athyper.local"

echo ""
echo "Certificates generated successfully"
echo "Location: $CERT_DIR"
echo ""
