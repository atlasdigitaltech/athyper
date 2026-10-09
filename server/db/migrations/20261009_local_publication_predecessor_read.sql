BEGIN;
-- Read the exact predecessor only after the existing authenticated native-source
-- admission. No generic applied-release rows, payloads or manifests are exposed.
DROP POLICY IF EXISTS applied_release_control_current_head ON runtime_meta.applied_release;
DROP POLICY IF EXISTS release_activation_head_control_entity ON runtime_meta.release_activation_head;
REVOKE SELECT(id,source_release_id,source_release_no,publication_key,artifact_hash,status)
ON runtime_meta.applied_release FROM athyper_control_api;
GRANT SELECT(id,source_release_id,source_release_no,publication_key,artifact_hash,status)
ON runtime_meta.applied_release TO athyper_definer_product_publication;
CREATE FUNCTION publication.read_local_publication_predecessor(p_draft uuid)
RETURNS TABLE(publication_key text,artifact_hash text,applied_release_id uuid,source_release_id uuid,source_release_no bigint,row_version bigint,valid boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE predecessor uuid;
BEGIN
 PERFORM 1 FROM publication.read_native_product_review_source(p_draft,4194304);
 IF NOT FOUND THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_SOURCE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT c.base_release_id INTO STRICT predecessor FROM metadata.entity_change_set c WHERE c.id=p_draft;
 RETURN QUERY SELECT h.publication_key,h.artifact_hash,h.applied_release_id,a.source_release_id,h.source_release_no,h.row_version,
  (a.status='active' AND a.publication_key=h.publication_key AND a.artifact_hash=h.artifact_hash AND a.source_release_no=h.source_release_no)
 FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
 WHERE a.source_release_id=predecessor;
END $$;
ALTER FUNCTION publication.read_local_publication_predecessor(uuid) OWNER TO athyper_definer_product_publication;
REVOKE ALL ON FUNCTION publication.read_local_publication_predecessor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_local_publication_predecessor(uuid) TO athyper_control_api;
COMMIT;
