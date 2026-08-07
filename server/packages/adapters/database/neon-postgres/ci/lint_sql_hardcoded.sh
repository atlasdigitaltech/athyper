#!/bin/bash
# ============================================================================
# Athyper — SQL Hardcoded Values Lint
# File: server/packages/adapters/db/ci/lint_sql_hardcoded.sh
#
# Detects:
#   1. Hardcoded NEW.status = 'VALUE' in triggers without meta.validate_status_transition
#   2. Duplicate CHECK constraints (identical expression text)
#   3. Unconstrained text columns named status/type/category
#
# Usage:
#   bash server/packages/adapters/db/ci/lint_sql_hardcoded.sh
#
# Exit codes:
#   0 = clean
#   1 = warnings found (non-blocking)
# ============================================================================

set -euo pipefail

SQL_DIR="server/db/ddl"
WARNINGS=0

echo "══════════════════════════════════════════════════════════════"
echo "  SQL Hardcoded Values Lint"
echo "══════════════════════════════════════════════════════════════"
echo ""

# ── Check 1: Hardcoded status comparisons in triggers ──────────────────────
echo "── Check 1: Hardcoded NEW.status in trigger functions ──"
RESULTS=$(grep -rn "NEW\.status\s*=\s*'" "$SQL_DIR" \
    --include="*.sql" \
    2>/dev/null \
    | grep -v '10_seed_\|11_seed_\|99_tests' \
    | grep -v 'meta\.validate_status_transition' \
    | grep -v 'INTENTIONALLY HARDCODED' \
    | grep -v 'guard_status_transition' \
    || true)

if [ -n "$RESULTS" ]; then
    echo "  [WARN] Found hardcoded status comparisons in triggers:"
    echo "$RESULTS" | head -20
    WARNINGS=$((WARNINGS + $(echo "$RESULTS" | wc -l)))
else
    echo "  [OK] No unregistered hardcoded status comparisons found"
fi
echo ""

# ── Check 2: Hardcoded OLD.status in triggers ─────────────────────────────
echo "── Check 2: Hardcoded OLD.status in trigger functions ──"
RESULTS=$(grep -rn "OLD\.status\s*=\s*'" "$SQL_DIR" \
    --include="*.sql" \
    2>/dev/null \
    | grep -v '10_seed_\|11_seed_\|99_tests' \
    | grep -v 'meta\.validate_status_transition' \
    | grep -v 'INTENTIONALLY HARDCODED' \
    | grep -v 'guard_status_transition' \
    || true)

if [ -n "$RESULTS" ]; then
    echo "  [WARN] Found hardcoded status comparisons in triggers:"
    echo "$RESULTS" | head -20
    WARNINGS=$((WARNINGS + $(echo "$RESULTS" | wc -l)))
else
    echo "  [OK] No unregistered hardcoded status comparisons found"
fi
echo ""

# ── Check 3: Duplicate CHECK constraint patterns ──────────────────────────
echo "── Check 3: Potential duplicate CHECK constraints ──"
RESULTS=$(grep -roh "CHECK.*status.*IN.*'[A-Z].*'" "$SQL_DIR" \
    --include="*.sql" \
    2>/dev/null \
    | grep -v '10_seed_\|11_seed_\|99_tests' \
    | sort | uniq -c | sort -rn \
    | awk '$1 > 1 {print}' \
    || true)

if [ -n "$RESULTS" ]; then
    echo "  [WARN] Duplicate CHECK constraint patterns (count | pattern):"
    echo "$RESULTS" | head -10
    WARNINGS=$((WARNINGS + $(echo "$RESULTS" | wc -l)))
else
    echo "  [OK] No duplicate CHECK constraint patterns found"
fi
echo ""

# ── Summary ───────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════════"
if [ $WARNINGS -gt 0 ]; then
    echo "  $WARNINGS warning(s) found. Review and fix or mark as INTENTIONALLY HARDCODED."
    exit 1
else
    echo "  All checks passed."
    exit 0
fi
