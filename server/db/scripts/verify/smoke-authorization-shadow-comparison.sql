\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_plane text; v_policies integer; v_triggers integer;
BEGIN
    v_plane := current_setting('app.database_plane',true);
    IF v_plane NOT IN ('neon','mesh') THEN
        RAISE EXCEPTION 'P5-E2 shadow sink smoke requires Neon or Mesh; plane is %',coalesce(v_plane,'unset');
    END IF;
    IF to_regclass('ops.authorization_shadow_comparison') IS NULL
      OR to_regclass('ops.authorization_shadow_qualification_v') IS NULL
    THEN RAISE EXCEPTION 'P5-E2 persistent shadow evidence objects are missing'; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='ops' AND r.relname='authorization_shadow_comparison'
        AND r.relrowsecurity AND r.relforcerowsecurity)
    THEN RAISE EXCEPTION 'Shadow comparison must enable and force RLS'; END IF;

    SELECT count(*) INTO v_policies FROM pg_policies
     WHERE schemaname='ops' AND tablename='authorization_shadow_comparison';
    IF v_policies < 2 THEN RAISE EXCEPTION 'Expected app and compiler/admin shadow policies; found %',v_policies; END IF;

    SELECT count(*) INTO v_triggers FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace
     WHERE n.nspname='ops' AND r.relname='authorization_shadow_comparison' AND NOT t.tgisinternal;
    IF v_triggers <> 1 THEN RAISE EXCEPTION 'Expected one append-only guard trigger; found %',v_triggers; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='ops' AND table_name='authorization_shadow_comparison'
        AND column_name IN ('updated_at','updated_by','processed_at','retry_count'))
    THEN RAISE EXCEPTION 'Mutable worker state leaked into append-only comparison evidence'; END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
      IF NOT has_table_privilege('athyperapp','ops.authorization_shadow_comparison','INSERT')
        OR has_table_privilege('athyperapp','ops.authorization_shadow_comparison','UPDATE')
        OR has_table_privilege('athyperapp','ops.authorization_shadow_comparison','DELETE')
      THEN RAISE EXCEPTION 'athyperapp must have append-only shadow evidence access'; END IF;
    END IF;
END $$;
ROLLBACK;
\echo 'AUTHORIZATION_SHADOW_COMPARISON_SMOKE_OK planes=neon|mesh append_only=1 activation_default=off'
