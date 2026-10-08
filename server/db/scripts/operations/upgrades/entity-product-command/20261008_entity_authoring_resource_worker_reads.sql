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
-- Read inventory for publication-time human eligibility rechecks only.
-- No authoring, approval, IAM mutation, role membership or RLS bypass is granted.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_publication_service' AND NOT rolsuper AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'RESOURCE_PUBLICATION_ROLE_PREFLIGHT_FAILED';
 END IF;
END $$;
GRANT USAGE ON SCHEMA authz,master,control,runtime_meta,publication TO athyper_publication_service;
GRANT SELECT ON authz.delegation,
authz.delegation_grant,
authz.deny_rule,
authz.entity_operation_binding,
authz.entity_operation_scope_binding,
authz.group_member,
authz.group_role,
authz.override,
authz.permission,
authz.permission_scope_kind,
authz.plane_membership,
authz.principal_group,
authz.record_acl,
authz.role,
authz.role_permission,
authz.scope_target,
control.module,
master.principal,
master.tenant,
runtime_meta.entity_contract,
runtime_meta.entity_descriptor,
runtime_meta.release_activation_head,
master.principal_identity_binding TO athyper_publication_service;
GRANT EXECUTE ON FUNCTION publication.read_authoring_resource_review(uuid),
 publication.read_authoring_resource_history(uuid,uuid),
 publication.read_authoring_resource_current_source(uuid,uuid) TO athyper_publication_service;
DO $$ DECLARE r record; h text; BEGIN
 FOR r IN SELECT * FROM ownership_original_rows LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.schema_name,r.table_name) INTO h;
  IF h IS DISTINCT FROM r.row_hash THEN RAISE EXCEPTION 'OWNERSHIP_PREPARATION_CHANGED_DATA: %.%',r.schema_name,r.table_name; END IF;
 END LOOP;
END $$;
COMMIT;
