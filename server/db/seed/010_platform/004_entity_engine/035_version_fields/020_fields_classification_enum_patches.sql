-- 035_version_fields/020_fields_classification_enum_patches.sql
-- Patches entity_field rows for commodity_classification_to_intent_rule and
-- commodity_code_to_category_rule to upgrade plain-text columns to
-- proper enum/select fields with enum_domain_code, so that the UI
-- renders dropdown pickers instead of plain text inputs.
--
-- Why: commodity-category rule app registration seeds fields with data_type='string',
-- ui_type='text' and no enum_domain_code for direction, condition_type,
-- resolved_domain, classification_source, and applies_to_flows.
-- This file overlays the correct enum metadata so dropdown choosers appear
-- in the entity detail form and in the Mass Property Update dialog.
--
-- Idempotent: UPDATE … WHERE; safe to re-run.

DO $$
DECLARE
    v_su          uuid := '00000000-0000-0000-0000-000000000000';
    v_ev_cir      uuid;
    v_ev_ccr      uuid;
    v_patched_cir integer := 0;
    v_patched_ccr integer := 0;
BEGIN

    -- ── Resolve entity_version IDs ────────────────────────────────────────────
    SELECT ev.id INTO v_ev_cir
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.entity_code = 'commodity_classification_to_intent_rule'
      AND e.tenant_id IS NULL
    LIMIT 1;

    SELECT ev.id INTO v_ev_ccr
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.entity_code = 'commodity_code_to_category_rule'
      AND e.tenant_id IS NULL
    LIMIT 1;

    -- ══════════════════════════════════════════════════════════════════════════
    -- commodity_classification_to_intent_rule → enum field overrides
    -- ══════════════════════════════════════════════════════════════════════════
    IF v_ev_cir IS NOT NULL THEN

        UPDATE control.entity_field ef
        SET
            data_type        = patch.data_type,
            ui_type          = patch.ui_type,
            enum_domain_code = patch.enum_domain_code,
            updated_at       = now(),
            enum_config      = NULL,
            updated_by       = v_su
        FROM (VALUES
            -- Single-value enum selects
            ('classification_source', 'enum',       'select', 'control.classification_source'),
            ('condition_type',        'enum',       'select', 'control.classification_condition_type'),
            ('resolved_domain',       'enum',       'select', 'control.accounting_domain'),
            ('direction',             'enum',       'select', 'control.classification_direction'),
            -- Multi-value: keep text_array data type, switch ui_type to tags
            -- enum_domain_code provides metadata for future tag-label resolvers
            ('applies_to_flows',      'text_array', 'tags',   'control.procurement_flow_type')
        ) AS patch(col, data_type, ui_type, enum_domain_code)
        WHERE ef.entity_version_id = v_ev_cir
          AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_cir = ROW_COUNT;
        RAISE NOTICE 'commodity_classification_to_intent_rule field patches applied: %', v_patched_cir;

    ELSE
        RAISE NOTICE 'commodity_classification_to_intent_rule entity_version not found — skipping';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- commodity_code_to_category_rule → enum field overrides
    -- ══════════════════════════════════════════════════════════════════════════
    IF v_ev_ccr IS NOT NULL THEN

        UPDATE control.entity_field ef
        SET
            data_type        = patch.data_type,
            ui_type          = patch.ui_type,
            enum_domain_code = patch.enum_domain_code,
            updated_at       = now(),
            enum_config      = NULL,
            updated_by       = v_su
        FROM (VALUES
            ('match_mode', 'enum', 'select', 'control.commodity_match_mode')
        ) AS patch(col, data_type, ui_type, enum_domain_code)
        WHERE ef.entity_version_id = v_ev_ccr
          AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_ccr = ROW_COUNT;
        RAISE NOTICE 'commodity_code_to_category_rule field patches applied: %', v_patched_ccr;

    ELSE
        RAISE NOTICE 'commodity_code_to_category_rule entity_version not found — skipping';
    END IF;

    RAISE NOTICE 'Classification rule enum patches complete (CIR=%, CCR=%)',
        v_patched_cir, v_patched_ccr;

END $$;
