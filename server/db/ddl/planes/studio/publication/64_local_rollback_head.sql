-- A rollback selects the current head, not the selected draft's original base.
CREATE FUNCTION publication.read_local_rollback_head(p_draft uuid)
RETURNS TABLE(publication_key text,artifact_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN QUERY SELECT h.publication_key,h.artifact_hash
 FROM runtime_meta.release_activation_head h
 WHERE h.publication_key IN (SELECT t.publication_key FROM publication.read_local_rollback_targets(p_draft) t);
END $$;
REVOKE ALL ON FUNCTION publication.read_local_rollback_head(uuid) FROM PUBLIC;
ALTER FUNCTION publication.read_local_rollback_head(uuid) OWNER TO athyper_definer_product_publication;
GRANT EXECUTE ON FUNCTION publication.read_local_rollback_head(uuid) TO athyper_control_api;
