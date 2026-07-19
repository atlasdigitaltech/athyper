CREATE INDEX IF NOT EXISTS fcc_tenant_status_idx
    ON control.fiscal_calendar_config (tenant_id, status, code, version_no DESC);
CREATE INDEX IF NOT EXISTS fcpr_config_order_idx
    ON control.fiscal_calendar_period_rule (tenant_id, fiscal_calendar_config_id, sequence_no)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS cfca_company_year_idx
    ON control.company_fiscal_calendar_assignment
       (tenant_id, company_code_id, effective_fiscal_year_from, effective_fiscal_year_to)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS fp_calendar_generation_idx
    ON master.fiscal_period (tenant_id, company_code_id, fiscal_calendar_config_id, fiscal_year);
CREATE UNIQUE INDEX IF NOT EXISTS fp_generation_key_uq
    ON master.fiscal_period (tenant_id, generation_key)
    WHERE generation_key IS NOT NULL;
