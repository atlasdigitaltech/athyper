ALTER TABLE master.atlas_support_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.atlas_support_session FORCE ROW LEVEL SECURITY;
ALTER TABLE master.atlas_support_session_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.atlas_support_session_audit FORCE ROW LEVEL SECURITY;

-- Only the authenticated origin Admin principal may operate its sessions.
DROP POLICY IF EXISTS atlas_support_origin_session ON master.atlas_support_session;
CREATE POLICY atlas_support_origin_session ON master.atlas_support_session
  FOR ALL TO athyperapp
  USING (
    origin_tenant_id = shared.current_tenant_id()
    AND origin_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    AND nullif(current_setting('app.current_atlas_plane', true), '') = 'admin'
  )
  WITH CHECK (
    origin_tenant_id = shared.current_tenant_id()
    AND origin_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    AND plane = 'admin'
    AND nullif(current_setting('app.current_atlas_plane', true), '') = 'admin'
  );

DROP POLICY IF EXISTS atlas_support_origin_audit ON master.atlas_support_session_audit;
CREATE POLICY atlas_support_origin_audit ON master.atlas_support_session_audit
  FOR INSERT TO athyperapp
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM master.atlas_support_session s
      WHERE s.id = session_id
        AND s.origin_tenant_id = shared.current_tenant_id()
        AND s.origin_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
        AND nullif(current_setting('app.current_atlas_plane', true), '') = 'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE ON master.atlas_support_session TO athyperapp;
GRANT INSERT ON master.atlas_support_session_audit TO athyperapp;
