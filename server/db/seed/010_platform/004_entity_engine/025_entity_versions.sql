-- 900_seed_data/010_system/entity_engine/025_entity_versions.sql
-- Creates version 1 (EFFECTIVE) for every master.* system entity registered above.
-- Run AFTER all 020_entities/*.sql files.
-- The entity INSERT trigger auto-creates entity_publish_state — do NOT seed it manually.
-- Idempotent: ON CONFLICT (entity_id, version_no) DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    r    record;
    cnt  int := 0;
BEGIN
    FOR r IN
        SELECT e.id, e.tenant_id
        FROM   control.entity e
        WHERE  e.table_schema = 'master'
          AND  e.ownership_model = 'system'
          AND  NOT EXISTS (
              SELECT 1 FROM control.entity_version ev
              WHERE  ev.entity_id = e.id AND ev.version_no = 1
          )
        ORDER BY e.name
    LOOP
        INSERT INTO control.entity_version (
            entity_id, tenant_id, version_no, status,
            label, change_type, effective_from, created_by
        ) VALUES (
            r.id, r.tenant_id, 1, 'EFFECTIVE',
            'Initial version', 'structural',
            now(),
            v_su
        );
        cnt := cnt + 1;
    END LOOP;

    RAISE NOTICE 'control.entity_version: % rows inserted (version 1 for master system entities)', cnt;
END $$;
