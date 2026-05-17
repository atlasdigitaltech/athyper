-- Generic lifecycle bindings for the catalog-backed master coverage entities.
-- Hand-authored domain lifecycles should continue to live in 050_entity_lifecycles.sql;
-- this file only fills coverage-owned gaps where the physical table has status.
DO $$
DECLARE
    v_system_user uuid := '00000000-0000-0000-0000-000000000001';
    v_lc_active uuid;
    v_lc_active_archived uuid;
    v_lc_attachment uuid;
    v_lc_master_doc uuid;
    v_rows integer := 0;
BEGIN
    SELECT id INTO v_lc_active
    FROM control.lifecycle
    WHERE code = 'lc_active_inactive'
      AND tenant_id IS NULL;

    SELECT id INTO v_lc_active_archived
    FROM control.lifecycle
    WHERE code = 'lc_active_inactive_archived'
      AND tenant_id IS NULL;

    SELECT id INTO v_lc_attachment
    FROM control.lifecycle
    WHERE code = 'lc_attachment'
      AND tenant_id IS NULL;

    SELECT id INTO v_lc_master_doc
    FROM control.lifecycle
    WHERE code = 'lc_master_doc'
      AND tenant_id IS NULL;

    IF v_lc_active IS NULL THEN
        RAISE EXCEPTION 'lc_active_inactive lifecycle not found; run 010_lifecycles first';
    END IF;

    INSERT INTO control.entity_lifecycle (
        tenant_id,
        entity_name,
        lifecycle_id,
        priority,
        created_by
    )
    SELECT
        NULL::uuid,
        e.name,
        CASE
            WHEN e.entity_code = 'attachment_folder' THEN COALESCE(v_lc_attachment, v_lc_active)
            WHEN e.entity_code IN (
                'party_risk_assessment',
                'party_risk_evidence',
                'party_risk_mitigation'
            ) THEN COALESCE(v_lc_master_doc, v_lc_active_archived, v_lc_active)
            WHEN EXISTS (
                SELECT 1
                FROM information_schema.columns del
                WHERE del.table_schema = e.table_schema
                  AND del.table_name = e.table_name
                  AND del.column_name IN ('deleted_at', 'archived_at')
            ) THEN COALESCE(v_lc_active_archived, v_lc_active)
            ELSE v_lc_active
        END,
        100,
        v_system_user
    FROM control.entity e
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.backing_type = 'table'
      AND COALESCE((e.feature_flags ->> 'is_readonly')::boolean, false) = false
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
      AND EXISTS (
          SELECT 1
          FROM information_schema.columns ic
          WHERE ic.table_schema = e.table_schema
            AND ic.table_name = e.table_name
            AND ic.column_name = 'status'
      )
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'Master schema coverage lifecycle bindings inserted %', v_rows;
END $$;
