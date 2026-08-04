ALTER TABLE master.project
    ADD CONSTRAINT project_company_fk FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_responsible_fk FOREIGN KEY (tenant_id, responsible_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_cost_center_fk FOREIGN KEY (tenant_id, default_cost_center_id)
    REFERENCES master.cost_center (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_currency_fk FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT project_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.project_wbs
    ADD CONSTRAINT project_wbs_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES master.project (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT project_wbs_parent_fk FOREIGN KEY (tenant_id, project_id, parent_wbs_id)
    REFERENCES master.project_wbs (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_wbs_responsible_fk FOREIGN KEY (tenant_id, responsible_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_wbs_cost_center_fk FOREIGN KEY (tenant_id, default_cost_center_id)
    REFERENCES master.cost_center (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_wbs_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.project_item
    ADD CONSTRAINT project_item_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES master.project (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT project_item_wbs_fk FOREIGN KEY (tenant_id, project_id, project_wbs_id)
    REFERENCES master.project_wbs (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_item_item_fk FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_item_uom_fk FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT,
    ADD CONSTRAINT project_item_currency_fk FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT project_item_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
