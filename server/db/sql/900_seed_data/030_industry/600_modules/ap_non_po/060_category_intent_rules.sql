-- ============================================================================
-- FILE: blueprint/060_category_intent_rules.sql
-- Purpose: Seed classification → business_intent routing rules
-- Depends on: master.spend_category, master.business_intent (both from base pack)
-- Idempotent: WHERE NOT EXISTS guard via (tenant_id, classification_source,
--             classification_id, condition_type, resolved_intent_id)
-- ============================================================================
-- 3 rules seeded per tenant (one per top-level OPEX/CAPEX/ADMIN spend group):
--
-- Rule 1: SPEND_CATEGORY=CONSULTING (or OPEX-GENERAL) → OPEX_GENERAL intent
-- Rule 2: SPEND_CATEGORY=IT_EQUIPMENT (or CAPEX-GENERAL) → CAPEX_GENERAL intent
-- Rule 3: SPEND_CATEGORY=ADMIN → ADMIN_GENERAL intent
--
-- Matching behaviour: condition_type='FALLBACK' means the rule matches any
-- transaction for that classification_id. First match by priority wins.
--
-- If the base pack did not create generic OPEX_GENERAL/CAPEX_GENERAL intents,
-- this file creates them (ON CONFLICT DO NOTHING).
-- ============================================================================

DO $seed_cat_intent_rules$
DECLARE
    v_tenant     record;
    v_sys        uuid := '00000000-0000-0000-0000-000000000000';

    v_bi_opex    uuid;
    v_bi_capex   uuid;
    v_bi_admin   uuid;

    v_sc_opex    uuid;
    v_sc_capex   uuid;
    v_sc_admin   uuid;
BEGIN
    FOR v_tenant IN
        SELECT id AS tenant_id FROM master.tenant WHERE status = 'active'
    LOOP
        -- Ensure fallback business_intents exist for this tenant
        INSERT INTO master.business_intent
            (tenant_id, code, name, description, domain, status, created_by, sort_order)
        VALUES
            (v_tenant.tenant_id, 'OPEX_GENERAL',
             'General OPEX',
             'Fallback intent for operating expenses without a more specific classification.',
             'OPEX', 'active', v_sys, 100),
            (v_tenant.tenant_id, 'CAPEX_GENERAL',
             'General CAPEX',
             'Fallback intent for capital expenditure without a more specific classification.',
             'CAPEX', 'active', v_sys, 110),
            (v_tenant.tenant_id, 'ADMIN_GENERAL',
             'General Admin',
             'Fallback intent for administrative expenses.',
             'ADMIN', 'active', v_sys, 120)
        ON CONFLICT (tenant_id, code) DO NOTHING;

        SELECT id INTO v_bi_opex  FROM master.business_intent
         WHERE tenant_id = v_tenant.tenant_id AND code = 'OPEX_GENERAL';
        SELECT id INTO v_bi_capex FROM master.business_intent
         WHERE tenant_id = v_tenant.tenant_id AND code = 'CAPEX_GENERAL';
        SELECT id INTO v_bi_admin FROM master.business_intent
         WHERE tenant_id = v_tenant.tenant_id AND code = 'ADMIN_GENERAL';

        -- Resolve spend_category ids (from base pack). If not present, skip.
        SELECT id INTO v_sc_opex  FROM master.spend_category
         WHERE tenant_id = v_tenant.tenant_id
           AND code IN ('SC-OPEX-CONSULT','CONSULTING','OPEX')
         ORDER BY sort_order LIMIT 1;

        SELECT id INTO v_sc_capex FROM master.spend_category
         WHERE tenant_id = v_tenant.tenant_id
           AND code IN ('SC-CAPEX-IT','IT_EQUIPMENT','CAPEX','FIXED_ASSETS')
         ORDER BY sort_order LIMIT 1;

        SELECT id INTO v_sc_admin FROM master.spend_category
         WHERE tenant_id = v_tenant.tenant_id
           AND code IN ('SC-ADMIN','ADMIN','ADMINISTRATIVE')
         ORDER BY sort_order LIMIT 1;

        -- ── Rule 1: OPEX spend_category → OPEX_GENERAL intent ────────────────
        IF v_sc_opex IS NOT NULL AND v_bi_opex IS NOT NULL THEN
            INSERT INTO control.classification_to_intent_rule (
                tenant_id, classification_source, classification_id, direction,
                condition_type, condition_config, applies_to_flows,
                resolved_intent_id, resolved_domain,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'SPEND_CATEGORY', v_sc_opex, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_opex, 'OPEX',
                   'OPEX spend category → General OPEX intent', 0.80, 500,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id
                   AND classification_source = 'SPEND_CATEGORY'
                   AND classification_id = v_sc_opex
                   AND resolved_intent_id = v_bi_opex
                   AND condition_type = 'FALLBACK'
            );
        END IF;

        -- ── Rule 2: CAPEX spend_category → CAPEX_GENERAL intent ──────────────
        IF v_sc_capex IS NOT NULL AND v_bi_capex IS NOT NULL THEN
            INSERT INTO control.classification_to_intent_rule (
                tenant_id, classification_source, classification_id, direction,
                condition_type, condition_config, applies_to_flows,
                resolved_intent_id, resolved_domain,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'SPEND_CATEGORY', v_sc_capex, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_capex, 'CAPEX',
                   'CAPEX spend category → General CAPEX intent', 0.80, 500,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id
                   AND classification_source = 'SPEND_CATEGORY'
                   AND classification_id = v_sc_capex
                   AND resolved_intent_id = v_bi_capex
                   AND condition_type = 'FALLBACK'
            );
        END IF;

        -- ── Rule 3: ADMIN spend_category → ADMIN_GENERAL intent ──────────────
        IF v_sc_admin IS NOT NULL AND v_bi_admin IS NOT NULL THEN
            INSERT INTO control.classification_to_intent_rule (
                tenant_id, classification_source, classification_id, direction,
                condition_type, condition_config, applies_to_flows,
                resolved_intent_id, resolved_domain,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'SPEND_CATEGORY', v_sc_admin, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_admin, 'ADMIN',
                   'Admin spend category → General Admin intent', 0.80, 500,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.classification_to_intent_rule
                 WHERE tenant_id = v_tenant.tenant_id
                   AND classification_source = 'SPEND_CATEGORY'
                   AND classification_id = v_sc_admin
                   AND resolved_intent_id = v_bi_admin
                   AND condition_type = 'FALLBACK'
            );
        END IF;

    END LOOP;

    RAISE NOTICE 'blueprint/060_category_intent_rules: fallback intents + classification rules seeded';
END $seed_cat_intent_rules$;
