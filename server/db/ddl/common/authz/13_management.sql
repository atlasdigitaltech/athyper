-- Transaction-bound authorization management persistence. Existing authority guards remain in force.
ALTER TABLE authz.scope_target ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.role ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.role_permission ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.principal_group ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.group_member ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.group_role ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.deny_rule ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.delegation ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.delegation_grant ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.override ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.record_acl ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE authz.trusted_device ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE FUNCTION authz.trg_management_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.version:=1; ELSE NEW.version:=OLD.version+1; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.scope_target FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.role FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.role_permission FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.principal_group FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.group_member FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.group_role FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.deny_rule FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.delegation FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.delegation_grant FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.override FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.record_acl FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();
CREATE TRIGGER zz_management_version BEFORE INSERT OR UPDATE ON authz.trusted_device FOR EACH ROW EXECUTE FUNCTION authz.trg_management_version();

CREATE TABLE authz.management_receipt (
 tenant_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(btrim(idempotency_key)<>''),
 command_id text NOT NULL, principal_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 resource_id uuid NOT NULL, resource_version integer NOT NULL CHECK(resource_version>0),
 mutation_kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,idempotency_key), UNIQUE(tenant_id,command_id)
);
ALTER TABLE authz.management_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE authz.management_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_receipt ON authz.management_receipt USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
CREATE FUNCTION authz.trg_management_receipt_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Authorization receipts are immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER management_receipt_immutable BEFORE UPDATE OR DELETE ON authz.management_receipt FOR EACH ROW EXECUTE FUNCTION authz.trg_management_receipt_immutable();
REVOKE ALL ON authz.management_receipt FROM PUBLIC;
REVOKE ALL ON FUNCTION authz.trg_management_version(),authz.trg_management_receipt_immutable() FROM PUBLIC;


DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_authorization_writer') THEN CREATE ROLE athyper_authorization_writer NOLOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA authz TO athyper_authorization_writer;
GRANT SELECT,INSERT ON authz.management_receipt TO athyper_authorization_writer;
GRANT SELECT,INSERT,UPDATE ON authz.scope_target TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.scope_target FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON authz.role TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.role FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON authz.role_permission TO athyper_authorization_writer;
GRANT DELETE ON authz.role_permission TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.role_permission FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON authz.principal_group TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.principal_group FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON authz.group_member TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.group_member FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON authz.group_role TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.group_role FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON authz.deny_rule TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.deny_rule FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON authz.delegation TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.delegation FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON authz.delegation_grant TO athyper_authorization_writer;
GRANT DELETE ON authz.delegation_grant TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.delegation_grant FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON authz.override TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.override FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON authz.record_acl TO athyper_authorization_writer;
CREATE POLICY management_write ON authz.record_acl FOR ALL TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,UPDATE ON authz.trusted_device TO athyper_authorization_writer;
CREATE POLICY management_device_read ON authz.trusted_device FOR SELECT TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY management_device_revoke ON authz.trusted_device FOR UPDATE TO athyper_authorization_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft() AND revoked_at IS NOT NULL);

INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,
 allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('authorization_management','^authorization\.management\.(success|rejected)$',10,
 ARRAY['execute']::audit.operation_d[],'info',ARRAY['user','service_account','system']::audit.actor_type_d[],
 'tenant',false,'safe_values',65536,1,'{"owner":"control-admin","payload":"receipt_and_governance_only"}'::jsonb,'active')
ON CONFLICT(code) DO NOTHING;

-- These trigger-only validators read private scope helpers and sibling authority
-- rows. They expose no callable cross-tenant lookup; source-table RLS still gates
-- the write. Keep their fixed search paths and do not grant private helpers.
ALTER FUNCTION authz.trg_validate_group_role() SECURITY DEFINER;
ALTER FUNCTION authz.trg_validate_group_role() SET search_path=pg_catalog,authz,master;
ALTER FUNCTION authz.trg_validate_scoped_authority() SECURITY DEFINER;
ALTER FUNCTION authz.trg_validate_scoped_authority() SET search_path=pg_catalog,authz,master;
ALTER FUNCTION authz.trg_validate_delegation_activation() SECURITY DEFINER;
ALTER FUNCTION authz.trg_validate_delegation_activation() SET search_path=pg_catalog,authz,master;
REVOKE EXECUTE ON FUNCTION authz.trg_validate_group_role(),authz.trg_validate_scoped_authority(),authz.trg_validate_delegation_activation() FROM PUBLIC;
