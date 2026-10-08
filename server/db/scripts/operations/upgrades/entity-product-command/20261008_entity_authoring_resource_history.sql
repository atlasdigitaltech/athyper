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
-- Exact product draft history for authenticated review qualification only.
CREATE FUNCTION publication.read_authoring_resource_history(p_draft uuid,p_entity uuid)
RETURNS TABLE("releaseId" uuid,graph jsonb,integrity boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM master.principal p JOIN master.principal_identity_binding b ON b.principal_id=p.id AND b.tenant_id=p.tenant_id WHERE p.id=master.current_principal_id_soft() AND p.tenant_id=shared.current_tenant_id_soft() AND p.status='active' AND p.principal_type='user' AND b.status='active' AND b.realm_key='platform-control' AND b.service_client_id IS NULL)
 OR NOT EXISTS(SELECT 1 FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id WHERE c.id=p_draft AND c.entity_id=p_entity AND c.tenant_id IS NULL AND e.tenant_id IS NULL AND e.ownership_model='system') THEN RAISE EXCEPTION 'RESOURCE_HISTORY_SCOPE_DENIED'; END IF;
 RETURN QUERY SELECT r.id,v.contract_json,coalesce(v.validation_status='valid' AND v.contract_hash=r.contract_hash AND v.contract_hash=snapshot.fn_compute_entity_contract_hash(v.contract_json),false)
 FROM metadata.entity_release r LEFT JOIN snapshot.entity_contract_revision v ON v.id=r.revision_id AND v.entity_id=r.entity_id AND v.tenant_id IS NOT DISTINCT FROM r.tenant_id
 WHERE r.entity_id=p_entity AND r.tenant_id IS NULL ORDER BY r.id LIMIT 1001;
END $$;
REVOKE ALL ON FUNCTION publication.read_authoring_resource_history(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_authoring_resource_history(uuid,uuid) TO athyper_control_api;

DO $$ DECLARE r record; h text; BEGIN
 FOR r IN SELECT * FROM ownership_original_rows LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.schema_name,r.table_name) INTO h;
  IF h IS DISTINCT FROM r.row_hash THEN RAISE EXCEPTION 'OWNERSHIP_PREPARATION_CHANGED_DATA: %.%',r.schema_name,r.table_name; END IF;
 END LOOP;
END $$;
COMMIT;
