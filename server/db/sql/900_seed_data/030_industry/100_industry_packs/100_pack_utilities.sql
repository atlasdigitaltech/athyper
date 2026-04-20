-- ============================================================================
-- ATHYPER GROUP — EXTENSION PACK: UTILITIES (Electricity & Water Supply)
-- ============================================================================
-- File:     100_pack_utilities.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for electricity & water supply operations
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-then-insert for routing
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-UTY, SC-UTY-GRID, SC-UTY-GEN, SC-UTY-DIST,
--                      SC-UTY-METER, SC-UTY-TREAT
--   Business intents : BI-COGS-ENERGY, BI-CAPEX-GRID, BI-REG-ENERGY
--   Item categories  : IC-UT-TURBINE, IC-UT-XFMR, IC-UT-METER
--   Commodity bridge : all rows with pack = '100_pack_utilities'
--   Routing rules    : all rows with pack = '100_pack_utilities'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '100_pack_utilities';
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
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-PLT-EQ') THEN
        RAISE EXCEPTION 'Base item category IC-PLT-EQ not loaded — run 025 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-LAB-EQ') THEN
        RAISE EXCEPTION 'Base item category IC-LAB-EQ not loaded — run 025 first';
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
    ('SC-UTY', 'Utilities & Energy Infrastructure', 'Electricity generation, distribution, water treatment, and smart grid', 'services', 400, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-UTY-GRID',  'Grid Infrastructure',       'High-voltage transmission lines, substations, and grid interconnects',   'SC-UTY', 'goods',    401, true),
    ('SC-UTY-GEN',   'Power Generation Equipment','Turbines, generators, solar panels, and wind-energy equipment',          'SC-UTY', 'goods',    402, false),
    ('SC-UTY-DIST',  'Distribution Networks',      'Medium/low-voltage distribution cables, poles, and transformers',       'SC-UTY', 'goods',    403, true),
    ('SC-UTY-METER', 'Metering & Smart Grid',      'Smart meters, AMI systems, SCADA, and demand-response platforms',      'SC-UTY', 'services', 404, false),
    ('SC-UTY-TREAT', 'Water Treatment',            'Water purification plants, desalination, and wastewater treatment',    'SC-UTY', 'services', 405, true);

    -- B2: Business intents
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,
        sort_order  smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-ENERGY', 'Energy Cost of Sales',             'Direct energy procurement and utility input costs',       'COST_OF_SALES', 'ENERGY',         'BI-COGS',  36),
    ('BI-CAPEX-GRID',  'Grid Infrastructure Capital',      'Capital spend on grid, transmission, and distribution',   'CAPEX',         'GRID',           'BI-CAPEX', 30),
    ('BI-REG-ENERGY',  'Energy Regulatory Compliance',     'Regulatory permits, tariff filings, and energy audits',   'REGULATORY',    'ENERGY_COMPLIANCE','BI-REG',  54);

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
    -- Segment 26: Power generation
    ('SC-UTY-GEN',   '26101500', 'broad',   85, true,  'Power generation equipment — family'),
    ('SC-UTY-GEN',   '26111700', 'broad',   82, false, 'Turbines — family'),
    ('SC-UTY-GEN',   '26111500', 'broad',   80, false, 'Generators — family'),
    -- Segment 39: Electrical
    ('SC-UTY-GRID',  '39121000', 'broad',   85, true,  'Transmission and distribution — class'),
    ('SC-UTY-GRID',  '39121100', 'broad',   82, false, 'Electrical wire and cable — family'),
    ('SC-UTY-DIST',  '39121400', 'broad',   85, true,  'Transformers and regulators — family'),
    ('SC-UTY-DIST',  '39121300', 'broad',   82, false, 'Electrical switches and accessories'),
    -- Segment 83: Utilities
    ('SC-UTY-METER', '83101500', 'broad',   80, true,  'Electrical power services — family'),
    ('SC-UTY-TREAT', '83101600', 'broad',   85, true,  'Water utilities — family');

    -- B5: Item categories
    CREATE TEMP TABLE tmp_ic (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text NOT NULL,
        level_no      smallint NOT NULL DEFAULT 3,
        sort_order    smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-UT-TURBINE', 'Gas & Steam Turbines',       'Gas turbines, steam turbines, and combined-cycle units',       'IC-PLT-EQ', 3, 250),
    ('IC-UT-XFMR',    'Transformers & Switchgear',  'Power transformers, distribution transformers, and switchgear','IC-PLT-EQ', 3, 251),
    ('IC-UT-METER',   'Smart Meters & SCADA',       'AMI meters, SCADA systems, and remote monitoring devices',    'IC-LAB-EQ', 3, 252);

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
    ('SC-UTY-GEN',   'EXACT', '26101500', NULL, 30, 97, 'Power generation equipment → Gen'),
    ('SC-UTY-GRID',  'EXACT', '39121000', NULL, 30, 96, 'Transmission and distribution → Grid'),
    ('SC-UTY-DIST',  'EXACT', '39121400', NULL, 30, 96, 'Transformers → Distribution'),
    ('SC-UTY-TREAT', 'EXACT', '83101600', NULL, 30, 97, 'Water utilities → Treatment'),
    ('SC-UTY-METER', 'EXACT', '83101500', NULL, 30, 96, 'Electrical power services → Metering');

    -- Layer 2 — RANGE families (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-UTY-GEN',   'RANGE', '26101500', '26101599', 20, 88, 'Power generation equipment family'),
    ('SC-UTY-GEN',   'RANGE', '26111500', '26111799', 15, 82, 'Turbines and generators families'),
    ('SC-UTY-GRID',  'RANGE', '39121000', '39121199', 20, 88, 'Transmission wire/cable families'),
    ('SC-UTY-DIST',  'RANGE', '39121300', '39121499', 20, 85, 'Transformers and switches families'),
    ('SC-UTY-METER', 'RANGE', '83101500', '83101599', 15, 82, 'Electrical power family'),
    ('SC-UTY-TREAT', 'RANGE', '83101600', '83101799', 20, 85, 'Water and sewage families');

    -- Layer 3 — Segment catchalls (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-UTY-GEN',   'RANGE', '26000000', '26999999', 3, 58, 'Segment 26: Power generation catchall'),
    ('SC-UTY-GRID',  'RANGE', '39000000', '39999999', 3, 55, 'Segment 39: Electrical catchall'),
    ('SC-UTY-TREAT', 'RANGE', '83000000', '83999999', 3, 55, 'Segment 83: Utilities catchall');

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

    -- ── STAGE D: UPSERT business intent leaves ──────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- Link default intents to spend category leaves
    UPDATE master.spend_category sc SET
        default_intent_id = bi.id,
        metadata = sc.metadata || jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'intent_code', lnk.bi_code
        )),
        updated_at = now(), updated_by = v_su
    FROM (VALUES
        ('SC-UTY-GRID',  'BI-CAPEX-GRID'),
        ('SC-UTY-GEN',   'BI-CAPEX-EQUIP'),
        ('SC-UTY-DIST',  'BI-CAPEX-GRID'),
        ('SC-UTY-METER', 'BI-COGS-ENERGY'),
        ('SC-UTY-TREAT', 'BI-COGS-ENERGY')
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

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p
      ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS
    SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'item_category', im.id,
        'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text
        )),
        'active', v_su
    FROM (VALUES
        ('IC-UT-TURBINE', '26100000', 'broad', 85, true,  'Power generation sources'),
        ('IC-UT-XFMR',    '26120000', 'broad', 85, true,  'Electrical wire and cable accessories'),
        ('IC-UT-METER',   '41110000', 'broad', 80, true,  'Lab and measuring instruments')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
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
        updated_at   = now(),
        updated_by   = v_su
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

    -- ── STAGE F: UPSERT routing rules (delete-then-insert by pack) ──────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
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
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[100_pack_utilities] Spend category load incomplete: expected 6, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[100_pack_utilities] Business intent load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[100_pack_utilities] Commodity bridge load incomplete: expected >=9, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[100_pack_utilities] Routing rule load incomplete: expected >=14, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[100_pack_utilities] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- Confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[100_pack_utilities] EXACT rules must have confidence >= 95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[100_pack_utilities] Catchall rules (priority <= 9) must have confidence <= 70';
    END IF;

    RAISE NOTICE '[100_pack_utilities] Pack loaded: % spend categories, % intents, % item categories, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
