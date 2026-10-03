-- Narrow worker read prerequisite for independently approved coordinated publications.
BEGIN;
DO $$ BEGIN IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio required'; END IF; END $$;
-- Coordinated activation resolves signed siblings through their native release
-- identities. Expose coordinates only, for the current tenant and publisher.
GRANT USAGE ON SCHEMA metadata TO athyper_worker;
GRANT EXECUTE ON FUNCTION master.current_principal_id_soft() TO athyper_worker;
GRANT SELECT(id,entity_id,change_set_id,tenant_id) ON metadata.entity_release TO athyper_worker;
DROP POLICY IF EXISTS coordinated_worker_source_read ON metadata.entity_release;
CREATE POLICY coordinated_worker_source_read ON metadata.entity_release FOR SELECT TO athyper_worker
USING(tenant_id IS NULL AND EXISTS(
 SELECT 1 FROM publication.entity_release_link l JOIN publication.release p ON p.id=l.publication_release_id
 WHERE l.entity_release_id=entity_release.id AND p.tenant_id=shared.current_tenant_id_soft()
   AND p.created_by=master.current_principal_id_soft() AND p.status IN ('approved','published')
   AND p.metadata ? 'humanExecutionPolicy'
   AND p.metadata#>'{humanExecutionPolicy,plan,members}' @> jsonb_build_array(jsonb_build_object(
     'changeSetId',entity_release.change_set_id,'entityId',entity_release.entity_id))
));

COMMIT;
