-- Native local source entity/reference visibility under checked request scope.
BEGIN;
-- Relation-target identity checks for native activation under the worker role.
-- Current exact human execution context supplies the source; no entity allowlist.
CREATE OR REPLACE FUNCTION publication.native_worker_entity_visible(p_entity uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE release_id uuid; context jsonb; source jsonb;
BEGIN
 IF p_entity IS NULL OR shared.current_tenant_id_soft() IS NULL OR master.current_principal_id_soft() IS NULL THEN RETURN false; END IF;
 IF NULLIF(current_setting('app.local_publication_request_hash',true),'') IS NOT NULL THEN
   context:=publication.read_local_publication_request(current_setting('app.local_publication_request_hash',true));
   source:=context->'graph';
   RETURN source#>>'{authoringSource,entityId}'=p_entity::text
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(source->'relationTargets','[]'::jsonb)) t
       WHERE t->>'targetEntityId'=p_entity::text);
 END IF;
 FOR release_id IN SELECT r.id FROM publication.release r
   WHERE r.tenant_id=shared.current_tenant_id_soft() AND r.created_by=master.current_principal_id_soft()
     AND r.status IN ('approved','published') AND r.metadata ? 'humanExecutionPolicy'
     AND r.metadata->>'schema'='athyper.native-entity-publication/1'
 LOOP
   context:=publication.fn_human_execution_context(release_id);
   FOR source IN SELECT s->'graph' FROM jsonb_array_elements(context->'sources') s LOOP
     IF source->>'contractSchema'='athyper.meta-entity-contract/2.5' AND (
       source#>>'{authoringSource,entityId}'=p_entity::text
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(source->'relationTargets','[]'::jsonb)) t WHERE t->>'targetEntityId'=p_entity::text)) THEN RETURN true; END IF;
   END LOOP;
 END LOOP;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION publication.native_worker_entity_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.native_worker_entity_visible(uuid) TO athyper_worker;
ALTER FUNCTION publication.native_worker_entity_visible(uuid) OWNER TO athyper_definer_product_publication;

COMMIT;
