ALTER TABLE control.atlas_tenant_provider_credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.atlas_tenant_provider_credential FORCE ROW LEVEL SECURITY;
ALTER TABLE control.atlas_tenant_provider_credential_epoch ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.atlas_tenant_provider_credential_epoch FORCE ROW LEVEL SECURITY;
ALTER TABLE log.atlas_byok_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.atlas_byok_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_byok_tenant_scope ON control.atlas_tenant_provider_credential;
CREATE POLICY atlas_byok_tenant_scope ON control.atlas_tenant_provider_credential
  FOR ALL TO athyperapp
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

DROP POLICY IF EXISTS atlas_byok_epoch_tenant_scope ON control.atlas_tenant_provider_credential_epoch;
CREATE POLICY atlas_byok_epoch_tenant_scope ON control.atlas_tenant_provider_credential_epoch
  FOR ALL TO athyperapp
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

DROP POLICY IF EXISTS atlas_byok_audit_insert ON log.atlas_byok_audit;
CREATE POLICY atlas_byok_audit_insert ON log.atlas_byok_audit
  FOR INSERT TO athyperapp
  WITH CHECK (tenant_id = shared.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON control.atlas_tenant_provider_credential TO athyperapp;
GRANT SELECT, INSERT, UPDATE ON control.atlas_tenant_provider_credential_epoch TO athyperapp;
GRANT INSERT ON log.atlas_byok_audit TO athyperapp;
