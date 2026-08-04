CREATE INDEX fiscal_calendar_config_lineage_idx
    ON control.fiscal_calendar_config (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;

CREATE INDEX fiscal_calendar_period_rule_order_idx
    ON control.fiscal_calendar_period_rule (
        tenant_id, fiscal_calendar_config_id, sequence_no
    );

CREATE INDEX company_fiscal_calendar_assignment_resolution_idx
    ON control.company_fiscal_calendar_assignment (
        tenant_id, company_code_id,
        effective_fiscal_year_from DESC,
        effective_fiscal_year_to
    )
    WHERE status = 'active';

CREATE INDEX company_fiscal_calendar_assignment_config_idx
    ON control.company_fiscal_calendar_assignment (
        tenant_id, fiscal_calendar_config_id, status
    );
