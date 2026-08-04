CREATE UNIQUE INDEX mfa_credential_projection_primary_uq
    ON runtime_meta.mfa_credential_projection (tenant_id, principal_id, method_type)
    WHERE is_primary AND sync_status <> 'missing';
CREATE INDEX mfa_credential_projection_principal_idx
    ON runtime_meta.mfa_credential_projection (tenant_id, principal_id, is_enabled);
CREATE INDEX mfa_credential_projection_sync_idx
    ON runtime_meta.mfa_credential_projection (sync_status, synchronized_at);
