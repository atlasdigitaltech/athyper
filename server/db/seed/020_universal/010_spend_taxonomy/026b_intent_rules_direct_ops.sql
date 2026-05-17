-- ============================================================================
-- UNIVERSAL — DIRECT-OPS CLASSIFICATION-TO-INTENT RULES (Layer B)
-- ============================================================================
-- File:     026b_intent_rules_direct_ops.sql
-- Schema:   control.commodity_classification_to_intent_rule
-- Purpose:  Context-sensitive intent rules for Layer B direct-ops categories
-- Depends:  020b_spend_categories_direct_ops.sql  (Layer B SC codes)
--           021b_business_intents_direct_ops.sql  (BI-COGS-*, BI-CAPEX/TOOL/EQUIP)
--           022b_spend_intent_link_direct_ops.sql (Layer B intents must be linked)
--           022_spend_intent_link.sql             (BI-REG must exist)
-- Idempotent: Yes — delete-then-insert by pack metadata
-- Spec ref: §10 Confidence Calibration
-- ============================================================================
-- OPT-IN: Run after 020b + 021b + 022b + 022 complete.
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '026_base_direct_ops';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- Verify Layer B spend categories and intents loaded
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-CAPEQUIP-MACH') THEN
        RAISE EXCEPTION '[026_base_direct_ops] SC-CAPEQUIP-MACH not found — run 020b first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-CAPEX') THEN
        RAISE EXCEPTION '[026_base_direct_ops] BI-CAPEX not found — run 021b first';
    END IF;

    -- ── STAGE B: Stage intent rules ──────────────────────────────────────
    DROP TABLE IF EXISTS tmp_rule;
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
    -- Capital equipment → CAPEX (always capex, no threshold)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES
    ('SC-CAPEQUIP-MACH', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Machinery acquisition classified as capital expenditure', 0.98, 95),

    ('SC-CAPEQUIP-TOOL', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Tooling acquisition classified as capital expenditure', 0.98, 95),

    ('SC-CAPEQUIP-LINE', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX', 'CAPEX', 'Production line classified as capital expenditure', 0.98, 95);

    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 2: CROSS-BORDER (CROSS_BORDER)
    -- Cross-border direct-ops transactions flagged for duty/compliance
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES
    ('SC-RAW-METAL', 'CROSS_BORDER', '{}'::jsonb,
     'BI-COGS', 'COST_OF_SALES', 'Cross-border raw material import — customs duty may apply', 0.80, 50),

    ('SC-RAW-CHEM',  'CROSS_BORDER', '{}'::jsonb,
     'BI-COGS', 'COST_OF_SALES', 'Cross-border chemical import — hazmat compliance may apply', 0.80, 50),

    ('SC-FREIGHT-CUST', 'CROSS_BORDER', '{}'::jsonb,
     'BI-COGS', 'COST_OF_SALES', 'Cross-border customs brokerage — duty and tariff handling', 0.85, 55);

    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 3: PROCUREMENT METHOD (PROCUREMENT_METHOD)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES
    ('SC-CONTRACT-MFG', 'PROCUREMENT_METHOD', '{"method": "FORMAL_TENDER"}'::jsonb,
     'BI-COGS', 'COST_OF_SALES', 'Formal tender subcontracting classified as cost of sales', 0.90, 70);

    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 4: FALLBACK (FALLBACK)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES
    ('SC-QC-CERT', 'FALLBACK', '{}'::jsonb,
     'BI-REG', 'REGULATORY', 'Certification and accreditation classified as compliance cost', 0.70, 10);

    -- ── STAGE B.5: Pre-checks ────────────────────────────────────────────
    IF EXISTS (
        SELECT 1 FROM tmp_rule r
        WHERE NOT EXISTS (
            SELECT 1 FROM master.spend_category sc
            WHERE sc.tenant_id = v_tid AND sc.code = r.sc_code
        )
    ) THEN
        RAISE EXCEPTION '[026_base_direct_ops] tmp_rule references unknown spend_category codes: %',
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
        RAISE EXCEPTION '[026_base_direct_ops] tmp_rule references unknown business_intent codes: %',
            (SELECT string_agg(DISTINCT r.resolved_intent_code, ', ' ORDER BY r.resolved_intent_code)
             FROM tmp_rule r
             WHERE NOT EXISTS (
                 SELECT 1 FROM master.business_intent bi
                 WHERE bi.tenant_id = v_tid AND bi.code = r.resolved_intent_code
             ));
    END IF;

    -- ── STAGE C: Idempotent cleanup ──────────────────────────────────────
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
        NULL,
        r.condition_type,
        r.condition_config,
        r.applies_to_flows,
        bm.id,
        r.resolved_domain,
        r.explanation_template,
        r.confidence,
        r.priority,
        CURRENT_DATE,
        NULL,
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
          AND metadata->'_seed'->>'pack' = v_pack) < 7 THEN
        RAISE EXCEPTION '[026_base_direct_ops] Intent rule load incomplete: expected ≥7, got %',
            (SELECT count(*) FROM control.commodity_classification_to_intent_rule
             WHERE tenant_id = v_tid
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_classification_to_intent_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND condition_type = 'AMOUNT_ABOVE'
          AND confidence < 0.85
    ) THEN
        RAISE EXCEPTION '[026_base_direct_ops] AMOUNT_ABOVE rules must have confidence ≥0.85';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_classification_to_intent_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND condition_type = 'FALLBACK'
          AND confidence > 0.75
    ) THEN
        RAISE EXCEPTION '[026_base_direct_ops] FALLBACK rules must have confidence ≤0.75';
    END IF;

    RAISE NOTICE '[026_base_direct_ops] Direct-ops intent rules loaded: % total (AMOUNT_ABOVE=%, CROSS_BORDER=%, PROCUREMENT_METHOD=%, FALLBACK=%)',
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND condition_type = 'AMOUNT_ABOVE'),
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND condition_type = 'CROSS_BORDER'),
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND condition_type = 'PROCUREMENT_METHOD'),
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND condition_type = 'FALLBACK');

END $seed$;
