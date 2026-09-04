BEGIN;
DO $$
DECLARE
  tenant uuid; actor uuid; operating_organization uuid;
  request_id uuid:=gen_random_uuid(); invalid_request_id uuid:=gen_random_uuid(); invitation_id uuid:=gen_random_uuid();
  contract_id uuid:=gen_random_uuid(); contract_entity_id uuid:=gen_random_uuid();
  invalid_contract_id uuid:=gen_random_uuid(); invalid_contract_entity_id uuid:=gen_random_uuid();
  release_id uuid:=gen_random_uuid(); revision_id uuid:=gen_random_uuid(); form_release_id uuid:=gen_random_uuid();
  result record; snapshot_payload jsonb;
BEGIN
  SELECT p.tenant_id,p.id INTO tenant,actor
    FROM master.principal p
   WHERE p.status='active'
     AND EXISTS(SELECT 1 FROM master.operating_organization o
       WHERE o.tenant_id=p.tenant_id AND o.status='active' AND o.domain IN('procurement','both'))
   ORDER BY p.tenant_id,p.id LIMIT 1;
  SELECT o.id INTO operating_organization FROM master.operating_organization o
   WHERE o.tenant_id=tenant AND o.status='active' AND o.domain IN('procurement','both')
   ORDER BY o.id LIMIT 1;
  IF tenant IS NULL OR actor IS NULL OR operating_organization IS NULL THEN
    RAISE EXCEPTION 'G6 backfill probe requires tenant, actor, and procurement organization fixtures';
  END IF;
  PERFORM set_config('app.current_tenant_id',tenant::text,true);
  PERFORM set_config('app.current_principal_id',actor::text,true);

  INSERT INTO runtime_meta.entity_contract(id,tenant_id,entity_id,entity_code,release_id,revision_id,
    release_no,contract_schema_code,contract_schema_version,entity_contract_hash,contract_json,
    publication_key,signature_algorithm,signing_key_id,signature,published_at,status,status_changed_at)
  VALUES(contract_id,tenant,contract_entity_id,'master.business_partner',release_id,revision_id,1,
    'athyper.entity-contract','1.0.0',repeat('a',64),'{}'::jsonb,'g6.request-backfill-probe',
    'ed25519','g6-key','probe',clock_timestamp()-interval '1 second','published',clock_timestamp());

  INSERT INTO document.business_partner_request(id,tenant_id,request_no,request_kind,source_kind,
    requested_role,operating_organization_id,payload_schema_code,payload_schema_version,
    payload_schema_hash,proposed_payload,idempotency_key,created_by)
  VALUES(request_id,tenant,'G6.BACKFILL.REQUEST','new_partner','manual','supplier',operating_organization,
    'business_partner.request',7,
    repeat('b',64),'{"name":"Historical Partner","country":"MY"}'::jsonb,
    'g6-legacy-request-0001',actor);

  SELECT * INTO result FROM document.command_backfill_business_partner_request_cases(
    tenant,'business_partner.request',7,repeat('b',64),contract_id,repeat('a',64),
    form_release_id,3,repeat('c',64),'g6-request-backfill-0001',actor,NULL);
  IF result.migrated_count<>1 OR result.replayed THEN
    RAISE EXCEPTION 'G6 request backfill did not migrate exactly one request';
  END IF;
  SELECT s.payload_json INTO snapshot_payload
    FROM document.entity_case c JOIN snapshot.entity_snapshot s
      ON (s.tenant_id,s.snapshot_id)=(c.tenant_id,c.current_snapshot_id)
   WHERE c.tenant_id=tenant AND c.id=request_id;
  IF snapshot_payload<>'{"name":"Historical Partner","country":"MY"}'::jsonb
     OR NOT EXISTS(SELECT 1 FROM document.entity_case c WHERE c.tenant_id=tenant AND c.id=request_id
       AND c.entity_contract_id=contract_id AND c.entity_contract_hash=repeat('a',64)
       AND c.form_template_release_id=form_release_id AND c.form_template_release_no=3
       AND c.form_template_hash=repeat('c',64) AND c.status='draft')
     OR NOT EXISTS(SELECT 1 FROM document.entity_case_command_evidence e
       WHERE e.tenant_id=tenant AND e.entity_case_id=request_id
         AND e.result_code='LEGACY_REQUEST_BACKFILLED')
     OR NOT EXISTS(SELECT 1 FROM event.outbox o WHERE o.tenant_id=tenant AND o.id=result.outbox_id
       AND o.event_type='entity.case.legacy_request.backfill.completed') THEN
    RAISE EXCEPTION 'G6 request backfill lost pinned release, snapshot, evidence, or outbox state';
  END IF;
  SELECT * INTO result FROM document.command_backfill_business_partner_request_cases(
    tenant,'business_partner.request',7,repeat('b',64),contract_id,repeat('a',64),
    form_release_id,3,repeat('c',64),'g6-request-backfill-0001',actor,NULL);
  IF NOT result.replayed OR result.migrated_count<>1 THEN
    RAISE EXCEPTION 'G6 request backfill exact replay failed';
  END IF;

  INSERT INTO runtime_meta.entity_contract(id,tenant_id,entity_id,entity_code,release_id,revision_id,
    release_no,contract_schema_code,contract_schema_version,entity_contract_hash,contract_json,
    publication_key,signature_algorithm,signing_key_id,signature,published_at,status,status_changed_at)
  VALUES(invalid_contract_id,tenant,invalid_contract_entity_id,'master.business_partner',gen_random_uuid(),
    gen_random_uuid(),2,'athyper.entity-contract','1.0.0',repeat('f',64),
    '{"type":"object","required":["legalName"]}'::jsonb,'g6.request-backfill-invalid-probe',
    'ed25519','g6-key','probe',clock_timestamp()-interval '1 second','published',clock_timestamp());
  INSERT INTO document.business_partner_request(id,tenant_id,request_no,request_kind,source_kind,
    requested_role,operating_organization_id,payload_schema_code,payload_schema_version,
    payload_schema_hash,proposed_payload,idempotency_key,created_by)
  VALUES(invalid_request_id,tenant,'G6.BACKFILL.INVALID','new_partner','manual','supplier',operating_organization,
    'business_partner.request',7,repeat('b',64),'{"name":"Invalid Historical Partner"}'::jsonb,
    'g6-invalid-request-0001',actor);
  BEGIN
    PERFORM document.command_backfill_business_partner_request_cases(
      tenant,'business_partner.request',7,repeat('b',64),invalid_contract_id,repeat('f',64),
      gen_random_uuid(),1,repeat('1',64),'g6-invalid-backfill-0001',actor,NULL);
    RAISE EXCEPTION 'G6 backfill accepted a payload that violates the pinned contract';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM document.entity_case WHERE tenant_id=tenant AND id=invalid_request_id)
     OR EXISTS(SELECT 1 FROM event.command_execution WHERE tenant_id=tenant
       AND command_code='entity.case.backfill.business_partner_request'
       AND idempotency_key='g6-invalid-backfill-0001') THEN
    RAISE EXCEPTION 'G6 invalid release mapping did not roll back atomically';
  END IF;

  INSERT INTO document.business_partner_invitation(id,tenant_id,invitation_no,journey_kind,requested_role,
    scope_kind,requested_operating_organization_id,intended_party_name,invitee_email_hash,token_hash,
    expires_at,idempotency_key,created_by)
  VALUES(invitation_id,tenant,'G6.BACKFILL.INVITATION','supplier','supplier','commercial',
    operating_organization,'Historical Partner',repeat('d',64),repeat('e',64),
    clock_timestamp()+interval '1 day','g6-invitation-case-0001',actor);
  UPDATE document.business_partner_invitation SET status='accepted',applicant_principal_id=actor,
    entity_case_id=request_id,accepted_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=actor
   WHERE tenant_id=tenant AND id=invitation_id;
  BEGIN
    UPDATE document.business_partner_invitation SET business_partner_request_id=request_id
     WHERE tenant_id=tenant AND id=invitation_id;
    RAISE EXCEPTION 'G6 invitation accepted dual governed and historical binding';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'G6_BUSINESS_PARTNER_REQUEST_CASE_BACKFILL_ROLLBACK_OK';
