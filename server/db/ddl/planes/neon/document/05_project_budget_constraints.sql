ALTER TABLE document.project_task
    ADD CONSTRAINT project_task_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES master.project (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT project_task_wbs_fk FOREIGN KEY (tenant_id, project_id, project_wbs_id)
    REFERENCES master.project_wbs (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_task_assignee_principal_fk FOREIGN KEY (tenant_id, assignee_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_task_assignee_team_fk FOREIGN KEY (tenant_id, assignee_team_id)
    REFERENCES master.team (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_task_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.project_task_requirement
    ADD CONSTRAINT project_task_requirement_task_fk
    FOREIGN KEY (tenant_id, project_id, project_task_id)
    REFERENCES document.project_task (tenant_id, project_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT project_task_requirement_item_fk
    FOREIGN KEY (tenant_id, project_id, project_item_id)
    REFERENCES master.project_item (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT project_task_requirement_uom_fk FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT,
    ADD CONSTRAINT project_task_requirement_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.budget_profile
    ADD CONSTRAINT budget_profile_project_fk FOREIGN KEY (tenant_id, company_code_id, project_id)
    REFERENCES master.project (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_profile_book_fk FOREIGN KEY (tenant_id, ledger_book_id)
    REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_profile_currency_fk FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_profile_supersedes_fk FOREIGN KEY (tenant_id, project_id, supersedes_profile_id)
    REFERENCES document.budget_profile (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_profile_approved_by_fk FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_profile_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.budget_allocation
    ADD CONSTRAINT budget_allocation_profile_fk
    FOREIGN KEY (tenant_id, project_id, budget_profile_id)
    REFERENCES document.budget_profile (tenant_id, project_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT budget_allocation_wbs_fk
    FOREIGN KEY (tenant_id, project_id, project_wbs_id)
    REFERENCES master.project_wbs (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_allocation_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
