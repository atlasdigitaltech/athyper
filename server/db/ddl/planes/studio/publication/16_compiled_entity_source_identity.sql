-- Add source identity without changing the v1 SQL return contract or any signed
-- historical artifact. The v1 function remains the approval/tenant read gate.
CREATE OR REPLACE FUNCTION publication.fn_compiled_entity_compilation_source_v2(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid, release_key text, release_no bigint,
 source_tenant_id uuid, revision_id uuid, published_by uuid, entity_code text,
 contract_json jsonb, compiled_json jsonb, plane_key text, created_at timestamptz,
 target_planes text[], source_entity_id uuid, source_release_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.*,r.entity_id,r.release_hash
 FROM publication.fn_compiled_entity_compilation_source(p_release_id) s
 JOIN publication.entity_release_link l ON l.publication_release_id=s.publication_release_id
 JOIN metadata.entity_release r ON r.id=l.entity_release_id AND r.revision_id=s.revision_id
   AND r.tenant_id IS NOT DISTINCT FROM s.source_tenant_id;
$$;
REVOKE ALL ON FUNCTION publication.fn_compiled_entity_compilation_source_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_compiled_entity_compilation_source_v2(uuid) TO athyper_publication_service;
