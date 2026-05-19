-- 020_entities/021_control_numbering_registry.sql
-- Purpose: clean up legacy numbering entity registry entries and register the
--          canonical entity_numbering_config / entity_numbering_counter tables.
-- Safe to re-run: DELETE is scoped, INSERT uses ON CONFLICT DO NOTHING.

DO $$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_fnd  uuid;
BEGIN
    SELECT id INTO v_fnd FROM shared.module WHERE code = 'FND';

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 1: Remove stale entity_operation rows for decommissioned entities.
    -- ─────────────────────────────────────────────────────────────────────────
    DELETE FROM control.entity_operation
    WHERE tenant_id IS NULL
      AND entity_name IN (
          'numbering_series',
          'document_sequence_config',
          'document_sequence_counter',
          'control_document_sequence_config',
          'control_document_sequence_counter'
      );

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 2: Remove snapshot.entity_compiled and entity_compiled_overlay rows
    --         for the stale entity versions. The immutability triggers are
    --         disabled for this transaction — this is a decommission cleanup,
    --         not normal runtime write.
    -- ─────────────────────────────────────────────────────────────────────────
    ALTER TABLE snapshot.entity_compiled         DISABLE TRIGGER trg_ec_immutable;
    ALTER TABLE snapshot.entity_compiled_overlay DISABLE TRIGGER trg_eco_immutable;

    DELETE FROM snapshot.entity_compiled_overlay
    WHERE entity_version_id IN (
        SELECT ev.id
        FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.tenant_id IS NULL
          AND (e.table_schema, e.table_name) IN (
              ('master',  'numbering_series'),
              ('control', 'document_sequence_config'),
              ('control', 'document_sequence_counter')
          )
    );

    DELETE FROM snapshot.entity_compiled
    WHERE entity_version_id IN (
        SELECT ev.id
        FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.tenant_id IS NULL
          AND (e.table_schema, e.table_name) IN (
              ('master',  'numbering_series'),
              ('control', 'document_sequence_config'),
              ('control', 'document_sequence_counter')
          )
    );

    ALTER TABLE snapshot.entity_compiled         ENABLE TRIGGER trg_ec_immutable;
    ALTER TABLE snapshot.entity_compiled_overlay ENABLE TRIGGER trg_eco_immutable;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 3: Remove stale entity registry rows for decommissioned tables.
    --         entity_version rows are deleted via ON DELETE CASCADE.
    -- ─────────────────────────────────────────────────────────────────────────
    DELETE FROM control.entity
    WHERE tenant_id IS NULL
      AND (table_schema, table_name) IN (
          ('master',  'numbering_series'),
          ('control', 'document_sequence_config'),
          ('control', 'document_sequence_counter')
      );

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 4: Register control.entity_numbering_config
    --         Policy table — one row per entity × number_field × company code.
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, slug, entity_short, entity_code, entity_class,
        ownership_model, kind, backing_type,
        governance_level, security_tier, mutability,
        table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by
    ) VALUES (
        v_fnd, 'entity_numbering_config', 'entity-numbering-config', 'ENC', 'entity_numbering_config', 'CONTROL',
        'system', 'ent', 'table',
        'full', 'platform_critical', 'controlled',
        'control', 'entity_numbering_config',
        'Entity Numbering Config', 'Entity Numbering Configs', 'hash', 'violet',
        '{"is_approvable":false}'::jsonb, 'ACTIVE', v_su
    )
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 5: Register control.entity_numbering_counter
    --         Hot-state counters — written on every document number generation.
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, slug, entity_short, entity_code, entity_class,
        ownership_model, kind, backing_type,
        governance_level, security_tier, mutability,
        table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by
    ) VALUES (
        v_fnd, 'entity_numbering_counter', 'entity-numbering-counter', 'ENCT', 'entity_numbering_counter', 'CONTROL',
        'system', 'ent', 'table',
        'lite', 'platform_critical', 'locked',
        'control', 'entity_numbering_counter',
        'Entity Numbering Counter', 'Entity Numbering Counters', 'binary', 'slate',
        '{"is_approvable":false}'::jsonb, 'ACTIVE', v_su
    )
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 6: Seed entity_version rows for any newly inserted entities.
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO control.entity_version (entity_id, tenant_id, version_no, status, label, change_type, effective_from, created_by)
    SELECT e.id, NULL, 1, 'EFFECTIVE', 'Initial Version', 'structural', now(), v_su
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND (e.table_schema, e.table_name) IN (
          ('control', 'entity_numbering_config'),
          ('control', 'entity_numbering_counter')
      )
      AND NOT EXISTS (
          SELECT 1 FROM control.entity_version ev WHERE ev.entity_id = e.id
      );

    RAISE NOTICE 'entity_numbering registry cleanup complete';
END $$;
