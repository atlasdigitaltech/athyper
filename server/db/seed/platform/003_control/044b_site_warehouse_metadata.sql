-- ============================================================
-- 044b_site_warehouse_metadata.sql
-- Production-grade metadata completion for master.site and master.warehouse.
--
-- Covers ALL control-table layers per the Neon Meta Entity Contract:
--   §1  Entity registry patches    (control.entity)
--   §2  Versioned entity fields     (control.entity_field)
--   §3  Enum domain assignments     (enum_domain_code)
--   §4  Reference / validation config
--   §5  Lookup / dependent-filter config
--   §6  Entity relation UI behavior patches (control.entity_relation)
--   §7  Site entity operations      (control.entity_operation)
--   §8  Warehouse entity operations  — import op addition
--   §9  Field group_key assignments  (UI section grouping for form compiler)
--
-- Idempotent: every statement uses ON CONFLICT DO NOTHING or
-- WHERE-guarded UPDATEs that are safe to replay.
-- Run AFTER: 044_entity_operation.sql
-- ============================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- §1  Entity registry patches
--     feature_flags, display_config, search_config
-- ══════════════════════════════════════════════════════════════════════════════

-- site: hierarchical org-structure entity.
--   has_hierarchy → parent_site_id + level_no tree; compiler enables tree
--   controls, hierarchy-aware list rendering, and exclude_current_record on
--   parent pickers.
UPDATE control.entity
SET
    feature_flags  = COALESCE(feature_flags, '{}'::jsonb) || '{"has_hierarchy":true}'::jsonb,
    display_config = COALESCE(display_config, '{}'::jsonb)
                     || '{"title_field":"name","subtitle_field":"code","list_columns":["id","code","name","company_code_id","site_type","country_code","status"],"detail_renderer":"master","detail_profile":"simple","list_renderer":"table"}'::jsonb,
    search_config  = COALESCE(search_config, '{}'::jsonb)
                     || '{"enabled":true,"fields":["code","name","description"]}'::jsonb,
    updated_at     = now()
WHERE table_schema = 'master'
  AND entity_code  = 'site'
  AND tenant_id IS NULL;

-- warehouse: always contextually scoped under a site.
--   parent_entity hint lets the entity engine surface the site context chip
--   on the warehouse list/detail and drive dependent pickers.
UPDATE control.entity
SET
    feature_flags  = COALESCE(feature_flags, '{}'::jsonb) || '{"parent_entity":"site","parent_fk":"site_id"}'::jsonb,
    display_config = COALESCE(display_config, '{}'::jsonb)
                     || '{"title_field":"name","subtitle_field":"code","list_columns":["id","code","name","site_id","warehouse_type","status"],"detail_renderer":"master","detail_profile":"simple","list_renderer":"table"}'::jsonb,
    search_config  = COALESCE(search_config, '{}'::jsonb)
                     || '{"enabled":true,"fields":["code","name","description"]}'::jsonb,
    updated_at     = now()
WHERE table_schema = 'master'
  AND entity_code  = 'warehouse'
  AND tenant_id IS NULL;


-- ══════════════════════════════════════════════════════════════════════════════
-- §2  Versioned entity fields
--     site (10 fields, completely missing from original seed)
--     warehouse (2 missing fields + validation upgrade on existing site_id row)
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── site ─────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.entity_code = 'site'
      AND e.tenant_id IS NULL
      AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
        SELECT entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, validation, sort_order, created_by,
               CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
        FROM (VALUES
            -- ── §A  Ownership ────────────────────────────────────────────────
            -- company_code_id: UUID FK → company_code; required; scoped to
            -- legal entity; populated via reference_picker.
            (v_ev, 'company_code_id', 'company_code_id', 'Company Code',
             'uuid',    'reference', 'one', 'standard',
             true,  true,  false, false,
             '{"ref_entity":"company_code","value_field":"id","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"scope_mode":"legal_entity"}'::jsonb,
             110, v_su),

            -- ── §B  Classification ───────────────────────────────────────────
            -- site_type: enum select; enum_domain_code patched in §3 below.
            (v_ev, 'site_type',        'site_type',        'Type',
             'enum',    'select',    'one', 'standard',
             true,  true,  true,  false,
             NULL::jsonb,
             120, v_su),

            -- description: free-text; searchable; not required.
            (v_ev, 'description',      'description',      'Description',
             'string',  'textarea',  'one', 'standard',
             false, false, false, true,
             NULL::jsonb,
             130, v_su),

            -- ── §C  Hierarchy ────────────────────────────────────────────────
            -- parent_site_id: self-referencing UUID FK; optional.
            -- exclude_current_record prevents self-parent cycles.
            -- Filters to active sites only; scoped to same legal entity.
            (v_ev, 'parent_site_id',   'parent_site_id',   'Parent Site',
             'uuid',    'reference', 'one', 'standard',
             false, true,  false, false,
             '{"ref_entity":"site","value_field":"id","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"filters":{"is_active":true},"exclude_current_record":true,"scope_mode":"legal_entity"}'::jsonb,
             140, v_su),

            -- level_no: computed by trigger; system-origin; read-only in UI.
            (v_ev, 'level_no',         'level_no',         'Level',
             'integer', 'number',    'one', 'system',
             false, true,  true,  false,
             '{"min":1}'::jsonb,
             150, v_su),

            -- ── §D  Location context (code-valued references) ────────────────
            -- country_code: CHAR(2); FK → shared.country(code); required.
            -- Stores raw code e.g. "EG"; picker renders "Egypt (EG)".
            (v_ev, 'country_code',     'country_code',     'Country',
             'string',  'reference', 'one', 'standard',
             true,  true,  true,  false,
             '{"ref_entity":"country","value_field":"code","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"scope_mode":"unscoped"}'::jsonb,
             160, v_su),

            -- timezone_code: text; FK-like → shared.timezone(code); optional.
            -- Stores IANA code e.g. "Africa/Cairo"; picker shows name + offset.
            (v_ev, 'timezone_code',    'timezone_code',    'Timezone',
             'string',  'reference', 'one', 'standard',
             false, true,  false, false,
             '{"ref_entity":"timezone","value_field":"code","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"scope_mode":"unscoped"}'::jsonb,
             170, v_su),

            -- ── §E  Management ───────────────────────────────────────────────
            (v_ev, 'manager_id',       'manager_id',       'Manager',
             'uuid',    'reference', 'one', 'standard',
             false, true,  false, false,
             '{"ref_entity":"principal","value_field":"id","label_field":"name","code_field":"login_email","display_format":"label_code","show_code":true,"scope_mode":"tenant"}'::jsonb,
             180, v_su),

            -- ── §F  Capacity ─────────────────────────────────────────────────
            -- capacity_uom: code-valued → shared.uom(code); optional.
            -- Stores UOM code e.g. "KG"; picker renders "Kilogram (KG)".
            (v_ev, 'capacity_uom',     'capacity_uom',     'Capacity UOM',
             'string',  'reference', 'one', 'standard',
             false, true,  false, false,
             '{"ref_entity":"uom","value_field":"code","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"scope_mode":"unscoped"}'::jsonb,
             190, v_su),

            -- capacity_value: must pair with capacity_uom; numeric ≥ 0.
            (v_ev, 'capacity_value',   'capacity_value',   'Capacity',
             'decimal',  'number',   'one', 'standard',
             false, true,  true,  false,
             '{"min":0}'::jsonb,
             200, v_su)

        ) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;

        RAISE NOTICE '044b §2 site entity fields: %', (
            SELECT count(*) FROM control.entity_field ef
            JOIN control.entity_version ev2 ON ev2.id = ef.entity_version_id
            JOIN control.entity e2 ON e2.id = ev2.entity_id
            WHERE e2.entity_code = 'site' AND ev2.version_no = 1
        );
    ELSE
        RAISE WARNING '044b §2 site entity_version not found — skipping field registration';
    END IF;


    -- ── warehouse ─────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.entity_code = 'warehouse'
      AND e.tenant_id IS NULL
      AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        -- Add the two DDL fields omitted from the original block.
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
        SELECT entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, validation, sort_order, created_by,
               CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
        FROM (VALUES
            -- description: free-text; searchable; mirrors site pattern.
            (v_ev, 'description',               'description',               'Description',
             'string',  'textarea',  'one', 'standard',
             false, false, false, true,
             NULL::jsonb,
             140, v_su),

            -- is_negative_stock_allowed: NOT NULL DEFAULT false in DDL.
            -- Transit warehouses typically set this true.
            -- is_required=true mirrors the NOT NULL DDL constraint.
            (v_ev, 'is_negative_stock_allowed', 'is_negative_stock_allowed', 'Allow Negative Stock',
             'boolean', 'checkbox',  'one', 'standard',
             true,  true,  true,  false,
             NULL::jsonb,
             150, v_su)

        ) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;

        -- Upgrade existing warehouse.site_id validation to full reference_config.
        -- The original seed only stored {"ref_entity":"site"} without scope or
        -- label resolution hints. Safe to replay — only fires when the value
        -- is still at the original minimal form.
        UPDATE control.entity_field ef
        SET    reference_config = '{"ref_entity":"site","value_field":"id","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"scope_mode":"legal_entity"}'::jsonb,
               updated_at = now(),
               updated_by = v_su
        WHERE  ef.entity_version_id = v_ev
          AND  ef.name = 'site_id'
          AND  (ef.reference_config IS NULL
             OR ef.reference_config = '{}'::jsonb
             OR ef.reference_config = '{"ref_entity":"site"}'::jsonb);

        RAISE NOTICE '044b §2 warehouse fields: description + is_negative_stock_allowed added; site_id validation upgraded';
    ELSE
        RAISE WARNING '044b §2 warehouse entity_version not found — skipping';
    END IF;

    RAISE NOTICE '044b §2 versioned entity fields: done';
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- §3  Enum domain assignment
--     Assigns enum_domain_code and clears the placeholder enum_config.
--     Follows the same pattern as the mass patch in §22 of 044_entity_operation.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE control.entity_field ef
SET
    data_type        = 'enum',
    ui_type          = 'select',
    enum_domain_code = mapping.domain,
    enum_config      = NULL,
    updated_at       = now(),
    updated_by       = '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('site'::text,      'site_type'::text,      'master.site_type'::text),
    ('warehouse'::text, 'warehouse_type'::text, 'master.warehouse_type'::text)
) AS mapping(ename, col, domain),
control.entity_version ev,
control.entity e
WHERE e.id            = ev.entity_id
  AND e.entity_code   = mapping.ename
  AND e.tenant_id IS NULL
  AND ev.version_no   = 1
  AND ef.entity_version_id = ev.id
  AND ef.column_name  = mapping.col
  AND (
      ef.data_type IS DISTINCT FROM 'enum'
      OR ef.ui_type IS DISTINCT FROM 'select'
      OR ef.enum_domain_code IS DISTINCT FROM mapping.domain
      OR ef.enum_config IS NOT NULL
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- §4  Reference / validation config patches
--     Full reference_config for all picker fields on both entities.
--     Uses the field_updates CTE pattern from 044_entity_operation.
-- ══════════════════════════════════════════════════════════════════════════════

WITH field_updates(entity_name, field_name, reference_config) AS (
  VALUES
    -- ── site: UUID references ─────────────────────────────────────────────────
    -- company_code_id: legal-entity scoped; full label/code hint for picker.
    ('site'::text,      'company_code_id'::text,
     '{"ref_entity":"company_code","value_field":"id","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"scope_mode":"legal_entity"}'::jsonb),

    -- parent_site_id: self-reference; exclude_current_record prevents cycles;
    -- active only; scoped to legal entity.
    ('site',            'parent_site_id',
     '{"ref_entity":"site","value_field":"id","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"filters":{"is_active":true},"exclude_current_record":true,"scope_mode":"legal_entity"}'::jsonb),

    -- manager_id: references principal (user/person); tenant-scoped.
    ('site',            'manager_id',
     '{"ref_entity":"principal","value_field":"id","label_field":"name","code_field":"login_email","display_format":"label_code","show_code":true,"scope_mode":"tenant"}'::jsonb),

    -- ── site: code-valued references (UI book §739–829) ──────────────────────
    -- country_code: stores ISO-2 code; picker resolves "Egypt (EG)".
    ('site',            'country_code',
     '{"ref_entity":"country","value_field":"code","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"scope_mode":"unscoped"}'::jsonb),

    -- timezone_code: stores IANA tz code; picker shows name + UTC offset.
    ('site',            'timezone_code',
     '{"ref_entity":"timezone","value_field":"code","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"scope_mode":"unscoped"}'::jsonb),

    -- capacity_uom: stores UOM code e.g. "KG"; picker renders "Kilogram (KG)".
    ('site',            'capacity_uom',
     '{"ref_entity":"uom","value_field":"code","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"scope_mode":"unscoped"}'::jsonb),

    -- ── warehouse: UUID references ────────────────────────────────────────────
    -- site_id: legal-entity scoped; company_code reached via site hierarchy.
    ('warehouse'::text, 'site_id'::text,
     '{"ref_entity":"site","value_field":"id","label_field":"name","code_field":"code","display_format":"label_code","show_code":true,"scope_mode":"legal_entity"}'::jsonb),

    -- manager_id: same pattern as site.manager_id.
    ('warehouse',       'manager_id',
     '{"ref_entity":"principal","value_field":"id","label_field":"name","code_field":"login_email","display_format":"label_code","show_code":true,"scope_mode":"tenant"}'::jsonb)
)
UPDATE control.entity_field ef
SET    reference_config = fu.reference_config,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
FROM   control.entity_version ev
JOIN   control.entity e  ON e.id = ev.entity_id
JOIN   field_updates   fu ON fu.entity_name = e.entity_code
WHERE  ef.entity_version_id = ev.id
  AND  e.tenant_id IS NULL
  AND  ev.version_no  = 1
  AND  ef.name        = fu.field_name
  AND  (ef.reference_config IS DISTINCT FROM fu.reference_config);


-- ══════════════════════════════════════════════════════════════════════════════
-- §5  Lookup config patches
--     Drives the runtime-options endpoint: search fields, scope filters,
--     and dependent (cascading) filters.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── site ─────────────────────────────────────────────────────────────────────
WITH site_lookup(field_name, lookup_config) AS (
  VALUES
    -- company_code_id: search by code or name; active records only;
    -- legal-entity scope (no further dependent filter — this IS the scope key).
    ('company_code_id'::text,
     '{"search_fields":["code","name"],"filters":{"status":"active"},"scope_mode":"legal_entity"}'::jsonb),

    -- parent_site_id: cascades off company_code_id — only shows sites in the
    -- same company; excludes current record via reference_config flag.
    ('parent_site_id',
     '{"search_fields":["code","name"],"filters":{"status":"active"},"dependent_filter":{"source_field":"company_code_id","target_field":"company_code_id","empty_behavior":"none"}}'::jsonb),

    -- country_code: global reference; search by name or ISO code.
    ('country_code',
     '{"search_fields":["name","code"]}'::jsonb),

    -- timezone_code: global reference; search by name or IANA code.
    ('timezone_code',
     '{"search_fields":["name","code"]}'::jsonb),

    -- capacity_uom: global reference; search by name or UOM code.
    ('capacity_uom',
     '{"search_fields":["name","code"]}'::jsonb),

    -- manager_id: tenant-scoped principals; search by display name or email.
    ('manager_id',
     '{"search_fields":["name","login_email"],"filters":{"status":"active"}}'::jsonb)
)
UPDATE control.entity_field ef
SET    lookup_config = sl.lookup_config,
       updated_at    = now(),
       updated_by    = '00000000-0000-0000-0000-000000000000'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
JOIN   site_lookup    sl ON true
WHERE  ef.entity_version_id = ev.id
  AND  e.tenant_id IS NULL
  AND  e.entity_code = 'site'
  AND  ev.version_no = 1
  AND  ef.name      = sl.field_name;

-- ── warehouse ─────────────────────────────────────────────────────────────────
WITH warehouse_lookup(field_name, lookup_config) AS (
  VALUES
    -- site_id: search by code or name; active only; legal-entity scoped.
    -- The runtime-options endpoint resolves company scope via site.company_code_id
    -- when scope_mode = "legal_entity" is in effect, even though warehouse has
    -- no direct company_code_id column.
    ('site_id'::text,
     '{"search_fields":["code","name"],"filters":{"status":"active"},"scope_mode":"legal_entity"}'::jsonb),

    -- manager_id: same as site.
    ('manager_id',
     '{"search_fields":["name","login_email"],"filters":{"status":"active"}}'::jsonb)
)
UPDATE control.entity_field ef
SET    lookup_config = wl.lookup_config,
       updated_at    = now(),
       updated_by    = '00000000-0000-0000-0000-000000000000'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
JOIN   warehouse_lookup wl ON true
WHERE  ef.entity_version_id = ev.id
  AND  e.tenant_id IS NULL
  AND  e.entity_code = 'warehouse'
  AND  ev.version_no = 1
  AND  ef.name      = wl.field_name;


-- ══════════════════════════════════════════════════════════════════════════════
-- §6  Entity relation UI behavior patches
--     Adds chooser / scope / child-label hints to existing entity_relation rows.
--     Uses jsonb || merge — unrelated ui_behavior keys are preserved.
-- ══════════════════════════════════════════════════════════════════════════════

-- warehouse → site: annotate belongs_to with picker chooser + legal_entity scope.
UPDATE control.entity_relation er
SET    ui_behavior = COALESCE(er.ui_behavior, '{}'::jsonb)
                     || '{"chooser":"reference_picker","scope_mode":"legal_entity"}'::jsonb,
       updated_at  = now(),
       updated_by  = '00000000-0000-0000-0000-000000000000'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  er.entity_version_id = ev.id
  AND  er.tenant_id IS NULL
  AND  e.tenant_id IS NULL
  AND  ev.tenant_id IS NULL
  AND  ev.version_no = 1
  AND  e.entity_code = 'warehouse'
  AND  er.name = 'site'
  AND  er.relation_kind = 'belongs_to';

-- site → warehouses: annotate has_many so detail surfaces know the tab label,
-- child entity, and FK column for the child list route.
UPDATE control.entity_relation er
SET    ui_behavior = COALESCE(er.ui_behavior, '{}'::jsonb)
                     || '{"child_label":"Warehouses","child_entity":"warehouse","child_fk":"site_id"}'::jsonb,
       updated_at  = now(),
       updated_by  = '00000000-0000-0000-0000-000000000000'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  er.entity_version_id = ev.id
  AND  er.tenant_id IS NULL
  AND  e.tenant_id IS NULL
  AND  ev.tenant_id IS NULL
  AND  ev.version_no = 1
  AND  e.entity_code = 'site'
  AND  er.name = 'warehouses'
  AND  er.relation_kind = 'has_many';

-- site → cost_centers: same pattern for the cost centers child tab.
UPDATE control.entity_relation er
SET    ui_behavior = COALESCE(er.ui_behavior, '{}'::jsonb)
                     || '{"child_label":"Cost Centers","child_entity":"cost_center","child_fk":"site_id"}'::jsonb,
       updated_at  = now(),
       updated_by  = '00000000-0000-0000-0000-000000000000'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  er.entity_version_id = ev.id
  AND  er.tenant_id IS NULL
  AND  e.tenant_id IS NULL
  AND  ev.tenant_id IS NULL
  AND  ev.version_no = 1
  AND  e.entity_code = 'site'
  AND  er.name = 'cost_centers'
  AND  er.relation_kind = 'has_many';


-- ══════════════════════════════════════════════════════════════════════════════
-- §7  Entity operations — site
--     Mirrors the Set B pattern (business_unit / cost_center / profit_center).
--     Adds import because site hierarchies are typically bulk-loaded.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    -- LIST surface
    (NULL, 'site', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', '/app/site/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'site', 'export', 'LIST',   'TOOLBAR',  'API',      'export',              false, 20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'site', 'import', 'LIST',   'TOOLBAR',  'API',      'import',              false, 30, '00000000-0000-0000-0000-000000000000'),
    -- DETAIL surface — primary
    (NULL, 'site', 'update', 'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/site/{id}/edit', true,  10, '00000000-0000-0000-0000-000000000000'),
    -- DETAIL surface — overflow
    (NULL, 'site', 'cancel', 'DETAIL', 'OVERFLOW', 'MODAL',    'deactivate',          true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'site', 'reopen', 'DETAIL', 'OVERFLOW', 'MODAL',    'reactivate',          true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'site', 'delete', 'DETAIL', 'OVERFLOW', 'MODAL',    'delete',              true,  40, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- §8  Entity operations — warehouse (import addition)
--     The original 044 seed seeded 6 ops for warehouse but omitted import.
--     Adds it here so warehouse bulk-load is available in the admin UI.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'warehouse', 'import', 'LIST', 'TOOLBAR', 'API', 'import', false, 70, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- §9  Field group_key assignments
--     Sets entity_field.group_key for all versioned site and warehouse fields
--     so the form compiler can organise fields into UI sections without guessing.
--
--     Available standard groups (from 020_field_group.sql):
--       profile    — classification type, description, derived display values
--       reference  — FK references to related entities (parent, owner, lookups)
--       config     — policy/settings flags
--
--     Canonical fields (entity_version_id IS NULL) already carry group_key and
--     participate in field_group_member rows seeded in 042b. This block covers
--     only the versioned (entity-specific) rows.
-- ══════════════════════════════════════════════════════════════════════════════

WITH group_assignments(entity_name, field_name, gk) AS (
  VALUES
    -- ── site ─────────────────────────────────────────────────────────────────
    -- profile: classification + descriptive + system-computed hierarchy fields
    ('site'::text, 'site_type'::text,      'profile'::text),
    ('site',       'description',          'profile'),
    ('site',       'level_no',             'profile'),
    ('site',       'capacity_value',       'profile'),

    -- reference: all FK/code-reference lookups for site
    ('site',       'company_code_id',      'reference'),
    ('site',       'parent_site_id',       'reference'),
    ('site',       'country_code',         'reference'),
    ('site',       'timezone_code',        'reference'),
    ('site',       'manager_id',           'reference'),
    ('site',       'capacity_uom',         'reference'),

    -- ── warehouse ─────────────────────────────────────────────────────────────
    -- profile: classification + descriptive
    ('warehouse'::text, 'warehouse_type'::text, 'profile'::text),
    ('warehouse',       'description',          'profile'),

    -- config: policy/settings boolean flag
    ('warehouse',       'is_negative_stock_allowed', 'config'),

    -- reference: FK lookups for warehouse
    ('warehouse',       'site_id',    'reference'),
    ('warehouse',       'manager_id', 'reference')
)
UPDATE control.entity_field ef
SET    group_key  = ga.gk,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
JOIN   group_assignments ga ON ga.entity_name = e.entity_code
WHERE  ef.entity_version_id = ev.id
  AND  e.tenant_id IS NULL
  AND  ev.version_no  = 1
  AND  ef.name        = ga.field_name
  AND  (ef.group_key IS NULL OR ef.group_key <> ga.gk);


-- ============================================================================
-- Section 10  Prototype contract validation
--     Non-blocking guardrails for the Neon runtime prototype. These checks catch
--     the common failure mode where rows attach by display name instead of
--     entity_code and the runtime falls back to only canonical fields.
-- ============================================================================

DO $$
DECLARE
    v_issue text;
BEGIN
    WITH expected(entity_code, title_field, subtitle_field, list_columns) AS (
      VALUES
        ('site'::text, 'name'::text, 'code'::text,
         ARRAY['id','code','name','company_code_id','site_type','country_code','status']::text[]),
        ('warehouse'::text, 'name'::text, 'code'::text,
         ARRAY['id','code','name','site_id','warehouse_type','status']::text[])
    )
    SELECT string_agg(issue, '; ' ORDER BY issue) INTO v_issue
    FROM (
      SELECT exp.entity_code || ' display_config is incomplete' AS issue
      FROM expected exp
      LEFT JOIN control.entity e
        ON e.entity_code = exp.entity_code
       AND e.table_schema = 'master'
       AND e.tenant_id IS NULL
      WHERE e.id IS NULL
         OR e.display_config->>'title_field' IS DISTINCT FROM exp.title_field
         OR e.display_config->>'subtitle_field' IS DISTINCT FROM exp.subtitle_field
         OR EXISTS (
              SELECT 1
              FROM unnest(exp.list_columns) AS col(column_name)
              WHERE NOT (COALESCE(e.display_config->'list_columns', '[]'::jsonb) ? col.column_name)
            )
    ) issues;

    IF v_issue IS NOT NULL THEN
        RAISE WARNING '044b prototype display_config contract drift: %', v_issue;
    END IF;

    WITH expected(entity_code, field_name) AS (
      VALUES
        ('site'::text, 'company_code_id'::text),
        ('site', 'site_type'),
        ('site', 'description'),
        ('site', 'parent_site_id'),
        ('site', 'level_no'),
        ('site', 'country_code'),
        ('site', 'timezone_code'),
        ('site', 'manager_id'),
        ('site', 'capacity_uom'),
        ('site', 'capacity_value'),
        ('warehouse'::text, 'site_id'::text),
        ('warehouse', 'warehouse_type'),
        ('warehouse', 'description'),
        ('warehouse', 'manager_id'),
        ('warehouse', 'is_negative_stock_allowed')
    )
    SELECT string_agg(exp.entity_code || '.' || exp.field_name, ', ' ORDER BY exp.entity_code, exp.field_name)
      INTO v_issue
    FROM expected exp
    LEFT JOIN control.entity e
      ON e.entity_code = exp.entity_code
     AND e.tenant_id IS NULL
    LEFT JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.version_no = 1
     AND ev.tenant_id IS NULL
    LEFT JOIN control.entity_field ef
      ON ef.entity_version_id = ev.id
     AND ef.name = exp.field_name
    WHERE ef.name IS NULL;

    IF v_issue IS NOT NULL THEN
        RAISE WARNING '044b prototype entity_field rows missing: %', v_issue;
    END IF;

    WITH expected(entity_code, field_name, ref_entity, value_field, label_field, code_field, scope_mode) AS (
      VALUES
        ('site'::text, 'company_code_id'::text, 'company_code'::text, 'id'::text, 'name'::text, 'code'::text, 'legal_entity'::text),
        ('site', 'parent_site_id', 'site', 'id', 'name', 'code', 'legal_entity'),
        ('site', 'country_code', 'country', 'code', 'name', 'code', 'unscoped'),
        ('site', 'timezone_code', 'timezone', 'code', 'name', 'code', 'unscoped'),
        ('site', 'manager_id', 'principal', 'id', 'name', 'login_email', 'tenant'),
        ('site', 'capacity_uom', 'uom', 'code', 'name', 'code', 'unscoped'),
        ('warehouse'::text, 'site_id'::text, 'site'::text, 'id'::text, 'name'::text, 'code'::text, 'legal_entity'::text),
        ('warehouse', 'manager_id', 'principal', 'id', 'name', 'login_email', 'tenant')
    )
    SELECT string_agg(exp.entity_code || '.' || exp.field_name, ', ' ORDER BY exp.entity_code, exp.field_name)
      INTO v_issue
    FROM expected exp
    LEFT JOIN control.entity e
      ON e.entity_code = exp.entity_code
     AND e.tenant_id IS NULL
    LEFT JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.version_no = 1
     AND ev.tenant_id IS NULL
    LEFT JOIN control.entity_field ef
      ON ef.entity_version_id = ev.id
     AND ef.name = exp.field_name
    WHERE ef.name IS NULL
       OR COALESCE(ef.reference_config, '{}'::jsonb)->>'ref_entity' IS DISTINCT FROM exp.ref_entity
       OR COALESCE(ef.reference_config, '{}'::jsonb)->>'value_field' IS DISTINCT FROM exp.value_field
       OR COALESCE(ef.reference_config, '{}'::jsonb)->>'label_field' IS DISTINCT FROM exp.label_field
       OR COALESCE(ef.reference_config, '{}'::jsonb)->>'code_field' IS DISTINCT FROM exp.code_field
       OR COALESCE(ef.reference_config, '{}'::jsonb)->>'scope_mode' IS DISTINCT FROM exp.scope_mode
       OR COALESCE(ef.reference_config, '{}'::jsonb)->>'display_format' IS DISTINCT FROM 'label_code'
       OR COALESCE(ef.reference_config, '{}'::jsonb)->>'show_code' IS DISTINCT FROM 'true';

    IF v_issue IS NOT NULL THEN
        RAISE WARNING '044b prototype reference_config contract drift: %', v_issue;
    END IF;

    WITH expected(entity_code, field_name, domain_code) AS (
      VALUES
        ('site'::text, 'site_type'::text, 'master.site_type'::text),
        ('warehouse'::text, 'warehouse_type'::text, 'master.warehouse_type'::text)
    )
    SELECT string_agg(exp.entity_code || '.' || exp.field_name, ', ' ORDER BY exp.entity_code, exp.field_name)
      INTO v_issue
    FROM expected exp
    LEFT JOIN control.entity e
      ON e.entity_code = exp.entity_code
     AND e.tenant_id IS NULL
    LEFT JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.version_no = 1
     AND ev.tenant_id IS NULL
    LEFT JOIN control.entity_field ef
      ON ef.entity_version_id = ev.id
     AND ef.name = exp.field_name
    WHERE ef.name IS NULL
       OR ef.enum_domain_code IS DISTINCT FROM exp.domain_code;

    IF v_issue IS NOT NULL THEN
        RAISE WARNING '044b prototype enum domain contract drift: %', v_issue;
    END IF;

    WITH expected(entity_code, field_name, group_key) AS (
      VALUES
        ('site'::text, 'site_type'::text, 'profile'::text),
        ('site', 'description', 'profile'),
        ('site', 'level_no', 'profile'),
        ('site', 'capacity_value', 'profile'),
        ('site', 'company_code_id', 'reference'),
        ('site', 'parent_site_id', 'reference'),
        ('site', 'country_code', 'reference'),
        ('site', 'timezone_code', 'reference'),
        ('site', 'manager_id', 'reference'),
        ('site', 'capacity_uom', 'reference'),
        ('warehouse'::text, 'warehouse_type'::text, 'profile'::text),
        ('warehouse', 'description', 'profile'),
        ('warehouse', 'is_negative_stock_allowed', 'config'),
        ('warehouse', 'site_id', 'reference'),
        ('warehouse', 'manager_id', 'reference')
    )
    SELECT string_agg(exp.entity_code || '.' || exp.field_name, ', ' ORDER BY exp.entity_code, exp.field_name)
      INTO v_issue
    FROM expected exp
    LEFT JOIN control.entity e
      ON e.entity_code = exp.entity_code
     AND e.tenant_id IS NULL
    LEFT JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.version_no = 1
     AND ev.tenant_id IS NULL
    LEFT JOIN control.entity_field ef
      ON ef.entity_version_id = ev.id
     AND ef.name = exp.field_name
    WHERE ef.name IS NULL
       OR ef.group_key IS DISTINCT FROM exp.group_key;

    IF v_issue IS NOT NULL THEN
        RAISE WARNING '044b prototype group_key contract drift: %', v_issue;
    END IF;
END $$;


DO $$
BEGIN
    RAISE NOTICE '044b site+warehouse metadata: all 10 sections complete';
    RAISE NOTICE '  site ops:      %', (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL AND entity_name = 'site');
    RAISE NOTICE '  site fields:   %', (
        SELECT count(*) FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.entity_code = 'site' AND ev.version_no = 1
    );
    RAISE NOTICE '  wh ops:        %', (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL AND entity_name = 'warehouse');
    RAISE NOTICE '  wh fields:     %', (
        SELECT count(*) FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.entity_code = 'warehouse' AND ev.version_no = 1
    );
END $$;
