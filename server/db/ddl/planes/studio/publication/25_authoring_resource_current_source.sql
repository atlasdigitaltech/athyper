-- Canonical saved graph at the exact current product draft revision, no table grants.
CREATE FUNCTION publication.read_authoring_resource_current_source(p_draft uuid,p_entity uuid)
RETURNS TABLE(graph jsonb,"graphHash" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM master.principal p JOIN master.principal_identity_binding b ON b.principal_id=p.id AND b.tenant_id=p.tenant_id WHERE p.id=master.current_principal_id_soft() AND p.tenant_id=shared.current_tenant_id_soft() AND p.status='active' AND p.principal_type='user' AND b.status='active' AND b.realm_key='platform-control' AND b.service_client_id IS NULL) THEN RAISE EXCEPTION 'RESOURCE_SOURCE_SCOPE_DENIED'; END IF;
 RETURN QUERY SELECT s.graph,s.graph_hash FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id JOIN snapshot.entity_draft_save s ON s.change_set_id=c.id AND s.tenant_id IS NULL AND s.lock_version=c.lock_version WHERE c.id=p_draft AND c.entity_id=p_entity AND c.tenant_id IS NULL AND e.tenant_id IS NULL AND e.ownership_model='system';
END $$;
REVOKE ALL ON FUNCTION publication.read_authoring_resource_current_source(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_authoring_resource_current_source(uuid,uuid) TO athyper_control_api;
