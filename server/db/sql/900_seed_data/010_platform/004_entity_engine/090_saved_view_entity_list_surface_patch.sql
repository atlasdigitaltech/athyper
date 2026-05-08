-- 004_entity_engine/090_saved_view_entity_list_surface_patch.sql
-- Align runtime entity-list saved views with ui.surface_code lookup validation.
-- The generic surface is entity.list; master.saved_view.entity_key scopes the
-- actual simple master, rich master, or approvable document list.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT 'entity.list',
       'Entity List',
       'ui.surface_code',
       'Generic entity grid/list view used with saved_view.entity_key.',
       5,
       true,
       'active',
       '{}'::jsonb,
       '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1
    FROM control.lookup_value lv
    WHERE lv.domain_code = 'ui.surface_code'
      AND lv.code = 'entity.list'
      AND lv.tenant_id IS NULL
);

UPDATE master.saved_view
SET surface_code = 'entity.list',
    state_json = jsonb_set(
        COALESCE(state_json, '{}'::jsonb),
        '{surface}',
        '"entity.list"'::jsonb,
        true
    )
WHERE surface_code = 'entity-list';

DO $$
BEGIN
    IF to_regclass('master.saved_view') IS NOT NULL THEN
        DROP INDEX IF EXISTS master.sv_name_uq;
        CREATE UNIQUE INDEX IF NOT EXISTS sv_name_uq
            ON master.saved_view (tenant_id, scope, owner_principal_id, surface_code, entity_key, name)
            NULLS NOT DISTINCT
            WHERE status = 'active';

        DROP INDEX IF EXISTS master.sv_one_default_uq;
        CREATE UNIQUE INDEX IF NOT EXISTS sv_one_default_uq
            ON master.saved_view (tenant_id, scope, owner_principal_id, surface_code, entity_key)
            NULLS NOT DISTINCT
            WHERE is_default = true AND status = 'active';
    END IF;
END $$;
