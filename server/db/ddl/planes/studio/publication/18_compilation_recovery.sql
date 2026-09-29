-- Bounded, read-only evidence for pre-artifact compilation recovery. This does
-- not approve, allocate, rewrite or activate releases. No table grants change.
CREATE OR REPLACE FUNCTION publication.fn_compilation_recovery_source(p_policy jsonb, p_require_empty boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('graph',s.contract_json,'originalPolicy',pr.metadata->'successorPolicy',
   'releaseId',pr.id,'releaseHash',pr.release_hash,'revisionId',s.id,
   'empty',NOT EXISTS(SELECT 1 FROM publication.artifact_compilation c WHERE c.publication_release_id=pr.id)
     AND NOT EXISTS(SELECT 1 FROM publication.artifact a WHERE a.publication_release_id=pr.id))
 FROM publication.release pr
 JOIN publication.entity_release_link l ON l.publication_release_id=pr.id
 JOIN metadata.entity_release er ON er.id=l.entity_release_id AND er.tenant_id IS NULL
 JOIN metadata.entity_change_set cs ON cs.id=er.change_set_id AND cs.tenant_id IS NULL
 JOIN metadata.entity e ON e.id=er.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
 JOIN snapshot.entity_contract_revision s ON s.id=er.revision_id AND s.entity_id=er.entity_id AND s.tenant_id IS NULL
 JOIN master.principal actor ON actor.id=master.current_principal_id_soft() AND actor.tenant_id=pr.tenant_id AND actor.status='active'
 JOIN ops.job_execution j ON j.id::text=p_policy->>'failedJobId' AND j.tenant_id=pr.tenant_id
 WHERE p_policy->>'schema'='athyper.dev-compilation-recovery-policy/1'
   AND p_policy->>'environment'='local' AND p_policy->>'instance'='dev'
   AND pr.tenant_id=shared.current_tenant_id_soft() AND pr.tenant_id::text=p_policy->>'authorityTenantId'
   AND pr.id::text=p_policy->>'failedReleaseId' AND pr.release_hash=p_policy->>'failedReleaseHash'
   AND pr.status IN ('approved','published') AND er.release_no=pr.release_no
   AND pr.release_no=(p_policy#>>'{predecessor,publicationReleaseNo}')::bigint+1
   AND cs.id::text=p_policy->>'changeSetId' AND cs.entity_id::text=p_policy->>'entityId' AND cs.status='published'
   AND cs.submitted_by::text=p_policy->>'authorPrincipalId' AND cs.approved_by::text=p_policy->>'publisherPrincipalId'
   AND cs.approved_by<>cs.created_by AND cs.approved_by<>cs.submitted_by AND er.published_by=cs.approved_by
   AND s.validation_status='valid' AND s.contract_hash=er.contract_hash
   AND s.contract_hash=snapshot.fn_compute_entity_contract_hash(s.contract_json)
   AND er.signature_algorithm='Ed25519' AND er.contract_signature IS NOT NULL
   AND pr.metadata#>>'{successorPolicy,compiler,buildHash}'=p_policy->>'originalCompilerHash'
   AND j.job_code='publication.compile-artifact' AND j.status IN ('failed','dead_letter')
   AND j.input_payload->>'releaseId'=pr.id::text AND j.completed_at IS NOT NULL
   AND j.error_code IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM publication.release newer WHERE newer.tenant_id=pr.tenant_id AND newer.release_key=pr.release_key AND newer.release_no>pr.release_no)
   AND NOT EXISTS(SELECT 1 FROM metadata.entity_release newer WHERE newer.entity_id=er.entity_id AND newer.tenant_id IS NULL AND newer.release_no>er.release_no)
   AND (SELECT count(*) FROM master.principal WHERE tenant_id=pr.tenant_id
     AND id::text IN (p_policy->>'authorPrincipalId',p_policy->>'publisherPrincipalId')
     AND principal_type='service_account' AND provisioning_source='internal' AND status='active')=2
   AND (NOT p_require_empty OR (
     NOT EXISTS(SELECT 1 FROM publication.artifact_compilation c WHERE c.publication_release_id=pr.id)
     AND NOT EXISTS(SELECT 1 FROM publication.artifact a WHERE a.publication_release_id=pr.id)));
$$;
REVOKE ALL ON FUNCTION publication.fn_compilation_recovery_source(jsonb,boolean) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
  GRANT EXECUTE ON FUNCTION publication.fn_compilation_recovery_source(jsonb,boolean) TO athyper_runtime;
 END IF;
END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_api') THEN
  GRANT EXECUTE ON FUNCTION publication.fn_compilation_recovery_source(jsonb,boolean) TO athyper_control_api;
END IF; END $$;
