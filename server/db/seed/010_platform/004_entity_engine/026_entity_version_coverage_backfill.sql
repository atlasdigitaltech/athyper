-- 004_entity_engine/026_entity_version_coverage_backfill.sql
-- Ensures every control.entity row has a version-1 entity_version entry,
-- and normalises label, change_type, and effective_from on all existing version-1 rows.
--
-- Run AFTER all 020_entities/*.sql and 025_entity_versions.sql files.
-- Idempotent: UPDATE touches only rows that differ; INSERT uses ON CONFLICT DO NOTHING.

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_upd integer;
    v_ins integer;
BEGIN
    -- 1. Normalise label, change_type, effective_from on all existing version-1 rows
    UPDATE control.entity_version
       SET label          = 'Initial Version',
           version_no     = 1,
           change_type    = COALESCE(change_type, 'structural'),
           effective_from = COALESCE(effective_from, created_at),
           updated_at     = now(),
           updated_by     = v_su
     WHERE version_no = 1
       AND (
           label IS DISTINCT FROM 'Initial Version'
           OR change_type IS NULL
           OR effective_from IS NULL
       );

    GET DIAGNOSTICS v_upd = ROW_COUNT;

    -- 2. Insert version 1 for any entity still missing a version record
    INSERT INTO control.entity_version (
        entity_id, tenant_id, version_no, status,
        label, change_type, effective_from, created_by
    )
    SELECT
        e.id, e.tenant_id, 1, 'EFFECTIVE',
        'Initial Version', 'structural',
        now(), v_su
    FROM control.entity e
    WHERE NOT EXISTS (
        SELECT 1 FROM control.entity_version ev
         WHERE ev.entity_id = e.id AND ev.version_no = 1
    )
    ON CONFLICT (entity_id, version_no) DO NOTHING;

    GET DIAGNOSTICS v_ins = ROW_COUNT;

    RAISE NOTICE 'entity_version backfill: % rows normalised, % new version-1 rows inserted', v_upd, v_ins;
END $$;
