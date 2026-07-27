-- ============================================================================
-- 092_control_entity_surface_contract.sql
--
-- Normalizes existing entity/display/field seed metadata into:
--   - control.entity_surface
--   - control.entity_field_surface
--
-- This file is deliberately derived from existing authored metadata:
--   entity.display_config.list_columns
--   entity.display_config.print_config
--   entity.feature_flags
--   entity_field.group_key / sort_order
--   entity_field.visibility / ui_hint.display.hide_in
--   entity_relation rows
--
-- It gives every active/deprecated platform entity a minimal normalized runtime
-- surface contract while keeping legacy JSON as compatibility input during the
-- compiler dual-read window.
-- ============================================================================

BEGIN;

WITH constants AS (
    SELECT '00000000-0000-0000-0000-000000000000'::uuid AS system_user_id
),
entity_base AS (
    SELECT
        e.*,
        COALESCE(e.display_config, '{}'::jsonb) AS dc,
        COALESCE(e.feature_flags, '{}'::jsonb) AS flags
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.status IN ('ACTIVE', 'DEPRECATED')
      AND COALESCE((e.feature_flags->>'is_hidden')::boolean, false) = false
),
field_groups AS (
    SELECT
        ev.entity_id,
        COALESCE(
            ARRAY_AGG(DISTINCT ef.group_key ORDER BY ef.group_key)
                FILTER (WHERE ef.group_key IS NOT NULL),
            ARRAY[]::text[]
        ) AS group_keys
    FROM control.entity_version ev
    JOIN control.entity_field ef
      ON ef.entity_version_id = ev.id
    WHERE ev.tenant_id IS NULL
      AND ev.version_no = 1
      AND ef.is_active = true
      AND ef.is_deprecated = false
    GROUP BY ev.entity_id
),
surfaces AS (
    SELECT
        eb.id AS entity_id,
        s.mode,
        s.surface_key,
        s.kind,
        s.placement,
        s.label,
        s.icon_key,
        s.group_keys,
        s.relation_name,
        s.renderer_key,
        s.composer_key,
        s.strategy_key,
        s.column_count,
        s.print_span,
        s.density,
        s.required_permissions,
        s.visibility_expr,
        s.sort_order,
        s.is_enabled,
        s.config
    FROM entity_base eb
    LEFT JOIN field_groups fg
      ON fg.entity_id = eb.id
    CROSS JOIN LATERAL (
        VALUES
            (
                'list',
                'list',
                'list',
                'main',
                COALESCE(eb.label_plural, eb.name),
                eb.icon_key,
                ARRAY[]::text[],
                NULL::text,
                COALESCE(eb.dc->>'list_renderer', 'table'),
                NULL::text,
                NULL::text,
                NULL::smallint,
                NULL::text,
                COALESCE(eb.dc->>'list_density', 'compact'),
                ARRAY[]::text[],
                NULL::jsonb,
                10::smallint,
                (eb.runtime_enabled = true AND eb.read_capability <> 'none' AND eb.entity_class <> 'AGGREGATE'),
                jsonb_strip_nulls(jsonb_build_object(
                    'title_field', eb.dc->>'title_field',
                    'subtitle_field', eb.dc->>'subtitle_field',
                    'default_sort_field', eb.dc->>'default_sort_field',
                    'default_sort_order', eb.dc->>'default_sort_order',
                    'view_modes', eb.dc->'view_modes',
                    'compact_card', eb.dc->'compact_card'
                ))
            ),
            (
                'view',
                'details_fields',
                'fields',
                'main',
                'Details',
                NULL::text,
                COALESCE(fg.group_keys, ARRAY[]::text[]),
                NULL::text,
                COALESCE(eb.dc->>'detail_renderer', 'fields'),
                NULL::text,
                NULL::text,
                NULL::smallint,
                NULL::text,
                COALESCE(eb.dc->>'detail_density', 'comfortable'),
                ARRAY[]::text[],
                NULL::jsonb,
                10::smallint,
                eb.runtime_enabled = true AND eb.read_capability <> 'none',
                jsonb_strip_nulls(jsonb_build_object(
                    'detail_profile', eb.dc->>'detail_profile',
                    'title_field', eb.dc->>'title_field',
                    'subtitle_field', eb.dc->>'subtitle_field'
                ))
            ),
            (
                'edit',
                'edit_fields',
                'fields',
                'main',
                'Edit',
                NULL::text,
                COALESCE(fg.group_keys, ARRAY[]::text[]),
                NULL::text,
                'fields',
                NULL::text,
                NULL::text,
                NULL::smallint,
                NULL::text,
                'comfortable',
                ARRAY[]::text[],
                NULL::jsonb,
                10::smallint,
                COALESCE((eb.flags->>'is_readonly')::boolean, false) = false
                    AND eb.runtime_enabled = true
                    AND eb.read_capability <> 'none'
                    AND eb.write_capability <> 'none'
                    AND eb.mutability <> 'locked'
                    AND eb.entity_class NOT IN ('LOG','AGGREGATE'),
                '{}'::jsonb
            ),
            (
                'create',
                'create_fields',
                'fields',
                'main',
                'Create',
                NULL::text,
                COALESCE(fg.group_keys, ARRAY[]::text[]),
                NULL::text,
                'fields',
                NULL::text,
                NULL::text,
                NULL::smallint,
                NULL::text,
                'comfortable',
                ARRAY[]::text[],
                NULL::jsonb,
                10::smallint,
                eb.create_mode <> 'DIRECT_CREATE'
                    AND COALESCE((eb.flags->>'is_readonly')::boolean, false) = false
                    AND eb.runtime_enabled = true
                    AND eb.read_capability <> 'none'
                    AND eb.write_capability <> 'none'
                    AND eb.mutability <> 'locked'
                    AND eb.entity_class NOT IN ('LOG','AGGREGATE'),
                jsonb_build_object('create_mode', eb.create_mode)
            ),
            (
                'print',
                'print',
                'print',
                'main',
                COALESCE(eb.label_singular, eb.name) || ' Print',
                NULL::text,
                COALESCE(fg.group_keys, ARRAY[]::text[]),
                NULL::text,
                COALESCE(eb.dc->'print_config'->>'template', 'entity_print'),
                NULL::text,
                NULL::text,
                CASE
                    WHEN eb.dc->'print_config'->>'layout' = 'two_column' THEN 2::smallint
                    ELSE NULL::smallint
                END,
                'full',
                'document',
                ARRAY[]::text[],
                NULL::jsonb,
                10::smallint,
                COALESCE(
                    (eb.dc ? 'print_config')
                    OR (
                        jsonb_typeof(eb.flags->'print') = 'boolean'
                        AND (eb.flags->>'print')::boolean
                    )
                    OR jsonb_typeof(eb.flags->'print') = 'object',
                    false
                ),
                COALESCE(eb.dc->'print_config', '{}'::jsonb)
            )
    ) AS s(
        mode,
        surface_key,
        kind,
        placement,
        label,
        icon_key,
        group_keys,
        relation_name,
        renderer_key,
        composer_key,
        strategy_key,
        column_count,
        print_span,
        density,
        required_permissions,
        visibility_expr,
        sort_order,
        is_enabled,
        config
    )
)
INSERT INTO control.entity_surface (
    tenant_id,
    entity_id,
    mode,
    surface_key,
    kind,
    placement,
    label,
    icon_key,
    group_keys,
    relation_name,
    renderer_key,
    composer_key,
    strategy_key,
    column_count,
    print_span,
    density,
    required_permissions,
    visibility_expr,
    sort_order,
    is_enabled,
    config,
    created_by
)
SELECT
    NULL,
    entity_id,
    mode,
    surface_key,
    kind,
    placement,
    label,
    icon_key,
    group_keys,
    relation_name,
    renderer_key,
    composer_key,
    strategy_key,
    column_count,
    print_span,
    density,
    required_permissions,
    visibility_expr,
    sort_order,
    is_enabled,
    COALESCE(config, '{}'::jsonb),
    (SELECT system_user_id FROM constants)
FROM surfaces
ON CONFLICT (tenant_id, entity_id, mode, surface_key)
    WHERE entity_version_id IS NULL DO UPDATE
SET kind                 = EXCLUDED.kind,
    placement            = EXCLUDED.placement,
    label                = EXCLUDED.label,
    icon_key             = EXCLUDED.icon_key,
    group_keys           = EXCLUDED.group_keys,
    relation_name        = EXCLUDED.relation_name,
    renderer_key         = EXCLUDED.renderer_key,
    composer_key         = EXCLUDED.composer_key,
    strategy_key         = EXCLUDED.strategy_key,
    column_count         = EXCLUDED.column_count,
    print_span           = EXCLUDED.print_span,
    density              = EXCLUDED.density,
    required_permissions = EXCLUDED.required_permissions,
    visibility_expr      = EXCLUDED.visibility_expr,
    sort_order           = EXCLUDED.sort_order,
    is_enabled           = EXCLUDED.is_enabled,
    config               = EXCLUDED.config,
    updated_at           = now(),
    updated_by           = EXCLUDED.created_by;

-- Child/relation-driven view surfaces.
WITH constants AS (
    SELECT '00000000-0000-0000-0000-000000000000'::uuid AS system_user_id
),
relations AS (
    SELECT
        parent.id AS entity_id,
        er.id AS relation_id,
        er.name AS relation_name,
        er.target_entity,
        er.relation_kind,
        COALESCE(er.ui_behavior, '{}'::jsonb) AS ui_behavior,
        ROW_NUMBER() OVER (
            PARTITION BY parent.id
            ORDER BY COALESCE((er.ui_behavior->>'sort_order')::integer, 500), er.name
        ) AS rn
    FROM control.entity_version ev
    JOIN control.entity parent
      ON parent.id = ev.entity_id
     AND parent.tenant_id IS NULL
    JOIN control.entity_relation er
      ON er.entity_version_id = ev.id
    WHERE ev.tenant_id IS NULL
      AND ev.version_no = 1
      AND parent.status IN ('ACTIVE','DEPRECATED')
      AND parent.runtime_enabled = true
      AND parent.read_capability <> 'none'
      AND COALESCE((er.ui_behavior->>'visible_as_tab')::boolean, true) = true
)
INSERT INTO control.entity_surface (
    tenant_id,
    entity_id,
    mode,
    surface_key,
    kind,
    placement,
    label,
    relation_name,
    renderer_key,
    sort_order,
    is_enabled,
    config,
    created_by
)
SELECT
    NULL,
    entity_id,
    'view',
    'relation_' || lower(regexp_replace(relation_name, '[^a-z0-9_]', '_', 'g'))
        || '_' || left(replace(relation_id::text, '-', ''), 8),
    CASE WHEN relation_kind = 'has_many' THEN 'child_records' ELSE 'custom' END,
    COALESCE(ui_behavior->>'placement', 'subroute'),
    COALESCE(ui_behavior->>'label', initcap(replace(relation_name, '_', ' '))),
    relation_name,
    COALESCE(ui_behavior->>'renderer_key', ui_behavior->>'display_mode'),
    (200 + rn * 10)::smallint,
    true,
    ui_behavior - 'label' - 'placement' - 'renderer_key' - 'visible_as_tab' - 'sort_order',
    (SELECT system_user_id FROM constants)
FROM relations
ON CONFLICT (tenant_id, entity_id, mode, surface_key)
    WHERE entity_version_id IS NULL DO UPDATE
SET kind          = EXCLUDED.kind,
    placement     = EXCLUDED.placement,
    label         = EXCLUDED.label,
    relation_name = EXCLUDED.relation_name,
    renderer_key  = EXCLUDED.renderer_key,
    sort_order    = EXCLUDED.sort_order,
    is_enabled    = EXCLUDED.is_enabled,
    config        = EXCLUDED.config,
    updated_at    = now(),
    updated_by    = EXCLUDED.created_by;

-- Capability-driven auxiliary view surfaces.
WITH constants AS (
    SELECT '00000000-0000-0000-0000-000000000000'::uuid AS system_user_id
),
entity_base AS (
    SELECT
        e.id AS entity_id,
        e.runtime_enabled,
        e.read_capability,
        COALESCE(e.feature_flags, '{}'::jsonb) AS flags
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.status IN ('ACTIVE','DEPRECATED')
      AND e.runtime_enabled = true
      AND e.read_capability <> 'none'
),
surface_specs AS (
    SELECT
        eb.entity_id,
        s.surface_key,
        s.kind,
        s.placement,
        s.label,
        s.sort_order,
        s.is_enabled
    FROM entity_base eb
    CROSS JOIN LATERAL (
        VALUES
            ('attachments', 'attachments', 'subroute', 'Attachments', 700, COALESCE((eb.flags->>'has_attachments')::boolean, false)),
            ('comments', 'comments', 'subroute', 'Comments', 710, COALESCE((eb.flags->>'comments_enabled')::boolean, false)),
            ('workflow', 'workflow', 'subroute', 'Workflow', 720, COALESCE((eb.flags->>'has_workflow')::boolean, false)),
            ('lifecycle', 'lifecycle', 'subroute', 'Lifecycle', 730, COALESCE((eb.flags->>'has_lifecycle')::boolean, false)),
            ('versions', 'versions', 'subroute', 'Versions', 740, COALESCE((eb.flags->>'version_control')::boolean, false)),
            ('activity_log', 'activity_log', 'subroute', 'Activity', 750, COALESCE((eb.flags->>'event_history')::boolean, false)),
            ('distributions', 'distributions', 'context_panel', 'Distributions', 760, COALESCE((eb.flags->>'has_accounting_distribution')::boolean, false))
    ) AS s(surface_key, kind, placement, label, sort_order, is_enabled)
    WHERE s.is_enabled = true
)
INSERT INTO control.entity_surface (
    tenant_id,
    entity_id,
    mode,
    surface_key,
    kind,
    placement,
    label,
    sort_order,
    is_enabled,
    config,
    created_by
)
SELECT
    NULL,
    entity_id,
    'view',
    surface_key,
    kind,
    placement,
    label,
    sort_order::smallint,
    is_enabled,
    '{}'::jsonb,
    (SELECT system_user_id FROM constants)
FROM surface_specs
ON CONFLICT (tenant_id, entity_id, mode, surface_key)
    WHERE entity_version_id IS NULL DO UPDATE
SET kind       = EXCLUDED.kind,
    placement  = EXCLUDED.placement,
    label      = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    is_enabled = EXCLUDED.is_enabled,
    config     = EXCLUDED.config,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;

-- Field memberships for normalized field/list/print surfaces.
WITH constants AS (
    SELECT '00000000-0000-0000-0000-000000000000'::uuid AS system_user_id
),
field_base AS (
    SELECT
        es.id AS entity_surface_id,
        es.mode,
        es.kind,
        e.display_config,
        ef.id AS entity_field_id,
        ef.name,
        ef.sort_order,
        ef.group_key,
        ef.is_required,
        ef.is_read_only,
        COALESCE(ef.visibility, '{}'::jsonb) AS visibility,
        COALESCE(ef.ui_hint, '{}'::jsonb) AS ui_hint,
        COALESCE(ef.editability, '{}'::jsonb) AS editability
    FROM control.entity_surface es
    JOIN control.entity e
      ON e.id = es.entity_id
    JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.tenant_id IS NULL
     AND ev.version_no = 1
    JOIN control.entity_field ef
      ON ef.entity_version_id = ev.id
    WHERE es.tenant_id IS NULL
      AND es.mode IN ('create','edit','view','list','print')
      AND es.kind IN ('fields','list','print')
      AND ef.is_active = true
      AND ef.is_deprecated = false
),
list_columns AS (
    SELECT DISTINCT ON (fb.entity_surface_id, item.value #>> '{}')
        fb.entity_surface_id,
        item.value #>> '{}' AS field_name,
        item.ordinality::smallint AS list_order
    FROM field_base fb
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(fb.display_config->'list_columns', '[]'::jsonb))
        WITH ORDINALITY AS item(value, ordinality)
    WHERE fb.mode = 'list'
    ORDER BY fb.entity_surface_id, item.value #>> '{}', item.ordinality
),
projected AS (
    SELECT
        fb.entity_surface_id,
        fb.entity_field_id,
        CASE
            WHEN fb.mode = 'list' THEN NULL::boolean
            WHEN fb.visibility->>'hidden' = 'true' THEN false
            WHEN fb.visibility ? 'hidden' AND fb.visibility->>'hidden' = 'true' THEN false
            WHEN fb.visibility ? 'hideIn'
             AND fb.visibility->'hideIn' ? CASE WHEN fb.mode = 'view' THEN 'detail' ELSE fb.mode END THEN false
            WHEN fb.visibility ? 'hide_in'
             AND fb.visibility->'hide_in' ? CASE WHEN fb.mode = 'view' THEN 'detail' ELSE fb.mode END THEN false
            WHEN fb.ui_hint->'display' ? 'hide_in'
             AND fb.ui_hint->'display'->'hide_in' ? CASE WHEN fb.mode = 'view' THEN 'detail' ELSE fb.mode END THEN false
            ELSE NULL::boolean
        END AS visible_override,
        CASE WHEN fb.mode = 'create' AND fb.is_required THEN true ELSE NULL::boolean END AS required_override,
        CASE
            WHEN fb.mode IN ('create','edit')
             AND (
                 fb.is_read_only
                 OR fb.editability->>'editableOnCreate' = 'false' AND fb.mode = 'create'
                 OR fb.editability->>'editableOnEdit' = 'false' AND fb.mode = 'edit'
             )
            THEN true
            ELSE NULL::boolean
        END AS readonly_override,
        COALESCE(lc.list_order, fb.sort_order) AS sort_order,
        CASE
            WHEN fb.mode = 'list' THEN NULL::smallint
            WHEN fb.group_key IN ('identity','general','parties','dates','payment') THEN 6::smallint
            ELSE NULL::smallint
        END AS column_span,
        CASE
            WHEN fb.mode = 'list' THEN 'compact'
            WHEN fb.mode = 'print' THEN 'document'
            ELSE NULL::text
        END AS density,
        NULL::text AS renderer_key,
        NULL::text AS editor_key,
        CASE
            WHEN fb.ui_hint->'display' ? 'visible_when' THEN fb.ui_hint->'display'->'visible_when'
            WHEN fb.visibility ? 'when' THEN fb.visibility->'when'
            ELSE NULL::jsonb
        END AS visibility_expr,
        CASE
            WHEN fb.mode IN ('create','edit') AND fb.editability ? 'editable_when'
            THEN fb.editability->'editable_when'
            ELSE NULL::jsonb
        END AS editability_expr,
        '{}'::jsonb AS renderer_config
    FROM field_base fb
    LEFT JOIN list_columns lc
      ON lc.entity_surface_id = fb.entity_surface_id
     AND lc.field_name = fb.name
    WHERE fb.mode <> 'list'
       OR lc.field_name IS NOT NULL
       OR (
            COALESCE(jsonb_array_length(COALESCE(fb.display_config->'list_columns', '[]'::jsonb)), 0) = 0
            AND fb.sort_order <= 80
          )
)
INSERT INTO control.entity_field_surface (
    tenant_id,
    entity_surface_id,
    entity_field_id,
    visible_override,
    required_override,
    readonly_override,
    sort_order,
    column_span,
    density,
    renderer_key,
    editor_key,
    visibility_expr,
    editability_expr,
    renderer_config,
    created_by
)
SELECT
    NULL,
    p.entity_surface_id,
    p.entity_field_id,
    p.visible_override,
    p.required_override,
    p.readonly_override,
    p.sort_order,
    p.column_span,
    p.density,
    p.renderer_key,
    p.editor_key,
    p.visibility_expr,
    p.editability_expr,
    p.renderer_config,
    (SELECT system_user_id FROM constants)
FROM (
    SELECT DISTINCT ON (entity_surface_id, entity_field_id)
        *
    FROM projected
    ORDER BY entity_surface_id, entity_field_id, sort_order NULLS LAST
) p
ON CONFLICT (tenant_id, entity_surface_id, entity_field_id) DO UPDATE
SET visible_override  = EXCLUDED.visible_override,
    required_override = EXCLUDED.required_override,
    readonly_override = EXCLUDED.readonly_override,
    sort_order        = EXCLUDED.sort_order,
    column_span       = EXCLUDED.column_span,
    density           = EXCLUDED.density,
    renderer_key      = EXCLUDED.renderer_key,
    editor_key        = EXCLUDED.editor_key,
    visibility_expr   = EXCLUDED.visibility_expr,
    editability_expr  = EXCLUDED.editability_expr,
    renderer_config   = EXCLUDED.renderer_config,
    updated_at        = now(),
    updated_by        = EXCLUDED.created_by;

-- Contract assertions: all active platform entities have list/view field surfaces.
DO $$
DECLARE
    v_count integer;
    v_sample text;
BEGIN
    SELECT count(*), string_agg(entity_code, ', ' ORDER BY entity_code)
      INTO v_count, v_sample
    FROM (
        SELECT e.entity_code
        FROM control.entity e
        WHERE e.tenant_id IS NULL
          AND e.status IN ('ACTIVE','DEPRECATED')
          AND COALESCE((e.feature_flags->>'is_hidden')::boolean, false) = false
          AND NOT EXISTS (
              SELECT 1
              FROM control.entity_surface es
              WHERE es.entity_id = e.id
                AND es.tenant_id IS NULL
                AND es.mode = 'list'
                AND es.surface_key = 'list'
          )
        ORDER BY e.entity_code
        LIMIT 20
    ) missing;

    IF v_count > 0 THEN
        RAISE EXCEPTION '[092 entity_surface] % active platform entities missing list surface. Sample: %',
            v_count, v_sample;
    END IF;

    SELECT count(*), string_agg(entity_code, ', ' ORDER BY entity_code)
      INTO v_count, v_sample
    FROM (
        SELECT e.entity_code
        FROM control.entity e
        WHERE e.tenant_id IS NULL
          AND e.status IN ('ACTIVE','DEPRECATED')
          AND COALESCE((e.feature_flags->>'is_hidden')::boolean, false) = false
          AND NOT EXISTS (
              SELECT 1
              FROM control.entity_surface es
              WHERE es.entity_id = e.id
                AND es.tenant_id IS NULL
                AND es.mode = 'view'
                AND es.surface_key = 'details_fields'
          )
        ORDER BY e.entity_code
        LIMIT 20
    ) missing;

    IF v_count > 0 THEN
        RAISE EXCEPTION '[092 entity_surface] % active platform entities missing view details surface. Sample: %',
            v_count, v_sample;
    END IF;

    RAISE NOTICE '[092 entity_surface] normalized platform surfaces seeded.';
END $$;

COMMIT;
