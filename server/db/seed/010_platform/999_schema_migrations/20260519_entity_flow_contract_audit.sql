-- =============================================================================
-- 20260519_entity_flow_contract_audit.sql
-- Purpose: Development audit for metadata-driven intake flow contracts.
-- =============================================================================

CREATE OR REPLACE VIEW control.v_entity_flow_contract_audit AS
WITH active_flows AS (
    SELECT
        ef.id AS flow_id,
        COALESCE(e.entity_code, e.name) AS entity_code,
        ev.version_no,
        ef.flow_code,
        ef.trigger_context,
        ef.tenant_id,
        ef.config
    FROM control.entity_flow ef
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE ef.status = 'active'
), flow_steps AS (
    SELECT
        af.*,
        efs.id AS flow_step_id,
        efs.step_key,
        efs.label AS step_label,
        efs.sort_order AS step_sort_order,
        efs.advance_rule
    FROM active_flows af
    LEFT JOIN control.entity_flow_step efs ON efs.flow_id = af.flow_id
), flow_fields AS (
    SELECT
        fs.*,
        eff.id AS flow_field_id,
        eff.section_key,
        eff.mode,
        eff.sort_order AS field_sort_order,
        ef.id AS entity_field_id,
        ef.name AS field_name,
        ef.is_active AS field_is_active,
        ef.enum_domain_code,
        eff.default_source
    FROM flow_steps fs
    LEFT JOIN control.entity_flow_field eff ON eff.flow_step_id = fs.flow_step_id
    LEFT JOIN control.entity_field ef ON ef.id = eff.entity_field_id
), flow_sections AS (
    SELECT
        fs.*,
        efsec.id AS flow_section_id,
        efsec.section_key,
        efsec.label AS section_label,
        efsec.section_type,
        efsec.entity_code AS child_entity_code,
        efsec.payload_key,
        efsec.field_codes,
        efsec.min_rows,
        efsec.max_rows,
        efsec.permission_code
    FROM flow_steps fs
    LEFT JOIN control.entity_flow_section efsec ON efsec.flow_step_id = fs.flow_step_id
), child_fields AS (
    SELECT
        COALESCE(e.entity_code, e.name) AS entity_code,
        ef.name AS field_name,
        ef.is_active
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE ev.status = 'EFFECTIVE'
), preflight_dimensions AS (
    SELECT
        af.*,
        dimension.value->>'field' AS field_name,
        dimension.value AS dimension_config
    FROM active_flows af
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(af.config->'preflight'->'dimensions', '[]'::jsonb)
    ) AS dimension(value)
    WHERE af.config->'preflight'->>'enabled' = 'true'
      AND COALESCE(dimension.value->>'field', '') <> ''
), required_fields AS (
    SELECT
        fs.*,
        required.value AS required_field_name
    FROM flow_steps fs
    CROSS JOIN LATERAL jsonb_array_elements_text(
        COALESCE(fs.advance_rule->'required_fields', '[]'::jsonb)
    ) AS required(value)
    WHERE fs.flow_step_id IS NOT NULL
), section_field_codes AS (
    SELECT
        fs.*,
        code.value AS field_code
    FROM flow_sections fs
    CROSS JOIN LATERAL jsonb_array_elements_text(
        COALESCE(fs.field_codes, '[]'::jsonb)
    ) AS code(value)
    WHERE fs.flow_section_id IS NOT NULL
), step_counts AS (
    SELECT
        fs.flow_id,
        fs.flow_step_id,
        count(DISTINCT ff.flow_field_id) FILTER (WHERE ff.flow_field_id IS NOT NULL) AS field_count,
        count(DISTINCT sec.flow_section_id) FILTER (WHERE sec.flow_section_id IS NOT NULL) AS section_count
    FROM flow_steps fs
    LEFT JOIN flow_fields ff ON ff.flow_step_id = fs.flow_step_id
    LEFT JOIN flow_sections sec ON sec.flow_step_id = fs.flow_step_id
    GROUP BY fs.flow_id, fs.flow_step_id
)
SELECT
    af.entity_code,
    af.version_no,
    af.flow_code,
    af.trigger_context,
    NULL::text AS step_key,
    NULL::text AS section_key,
    NULL::text AS field_name,
    'active_flow_without_steps'::text AS issue_code,
    'error'::text AS severity,
    jsonb_build_object('flow_id', af.flow_id) AS details
FROM active_flows af
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow_step efs WHERE efs.flow_id = af.flow_id
)

UNION ALL

SELECT
    fs.entity_code,
    fs.version_no,
    fs.flow_code,
    fs.trigger_context,
    fs.step_key,
    NULL::text,
    NULL::text,
    'step_without_fields_or_sections'::text,
    'error'::text,
    jsonb_build_object('flow_step_id', fs.flow_step_id, 'label', fs.step_label)
FROM flow_steps fs
JOIN step_counts sc ON sc.flow_step_id = fs.flow_step_id
WHERE fs.flow_step_id IS NOT NULL
  AND sc.field_count = 0
  AND sc.section_count = 0

UNION ALL

SELECT
    rf.entity_code,
    rf.version_no,
    rf.flow_code,
    rf.trigger_context,
    rf.step_key,
    NULL::text,
    rf.required_field_name,
    'advance_required_field_not_bound'::text,
    'error'::text,
    jsonb_build_object('advance_rule', rf.advance_rule)
FROM required_fields rf
WHERE NOT EXISTS (
    SELECT 1
    FROM flow_fields ff
    WHERE ff.flow_step_id = rf.flow_step_id
      AND ff.field_name = rf.required_field_name
)

UNION ALL

SELECT
    ff.entity_code,
    ff.version_no,
    ff.flow_code,
    ff.trigger_context,
    ff.step_key,
    ff.section_key,
    ff.field_name,
    'flow_field_binds_inactive_entity_field'::text,
    'error'::text,
    jsonb_build_object('entity_field_id', ff.entity_field_id, 'flow_field_id', ff.flow_field_id)
FROM flow_fields ff
WHERE ff.flow_field_id IS NOT NULL
  AND ff.field_is_active IS NOT TRUE

UNION ALL

SELECT
    pd.entity_code,
    pd.version_no,
    pd.flow_code,
    pd.trigger_context,
    NULL::text,
    NULL::text,
    pd.field_name,
    'preflight_dimension_field_not_bound'::text,
    'error'::text,
    jsonb_build_object('dimension', pd.dimension_config)
FROM preflight_dimensions pd
WHERE NOT EXISTS (
    SELECT 1
      FROM flow_fields ff
     WHERE ff.flow_id = pd.flow_id
       AND ff.field_name = pd.field_name
)

UNION ALL

SELECT
    pd.entity_code,
    pd.version_no,
    pd.flow_code,
    pd.trigger_context,
    ff.step_key,
    ff.section_key,
    pd.field_name,
    'preflight_dimension_missing_enum_domain'::text,
    'error'::text,
    jsonb_build_object(
        'dimension', pd.dimension_config,
        'data_source_hint', ff.default_source,
        'recommendation', 'Set control.entity_field.enum_domain_code so the preflight chooser can load lookup values.'
    )
FROM preflight_dimensions pd
JOIN flow_fields ff
  ON ff.flow_id = pd.flow_id
 AND ff.field_name = pd.field_name
WHERE ff.enum_domain_code IS NULL

UNION ALL

SELECT
    ff.entity_code,
    ff.version_no,
    ff.flow_code,
    ff.trigger_context,
    ff.step_key,
    ff.section_key,
    ff.field_name,
    'flow_field_section_key_missing'::text,
    'error'::text,
    jsonb_build_object('flow_field_id', ff.flow_field_id, 'section_key', ff.section_key)
FROM flow_fields ff
WHERE ff.flow_field_id IS NOT NULL
  AND ff.section_key IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM flow_sections sec
      WHERE sec.flow_step_id = ff.flow_step_id
        AND sec.section_key = ff.section_key
  )

UNION ALL

SELECT
    sec.entity_code,
    sec.version_no,
    sec.flow_code,
    sec.trigger_context,
    sec.step_key,
    sec.section_key,
    NULL::text,
    'repeater_section_without_child_entity'::text,
    'error'::text,
    jsonb_build_object('section_type', sec.section_type, 'payload_key', sec.payload_key)
FROM flow_sections sec
WHERE sec.flow_section_id IS NOT NULL
  AND sec.section_type IN ('repeater', 'singleton')
  AND COALESCE(sec.child_entity_code, '') = ''

UNION ALL

SELECT
    sec.entity_code,
    sec.version_no,
    sec.flow_code,
    sec.trigger_context,
    sec.step_key,
    sec.section_key,
    NULL::text,
    'repeater_section_without_payload_key'::text,
    'error'::text,
    jsonb_build_object('section_type', sec.section_type, 'child_entity_code', sec.child_entity_code)
FROM flow_sections sec
WHERE sec.flow_section_id IS NOT NULL
  AND sec.section_type IN ('repeater', 'singleton')
  AND COALESCE(sec.payload_key, '') = ''

UNION ALL

SELECT
    sfc.entity_code,
    sfc.version_no,
    sfc.flow_code,
    sfc.trigger_context,
    sfc.step_key,
    sfc.section_key,
    sfc.field_code,
    'section_child_field_missing_or_inactive'::text,
    'error'::text,
    jsonb_build_object('child_entity_code', sfc.child_entity_code, 'field_codes', sfc.field_codes)
FROM section_field_codes sfc
LEFT JOIN child_fields cf
  ON cf.entity_code = sfc.child_entity_code
 AND cf.field_name = sfc.field_code
 AND cf.is_active = true
WHERE sfc.section_type IN ('repeater', 'singleton')
  AND cf.field_name IS NULL

UNION ALL

SELECT
    sec.entity_code,
    sec.version_no,
    sec.flow_code,
    sec.trigger_context,
    sec.step_key,
    sec.section_key,
    NULL::text,
    'section_permission_missing'::text,
    'error'::text,
    jsonb_build_object('permission_code', sec.permission_code)
FROM flow_sections sec
WHERE sec.flow_section_id IS NOT NULL
  AND sec.permission_code IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM shared.permission p
      WHERE p.code = sec.permission_code
        AND p.status = 'active'
  )

UNION ALL

SELECT
    sec.entity_code,
    sec.version_no,
    sec.flow_code,
    sec.trigger_context,
    sec.step_key,
    sec.section_key,
    NULL::text,
    'section_field_codes_drive_ui_columns'::text,
    'warning'::text,
    jsonb_build_object(
        'child_entity_code', sec.child_entity_code,
        'recommendation', 'Move visible column intent to section display_config.visible_columns when display differs from payload fields.'
    )
FROM flow_sections sec
WHERE sec.flow_section_id IS NOT NULL
  AND sec.section_type IN ('repeater', 'singleton')
  AND jsonb_array_length(COALESCE(sec.field_codes, '[]'::jsonb)) > 0;

COMMENT ON VIEW control.v_entity_flow_contract_audit IS
    'Development audit for control.entity_flow, entity_flow_step, entity_flow_section, and entity_flow_field runtime contract wiring.';

DO $$
DECLARE
    v_errors integer := 0;
    v_warnings integer := 0;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE severity = 'error'),
        COUNT(*) FILTER (WHERE severity = 'warning')
      INTO v_errors, v_warnings
      FROM control.v_entity_flow_contract_audit;

    IF v_errors > 0 OR v_warnings > 0 THEN
        RAISE WARNING 'entity_flow contract audit: % error(s), % warning(s). Inspect control.v_entity_flow_contract_audit.', v_errors, v_warnings;
    ELSE
        RAISE NOTICE 'entity_flow contract audit clean';
    END IF;
END $$;
