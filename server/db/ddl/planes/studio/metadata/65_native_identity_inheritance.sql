-- Published native predecessor inheritance is distinct from legacy draft adoption.
-- Reuse immutable correspondence evidence; never rewrite introduction or lifecycle.
CREATE FUNCTION entity_command_private.inherit_native_identity(
 p_target uuid,p_identity uuid,p_target_field uuid,p_release uuid,p_source uuid,
 p_source_field uuid,p_revision bigint,p_source_hash text,p_proposal_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entity uuid; source_graph jsonb; existing metadata.entity_field_identity_adoption%ROWTYPE;
BEGIN
 SELECT entity_id INTO STRICT entity FROM metadata.entity_change_set WHERE id=p_target;
 IF NOT entity_command_private.native_bootstrap_writable(p_target,entity)
 THEN RAISE EXCEPTION 'IDENTITY_INHERITANCE_ADMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_source=p_target OR p_target_field=p_source_field
 OR p_source_hash IS NULL OR p_source_hash !~ '^[a-f0-9]{64}$'
 OR p_proposal_hash IS NULL OR p_proposal_hash !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'IDENTITY_INHERITANCE_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
 -- The draft's explicit base, sealed source, immutable saved graph and actual
 -- predecessor field must all identify the same entity and stable identity.
 SELECT s.graph INTO source_graph
 FROM metadata.entity_change_set t
 JOIN metadata.entity_release r ON r.id=t.base_release_id
 JOIN metadata.entity_change_set c ON c.id=r.change_set_id
 JOIN snapshot.entity_contract_revision v ON v.id=r.revision_id
 JOIN snapshot.entity_draft_save s ON s.change_set_id=c.id AND s.lock_version=p_revision
 JOIN metadata.entity_field f ON f.change_set_id=c.id AND f.id=p_source_field
 JOIN metadata.entity_field_identity i ON i.id=f.field_identity_id
 WHERE t.id=p_target AND t.entity_id=entity AND t.tenant_id IS NULL AND t.source_kind='product'
 AND r.id=p_release AND r.entity_id=entity AND r.tenant_id IS NULL
 AND c.id=p_source AND c.entity_id=entity AND c.tenant_id IS NULL
 AND c.status='published' AND c.source_kind='product' AND c.native_core_layout_version=2
 AND v.change_set_id=c.id AND v.entity_id=entity AND v.tenant_id IS NULL
 AND v.validation_status='valid' AND v.contract_hash=r.contract_hash AND v.revision_hash=r.revision_hash
 AND s.tenant_id IS NULL AND s.graph_hash=p_source_hash AND s.graph=v.contract_json
 AND f.entity_id=entity AND f.tenant_id IS NULL
 AND i.id=p_identity AND i.entity_id=entity AND i.tenant_id IS NULL AND i.identity_status='reserved'
 AND metadata.native_identity_available(c.id,i.id)
 FOR SHARE OF t,r,c,v,s,f,i;
 IF NOT FOUND OR NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements(source_graph->'fields') f
 WHERE f->>'id'=p_source_field::text AND f->>'fieldIdentityId'=p_identity::text)
 THEN RAISE EXCEPTION 'IDENTITY_INHERITANCE_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
 INSERT INTO metadata.entity_field_identity_adoption(change_set_id,field_identity_id,target_field_id,source_change_set_id,source_field_id,source_revision,source_hash,proposal_hash,created_by)
 VALUES(p_target,p_identity,p_target_field,p_source,p_source_field,p_revision,p_source_hash,p_proposal_hash,current_setting('app.current_principal_id',true)::uuid)
 ON CONFLICT(change_set_id,field_identity_id) DO NOTHING;
 SELECT * INTO STRICT existing FROM metadata.entity_field_identity_adoption WHERE change_set_id=p_target AND field_identity_id=p_identity;
 IF ROW(existing.target_field_id,existing.source_change_set_id,existing.source_field_id,existing.source_revision,existing.source_hash,existing.proposal_hash,existing.created_by)
 IS DISTINCT FROM ROW(p_target_field,p_source,p_source_field,p_revision,p_source_hash,p_proposal_hash,current_setting('app.current_principal_id',true)::uuid)
 THEN RAISE EXCEPTION 'IDENTITY_INHERITANCE_CONFLICT' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.inherit_native_identity(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.inherit_native_identity(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text) TO athyper_product_command_app;
-- Preserve the installed identity-command ownership boundary, not the migration
-- login's incidental ownership. This routine adds no table privileges or roles.
DO $$ DECLARE command_owner name; BEGIN
 SELECT r.rolname INTO STRICT command_owner FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
 WHERE p.oid='entity_command_private.adopt_native_identity(uuid,uuid,uuid,uuid,uuid,bigint,text,text)'::regprocedure
 AND p.prosecdef AND 'search_path=pg_catalog'=ANY(p.proconfig);
 EXECUTE format('ALTER FUNCTION entity_command_private.inherit_native_identity(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text) OWNER TO %I',command_owner);
END $$;
