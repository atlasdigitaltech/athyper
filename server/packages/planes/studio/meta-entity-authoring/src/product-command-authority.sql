-- Installation candidate, NOT a DEV migration or a governance approval.
-- Issuance is exclusively for the isolated authenticated governance service.
-- Do not grant issuer membership to the command application role.
-- Fresh-install preflight: never adopt a pre-existing security role/schema by
-- name. Applied-install replay belongs to the hash-pinned migration ledger.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN
   ('athyper_product_command_owner','athyper_product_command_issuer','athyper_product_command_app'))
   OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='entity_command_private') THEN
  RAISE EXCEPTION 'PRODUCT_COMMAND_INSTALLATION_CONFLICT';
 END IF;
END $$;
DO $$ DECLARE t regclass; BEGIN
 FOREACH t IN ARRAY ARRAY['metadata.entity_change_set'::regclass,'metadata.entity_label'::regclass,
   'metadata.entity_label_translation'::regclass,'metadata.entity_authoring_command_receipt'::regclass,
   'snapshot.entity_draft_save'::regclass] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=t AND relrowsecurity AND relforcerowsecurity) THEN
   RAISE EXCEPTION 'PRODUCT_COMMAND_FORCED_RLS_REQUIRED: %',t;
  END IF;
 END LOOP;
END $$;
CREATE ROLE athyper_product_command_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE athyper_product_command_issuer NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE athyper_product_command_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA entity_command_private AUTHORIZATION athyper_product_command_owner;
REVOKE ALL ON SCHEMA entity_command_private FROM PUBLIC;
GRANT USAGE ON SCHEMA entity_command_private TO athyper_product_command_issuer,athyper_product_command_app;
SET ROLE athyper_product_command_owner;
CREATE TABLE entity_command_private.admission (
 token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash)=32),
 login_role name NOT NULL,
 authority_tenant_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 change_set_id uuid NOT NULL,
 request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL CHECK (expires_at <= issued_at + interval '60 seconds'),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked boolean NOT NULL DEFAULT false,
 transaction_id xid8,
 backend_pid integer,
 CHECK ((transaction_id IS NULL) = (backend_pid IS NULL))
);
REVOKE ALL ON entity_command_private.admission FROM PUBLIC;
-- No UPDATE/DELETE to issuer: revocation uses the bounded routine below.
GRANT INSERT(token_hash,login_role,authority_tenant_id,actor_id,change_set_id,request_hash,expires_at)
 ON entity_command_private.admission TO athyper_product_command_issuer;
CREATE FUNCTION entity_command_private.revoke(p_token_hash bytea) RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,entity_command_private
 AS $$ UPDATE entity_command_private.admission SET revoked=true WHERE token_hash=p_token_hash $$;
-- Consumption rolls back with the command transaction. If the process crashes
-- before separate revocation, the token remains reusable until expiry.
CREATE FUNCTION entity_command_private.enter(p_token text,p_request_hash text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,entity_command_private AS $$
DECLARE a entity_command_private.admission;
BEGIN
 IF pg_has_role(session_user,'athyper_product_command_issuer','MEMBER') OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'PRODUCT_COMMAND_ROLE_SEPARATION_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF length(p_token) <> 64 OR p_token !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'PRODUCT_COMMAND_ADMISSION_DENIED' USING ERRCODE='42501';
 END IF;
 UPDATE entity_command_private.admission SET transaction_id=pg_current_xact_id(),backend_pid=pg_backend_pid()
 WHERE token_hash=sha256(convert_to(p_token,'UTF8')) AND login_role=session_user
 AND request_hash=p_request_hash AND NOT revoked AND expires_at>clock_timestamp()
 AND transaction_id IS NULL
 AND actor_id::text=current_setting('app.current_principal_id',true)
 AND authority_tenant_id::text=current_setting('app.current_tenant_id',true)
 RETURNING * INTO a;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_COMMAND_ADMISSION_DENIED' USING ERRCODE='42501'; END IF;
END $$;
-- Scope enforcement only: admitted SQL is NOT compared with request_hash.
-- Exact command effects depend on the trusted canonical writer and audit path.
CREATE FUNCTION entity_command_private.admitted(p_change_set_id uuid) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,entity_command_private AS $$
 SELECT EXISTS(SELECT 1 FROM entity_command_private.admission
 WHERE transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid()
 AND login_role=session_user AND change_set_id=p_change_set_id AND NOT revoked
 AND expires_at>clock_timestamp()
 AND actor_id::text=current_setting('app.current_principal_id',true)
 AND authority_tenant_id::text=current_setting('app.current_tenant_id',true))
 $$;
REVOKE ALL ON FUNCTION entity_command_private.enter(text,text),entity_command_private.admitted(uuid),entity_command_private.revoke(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.enter(text,text),entity_command_private.admitted(uuid) TO athyper_product_command_app;
GRANT EXECUTE ON FUNCTION entity_command_private.revoke(bytea) TO athyper_product_command_issuer;
RESET ROLE;
-- Canonical read privileges and trusted issuer composition must be installed
-- separately after qualification. This transport confers no human review status.

-- Bounded label command write surface; no operation/protected-state, publication,
-- ownership, entity identity or review-state write grants.
GRANT USAGE ON SCHEMA metadata,snapshot,shared,master TO athyper_product_command_app;
GRANT SELECT ON metadata.entity_change_set,metadata.entity_label,metadata.entity_label_translation,
 metadata.entity_authoring_command_receipt,snapshot.entity_draft_save TO athyper_product_command_app;
GRANT UPDATE(lock_version,updated_by,default_locale,required_locales) ON metadata.entity_change_set TO athyper_product_command_app;
CREATE POLICY product_label_command_read ON metadata.entity_change_set FOR SELECT TO athyper_product_command_app
 USING(tenant_id IS NULL AND entity_command_private.admitted(id));
CREATE POLICY product_label_command_update ON metadata.entity_change_set FOR UPDATE TO athyper_product_command_app
 USING(tenant_id IS NULL AND entity_command_private.admitted(id) AND status IN ('draft','rejected'))
 WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(id) AND status IN ('draft','rejected') AND updated_by=master.current_principal_id_soft());
GRANT INSERT,UPDATE,DELETE ON metadata.entity_label,metadata.entity_label_translation TO athyper_product_command_app;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['entity_label','entity_label_translation'] LOOP
  EXECUTE format('CREATE POLICY product_label_command_read ON metadata.%I FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id))',t);
  EXECUTE format('CREATE POLICY product_label_command_insert ON metadata.%I FOR INSERT TO athyper_product_command_app WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(change_set_id) AND created_by=master.current_principal_id_soft())',t);
  EXECUTE format('CREATE POLICY product_label_command_update ON metadata.%I FOR UPDATE TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id)) WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(change_set_id) AND updated_by=master.current_principal_id_soft())',t);
  EXECUTE format('CREATE POLICY product_label_command_delete ON metadata.%I FOR DELETE TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id))',t);
 END LOOP;
END $$;
GRANT INSERT ON metadata.entity_authoring_command_receipt,snapshot.entity_draft_save TO athyper_product_command_app;
CREATE POLICY product_label_command_read ON metadata.entity_authoring_command_receipt FOR SELECT TO athyper_product_command_app
 USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
CREATE POLICY product_label_command_insert ON metadata.entity_authoring_command_receipt FOR INSERT TO athyper_product_command_app
 WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(change_set_id) AND actor_id=master.current_principal_id_soft());
CREATE POLICY product_label_command_read ON snapshot.entity_draft_save FOR SELECT TO athyper_product_command_app
 USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
CREATE POLICY product_label_command_insert ON snapshot.entity_draft_save FOR INSERT TO athyper_product_command_app
 WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(change_set_id) AND captured_by=master.current_principal_id_soft());
