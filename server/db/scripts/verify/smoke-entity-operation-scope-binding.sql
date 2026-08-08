\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_plane text:=current_setting('app.database_plane',true);
BEGIN
  IF v_plane NOT IN ('athyper','neon','mesh') THEN
    RAISE EXCEPTION 'Operation binding smoke requires an explicit database plane; got %',coalesce(v_plane,'unset');
  END IF;
  IF to_regclass('authz.entity_operation_binding') IS NULL
     OR to_regclass('authz.entity_operation_scope_binding') IS NULL THEN
    RAISE EXCEPTION 'Normalized operation binding tables are missing';
  END IF;
  IF EXISTS(SELECT 1 FROM (VALUES('entity_operation_binding'),('entity_operation_scope_binding')) expected(name)
    WHERE NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='authz' AND c.relname=expected.name AND c.relrowsecurity AND c.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'Operation binding tables must enable and force RLS';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='authz.entity_operation_scope_binding'::regclass
      AND conname='entity_operation_scope_binding_operation_fk') THEN
    RAISE EXCEPTION 'Scope table is not a child of entity_operation_binding';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='authz'
      AND table_name='entity_operation_scope_binding'
      AND column_name IN ('permission_id','plane_code','source_entity_id','source_entity_operation_id',
        'source_release_hash','source_compiled_hash','entity_code','operation_key','decision_mode','status')) THEN
    RAISE EXCEPTION 'Operation identity or lifecycle remains duplicated in scope rows';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='authz'
      AND table_name IN ('entity_operation_binding','entity_operation_scope_binding')
      AND column_name IN ('principal_id','group_id','role_id','scope_target_id','expression_sql','expression_json')) THEN
    RAISE EXCEPTION 'Plane-local grant authority or executable expressions leaked into compiler projection';
  END IF;
  IF EXISTS(SELECT expected.name FROM unnest(ARRAY[
      'entity_operation_binding_10_normalize','entity_operation_binding_20_guard',
      'entity_operation_binding_30_validate','entity_operation_binding_90_delete_guard',
      'entity_operation_scope_binding_10_normalize','entity_operation_scope_binding_20_guard'
    ]) expected(name) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t
      WHERE t.tgname=expected.name AND NOT t.tgisinternal)) THEN
    RAISE EXCEPTION 'Operation projection immutable trigger set is incomplete';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') AND (
      NOT has_table_privilege('athyperapp','authz.entity_operation_binding','SELECT')
      OR NOT has_table_privilege('athyperapp','authz.entity_operation_scope_binding','SELECT')
      OR has_table_privilege('athyperapp','authz.entity_operation_binding','INSERT')
      OR has_table_privilege('athyperapp','authz.entity_operation_scope_binding','UPDATE')) THEN
    RAISE EXCEPTION 'Application runtime must have SELECT-only projection access';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='authz' AND (p.proname LIKE '%entity_operation_binding%' OR p.proname LIKE '%entity_operation_projection%')
      AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%')) THEN
    RAISE EXCEPTION 'Every operation projection function must fix search_path';
  END IF;
END $$;
ROLLBACK;
\echo 'ENTITY_OPERATION_BINDING_SMOKE_OK planes=athyper|neon|mesh authority=plane-local projection=immutable'
