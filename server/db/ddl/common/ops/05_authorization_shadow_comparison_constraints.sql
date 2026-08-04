ALTER TABLE ops.authorization_shadow_comparison
    ADD CONSTRAINT authorization_shadow_comparison_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT authorization_shadow_comparison_principal_fk
        FOREIGN KEY (tenant_id,principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

