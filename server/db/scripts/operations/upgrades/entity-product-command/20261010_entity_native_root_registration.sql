BEGIN;
SET LOCAL lock_timeout='5s';
-- A separate fresh-root admission. The root declaration is carried in the
-- issuer ticket after trusted composition reads an immutable native proposal;
-- it is never accepted as an HTTP attribute and does not broaden application
-- table privileges.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_product_command_owner')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_product_command_issuer')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_product_command_app')
 OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='entity_command_private')
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.entity'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
  RAISE EXCEPTION 'NATIVE_ROOT_REGISTRATION_PREREQUISITES_REQUIRED';
 END IF;
END $$;
GRANT USAGE ON SCHEMA metadata,control TO athyper_product_command_owner;
SET ROLE athyper_product_command_owner;
CREATE TABLE entity_command_private.root_registration_admission (
 token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash)=32),
 login_role name NOT NULL,
 authority_tenant_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 change_set_id uuid NOT NULL,
 request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
 entity_id uuid NOT NULL,
 module_code text NOT NULL CHECK (module_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
 entity_code text NOT NULL CHECK (entity_code ~ '^[a-z][a-z0-9_]{1,62}$'),
 entity_class metadata.entity_class_d NOT NULL,
 ownership_model metadata.entity_ownership_d NOT NULL CHECK (ownership_model='system'),
 expires_at timestamptz NOT NULL CHECK (expires_at <= issued_at + interval '60 seconds'),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked boolean NOT NULL DEFAULT false,
 transaction_id xid8,
 backend_pid integer,
 CHECK ((transaction_id IS NULL) = (backend_pid IS NULL))
);
REVOKE ALL ON entity_command_private.root_registration_admission FROM PUBLIC;
GRANT INSERT(token_hash,login_role,authority_tenant_id,actor_id,change_set_id,request_hash,entity_id,module_code,entity_code,entity_class,ownership_model,expires_at)
 ON entity_command_private.root_registration_admission TO athyper_product_command_issuer;
CREATE OR REPLACE FUNCTION entity_command_private.revoke(p_token_hash bytea) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,entity_command_private AS $$
BEGIN
 UPDATE entity_command_private.admission SET revoked=true WHERE token_hash=p_token_hash;
 UPDATE entity_command_private.root_registration_admission SET revoked=true WHERE token_hash=p_token_hash;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.revoke(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.revoke(bytea) TO athyper_product_command_issuer;
RESET ROLE;

-- The application login can only execute the bounded definer routine. It does
-- not receive INSERT on metadata.entity.
GRANT SELECT ON control.module TO athyper_product_command_owner;
GRANT SELECT,INSERT ON metadata.entity TO athyper_product_command_owner;
CREATE POLICY native_root_registration_owner_read ON metadata.entity FOR SELECT TO athyper_product_command_owner
 USING(tenant_id IS NULL AND ownership_model='system');
CREATE POLICY native_root_registration_owner_read_fence ON metadata.entity AS RESTRICTIVE FOR SELECT TO athyper_product_command_owner
 USING(tenant_id IS NULL AND ownership_model='system');
CREATE POLICY native_root_registration_owner_insert ON metadata.entity FOR INSERT TO athyper_product_command_owner
 WITH CHECK(tenant_id IS NULL AND ownership_model='system' AND status='draft'
   AND created_by::text=current_setting('app.current_principal_id',true));
CREATE POLICY native_root_registration_owner_insert_fence ON metadata.entity AS RESTRICTIVE FOR INSERT TO athyper_product_command_owner
 WITH CHECK(tenant_id IS NULL AND ownership_model='system' AND status='draft'
   AND created_by::text=current_setting('app.current_principal_id',true));

SET ROLE athyper_product_command_owner;
CREATE FUNCTION entity_command_private.enter_root_registration(p_token text,p_request_hash text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,entity_command_private,metadata,control AS $$
DECLARE a entity_command_private.root_registration_admission;
DECLARE existing record;
DECLARE module_id uuid;
BEGIN
 IF pg_has_role(session_user,'athyper_product_command_issuer','MEMBER')
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'PRODUCT_COMMAND_ROLE_SEPARATION_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF length(p_token) <> 64 OR p_token !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'PRODUCT_COMMAND_ADMISSION_DENIED' USING ERRCODE='42501';
 END IF;
 UPDATE entity_command_private.root_registration_admission
 SET transaction_id=pg_current_xact_id(),backend_pid=pg_backend_pid()
 WHERE token_hash=sha256(convert_to(p_token,'UTF8')) AND login_role=session_user
   AND request_hash=p_request_hash AND NOT revoked AND expires_at>clock_timestamp()
   AND transaction_id IS NULL
   AND actor_id::text=current_setting('app.current_principal_id',true)
   AND authority_tenant_id::text=current_setting('app.current_tenant_id',true)
 RETURNING * INTO a;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_COMMAND_ADMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT e.entity_code,e.entity_class,e.ownership_model,m.code AS module_code
 INTO existing FROM metadata.entity e JOIN control.module m ON m.id=e.module_id
 WHERE e.id=a.entity_id FOR UPDATE;
 IF FOUND THEN
  IF existing.entity_code<>a.entity_code OR existing.entity_class<>a.entity_class
     OR existing.ownership_model<>a.ownership_model OR existing.module_code<>a.module_code THEN
   RAISE EXCEPTION 'NATIVE_ROOT_REGISTRATION_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN false;
 END IF;
 SELECT id INTO module_id FROM control.module WHERE code=a.module_code AND status='active' FOR SHARE;
 IF module_id IS NULL THEN RAISE EXCEPTION 'NATIVE_ROOT_REGISTRATION_MODULE_UNAVAILABLE' USING ERRCODE='23503'; END IF;
 INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,status,created_by)
 VALUES(a.entity_id,NULL,module_id,a.entity_code,a.entity_class,a.ownership_model,'draft',a.actor_id);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.enter_root_registration(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.enter_root_registration(text,text) TO athyper_product_command_app;
RESET ROLE;

COMMIT;
