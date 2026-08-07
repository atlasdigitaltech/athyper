ALTER TABLE runtime_meta.mfa_credential_projection
    ADD CONSTRAINT mfa_credential_projection_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT mfa_credential_projection_principal_fk
        FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT mfa_credential_projection_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT mfa_credential_projection_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
