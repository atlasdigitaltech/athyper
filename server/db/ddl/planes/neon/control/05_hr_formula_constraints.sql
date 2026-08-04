ALTER TABLE control.formula_expression
    ADD CONSTRAINT formula_expression_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE control.formula_expression_version
    ADD CONSTRAINT formula_expression_version_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT formula_expression_version_formula_fk
    FOREIGN KEY (tenant_id, formula_expression_id)
    REFERENCES control.formula_expression (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE control.rate_table
    ADD CONSTRAINT rate_table_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT rate_table_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT rate_table_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE control.rate_table_row
    ADD CONSTRAINT rate_table_row_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT rate_table_row_table_fk
    FOREIGN KEY (tenant_id, rate_table_id)
    REFERENCES control.rate_table (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE control.formula_expression
    ADD CONSTRAINT formula_expression_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT formula_expression_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT formula_expression_status_changed_by_fk
    FOREIGN KEY (status_changed_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE control.formula_expression_version
    ADD CONSTRAINT formula_expression_version_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT formula_expression_version_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT formula_expression_version_published_by_fk
    FOREIGN KEY (published_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE control.rate_table
    ADD CONSTRAINT rate_table_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT rate_table_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT rate_table_status_changed_by_fk
    FOREIGN KEY (status_changed_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE control.rate_table_row
    ADD CONSTRAINT rate_table_row_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT rate_table_row_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
