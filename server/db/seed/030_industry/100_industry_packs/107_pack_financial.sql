-- ============================================================================
-- INDUSTRY PACK — FINANCIAL (Financial & Insurance)
-- ============================================================================
-- File:     107_pack_financial.sql
-- Schemas:  master.spend_category, master.business_intent,
--           master.commodity_classification, control.commodity_code_to_category_rule
-- Purpose:  1 pack root + 4 leaves, 2 intent leaves, commodity bridge, routing
-- Depends:  020_base (spend categories, business intents, commodity codes)
-- Idempotent: Yes — UPSERT + delete-reinsert for routing
-- ============================================================================
-- PACK OWNS: SC-FIN, SC-FIN-CORE, SC-FIN-RISK, SC-FIN-CLAIMS,
--            SC-FIN-WEALTH, BI-COGS, BI-REG,
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '107_pack_financial';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant & verify prerequisites ──────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION 'Base spend categories not loaded. Run 020 first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded. Run 021 first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-REG') THEN
        RAISE EXCEPTION 'Base BI-REG domain root not loaded. Run 021 first.';
    END IF;

    -- ── STAGE B: Stage data in temp tables ──────────────────────────────

    -- Spend categories
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'goods',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- Pack root (container only)
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-FIN', 'Financial & Insurance Services', 'Banking, insurance, wealth management, and fintech operations', 'services', 430, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-FIN-CORE',   'Core Banking Systems',          'Core banking platforms, payment engines, and settlement systems',       'SC-FIN', 'services', 431, true),
    ('SC-FIN-RISK',   'Risk & Compliance Platforms',   'Risk analytics, AML/KYC, regulatory reporting, and GRC platforms',     'SC-FIN', 'services', 432, true),
    ('SC-FIN-CLAIMS', 'Claims Processing',             'Insurance claims intake, adjudication, fraud detection, and pay-out',   'SC-FIN', 'services', 433, false),
    ('SC-FIN-WEALTH', 'Wealth Management Systems',     'Portfolio management, robo-advisory, and client onboarding systems',   'SC-FIN', 'services', 434, true);

    -- Business intent rows are domain-level only; this pack links categories to canonical BI-* records.

    -- Commodity bridge
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- Segment 84: Financial and insurance services
    ('SC-FIN-CORE',   '84111500', 'broad',   85, true,  'Accounting services — core banking'),
    ('SC-FIN-CORE',   '84111600', 'broad',   82, false, 'Banking services — core platforms'),
    ('SC-FIN-RISK',   '84111700', 'broad',   80, true,  'Foreign exchange / risk services'),
    ('SC-FIN-RISK',   '84111500', 'related', 68, false, 'Accounting — regulatory reporting'),
    ('SC-FIN-CLAIMS', '84131500', 'broad',   85, true,  'Insurance services — claims'),
    ('SC-FIN-CLAIMS', '84131600', 'broad',   82, false, 'Liability insurance — claims processing'),
    ('SC-FIN-WEALTH', '84111800', 'broad',   85, true,  'Investment and asset management'),
    ('SC-FIN-WEALTH', '84111700', 'related', 70, false, 'FX services — wealth management');

    -- Routing rules
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

    -- Layer 1 — EXACT (priority 30+, confidence 95-100)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-FIN-CORE',   'EXACT', '84111600', NULL, 30, 96, 'Banking services → Core banking'),
    ('SC-FIN-WEALTH', 'EXACT', '84111800', NULL, 30, 96, 'Investment management → Wealth mgmt');

    -- Layer 2 — RANGE (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-FIN-CORE',   'RANGE', '84111500', '84111699', 20, 85, 'Accounting and banking families'),
    ('SC-FIN-RISK',   'RANGE', '84111700', '84111799', 15, 82, 'FX and risk services family'),
    ('SC-FIN-CLAIMS', 'RANGE', '84131500', '84131699', 20, 85, 'Insurance services families'),
    ('SC-FIN-WEALTH', 'RANGE', '84111800', '84111899', 20, 85, 'Investment management family');

    -- Layer 3 — SEGMENT CATCHALLS (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-FIN-CORE',   'RANGE', '84000000', '84999999', 5, 60, 'Segment 84: Financial services catchall'),
    ('SC-FIN-CLAIMS', 'RANGE', '84130000', '84139999', 3, 58, 'Class 8413: Insurance catchall — claims');


    -- ── STAGE C: UPSERT pack root + leaves into spend_category ──────────

    -- Root (container)
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id,
        s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'container', true
        )),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text, 'container', true
                         )),
        updated_at = now(), updated_by = v_su;

    -- Leaves
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id,
        s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- Set default_intent_id on leaves
    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-FIN-CORE',   'BI-CAPEX'),
          ('SC-FIN-RISK',   'BI-REG'),
          ('SC-FIN-CLAIMS', 'BI-COGS'),
          ('SC-FIN-WEALTH', 'BI-COGS')
      );

    -- ── STAGE D: UPSERT intent leaves ───────────────────────────────────
    -- Business intent rows are domain-level only; this pack links categories to the canonical BI-* records.

    -- ── STAGE E: UPSERT commodity bridge ────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'spend_category', sm.id,
        'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);
    -- STAGE F: UPSERT routing rules (delete-reinsert) ────────────────
    DELETE FROM control.commodity_code_to_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_code_to_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, commodity_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid, r.domain, r.match_mode,
        r.code_from, r.code_to, sm.id,
        r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'description', r.description
        )),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        commodity_category_id = EXCLUDED.commodity_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ─────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 5 THEN
        RAISE EXCEPTION '[107_pack_financial] Expected 5 spend categories (1 root + 4 leaves), got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;
IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[107_pack_financial] Commodity bridge incomplete: expected >=6, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_code_to_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[107_pack_financial] Routing rules incomplete: expected >=6, got %',
            (SELECT count(*) FROM control.commodity_code_to_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[107_pack_financial] Pack loaded: % spend cats, domain intents, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_code_to_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
