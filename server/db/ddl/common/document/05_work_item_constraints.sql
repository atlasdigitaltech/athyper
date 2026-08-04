ALTER TABLE document.work_item
    ADD CONSTRAINT work_item_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT work_item_cycle_task_fk
        FOREIGN KEY (tenant_id, cycle_task_id) REFERENCES governance.cycle_task(tenant_id, id),
    ADD CONSTRAINT work_item_assignee_fk
        FOREIGN KEY (tenant_id, assignee_principal_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT work_item_team_fk
        FOREIGN KEY (tenant_id, assignee_team_id) REFERENCES master.team(tenant_id, id),
    ADD CONSTRAINT work_item_claimant_fk
        FOREIGN KEY (tenant_id, claimant_principal_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT work_item_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT work_item_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT work_item_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);
