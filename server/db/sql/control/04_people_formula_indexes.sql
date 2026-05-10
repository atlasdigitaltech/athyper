-- ============================================================================
-- control/04_people_formula_indexes.sql
-- ============================================================================

CREATE INDEX IF NOT EXISTS formula_expression_tenant_status_idx
    ON control.formula_expression (tenant_id, status, code);

CREATE INDEX IF NOT EXISTS formula_expression_version_effective_idx
    ON control.formula_expression_version (tenant_id, formula_expression_id, effective_from DESC)
    WHERE status = 'effective';

CREATE UNIQUE INDEX IF NOT EXISTS formula_expression_version_one_effective_uq
    ON control.formula_expression_version (tenant_id, formula_expression_id)
    WHERE status = 'effective';

CREATE INDEX IF NOT EXISTS rate_table_tenant_status_idx
    ON control.rate_table (tenant_id, status, code);

CREATE INDEX IF NOT EXISTS rate_table_row_lookup_idx
    ON control.rate_table_row (tenant_id, rate_table_id, effective_from DESC, sequence_no);
