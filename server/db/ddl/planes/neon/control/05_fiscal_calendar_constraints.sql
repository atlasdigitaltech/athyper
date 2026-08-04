ALTER TABLE control.fiscal_calendar_config
    ADD CONSTRAINT fiscal_calendar_config_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT fiscal_calendar_config_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_id)
        REFERENCES control.fiscal_calendar_config(tenant_id, id),
    ADD CONSTRAINT fiscal_calendar_config_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT fiscal_calendar_config_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT fiscal_calendar_config_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.fiscal_calendar_period_rule
    ADD CONSTRAINT fiscal_calendar_period_rule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT fiscal_calendar_period_rule_config_fk
        FOREIGN KEY (tenant_id, fiscal_calendar_config_id)
        REFERENCES control.fiscal_calendar_config(tenant_id, id)
        ON DELETE CASCADE,
    ADD CONSTRAINT fiscal_calendar_period_rule_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.company_fiscal_calendar_assignment
    ADD CONSTRAINT company_fiscal_calendar_assignment_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_config_fk
        FOREIGN KEY (tenant_id, fiscal_calendar_config_id)
        REFERENCES control.fiscal_calendar_config(tenant_id, id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT company_fiscal_calendar_assignment_active_year_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        int4range(
            effective_fiscal_year_from::integer,
            COALESCE(effective_fiscal_year_to::integer + 1, 10000),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active');

ALTER TABLE master.fiscal_period
    ADD CONSTRAINT fiscal_period_calendar_config_fk
        FOREIGN KEY (tenant_id, fiscal_calendar_config_id)
        REFERENCES control.fiscal_calendar_config(tenant_id, id);
