-- Executed only by ci-integrity.ts inside runner-owned disposable databases.
BEGIN;
SELECT set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true);
SELECT set_config('app.current_principal_id','22222222-2222-4222-8222-222222222222',true);
DO $test$
DECLARE
  v_role_id uuid := '77777777-7777-4777-8777-777777777777';
  v_permission_id uuid;
BEGIN
  SELECT id INTO STRICT v_permission_id FROM authz.permission ORDER BY canonical_code LIMIT 1;
  INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,status,created_by)
  VALUES(v_role_id,'11111111-1111-4111-8111-111111111111','ci.permission','CI permission','custom','api','draft','22222222-2222-4222-8222-222222222222');
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
  VALUES('11111111-1111-4111-8111-111111111111',v_role_id,v_permission_id,'22222222-2222-4222-8222-222222222222');
  IF NOT EXISTS(SELECT 1 FROM authz.role_permission rp WHERE rp.role_id=v_role_id) THEN RAISE EXCEPTION 'positive grant fixture missing'; END IF;
  BEGIN
    INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
    VALUES('11111111-1111-4111-8111-111111111111',v_role_id,'88888888-8888-4888-8888-888888888888','22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'orphan permission was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $test$;
SET LOCAL ROLE athyperapp;
DO $test$
BEGIN
  IF (SELECT count(*) FROM authz.role WHERE code='ci.permission') <> 1 THEN RAISE EXCEPTION 'tenant cannot read its role'; END IF;
  BEGIN
    INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,status,created_by)
    VALUES('11111111-1111-4111-8111-111111111111','ci.forbidden','Forbidden','custom','api','draft','22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'runtime bypassed dedicated writer';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
SELECT set_config('app.current_tenant_id','55555555-5555-4555-8555-555555555555',true);
DO $test$ BEGIN
  IF (SELECT count(*) FROM authz.role WHERE code='ci.permission') <> 0 THEN RAISE EXCEPTION 'foreign tenant role leaked'; END IF;
END $test$;
ROLLBACK;
