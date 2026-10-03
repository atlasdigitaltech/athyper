-- Read-only, exact-policy evidence for human enrollment and workload recovery.
-- No identity stamping, approval, artifact rewrite or lifecycle mutation.
CREATE OR REPLACE FUNCTION publication.fn_coordinated_deployment_recovery_source(p_id uuid,p_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE d control.policy_definition%ROWTYPE; policy jsonb; result jsonb;
  tenant uuid:=shared.current_tenant_id_soft(); actor uuid:=master.current_principal_id_soft();
BEGIN
 SELECT * INTO d FROM control.policy_definition WHERE id=p_id AND tenant_id=tenant
   AND entity_type='metadata.publication' AND status='active' AND definition_hash=p_hash
   AND effective_from<=CURRENT_DATE AND (effective_until IS NULL OR effective_until>=CURRENT_DATE);
 IF d.id IS NULL OR d.created_by=d.updated_by
   OR (SELECT count(*) FROM control.policy_rule WHERE policy_definition_id=d.id)<>1 THEN
   RAISE EXCEPTION 'DEPLOYMENT_RECOVERY_ORIGINAL_REVOKED' USING ERRCODE='42501'; END IF;
 SELECT action_config->'policy' INTO STRICT policy FROM control.policy_rule WHERE policy_definition_id=d.id
   AND action_code='allow' AND action_config->>'schema'='athyper.machine-publication-enrollment/1'
   AND action_config->>'environment'='dev' AND action_config->>'tenantId'=tenant::text
   AND action_config->>'permissionCode'='studio.metadata.contract.publish_automated';
 IF policy->>'schema' IS DISTINCT FROM 'athyper.dev-human-reviewed-publication/1'
   OR policy->>'authorityTenantId' IS DISTINCT FROM tenant::text
   OR policy->>'environment' IS DISTINCT FROM 'local' OR policy->>'instance' IS DISTINCT FROM 'dev'
   OR d.created_by::text IN (policy->>'authorPrincipalId',policy->>'publisherPrincipalId')
   OR d.updated_by::text IN (policy->>'authorPrincipalId',policy->>'publisherPrincipalId')
   OR (SELECT count(*) FROM master.principal p WHERE p.tenant_id=tenant AND p.id IN (d.created_by,d.updated_by)
     AND p.principal_type='user' AND p.status='active' AND EXISTS(SELECT 1 FROM master.principal_identity_binding b
       WHERE b.tenant_id=tenant AND b.principal_id=p.id AND b.status='active' AND b.service_client_id IS NULL
         AND b.realm_key='platform-control' AND b.audience='athyper-platform-control-api'))<>2 THEN
   RAISE EXCEPTION 'DEPLOYMENT_RECOVERY_ORIGINAL_REVIEW_REVOKED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM master.principal p WHERE p.tenant_id=tenant AND p.id=actor AND p.status='active'
   AND ((p.principal_type='service_account' AND p.provisioning_source='internal' AND p.id::text=policy->>'publisherPrincipalId')
     OR (p.principal_type='user' AND EXISTS(SELECT 1 FROM master.principal_identity_binding b
       WHERE b.tenant_id=tenant AND b.principal_id=p.id AND b.status='active' AND b.service_client_id IS NULL
         AND b.realm_key='platform-control' AND b.audience='athyper-platform-control-api')))) THEN
   RAISE EXCEPTION 'DEPLOYMENT_RECOVERY_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('deploymentId',dep.id,'artifactId',a.id,'artifactHash',a.content_hash,
   'releaseId',r.id,'plane',dep.target_plane,'attempt',dep.attempt_no,'status',dep.status,
   'environment',dep.target_environment,'instance',dep.target_instance,'artifactStatus',a.status,
   'entityId',er.entity_id,'changeSetId',er.change_set_id,'sourceStatus',cs.status,
   'acknowledged',EXISTS(SELECT 1 FROM publication.deployment_acknowledgement ack WHERE ack.deployment_id=dep.id))
   ORDER BY dep.id) INTO result
 FROM publication.release r JOIN publication.artifact a ON a.publication_release_id=r.id
 JOIN publication.deployment dep ON dep.artifact_id=a.id
 JOIN publication.entity_release_link l ON l.publication_release_id=r.id
 JOIN metadata.entity_release er ON er.id=l.entity_release_id
 JOIN metadata.entity_change_set cs ON cs.id=er.change_set_id
 WHERE r.tenant_id=tenant AND r.metadata->>'executionPolicyId'=d.id::text
   AND r.metadata->>'executionPolicyHash'=p_hash AND r.metadata->'humanExecutionPolicy'=policy
   AND r.status IN ('approved','published') AND r.created_by::text=policy->>'publisherPrincipalId'
   AND er.tenant_id IS NULL AND cs.tenant_id IS NULL AND dep.target_environment=policy->>'environment'
   AND dep.target_instance IN ('*',policy->>'instance')
   AND NOT EXISTS (SELECT 1 FROM publication.deployment earlier
     WHERE earlier.artifact_id=dep.artifact_id AND earlier.target_environment=dep.target_environment
       AND earlier.target_instance IN ('*',policy->>'instance') AND earlier.attempt_no<dep.attempt_no);
 RETURN jsonb_build_object('policy',policy,'version',d.version_no,'deliveries',COALESCE(result,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION publication.fn_coordinated_deployment_recovery_source(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_coordinated_deployment_recovery_source(uuid,text) TO athyper_runtime, athyper_worker;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_api') THEN
 GRANT USAGE ON SCHEMA publication TO athyper_control_api;
 GRANT EXECUTE ON FUNCTION publication.fn_coordinated_deployment_recovery_source(uuid,text) TO athyper_control_api;
END IF; END $$;
ALTER FUNCTION publication.fn_coordinated_deployment_recovery_source(uuid,text) OWNER TO athyper_definer_product_publication;
