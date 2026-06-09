-- Table-owned seed for control.field_group_member
-- Consolidated from platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/platform/004_entity_engine/050_lifecycle_and_field_bindings.sql
-- ============================================================

-- 050_lifecycle_and_field_bindings.sql
-- Lifecycle bindings and field group member links for system entities.
-- Sources: 040_field_group_members.sql + 050_entity_lifecycles.sql + 051_master_schema_coverage_lifecycles.sql

-- === SOURCE: 040_field_group_members.sql ===

-- 040_field_group_members.sql
-- Links canonical entity_field rows (entity_version_id IS NULL) to field_group sections.
-- Only canonical fields (entity_version_id IS NULL) participate in field_group_member.
-- Idempotent: ON CONFLICT (group_key, entity_field_id) DO NOTHING
-- Run AFTER: 002_field_groups.sql + 030_canonical_fields/000_canonical_dictionary.sql

DO $$
DECLARE
    -- canonical field ids
    v_fid_id                 uuid;
    v_fid_tenant_id          uuid;
    v_fid_code               uuid;
    v_fid_name               uuid;
    v_fid_description        uuid;
    v_fid_status             uuid;
    v_fid_is_active          uuid;
    v_fid_status_changed_at  uuid;
    v_fid_status_changed_by  uuid;
    v_fid_metadata           uuid;
    v_fid_tags               uuid;
    v_fid_created_at         uuid;
    v_fid_created_by         uuid;
    v_fid_updated_at         uuid;
    v_fid_updated_by         uuid;
BEGIN
    -- Resolve canonical field ids (entity_version_id IS NULL guarantees canonical scope)
    SELECT id INTO v_fid_id                FROM control.entity_field WHERE name = 'id'                AND entity_version_id IS NULL;
    SELECT id INTO v_fid_tenant_id         FROM control.entity_field WHERE name = 'tenant_id'         AND entity_version_id IS NULL;
    SELECT id INTO v_fid_code              FROM control.entity_field WHERE name = 'code'              AND entity_version_id IS NULL;
    SELECT id INTO v_fid_name              FROM control.entity_field WHERE name = 'name'              AND entity_version_id IS NULL;
    SELECT id INTO v_fid_description       FROM control.entity_field WHERE name = 'description'       AND entity_version_id IS NULL;
    SELECT id INTO v_fid_status            FROM control.entity_field WHERE name = 'status'            AND entity_version_id IS NULL;
    SELECT id INTO v_fid_is_active         FROM control.entity_field WHERE name = 'is_active'         AND entity_version_id IS NULL;
    SELECT id INTO v_fid_status_changed_at FROM control.entity_field WHERE name = 'status_changed_at' AND entity_version_id IS NULL;
    SELECT id INTO v_fid_status_changed_by FROM control.entity_field WHERE name = 'status_changed_by' AND entity_version_id IS NULL;
    SELECT id INTO v_fid_metadata          FROM control.entity_field WHERE name = 'metadata'          AND entity_version_id IS NULL;
    SELECT id INTO v_fid_tags              FROM control.entity_field WHERE name = 'tags'              AND entity_version_id IS NULL;
    SELECT id INTO v_fid_created_at        FROM control.entity_field WHERE name = 'created_at'        AND entity_version_id IS NULL;
    SELECT id INTO v_fid_created_by        FROM control.entity_field WHERE name = 'created_by'        AND entity_version_id IS NULL;
    SELECT id INTO v_fid_updated_at        FROM control.entity_field WHERE name = 'updated_at'        AND entity_version_id IS NULL;
    SELECT id INTO v_fid_updated_by        FROM control.entity_field WHERE name = 'updated_by'        AND entity_version_id IS NULL;

    -- Guard: abort if canonical dictionary wasn't seeded yet
    IF v_fid_id IS NULL THEN
        RAISE EXCEPTION 'canonical_fields not found — run 030_canonical_fields/000_canonical_dictionary.sql first';
    END IF;

    -- ── §1  identity group ───────────────────────────────────────────────────
    -- id, tenant_id, code, name, description
    INSERT INTO control.field_group_member (group_key, entity_field_id, is_required, sort_order) VALUES
        ('identity', v_fid_id,          true,  10),
        ('identity', v_fid_tenant_id,   true,  20),
        ('identity', v_fid_code,        true,  30),
        ('identity', v_fid_name,        true,  40),
        ('identity', v_fid_description, false, 50)
    ON CONFLICT (group_key, entity_field_id) DO NOTHING;

    -- ── §9  metadata group ───────────────────────────────────────────────────
    -- status, is_active, status timestamps, metadata bag, tags
    INSERT INTO control.field_group_member (group_key, entity_field_id, is_required, sort_order) VALUES
        ('metadata', v_fid_status,             true,  10),
        ('metadata', v_fid_is_active,          true,  20),
        ('metadata', v_fid_status_changed_at,  false, 30),
        ('metadata', v_fid_status_changed_by,  false, 40),
        ('metadata', v_fid_metadata,           false, 50),
        ('metadata', v_fid_tags,               false, 60)
    ON CONFLICT (group_key, entity_field_id) DO NOTHING;

    -- ── §10 audit group ──────────────────────────────────────────────────────
    -- created_at, created_by, updated_at, updated_by
    INSERT INTO control.field_group_member (group_key, entity_field_id, is_required, sort_order) VALUES
        ('audit', v_fid_created_at, true,  10),
        ('audit', v_fid_created_by, true,  20),
        ('audit', v_fid_updated_at, false, 30),
        ('audit', v_fid_updated_by, false, 40)
    ON CONFLICT (group_key, entity_field_id) DO NOTHING;

    RAISE NOTICE 'control.field_group_member: canonical field→group bindings seeded (% total)',
        (SELECT count(*) FROM control.field_group_member);
END $$;
