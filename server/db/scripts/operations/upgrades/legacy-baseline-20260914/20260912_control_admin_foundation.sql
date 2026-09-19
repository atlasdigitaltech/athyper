-- Upgrade the retained pre-administration baseline before lookup governance.
-- Snapshot of canonical control/14_admin_integrations.sql; preserves business rows.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $upgrade$
BEGIN
 IF to_regclass('control.lookup_revision') IS NOT NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='control' AND table_name='lookup_domain' AND column_name='version') THEN
   RAISE EXCEPTION 'partial control administration foundation requires review';
 END IF;
 EXECUTE $definition$
-- Control administration persistence, shared by fresh installs and migrations.
ALTER TABLE control.connector_instance ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE control.bank_account_validation_rule ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE control.lookup_domain ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE control.rounding_rule ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);

CREATE FUNCTION control.trg_admin_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF TG_OP='INSERT' THEN NEW.version:=1; ELSE NEW.version:=OLD.version+1; END IF; RETURN NEW; END $$;
CREATE TRIGGER zz_admin_version BEFORE INSERT OR UPDATE ON control.connector_instance FOR EACH ROW EXECUTE FUNCTION control.trg_admin_version();
CREATE TRIGGER zz_admin_version BEFORE INSERT OR UPDATE ON control.bank_account_validation_rule FOR EACH ROW EXECUTE FUNCTION control.trg_admin_version();
CREATE TRIGGER zz_admin_version BEFORE INSERT OR UPDATE ON control.lookup_domain FOR EACH ROW EXECUTE FUNCTION control.trg_admin_version();

ALTER TABLE control.bank_account_validation_rule ADD COLUMN test_fixtures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(test_fixtures)='array');
ALTER TABLE control.rounding_rule ADD COLUMN configured_contexts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(configured_contexts)='array');
-- Schema-only backfill preserves existing actor and timestamp evidence.
ALTER TABLE control.rounding_rule DISABLE TRIGGER trg_rounding_rule_90_updated;
UPDATE control.rounding_rule r SET configured_contexts=coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('companyCodeId',c.company_code_id,'currencyCode',c.currency_code,'slot',c.slot))) FROM control.rounding_context c WHERE c.tenant_id=r.tenant_id AND c.rounding_rule_id=r.id),'[]'::jsonb);
ALTER TABLE control.rounding_rule ENABLE TRIGGER trg_rounding_rule_90_updated;
CREATE TRIGGER zz_admin_version BEFORE INSERT OR UPDATE ON control.rounding_rule FOR EACH ROW EXECUTE FUNCTION control.trg_admin_version();
ALTER TABLE control.lookup_domain ADD COLUMN source_revision integer NOT NULL DEFAULT 0 CHECK(source_revision>=0);
CREATE TABLE control.lookup_revision(domain_code text NOT NULL REFERENCES control.lookup_domain(code),version integer NOT NULL CHECK(version>0),definition jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(domain_code,version));
CREATE TABLE control.lookup_tenant_revision(tenant_id uuid NOT NULL,domain_code text NOT NULL REFERENCES control.lookup_domain(code),version integer NOT NULL CHECK(version>0),values_json jsonb NOT NULL,PRIMARY KEY(tenant_id,domain_code,version));
CREATE TABLE control.lookup_publication_receipt(desired_state_id text PRIMARY KEY,fingerprint text NOT NULL,domain_code text NOT NULL,version integer NOT NULL,FOREIGN KEY(domain_code,version) REFERENCES control.lookup_revision(domain_code,version));
-- Explicit references for consumers whose values are stored in document/JSON fields.
CREATE TABLE control.lookup_value_reference(tenant_id uuid NOT NULL,value_id uuid NOT NULL REFERENCES control.lookup_value(id) ON DELETE RESTRICT,owner_type text NOT NULL,owner_id uuid NOT NULL,PRIMARY KEY(tenant_id,value_id,owner_type,owner_id));
CREATE FUNCTION control.trg_lookup_reference_active() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM control.lookup_value WHERE id=NEW.value_id AND (tenant_id IS NULL OR tenant_id=NEW.tenant_id) AND status='active' FOR SHARE) THEN RAISE EXCEPTION 'Lookup value is inactive or foreign' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER lookup_reference_active BEFORE INSERT OR UPDATE ON control.lookup_value_reference FOR EACH ROW EXECUTE FUNCTION control.trg_lookup_reference_active();
CREATE FUNCTION control.trg_lookup_history_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Lookup history is immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON control.lookup_revision FOR EACH ROW EXECUTE FUNCTION control.trg_lookup_history_immutable();
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON control.lookup_tenant_revision FOR EACH ROW EXECUTE FUNCTION control.trg_lookup_history_immutable();
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON control.lookup_publication_receipt FOR EACH ROW EXECUTE FUNCTION control.trg_lookup_history_immutable();

INSERT INTO control.lookup_revision(domain_code,version,definition)
 SELECT d.code,d.version,jsonb_build_object('id',d.id,'code',d.code,'name',d.name,'sourceSchema',d.source_schema,'extensible',d.is_extensible,'status',CASE WHEN d.status='active' THEN 'active' ELSE 'retired' END,'values',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,'name',v.name,'sortOrder',v.sort_order,'metadata',v.metadata,'status',CASE WHEN v.status='active' THEN 'active' ELSE 'retired' END)) FROM control.lookup_value v WHERE v.domain_code=d.code AND v.tenant_id IS NULL),'[]'::jsonb)) FROM control.lookup_domain d;
INSERT INTO control.lookup_tenant_revision(tenant_id,domain_code,version,values_json)
 SELECT v.tenant_id,v.domain_code,d.version,jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,'name',v.name,'tenantId',v.tenant_id,'sortOrder',v.sort_order,'metadata',v.metadata,'status',CASE WHEN v.status='active' THEN 'active' ELSE 'retired' END)) FROM control.lookup_value v JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NOT NULL GROUP BY v.tenant_id,v.domain_code,d.version;
ALTER TABLE control.lookup_revision ENABLE ROW LEVEL SECURITY; ALTER TABLE control.lookup_revision FORCE ROW LEVEL SECURITY; CREATE POLICY catalog_read ON control.lookup_revision FOR SELECT USING(true);
ALTER TABLE control.lookup_publication_receipt ENABLE ROW LEVEL SECURITY; ALTER TABLE control.lookup_publication_receipt FORCE ROW LEVEL SECURITY; CREATE POLICY catalog_read ON control.lookup_publication_receipt FOR SELECT USING(true);
ALTER TABLE control.lookup_tenant_revision ENABLE ROW LEVEL SECURITY; ALTER TABLE control.lookup_tenant_revision FORCE ROW LEVEL SECURITY; CREATE POLICY tenant_scope ON control.lookup_tenant_revision USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
ALTER TABLE control.lookup_value_reference ENABLE ROW LEVEL SECURITY; ALTER TABLE control.lookup_value_reference FORCE ROW LEVEL SECURITY; CREATE POLICY tenant_scope ON control.lookup_value_reference USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_writer') THEN CREATE ROLE athyper_control_writer NOLOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA control TO athyper_control_writer;
GRANT SELECT,INSERT ON control.lookup_revision,control.lookup_tenant_revision,control.lookup_publication_receipt TO athyper_control_writer;
GRANT SELECT,INSERT,DELETE ON control.lookup_value_reference TO athyper_control_writer;
CREATE POLICY catalog_write ON control.lookup_revision FOR INSERT TO athyper_control_writer WITH CHECK(true);
CREATE POLICY catalog_write ON control.lookup_publication_receipt FOR INSERT TO athyper_control_writer WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON control.connector_instance TO athyper_control_writer; CREATE POLICY admin_tenant_write ON control.connector_instance FOR ALL TO athyper_control_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE,DELETE ON control.integration_endpoint TO athyper_control_writer; CREATE POLICY admin_tenant_write ON control.integration_endpoint FOR ALL TO athyper_control_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE,DELETE ON control.rounding_rule TO athyper_control_writer; CREATE POLICY admin_tenant_write ON control.rounding_rule FOR ALL TO athyper_control_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE,DELETE ON control.rounding_context TO athyper_control_writer; CREATE POLICY admin_tenant_write ON control.rounding_context FOR ALL TO athyper_control_writer USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON control.lookup_domain TO athyper_control_writer; CREATE POLICY admin_catalog_write ON control.lookup_domain FOR ALL TO athyper_control_writer USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON control.bank_account_validation_rule TO athyper_control_writer; CREATE POLICY admin_catalog_write ON control.bank_account_validation_rule FOR ALL TO athyper_control_writer USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON control.lookup_value TO athyper_control_writer;
CREATE POLICY admin_lookup_write ON control.lookup_value FOR ALL TO athyper_control_writer USING(tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
GRANT SELECT ON control.lookup_revision,control.lookup_tenant_revision TO athyperapp;
GRANT SELECT,INSERT,DELETE ON control.lookup_value_reference TO athyperapp;
INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('control_repository_integrations','^control\.(bank_validation|connectors|lookups|rounding)\.(saved|published|retired|transitioned|health_requested)$',10,ARRAY['update']::audit.operation_d[],'info',ARRAY['user','system','service_account']::audit.actor_type_d[],'tenant',false,'safe_values',65536,1,'{"owner":"control-admin"}'::jsonb,'active') ON CONFLICT(code) DO NOTHING;
REVOKE ALL ON FUNCTION control.trg_admin_version(),control.trg_lookup_reference_active(),control.trg_lookup_history_immutable() FROM PUBLIC;

-- Reference checks run as the DDL owner so a global value cannot be retired
-- while another tenant still references it. Only a boolean is exposed.
CREATE FUNCTION control.admin_lookup_value_referenced(p_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control,shared AS $$
DECLARE v control.lookup_value; fk record; used boolean;
BEGIN
 SELECT * INTO v FROM control.lookup_value WHERE id=p_id;
 IF NOT FOUND OR (v.tenant_id IS NOT NULL AND v.tenant_id IS DISTINCT FROM shared.current_tenant_id_soft()) THEN RETURN true; END IF;
 FOR fk IN SELECT n.nspname,t.relname,a.attname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1] WHERE c.contype='f' AND c.confrelid='control.lookup_value'::regclass AND cardinality(c.conkey)=1 LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',fk.nspname,fk.relname,fk.attname) INTO used USING p_id;
  IF used THEN RETURN true; END IF;
 END LOOP;
 IF v.domain_code='governance.cycle_domain' AND EXISTS(SELECT 1 FROM control.cycle_type WHERE domain_code=v.code AND (v.tenant_id IS NULL OR tenant_id=v.tenant_id)) THEN RETURN true; END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION control.admin_lookup_value_referenced(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.admin_lookup_value_referenced(uuid) TO athyperapp,athyper_control_writer;
CREATE FUNCTION control.trg_rounding_context_definition_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF OLD.status<>'draft' AND NEW.configured_contexts IS DISTINCT FROM OLD.configured_contexts THEN RAISE EXCEPTION 'Activated rounding contexts are immutable' USING ERRCODE='23514'; END IF;RETURN NEW;END $$;
CREATE TRIGGER rounding_context_definition_immutable BEFORE UPDATE ON control.rounding_rule FOR EACH ROW EXECUTE FUNCTION control.trg_rounding_context_definition_immutable();
REVOKE ALL ON FUNCTION control.trg_rounding_context_definition_immutable() FROM PUBLIC;

ALTER TABLE control.integration_endpoint DROP CONSTRAINT integration_endpoint_code_chk;
ALTER TABLE control.integration_endpoint ADD CONSTRAINT integration_endpoint_code_chk CHECK(code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$');
CREATE TABLE control.connector_health_job(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,connector_id uuid NOT NULL,requested_by uuid NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed')),lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,result_code text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,FOREIGN KEY(tenant_id,connector_id) REFERENCES control.connector_instance(tenant_id,id));
ALTER TABLE control.connector_health_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.connector_health_job FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON control.connector_health_job USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
GRANT SELECT,INSERT,UPDATE ON control.connector_health_job TO athyper_control_writer;
CREATE FUNCTION control.claim_connector_health_job() RETURNS SETOF control.connector_health_job LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,control AS $$
 UPDATE control.connector_health_job SET status='running',attempts=attempts+1,lease_until=clock_timestamp()+interval '2 minutes'
 WHERE id=(SELECT id FROM control.connector_health_job WHERE status='pending' OR (status='running' AND lease_until<clock_timestamp()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
$$;
REVOKE ALL ON FUNCTION control.claim_connector_health_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.claim_connector_health_job() TO athyper_control_writer;

GRANT EXECUTE ON FUNCTION control.jsonb_has_secret_shaped_key(jsonb) TO athyper_control_writer;

-- Native tenant extension writes also advance revision history. This prevents
-- a historical read from reconstructing an older version using current values.
CREATE FUNCTION control.trg_capture_lookup_extension() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control AS $$
DECLARE v_tenant uuid;v_code text;v_actor uuid;v_version integer;
BEGIN
 IF TG_OP='DELETE' THEN v_tenant:=OLD.tenant_id;v_code:=OLD.domain_code;v_actor:=OLD.created_by;
 ELSE v_tenant:=NEW.tenant_id;v_code:=NEW.domain_code;v_actor:=coalesce(NEW.updated_by,NEW.created_by);END IF;
 IF v_tenant IS NULL THEN RETURN NULL;END IF;
 UPDATE control.lookup_domain SET updated_by=v_actor WHERE code=v_code RETURNING version INTO v_version;
 INSERT INTO control.lookup_revision(domain_code,version,definition)
 SELECT d.code,d.version,jsonb_build_object('id',d.id,'code',d.code,'name',d.name,'sourceSchema',d.source_schema,'extensible',d.is_extensible,'status',CASE WHEN d.status='active' THEN 'active' ELSE 'retired' END,'values',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,'name',v.name,'sortOrder',v.sort_order,'metadata',v.metadata,'status',CASE WHEN v.status='active' THEN 'active' ELSE 'retired' END)) FROM control.lookup_value v WHERE v.domain_code=d.code AND v.tenant_id IS NULL),'[]'::jsonb)) FROM control.lookup_domain d WHERE d.code=v_code;
 INSERT INTO control.lookup_tenant_revision(tenant_id,domain_code,version,values_json)
 SELECT v_tenant,v_code,v_version,coalesce(jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,'name',v.name,'tenantId',v.tenant_id,'sortOrder',v.sort_order,'metadata',v.metadata,'status',CASE WHEN v.status='active' THEN 'active' ELSE 'retired' END)),'[]'::jsonb) FROM control.lookup_value v WHERE v.tenant_id=v_tenant AND v.domain_code=v_code;
 RETURN NULL;
END $$;
CREATE TRIGGER lookup_extension_history AFTER INSERT OR UPDATE OR DELETE ON control.lookup_value FOR EACH ROW EXECUTE FUNCTION control.trg_capture_lookup_extension();
REVOKE ALL ON FUNCTION control.trg_capture_lookup_extension() FROM PUBLIC;
CREATE FUNCTION control.trg_lock_cycle_domain_reference() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control AS $$
BEGIN
 PERFORM 1 FROM control.lookup_value WHERE domain_code='governance.cycle_domain' AND code=NEW.domain_code AND (tenant_id IS NULL OR tenant_id=NEW.tenant_id) FOR SHARE;
 RETURN NEW;
END $$;
CREATE TRIGGER cycle_domain_reference_lock BEFORE INSERT OR UPDATE OF domain_code ON control.cycle_type FOR EACH ROW EXECUTE FUNCTION control.trg_lock_cycle_domain_reference();
REVOKE ALL ON FUNCTION control.trg_lock_cycle_domain_reference() FROM PUBLIC;

ALTER FUNCTION control.trg_lookup_reference_active() SECURITY DEFINER;

$definition$;
END;
$upgrade$;
COMMIT;
