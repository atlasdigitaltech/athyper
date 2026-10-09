BEGIN;
-- Exact request admission and native compiler reads under installed local authority.
-- This is a command receipt, not a release ledger. No installer rows or grants
-- on source graphs are created. Existing human publication is unchanged.
CREATE TABLE publication.local_publication_host (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 identity jsonb NOT NULL CHECK (jsonb_typeof(identity)='object')
);
REVOKE ALL ON publication.local_publication_host FROM PUBLIC;
CREATE TABLE publication.local_publication_request (
 request_hash text PRIMARY KEY CHECK (request_hash ~ '^[a-f0-9]{64}$'),
 tenant_id uuid NOT NULL,
 authority_id uuid NOT NULL REFERENCES control.policy_definition(id),
 change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id),
 developer_id uuid NOT NULL,
 publisher_id uuid NOT NULL,
 request_json jsonb NOT NULL,
 admitted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE publication.local_publication_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON publication.local_publication_request FROM PUBLIC;

CREATE FUNCTION publication.fn_local_publication_request_authority(p_request jsonb,p_admit boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid:=shared.current_tenant_id_soft(); actor uuid:=master.current_principal_id_soft();
 d control.policy_definition%ROWTYPE; config jsonb; a jsonb; host jsonb; admission jsonb:=p_request->'admission';
 developer uuid; author uuid; publisher uuid; c metadata.entity_change_set%ROWTYPE; saved jsonb; actual_hash text;
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
 AND action_code='allow' AND condition_expr='true'::jsonb FOR SHARE;
 a:=config->'standingAuthority';
 IF config->>'schema' IS DISTINCT FROM 'athyper.local-publication-enrollment/1'
 OR a->>'schema' IS DISTINCT FROM 'athyper.local-development-authority/1'
 OR a->'host' IS DISTINCT FROM host OR a->'scope' IS DISTINCT FROM admission->'scope'
 OR a->>'active' IS DISTINCT FROM 'true' OR nullif(a->>'enrollmentReceiptId','') IS NULL
 OR a->>'validFrom' IS NULL OR a->>'expiresAt' IS NULL
 OR NOT ((a->>'validFrom')::timestamptz<=clock_timestamp() AND (a->>'expiresAt')::timestamptz>clock_timestamp()) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_AUTHORITY_DENIED' USING ERRCODE='42501'; END IF;
 IF (a#>>'{scope,kind}') IS DISTINCT FROM 'product' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_PRODUCT_SOURCE_REQUIRED' USING ERRCODE='42501'; END IF;
 developer:=(admission->>'developerPrincipalId')::uuid; author:=(admission->>'authorWorkloadId')::uuid; publisher:=(admission->>'publisherWorkloadId')::uuid;
 IF actor IS DISTINCT FROM (CASE WHEN p_admit THEN developer ELSE publisher END)
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
 OR c.created_by IS DISTINCT FROM developer OR c.lock_version::text IS DISTINCT FROM p_request#>>'{inputs,revision}'
 OR c.status::text NOT IN ('draft','in_review','approved','published') THEN
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

CREATE FUNCTION publication.admit_local_publication_request(p_request jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE checked jsonb;
BEGIN
 checked:=publication.fn_local_publication_request_authority(p_request,true);
 INSERT INTO publication.local_publication_request(request_hash,tenant_id,authority_id,change_set_id,developer_id,publisher_id,request_json)
 VALUES(p_request->>'hash',(checked->>'tenantId')::uuid,(checked->>'authorityId')::uuid,(checked#>>'{changeSet,id}')::uuid,
   (checked->>'developerId')::uuid,(checked->>'publisherId')::uuid,p_request)
 ON CONFLICT(request_hash) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM publication.local_publication_request WHERE request_hash=p_request->>'hash' AND request_json=p_request
 AND tenant_id=(checked->>'tenantId')::uuid) THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_REPLAY_CONFLICT' USING ERRCODE='42501'; END IF;
 RETURN p_request->>'hash';
END $$;
REVOKE ALL ON FUNCTION publication.admit_local_publication_request(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.admit_local_publication_request(jsonb) TO athyper_control_api;

CREATE FUNCTION publication.read_local_publication_request(p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r publication.local_publication_request%ROWTYPE;
BEGIN
 SELECT * INTO STRICT r FROM publication.local_publication_request WHERE request_hash=p_hash
 AND tenant_id=shared.current_tenant_id_soft() AND publisher_id=master.current_principal_id_soft() FOR SHARE;
 RETURN publication.fn_local_publication_request_authority(r.request_json,false);
END $$;
REVOKE ALL ON FUNCTION publication.read_local_publication_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_local_publication_request(text) TO athyper_worker;
-- No data is installed by this DDL; admission rejects until a real host and
-- independently activated standing policy exist. No graph writes are granted.

ALTER TABLE publication.local_publication_host OWNER TO athyper_definer_product_publication;
ALTER TABLE publication.local_publication_request OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_local_publication_request_authority(jsonb,boolean) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.admit_local_publication_request(jsonb) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.read_local_publication_request(text) OWNER TO athyper_definer_product_publication;

-- Exact native publication inputs, read only under current enrolled workload authority.
-- No human impersonation, graph writes, initialization or broad table grants.
-- Native review consumes exact immutable saved revisions. This read surface
-- grants neither graph mutations nor publication; host IAM/audit remain required.
CREATE OR REPLACE FUNCTION publication.read_native_worker_source(p_draft uuid,p_maximum_bytes integer)
RETURNS TABLE(root_json jsonb,graph jsonb,graph_hash text,operation_rows jsonb,identity_rows jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c metadata.entity_change_set; saved snapshot.entity_draft_save; ops jsonb; ids jsonb; authority jsonb; phase text;
BEGIN
 IF p_maximum_bytes IS NULL OR p_maximum_bytes<1 OR p_maximum_bytes>4194304
 THEN RAISE EXCEPTION 'NATIVE_WORKER_SOURCE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT CASE WHEN status='published' THEN 'prepare' ELSE 'release' END INTO phase
 FROM metadata.entity_change_set WHERE id=p_draft;
 IF nullif(current_setting('app.local_publication_request_hash',true),'') IS NOT NULL THEN
   authority:=publication.read_local_publication_request(current_setting('app.local_publication_request_hash',true));
   IF authority#>>'{changeSet,id}' IS DISTINCT FROM p_draft::text
   THEN RAISE EXCEPTION 'NATIVE_WORKER_LOCAL_SOURCE_MISMATCH' USING ERRCODE='42501'; END IF;
 ELSE
   authority:=publication.fn_system_entity_authority(p_draft,phase);
   IF (authority->>'humanReview')::boolean IS DISTINCT FROM true
   THEN RAISE EXCEPTION 'NATIVE_WORKER_HUMAN_REVIEW_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT cs.* INTO c FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id
 WHERE cs.id=p_draft AND cs.tenant_id IS NULL AND e.tenant_id IS NULL AND e.ownership_model='system'
 AND cs.source_kind='product' AND cs.native_core_layout_version=2
 AND (cs.status IN ('approved','published') OR (authority->>'basis'='local_development_authority' AND cs.status IN ('draft','in_review'))) FOR SHARE OF cs;
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
REVOKE ALL ON FUNCTION publication.read_native_worker_source(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_native_worker_source(uuid,integer) TO athyper_runtime,athyper_worker,athyper_publication_service;


COMMIT;
