-- Runs only in the isolated plane-boundary test database and rolls back all fixtures.
BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by) VALUES
 ('b1000000-0000-4000-8000-000000000001','guest_one','Guest one','Guest one','guest','active','d1000000-0000-4000-8000-000000000001'),
 ('b1000000-0000-4000-8000-000000000002','guest_two','Guest two','Guest two','guest','active','d1000000-0000-4000-8000-000000000001');
INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by) VALUES
 ('d1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','guest.actor','Guest actor','user','d1000000-0000-4000-8000-000000000001');
INSERT INTO master.canonical_party(id,authority_tenant_id,party_kind,legal_name,display_name,created_by) VALUES
 ('c1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','legal_entity','Guest party','Guest party','d1000000-0000-4000-8000-000000000001');
INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,display_name,created_by) VALUES
 ('e1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','tenant','guest_one','b1000000-0000-4000-8000-000000000001','Guest scope','d1000000-0000-4000-8000-000000000001');
INSERT INTO onboarding.onboarding_case(id,tenant_id,case_code,canonical_party_id,requested_by_principal_id,created_by) VALUES
 ('a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','guest.case_one','c1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001'),
 ('a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','guest.case_two','c1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001'),
 ('a1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','guest.foreign','c1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001');
INSERT INTO onboarding.onboarding_case_revision(tenant_id,onboarding_case_id,revision_no,from_status,to_status,changed_by)
 VALUES('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,NULL,'draft','d1000000-0000-4000-8000-000000000001');
INSERT INTO onboarding.onboarding_case_guest_access(tenant_id,onboarding_case_id,token_hash,scopes,issued_at,expires_at,revoked_at,revoked_by_principal_id,created_by,updated_by)
SELECT 'b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
 encode(sha256(convert_to(token,'UTF8')),'hex'), scopes, now()-interval '2 days', expiry, revoked,
 CASE WHEN revoked IS NOT NULL THEN 'd1000000-0000-4000-8000-000000000001'::uuid END,
 'd1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001'
FROM (VALUES
 ('guest-valid',ARRAY['case:read'],now()+interval '1 day',NULL::timestamptz),
 ('guest-expired',ARRAY['case:read'],now()-interval '1 day',NULL::timestamptz),
 ('guest-revoked',ARRAY['case:read'],now()+interval '1 day',now()),
 ('guest-write-only',ARRAY['case:update'],now()+interval '1 day',NULL::timestamptz)
) tokens(token,scopes,expiry,revoked);
SET LOCAL session_replication_role=origin;
GRANT athyper_onboarding_service TO athyper_runtime;
SET LOCAL SESSION AUTHORIZATION athyper_runtime;
SET LOCAL ROLE athyper_onboarding_service;
SET LOCAL app.current_tenant_id='b1000000-0000-4000-8000-000000000001';
SET LOCAL app.current_principal_id='d1000000-0000-4000-8000-000000000001';
DO $assert$
DECLARE token text; created_case uuid;
BEGIN
 IF (SELECT count(*) FROM onboarding.onboarding_case WHERE case_code LIKE 'guest.%')<>2 THEN RAISE EXCEPTION 'service tenant reads are not isolated'; END IF;
 FOREACH token IN ARRAY ARRAY['guest-invalid','guest-expired','guest-revoked','guest-write-only'] LOOP
  BEGIN
   PERFORM onboarding.fn_bind_onboarding_guest_context('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',token);
   RAISE EXCEPTION 'invalid guest capability admitted: %',token;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
 BEGIN
  PERFORM onboarding.fn_bind_onboarding_guest_context('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','guest-valid');
  RAISE EXCEPTION 'wrong case admitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM onboarding.fn_bind_onboarding_guest_context('b1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003','guest-valid');
  RAISE EXCEPTION 'wrong tenant admitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF shared.current_tenant_id_soft() IS DISTINCT FROM 'b1000000-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'failed bind changed previous context'; END IF;
 PERFORM onboarding.fn_bind_onboarding_guest_context('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','guest-valid');
 IF shared.current_tenant_id_soft() IS NOT NULL OR nullif(current_setting('app.current_principal_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'guest gained tenant/principal authority'; END IF;
 IF (SELECT count(*) FROM onboarding.onboarding_case WHERE case_code LIKE 'guest.%')<>1 THEN RAISE EXCEPTION 'guest escaped case scope'; END IF;
 -- Even a retained tenant context cannot widen a bound guest capability.
 PERFORM set_config('app.current_tenant_id','b1000000-0000-4000-8000-000000000001',true);
 PERFORM set_config('app.current_principal_id','d1000000-0000-4000-8000-000000000001',true);
 IF (SELECT count(*) FROM onboarding.onboarding_case WHERE case_code LIKE 'guest.%')<>1 THEN RAISE EXCEPTION 'guest inherited tenant reads'; END IF;
 BEGIN
  UPDATE onboarding.onboarding_case SET priority='urgent' WHERE case_code='guest.case_one';
  RAISE EXCEPTION 'service acquired direct writes';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM onboarding.fn_advance_case_status('a1000000-0000-4000-8000-000000000001','submitted');
  RAISE EXCEPTION 'guest acquired command writes';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM 1 FROM onboarding.onboarding_case_guest_access;
  RAISE EXCEPTION 'service gained token material';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM onboarding.fn_clear_onboarding_guest_context();
 IF shared.current_tenant_id_soft() IS NOT NULL OR nullif(current_setting('app.current_principal_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'clear retained ambient tenant/principal authority'; END IF;
 IF EXISTS(SELECT 1 FROM onboarding.onboarding_case WHERE case_code LIKE 'guest.%') THEN RAISE EXCEPTION 'clear retained guest authority'; END IF;
 PERFORM set_config('app.current_tenant_id','b1000000-0000-4000-8000-000000000001',true);
 PERFORM set_config('app.current_principal_id','d1000000-0000-4000-8000-000000000001',true);
 SELECT case_id INTO created_case FROM onboarding.fn_create_case_with_target(
  p_case_code=>'guest.command_created',p_canonical_party_id=>'c1000000-0000-4000-8000-000000000001',
  p_target_plane=>'studio',p_target_tenant_id=>'b1000000-0000-4000-8000-000000000001',
  p_requested_scope_target_id=>'e1000000-0000-4000-8000-000000000001');
 IF created_case IS NULL OR NOT EXISTS(SELECT 1 FROM onboarding.onboarding_case_revision WHERE onboarding_case_id=created_case AND revision_no=1) THEN RAISE EXCEPTION 'create command lost initial revision'; END IF;
 IF onboarding.fn_advance_case_status('a1000000-0000-4000-8000-000000000001','submitted') <> 'submitted' THEN RAISE EXCEPTION 'tenant command lost authorized writes'; END IF;
 BEGIN
  PERFORM onboarding.fn_advance_case_status('a1000000-0000-4000-8000-000000000003','submitted');
  RAISE EXCEPTION 'command wrote foreign case';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $assert$;
RESET SESSION AUTHORIZATION;
DO $assert$ BEGIN
 IF (SELECT status FROM onboarding.onboarding_case WHERE id='a1000000-0000-4000-8000-000000000003') <> 'draft' THEN RAISE EXCEPTION 'foreign case changed'; END IF;
 IF (SELECT count(*) FROM onboarding.onboarding_case_revision WHERE onboarding_case_id='a1000000-0000-4000-8000-000000000001')<>2 THEN RAISE EXCEPTION 'command omitted revision evidence'; END IF;
END $assert$;
ROLLBACK;
