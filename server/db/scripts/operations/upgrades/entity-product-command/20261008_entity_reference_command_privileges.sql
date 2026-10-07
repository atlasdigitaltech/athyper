BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE ownership_original_rows(schema_name text,table_name text,row_hash text) ON COMMIT DROP;
DO $$ DECLARE r record; h text; BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'STUDIO_REQUIRED'; END IF;
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('metadata','snapshot') AND c.relkind='r' ORDER BY n.nspname,c.relname LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.nspname,r.relname) INTO h;
  INSERT INTO ownership_original_rows VALUES(r.nspname,r.relname,h);
 END LOOP;
END $$;
-- Restricted extension of the already installed product-command role.
-- Admission remains transaction/actor/draft bound; exact SQL effects trust the
-- canonical writer. No initializer, native cutover, publication or review DML.
DO $$ DECLARE t regclass; BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_product_command_app' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole)
 OR pg_has_role('athyper_product_command_app','athyper_product_command_issuer','MEMBER')
 OR pg_has_role('athyper_product_command_app','athyper_product_command_owner','MEMBER') THEN
  RAISE EXCEPTION 'REFERENCE_COMMAND_ROLE_UNSAFE'; END IF;
 FOREACH t IN ARRAY ARRAY['metadata.entity_change_set'::regclass,'metadata.entity_field'::regclass,'metadata.entity_field_identity'::regclass,'metadata.entity_release'::regclass,'snapshot.entity_contract_revision'::regclass] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=t AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'REFERENCE_COMMAND_FORCED_RLS_REQUIRED: %',t; END IF;
 END LOOP;
END $$;
GRANT UPDATE(source_kind,publication_owner,schema_version,authoring_schema_hash,source_hash,reference_contract_version) ON metadata.entity_change_set TO athyper_product_command_app;
GRANT UPDATE(field_identity_id,updated_by,updated_at) ON metadata.entity_field TO athyper_product_command_app;
CREATE POLICY reference_command_field_update ON metadata.entity_field FOR UPDATE TO athyper_product_command_app
 USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id))
 WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(change_set_id) AND updated_by=master.current_principal_id_soft());
CREATE POLICY reference_command_field_fence ON metadata.entity_field AS RESTRICTIVE FOR UPDATE TO athyper_product_command_app
 USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id))
 WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(change_set_id) AND updated_by=master.current_principal_id_soft());
GRANT SELECT ON metadata.entity_field_identity,metadata.entity_release,snapshot.entity_contract_revision TO athyper_product_command_app;
GRANT INSERT(entity_id,tenant_id,field_key,identity_status,introduced_change_set_id,created_by) ON metadata.entity_field_identity TO athyper_product_command_app;
CREATE POLICY reference_command_identity_insert ON metadata.entity_field_identity FOR INSERT TO athyper_product_command_app
 WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(introduced_change_set_id) AND identity_status='reserved' AND created_by=master.current_principal_id_soft());
CREATE POLICY reference_command_identity_insert_fence ON metadata.entity_field_identity AS RESTRICTIVE FOR INSERT TO athyper_product_command_app
 WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(introduced_change_set_id) AND identity_status='reserved' AND created_by=master.current_principal_id_soft());
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['entity_field_identity','entity_release'] LOOP
  EXECUTE format('CREATE POLICY reference_command_read ON metadata.%I FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.entity_id=%I.entity_id AND c.tenant_id IS NULL AND entity_command_private.admitted(c.id)))',t,t);
  EXECUTE format('CREATE POLICY reference_command_read_fence ON metadata.%I AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.entity_id=%I.entity_id AND c.tenant_id IS NULL AND entity_command_private.admitted(c.id)))',t,t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['entity_target','entity_field_choice','entity_surface_navigation_group','entity_surface_view','entity_surface_view_field','entity_access_permission','entity_operation_field','entity_authorization_profile','entity_field_access','entity_predicate'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('metadata.'||t)::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'REFERENCE_COMMAND_FORCED_RLS_REQUIRED: %',t; END IF;
  EXECUTE format('GRANT SELECT ON metadata.%I TO athyper_product_command_app',t);
  EXECUTE format('CREATE POLICY reference_command_read ON metadata.%I FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id))',t);
  EXECUTE format('CREATE POLICY reference_command_read_fence ON metadata.%I AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id))',t);
 END LOOP;
END $$;
CREATE POLICY reference_command_snapshot_read ON snapshot.entity_contract_revision FOR SELECT TO athyper_product_command_app
 USING(tenant_id IS NULL AND EXISTS(SELECT 1 FROM metadata.entity_release r WHERE r.revision_id=entity_contract_revision.id AND r.entity_id=entity_contract_revision.entity_id AND r.tenant_id IS NULL));
CREATE POLICY reference_command_snapshot_fence ON snapshot.entity_contract_revision AS RESTRICTIVE FOR SELECT TO athyper_product_command_app
 USING(tenant_id IS NULL AND EXISTS(SELECT 1 FROM metadata.entity_release r WHERE r.revision_id=entity_contract_revision.id AND r.entity_id=entity_contract_revision.entity_id AND r.tenant_id IS NULL));
GRANT EXECUTE ON FUNCTION snapshot.fn_compute_entity_contract_hash(jsonb),metadata.validate_reference_members(uuid) TO athyper_product_command_app;

DO $$ DECLARE r record; h text; BEGIN
 FOR r IN SELECT * FROM ownership_original_rows LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.schema_name,r.table_name) INTO h;
  IF h IS DISTINCT FROM r.row_hash THEN RAISE EXCEPTION 'OWNERSHIP_PREPARATION_CHANGED_DATA: %.%',r.schema_name,r.table_name; END IF;
 END LOOP;
END $$;
COMMIT;
