ALTER TABLE control.planning_model
    ADD CONSTRAINT planning_model_company_fk FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_model_book_fk FOREIGN KEY (tenant_id, ledger_book_id)
    REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_model_currency_fk FOREIGN KEY (base_currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_model_based_on_fk FOREIGN KEY (tenant_id, based_on_model_id)
    REFERENCES control.planning_model (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_model_responsible_fk FOREIGN KEY (tenant_id, responsible_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_model_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.planning_driver
    ADD CONSTRAINT planning_driver_model_fk FOREIGN KEY (tenant_id, planning_model_id)
    REFERENCES control.planning_model (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT planning_driver_uom_fk FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_driver_formula_fk FOREIGN KEY (tenant_id, formula_expression_id)
    REFERENCES control.formula_expression (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_driver_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.planning_driver_dependency
    ADD CONSTRAINT planning_dependency_model_fk FOREIGN KEY (tenant_id, planning_model_id)
    REFERENCES control.planning_model (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT planning_dependency_driver_fk
    FOREIGN KEY (tenant_id, planning_model_id, planning_driver_id)
    REFERENCES control.planning_driver (tenant_id, planning_model_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT planning_dependency_depends_on_fk
    FOREIGN KEY (tenant_id, planning_model_id, depends_on_driver_id)
    REFERENCES control.planning_driver (tenant_id, planning_model_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT planning_dependency_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
