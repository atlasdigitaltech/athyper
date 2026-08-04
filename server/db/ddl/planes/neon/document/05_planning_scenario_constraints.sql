ALTER TABLE document.planning_scenario
    ADD CONSTRAINT planning_scenario_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT planning_scenario_model_fk
        FOREIGN KEY (tenant_id, planning_model_id)
        REFERENCES control.planning_model(tenant_id, id),
    ADD CONSTRAINT planning_scenario_based_on_fk
        FOREIGN KEY (tenant_id, planning_model_id, based_on_scenario_id)
        REFERENCES document.planning_scenario(tenant_id, planning_model_id, id),
    ADD CONSTRAINT planning_scenario_approved_by_fk
        FOREIGN KEY (tenant_id, approved_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT planning_scenario_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT planning_scenario_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT planning_scenario_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE document.planning_scenario_line
    ADD CONSTRAINT planning_scenario_line_scenario_fk
        FOREIGN KEY (tenant_id, planning_model_id, planning_scenario_id)
        REFERENCES document.planning_scenario(tenant_id, planning_model_id, id)
        ON DELETE CASCADE,
    ADD CONSTRAINT planning_scenario_line_driver_fk
        FOREIGN KEY (tenant_id, planning_model_id, planning_driver_id)
        REFERENCES control.planning_driver(tenant_id, planning_model_id, id),
    ADD CONSTRAINT planning_scenario_line_gl_fk
        FOREIGN KEY (tenant_id, gl_account_id)
        REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT planning_scenario_line_cost_center_fk
        FOREIGN KEY (tenant_id, cost_center_id)
        REFERENCES master.cost_center(tenant_id, id),
    ADD CONSTRAINT planning_scenario_line_profit_center_fk
        FOREIGN KEY (tenant_id, profit_center_id)
        REFERENCES master.profit_center(tenant_id, id),
    ADD CONSTRAINT planning_scenario_line_project_fk
        FOREIGN KEY (tenant_id, project_id)
        REFERENCES master.project(tenant_id, id),
    ADD CONSTRAINT planning_scenario_line_wbs_fk
        FOREIGN KEY (tenant_id, project_id, project_wbs_id)
        REFERENCES master.project_wbs(tenant_id, project_id, id),
    ADD CONSTRAINT planning_scenario_line_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT planning_scenario_line_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT planning_scenario_line_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id);
