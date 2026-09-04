BEGIN;
DO $$
DECLARE t uuid;a uuid;contract_id uuid:=gen_random_uuid();contract_entity_id uuid:=gen_random_uuid();release_id uuid:=gen_random_uuid();revision_id uuid:=gen_random_uuid();case_id uuid:=gen_random_uuid();form_id uuid:=gen_random_uuid();r record;s1 uuid;s2 uuid;
BEGIN
 SELECT tenant.id,principal.id INTO t,a FROM master.tenant tenant JOIN master.principal principal ON principal.tenant_id=tenant.id AND principal.status='active' ORDER BY tenant.id,principal.id LIMIT 1;
 IF t IS NULL THEN RAISE EXCEPTION 'G1 command probe requires tenant and actor fixtures';END IF;
 PERFORM set_config('app.current_tenant_id',t::text,true);PERFORM set_config('app.current_principal_id',a::text,true);
 INSERT INTO runtime_meta.entity_contract(id,tenant_id,entity_id,entity_code,release_id,revision_id,release_no,contract_schema_code,contract_schema_version,entity_contract_hash,contract_json,publication_key,signature_algorithm,signing_key_id,signature,published_at,status,status_changed_at)
 VALUES(contract_id,t,contract_entity_id,'master.business_partner',release_id,revision_id,1,'athyper.entity-contract','1.0.0',repeat('a',64),'{"type":"object","required":["name","country"],"additionalProperties":false,"properties":{"name":{"type":"string"},"country":{"type":"string"}}}'::jsonb,'g1.probe','ed25519','g1-key','probe',clock_timestamp()-interval '1 second','published',clock_timestamp());
 SELECT * INTO r FROM document.command_entity_case_draft(t,case_id,0,NULL,'G1.PROBE','master.business_partner','register',NULL,'g1-probe',contract_id,repeat('a',64),form_id,1,repeat('b',64),'{"name":"Alpha","country":"MY"}', 'g1-draft-create-0001',a,NULL);
 IF r.row_version<>1 OR r.disposition<>'accepted' OR r.replayed THEN RAISE EXCEPTION 'G1 create failed';END IF;s1:=r.snapshot_id;
 SELECT * INTO r FROM document.command_entity_case_draft(t,case_id,0,NULL,'G1.PROBE','master.business_partner','register',NULL,'g1-probe',contract_id,repeat('a',64),form_id,1,repeat('b',64),'{"country":"MY","name":"Alpha"}', 'g1-draft-create-0001',a,NULL);
 IF NOT r.replayed OR r.snapshot_id<>s1 THEN RAISE EXCEPTION 'G1 exact replay failed';END IF;
 SELECT * INTO r FROM document.command_entity_case_draft(t,case_id,1,NULL,'G1.PROBE','master.business_partner','register',NULL,'g1-probe',contract_id,repeat('a',64),form_id,1,repeat('b',64),'{"name":"Beta","country":"MY"}', 'g1-draft-revise-0002',a,NULL);
 IF r.row_version<>2 OR r.disposition<>'accepted' THEN RAISE EXCEPTION 'G1 revision failed';END IF;s2:=r.snapshot_id;
 SELECT * INTO r FROM document.command_entity_case_draft(t,case_id,1,s1,'G1.PROBE','master.business_partner','register',NULL,'g1-probe',contract_id,repeat('a',64),form_id,1,repeat('b',64),'{"name":"Alpha","country":"SG"}', 'g1-draft-merge-0003',a,NULL);
 IF r.row_version<>3 OR r.disposition<>'accepted' OR (SELECT payload_json FROM snapshot.entity_snapshot WHERE snapshot_id=r.snapshot_id)->>'name'<>'Beta' OR (SELECT payload_json FROM snapshot.entity_snapshot WHERE snapshot_id=r.snapshot_id)->>'country'<>'SG' THEN RAISE EXCEPTION 'G1 non-overlapping merge failed';END IF;
 SELECT * INTO r FROM document.command_entity_case_draft(t,case_id,1,s1,'G1.PROBE','master.business_partner','register',NULL,'g1-probe',contract_id,repeat('a',64),form_id,1,repeat('b',64),'{"name":"Gamma","country":"MY"}', 'g1-draft-conflict-0004',a,NULL);
 IF r.row_version<>3 OR r.disposition<>'conflict' OR r.conflict_paths<>ARRAY['/name'] THEN RAISE EXCEPTION 'G1 merge conflict failed: %',r.conflict_paths;END IF;
 BEGIN UPDATE document.entity_case SET row_version=99 WHERE tenant_id=t AND id=case_id;RAISE EXCEPTION 'direct case mutation accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM document.command_entity_case_draft(t,case_id,3,s2,'G1.PROBE','master.business_partner','register',NULL,'g1-probe',contract_id,repeat('a',64),form_id,1,repeat('b',64),'{"name":"Beta","country":"SG","secret":"x"}', 'g1-draft-invalid-0005',a,NULL);RAISE EXCEPTION 'invalid schema accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 IF (SELECT count(*) FROM document.entity_case_command_evidence WHERE entity_case_id=case_id)<>4 OR (SELECT count(*) FROM event.outbox WHERE aggregate_type='entity_case' AND aggregate_id=case_id)<>4 OR (SELECT count(*) FROM snapshot.entity_snapshot_identity WHERE entity_type='document.entity_case' AND entity_id=case_id)<>3 THEN RAISE EXCEPTION 'G1 atomic evidence counts failed';END IF;
END $$;
ROLLBACK;
SELECT 'G1_GOVERNED_ENTITY_CASE_DRAFT_COMMAND_ROLLBACK_OK';
