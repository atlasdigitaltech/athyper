ALTER TABLE control.payment_execution_profile
    ADD CONSTRAINT payment_execution_profile_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT payment_execution_profile_connector_fk
        FOREIGN KEY (tenant_id, connector_instance_id)
        REFERENCES control.connector_instance(tenant_id, id),
    ADD CONSTRAINT payment_execution_profile_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_execution_profile_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT payment_execution_profile_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);
