ALTER TABLE document.pricing_component
    ADD CONSTRAINT pricing_component_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT pricing_component_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT pricing_component_condition_type_fk
        FOREIGN KEY (tenant_id, condition_type_id) REFERENCES master.condition_type(tenant_id, id),
    ADD CONSTRAINT pricing_component_tax_group_fk
        FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT pricing_component_apportioned_from_fk
        FOREIGN KEY (tenant_id, is_apportioned_from_id) REFERENCES document.pricing_component(tenant_id, id),
    ADD CONSTRAINT pricing_component_superseded_by_fk
        FOREIGN KEY (tenant_id, superseded_by_id) REFERENCES document.pricing_component(tenant_id, id),
    ADD CONSTRAINT pricing_component_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT pricing_component_base_currency_fk
        FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT pricing_component_superseded_by_user_fk
        FOREIGN KEY (tenant_id, superseded_by_user) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT pricing_component_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT pricing_component_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.schedule_line
    ADD CONSTRAINT schedule_line_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT schedule_line_previous_fk
        FOREIGN KEY (tenant_id, previous_version_id) REFERENCES document.schedule_line(tenant_id, id),
    ADD CONSTRAINT schedule_line_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT schedule_line_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT schedule_line_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);
