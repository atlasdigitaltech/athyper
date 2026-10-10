CREATE OR REPLACE FUNCTION publication.read_local_successor_predecessor(p_entity uuid)
RETURNS TABLE(authoring_release_id uuid,authoring_release_no bigint,authoring_release_hash text,publication_release_id uuid,publication_release_no bigint,publication_release_hash text,contract_hash text,revision_id uuid,publication_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT er.id,er.release_no,er.release_hash,pr.id,pr.release_no,pr.release_hash,er.contract_hash,er.revision_id,pr.release_key
 FROM metadata.entity_release er
 JOIN metadata.entity e ON e.id=er.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
 JOIN metadata.entity_change_set c ON c.id=er.change_set_id AND c.status='published'
 JOIN publication.entity_release_link l ON l.entity_release_id=er.id
 JOIN publication.release pr ON pr.id=l.publication_release_id AND pr.tenant_id=shared.current_tenant_id_soft()
 JOIN master.principal actor ON actor.id=master.current_principal_id_soft() AND actor.tenant_id=pr.tenant_id AND actor.principal_type='user' AND actor.status='active'
 WHERE er.entity_id=p_entity AND er.tenant_id IS NULL AND pr.status IN ('approved','published')
 ORDER BY er.release_no DESC,pr.release_no DESC LIMIT 1;
$$;
ALTER FUNCTION publication.read_local_successor_predecessor(uuid) OWNER TO athyper_definer_product_publication;
REVOKE ALL ON FUNCTION publication.read_local_successor_predecessor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_local_successor_predecessor(uuid) TO athyper_control_api;
