-- Studio-only forward upgrade. No grants to users, approvals or activations.
BEGIN;
-- A scoped read boundary for approved native sources lowered into split artifacts.
-- Authority tenant owns the job; nullable source tenant remains a separate coordinate.
CREATE OR REPLACE FUNCTION publication.fn_compiled_entity_compilation_source(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid, release_key text, release_no bigint,
 source_tenant_id uuid, revision_id uuid, published_by uuid, entity_code text,
 contract_json jsonb, compiled_json jsonb, plane_key text, created_at timestamptz,
 target_planes text[])
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,publication,metadata,snapshot,shared AS $$
 SELECT pr.id,pr.release_key,pr.release_no,er.tenant_id,er.revision_id,er.published_by,
   e.entity_code,r.contract_json,a.compiled_json,a.plane_key,a.created_at,er.target_planes
 FROM publication.release pr JOIN publication.entity_release_link l ON l.publication_release_id=pr.id
 JOIN metadata.entity_release er ON er.id=l.entity_release_id
 JOIN metadata.entity e ON e.id=er.entity_id AND e.tenant_id IS NOT DISTINCT FROM er.tenant_id
 JOIN metadata.entity_change_set cs ON cs.id=er.change_set_id AND cs.entity_id=er.entity_id AND cs.tenant_id IS NOT DISTINCT FROM er.tenant_id
 JOIN snapshot.entity_contract_revision r ON r.id=er.revision_id AND r.change_set_id=cs.id AND r.entity_id=er.entity_id AND r.tenant_id IS NOT DISTINCT FROM er.tenant_id
 JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id AND a.source_revision_id=r.id AND a.entity_id=er.entity_id AND a.tenant_id IS NOT DISTINCT FROM er.tenant_id
 WHERE pr.id=p_release_id AND pr.tenant_id=shared.current_tenant_id()
   AND pr.metadata->>'artifactKind'='compiled_entity_runtime' AND pr.status IN ('approved','published')
   AND er.release_kind='publish' AND r.validation_status='valid' AND cs.status IN ('approved','published')
   AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by<>cs.submitted_by
   AND er.contract_hash=r.contract_hash AND er.contract_signature IS NOT NULL AND er.signature_algorithm='Ed25519'
   AND a.plane_key=ANY(er.target_planes) AND a.release_hash=er.release_hash AND a.contract_hash=er.contract_hash
   AND a.compiled_hash=snapshot.fn_compute_entity_release_artifact_hash(er.id,r.id,er.entity_id,a.plane_key,er.release_hash,er.contract_hash,a.compiled_json)
 ORDER BY a.plane_key;
$$;
REVOKE ALL ON FUNCTION publication.fn_compiled_entity_compilation_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_compiled_entity_compilation_source(uuid) TO athyper_publication_service;

INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('metadata_reference_publication','^metadata\.reference\.publication\.(qualified|review_authorized|dispatched)$',22,ARRAY['execute']::audit.operation_d[],'critical',ARRAY['service_account']::audit.actor_type_d[],'tenant',false,'metadata',65536,1,'{"owner":"publication","purpose":"reference_workload_publication_evidence"}'::jsonb,'active')
ON CONFLICT(code) DO NOTHING;
COMMIT;
