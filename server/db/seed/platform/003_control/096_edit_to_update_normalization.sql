-- ============================================================================
-- seed/platform/003_control/096_edit_to_update_normalization.sql
-- Seed: Normalize control.entity_operation rows from edit -> update.
-- Schema: control | Table: entity_operation
-- Depends on: 095_permission_alias.sql, 044_entity_operation.sql
-- Idempotent: Idempotent guard via NOT EXISTS — re-runs are no-op
--
-- Reference: docs/local/architecture/three-plane-permission-stack.md  D6
--
-- Context: An earlier section in 044_entity_operation.sql ran the reverse
-- migration (update -> edit). D6 reverses that direction: `update` is the
-- canonical action code; `edit` is deprecated. This file runs last in the
-- 003_control batch so it always lands the final state.
--
-- Migration rule:
--   For each (tenant_id, entity_name) where permission_code = 'edit',
--   rename to 'update' UNLESS an 'update' row already exists for the same
--   (tenant_id, entity_name) — in which case the 'edit' row is removed to
--   collapse the duplicate (the UQ eo_binding_uq would block UPDATE).
-- ============================================================================

DO $$
DECLARE
    v_renamed integer := 0;
    v_dropped integer := 0;
BEGIN
    -- Drop edit rows where an update row already exists (collapse duplicate)
    WITH dups AS (
        DELETE FROM control.entity_operation eo
         WHERE eo.permission_code = 'edit'
           AND EXISTS (
               SELECT 1 FROM control.entity_operation x
                WHERE COALESCE(x.tenant_id::text,'') = COALESCE(eo.tenant_id::text,'')
                  AND x.entity_name     = eo.entity_name
                  AND x.permission_code = 'update'
           )
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_dropped FROM dups;

    -- Rename remaining edit rows to update
    UPDATE control.entity_operation
       SET permission_code = 'update'
     WHERE permission_code = 'edit';
    GET DIAGNOSTICS v_renamed = ROW_COUNT;

    RAISE NOTICE 'D6 normalization: % rows renamed edit -> update, % duplicate edit rows dropped',
        v_renamed, v_dropped;
END $$;
