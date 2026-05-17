-- 035_version_fields/019_fields_meta_entity_enum_overrides.sql
-- Patches auto-generated entity_field rows for the meta-entity registrations
-- (control_entity → control.entity, control_entity_field → control.entity_field)
-- to upgrade plain-text columns to proper enum/select fields with enum_domain_code.
--
-- Why: 018_fields_governed_schema_coverage.sql derives field metadata from
-- information_schema.columns, which maps every text column to ui_type='text'
-- with no enum metadata. This file overlays the correct enum_domain_code and
-- ui_type='select' so that dropdown choosers appear in the Metadata Studio and
-- in the Mass Property Update dialog.
--
-- Idempotent: UPDATE … WHERE exists; safe to re-run.

DO $$
DECLARE
    v_su           uuid := '00000000-0000-0000-0000-000000000000';
    v_ev_entity    uuid;
    v_ev_ef        uuid;
    v_ev_er        uuid;
    v_patched_entity  integer := 0;
    v_patched_ef      integer := 0;
    v_patched_er      integer := 0;
BEGIN

    -- ── Resolve entity_version IDs for the meta-entity registrations ──────────
    SELECT ev.id INTO v_ev_entity
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'control' AND e.table_name = 'entity'
    LIMIT 1;

    SELECT ev.id INTO v_ev_ef
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'control' AND e.table_name = 'entity_field'
    LIMIT 1;

    SELECT ev.id INTO v_ev_er
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'control' AND e.table_name = 'entity_relation'
    LIMIT 1;

    -- ══════════════════════════════════════════════════════════════════════════
    -- control.entity → meta-entity property overrides
    -- ══════════════════════════════════════════════════════════════════════════
    IF v_ev_entity IS NOT NULL THEN

        UPDATE control.entity_field ef
        SET
            data_type        = patch.data_type,
            ui_type          = patch.ui_type,
            enum_domain_code = patch.enum_domain_code,
            enum_config      = NULL,
            updated_at       = now(),
            updated_by       = v_su
        FROM (VALUES
            -- Entity classification
            ('entity_class',     'enum', 'select', 'entity.entity_class'),
            ('ownership_model',  'enum', 'select', 'entity.ownership_model'),
            ('backing_type',     'enum', 'select', 'entity.backing_type'),
            ('governance_level', 'enum', 'select', 'entity.governance_level'),
            ('security_tier',    'enum', 'select', 'entity.security_tier'),
            ('mutability',       'enum', 'select', 'entity.mutability'),
            ('kind',             'enum', 'select', 'entity.kind'),
            -- Status / lifecycle
            ('status',           'string', 'status', NULL)
        ) AS patch(col, data_type, ui_type, enum_domain_code)
        WHERE ef.entity_version_id = v_ev_entity
          AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_entity = ROW_COUNT;
        RAISE NOTICE 'control_entity field overrides applied: %', v_patched_entity;

    ELSE
        RAISE NOTICE 'control_entity entity_version not found — skipping entity patches';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- control.entity_field → meta-entity-field property overrides
    -- ══════════════════════════════════════════════════════════════════════════
    IF v_ev_ef IS NOT NULL THEN

        UPDATE control.entity_field ef
        SET
            data_type        = patch.data_type,
            ui_type          = patch.ui_type,
            enum_domain_code = patch.enum_domain_code,
            enum_config      = NULL,
            updated_at       = now(),
            updated_by       = v_su
        FROM (VALUES
            -- Core field metadata enums
            ('data_type',    'enum', 'select', 'entity_field.data_type'),
            ('cardinality',  'enum', 'select', 'entity_field.cardinality'),
            ('origin',       'enum', 'select', 'entity_field.origin'),
            ('ui_type',      'enum', 'select', 'entity_field.ui_type'),
            ('compute_mode', 'enum', 'select', 'entity_field.compute_mode'),
            -- Lookup-domain chooser (text FK → control.lookup_domain.code)
            ('enum_domain_code', 'string', 'lookup_chooser', NULL),
            -- Boolean flags
            ('is_required',      'boolean', 'checkbox', NULL),
            ('is_unique',        'boolean', 'checkbox', NULL),
            ('is_searchable',    'boolean', 'checkbox', NULL),
            ('is_filterable',    'boolean', 'checkbox', NULL),
            ('is_sortable',      'boolean', 'checkbox', NULL),
            ('is_groupable',     'boolean', 'checkbox', NULL),
            ('is_aggregatable',  'boolean', 'checkbox', NULL),
            ('is_read_only',     'boolean', 'checkbox', NULL),
            ('is_write_once',    'boolean', 'checkbox', NULL),
            ('is_deprecated',    'boolean', 'checkbox', NULL),
            ('is_computed',      'boolean', 'checkbox', NULL),
            ('is_active',        'boolean', 'checkbox', NULL),
            -- Status
            ('status',       'string', 'status', NULL)
        ) AS patch(col, data_type, ui_type, enum_domain_code)
        WHERE ef.entity_version_id = v_ev_ef
          AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_ef = ROW_COUNT;
        RAISE NOTICE 'control_entity_field field overrides applied: %', v_patched_ef;

    ELSE
        RAISE NOTICE 'control_entity_field entity_version not found — skipping entity_field patches';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- control.entity_relation → meta-relation property overrides
    -- ══════════════════════════════════════════════════════════════════════════
    IF v_ev_er IS NOT NULL THEN

        UPDATE control.entity_field ef
        SET
            data_type        = patch.data_type,
            ui_type          = patch.ui_type,
            enum_domain_code = patch.enum_domain_code,
            enum_config      = NULL,
            updated_at       = now(),
            updated_by       = v_su
        FROM (VALUES
            ('kind',   'enum', 'select', 'entity_relation.kind'),
            ('status', 'string', 'status', NULL)
        ) AS patch(col, data_type, ui_type, enum_domain_code)
        WHERE ef.entity_version_id = v_ev_er
          AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_er = ROW_COUNT;
        RAISE NOTICE 'control_entity_relation field overrides applied: %', v_patched_er;

    ELSE
        RAISE NOTICE 'control_entity_relation entity_version not found — skipping entity_relation patches';
    END IF;

    RAISE NOTICE 'Meta entity enum overrides complete (entity=%, entity_field=%, entity_relation=%)',
        v_patched_entity, v_patched_ef, v_patched_er;

END $$;
