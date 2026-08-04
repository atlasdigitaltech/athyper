ALTER TABLE control.tax_rate_schedule
    ADD CONSTRAINT tax_rate_schedule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT tax_rate_schedule_jurisdiction_fk
        FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_rate_schedule_tax_type_fk
        FOREIGN KEY (tenant_id, tax_type_id) REFERENCES master.tax_type(tenant_id, id),
    ADD CONSTRAINT tax_rate_schedule_currency_fk
        FOREIGN KEY (rate_currency) REFERENCES shared.currency(code),
    ADD CONSTRAINT tax_rate_schedule_uom_fk
        FOREIGN KEY (rate_uom_code) REFERENCES shared.uom(code),
    ADD CONSTRAINT tax_rate_schedule_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_rate_schedule_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_rate_schedule_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.tax_rate_schedule
    ADD CONSTRAINT tax_rate_schedule_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        jurisdiction_id WITH =,
        tax_type_id WITH =,
        tax_direction WITH =,
        component_code WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.tax_group
    ADD CONSTRAINT tax_group_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT tax_group_jurisdiction_fk
        FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_group_rounding_rule_fk
        FOREIGN KEY (tenant_id, rounding_rule_id) REFERENCES control.rounding_rule(tenant_id, id),
    ADD CONSTRAINT tax_group_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT tax_group_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_group_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_group_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.tax_group
    ADD CONSTRAINT tax_group_effective_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        code WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.tax_group_component
    ADD CONSTRAINT tax_group_component_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT tax_group_component_group_fk
        FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT tax_group_component_schedule_fk
        FOREIGN KEY (tenant_id, tax_rate_schedule_id) REFERENCES control.tax_rate_schedule(tenant_id, id),
    ADD CONSTRAINT tax_group_component_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.tax_resolution_rule
    ADD CONSTRAINT tax_resolution_rule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT tax_resolution_rule_company_fk
        FOREIGN KEY (tenant_id, scope_company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_billto_fk
        FOREIGN KEY (tenant_id, scope_billto_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_shipto_fk
        FOREIGN KEY (tenant_id, scope_shipto_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_billfrom_fk
        FOREIGN KEY (tenant_id, scope_billfrom_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_shipfrom_fk
        FOREIGN KEY (tenant_id, scope_shipfrom_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_commodity_category_fk
        FOREIGN KEY (tenant_id, scope_commodity_category_id) REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_tax_group_fk
        FOREIGN KEY (tenant_id, resolved_tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_resolution_rule_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.tax_resolution_rule
    ADD CONSTRAINT tax_resolution_rule_effective_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        code WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.wht_threshold_config
    ADD CONSTRAINT wht_threshold_config_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT wht_threshold_config_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT wht_threshold_config_jurisdiction_fk
        FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT wht_threshold_config_tax_type_fk
        FOREIGN KEY (tenant_id, tax_type_id) REFERENCES master.tax_type(tenant_id, id),
    ADD CONSTRAINT wht_threshold_config_currency_fk
        FOREIGN KEY (threshold_currency) REFERENCES shared.currency(code),
    ADD CONSTRAINT wht_threshold_config_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT wht_threshold_config_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT wht_threshold_config_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.wht_threshold_config
    ADD CONSTRAINT wht_threshold_config_effective_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        jurisdiction_id WITH =,
        tax_type_id WITH =,
        COALESCE(section_code, '') WITH =,
        threshold_mode WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));
