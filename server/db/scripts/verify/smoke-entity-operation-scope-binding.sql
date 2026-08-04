\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_policies integer; v_triggers integer; v_plane text;
BEGIN
    v_plane := current_setting('app.database_plane', true);
    IF v_plane NOT IN ('neon','mesh') THEN
        RAISE EXCEPTION 'Scope-binding smoke must run in Neon or Mesh; plane is %', coalesce(v_plane,'unset');
    END IF;
    IF to_regclass('authz.entity_operation_scope_binding') IS NULL
    THEN RAISE EXCEPTION 'Missing authz.entity_operation_scope_binding'; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='authz' AND r.relname='entity_operation_scope_binding'
        AND r.relrowsecurity AND r.relforcerowsecurity)
    THEN RAISE EXCEPTION 'Operation-scope binding must enable and force RLS'; END IF;

    SELECT count(*) INTO v_policies FROM pg_policies
     WHERE schemaname='authz' AND tablename='entity_operation_scope_binding';
    IF v_policies < 2 THEN RAISE EXCEPTION 'Expected published-read and compiler/admin write policies; found %', v_policies; END IF;

    SELECT count(*) INTO v_triggers FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
     WHERE n.nspname='authz' AND r.relname='entity_operation_scope_binding' AND NOT t.tgisinternal;
    IF v_triggers <> 6 THEN RAISE EXCEPTION 'Expected 5 binding lifecycle triggers plus authorization invalidation capture; found %', v_triggers; END IF;
    IF EXISTS (
      SELECT expected.name FROM unnest(ARRAY[
        'entity_operation_scope_binding_10_normalize',
        'entity_operation_scope_binding_20_guard',
        'entity_operation_scope_binding_30_validate',
        'entity_operation_scope_binding_60_updated_at',
        'entity_operation_scope_binding_90_delete_guard',
        'trg_authorization_invalidation_capture'
      ]) expected(name)
      WHERE NOT EXISTS (SELECT 1 FROM pg_trigger trigger_row
        WHERE trigger_row.tgrelid='authz.entity_operation_scope_binding'::regclass
          AND trigger_row.tgname=expected.name AND NOT trigger_row.tgisinternal)
    ) THEN RAISE EXCEPTION 'Operation-scope binding trigger set is incomplete'; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='authz' AND r.relname='entity_operation_scope_binding'
        AND c.conname='entity_operation_scope_binding_fail_closed_chk'
        AND pg_get_constraintdef(c.oid) LIKE '%missing_value_behavior%deny%')
    THEN RAISE EXCEPTION 'Missing-value behavior is not sealed to deny'; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='authz'
      AND table_name='entity_operation_scope_binding'
      AND column_name IN ('principal_id','group_id','role_id','scope_target_id','expression_sql','expression_json'))
    THEN RAISE EXCEPTION 'Grant ownership or executable expressions leaked into operation-scope binding'; END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
      IF NOT has_table_privilege('athyperapp','authz.entity_operation_scope_binding','SELECT')
        OR has_table_privilege('athyperapp','authz.entity_operation_scope_binding','INSERT')
        OR has_table_privilege('athyperapp','authz.entity_operation_scope_binding','UPDATE')
        OR has_table_privilege('athyperapp','authz.entity_operation_scope_binding','DELETE')
      THEN RAISE EXCEPTION 'athyperapp must have SELECT-only binding access'; END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='authz' AND p.proname LIKE '%entity_operation_scope_binding%'
        AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%'))
    THEN RAISE EXCEPTION 'Every operation-scope binding function must fix search_path'; END IF;
END $$;
ROLLBACK;
\echo 'ENTITY_OPERATION_SCOPE_BINDING_SMOKE_OK planes=neon|mesh app_dml=0 missing=deny'
