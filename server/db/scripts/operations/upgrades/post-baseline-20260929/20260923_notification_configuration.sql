-- Studio-only forward migration; preserves existing templates and records.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$ BEGIN IF current_database() <> 'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF; END $$;
-- Notification-only native drafts use the ordinary reviewed publication ledger.
CREATE OR REPLACE FUNCTION publication.fn_prepare_notification_configuration_release(p_release_id uuid,p_descriptor jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,publication,metadata,snapshot,shared,master AS $$
DECLARE r record; g jsonb; branch text; expected jsonb; policies jsonb; target text; release_key_value text; existing record;
BEGIN
 SELECT er.*,e.entity_code,e.entity_class,c.approved_by,c.created_by author_id,c.submitted_by,s.contract_json INTO STRICT r
 FROM metadata.entity_release er JOIN metadata.entity e ON e.id=er.entity_id AND e.tenant_id=er.tenant_id
 JOIN metadata.entity_change_set c ON c.id=er.change_set_id AND c.tenant_id=er.tenant_id
 JOIN snapshot.entity_contract_revision s ON s.id=er.revision_id AND s.tenant_id=er.tenant_id
 WHERE er.id=p_release_id AND er.tenant_id=shared.current_tenant_id() AND er.published_by=master.current_principal_id_soft()
 AND c.status IN ('approved','published') AND c.approved_by IS NOT NULL AND c.submitted_by IS NOT NULL
 AND c.approved_by<>c.created_by AND c.approved_by<>c.submitted_by;
 IF r.release_kind<>'publish' OR r.target_planes IS DISTINCT FROM ARRAY['neon']::text[] OR r.contract_signature IS NULL OR r.signature_algorithm IS DISTINCT FROM 'Ed25519' THEN
  RAISE EXCEPTION 'NOTIFICATION_REVIEW_REQUIRED';
 END IF;
 IF r.entity_class IS DISTINCT FROM 'configuration' THEN RAISE EXCEPTION 'NOTIFICATION_CONFIGURATION_IDENTITY_REQUIRED'; END IF;
 g:=r.contract_json;
 FOR branch IN SELECT jsonb_object_keys(g) LOOP
  IF jsonb_typeof(g->branch)='array' AND branch NOT IN ('capabilities','runtimeProfiles','tests') AND jsonb_array_length(g->branch)>0 THEN RAISE EXCEPTION 'NOTIFICATION_ONLY_DRAFT_REQUIRED'; END IF;
 END LOOP;
 IF jsonb_array_length(g->'runtimeProfiles') IS DISTINCT FROM 1 OR g#>>'{runtimeProfiles,0,backingKind}' IS DISTINCT FROM 'virtual'
 OR g#>>'{runtimeProfiles,0,apiExposure}' IS DISTINCT FROM 'catalog_only' OR g#>>'{runtimeProfiles,0,readMode}' IS DISTINCT FROM 'none'
 OR g#>>'{runtimeProfiles,0,writeMode}' IS DISTINCT FROM 'none' THEN RAISE EXCEPTION 'NOTIFICATION_ONLY_DRAFT_REQUIRED'; END IF;
 SELECT jsonb_object_agg(m->>'capabilityKey',m#>'{binding,notifications}') INTO policies
 FROM jsonb_array_elements(g->'capabilities') m WHERE m#>'{binding,notifications}' IS NOT NULL AND m#>>'{declaration,enabled}'='true';
 IF policies IS NULL OR policies='{}'::jsonb THEN RAISE EXCEPTION 'NOTIFICATION_POLICY_REQUIRED'; END IF;
 SELECT min(value->>'targetEntityCode') INTO target FROM jsonb_each(policies);
 IF target IS NULL OR target !~ '^[a-z][a-z0-9_]{1,62}$' OR EXISTS(SELECT 1 FROM jsonb_each(policies) WHERE value->>'targetEntityCode' IS DISTINCT FROM target)
 OR NOT EXISTS(SELECT 1 FROM metadata.entity WHERE entity_code=target AND (tenant_id=r.tenant_id OR tenant_id IS NULL)) THEN RAISE EXCEPTION 'NOTIFICATION_TARGET_ENTITY_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM snapshot.entity_release_artifact a WHERE a.entity_id=r.entity_id AND a.tenant_id=r.tenant_id AND a.compiled_json->>'schema'='athyper.entity-notifications/1' AND a.compiled_json->>'entityCode' IS DISTINCT FROM target) THEN RAISE EXCEPTION 'NOTIFICATION_TARGET_IMMUTABLE'; END IF;
 expected:=jsonb_build_object('schema','athyper.entity-notifications/1','sourceEntityCode',r.entity_code,'entityCode',target,'notifications',policies);
 IF p_descriptor IS DISTINCT FROM expected THEN RAISE EXCEPTION 'NOTIFICATION_SOURCE_MISMATCH'; END IF;
 release_key_value:='metadata.notifications.'||target||'.'||replace(r.tenant_id::text,'-','');
 PERFORM pg_advisory_xact_lock(hashtextextended(release_key_value,0));
 IF EXISTS(SELECT 1 FROM publication.release p JOIN publication.entity_release_link l ON l.publication_release_id=p.id JOIN metadata.entity_release er ON er.id=l.entity_release_id WHERE p.release_key=release_key_value AND er.entity_id<>r.entity_id) THEN RAISE EXCEPTION 'NOTIFICATION_TARGET_ALREADY_CONFIGURED'; END IF;
 SELECT p.release_key,a.compiled_json INTO existing FROM publication.entity_release_link l JOIN publication.release p ON p.id=l.publication_release_id
 JOIN snapshot.entity_release_artifact a ON a.source_release_id=l.entity_release_id AND a.plane_key='neon' WHERE l.publication_release_id=p_release_id;
 IF FOUND THEN
  IF existing.release_key<>release_key_value OR existing.compiled_json IS DISTINCT FROM expected THEN RAISE EXCEPTION 'NOTIFICATION_RELEASE_CONFLICT'; END IF;
  RETURN;
 END IF;
 INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
 VALUES(r.tenant_id,p_release_id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,expected,snapshot.fn_compute_entity_release_artifact_hash(p_release_id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,expected),'{"schema":"notification-configuration/1","sourceChecked":true}'::jsonb,r.published_by);
 INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata)
 VALUES(p_release_id,r.tenant_id,release_key_value,r.release_no,'publish','preparing','backward_compatible',r.release_hash,r.release_hash,r.published_by,'{"schema":"notification-configuration/1"}'::jsonb);
 INSERT INTO publication.entity_release_link(publication_release_id,entity_release_id) VALUES(p_release_id,p_release_id);
 PERFORM publication.fn_transition_release(p_release_id,'approved',r.approved_by,NULL::uuid,jsonb_build_object('review','meta-entity-change-set','changeSetId',r.change_set_id));
END $$;
REVOKE ALL ON FUNCTION publication.fn_prepare_notification_configuration_release(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_prepare_notification_configuration_release(uuid,jsonb) TO athyper_publication_service;

COMMIT;
