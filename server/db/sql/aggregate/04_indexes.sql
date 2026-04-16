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

-- ── aggregate.wht_vendor_accumulator ─────────────────────────────────────────
-- R7-B: primary lookup — all vendors for a company × jurisdiction × year
CREATE INDEX IF NOT EXISTS wva_company_jur_year_idx
    ON aggregate.wht_vendor_accumulator
    (tenant_id, company_code_id, jurisdiction_id, tax_type_id, fiscal_year);

-- Partial: find vendors that have not yet reached threshold (for threshold-check query)
CREATE INDEX IF NOT EXISTS wva_not_reached_pidx
    ON aggregate.wht_vendor_accumulator
    (tenant_id, company_code_id, counterparty_id, fiscal_year)
    WHERE threshold_reached = false;
