BEGIN;
SET LOCAL lock_timeout='5s';
-- Requires the separately provisioned product-command transport and root tickets.
-- Missing prerequisites abort deployment rather than leave a healthy unusable API.
DO $root_upgrade$ BEGIN
 IF to_regclass('entity_command_private.root_registration_admission') IS NULL THEN
 EXECUTE $root_install$
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
 -- Correlation only; the follow-on bootstrap requires its own fresh admission.
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

$root_install$;
 END IF;
END $root_upgrade$;
-- Ticket checks never query metadata.entity, avoiding recursive RLS evaluation.
SET ROLE athyper_product_command_owner;
CREATE OR REPLACE FUNCTION entity_command_private.admitted_root(p_entity uuid) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM entity_command_private.root_registration_admission a
 WHERE a.entity_id=p_entity AND a.transaction_id=pg_current_xact_id()
 AND a.backend_pid=pg_backend_pid() AND a.login_role=session_user
 AND NOT a.revoked AND a.expires_at>clock_timestamp()
 AND a.actor_id::text=current_setting('app.current_principal_id',true)
 AND a.authority_tenant_id::text=current_setting('app.current_tenant_id',true))
$$;
REVOKE ALL ON FUNCTION entity_command_private.admitted_root(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION entity_command_private.admitted_root_attributes(
 p_entity uuid,p_module uuid,p_code text,p_class text,p_ownership text) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT entity_command_private.admitted_root(p_entity) AND EXISTS(
 SELECT 1 FROM entity_command_private.root_registration_admission a
 JOIN control.module m ON m.code=a.module_code AND m.id=p_module AND m.status='active'
 WHERE a.entity_id=p_entity AND a.transaction_id=pg_current_xact_id()
 AND a.backend_pid=pg_backend_pid() AND a.login_role=session_user
 AND NOT a.revoked AND a.expires_at>clock_timestamp()
 AND a.actor_id::text=current_setting('app.current_principal_id',true)
 AND a.authority_tenant_id::text=current_setting('app.current_tenant_id',true)
 AND a.entity_code=p_code AND a.entity_class::text=p_class AND a.ownership_model::text=p_ownership)
$$;
REVOKE ALL ON FUNCTION entity_command_private.admitted_root_attributes(uuid,uuid,text,text,text) FROM PUBLIC;
RESET ROLE;
DROP POLICY IF EXISTS native_root_registration_owner_read ON metadata.entity;
DROP POLICY IF EXISTS native_root_registration_owner_read_fence ON metadata.entity;
DROP POLICY IF EXISTS native_root_registration_owner_insert ON metadata.entity;
DROP POLICY IF EXISTS native_root_registration_owner_insert_fence ON metadata.entity;
CREATE POLICY native_root_registration_owner_read ON metadata.entity FOR SELECT TO athyper_product_command_owner
 USING(tenant_id IS NULL AND ownership_model='system' AND entity_command_private.admitted_root(id));
CREATE POLICY native_root_registration_owner_read_fence ON metadata.entity AS RESTRICTIVE FOR SELECT TO athyper_product_command_owner
 USING(tenant_id IS NULL AND ownership_model='system' AND entity_command_private.admitted_root(id));
CREATE POLICY native_root_registration_owner_insert ON metadata.entity FOR INSERT TO athyper_product_command_owner
 WITH CHECK(tenant_id IS NULL AND ownership_model='system' AND status='draft'
   AND created_by::text=current_setting('app.current_principal_id',true)
   AND entity_command_private.admitted_root_attributes(id,module_id,entity_code,entity_class::text,ownership_model::text));
CREATE POLICY native_root_registration_owner_insert_fence ON metadata.entity AS RESTRICTIVE FOR INSERT TO athyper_product_command_owner
 WITH CHECK(tenant_id IS NULL AND ownership_model='system' AND status='draft'
   AND created_by::text=current_setting('app.current_principal_id',true)
   AND entity_command_private.admitted_root_attributes(id,module_id,entity_code,entity_class::text,ownership_model::text));

SET ROLE athyper_product_command_owner;
CREATE OR REPLACE FUNCTION entity_command_private.enter_root_registration(p_token text,p_request_hash text) RETURNS boolean
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
 -- Serializes cooperating registrations without UPDATE privileges. Unique keys
 -- remain the backstop; serializable callers must retry with fresh admission.
 PERFORM pg_advisory_xact_lock(hashtextextended('native-root-registration:'||a.entity_id::text,0));
 SELECT e.entity_code,e.entity_class,e.ownership_model,m.code AS module_code
 INTO existing FROM metadata.entity e JOIN control.module m ON m.id=e.module_id
 WHERE e.id=a.entity_id;
 IF FOUND THEN
  IF existing.entity_code<>a.entity_code OR existing.entity_class<>a.entity_class
     OR existing.ownership_model<>a.ownership_model OR existing.module_code<>a.module_code THEN
   RAISE EXCEPTION 'NATIVE_ROOT_REGISTRATION_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN false;
 END IF;
 SELECT id INTO module_id FROM control.module WHERE code=a.module_code AND status='active';
 IF module_id IS NULL THEN RAISE EXCEPTION 'NATIVE_ROOT_REGISTRATION_MODULE_UNAVAILABLE' USING ERRCODE='23503'; END IF;
 INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,status,created_by)
 VALUES(a.entity_id,NULL,module_id,a.entity_code,a.entity_class,a.ownership_model,'draft',a.actor_id);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.enter_root_registration(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.enter_root_registration(text,text) TO athyper_product_command_app;
RESET ROLE;

COMMIT;
