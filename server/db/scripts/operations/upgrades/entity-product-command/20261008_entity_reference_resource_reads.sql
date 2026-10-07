BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE ownership_original_rows(schema_name text,table_name text,row_hash text) ON COMMIT DROP;
DO $$ DECLARE r record; h text; BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'STUDIO_REQUIRED'; END IF;
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('metadata','snapshot') AND c.relkind='r' ORDER BY n.nspname,c.relname LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.nspname,r.relname) INTO h;
  INSERT INTO ownership_original_rows VALUES(r.nspname,r.relname,h);
 END LOOP;
END $$;
-- Product-command reads expose only installed resource kinds during a live
-- transaction-bound admission. No underlying publication/runtime table grants.
CREATE FUNCTION entity_command_private.read_reference_resource(
 p_release_id uuid,p_key text,p_unsigned_hash text,p_artifact_hash text,p_kind text,p_maximum_bytes integer)
RETURNS TABLE(document jsonb,release_no bigint,unsigned_hash text,signature text,algorithm text,key_id text,author_id uuid,reviewer_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_kind NOT IN ('entity_authoring_descriptor','entity_identity_review') OR p_maximum_bytes IS NULL OR p_maximum_bytes<1 OR p_maximum_bytes>4194304 THEN RAISE EXCEPTION 'REFERENCE_RESOURCE_REQUEST_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM entity_command_private.admission a WHERE entity_command_private.admitted(a.change_set_id)) THEN RAISE EXCEPTION 'REFERENCE_RESOURCE_ADMISSION_REQUIRED'; END IF;
 RETURN QUERY SELECT c.unsigned_document,r.release_no,c.unsigned_hash,a.signature,a.signature_algorithm,a.signing_key_id,r.created_by,r.approved_by
 FROM publication.release r JOIN publication.artifact a ON a.publication_release_id=r.id AND a.plane_code='studio'
 JOIN publication.artifact_compilation c ON c.publication_release_id=r.id AND c.plane_code=a.plane_code AND c.artifact_kind=a.artifact_kind
 JOIN runtime_meta.applied_release installed ON installed.source_release_id=r.id AND installed.publication_key=r.release_key AND installed.artifact_hash=a.content_hash
 JOIN runtime_meta.release_activation_head h ON h.applied_release_id=installed.id AND h.publication_key=installed.publication_key AND h.artifact_hash=installed.artifact_hash AND h.source_release_no=installed.source_release_no
 WHERE r.id=p_release_id AND r.tenant_id::text=current_setting('app.current_tenant_id',true) AND r.release_key=p_key
 AND r.status='published' AND r.approved_at IS NOT NULL AND r.approved_by IS NOT NULL AND r.created_by<>r.approved_by
 AND a.artifact_kind=p_kind AND a.content_hash=p_artifact_hash AND a.status='signed' AND a.validated_at IS NOT NULL
 AND c.unsigned_hash=p_unsigned_hash AND octet_length(c.unsigned_document::text)<=p_maximum_bytes
 AND installed.status='active' AND installed.verified_at IS NOT NULL AND installed.source_release_no=r.release_no
 AND (p_kind='entity_authoring_descriptor' OR EXISTS(SELECT 1 FROM metadata.entity_change_set draft
 WHERE draft.id::text=c.unsigned_document#>>'{envelope,payload,changeSetId}' AND draft.entity_id::text=c.unsigned_document#>>'{envelope,payload,entityId}' AND draft.tenant_id IS NULL AND entity_command_private.admitted(draft.id)))
 FOR SHARE OF r,a,c,installed,h;
END $$;
CREATE FUNCTION entity_command_private.find_identity_review(p_draft uuid,p_entity uuid,p_source_hash text)
RETURNS TABLE("publicationKey" text,"releaseId" uuid,"unsignedHash" text,"artifactHash" text,kind text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT entity_command_private.admitted(p_draft) OR NOT EXISTS(SELECT 1 FROM metadata.entity_change_set d WHERE d.id=p_draft AND d.entity_id=p_entity AND d.tenant_id IS NULL) THEN RAISE EXCEPTION 'REFERENCE_RESOURCE_ADMISSION_REQUIRED'; END IF;
 RETURN QUERY SELECT r.release_key,r.id,c.unsigned_hash,a.content_hash,a.artifact_kind
 FROM publication.release r JOIN publication.artifact a ON a.publication_release_id=r.id AND a.plane_code='studio'
 JOIN publication.artifact_compilation c ON c.publication_release_id=r.id AND c.artifact_kind=a.artifact_kind AND c.plane_code='studio'
 JOIN runtime_meta.applied_release installed ON installed.source_release_id=r.id AND installed.artifact_hash=a.content_hash AND installed.publication_key=r.release_key AND installed.source_release_no=r.release_no
 JOIN runtime_meta.release_activation_head h ON h.applied_release_id=installed.id AND h.publication_key=installed.publication_key AND h.artifact_hash=installed.artifact_hash AND h.source_release_no=installed.source_release_no
 WHERE r.tenant_id::text=current_setting('app.current_tenant_id',true) AND r.status='published' AND r.approved_at IS NOT NULL AND r.approved_by<>r.created_by
 AND a.status='signed' AND a.validated_at IS NOT NULL AND a.artifact_kind='entity_identity_review' AND installed.status='active' AND installed.verified_at IS NOT NULL
 AND c.unsigned_document#>>'{envelope,payload,entityId}'=p_entity::text AND c.unsigned_document#>>'{envelope,payload,changeSetId}'=p_draft::text AND c.unsigned_document#>>'{envelope,payload,sourceHash}'=p_source_hash
 LIMIT 2 FOR SHARE OF r,a,c,installed,h;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.read_reference_resource(uuid,text,text,text,text,integer),entity_command_private.find_identity_review(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.read_reference_resource(uuid,text,text,text,text,integer),entity_command_private.find_identity_review(uuid,uuid,text) TO athyper_product_command_app;

DO $$ DECLARE r record; h text; BEGIN
 FOR r IN SELECT * FROM ownership_original_rows LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.schema_name,r.table_name) INTO h;
  IF h IS DISTINCT FROM r.row_hash THEN RAISE EXCEPTION 'OWNERSHIP_PREPARATION_CHANGED_DATA: %.%',r.schema_name,r.table_name; END IF;
 END LOOP;
END $$;
COMMIT;
