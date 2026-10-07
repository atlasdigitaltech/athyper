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
-- Product source initialization only. Native cutover remains forbidden.
-- Applied through the explicit operational upgrade after command qualification.
DO $$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='metadata.entity_root_patch_keeps_revision(jsonb,jsonb)'::regprocedure)<>'efcad6f58610f611419eea284dfededc' THEN
  RAISE EXCEPTION 'OWNERSHIP_REVISION_PROTOCOL_UNKNOWN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='metadata.entity_change_set'::regclass AND conname='entity_change_set_native_pending_ck' AND convalidated
 AND pg_get_constraintdef(oid)='CHECK (((native_core_layout_version IS NULL) AND (source_kind IS NULL) AND (schema_version IS NULL) AND (authoring_schema_hash IS NULL) AND (entity_label_id IS NULL) AND (publication_resource_key IS NULL) AND (source_uri IS NULL) AND (source_hash IS NULL) AND (publication_owner IS NULL) AND (source_predecessor_release_id IS NULL)))') THEN
  RAISE EXCEPTION 'OWNERSHIP_PENDING_PREDECESSOR_UNKNOWN'; END IF;
END $$;
ALTER TABLE metadata.entity_change_set DROP CONSTRAINT entity_change_set_native_pending_ck;
ALTER TABLE metadata.entity_change_set ADD CONSTRAINT entity_change_set_native_pending_ck CHECK (
 native_core_layout_version IS NULL AND entity_label_id IS NULL AND publication_resource_key IS NULL AND source_uri IS NULL AND source_predecessor_release_id IS NULL
 AND ((source_kind IS NULL AND schema_version IS NULL AND authoring_schema_hash IS NULL AND source_hash IS NULL AND publication_owner IS NULL)
 OR ((source_kind='product' AND tenant_id IS NULL AND publication_owner='platform' AND schema_version>0 AND authoring_schema_hash ~ '^[a-f0-9]{64}$' AND source_hash ~ '^[a-f0-9]{64}$') IS TRUE))
);
-- Preserve the complete existing same-transaction provenance check. Only expand
-- the bounded root patch inventory; the trigger below owns one-time semantics.
DO $$ DECLARE definition_ text; BEGIN
 SELECT pg_get_functiondef('metadata.entity_root_patch_keeps_revision(jsonb,jsonb)'::regprocedure) INTO definition_;
 -- pg_get_functiondef preserves the SQL body formatting.
 IF position('''reference_contract_version'',''native_core_layout_version''' IN definition_)=0 THEN RAISE EXCEPTION 'OWNERSHIP_HELPER_LAYOUT_UNKNOWN'; END IF;
 definition_:=replace(definition_,'''reference_contract_version'',''native_core_layout_version''','''source_kind'',''publication_owner'',''schema_version'',''source_hash'',''reference_contract_version'',''native_core_layout_version''');
 EXECUTE definition_;
END $$;
CREATE FUNCTION metadata.guard_legacy_ownership_initialization() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata,snapshot AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.source_kind IS NOT NULL OR NEW.schema_version IS NOT NULL OR NEW.authoring_schema_hash IS NOT NULL OR NEW.publication_owner IS NOT NULL OR NEW.source_hash IS NOT NULL THEN
   RAISE EXCEPTION 'OWNERSHIP_EXPLICIT_COMMAND_REQUIRED' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.source_kind,NEW.schema_version,NEW.authoring_schema_hash,NEW.publication_owner,NEW.source_hash)
    IS NOT DISTINCT FROM ROW(OLD.source_kind,OLD.schema_version,OLD.authoring_schema_hash,OLD.publication_owner,OLD.source_hash) THEN RETURN NEW; END IF;
 IF OLD.source_kind IS NOT NULL OR OLD.schema_version IS NOT NULL OR OLD.authoring_schema_hash IS NOT NULL OR OLD.publication_owner IS NOT NULL OR OLD.source_hash IS NOT NULL THEN
  RAISE EXCEPTION 'OWNERSHIP_REPIN_FORBIDDEN' USING ERRCODE='23514'; END IF;
 IF NEW.tenant_id IS NOT NULL OR NEW.source_kind IS DISTINCT FROM 'product' OR NEW.publication_owner IS DISTINCT FROM 'platform'
   OR NEW.schema_version IS NULL OR NEW.schema_version<1 OR NEW.authoring_schema_hash IS NULL OR NEW.authoring_schema_hash !~ '^[a-f0-9]{64}$'
   OR NEW.source_hash IS NULL OR NEW.source_hash !~ '^[a-f0-9]{64}$'
   OR NEW.status NOT IN ('draft','rejected') OR NEW.lock_version<>OLD.lock_version
   OR NOT metadata.entity_root_patch_keeps_revision(to_jsonb(OLD),to_jsonb(NEW))
   OR NOT EXISTS(SELECT 1 FROM metadata.entity e WHERE e.id=NEW.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system')
   OR NOT EXISTS(SELECT 1 FROM snapshot.entity_draft_save s WHERE s.change_set_id=NEW.id AND s.tenant_id IS NULL AND s.lock_version=NEW.lock_version-1 AND s.graph_hash=NEW.source_hash)
 THEN RAISE EXCEPTION 'OWNERSHIP_SOURCE_OR_TRANSACTION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_entity_change_set_20_ownership BEFORE INSERT OR UPDATE ON metadata.entity_change_set
 FOR EACH ROW EXECUTE FUNCTION metadata.guard_legacy_ownership_initialization();

DO $$ DECLARE r record; h text; BEGIN
 FOR r IN SELECT * FROM ownership_original_rows LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.schema_name,r.table_name) INTO h;
  IF h IS DISTINCT FROM r.row_hash THEN RAISE EXCEPTION 'OWNERSHIP_PREPARATION_CHANGED_DATA: %.%',r.schema_name,r.table_name; END IF;
 END LOOP;
END $$;
COMMIT;
