-- Baseline UI/API operations for master-schema coverage entities.
-- Export is safe for read-only projections; write operations are limited to
-- table-backed, non-locked coverage entities so sensitive bindings stay guarded
-- by explicit domain permissions and policies.
DO $$
DECLARE
    v_system_user uuid := '00000000-0000-0000-0000-000000000001';
    v_rows integer := 0;
BEGIN
    INSERT INTO control.entity_operation (
        tenant_id,
        entity_name,
        permission_code,
        surface,
        placement,
        handler_type,
        handler_target,
        is_record_required,
        sort_order,
        created_by
    )
    SELECT
        NULL::uuid,
        e.name,
        op.permission_code,
        op.surface,
        op.placement,
        op.handler_type,
        op.handler_target,
        op.is_record_required,
        op.sort_order,
        v_system_user
    FROM control.entity e
    CROSS JOIN LATERAL (
        VALUES
            ('export', 'LIST', 'TOOLBAR', 'API', 'export', false, 40)
    ) AS op(permission_code, surface, placement, handler_type, handler_target, is_record_required, sort_order)
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
    ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'Master schema coverage export operations inserted %', v_rows;

    INSERT INTO control.entity_operation (
        tenant_id,
        entity_name,
        permission_code,
        surface,
        placement,
        handler_type,
        handler_target,
        is_record_required,
        sort_order,
        created_by
    )
    SELECT
        NULL::uuid,
        e.name,
        op.permission_code,
        op.surface,
        op.placement,
        op.handler_type,
        replace(op.handler_target, '{entity}', e.entity_code),
        op.is_record_required,
        op.sort_order,
        v_system_user
    FROM control.entity e
    CROSS JOIN LATERAL (
        VALUES
            ('create', 'LIST',   'PRIMARY',  'NAVIGATE', '/app/{entity}/new',       false, 10),
            ('update', 'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/{entity}/{id}/edit', true,  20),
            ('delete', 'DETAIL', 'OVERFLOW', 'MODAL',    'delete',                 true,  30)
    ) AS op(permission_code, surface, placement, handler_type, handler_target, is_record_required, sort_order)
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.backing_type = 'table'
      AND e.entity_class <> 'LOG'
      AND e.mutability <> 'locked'
      AND COALESCE((e.feature_flags ->> 'is_readonly')::boolean, false) = false
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
    ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'Master schema coverage write operations inserted %', v_rows;
END $$;
