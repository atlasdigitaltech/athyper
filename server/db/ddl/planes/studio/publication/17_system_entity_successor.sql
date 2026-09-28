-- Separate successor command. The first-release allocator retains its original
-- no-existing-release restriction. No broad RLS policy or table write grant.
CREATE OR REPLACE FUNCTION publication.fn_entity_successor_saved_graph(p_change_set uuid,p_predecessor uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT saved.graph FROM metadata.entity_change_set cs
 JOIN metadata.entity e ON e.id=cs.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
 JOIN metadata.entity_release r ON r.id=cs.base_release_id AND r.entity_id=cs.entity_id AND r.tenant_id IS NULL
 JOIN publication.entity_release_link l ON l.entity_release_id=r.id
 JOIN publication.release p ON p.id=l.publication_release_id AND p.tenant_id=shared.current_tenant_id_soft()
 JOIN master.principal actor ON actor.id=master.current_principal_id_soft() AND actor.tenant_id=p.tenant_id AND actor.status='active'
 JOIN LATERAL (SELECT graph FROM snapshot.entity_draft_save WHERE change_set_id=cs.id
   AND lock_version<=cs.lock_version ORDER BY lock_version DESC LIMIT 1) saved ON true
 WHERE cs.id=p_change_set AND r.id=p_predecessor AND cs.tenant_id IS NULL
   AND cs.status IN ('draft','in_review','approved') AND p.status IN ('approved','published');
$$;
REVOKE ALL ON FUNCTION publication.fn_entity_successor_saved_graph(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_entity_successor_saved_graph(uuid,uuid) TO athyper_runtime;

-- Control API needs the pinned source, not broad reads of metadata, snapshots
-- and publication tables. Caller tenant/principal remain mandatory.
CREATE OR REPLACE FUNCTION publication.fn_entity_successor_enrollment_source(p_policy jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT publication.fn_entity_successor_saved_graph(cs.id,r.id)
 FROM metadata.entity_change_set cs
 JOIN metadata.entity e ON e.id=cs.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
 JOIN metadata.entity_release r ON r.id=cs.base_release_id AND r.entity_id=cs.entity_id AND r.tenant_id IS NULL
 JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.entity_id=r.entity_id AND s.tenant_id IS NULL
 JOIN publication.entity_release_link l ON l.entity_release_id=r.id
 JOIN publication.release pr ON pr.id=l.publication_release_id
 WHERE p_policy->>'schema'='athyper.dev-entity-successor-policy/1'
   AND p_policy->>'authorityTenantId'=shared.current_tenant_id_soft()::text
   AND cs.id::text=p_policy->>'changeSetId' AND cs.entity_id::text=p_policy->>'entityId' AND cs.tenant_id IS NULL
   AND cs.status IN ('draft','in_review','approved') AND cs.created_by::text<>p_policy->>'publisherPrincipalId'
   AND (cs.submitted_by IS NULL OR cs.submitted_by::text=p_policy->>'authorPrincipalId')
   AND (cs.approved_by IS NULL OR cs.approved_by::text=p_policy->>'publisherPrincipalId')
   AND r.id::text=p_policy#>>'{predecessor,authoringReleaseId}' AND r.release_no::text=p_policy#>>'{predecessor,authoringReleaseNo}'
   AND r.release_hash=p_policy#>>'{predecessor,authoringReleaseHash}' AND r.contract_hash=p_policy#>>'{predecessor,contractHash}'
   AND r.revision_id::text=p_policy#>>'{predecessor,revisionId}' AND s.validation_status='valid'
   AND s.contract_hash=r.contract_hash AND s.contract_hash=snapshot.fn_compute_entity_contract_hash(s.contract_json)
   AND r.signature_algorithm='Ed25519' AND r.contract_signature IS NOT NULL
   AND pr.id::text=p_policy#>>'{predecessor,publicationReleaseId}' AND pr.tenant_id=shared.current_tenant_id_soft()
   AND pr.release_no::text=p_policy#>>'{predecessor,publicationReleaseNo}' AND pr.release_hash=p_policy#>>'{predecessor,publicationReleaseHash}'
   AND pr.release_key=p_policy#>>'{targets,0,publicationKey}' AND pr.status IN ('approved','published')
   AND NOT EXISTS(SELECT 1 FROM metadata.entity_release n WHERE n.entity_id=r.entity_id AND n.tenant_id IS NULL AND n.release_no>r.release_no)
   AND NOT EXISTS(SELECT 1 FROM publication.release n WHERE n.release_key=pr.release_key AND n.tenant_id=pr.tenant_id AND n.release_no>pr.release_no)
   AND (SELECT count(*) FROM master.principal WHERE tenant_id=pr.tenant_id
     AND id::text IN (p_policy->>'authorPrincipalId',p_policy->>'publisherPrincipalId')
     AND principal_type='service_account' AND provisioning_source='internal' AND status='active')=2;
$$;
REVOKE ALL ON FUNCTION publication.fn_entity_successor_enrollment_source(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_entity_successor_enrollment_source(jsonb) TO athyper_runtime;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_api') THEN
  GRANT USAGE ON SCHEMA publication TO athyper_control_api;
  GRANT EXECUTE ON FUNCTION publication.fn_entity_successor_enrollment_source(jsonb) TO athyper_control_api;
END IF; END $$;

CREATE OR REPLACE FUNCTION publication.fn_create_system_entity_successor(
  p_id uuid,p_change_set uuid,p_revision bigint,p_predecessor uuid,p_artifact jsonb,p_targets text[],p_actor uuid
) RETURNS SETOF metadata.entity_release
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority jsonb; policy jsonb; cs metadata.entity_change_set%ROWTYPE;
  revision snapshot.entity_contract_revision%ROWTYPE; previous metadata.entity_release%ROWTYPE;
  expected_targets text[];
BEGIN
  -- Authority acquires system-entity-release:<entity> before locking source,
  -- rechecks live independent enrollment, actor, lifecycle and predecessor pins.
  authority:=publication.fn_system_entity_authority(p_change_set,'release');
  policy:=authority->'policy';
  IF policy->>'schema' IS DISTINCT FROM 'athyper.dev-entity-successor-policy/1'
    OR p_predecessor::text IS DISTINCT FROM policy#>>'{predecessor,authoringReleaseId}' THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_ENROLLMENT_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=p_change_set;
  SELECT * INTO previous FROM metadata.entity_release WHERE entity_id=cs.entity_id AND tenant_id IS NULL ORDER BY release_no DESC LIMIT 1 FOR UPDATE;
  IF previous.id IS DISTINCT FROM p_predecessor OR cs.base_release_id IS DISTINCT FROM p_predecessor THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_PREDECESSOR_CHANGED' USING ERRCODE='42501'; END IF;
  SELECT array_agg(value ORDER BY value) INTO expected_targets FROM jsonb_array_elements_text(policy->'targetPlanes');
  IF p_actor IS DISTINCT FROM master.current_principal_id_soft() OR cs.lock_version<>p_revision
    OR p_artifact->>'contractHash' IS DISTINCT FROM policy->>'contractHash'
    OR p_artifact->>'descriptorHash' IS DISTINCT FROM policy->>'descriptorHash'
    OR encode(sha256(convert_to(publication.fn_successor_canonical_json(p_artifact->'descriptor'),'UTF8')),'hex') IS DISTINCT FROM policy->>'descriptorHash'
    OR p_artifact->>'signatureAlgorithm' IS DISTINCT FROM 'Ed25519'
    OR NULLIF(p_artifact->>'signingKeyId','') IS NULL OR NULLIF(p_artifact->>'signature','') IS NULL
    OR (SELECT array_agg(t ORDER BY t) FROM unnest(p_targets) t) IS DISTINCT FROM expected_targets THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SIGNED_SOURCE_MISMATCH' USING ERRCODE='42501'; END IF;
  SELECT * INTO revision FROM snapshot.entity_contract_revision WHERE change_set_id=cs.id AND tenant_id IS NULL
    AND base_release_id=p_predecessor AND validation_status='valid' AND contract_json=authority->'graph'
    ORDER BY revision_no DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYSTEM_PUBLICATION_VALIDATION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN QUERY INSERT INTO metadata.entity_release(id,tenant_id,entity_id,change_set_id,revision_id,release_no,release_kind,supersedes_release_id,
    contract_schema_code,contract_schema_version,contract_hash,revision_hash,release_hash,compatibility_level,target_planes,
    signature_algorithm,signing_key_id,contract_signature,published_by)
  VALUES(p_id,NULL,cs.entity_id,cs.id,revision.id,previous.release_no+1,'publish',p_predecessor,
    'athyper.meta-entity-contract','2.1',revision.contract_hash,revision.revision_hash,p_artifact->>'descriptorHash','backward_compatible',p_targets,
    'Ed25519',p_artifact->>'signingKeyId',p_artifact->>'signature',p_actor) RETURNING *;
END $$;
REVOKE ALL ON FUNCTION publication.fn_create_system_entity_successor(uuid,uuid,bigint,uuid,jsonb,text[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_create_system_entity_successor(uuid,uuid,bigint,uuid,jsonb,text[],uuid) TO athyper_runtime;

CREATE OR REPLACE FUNCTION publication.fn_system_entity_successor_policy(p_release uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r metadata.entity_release%ROWTYPE; authority jsonb;
BEGIN
  SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release AND tenant_id IS NULL AND release_no>1;
  authority:=publication.fn_system_entity_authority(r.change_set_id,'prepare');
  IF authority#>>'{policy,schema}' IS DISTINCT FROM 'athyper.dev-entity-successor-policy/1' THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_ENROLLMENT_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN (authority->'policy')-'productHash'-'targetPlanes';
END $$;
REVOKE ALL ON FUNCTION publication.fn_system_entity_successor_policy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_system_entity_successor_policy(uuid) TO athyper_runtime;

-- Approved immutable policy coordinates accompany the existing scoped source.
-- v1/v2 readers and historical signed artifacts are not rewritten.
CREATE OR REPLACE FUNCTION publication.fn_compiled_entity_compilation_source_v3(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid, release_key text, release_no bigint,
 source_tenant_id uuid, revision_id uuid, published_by uuid, entity_code text,
 contract_json jsonb, compiled_json jsonb, plane_key text, created_at timestamptz,
 target_planes text[], source_entity_id uuid, source_release_hash text, successor_policy jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.*,p.metadata->'successorPolicy'
 FROM publication.fn_compiled_entity_compilation_source_v2(p_release_id) s
 JOIN publication.release p ON p.id=s.publication_release_id;
$$;
REVOKE ALL ON FUNCTION publication.fn_compiled_entity_compilation_source_v3(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_compiled_entity_compilation_source_v3(uuid) TO athyper_publication_service;
