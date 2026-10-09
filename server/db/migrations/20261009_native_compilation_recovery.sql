BEGIN;
-- Bounded read-only recovery evidence. No release, source, review or artifact mutation.
CREATE OR REPLACE FUNCTION publication.fn_native_compilation_recovery_source(p_policy jsonb,p_empty boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original jsonb; result jsonb; tenant uuid:=shared.current_tenant_id_soft();
BEGIN
 IF p_policy->>'schema' IS DISTINCT FROM 'athyper.dev-native-compilation-recovery/1'
   OR p_policy->>'environment' IS DISTINCT FROM 'local' OR p_policy->>'instance' IS DISTINCT FROM 'dev'
   OR p_policy->>'authorityTenantId' IS DISTINCT FROM tenant::text OR p_empty IS NULL
   OR (p_policy->>'expiresAt')::timestamptz<=CURRENT_TIMESTAMP THEN
   RAISE EXCEPTION 'NATIVE_COMPILATION_RECOVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- Existing original-policy checker verifies active independent human enrollment,
 -- exact definition hash, current principals and the requesting human/workload.
 original:=publication.fn_coordinated_deployment_recovery_source((p_policy#>>'{originalPolicy,id}')::uuid,p_policy#>>'{originalPolicy,hash}');
 IF original->'policy'->>'authorPrincipalId' IS DISTINCT FROM p_policy->>'authorPrincipalId'
   OR original->'policy'->>'publisherPrincipalId' IS DISTINCT FROM p_policy->>'publisherPrincipalId'
   OR original#>>'{policy,compiler,buildHash}' IS DISTINCT FROM p_policy#>>'{originalPolicy,compilerHash}' THEN
   RAISE EXCEPTION 'NATIVE_COMPILATION_RECOVERY_ORIGINAL_CHANGED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('releaseId',pr.id,'releaseHash',pr.release_hash,'changeSetId',cs.id,
   'failedJobId',j.id,'graph',s.contract_json,'empty',
     NOT EXISTS(SELECT 1 FROM publication.artifact_compilation c WHERE c.publication_release_id=pr.id)
     AND NOT EXISTS(SELECT 1 FROM publication.artifact a WHERE a.publication_release_id=pr.id)) ORDER BY pr.id)
 INTO result
 FROM jsonb_array_elements(p_policy->'releases') pin
 JOIN publication.release pr ON pr.id=(pin->>'releaseId')::uuid AND pr.tenant_id=tenant
 JOIN publication.entity_release_link l ON l.publication_release_id=pr.id
 JOIN metadata.entity_release er ON er.id=l.entity_release_id AND er.tenant_id IS NULL
 JOIN metadata.entity_change_set cs ON cs.id=er.change_set_id AND cs.tenant_id IS NULL
 JOIN snapshot.entity_contract_revision s ON s.id=er.revision_id AND s.entity_id=er.entity_id AND s.tenant_id IS NULL
 JOIN ops.job_execution j ON j.id=(pin->>'failedJobId')::uuid AND j.tenant_id=tenant
 JOIN LATERAL jsonb_array_elements(original#>'{policy,plan,members}') member ON member->>'changeSetId'=cs.id::text
 WHERE pr.release_hash=pin->>'releaseHash' AND cs.id::text=pin->>'changeSetId'
   AND pr.status IN ('approved','published') AND cs.status='published' AND er.release_no=pr.release_no
   AND pr.metadata->'humanExecutionPolicy'=original->'policy'
   AND pr.metadata->>'executionPolicyId'=p_policy#>>'{originalPolicy,id}'
   AND pr.metadata->>'executionPolicyHash'=p_policy#>>'{originalPolicy,hash}'
   AND pr.metadata->>'coordinationHash'=p_policy#>>'{originalPolicy,coordinationHash}'
   AND pr.created_by::text=p_policy->>'publisherPrincipalId' AND er.published_by=pr.created_by
   AND cs.entity_id::text=member->>'entityId' AND cs.submitted_by::text=member->>'authorId'
   AND cs.approved_by::text=member->>'reviewerId' AND cs.approved_by<>cs.submitted_by AND cs.approved_by<>cs.created_by
   AND (SELECT count(*) FROM master.principal p WHERE p.tenant_id=tenant AND p.id IN (cs.submitted_by,cs.approved_by)
     AND p.principal_type='user' AND p.status='active')=2
   AND s.contract_json->>'contractSchema'='athyper.meta-entity-contract/2.5' AND s.validation_status='valid'
   AND s.contract_hash=er.contract_hash AND s.contract_hash=snapshot.fn_compute_entity_contract_hash(s.contract_json)
   AND er.signature_algorithm='Ed25519' AND er.contract_signature IS NOT NULL AND er.signing_key_id IS NOT NULL
   AND j.job_code='publication.compile-artifact' AND j.status IN ('failed','dead_letter')
   AND j.input_payload->>'releaseId'=pr.id::text AND j.completed_at IS NOT NULL AND j.error_code IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM publication.release newer WHERE newer.tenant_id=tenant AND newer.release_key=pr.release_key AND newer.release_no>pr.release_no)
   AND NOT EXISTS(SELECT 1 FROM metadata.entity_release newer WHERE newer.entity_id=er.entity_id AND newer.tenant_id IS NULL AND newer.release_no>er.release_no)
   AND (NOT p_empty OR (NOT EXISTS(SELECT 1 FROM publication.artifact_compilation c WHERE c.publication_release_id=pr.id)
     AND NOT EXISTS(SELECT 1 FROM publication.artifact a WHERE a.publication_release_id=pr.id)));
 IF jsonb_array_length(COALESCE(result,'[]'::jsonb))<>jsonb_array_length(p_policy->'releases')
   OR jsonb_array_length(result)<>jsonb_array_length(original#>'{policy,plan,members}') THEN
   RAISE EXCEPTION 'NATIVE_COMPILATION_RECOVERY_GROUP_CHANGED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('policy',original->'policy','version',original->'version','releases',result);
END $$;
REVOKE ALL ON FUNCTION publication.fn_native_compilation_recovery_source(jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_native_compilation_recovery_source(jsonb,boolean) TO athyper_runtime,athyper_worker,athyper_control_api;
ALTER FUNCTION publication.fn_native_compilation_recovery_source(jsonb,boolean) OWNER TO athyper_definer_product_publication;
COMMIT;
