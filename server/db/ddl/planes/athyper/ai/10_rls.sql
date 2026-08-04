-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

ALTER TABLE "ai"."atlas_support_session" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_support_session" FORCE ROW LEVEL SECURITY;

CREATE POLICY "atlas_support_origin_session" ON "ai"."atlas_support_session"
  AS PERMISSIVE
  FOR ALL
  TO athyperapp
  USING (origin_tenant_id = shared.current_tenant_id() AND origin_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) = 'admin'::text)
  WITH CHECK (origin_tenant_id = shared.current_tenant_id() AND origin_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND plane = 'admin'::text AND NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) = 'admin'::text);

CREATE POLICY "atlas_support_origin_audit" ON "audit"."audit_log"
  AS PERMISSIVE
  FOR INSERT
  TO athyperapp
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ai.atlas_support_session s
  WHERE event_code LIKE 'ai.support.%'
    AND entity_type = 'ai.support_session'
    AND s.id = entity_id
    AND s.target_tenant_id = tenant_id
    AND s.origin_principal_id = actor_principal_id
    AND s.origin_tenant_id = shared.current_tenant_id()
    AND s.origin_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid
    AND NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) = 'admin'::text)));
