-- ============================================================================
-- control.v_entity_surface_contract_audit
--
-- Reset-time and CI-friendly audit for the normalized runtime surface model.
-- This view identifies entities still depending on legacy display_config
-- surface JSON / field visibility JSON and highlights incomplete normalized
-- surface declarations.
-- ============================================================================

CREATE OR REPLACE VIEW control.v_entity_surface_contract_audit AS
WITH field_legacy AS (
    SELECT
        ev.entity_id,
        COUNT(*) FILTER (
            WHERE ef.visibility IS NOT NULL AND ef.visibility <> '{}'::jsonb
        ) AS fields_with_legacy_visibility,
        COUNT(*) FILTER (
            WHERE ef.ui_hint->'display' ? 'hide_in'
        ) AS fields_with_ui_hint_hide_in,
        COUNT(*) FILTER (
            WHERE ef.editability ? 'editable_in'
        ) AS fields_with_editable_in
    FROM control.entity_version ev
    JOIN control.entity_field ef
      ON ef.entity_version_id = ev.id
    GROUP BY ev.entity_id
),
surface_counts AS (
    SELECT
        es.entity_id,
        COUNT(*) AS surface_count,
        COUNT(*) FILTER (WHERE es.tenant_id IS NULL) AS platform_surface_count,
        COUNT(*) FILTER (WHERE es.tenant_id IS NOT NULL) AS tenant_surface_count,
        COUNT(*) FILTER (WHERE es.is_enabled = true) AS enabled_surface_count,
        COUNT(*) FILTER (
            WHERE es.placement IN ('action_only','mount_only')
        ) AS non_visual_surface_count,
        COUNT(*) FILTER (
            WHERE es.parent_surface_id IS NOT NULL
        ) AS sidecar_surface_count,
        COUNT(*) FILTER (
            WHERE es.kind = 'custom' AND es.renderer_key IS NULL
        ) AS custom_without_renderer_count,
        COUNT(*) FILTER (
            WHERE es.config ?| ARRAY[
                'visible','is_visible','required','readonly',
                'sort_order','order','span','column_span',
                'density','permissions','required_permissions'
            ]
        ) AS surfaces_with_structural_config_keys
    FROM control.entity_surface es
    GROUP BY es.entity_id
),
field_surface_counts AS (
    SELECT
        es.entity_id,
        COUNT(*) AS field_surface_count,
        COUNT(*) FILTER (
            WHERE efs.renderer_config ?| ARRAY[
                'visible','is_visible','required','readonly',
                'sort_order','order','span','column_span','density'
            ]
        ) AS field_surfaces_with_structural_config_keys
    FROM control.entity_surface es
    JOIN control.entity_field_surface efs
      ON efs.entity_surface_id = es.id
    GROUP BY es.entity_id
)
SELECT
    e.id AS entity_id,
    e.tenant_id,
    e.entity_code,
    e.name,
    e.entity_class,
    e.status,
    COALESCE(sc.surface_count, 0) AS surface_count,
    COALESCE(sc.platform_surface_count, 0) AS platform_surface_count,
    COALESCE(sc.tenant_surface_count, 0) AS tenant_surface_count,
    COALESCE(sc.enabled_surface_count, 0) AS enabled_surface_count,
    COALESCE(sc.non_visual_surface_count, 0) AS non_visual_surface_count,
    COALESCE(sc.sidecar_surface_count, 0) AS sidecar_surface_count,
    COALESCE(fsc.field_surface_count, 0) AS field_surface_count,
    (e.display_config->'document_runtime' ? 'surfaces') AS legacy_document_surfaces_present,
    COALESCE(fl.fields_with_legacy_visibility, 0) AS fields_with_legacy_visibility,
    COALESCE(fl.fields_with_ui_hint_hide_in, 0) AS fields_with_ui_hint_hide_in,
    COALESCE(fl.fields_with_editable_in, 0) AS fields_with_editable_in,
    COALESCE(sc.custom_without_renderer_count, 0) AS custom_without_renderer_count,
    COALESCE(sc.surfaces_with_structural_config_keys, 0) AS surfaces_with_structural_config_keys,
    COALESCE(fsc.field_surfaces_with_structural_config_keys, 0) AS field_surfaces_with_structural_config_keys,
    ARRAY_REMOVE(ARRAY[
        CASE
            WHEN COALESCE(sc.surface_count, 0) = 0
             AND e.status IN ('ACTIVE','DEPRECATED')
            THEN 'no_normalized_surfaces'
        END,
        CASE
            WHEN e.display_config->'document_runtime' ? 'surfaces'
            THEN 'legacy_document_runtime_surfaces'
        END,
        CASE
            WHEN COALESCE(fl.fields_with_legacy_visibility, 0) > 0
            THEN 'legacy_field_visibility'
        END,
        CASE
            WHEN COALESCE(fl.fields_with_ui_hint_hide_in, 0) > 0
            THEN 'legacy_ui_hint_hide_in'
        END,
        CASE
            WHEN COALESCE(sc.custom_without_renderer_count, 0) > 0
            THEN 'custom_surface_without_renderer'
        END,
        CASE
            WHEN COALESCE(sc.surfaces_with_structural_config_keys, 0) > 0
              OR COALESCE(fsc.field_surfaces_with_structural_config_keys, 0) > 0
            THEN 'structural_keys_in_renderer_config'
        END
    ], NULL) AS audit_flags
FROM control.entity e
LEFT JOIN surface_counts sc
  ON sc.entity_id = e.id
LEFT JOIN field_surface_counts fsc
  ON fsc.entity_id = e.id
LEFT JOIN field_legacy fl
  ON fl.entity_id = e.id;

COMMENT ON VIEW control.v_entity_surface_contract_audit IS
    'Audits normalized runtime surface adoption. Flags legacy document_runtime.surfaces, '
    'legacy field visibility/editability hints, missing normalized surfaces, custom surfaces '
    'without renderer_key, and structural keys placed in renderer config JSON.';
