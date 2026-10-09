-- Existing signed and acknowledged product targets for local rollback. No new
-- ledger, artifact mutation, credential or automatic approval is introduced.
CREATE FUNCTION publication.read_local_rollback_targets(p_draft uuid)
RETURNS TABLE(publication_key text,target_plane text,artifact_hash text,applied_release_id uuid,source_release_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c metadata.entity_change_set; checked jsonb; request_hash text;
BEGIN
 SELECT * INTO STRICT c FROM metadata.entity_change_set WHERE id=p_draft AND tenant_id IS NULL
 AND source_kind='product' AND native_core_layout_version=2 AND status='published';
 request_hash:=nullif(current_setting('app.local_publication_request_hash',true),'');
 IF request_hash IS NOT NULL THEN
  checked:=publication.read_local_publication_request(request_hash);
  IF checked#>>'{request,admission,action}' IS DISTINCT FROM 'rollback'
   OR checked#>>'{changeSet,id}' IS DISTINCT FROM p_draft::text
  THEN RAISE EXCEPTION 'LOCAL_ROLLBACK_ADMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 ELSE
  IF c.created_by IS DISTINCT FROM master.current_principal_id_soft()
   OR NOT EXISTS(SELECT 1 FROM publication.read_native_product_review_source(p_draft,4194304))
  THEN RAISE EXCEPTION 'LOCAL_ROLLBACK_ADMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN QUERY SELECT DISTINCT r.release_key::text,d.target_plane::text,a.content_hash::text,
  ack.local_applied_release_id,r.id
 FROM metadata.entity_release er
 JOIN publication.release r ON r.id=er.id AND r.tenant_id=shared.current_tenant_id_soft()
 JOIN publication.artifact a ON a.publication_release_id=r.id AND a.status='signed' AND a.artifact_kind='compiled_entity_runtime'
 JOIN publication.deployment d ON d.artifact_id=a.id
 JOIN publication.deployment_acknowledgement ack ON ack.deployment_id=d.id AND ack.active_release_hash=a.content_hash
 WHERE er.change_set_id=p_draft AND er.entity_id=c.entity_id AND er.tenant_id IS NULL
 AND r.status='published' AND a.signature IS NOT NULL AND a.signed_at IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION publication.read_local_rollback_targets(uuid) FROM PUBLIC;
ALTER FUNCTION publication.read_local_rollback_targets(uuid) OWNER TO athyper_definer_product_publication;
GRANT EXECUTE ON FUNCTION publication.read_local_rollback_targets(uuid) TO athyper_control_api,athyper_worker;
