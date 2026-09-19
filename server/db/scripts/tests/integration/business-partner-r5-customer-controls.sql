\set ON_ERROR_STOP on
-- Local engineering probe. Requires the disposable R5 fixture; rolls back all
-- changes. Synthetic readiness here is not an end-to-end or downstream receipt.
BEGIN;
DO $$
DECLARE
 tenant uuid; actor uuid; bp uuid; customer uuid; org uuid; company uuid;
 supplier uuid:=gen_random_uuid(); supplier_profile uuid:=gen_random_uuid();
 result record; replay record; action text; version bigint:=1; readiness jsonb;
 expected text; failure_message text;
BEGIN
 SELECT b.tenant_id,b.created_by,b.id,c.id,a.operating_organization_id,p.company_code_id
 INTO STRICT tenant,actor,bp,customer,org,company
 FROM master.business_partner b JOIN master.customer c ON c.tenant_id=b.tenant_id AND c.business_partner_id=b.id
 JOIN master.business_partner_operating_organization_assignment a ON a.tenant_id=b.tenant_id AND a.business_partner_id=b.id AND a.partner_role='customer'
 JOIN master.company_code_customer_profile p ON p.tenant_id=b.tenant_id AND p.customer_id=c.id
 WHERE b.code='R5.CUS.CONTROLS' AND b.metadata#>>'{_seed,pack}'='acceptance.business-partner-r5.v1' AND c.status='prospect' AND c.record_version=1;
 PERFORM set_config('app.database_plane','neon',true);
 PERFORM set_config('app.current_tenant_id',tenant::text,true);
 PERFORM set_config('app.current_principal_id',actor::text,true);
 -- Regression: the shared trigger must never resolve a Supplier-only field on a Customer row.
 UPDATE master.company_code_customer_profile SET updated_by=actor WHERE tenant_id=tenant AND customer_id=customer;
 BEGIN
  UPDATE master.company_code_customer_profile SET payment_term_id=gen_random_uuid(),updated_by=actor WHERE tenant_id=tenant AND customer_id=customer;
  RAISE EXCEPTION 'Invalid Customer payment term accepted';
 EXCEPTION WHEN foreign_key_violation THEN
  GET STACKED DIAGNOSTICS failure_message = MESSAGE_TEXT;
  IF failure_message <> 'Payment term must be active' THEN RAISE EXCEPTION 'Unexpected payment-term denial: %',failure_message; END IF;
 END;
 INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,status,created_by) VALUES(supplier,tenant,bp,'R5.PROBE.SUPPLIER','onboarding',actor);
 INSERT INTO master.company_code_supplier_profile(id,tenant_id,supplier_id,company_code_id,status,created_by) VALUES(supplier_profile,tenant,supplier,company,'active',actor);
 BEGIN
  UPDATE master.company_code_supplier_profile SET preferred_remittance_bank_link_id=gen_random_uuid(),updated_by=actor WHERE id=supplier_profile;
  RAISE EXCEPTION 'Invalid Supplier remittance accepted';
 EXCEPTION WHEN foreign_key_violation OR check_violation THEN
  GET STACKED DIAGNOSTICS failure_message = MESSAGE_TEXT;
  IF failure_message NOT IN ('Remittance bank link must be effective for the company','Preferred remittance link is not an active compatible supplier-beneficiary account') THEN RAISE EXCEPTION 'Unexpected remittance denial: %',failure_message; END IF;
 END;
 readiness:=jsonb_build_object('decisionFingerprint',repeat('a',64),'eligible',true,'businessPartnerId',bp,'role','customer','operatingOrganizationId',org,'companyCodeId',company,'businessDate',CURRENT_DATE);
 FOREACH action IN ARRAY ARRAY['activate','suspend','reactivate','deactivate','archive'] LOOP
  SELECT * INTO result FROM control.command_customer_lifecycle(tenant,bp,customer,org,company,action,version,'R5_PROBE',CURRENT_DATE,CASE WHEN action IN('activate','reactivate') THEN repeat('a',64) END,CASE WHEN action IN('activate','reactivate') THEN readiness ELSE '{}'::jsonb END,'r5-probe-'||action,actor);
  expected:=CASE action WHEN 'suspend' THEN 'suspended' WHEN 'deactivate' THEN 'inactive' WHEN 'archive' THEN 'archived' ELSE 'active' END;
  IF result.status<>expected OR result.resulting_version<>version+1 OR result.replayed THEN RAISE EXCEPTION 'Invalid lifecycle result for %',action; END IF;
  SELECT * INTO replay FROM control.command_customer_lifecycle(tenant,bp,customer,org,company,action,version,'R5_PROBE',CURRENT_DATE,CASE WHEN action IN('activate','reactivate') THEN repeat('a',64) END,CASE WHEN action IN('activate','reactivate') THEN readiness ELSE '{}'::jsonb END,'r5-probe-'||action,actor);
  IF NOT replay.replayed OR replay.event_id<>result.event_id OR replay.resulting_version<>result.resulting_version THEN RAISE EXCEPTION 'Replay drift for %',action; END IF;
  version:=version+1;
 END LOOP;
 BEGIN
  PERFORM control.command_customer_lifecycle(tenant,bp,customer,org,company,'archive',version-1,'R5_PROBE',CURRENT_DATE,NULL,'{}','r5-probe-stale',actor);
  RAISE EXCEPTION 'Stale lifecycle command accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM control.command_customer_lifecycle(tenant,bp,customer,org,company,'suspend',version,'R5_PROBE',CURRENT_DATE,NULL,'{}','r5-probe-invalid',actor);
  RAISE EXCEPTION 'Invalid lifecycle transition accepted';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN
  PERFORM control.command_customer_lifecycle(tenant,bp,customer,org,company,'archive',version-1,'R5_CHANGED',CURRENT_DATE,NULL,'{}','r5-probe-archive',actor);
  RAISE EXCEPTION 'Conflicting key accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM control.command_customer_lifecycle(gen_random_uuid(),bp,customer,org,company,'archive',version,'R5_PROBE',CURRENT_DATE,NULL,'{}','r5-probe-wrong-tenant',actor);
  RAISE EXCEPTION 'Wrong tenant accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM control.customer_lifecycle_event WHERE tenant_id=tenant AND customer_id=customer)<>5 THEN RAISE EXCEPTION 'Lifecycle replay duplicated evidence'; END IF;
 RAISE NOTICE 'R5 profile regression, five actions, exact replay, stale/conflicting/invalid/wrong-tenant denial passed';
END $$;
ROLLBACK;
