-- ============================================================================
-- UNIVERSAL — BASE CLASSIFICATION-TO-INTENT RULES
-- ============================================================================
-- File:     026_base_intent_rules.sql
-- Schema:   control.commodity_classification_to_intent_rule
-- Purpose:  Context-sensitive intent resolution rules for spend categories
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           022_spend_intent_link.sql (default_intent_id already set)
-- Idempotent: Yes — delete-then-insert by pack metadata
-- Spec ref: §10 Confidence Calibration (intent resolution tiers)
-- ============================================================================
-- Execution order: runs LAST in Tier 2 (after 024)
--   020 → 021 → 025 → 022 → 023 → 024 → 026
-- ============================================================================
-- CONTEXT:
-- default_intent_id (set by 022) is the FALLBACK at confidence 0.70.
-- These rules OVERRIDE the fallback when contextual conditions match.
-- The resolver evaluates rules in priority order; highest-confidence
-- matching rule wins. If no rule matches → default_intent_id.
-- ============================================================================
-- condition_type legal values (from DDL CHECK):
--   AMOUNT_ABOVE, AMOUNT_BELOW, IS_RECURRING, IS_ONE_TIME, COMPANY_MATCH,
--   PROCUREMENT_METHOD, CROSS_BORDER, DOC_TYPE_MATCH, COMMODITY_MATCH,
--   SUPPLIER_MATCH, CUSTOMER_MATCH, CUSTOMER_TIER, CONTRACT_TYPE_MATCH,
--   FLOW_MATCH, CHANNEL_MATCH, FALLBACK
-- ============================================================================
-- confidence tiers per §10:
--   0.95–1.00  Definitive condition (e.g., AMOUNT_ABOVE with clear threshold)
--   0.80–0.94  Probable condition (e.g., COMMODITY_MATCH)
--   0.55–0.79  Fallback / heuristic
-- ============================================================================
-- PACK OWNS: All rules with metadata._seed.pack = '026_base'
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '026_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- Verify base spend categories + intents loaded
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT-HW') THEN
        RAISE EXCEPTION 'Base seed not loaded. Run 020 + 022 first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-CAPEX') THEN
        RAISE EXCEPTION 'Base intents not loaded. Run 021 first.';
    END IF;

    -- ── STAGE B: Stage intent rules ──────────────────────────────────────
    CREATE TEMP TABLE tmp_rule (
        sc_code               text NOT NULL,
        condition_type        text NOT NULL,
        condition_config      jsonb NOT NULL DEFAULT '{}',
        applies_to_flows      text[],
        resolved_intent_code  text NOT NULL,
        resolved_domain       text,
        explanation_template  text NOT NULL,
        confidence            numeric(3,2) NOT NULL,
        priority              integer NOT NULL DEFAULT 50
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 1: CAPEX THRESHOLD OVERRIDES (AMOUNT_ABOVE)
    -- When a spend category's default intent is OPEX but the amount
    -- exceeds a capex threshold → route to CAPEX intent instead.
    -- Confidence: 0.95 (definitive — amount-based rule)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES

    -- IT hardware above threshold -> BI-CAPEX
    ('SC-IT-HW',    'AMOUNT_ABOVE', '{"threshold": 5000, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'IT hardware purchase ≥5,000 AED classified as capital expenditure', 0.95, 90),

    -- IT software above threshold -> BI-CAPEX (perpetual licence vs SaaS)
    ('SC-IT-SW',    'AMOUNT_ABOVE', '{"threshold": 25000, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Software purchase ≥25,000 AED classified as capital expenditure', 0.95, 90),

    -- Office furniture above threshold -> BI-CAPEX
    ('SC-OFFICE-FURN', 'AMOUNT_ABOVE', '{"threshold": 10000, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Furniture purchase ≥10,000 AED classified as capital expenditure', 0.95, 90),

    -- Fleet vehicle purchase -> BI-CAPEX (always capex, no threshold)
    ('SC-FLEET-VEH', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Vehicle acquisition classified as capital expenditure', 0.98, 95),

    -- Capital equipment → CAPEX (machinery, always capex)
    ('SC-CAPEQUIP-MACH', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Machinery acquisition classified as capital expenditure', 0.98, 95),

    ('SC-CAPEQUIP-TOOL', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Tooling acquisition classified as capital expenditure', 0.98, 95),

    ('SC-CAPEQUIP-LINE', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Production line classified as capital expenditure', 0.98, 95),

    -- Facility rent above threshold -> BI-CAPEX (IFRS 16 right-of-use)
    ('SC-FAC-RENT', 'AMOUNT_ABOVE', '{"threshold": 50000, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Lease ≥50,000 AED may qualify for IFRS 16 capitalisation', 0.85, 70);


    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 2: RECURRING vs ONE-TIME (IS_RECURRING / IS_ONE_TIME)
    -- Recurring contracts on certain categories shift COGS → OPEX
    -- Confidence: 0.85 (probable — pattern-based)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES

    -- Recurring IT services -> BI-OPEX (not capex)
    ('SC-IT-SVC',   'IS_RECURRING', '{}'::jsonb,
     'BI-OPEX', 'OPEX', 'Recurring IT service contract classified as operating expenditure', 0.85, 60),

    -- Recurring maintenance -> BI-OPEX
    ('SC-FAC-MAINT', 'IS_RECURRING', '{}'::jsonb,
     'BI-OPEX', 'OPEX', 'Recurring facility maintenance classified as operating expenditure', 0.85, 60),

    -- One-time large facility maintenance -> BI-CAPEX (major renovation)
    ('SC-FAC-MAINT', 'AMOUNT_ABOVE', '{"threshold": 100000, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Major facility works ≥100,000 AED classified as capital expenditure', 0.90, 80),

    -- Recurring outsourcing -> BI-OPEX
    ('SC-OUTSRC-BPO', 'IS_RECURRING', '{}'::jsonb,
     'BI-OPEX', 'OPEX', 'Recurring BPO contract classified as operating expenditure', 0.85, 60),

    -- Recurring cleaning -> BI-OPEX
    ('SC-FAC-CLEAN', 'IS_RECURRING', '{}'::jsonb,
     'BI-OPEX', 'OPEX', 'Recurring cleaning contract classified as operating expenditure', 0.85, 60);


    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 3: CROSS-BORDER (CROSS_BORDER)
    -- Cross-border transactions on certain categories may shift
    -- to REGULATORY domain for duty/compliance handling
    -- Confidence: 0.80 (probable)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES

    -- Cross-border raw materials -> BI-COGS with customs context
    ('SC-RAW-METAL', 'CROSS_BORDER', '{}'::jsonb,
     'BI-COGS', 'COST_OF_SALES', 'Cross-border raw material import — customs duty may apply', 0.80, 50),

    ('SC-RAW-CHEM',  'CROSS_BORDER', '{}'::jsonb,
     'BI-COGS', 'COST_OF_SALES', 'Cross-border chemical import — hazmat compliance may apply', 0.80, 50),

    -- Cross-border freight -> BI-COGS with duty awareness
    ('SC-FREIGHT-CUST', 'CROSS_BORDER', '{}'::jsonb,
     'BI-COGS', 'COST_OF_SALES', 'Cross-border customs brokerage — duty and tariff handling', 0.85, 55);


    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 4: PROCUREMENT METHOD (PROCUREMENT_METHOD)
    -- Certain procurement methods change the intent routing
    -- Confidence: 0.80–0.90
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES

    -- Contract manufacturing via formal tender -> BI-COGS
    ('SC-CONTRACT-MFG', 'PROCUREMENT_METHOD', '{"method": "FORMAL_TENDER"}'::jsonb,
     'BI-COGS', 'COST_OF_SALES', 'Formal tender subcontracting classified as cost of sales', 0.90, 70),

    -- Professional services via sole-source -> BI-OPEX (advisory, no tender)
    ('SC-PROF-CONSULT', 'PROCUREMENT_METHOD', '{"method": "SOLE_SOURCE"}'::jsonb,
     'BI-OPEX', 'OPEX', 'Sole-source consulting classified as professional services opex', 0.80, 55);


    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 5: FALLBACK (FALLBACK)
    -- Explicit fallback rules at low confidence for categories
    -- where the default_intent_id alone isn't descriptive enough.
    -- These are last-resort rules that clarify intent domain.
    -- Confidence: 0.70 (matches CLASSIFICATION_DEFAULT method)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES

    -- Tax categories → REGULATORY domain
    ('SC-TAX-CORP',  'FALLBACK', '{}'::jsonb,
     'BI-REG', 'REGULATORY', 'Corporate tax classified as regulatory obligation', 0.70, 10),
    ('SC-TAX-DUTY',  'FALLBACK', '{}'::jsonb,
     'BI-REG', 'REGULATORY', 'Import duty classified as regulatory obligation', 0.70, 10),
    ('SC-TAX-STAT',  'FALLBACK', '{}'::jsonb,
     'BI-REG', 'REGULATORY', 'Statutory fee classified as regulatory obligation', 0.70, 10),

    -- Inter-company transfers → TRANSFER domain
    ('SC-OUTSRC-SHARED', 'FALLBACK', '{}'::jsonb,
     'BI-TRANSFER', 'TRANSFER', 'Shared service centre charge classified as inter-company transfer', 0.65, 10),

    -- Certification → REGULATORY
    ('SC-QC-CERT', 'FALLBACK', '{}'::jsonb,
     'BI-REG', 'REGULATORY', 'Certification and accreditation classified as compliance cost', 0.70, 10),

    -- Environmental remediation → REGULATORY (not just OPEX)
    ('SC-ENV-REMEDN', 'FALLBACK', '{}'::jsonb,
     'BI-REG', 'REGULATORY', 'Environmental remediation classified as regulatory compliance', 0.70, 10);


    -- ── STAGE B.5: Pre-checks — all codes must resolve before DELETE/INSERT ──
    -- INNER JOIN in Stage E silently drops rows when codes are missing;
    -- catch that here so the DELETE (below) does not destroy live data.
    IF EXISTS (
        SELECT 1 FROM tmp_rule r
        WHERE NOT EXISTS (
            SELECT 1 FROM master.spend_category sc
            WHERE sc.tenant_id = v_tid AND sc.code = r.sc_code
        )
    ) THEN
        RAISE EXCEPTION '[026_base] tmp_rule references unknown spend_category codes: %',
            (SELECT string_agg(DISTINCT r.sc_code, ', ' ORDER BY r.sc_code)
             FROM tmp_rule r
             WHERE NOT EXISTS (
                 SELECT 1 FROM master.spend_category sc
                 WHERE sc.tenant_id = v_tid AND sc.code = r.sc_code
             ));
    END IF;

    IF EXISTS (
        SELECT 1 FROM tmp_rule r
        WHERE NOT EXISTS (
            SELECT 1 FROM master.business_intent bi
            WHERE bi.tenant_id = v_tid AND bi.code = r.resolved_intent_code
        )
    ) THEN
        RAISE EXCEPTION '[026_base] tmp_rule references unknown business_intent codes: %',
            (SELECT string_agg(DISTINCT r.resolved_intent_code, ', ' ORDER BY r.resolved_intent_code)
             FROM tmp_rule r
             WHERE NOT EXISTS (
                 SELECT 1 FROM master.business_intent bi
                 WHERE bi.tenant_id = v_tid AND bi.code = r.resolved_intent_code
             ));
    END IF;

    -- ── STAGE C: Idempotent cleanup — remove old pack rules ──────────────
    DELETE FROM control.commodity_classification_to_intent_rule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    -- ── STAGE D: Build resolve maps ──────────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.commodity_category WHERE tenant_id = v_tid;

    DROP TABLE IF EXISTS tmp_bi_map;
    CREATE TEMP TABLE tmp_bi_map AS
    SELECT code, id FROM master.business_intent WHERE tenant_id = v_tid;

    -- ── STAGE E: INSERT intent rules ─────────────────────────────────────
    INSERT INTO control.commodity_classification_to_intent_rule (
        tenant_id, classification_source, classification_id, direction,
        condition_type, condition_config, applies_to_flows,
        resolved_intent_id, resolved_domain, explanation_template,
        confidence, priority,
        effective_from, effective_to,
        metadata, status, created_by
    )
    SELECT
        v_tid,
        'COMMODITY_CATEGORY',
        sm.id,
        NULL,                                    -- applies to all directions
        r.condition_type,
        r.condition_config,
        r.applies_to_flows,
        bm.id,
        r.resolved_domain,
        r.explanation_template,
        r.confidence,
        r.priority,
        CURRENT_DATE,                            -- effective_from
        NULL,                                    -- no expiry
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_rule r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    JOIN tmp_bi_map bm ON bm.code = r.resolved_intent_code;

    -- ── STAGE F: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM control.commodity_classification_to_intent_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack) < 24 THEN
        RAISE EXCEPTION '[026_base] Intent rule load incomplete: expected ≥24, got %',
            (SELECT count(*) FROM control.commodity_classification_to_intent_rule
             WHERE tenant_id = v_tid
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- Confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_classification_to_intent_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND condition_type = 'AMOUNT_ABOVE'
          AND confidence < 0.85
    ) THEN
        RAISE EXCEPTION '[026_base] AMOUNT_ABOVE rules must have confidence ≥0.85';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_classification_to_intent_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND condition_type = 'FALLBACK'
          AND confidence > 0.75
    ) THEN
        RAISE EXCEPTION '[026_base] FALLBACK rules must have confidence ≤0.75';
    END IF;

    RAISE NOTICE '[026_base] Intent rules loaded: % total (AMOUNT_ABOVE=%, IS_RECURRING=%, CROSS_BORDER=%, PROCUREMENT_METHOD=%, FALLBACK=%)',
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND condition_type = 'AMOUNT_ABOVE'),
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND condition_type = 'IS_RECURRING'),
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND condition_type = 'CROSS_BORDER'),
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND condition_type = 'PROCUREMENT_METHOD'),
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND condition_type = 'FALLBACK');

END $seed$;
