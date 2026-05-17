-- ============================================================================
-- FILE: blueprint/060_category_intent_rules.sql
-- Purpose: Seed three generic fallback business_intents + root-container
--          classification → intent rules for each of the 30 base spend roots
-- Depends on: master.commodity_category (from universal 028), master.business_intent
-- Idempotent: business_intents via ON CONFLICT DO NOTHING;
--             rules via WHERE NOT EXISTS
--
-- Priority 999 — fires ONLY when no leaf-level rule from 061/062 matched.
-- Leaf rules (061/062) always use priority ≤ 500, so these are true last-resort
-- fallbacks for the rare case where a container root is selected directly.
--
-- Root → intent domain mapping
--   OPEX roots (SC-IT,TELCO,OFFICE,HR,TRAVEL,PROF,MKTG,FAC,UTIL,FLEET,INS,
--               BANK,SAFETY,ENV,OUTSRC,SUBS) → OPEX_GENERAL
--   CAPEX roots (SC-CAPEQUIP)                → CAPEX_GENERAL
--   Direct-ops roots with COGS nature
--     (SC-RAW,COMP,PKG,CONSUM,MRO,PRODSVC,CONTRACT,FREIGHT,WHSE,QC,TEMPWK,
--      PROCNRG)                              → OPEX_GENERAL (AP still posts as AP)
--   Admin/regulatory roots (SC-TAX)          → ADMIN_GENERAL
-- ============================================================================

DO $seed_cat_intent_rules$
DECLARE
    v_tenant  record;
    v_map     record;
    v_sys     uuid := '00000000-0000-0000-0000-000000000000';
    v_sc_id   uuid;
    v_bi_id   uuid;
BEGIN
    -- ── Step A: Ensure 3 generic intents exist ────────────────────────────────
    FOR v_tenant IN
        SELECT id AS tenant_id FROM master.tenant WHERE status = 'active'
    LOOP
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
             'Fallback intent for administrative and regulatory expenses.',
             'ADMIN', 'active', v_sys, 120)
        ON CONFLICT (tenant_id, code) DO NOTHING;
    END LOOP;

    -- ── Step B: Root container → intent mapping table ─────────────────────────
    CREATE TEMP TABLE IF NOT EXISTS tmp_root_intent_map (
        sc_code     text  NOT NULL,
        bi_code     text  NOT NULL,
        bi_domain   text  NOT NULL,
        explanation text  NOT NULL
    ) ON COMMIT DROP;

    TRUNCATE tmp_root_intent_map;

    INSERT INTO tmp_root_intent_map (sc_code, bi_code, bi_domain, explanation) VALUES
    -- ── Universal / OPEX roots ──────────────────────────────────────────────
    ('SC-IT',      'OPEX_GENERAL', 'OPEX',  'IT root container — OPEX fallback'),
    ('SC-TELCO',   'OPEX_GENERAL', 'OPEX',  'Telecom root container — OPEX fallback'),
    ('SC-OFFICE',  'OPEX_GENERAL', 'OPEX',  'Office root container — OPEX fallback'),
    ('SC-HR',      'OPEX_GENERAL', 'OPEX',  'HR root container — OPEX fallback'),
    ('SC-TRAVEL',  'OPEX_GENERAL', 'OPEX',  'Travel root container — OPEX fallback'),
    ('SC-PROF',    'OPEX_GENERAL', 'OPEX',  'Professional services root — OPEX fallback'),
    ('SC-MKTG',    'OPEX_GENERAL', 'OPEX',  'Marketing root container — OPEX fallback'),
    ('SC-FAC',     'OPEX_GENERAL', 'OPEX',  'Facilities root container — OPEX fallback'),
    ('SC-UTIL',    'OPEX_GENERAL', 'OPEX',  'Utilities root container — OPEX fallback'),
    ('SC-FLEET',   'OPEX_GENERAL', 'OPEX',  'Fleet root container — OPEX fallback'),
    ('SC-INS',     'OPEX_GENERAL', 'OPEX',  'Insurance root container — OPEX fallback'),
    ('SC-BANK',    'OPEX_GENERAL', 'OPEX',  'Banking root container — OPEX fallback'),
    ('SC-SAFETY',  'OPEX_GENERAL', 'OPEX',  'Safety/HSE root container — OPEX fallback'),
    ('SC-ENV',     'OPEX_GENERAL', 'OPEX',  'ESG/Environmental root — OPEX fallback'),
    ('SC-OUTSRC',  'OPEX_GENERAL', 'OPEX',  'Outsourcing root container — OPEX fallback'),
    ('SC-SUBS',    'OPEX_GENERAL', 'OPEX',  'Subscriptions root container — OPEX fallback'),
    -- ── Regulatory root ─────────────────────────────────────────────────────
    ('SC-TAX',     'ADMIN_GENERAL','ADMIN', 'Tax/duties root — Admin fallback'),
    -- ── CAPEX root ──────────────────────────────────────────────────────────
    ('SC-CAPEQUIP','CAPEX_GENERAL','CAPEX', 'Capital equipment root — CAPEX fallback'),
    -- ── Direct-operations roots (COGS nature; AP still posts as AP) ─────────
    ('SC-RAW',     'OPEX_GENERAL', 'OPEX',  'Raw materials root — OPEX fallback (AP post)'),
    ('SC-COMP',    'OPEX_GENERAL', 'OPEX',  'Components root — OPEX fallback'),
    ('SC-PKG',     'OPEX_GENERAL', 'OPEX',  'Packaging root — OPEX fallback'),
    ('SC-CONSUM',  'OPEX_GENERAL', 'OPEX',  'Consumables root — OPEX fallback'),
    ('SC-MRO',     'OPEX_GENERAL', 'OPEX',  'MRO root — OPEX fallback'),
    ('SC-PRODSVC', 'OPEX_GENERAL', 'OPEX',  'Production services root — OPEX fallback'),
    ('SC-CONTRACT','OPEX_GENERAL', 'OPEX',  'Contract manufacturing root — OPEX fallback'),
    ('SC-FREIGHT', 'OPEX_GENERAL', 'OPEX',  'Freight/logistics root — OPEX fallback'),
    ('SC-WHSE',    'OPEX_GENERAL', 'OPEX',  'Warehousing root — OPEX fallback'),
    ('SC-QC',      'OPEX_GENERAL', 'OPEX',  'Quality/testing root — OPEX fallback'),
    ('SC-TEMPWK',  'OPEX_GENERAL', 'OPEX',  'Temporary works root — OPEX fallback'),
    ('SC-PROCNRG', 'OPEX_GENERAL', 'OPEX',  'Process energy root — OPEX fallback');

    -- ── Step C: Insert rules per tenant ──────────────────────────────────────
    FOR v_tenant IN
        SELECT id AS tenant_id FROM master.tenant WHERE status = 'active'
    LOOP
        FOR v_map IN SELECT * FROM tmp_root_intent_map LOOP

            SELECT id INTO v_sc_id
              FROM master.commodity_category
             WHERE tenant_id = v_tenant.tenant_id AND code = v_map.sc_code;

            SELECT id INTO v_bi_id
              FROM master.business_intent
             WHERE tenant_id = v_tenant.tenant_id AND code = v_map.bi_code;

            CONTINUE WHEN v_sc_id IS NULL OR v_bi_id IS NULL;

            INSERT INTO control.commodity_classification_to_intent_rule (
                tenant_id, classification_source, classification_id, direction,
                condition_type, condition_config, applies_to_flows,
                resolved_intent_id, resolved_domain,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT v_tenant.tenant_id, 'COMMODITY_CATEGORY', v_sc_id, 'INBOUND',
                   'FALLBACK', '{}'::jsonb, ARRAY['NON_PO','DIRECT_PURCHASE'],
                   v_bi_id, v_map.bi_domain,
                   v_map.explanation, 0.60, 999,
                   CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id            = v_tenant.tenant_id
                   AND classification_source = 'COMMODITY_CATEGORY'
                   AND classification_id   = v_sc_id
                   AND condition_type      = 'FALLBACK'
                   AND resolved_intent_id  = v_bi_id
            );

        END LOOP;
    END LOOP;

    RAISE NOTICE 'blueprint/060_category_intent_rules: 3 generic intents + root container fallback rules seeded across all active tenants';
END $seed_cat_intent_rules$;
