-- ============================================================================
-- control/07z_v_entity_field_contract_audit.sql
-- Concept: Audit view referenced by docs/local/entity-field-contract.md.
-- Surfaces field-contract gaps, computed-flag completeness, and migration
-- candidates (legacy keys still present in active rows).
-- Depends on: control.entity_field, control.entity_version, control.entity
-- ============================================================================

CREATE OR REPLACE VIEW control.v_entity_field_contract_audit AS
WITH base AS (
    SELECT
        e.table_schema,
        e.table_name,
        e.entity_code,
        e.tenant_id      AS entity_tenant_id,
        ev.id            AS entity_version_id,
        ev.version_no,
        ev.status        AS version_status,
        ef.id            AS field_id,
        ef.tenant_id     AS field_tenant_id,
        ef.name          AS field_name,
        ef.column_name,
        ef.origin,
        ef.data_type,
        ef.is_active,
        ef.is_required,
        ef.is_read_only,
        ef.is_computed,
        ef.is_write_once,
        ef.editability,
        ef.visibility,
        ef.ui_hint,
        ef.validation,
        ef.reference_config
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity e          ON e.id  = ev.entity_id
)
SELECT
    table_schema,
    table_name,
    entity_code,
    field_name,
    column_name,
    origin,
    data_type,
    is_active,
    is_computed,
    is_read_only,

    -- Field-level rule presence
    CASE WHEN editability IS NOT NULL
              AND editability ? 'editable_in_status'
              AND jsonb_array_length(editability->'editable_in_status') > 0
         THEN true ELSE false
    END AS has_editable_in_status,

    CASE WHEN COALESCE(ui_hint->'display'->'visible_when', visibility->'when') IS NOT NULL
         THEN true ELSE false
    END AS has_visible_when,

    CASE WHEN visibility ? 'hideIn' OR visibility ? 'hide_in'
              OR ui_hint->'display' ? 'hide_in'
         THEN true ELSE false
    END AS has_hide_in,

    -- Migration / hygiene flags (per docs/local/entity-field-contract.md)
    --
    -- (A) Active field of business/standard origin missing both an editability
    --     gate and an explicit is_read_only/is_computed flag — this is a
    --     candidate for the next seed batch.
    CASE
        WHEN is_active = true
          AND origin IN ('standard', 'business')
          AND is_read_only = false
          AND COALESCE(is_computed, false) = false
          AND NOT (editability ? 'editable_in_status'
                   AND jsonb_array_length(editability->'editable_in_status') > 0)
          AND NOT (editability ? 'editable' AND (editability->>'editable')::boolean = false)
        THEN true ELSE false
    END AS missing_field_rule,

    -- (B) Top-level visibility blob still populated — should migrate to
    --     ui_hint.display.visible_when / hide_in per phase-4 plan.
    CASE WHEN visibility IS NOT NULL AND visibility <> '{}'::jsonb
         THEN true ELSE false
    END AS visibility_legacy_present,

    -- (C) Legacy ref_entity in validation — should migrate to reference_config.
    CASE WHEN validation ? 'ref_entity'
         THEN true ELSE false
    END AS validation_ref_entity_legacy,

    -- (D) is_computed flag absent on engine-maintained derivation columns —
    --     heuristic list of well-known names to flag.
    CASE
        WHEN COALESCE(is_computed, false) = false
         AND field_name IN (
             'gross_amount', 'net_amount', 'total_amount', 'subtotal_amount',
             'payable_amount', 'outstanding_amount', 'tax_amount', 'paid_amount',
             'distributed_amount', 'line_count', 'match_status', 'matched_quantity',
             'budget_check_result'
         )
        THEN true ELSE false
    END AS suspected_unflagged_computed,

    -- (E) Tenant override row present (used by custom-field reporting)
    CASE WHEN field_tenant_id IS NOT NULL THEN true ELSE false END AS is_tenant_override,

    -- Audit timestamps and raw payloads for drill-down
    editability,
    visibility,
    ui_hint,
    entity_version_id,
    field_id

FROM base
WHERE version_status = 'EFFECTIVE';

COMMENT ON VIEW control.v_entity_field_contract_audit IS
    'Field-contract audit: flags missing rules, legacy keys, and suspected unflagged computed fields. '
    'Filter WHERE missing_field_rule for next-sprint seed candidates; WHERE visibility_legacy_present '
    'for the ui_hint migration backlog; WHERE suspected_unflagged_computed to catch derivation drift.';


-- ── Convenience: per-entity rule coverage summary ──────────────────────────
CREATE OR REPLACE VIEW control.v_entity_field_rule_coverage AS
SELECT
    table_schema,
    table_name,
    entity_code,
    COUNT(*)                                                       AS total_fields,
    COUNT(*) FILTER (WHERE is_active)                              AS active_fields,
    COUNT(*) FILTER (WHERE has_editable_in_status)                 AS fields_with_editable_gate,
    COUNT(*) FILTER (WHERE has_visible_when)                       AS fields_with_visible_when,
    COUNT(*) FILTER (WHERE is_computed)                            AS fields_flagged_computed,
    COUNT(*) FILTER (WHERE missing_field_rule)                     AS fields_missing_rule,
    COUNT(*) FILTER (WHERE visibility_legacy_present)              AS fields_legacy_visibility,
    COUNT(*) FILTER (WHERE suspected_unflagged_computed)           AS fields_suspected_unflagged
FROM control.v_entity_field_contract_audit
GROUP BY table_schema, table_name, entity_code
ORDER BY table_schema, table_name;

COMMENT ON VIEW control.v_entity_field_rule_coverage IS
    'Per-entity counts of field-rule coverage. Run after seed execution to verify '
    'editable_in_status / visible_when / is_computed rules landed for the targeted entities. '
    'fields_missing_rule and fields_suspected_unflagged should trend toward 0 for AP entities.';
