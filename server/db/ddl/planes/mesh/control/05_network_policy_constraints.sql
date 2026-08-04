ALTER TABLE control.routing_rule
    ADD CONSTRAINT routing_rule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT routing_rule_account_fk
        FOREIGN KEY (tenant_id, network_account_id) REFERENCES mesh.network_account(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT routing_rule_sender_account_fk
        FOREIGN KEY (tenant_id, sender_network_account_id) REFERENCES mesh.network_account(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT routing_rule_receiver_account_fk
        FOREIGN KEY (tenant_id, receiver_network_account_id) REFERENCES mesh.network_account(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT routing_rule_document_type_fk
        FOREIGN KEY (document_type_code) REFERENCES control.network_document_type(code) ON DELETE RESTRICT,
    ADD CONSTRAINT routing_rule_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT routing_rule_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT routing_rule_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.retention_policy
    ADD CONSTRAINT retention_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT retention_policy_account_fk
        FOREIGN KEY (tenant_id, network_account_id) REFERENCES mesh.network_account(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT retention_policy_supersedes_fk
        FOREIGN KEY (supersedes_policy_id) REFERENCES control.retention_policy(id) ON DELETE RESTRICT,
    ADD CONSTRAINT retention_policy_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT retention_policy_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT retention_policy_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.quota_policy
    ADD CONSTRAINT quota_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT quota_policy_account_fk
        FOREIGN KEY (tenant_id, network_account_id) REFERENCES mesh.network_account(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT quota_policy_metric_fk
        FOREIGN KEY (usage_metric_code) REFERENCES control.usage_metric_catalog(code) ON DELETE RESTRICT,
    ADD CONSTRAINT quota_policy_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT quota_policy_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT quota_policy_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
