\set ON_ERROR_STOP on
BEGIN;
DO $p5e2_permission_pilot_smoke$
DECLARE
    v_plane text := current_setting('app.database_plane', true);
    v_expected_prefix text;
    v_expected_scope authz.scope_kind_d;
    v_count integer;
BEGIN
    IF v_plane = 'neon' THEN
        v_expected_prefix := 'neon.business_partner.';
        v_expected_scope := 'tenant';
    ELSIF v_plane = 'mesh' THEN
        v_expected_prefix := 'mesh.document_envelope.';
        v_expected_scope := 'network_account';
    ELSE
        RAISE EXCEPTION 'P5-E2 permission pilot smoke requires Neon or Mesh; plane is %', coalesce(v_plane,'unset');
    END IF;

    SELECT count(*) INTO v_count
      FROM authz.permission permission
      JOIN authz.entity_operation_binding binding ON binding.permission_id=permission.id
     WHERE permission.canonical_code LIKE v_expected_prefix || '%'
       AND permission.permission_kind='entity_operation'
       AND permission.status='published'
       AND binding.scope_kind=v_expected_scope
       AND binding.status='published';
    IF v_count < 4 THEN
        RAISE EXCEPTION 'P5-E2 % pilot expected at least 4 published entity_operation permissions with bindings, found %', v_plane, v_count;
    END IF;

    IF EXISTS (
        SELECT 1 FROM authz.role_permission role_permission
         JOIN authz.permission permission ON permission.id=role_permission.permission_id
        WHERE permission.canonical_code LIKE v_expected_prefix || '%'
          AND permission.permission_kind='entity_operation'
    ) THEN
        RAISE EXCEPTION 'P5-E2 pilot permission seed must not assign authority';
    END IF;
END
$p5e2_permission_pilot_smoke$;
ROLLBACK;
\echo 'ENTITY_OPERATION_PERMISSION_PILOT_SMOKE_OK authority_assignments=0'
