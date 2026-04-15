-- 035_version_fields/000_common_fields.sql
-- Bulk-seeds common system/standard fields for ALL master.* system entity versions.
-- These match columns present on every (or nearly every) master table.
-- Each pass uses a CROSS JOIN to stamp the same field across all applicable entity versions.
--
-- IMPORTANT: The EntityCompilerService reads entity_field WHERE entity_version_id = <versionId>.
-- The canonical dictionary (entity_version_id IS NULL) is NOT merged by the compiler —
-- version-bound rows are the authoritative source for all rendered fields.
--
-- Idempotent: ON CONFLICT DO NOTHING (via ef_version_name_uidx: UNIQUE(entity_version_id, name)
--             WHERE entity_version_id IS NOT NULL)
-- Run AFTER: 025_entity_versions.sql

DO $$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    cnt    int;
    total  int := 0;
BEGIN

    -- ── Pass 1: id — ALL 111 master system entities ───────────────────────────
    -- Hidden, write_once, read_only — present on every table
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'id','id','ID','uuid','hidden',
        'one','system', true, false, false, false,
        true, false, 10, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 2: tenant_id — entities that ARE tenant-scoped ──────────────────
    -- Excludes: AGGREGATE (typically no tenant scoping)
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'tenant_id','tenant_id','Tenant','uuid','hidden',
        'one','system', true, true, false, false,
        true, false, 20, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION',
                                     'RELATION','LOG','DIMENSION'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 3a: code — MASTER + REFERENCE + DIMENSION entities ─────────────
    -- Business code / slug; unique per tenant
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_unique, is_filterable, is_sortable,
        is_searchable, is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'code','code','Code','string','text',
        'one','standard', true, true, true, true,
        true, false, false, 30, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','REFERENCE','DIMENSION'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 3b: name — MASTER + REFERENCE + DIMENSION entities ─────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'name','name','Name','string','text',
        'one','standard', true, true, true, true,
        false, false, 40, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','REFERENCE','DIMENSION'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 3c: description — MASTER + CONTROL + REFERENCE + DIMENSION ─────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT ev.id,
        'description','description','Description','text','textarea',
        'one','standard', false, false, false, true,
        false, 50, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 4a: status — entities bound to a lifecycle ──────────────────────
    -- Lifecycle-managed entities have a status column
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT DISTINCT ev.id,
        'status','status','Status','string','status',
        'one','system', true, true, true, false,
        true, 60, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    JOIN control.entity_lifecycle el ON el.entity_name = e.name AND el.tenant_id IS NULL
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 4b: is_active — same set as status ───────────────────────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT DISTINCT ev.id,
        'is_active','is_active','Active','boolean','hidden',
        'one','system', true, true, false, false,
        true, 70, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    JOIN control.entity_lifecycle el ON el.entity_name = e.name AND el.tenant_id IS NULL
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5a: created_at — all entities (audit trail) ─────────────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'created_at','created_at','Created','timestamp','datetime',
        'one','system', true, true, true, false,
        true, false, 950, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5b: created_by — all entities ───────────────────────────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'created_by','created_by','Created By','uuid','reference',
        'one','system', true, false, false, false,
        false, true, 960, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5c: updated_at — MASTER + CONTROL + DOCUMENT entities ───────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT ev.id,
        'updated_at','updated_at','Updated','timestamp','datetime',
        'one','system', false, true, true, false,
        true, 970, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','DOCUMENT'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5d: updated_by — MASTER + CONTROL + DOCUMENT entities ───────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT ev.id,
        'updated_by','updated_by','Updated By','uuid','reference',
        'one','system', false, false, false, false,
        true, 980, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','DOCUMENT'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    RAISE NOTICE '035_version_fields/000_common_fields: % rows inserted', total;
END $$;
