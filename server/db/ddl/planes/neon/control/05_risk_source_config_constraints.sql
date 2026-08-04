ALTER TABLE control.risk_source_config
    ADD CONSTRAINT risk_source_config_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT risk_source_config_source_fk
        FOREIGN KEY (source_code) REFERENCES master.risk_source(code) ON DELETE RESTRICT,
    ADD CONSTRAINT risk_source_config_connector_fk
        FOREIGN KEY (tenant_id, connector_instance_id)
        REFERENCES control.connector_instance(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT risk_source_config_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT risk_source_config_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT risk_source_config_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
