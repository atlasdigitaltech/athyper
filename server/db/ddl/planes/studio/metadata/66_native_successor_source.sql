-- Read-only exact predecessor composition for the admitted successor command.
-- No general cross-draft SELECT, mutation or new protected-state initialization.
CREATE FUNCTION entity_command_private.read_native_successor_source(p_target uuid,p_entity uuid,p_release uuid,p_maximum_bytes integer)
RETURNS TABLE(source_change_set_id uuid,source_revision bigint,graph jsonb,graph_hash text,operation_rows jsonb,identity_rows jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c metadata.entity_change_set; saved snapshot.entity_draft_save; ops jsonb; ids jsonb;
BEGIN
 IF p_maximum_bytes IS NULL OR p_maximum_bytes<1 OR p_maximum_bytes>4194304
 OR NOT entity_command_private.admitted_creation(p_target,p_entity)
 THEN RAISE EXCEPTION 'NATIVE_SUCCESSOR_ADMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT cs.* INTO c FROM metadata.entity_release r JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id
 JOIN metadata.entity e ON e.id=cs.entity_id
 JOIN snapshot.entity_contract_revision v ON v.id=r.revision_id
 WHERE r.id=p_release AND r.entity_id=p_entity AND r.tenant_id IS NULL
 AND cs.id<>p_target AND cs.entity_id=p_entity AND cs.tenant_id IS NULL AND cs.source_kind='product'
 AND cs.native_core_layout_version=2 AND cs.status='published' AND e.tenant_id IS NULL AND e.ownership_model='system'
 AND v.change_set_id=cs.id AND v.entity_id=p_entity AND v.tenant_id IS NULL AND v.validation_status='valid'
 AND v.contract_hash=r.contract_hash AND v.revision_hash=r.revision_hash FOR SHARE OF r,cs,e,v;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_SUCCESSOR_SOURCE_UNAVAILABLE'; END IF;
 SELECT s.* INTO STRICT saved FROM snapshot.entity_draft_save s JOIN metadata.entity_release r ON r.id=p_release
 JOIN snapshot.entity_contract_revision v ON v.id=r.revision_id
 WHERE s.change_set_id=c.id AND s.tenant_id IS NULL AND s.lock_version=c.lock_version AND s.graph=v.contract_json FOR SHARE OF s;
 PERFORM 1 FROM metadata.entity_operation o WHERE o.change_set_id=c.id FOR SHARE;
 PERFORM 1 FROM metadata.entity_field_identity i WHERE i.entity_id=p_entity AND i.tenant_id IS NULL FOR SHARE;
 SELECT coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('export_max_records',o.export_max_records::text) ORDER BY o.id),'[]') INTO ops
 FROM metadata.entity_operation o WHERE o.change_set_id=c.id AND o.entity_id=p_entity AND o.tenant_id IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('native_available',metadata.native_identity_available(c.id,i.id)) ORDER BY i.id),'[]') INTO ids
 FROM metadata.entity_field_identity i WHERE i.entity_id=p_entity AND i.tenant_id IS NULL
 AND EXISTS(SELECT 1 FROM metadata.entity_field f WHERE f.change_set_id=c.id AND f.field_identity_id=i.id);
 IF octet_length(saved.graph::text)+octet_length(ops::text)+octet_length(ids::text)>p_maximum_bytes
 THEN RAISE EXCEPTION 'NATIVE_SUCCESSOR_SOURCE_TOO_LARGE'; END IF;
 RETURN QUERY SELECT c.id,c.lock_version::bigint,saved.graph,saved.graph_hash,ops,ids;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.read_native_successor_source(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.read_native_successor_source(uuid,uuid,uuid,integer) TO athyper_product_command_app;
DO $$ DECLARE command_owner name; BEGIN
 SELECT r.rolname INTO STRICT command_owner FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
 WHERE p.oid='entity_command_private.read_operation_bootstrap_source(uuid,text,uuid)'::regprocedure
 AND p.prosecdef AND 'search_path=pg_catalog'=ANY(p.proconfig);
 EXECUTE format('ALTER FUNCTION entity_command_private.read_native_successor_source(uuid,uuid,uuid,integer) OWNER TO %I',command_owner);
END $$;
