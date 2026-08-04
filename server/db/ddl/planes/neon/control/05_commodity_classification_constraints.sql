ALTER TABLE control.commodity_code_classification_policy
    ADD CONSTRAINT commodity_code_classification_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT commodity_code_classification_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commodity_code_classification_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT commodity_code_classification_policy_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);
