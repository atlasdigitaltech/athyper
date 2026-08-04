CREATE INDEX tax_rate_schedule_resolution_idx
    ON control.tax_rate_schedule (
        tenant_id, jurisdiction_id, tax_type_id, tax_direction,
        component_code, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');

CREATE INDEX tax_rate_schedule_created_by_idx
    ON control.tax_rate_schedule (tenant_id, created_by);

CREATE INDEX tax_group_resolution_idx
    ON control.tax_group (tenant_id, code, effective_from DESC)
    WHERE status IN ('scheduled', 'active');

CREATE INDEX tax_group_jurisdiction_idx
    ON control.tax_group (tenant_id, jurisdiction_id, group_kind);

CREATE INDEX tax_group_rounding_rule_idx
    ON control.tax_group (tenant_id, rounding_rule_id);

CREATE INDEX tax_group_supersedes_idx
    ON control.tax_group (tenant_id, supersedes_tax_group_id)
    WHERE supersedes_tax_group_id IS NOT NULL;

CREATE INDEX tax_group_component_schedule_idx
    ON control.tax_group_component (tenant_id, tax_rate_schedule_id);

CREATE INDEX tax_resolution_rule_resolution_idx
    ON control.tax_resolution_rule (
        tenant_id, scope_company_code_id, scope_transaction_direction,
        priority DESC, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');

CREATE INDEX tax_resolution_rule_tax_group_idx
    ON control.tax_resolution_rule (tenant_id, resolved_tax_group_id);

CREATE INDEX wht_threshold_config_resolution_idx
    ON control.wht_threshold_config (
        tenant_id, company_code_id, jurisdiction_id, tax_type_id,
        section_code, threshold_mode, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');
