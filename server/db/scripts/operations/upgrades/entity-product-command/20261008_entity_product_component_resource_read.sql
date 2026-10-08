BEGIN;
SET LOCAL lock_timeout='5s';
-- Exact installed component evidence for a transaction-admitted product command.
-- No underlying publication/runtime reads or catalogue installation grants.
CREATE FUNCTION entity_command_private.read_component_resource(
 p_target uuid,p_component uuid,p_manifest_hash text,p_release_hash text,p_maximum_bytes integer)
RETURNS TABLE(source_json jsonb,signed_document jsonb,artifact_hash text,payload_hash text,release_hash text,reviewed_source jsonb,deployment_bundle jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE applied uuid; result record;
BEGIN
 IF p_target IS NULL OR p_component IS NULL OR p_manifest_hash IS NULL OR p_release_hash IS NULL
 OR p_manifest_hash !~ '^[a-f0-9]{64}$' OR p_release_hash !~ '^[a-f0-9]{64}$'
 OR p_maximum_bytes IS NULL OR p_maximum_bytes<1 OR p_maximum_bytes>4194304
 OR entity_command_private.admitted(p_target) IS NOT TRUE
 THEN RAISE EXCEPTION 'COMPONENT_RESOURCE_ADMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT h.applied_release_id INTO STRICT applied
 FROM metadata.ui_component_contract c
 JOIN runtime_meta.release_activation_head h ON h.publication_key=c.publication_resource_key
 JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=h.applied_release_id
 WHERE c.id=p_component AND c.tenant_id IS NULL AND c.status='active'
 AND c.manifest_hash=p_manifest_hash AND c.publication_release_hash=p_release_hash
 AND p.payload_hash=p_manifest_hash AND p.payload_json#>>'{declaration,id}'=p_component::text
 AND p.artifact_kind='entity_ui_component' AND p.tenant_id IS NULL
 FOR SHARE OF c,h,p;
 SELECT * INTO STRICT result FROM publication.read_active_ui_component(applied);
 IF result.signed_document IS NULL OR result.reviewed_source IS NULL
 OR result.payload_hash<>p_manifest_hash OR result.release_hash<>p_release_hash
 OR result.source_json#>>'{declaration,id}'<>p_component::text
 OR octet_length(result.signed_document::text)>p_maximum_bytes
 OR octet_length(result.reviewed_source::text)>p_maximum_bytes
 THEN RAISE EXCEPTION 'COMPONENT_RESOURCE_EVIDENCE_MISMATCH' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT result.source_json,result.signed_document,result.artifact_hash,result.payload_hash,
 result.release_hash,result.reviewed_source,result.deployment_bundle;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.read_component_resource(uuid,uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.read_component_resource(uuid,uuid,text,text,integer) TO athyper_product_command_app;
COMMIT;
