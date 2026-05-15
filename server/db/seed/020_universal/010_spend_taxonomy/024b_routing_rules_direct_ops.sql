-- ============================================================================
-- UNIVERSAL — DIRECT-OPS ROUTING RULES (Layer B)
-- ============================================================================
-- File:     024b_routing_rules_direct_ops.sql
-- Schema:   control.commodity_to_spend_category_rule
-- Purpose:  Route UNSPSC codes → Layer B direct-operations spend categories
-- Depends:  020b_spend_categories_direct_ops.sql (Layer B categories)
--           024_routing_rules.sql (Layer A routing already applied)
-- Idempotent: Yes — ON CONFLICT DO UPDATE
-- Spec ref: §8 Routing Rule Conventions
-- ============================================================================
-- OPT-IN: Run manually after 020b_spend_categories_direct_ops.sql and
--         024_routing_rules.sql complete.
-- ============================================================================
-- Three-layer structure per §8.1:
--   Layer 1 — EXACT overrides  (priority 30+, confidence 95–100)
--   Layer 2 — Family/class     (priority 10–29, confidence 80–94)
--   Layer 3 — Segment catchalls (priority 1–9, confidence 55–70)
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '024_base_direct_ops';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-RAW-METAL') THEN
        RAISE EXCEPTION '[024_base_direct_ops] SC-RAW-METAL not found — run 020b_spend_categories_direct_ops.sql first';
    END IF;

    -- ── STAGE B: Build spend_category resolve map ────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    -- ── STAGE C: Stage routing rules ─────────────────────────────────────
    DROP TABLE IF EXISTS tmp_route;
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER 1 — EXACT OVERRIDES (priority 30+, confidence 95–100)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-FREIGHT-ROAD', 'EXACT', '78101802', NULL, 30, 97, 'Local trucking services'),
    ('SC-FREIGHT-SEA',  'EXACT', '78101703', NULL, 30, 97, 'Containerised freight'),
    ('SC-FREIGHT-AIR',  'EXACT', '78101601', NULL, 30, 97, 'Domestic air cargo');

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER 2 — FAMILY / CLASS RANGES (priority 10–29, confidence 80–94)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    -- Freight
    ('SC-FREIGHT-ROAD', 'RANGE', '78101800', '78101899', 20, 88, 'Trucking services family'),
    ('SC-FREIGHT-SEA',  'RANGE', '78101700', '78101799', 20, 88, 'Marine freight family'),
    ('SC-FREIGHT-AIR',  'RANGE', '78101600', '78101699', 20, 88, 'Air freight family'),
    ('SC-FREIGHT-CUST', 'RANGE', '78131800', '78131899', 15, 82, 'Customs brokerage family'),

    -- Raw materials
    ('SC-RAW-METAL', 'RANGE', '11101500', '11109999', 15, 82, 'Metals family'),
    ('SC-RAW-CHEM',  'RANGE', '12160000', '12169999', 15, 82, 'Solvents/chemicals class'),
    ('SC-RAW-AGRI',  'RANGE', '10170000', '10179999', 15, 82, 'Plant raw materials class'),

    -- Components
    ('SC-COMP-MECH',   'RANGE', '31160000', '31169999', 15, 82, 'Bearings/gears class'),
    ('SC-COMP-ELEC',   'RANGE', '32100000', '32109999', 15, 82, 'Electronics class'),
    ('SC-COMP-STRUCT', 'RANGE', '30100000', '30109999', 15, 80, 'Structural components class'),

    -- Warehousing
    ('SC-WHSE-STORE', 'RANGE', '78141500', '78141599', 15, 82, 'Warehousing family'),

    -- Quality
    ('SC-QC-TEST', 'RANGE', '41115400', '41115499', 15, 82, 'Measuring instruments family'),
    ('SC-QC-CERT', 'RANGE', '93141800', '93141899', 15, 80, 'Inspection services family'),

    -- MRO
    ('SC-MRO-TOOL', 'RANGE', '27110000', '27119999', 15, 82, 'Hand tools class');

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER 3 — SEGMENT CATCHALLS (priority 1–9, confidence 55–70)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-RAW-METAL',     'RANGE', '11000000', '11999999', 3, 55, 'Segment 11: Mineral/textile material catchall'),
    ('SC-RAW-CHEM',      'RANGE', '12000000', '12999999', 3, 55, 'Segment 12: Chemicals catchall'),
    ('SC-RAW-AGRI',      'RANGE', '10000000', '10999999', 3, 55, 'Segment 10: Live plant/animal catchall'),
    ('SC-COMP-MECH',     'RANGE', '31000000', '31999999', 3, 55, 'Segment 31: Manufacturing components catchall'),
    ('SC-COMP-ELEC',     'RANGE', '32000000', '32999999', 3, 55, 'Segment 32: Electronic components catchall'),
    ('SC-PKG-PRIMARY',   'RANGE', '24000000', '24999999', 3, 55, 'Segment 24: Containers/packaging catchall'),
    ('SC-MRO-TOOL',      'RANGE', '27000000', '27999999', 3, 55, 'Segment 27: Tools/machinery catchall'),
    ('SC-CONSUM-CLEAN',  'RANGE', '47000000', '47999999', 3, 55, 'Segment 47: Cleaning equipment catchall'),
    ('SC-CAPEQUIP-MACH', 'RANGE', '23000000', '23999999', 3, 55, 'Segment 23: Industrial machinery catchall'),
    ('SC-FREIGHT-ROAD',  'RANGE', '78100000', '78109999', 5, 60, 'Class 7810: Freight services catchall'),
    ('SC-QC-TEST',       'RANGE', '41000000', '41999999', 3, 55, 'Segment 41: Lab/testing equipment catchall'),
    ('SC-CAPEQUIP-TOOL', 'RANGE', '30000000', '30999999', 3, 55, 'Segment 30: Structures/components catchall');

    -- ── STAGE C.5: Pre-check — all sc_codes must exist ───────────────────
    IF EXISTS (
        SELECT 1 FROM tmp_route r
        WHERE NOT EXISTS (SELECT 1 FROM tmp_sc_map sm WHERE sm.code = r.sc_code)
    ) THEN
        RAISE EXCEPTION '[024_base_direct_ops] tmp_route references unknown spend_category codes: %',
            (SELECT string_agg(DISTINCT r.sc_code, ', ' ORDER BY r.sc_code)
             FROM tmp_route r
             WHERE NOT EXISTS (SELECT 1 FROM tmp_sc_map sm WHERE sm.code = r.sc_code));
    END IF;

    -- ── STAGE D: Delete-then-insert by pack ──────────────────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid,
        r.domain,
        r.match_mode,
        r.code_from,
        r.code_to,
        sm.id,
        r.priority,
        r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',        v_pack,
            'version',     v_version,
            'seeded_at',   now()::text,
            'description', r.description
        )),
        'active',
        v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority)
    WHERE is_active = true
    DO UPDATE SET
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        spend_category_id = EXCLUDED.spend_category_id,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = EXCLUDED.created_by;

    -- ── STAGE E: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack) < 25 THEN
        RAISE EXCEPTION '[024_base_direct_ops] Routing rule load incomplete: expected ≥25, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[024_base_direct_ops] EXACT rules must have confidence ≥95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[024_base_direct_ops] Catchall rules (priority ≤9) must have confidence ≤70';
    END IF;

    RAISE NOTICE '[024_base_direct_ops] Direct-ops routing rules loaded: % total (L1=%, L2=%, L3=%)',
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND priority >= 30),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND priority BETWEEN 10 AND 29),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND priority <= 9);

END $seed$;
