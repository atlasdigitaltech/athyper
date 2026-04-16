-- ============================================================================
-- aggregate/04_indexes.sql
-- Concept: Aggregate Indexes — roll-up query access paths
-- Depends on: 04_tables/010_aggregate.sql
-- Naming: <table>_<cols>_idx | _uq (unique) | _pidx (partial WHERE).
-- ============================================================================

-- ── aggregate.tax_credit_summary ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS tcs_company_period_idx
    ON aggregate.tax_credit_summary (tenant_id, company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS tcs_jurisdiction_period_idx
    ON aggregate.tax_credit_summary (tenant_id, jurisdiction_id, fiscal_year, period_number);
