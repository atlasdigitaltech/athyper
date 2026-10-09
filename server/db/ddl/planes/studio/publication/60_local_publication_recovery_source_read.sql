-- Read-only recovery inspection of the original developer's recorded local release.
-- No publication, mutation, IAM or MFA authority is granted by this reader.
CREATE OR REPLACE FUNCTION publication.read_native_product_review_source(p_draft uuid,p_maximum_bytes integer)
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
 AND cs.source_kind='product' AND cs.native_core_layout_version=2 AND (cs.status IN ('draft','in_review','approved') OR (cs.status='published' AND cs.created_by=master.current_principal_id_soft() AND EXISTS(SELECT 1 FROM publication.local_publication_request q WHERE q.change_set_id=cs.id AND q.tenant_id=shared.current_tenant_id_soft() AND q.developer_id=master.current_principal_id_soft() AND q.execution_status='published' AND q.execution_revision=cs.lock_version AND q.execution_release_id IS NOT NULL))) FOR SHARE OF cs;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_REVIEW_SOURCE_UNAVAILABLE'; END IF;
 SELECT * INTO STRICT saved FROM snapshot.entity_draft_save s WHERE s.change_set_id=c.id AND s.tenant_id IS NULL AND s.lock_version=c.lock_version;
 SELECT coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('export_max_records',o.export_max_records::text) ORDER BY o.id),'[]') INTO ops
 FROM metadata.entity_operation o WHERE o.change_set_id=c.id AND o.entity_id=c.entity_id AND o.tenant_id IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('native_available',metadata.native_identity_available(c.id,i.id)) ORDER BY i.id),'[]') INTO ids FROM metadata.entity_field_identity i
 WHERE i.entity_id=c.entity_id AND i.tenant_id IS NULL AND EXISTS(SELECT 1 FROM metadata.entity_field f WHERE f.change_set_id=c.id AND f.field_identity_id=i.id);
 IF octet_length(saved.graph::text)+octet_length(ops::text)+octet_length(ids::text)>p_maximum_bytes
 THEN RAISE EXCEPTION 'NATIVE_REVIEW_SOURCE_TOO_LARGE'; END IF;
 RETURN QUERY SELECT to_jsonb(c),saved.graph,saved.graph_hash,ops,ids;
END $$;
