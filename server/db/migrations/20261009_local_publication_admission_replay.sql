-- Preserve exact developer admission replay after checked lifecycle progression.
BEGIN;
CREATE OR REPLACE FUNCTION publication.fn_local_publication_request_authority(p_request jsonb,p_admit boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid:=shared.current_tenant_id_soft(); actor uuid:=master.current_principal_id_soft();
 d control.policy_definition%ROWTYPE; config jsonb; policy jsonb; expected_condition jsonb; a jsonb; host jsonb; admission jsonb:=p_request->'admission';
 developer uuid; author uuid; publisher uuid; c metadata.entity_change_set%ROWTYPE; saved jsonb; actual_hash text; receipt publication.local_publication_request%ROWTYPE;
BEGIN
 IF p_admit IS NULL OR actor IS NULL OR tenant IS NULL OR p_request->>'schema' IS DISTINCT FROM 'athyper.local-publication-request/1'
 OR p_request->>'basis' IS DISTINCT FROM 'local_development_authority' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_REQUEST_INVALID' USING ERRCODE='42501'; END IF;
 SELECT identity INTO STRICT host FROM publication.local_publication_host WHERE singleton;
 -- The installed host record is writable only by the schema installer.
 IF host IS DISTINCT FROM '{"environment":"local","instance":"dev","domainSuffix":"dev.athyper.test"}'::jsonb
 OR admission->'host' IS DISTINCT FROM host THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_DEV_ONLY' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT d FROM control.policy_definition WHERE id=(p_request#>>'{authority,id}')::uuid
 AND tenant_id=tenant AND entity_type='metadata.publication' AND status='active' FOR SHARE;
 IF d.definition_hash IS DISTINCT FROM p_request#>>'{authority,hash}' OR d.version_no::text IS DISTINCT FROM p_request#>>'{authority,version}'
 OR d.created_by=d.updated_by OR d.effective_from>CURRENT_DATE OR (d.effective_until IS NOT NULL AND d.effective_until<CURRENT_DATE)
 OR EXISTS(SELECT 1 FROM control.policy_definition n WHERE n.tenant_id=d.tenant_id AND n.entity_type=d.entity_type AND n.name=d.name
   AND n.id<>d.id AND n.status='active' AND n.version_no>=d.version_no)
 OR (SELECT count(*) FROM control.policy_rule WHERE policy_definition_id=d.id)<>1 THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_AUTHORITY_CHANGED' USING ERRCODE='42501'; END IF;
 SELECT action_config INTO STRICT config FROM control.policy_rule WHERE policy_definition_id=d.id
 AND action_code='allow' FOR SHARE;
 policy:=config->'policy';
 expected_condition:=jsonb_build_object('and',jsonb_build_array(
   jsonb_build_object('===',jsonb_build_array(jsonb_build_object('var','environment'),'dev')),
   jsonb_build_object('===',jsonb_build_array(jsonb_build_object('var','tenantId'),tenant::text)),
   jsonb_build_object('===',jsonb_build_array(jsonb_build_object('var','policyHash'),
     encode(sha256(convert_to(publication.fn_successor_canonical_json(policy),'UTF8')),'hex')))));
 IF NOT EXISTS(SELECT 1 FROM control.policy_rule WHERE policy_definition_id=d.id AND condition_expr=expected_condition)
 OR config->>'schema' IS DISTINCT FROM 'athyper.machine-publication-enrollment/1'
 OR config->>'environment' IS DISTINCT FROM 'dev' OR config->>'tenantId' IS DISTINCT FROM tenant::text
 OR policy->>'schema' IS DISTINCT FROM 'athyper.local-publication-policy/1'
 OR policy->>'policyId' IS DISTINCT FROM d.name THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_ENROLLMENT_INVALID' USING ERRCODE='42501'; END IF;
 a:=policy->'authority'||jsonb_build_object('schema','athyper.local-development-authority/1',
   'active',true,'enrollmentReceiptId',d.id,'authorWorkloadId',policy->>'authorPrincipalId',
   'publisherWorkloadId',policy->>'publisherPrincipalId');
 IF a->>'schema' IS DISTINCT FROM 'athyper.local-development-authority/1'
 OR a->'host' IS DISTINCT FROM host OR a->'scope' IS DISTINCT FROM admission->'scope'
 OR a->>'active' IS DISTINCT FROM 'true' OR nullif(a->>'enrollmentReceiptId','') IS NULL
 OR a->>'validFrom' IS NULL OR a->>'expiresAt' IS NULL
 OR NOT ((a->>'validFrom')::timestamptz<=clock_timestamp() AND (a->>'expiresAt')::timestamptz>clock_timestamp()) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_AUTHORITY_DENIED' USING ERRCODE='42501'; END IF;
 IF (a#>>'{scope,kind}') IS DISTINCT FROM 'product' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_PRODUCT_SOURCE_REQUIRED' USING ERRCODE='42501'; END IF;
 developer:=(admission->>'developerPrincipalId')::uuid; author:=(admission->>'authorWorkloadId')::uuid; publisher:=(admission->>'publisherWorkloadId')::uuid;
 IF (p_admit AND actor IS DISTINCT FROM developer) OR (NOT p_admit AND actor IS DISTINCT FROM publisher AND actor IS DISTINCT FROM author)
 OR developer=author OR developer=publisher OR author=publisher
 OR a->>'authorWorkloadId' IS DISTINCT FROM author::text OR a->>'publisherWorkloadId' IS DISTINCT FROM publisher::text
 OR NOT COALESCE(a->'developerPrincipalIds' @> jsonb_build_array(developer::text),false)
 OR admission->>'action' IS NULL OR admission->>'action' NOT IN ('publish','retry','recover','rollback')
 OR NOT COALESCE(a->'actions' @> jsonb_build_array(admission->>'action'),false)
 OR NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=tenant AND id=developer AND principal_type='user' AND status='active')
 OR (SELECT count(*) FROM master.principal WHERE tenant_id=tenant AND id IN (author,publisher) AND principal_type='service_account' AND status='active')<>2
 OR (SELECT count(*) FROM master.principal WHERE tenant_id=tenant AND id IN (d.created_by,d.updated_by) AND principal_type='user' AND status='active')<>2
 OR d.updated_by IN (author,publisher) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 IF (p_request->>'issuedAt')::timestamptz IS NULL OR (p_request->>'expiresAt')::timestamptz IS NULL
 OR NOT ((p_request->>'issuedAt')::timestamptz<=clock_timestamp() AND (p_request->>'expiresAt')::timestamptz>clock_timestamp()
 AND (p_request->>'expiresAt')::timestamptz<=(a->>'expiresAt')::timestamptz
 AND (p_request->>'expiresAt')::timestamptz-(p_request->>'issuedAt')::timestamptz<=interval '24 hours') THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_REQUEST_EXPIRED' USING ERRCODE='42501'; END IF;
 actual_hash:=encode(sha256(convert_to(publication.fn_successor_canonical_json(p_request-'hash'),'UTF8')),'hex');
 IF p_request->>'hash' IS DISTINCT FROM actual_hash
 OR p_request#>>'{inputs,compilerHash}' IS NULL OR p_request#>>'{inputs,compilerHash}' !~ '^[a-f0-9]{64}$'
 OR jsonb_typeof(p_request#>'{inputs,targets}') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_request#>'{inputs,targets}')=0
 OR jsonb_typeof(p_request#>'{inputs,resourceHashes}') IS DISTINCT FROM 'array'
 OR jsonb_typeof(a->'destinations') IS DISTINCT FROM 'array' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_REQUEST_HASH_INVALID' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_request#>'{inputs,resourceHashes}') h WHERE h IS NULL OR h !~ '^[a-f0-9]{64}$')
 OR (SELECT count(DISTINCT h) FROM jsonb_array_elements_text(p_request#>'{inputs,resourceHashes}') h)<>jsonb_array_length(p_request#>'{inputs,resourceHashes}')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request#>'{inputs,targets}') t
 WHERE t->>'plane' IS NULL OR t->>'plane' NOT IN ('studio','neon','mesh') OR t->>'instance' IS DISTINCT FROM host->>'instance'
 OR NOT COALESCE(a->'destinations' @> jsonb_build_array(jsonb_build_object('plane',t->>'plane','instance',t->>'instance')),false)
 OR NOT (t ? 'predecessorHash') OR (t->'predecessorHash'<>'null'::jsonb AND (t->>'predecessorHash' IS NULL OR t->>'predecessorHash' !~ '^[a-f0-9]{64}$'))
 OR t->>'artifactHash' IS NULL OR t->>'artifactHash' !~ '^[a-f0-9]{64}$')
 OR (SELECT count(DISTINCT t->>'plane') FROM jsonb_array_elements(p_request#>'{inputs,targets}') t)<>jsonb_array_length(p_request#>'{inputs,targets}')
 OR (SELECT jsonb_agg(jsonb_build_object('plane',t->>'plane','instance',t->>'instance') ORDER BY t->>'plane') FROM jsonb_array_elements(p_request#>'{inputs,targets}') t)
 IS DISTINCT FROM (SELECT jsonb_agg(t ORDER BY t->>'plane') FROM jsonb_array_elements(admission->'targets') t) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_TARGET_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT c FROM metadata.entity_change_set WHERE id=(p_request#>>'{inputs,changeSetId}')::uuid FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM metadata.entity WHERE id=c.entity_id AND tenant_id IS NULL AND ownership_model='system')
 OR c.tenant_id IS NOT NULL OR c.source_kind IS DISTINCT FROM 'product' OR c.native_core_layout_version IS DISTINCT FROM 2
 OR c.created_by IS DISTINCT FROM developer
 OR c.status::text NOT IN ('draft','in_review','approved','published') THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_SOURCE_CHANGED' USING ERRCODE='42501'; END IF;
 SELECT * INTO receipt FROM publication.local_publication_request WHERE request_hash=p_request->>'hash'
 AND request_json=p_request AND tenant_id=tenant;
 IF c.lock_version::text IS DISTINCT FROM p_request#>>'{inputs,revision}' AND
   (receipt.execution_revision IS DISTINCT FROM c.lock_version OR receipt.execution_status IS DISTINCT FROM c.status::text
    OR (c.status='in_review' AND c.submitted_by IS DISTINCT FROM author)
    OR (c.status='approved' AND (c.submitted_by IS DISTINCT FROM author OR c.approved_by IS DISTINCT FROM publisher))) THEN
   RAISE EXCEPTION 'LOCAL_PUBLICATION_SOURCE_CHANGED' USING ERRCODE='42501'; END IF;
 SELECT graph INTO STRICT saved FROM snapshot.entity_draft_save WHERE change_set_id=c.id AND tenant_id IS NULL AND lock_version=c.lock_version;
 IF saved->>'contractSchema' IS DISTINCT FROM 'athyper.meta-entity-contract/2.5'
 OR saved#>>'{authoringSource,entityId}' IS DISTINCT FROM c.entity_id::text
 OR encode(sha256(convert_to(publication.fn_successor_canonical_json(saved),'UTF8')),'hex') IS DISTINCT FROM p_request#>>'{inputs,sourceHash}' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_SOURCE_CHANGED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('basis','local_development_authority','authorityId',d.id,'authorityHash',d.definition_hash,
   'developerId',developer,'publisherId',publisher,'tenantId',tenant,'graph',saved,'changeSet',to_jsonb(c),'request',p_request);
END $$;
REVOKE ALL ON FUNCTION publication.fn_local_publication_request_authority(jsonb,boolean) FROM PUBLIC;


COMMIT;
