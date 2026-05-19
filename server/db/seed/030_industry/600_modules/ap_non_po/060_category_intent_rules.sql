-- ============================================================================
-- FILE: blueprint/060_category_intent_rules.sql
-- Purpose: Seed root-container classification to domain intent rules for each
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
--               BANK,SAFETY,ENV,OUTSRC,SUBS) -> BI-OPEX
--   CAPEX roots (SC-CAPEQUIP)                -> BI-CAPEX
--   Direct-ops roots with COGS nature
--     (SC-RAW,COMP,PKG,CONSUM,MRO,PRODSVC,CONTRACT,FREIGHT,WHSE,QC,TEMPWK,
--      PROCNRG)                              -> BI-COGS
--   Regulatory roots (SC-TAX)                -> BI-REG
-- ============================================================================

DO $seed_cat_intent_rules$
DECLARE
    v_tenant  record;
    v_map     record;
    v_tid     uuid;
    v_sys     uuid := '00000000-0000-0000-0000-000000000000';
    v_sc_id   uuid;
    v_bi_id   uuid;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id = v_tid AND status = 'active') THEN
        RAISE EXCEPTION '[seed] active tenant % not found', v_tid;
    END IF;

    -- ── Step A: Ensure 3 generic intents exist ────────────────────────────────
    FOR v_tenant IN
        SELECT id AS tenant_id FROM master.tenant WHERE id = v_tid AND status = 'active'
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM master.business_intent
            WHERE tenant_id = v_tenant.tenant_id
              AND code IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-REG')
            GROUP BY tenant_id
            HAVING count(*) = 4
        ) THEN
            RAISE EXCEPTION '060_category_intent_rules: domain business intents missing for tenant %; run 021 first',
                v_tenant.tenant_id;
        END IF;
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
    ('SC-IT',      'BI-OPEX', 'OPEX',  'IT root container — OPEX fallback'),
    ('SC-TELCO',   'BI-OPEX', 'OPEX',  'Telecom root container — OPEX fallback'),
    ('SC-OFFICE',  'BI-OPEX', 'OPEX',  'Office root container — OPEX fallback'),
    ('SC-HR',      'BI-OPEX', 'OPEX',  'HR root container — OPEX fallback'),
    ('SC-TRAVEL',  'BI-OPEX', 'OPEX',  'Travel root container — OPEX fallback'),
    ('SC-PROF',    'BI-OPEX', 'OPEX',  'Professional services root — OPEX fallback'),
    ('SC-MKTG',    'BI-OPEX', 'OPEX',  'Marketing root container — OPEX fallback'),
    ('SC-FAC',     'BI-OPEX', 'OPEX',  'Facilities root container — OPEX fallback'),
    ('SC-UTIL',    'BI-OPEX', 'OPEX',  'Utilities root container — OPEX fallback'),
    ('SC-FLEET',   'BI-OPEX', 'OPEX',  'Fleet root container — OPEX fallback'),
    ('SC-INS',     'BI-OPEX', 'OPEX',  'Insurance root container — OPEX fallback'),
    ('SC-BANK',    'BI-OPEX', 'OPEX',  'Banking root container — OPEX fallback'),
    ('SC-SAFETY',  'BI-OPEX', 'OPEX',  'Safety/HSE root container — OPEX fallback'),
    ('SC-ENV',     'BI-OPEX', 'OPEX',  'ESG/Environmental root — OPEX fallback'),
    ('SC-OUTSRC',  'BI-OPEX', 'OPEX',  'Outsourcing root container — OPEX fallback'),
    ('SC-SUBS',    'BI-OPEX', 'OPEX',  'Subscriptions root container — OPEX fallback'),
    -- ── Regulatory root ─────────────────────────────────────────────────────
    ('SC-TAX',     'BI-REG','REGULATORY', 'Tax/duties root — regulatory fallback'),
    -- ── CAPEX root ──────────────────────────────────────────────────────────
    ('SC-CAPEQUIP','BI-CAPEX','CAPEX', 'Capital equipment root — CAPEX fallback'),
    -- ── Direct-operations roots (COGS nature; AP still posts as AP) ─────────
    ('SC-RAW',     'BI-COGS', 'COST_OF_SALES',  'Raw materials root — cost of sales fallback'),
    ('SC-COMP',    'BI-COGS', 'COST_OF_SALES',  'Components root — cost of sales fallback'),
    ('SC-PKG',     'BI-COGS', 'COST_OF_SALES',  'Packaging root — cost of sales fallback'),
    ('SC-CONSUM',  'BI-COGS', 'COST_OF_SALES',  'Consumables root — cost of sales fallback'),
    ('SC-MRO',     'BI-COGS', 'COST_OF_SALES',  'MRO root — cost of sales fallback'),
    ('SC-PRODSVC', 'BI-COGS', 'COST_OF_SALES',  'Production services root — cost of sales fallback'),
    ('SC-CONTRACT','BI-COGS', 'COST_OF_SALES',  'Contract manufacturing root — cost of sales fallback'),
    ('SC-FREIGHT', 'BI-COGS', 'COST_OF_SALES',  'Freight/logistics root — cost of sales fallback'),
    ('SC-WHSE',    'BI-COGS', 'COST_OF_SALES',  'Warehousing root — cost of sales fallback'),
    ('SC-QC',      'BI-COGS', 'COST_OF_SALES',  'Quality/testing root — cost of sales fallback'),
    ('SC-TEMPWK',  'BI-COGS', 'COST_OF_SALES',  'Temporary works root — cost of sales fallback'),
    ('SC-PROCNRG', 'BI-COGS', 'COST_OF_SALES',  'Process energy root — cost of sales fallback');

    -- ── Step C: Insert rules per tenant ──────────────────────────────────────
    FOR v_tenant IN
        SELECT id AS tenant_id FROM master.tenant WHERE id = v_tid AND status = 'active'
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

    RAISE NOTICE 'blueprint/060_category_intent_rules: root container fallback rules seeded for tenant %', v_tid;
END $seed_cat_intent_rules$;
