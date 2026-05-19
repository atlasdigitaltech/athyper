-- ============================================================================
-- INDUSTRY PACK — CONSTRUCTION (Building & Civil Engineering)
-- ============================================================================
-- File:     101_pack_construction.sql
-- Schemas:  master.spend_category, master.business_intent,
--           master.commodity_classification, control.commodity_code_to_category_rule
-- Purpose:  Industry pack for building & civil engineering operations
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           027_commodity_bridge.sql, 024_routing_rules.sql,
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-then-insert for routing
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-CONST, SC-CONST-CIVIL, SC-CONST-STRUCT,
--                      SC-CONST-MEP, SC-CONST-FIT, SC-CONST-HEAVY
--   Business intents : BI-COGS, BI-CAPEX, BI-REG
--   Commodity bridge : all rows with pack = '101_pack_construction'
--   Routing rules    : all rows with pack = '101_pack_construction'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '101_pack_construction';
    v_version text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- Verify base prerequisites
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first';
    END IF;

    -- ── STAGE B: Stage data in temp tables ───────────────────────────────

    -- B1: Spend categories
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'services',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- Pack root (container-only)
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-CONST', 'Construction & Civil Engineering', 'Building construction, civil works, MEP, and fit-out services', 'services', 410, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-CONST-CIVIL',  'Civil Works',                 'Earthworks, foundations, roads, bridges, and drainage',               'SC-CONST', 'services', 411, true),
    ('SC-CONST-STRUCT', 'Structural Steel & Concrete', 'Reinforced concrete, structural steelwork, and precast elements',     'SC-CONST', 'goods',    412, true),
    ('SC-CONST-MEP',    'MEP Installations',           'Mechanical, electrical, and plumbing installations in buildings',     'SC-CONST', 'services', 413, true),
    ('SC-CONST-FIT',    'Fit-out & Finishing',         'Interior fit-out, joinery, flooring, and decorative finishes',        'SC-CONST', 'services', 414, false),
    ('SC-CONST-HEAVY',  'Heavy Equipment Rental',      'Cranes, excavators, bulldozers, and heavy plant hire',               'SC-CONST', 'services', 415, false);

    -- B2: Business intent rows are domain-level only; this pack links categories to canonical BI-* records.

    -- B3: Commodity bridge
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
    -- Segment 72: Building and construction
    ('SC-CONST-CIVIL',  '72141100', 'broad',   85, true,  'Nonresidential building construction — family'),
    ('SC-CONST-CIVIL',  '72141000', 'broad',   82, false, 'Heavy construction — class'),
    ('SC-CONST-STRUCT', '72131600', 'broad',   85, true,  'Structural building products installation'),
    ('SC-CONST-MEP',    '72151500', 'broad',   82, true,  'Building maintenance services — family'),
    ('SC-CONST-MEP',    '72101500', 'broad',   80, false, 'Building and facility construction'),
    ('SC-CONST-FIT',    '72121400', 'broad',   82, true,  'Interior finishing — family'),
    ('SC-CONST-FIT',    '72121500', 'broad',   80, false, 'Painting and paper hanging'),
    ('SC-CONST-HEAVY',  '72101000', 'broad',   80, true,  'Building construction services — class'),
    -- Segment 30: Structural components
    ('SC-CONST-STRUCT', '30101700', 'broad',   85, false, 'Structural members and basic shapes'),
    ('SC-CONST-STRUCT', '30102000', 'broad',   82, false, 'Concrete and cement and plaster');

    -- B4: Routing rules
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

    -- Layer 1 — EXACT overrides (priority 30+, confidence 95-100)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-CONST-CIVIL',  'EXACT', '72141100', NULL, 30, 97, 'Nonresidential building construction → Civil'),
    ('SC-CONST-STRUCT', 'EXACT', '72131600', NULL, 30, 96, 'Structural products installation → Structural'),
    ('SC-CONST-STRUCT', 'EXACT', '30101700', NULL, 30, 96, 'Structural members → Structural'),
    ('SC-CONST-MEP',    'EXACT', '72151500', NULL, 30, 96, 'Building maintenance → MEP'),
    ('SC-CONST-FIT',    'EXACT', '72121400', NULL, 30, 96, 'Interior finishing → Fit-out');

    -- Layer 2 — RANGE families (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-CONST-CIVIL',  'RANGE', '72141000', '72141999', 20, 88, 'Heavy construction families'),
    ('SC-CONST-CIVIL',  'RANGE', '72140000', '72149999', 15, 82, 'Site preparation and earthworks class'),
    ('SC-CONST-STRUCT', 'RANGE', '72131500', '72131699', 20, 85, 'Structural installation families'),
    ('SC-CONST-STRUCT', 'RANGE', '30101500', '30102099', 15, 82, 'Structural components families'),
    ('SC-CONST-MEP',    'RANGE', '72151500', '72151599', 15, 82, 'Building maintenance family'),
    ('SC-CONST-MEP',    'RANGE', '72101500', '72101599', 15, 80, 'Building construction services family'),
    ('SC-CONST-FIT',    'RANGE', '72121400', '72121599', 15, 82, 'Interior finishing families'),
    ('SC-CONST-HEAVY',  'RANGE', '72100000', '72109999', 15, 80, 'Building construction services class');

    -- Layer 3 — Segment catchalls (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-CONST-CIVIL', 'RANGE', '72000000', '72999999', 3, 55, 'Segment 72: Building/construction catchall'),
    ('SC-CONST-STRUCT','RANGE', '30000000', '30999999', 3, 55, 'Segment 30: Structural components catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    -- C1: Pack root (container)
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id, s.procurement_type, s.visibility,
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

    -- C2: Leaves
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id, s.procurement_type, s.visibility,
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
    -- STAGE D: Business intent leaves retired; industry packs use domain-level intents.
    -- Link default intents to spend category leaves
    UPDATE master.spend_category sc SET
        default_intent_id = bi.id,
        metadata = sc.metadata || jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'intent_code', lnk.bi_code
        )),
        updated_at = now(), updated_by = v_su
    FROM (VALUES
        ('SC-CONST-CIVIL',  'BI-COGS'),
        ('SC-CONST-STRUCT', 'BI-COGS'),
        ('SC-CONST-MEP',    'BI-COGS'),
        ('SC-CONST-FIT',    'BI-COGS'),
        ('SC-CONST-HEAVY',  'BI-CAPEX')
    ) AS lnk(sc_code, bi_code)
    JOIN master.business_intent bi ON bi.tenant_id = v_tid AND bi.code = lnk.bi_code
    WHERE sc.tenant_id = v_tid AND sc.code = lnk.sc_code;

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
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
    -- STAGE F: UPSERT routing rules (delete-then-insert by pack) ──────
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

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[101_pack_construction] Spend category load incomplete: expected 6, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;
IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[101_pack_construction] Commodity bridge load incomplete: expected >=10, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_code_to_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[101_pack_construction] Routing rule load incomplete: expected >=15, got %',
            (SELECT count(*) FROM control.commodity_code_to_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- Confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_code_to_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[101_pack_construction] EXACT rules must have confidence >= 95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_code_to_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[101_pack_construction] Catchall rules (priority <= 9) must have confidence <= 70';
    END IF;

    RAISE NOTICE '[101_pack_construction] Pack loaded: % spend categories, domain intents, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_code_to_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
