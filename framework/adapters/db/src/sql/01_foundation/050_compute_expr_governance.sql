-- ============================================================================
-- Computed Field Expression Governance
-- ============================================================================
-- Strengthens the compute_expr JSONB column on meta.field with:
--   - Expression type enum validation
--   - Aggregate type requires aggregateOf + aggregateOp
--   - System type expr must be from closed allowlist
--   - dependsOn must be an array when present
--   - Materialized governance: recomputeTrigger, stalePolicy enums
--   - scheduleInterval requires recomputeTrigger=scheduled
--   - recomputeTrigger/stalePolicy only valid with compute_mode=materialized
--
-- All constraints use DROP IF EXISTS + ADD for idempotency.
-- ============================================================================

-- ============================================================================
-- 1. Expression type must be a known value
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_compute_expr_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_compute_expr_type
    CHECK (
        compute_expr IS NULL
        OR (compute_expr ->> 'type') IN ('formula', 'aggregate', 'system')
    );

-- ============================================================================
-- 2. Aggregate type requires aggregateOf and aggregateOp
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_compute_aggregate_wiring;
ALTER TABLE meta.field ADD CONSTRAINT chk_compute_aggregate_wiring
    CHECK (
        compute_expr IS NULL
        OR (compute_expr ->> 'type') != 'aggregate'
        OR (
            (compute_expr ? 'aggregateOf')
            AND (compute_expr ? 'aggregateOp')
        )
    );

-- ============================================================================
-- 3. aggregateOp must be a known value
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_compute_aggregate_op;
ALTER TABLE meta.field ADD CONSTRAINT chk_compute_aggregate_op
    CHECK (
        compute_expr IS NULL
        OR NOT compute_expr ? 'aggregateOp'
        OR (compute_expr ->> 'aggregateOp') IN ('count', 'sum', 'avg', 'min', 'max')
    );

-- ============================================================================
-- 4. System type expr must be from closed allowlist
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_compute_system_allowlist;
ALTER TABLE meta.field ADD CONSTRAINT chk_compute_system_allowlist
    CHECK (
        compute_expr IS NULL
        OR (compute_expr ->> 'type') != 'system'
        OR (compute_expr ->> 'expr') IN (
            'now', 'current_user', 'current_tenant', 'row_version', 'uuid_generate'
        )
    );

-- ============================================================================
-- 5. dependsOn must be an array when present
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_compute_depends_on_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_compute_depends_on_type
    CHECK (
        compute_expr IS NULL
        OR NOT compute_expr ? 'dependsOn'
        OR jsonb_typeof(compute_expr -> 'dependsOn') = 'array'
    );

-- ============================================================================
-- 6. recomputeTrigger must be a known value
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_compute_recompute_trigger;
ALTER TABLE meta.field ADD CONSTRAINT chk_compute_recompute_trigger
    CHECK (
        compute_expr IS NULL
        OR NOT compute_expr ? 'recomputeTrigger'
        OR (compute_expr ->> 'recomputeTrigger') IN (
            'on_dependency_change', 'on_save', 'scheduled'
        )
    );

-- ============================================================================
-- 7. stalePolicy must be a known value
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_compute_stale_policy;
ALTER TABLE meta.field ADD CONSTRAINT chk_compute_stale_policy
    CHECK (
        compute_expr IS NULL
        OR NOT compute_expr ? 'stalePolicy'
        OR (compute_expr ->> 'stalePolicy') IN (
            'serve_stale', 'null_until_recomputed', 'recompute_sync'
        )
    );

-- ============================================================================
-- 8. scheduleInterval requires recomputeTrigger=scheduled
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_compute_schedule_requires_trigger;
ALTER TABLE meta.field ADD CONSTRAINT chk_compute_schedule_requires_trigger
    CHECK (
        compute_expr IS NULL
        OR NOT compute_expr ? 'scheduleInterval'
        OR (compute_expr ->> 'recomputeTrigger') = 'scheduled'
    );

-- ============================================================================
-- 9. recomputeTrigger/stalePolicy only valid with compute_mode=materialized
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_compute_governance_materialized_only;
ALTER TABLE meta.field ADD CONSTRAINT chk_compute_governance_materialized_only
    CHECK (
        compute_expr IS NULL
        OR (
            (NOT compute_expr ? 'recomputeTrigger' OR compute_mode = 'materialized')
            AND (NOT compute_expr ? 'stalePolicy' OR compute_mode = 'materialized')
        )
    );

-- ============================================================================
-- 10. Column comment updates
-- ============================================================================

COMMENT ON COLUMN meta.field.compute_expr IS
  'Computed field expression with dependency governance. Shape: { type: "formula"|"aggregate"|"system", expr: string, dependsOn?: string[], aggregateOf?: string, aggregateOp?: "count"|"sum"|"avg"|"min"|"max", aggregateFilter?: object, recomputeTrigger?: "on_dependency_change"|"on_save"|"scheduled" (materialized only), stalePolicy?: "serve_stale"|"null_until_recomputed"|"recompute_sync" (materialized only), scheduleInterval?: string (scheduled only) }. Formula DSL: only field refs, numeric literals, +,-,*,/. System: closed allowlist (now, current_user, current_tenant, row_version, uuid_generate). Compiler validates dependency DAG and rejects cycles.';
