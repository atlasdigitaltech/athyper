-- Native review consumes exact immutable saved revisions. This read surface
-- grants neither graph mutations nor publication; host IAM/audit remain required.
CREATE FUNCTION publication.read_native_product_review_source(p_draft uuid,p_maximum_bytes integer)
RETURNS TABLE(root_json jsonb,graph jsonb,graph_hash text,operation_rows jsonb,identity_rows jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c metadata.entity_change_set; saved snapshot.entity_draft_save; ops jsonb; ids jsonb;
BEGIN
 IF p_maximum_bytes IS NULL OR p_maximum_bytes<1 OR p_maximum_bytes>4194304 OR
 NOT EXISTS(SELECT 1 FROM master.principal p JOIN master.principal_identity_binding b ON b.principal_id=p.id AND b.tenant_id=p.tenant_id
 WHERE p.id=master.current_principal_id_soft() AND p.tenant_id=shared.current_tenant_id_soft() AND p.status='active' AND p.principal_type='user'
 AND b.status='active' AND b.realm_key='platform-control' AND b.audience='athyper-platform-control-api' AND b.service_client_id IS NULL)
 THEN RAISE EXCEPTION 'NATIVE_REVIEW_SOURCE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT cs.* INTO c FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id
 WHERE cs.id=p_draft AND cs.tenant_id IS NULL AND e.tenant_id IS NULL AND e.ownership_model='system'
 AND cs.source_kind='product' AND cs.native_core_layout_version=2 AND cs.status IN ('draft','in_review','approved') FOR SHARE OF cs;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_REVIEW_SOURCE_UNAVAILABLE'; END IF;
 SELECT * INTO STRICT saved FROM snapshot.entity_draft_save s WHERE s.change_set_id=c.id AND s.tenant_id IS NULL AND s.lock_version=c.lock_version;
 SELECT coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('export_max_records',o.export_max_records::text) ORDER BY o.id),'[]') INTO ops
 FROM metadata.entity_operation o WHERE o.change_set_id=c.id AND o.entity_id=c.entity_id AND o.tenant_id IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]') INTO ids FROM metadata.entity_field_identity i
 WHERE i.entity_id=c.entity_id AND i.tenant_id IS NULL AND EXISTS(SELECT 1 FROM metadata.entity_field f WHERE f.change_set_id=c.id AND f.field_identity_id=i.id);
 IF octet_length(saved.graph::text)+octet_length(ops::text)+octet_length(ids::text)>p_maximum_bytes
 THEN RAISE EXCEPTION 'NATIVE_REVIEW_SOURCE_TOO_LARGE'; END IF;
 RETURN QUERY SELECT to_jsonb(c),saved.graph,saved.graph_hash,ops,ids;
END $$;
REVOKE ALL ON FUNCTION publication.read_native_product_review_source(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_native_product_review_source(uuid,integer) TO athyper_control_api;

CREATE FUNCTION metadata.capture_native_review_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved snapshot.entity_draft_save;
lifecycle text[]:=ARRAY['status','lock_version','status_changed_at','status_changed_by','submitted_at','submitted_by','reviewed_at','reviewed_by','approved_at','approved_by','rejected_at','rejected_by','rejection_reason','published_at','published_by','updated_at','updated_by'];
BEGIN
 IF NEW.native_core_layout_version IS DISTINCT FROM 2 OR NEW.source_kind IS DISTINCT FROM 'product' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NEW.lock_version<>OLD.lock_version+1 OR (to_jsonb(NEW)-lifecycle) IS DISTINCT FROM (to_jsonb(OLD)-lifecycle)
 THEN RAISE EXCEPTION 'NATIVE_REVIEW_REVISION_SOURCE_CHANGED'; END IF;
 SELECT * INTO STRICT saved FROM snapshot.entity_draft_save WHERE change_set_id=OLD.id AND lock_version=OLD.lock_version AND tenant_id IS NOT DISTINCT FROM OLD.tenant_id;
 INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind)
 VALUES(NEW.id,NEW.lock_version,NEW.tenant_id,saved.graph,saved.graph_hash,NEW.status_changed_by,'saved');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION metadata.capture_native_review_revision() FROM PUBLIC;
CREATE TRIGGER capture_native_review_revision AFTER UPDATE OF status ON metadata.entity_change_set
FOR EACH ROW EXECUTE FUNCTION metadata.capture_native_review_revision();

-- Exact installed component evidence for the authenticated native review source.
-- No underlying publication/runtime reads or catalogue installation grants.
CREATE FUNCTION publication.read_native_review_component(
 p_target uuid,p_component uuid,p_manifest_hash text,p_release_hash text,p_maximum_bytes integer)
RETURNS TABLE(source_json jsonb,signed_document jsonb,artifact_hash text,payload_hash text,release_hash text,reviewed_source jsonb,deployment_bundle jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE applied uuid; result record;
BEGIN
 IF p_target IS NULL OR p_component IS NULL OR p_manifest_hash IS NULL OR p_release_hash IS NULL
 OR p_manifest_hash !~ '^[a-f0-9]{64}$' OR p_release_hash !~ '^[a-f0-9]{64}$'
 OR p_maximum_bytes IS NULL OR p_maximum_bytes<1 OR p_maximum_bytes>4194304
 OR NOT EXISTS(SELECT 1 FROM publication.read_native_product_review_source(p_target,p_maximum_bytes))
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
REVOKE ALL ON FUNCTION publication.read_native_review_component(uuid,uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_native_review_component(uuid,uuid,text,text,integer) TO athyper_control_api;
