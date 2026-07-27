CREATE UNIQUE INDEX IF NOT EXISTS atlas_tenant_provider_credential_active_uq
  ON control.atlas_tenant_provider_credential(tenant_id, provider_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS atlas_tenant_provider_credential_rotation_idx
  ON control.atlas_tenant_provider_credential(tenant_id, key_version, status);
CREATE INDEX IF NOT EXISTS atlas_byok_audit_scope_idx
  ON log.atlas_byok_audit(tenant_id, provider_id, occurred_at DESC);
