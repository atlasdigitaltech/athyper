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
      JOIN authz.permission_scope_policy policy ON policy.permission_id=permission.id
     WHERE permission.canonical_code LIKE v_expected_prefix || '%'
       AND permission.permission_kind='entity_operation'
       AND permission.status='published'
       AND permission.provenance_ref='athyper.operation-scope@p5-e2-v1'
       AND policy.scope_kind=v_expected_scope
       AND policy.propagation_mode='exact';
    IF v_count <> 4 THEN
        RAISE EXCEPTION 'P5-E2 % pilot expected 4 exact published permissions, found %', v_plane, v_count;
    END IF;

    IF EXISTS (
        SELECT 1 FROM authz.role_permission role_permission
         JOIN authz.permission permission ON permission.id=role_permission.permission_id
        WHERE permission.provenance_ref='athyper.operation-scope@p5-e2-v1'
    ) THEN
        RAISE EXCEPTION 'P5-E2 pilot permission seed must not assign authority';
    END IF;
END
$p5e2_permission_pilot_smoke$;
ROLLBACK;
\echo 'ENTITY_OPERATION_PERMISSION_PILOT_SMOKE_OK authority_assignments=0'

