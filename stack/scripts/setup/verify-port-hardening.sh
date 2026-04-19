#!/usr/bin/env bash
# ============================================================
# athyper Stack - VERIFY PORT HARDENING (F8 Phase 2)
# Location:
#   stack/scripts/setup/verify-port-hardening.sh
# Usage:
#   ./verify-port-hardening.sh
#
# Enforces the single-ingress posture: a service that accepts
# traffic via Traefik MUST NOT also publish its backend port
# directly on the host. The only legitimate port publisher is
# the gateway itself (80/443 — the ingress).
#
# Rule:
#   If a service in any stack/compose/**/*.yml file has BOTH
#     (a) a traefik.* label, AND
#     (b) a `ports:` block that publishes a port,
#   then it violates F8 Phase 2 — unless it's on ALLOWLIST.
#
# Allowlist:
#   gateway — publishes 80/443 as the ingress. Its Traefik
#             labels point at api@internal (its own dashboard),
#             not a backend service, so there is no bypass path.
#
# Exit codes:
#   0 — all compose files pass
#   1 — one or more violations
#
# Tested as: stack-ci / verify-port-hardening (advisory in CI
# initially; promote to required once the baseline is clean).
# ============================================================

set -euo pipefail

# ----------------------------
# Resolve paths
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/../../compose" && pwd)"

if [[ ! -d "$COMPOSE_DIR" ]]; then
  echo "ERROR: Compose directory not found: $COMPOSE_DIR" >&2
  exit 1
fi

# ----------------------------
# Allowlist — services permitted to publish ports.
# One service name per line. Matches the YAML key under
# `services:` (e.g. `  gateway:` → "gateway").
# ----------------------------
ALLOWLIST=(
  "gateway"      # Traefik itself — publishes 80/443 as ingress, not a backend port
)

is_allowlisted() {
  local svc="$1"
  local allow
  for allow in "${ALLOWLIST[@]}"; do
    if [[ "$svc" == "$allow" ]]; then return 0; fi
  done
  return 1
}

# ----------------------------
# YAML service-block scan (awk)
# ----------------------------
# We do not need a full YAML parser. The compose files follow a
# predictable shape:
#
#   services:
#     my-service:
#       ...
#       ports:
#         - "X:Y"
#       labels:
#         - traefik.enable=true
#     another-service:
#       ...
#
# A service block is delimited by lines matching /^  [a-zA-Z0-9_-]+:\s*$/
# (exactly two spaces indent — the YAML mapping key under `services:`).
# Within each block:
#   has_ports   — seen a line matching /^    ports:/
#   has_traefik — seen a line containing "traefik."
#
# A block is a violation if has_ports AND has_traefik AND not allowlisted.
#
# The x-* top-level anchors (e.g., x-athyper-shared-env) are ignored
# because they live outside `services:` and never accumulate both flags.
# ----------------------------

scan_file() {
  local file="$1"
  awk -v file="$file" '
    /^services:\s*$/ { in_services = 1; next }
    # Top-level key that is not "services" — leaves the services block
    /^[a-zA-Z0-9_-]+:/ && !/^services:/ { in_services = 0 }

    # Service boundary inside services block: two-space indent + key
    in_services && /^  [a-zA-Z0-9_-]+:\s*$/ {
      # Flush previous service
      if (svc != "") {
        print file "\t" svc "\t" (has_ports ? "Y" : "N") "\t" (has_traefik ? "Y" : "N")
      }
      # Strip the leading 2 spaces and trailing colon
      svc = $0
      sub(/^  /, "", svc)
      sub(/:$/, "", svc)
      has_ports = 0
      has_traefik = 0
      next
    }

    # Flags inside a service
    svc != "" && /^    ports:\s*$/           { has_ports = 1 }
    svc != "" && /traefik\./                 { has_traefik = 1 }

    END {
      if (svc != "") {
        print file "\t" svc "\t" (has_ports ? "Y" : "N") "\t" (has_traefik ? "Y" : "N")
      }
    }
  ' "$file"
}

# ----------------------------
# Driver
# ----------------------------
echo "🔍 F8 Phase 2 — port hardening check"
echo "    compose dir: $COMPOSE_DIR"
echo "    allowlist:   ${ALLOWLIST[*]}"
echo

violations=0
services_checked=0
services_flagged=0

# Process all yml files in the compose tree
while IFS= read -r -d '' file; do
  while IFS=$'\t' read -r f svc has_ports has_traefik; do
    services_checked=$((services_checked + 1))
    if [[ "$has_ports" == "Y" && "$has_traefik" == "Y" ]]; then
      services_flagged=$((services_flagged + 1))
      if is_allowlisted "$svc"; then
        echo "  ⚪ ALLOW    $svc  (in $(basename "$f"))"
      else
        echo "  ❌ VIOLATION  $svc  (in $(basename "$f"))"
        echo "              service has both traefik.* labels and a ports: block."
        echo "              Either remove ports: (preferred — Traefik proxies via internal network)"
        echo "              or add '$svc' to the ALLOWLIST in $(basename "$0") with rationale."
        violations=$((violations + 1))
      fi
    fi
  done < <(scan_file "$file")
done < <(find "$COMPOSE_DIR" -type f -name "*.yml" -print0)

echo
echo "────────────────────────────────────────────────"
echo "  scanned: $services_checked service blocks"
echo "  flagged: $services_flagged (traefik + ports)"
echo "  violations: $violations"
echo "────────────────────────────────────────────────"

if [[ $violations -gt 0 ]]; then
  echo "❌ F8 Phase 2 check FAILED ($violations violations)"
  exit 1
fi

echo "✅ F8 Phase 2 check passed"
exit 0
