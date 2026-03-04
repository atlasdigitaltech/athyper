#!/usr/bin/env bash
# =====================================================
# athyper Mesh - Local TLS Certificate Generator
# Location:
#   mesh/scripts/generate-mesh-certs.sh
# Usage:
#   ./generate-mesh-certs.sh
#
# Requires: mkcert (https://github.com/FiloSottile/mkcert)
# =====================================================

set -euo pipefail

echo ""
echo "=========================================="
echo " athyper Mesh - mkcert TLS Generator"
echo "=========================================="
echo ""

# Resolve directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CERT_DIR="$MESH_DIR/config/gateway/certs"

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
echo "Generating mesh TLS certificates..."
mkcert \
  -cert-file "$CERT_DIR/mesh.tls.local.crt" \
  -key-file "$CERT_DIR/mesh.tls.local.key" \
  "*.athyper.local" "*.mesh.athyper.local"

if [[ $? -ne 0 ]]; then
  echo "ERROR: Certificate generation failed"
  exit 1
fi

echo ""
echo "Certificates generated successfully"
echo "Location: $CERT_DIR"
echo ""
