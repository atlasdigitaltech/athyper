#!/usr/bin/env bash
# =============================================================================
# server/db/ddl/runner.sh
# Concept: Fail-hard, manifest-driven DDL runner — 13-layer schema-first
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host/db bash runner.sh
#   DATABASE_URL=... bash runner.sh --dry-run   (print files, no execution)
#
# Execution contract:
#   - ON_ERROR_STOP=1 — any SQL error aborts immediately
#   - set -euo pipefail — any bash error aborts immediately
#   - Each file runs in its own psql call (not a single transaction).
#     Cross-schema FKs require all tables to exist before any constraints;
#     a single outer transaction cannot span that boundary cleanly.
#   - Absent files (intentionally empty layer slots) are silently skipped.
#   - No 2>/dev/null, no || true, no --ignore-errors.
# =============================================================================
set -euo pipefail

DB_URL="${DATABASE_URL:?DATABASE_URL environment variable is required}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

SQL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ordered schema list — defines cross-schema dependency execution order.
# shared must be first (uuidv7, RLS accessor). control before master/document.
# aggregate last (depends on ledger + document FKs).
SCHEMAS=(shared control master document ledger log event governance snapshot aggregate)

# ─── helpers ──────────────────────────────────────────────────────────────────

run_file() {
    local f="$1"
    [[ -f "$f" ]] || return 0          # absent = intentionally empty slot — skip
    local label
    label="$(basename "$(dirname "$f")")/$(basename "$f")"
    echo "    $label"
    if [[ "$DRY_RUN" == false ]]; then
        psql "$DB_URL" \
            --single-transaction \
            -v ON_ERROR_STOP=1 \
            --no-psqlrc \
            --quiet \
            -f "$f"
    fi
}

phase() {
    echo ""
    echo "=== Phase $1: $2 ==="
}

# ─── Phase 0: Platform foundation ─────────────────────────────────────────────
# Roles → extensions → schemas → domain types.
# No tables exist yet. No schema-specific objects.
phase 0 "Platform (roles / extensions / schemas / domains)"

run_file "$SQL_DIR/000_bootstrap/000_roles.sql"
run_file "$SQL_DIR/000_bootstrap/001_extensions.sql"
run_file "$SQL_DIR/000_bootstrap/002_schemas.sql"
run_file "$SQL_DIR/000_bootstrap/002b_int_schema.sql"
run_file "$SQL_DIR/000_bootstrap/003_domains.sql"

# ─── Phase 1: Public schema ────────────────────────────────────────────────────
# public.* bootstrap, tables, pre-constraint functions, constraints, indexes,
# functions, triggers, views, RLS. Isolated — no cross-schema FKs.
phase 1 "Public schema (all layers)"

for layer in 00_bootstrap 01_tables 02_pre_constraint 03_constraints \
             04_indexes   05_functions 06_triggers    07_views 08_rls; do
    run_file "$SQL_DIR/public/${layer}.sql"
done

# ─── Phase 2: Bootstrap functions — ALL schemas ────────────────────────────────
# CRITICAL: shared.uuidv7() and peer bootstrap functions MUST exist before
# any CREATE TABLE ... DEFAULT shared.uuidv7() in Phase 3.
phase 2 "Bootstrap functions (all schemas — before tables)"

for schema in "${SCHEMAS[@]}"; do
    run_file "$SQL_DIR/${schema}/00_bootstrap.sql"
done

# ─── Phase 3: Tables — ALL schemas ────────────────────────────────────────────
# All tables from all schemas before any cross-schema FK constraints.
# Within a schema, table sub-files (01_tables, 01b_, 01c_, …) run in order.
phase 3 "Tables (all schemas — cross-schema FKs deferred)"

for schema in "${SCHEMAS[@]}"; do
    for f in "$SQL_DIR/${schema}"/01*.sql; do
        run_file "$f"
    done
done

# ─── Phase 4: Pre-constraint functions — ALL schemas ──────────────────────────
# Functions that depend on tables existing but must precede constraint triggers.
# Example: control.fn_valid_lookup() is called by check constraints added next.
phase 4 "Pre-constraint functions (all schemas)"

for schema in "${SCHEMAS[@]}"; do
    run_file "$SQL_DIR/${schema}/02_pre_constraint.sql"
done

# ─── Phase 5: Constraints — ALL schemas ────────────────────────────────────────
phase 5 "Constraints (all schemas)"

for schema in "${SCHEMAS[@]}"; do
    run_file "$SQL_DIR/${schema}/03_constraints.sql"
done

# ─── Phase 6: Indexes — ALL schemas ───────────────────────────────────────────
phase 6 "Indexes (all schemas)"

for schema in "${SCHEMAS[@]}"; do
    run_file "$SQL_DIR/${schema}/04_indexes.sql"
done

# ─── Phase 7: Functions — ALL schemas ─────────────────────────────────────────
phase 7 "Functions (all schemas)"

for schema in "${SCHEMAS[@]}"; do
    run_file "$SQL_DIR/${schema}/05_functions.sql"
done

# ─── Phase 8: Triggers — ALL schemas ──────────────────────────────────────────
phase 8 "Triggers (all schemas)"

for schema in "${SCHEMAS[@]}"; do
    run_file "$SQL_DIR/${schema}/06_triggers.sql"
done

# ─── Phase 9: Views — ALL schemas ─────────────────────────────────────────────
phase 9 "Views (all schemas)"

for schema in "${SCHEMAS[@]}"; do
    run_file "$SQL_DIR/${schema}/07_views.sql"
done

# ─── Phase 10: RLS policies — ALL schemas ─────────────────────────────────────
phase 10 "RLS policies (all schemas)"

for schema in "${SCHEMAS[@]}"; do
    run_file "$SQL_DIR/${schema}/08_rls.sql"
done

# ─── Phase 11: Security hardening ─────────────────────────────────────────────
# REVOKE defaults, search_path locks, SECURITY DEFINER grants.
# Must run last — references all functions/views defined above.
phase 11 "Security hardening"

run_file "$SQL_DIR/security/800_security_hardening.sql"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
if [[ "$DRY_RUN" == true ]]; then
    echo "=== Dry run complete — no SQL was executed ==="
else
    echo "=== Schema provisioning complete ==="
fi
