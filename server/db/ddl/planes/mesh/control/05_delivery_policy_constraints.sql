ALTER TABLE control.delivery_policy
    ADD CONSTRAINT delivery_policy_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT delivery_policy_account_fk FOREIGN KEY (tenant_id, network_account_id) REFERENCES mesh.network_account(tenant_id, id) ON DELETE CASCADE;
