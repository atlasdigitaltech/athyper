-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: MFG ELECTRONICS
-- ============================================================================
-- File:     111_pack_mfg_electronics.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for electronics and semiconductor manufacturing
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-reinsert for routing
-- Legal entity: ATEM (Athyper Taiwan Electronics Mfg, TWD)
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-ELEC, SC-ELEC-COMP, SC-ELEC-PCB,
--                      SC-ELEC-TEST, SC-ELEC-SEMI, SC-ELEC-PACK
--   Business intents : BI-COGS-ELEC, BI-CAPEX-ELEC
--   Item categories  : IC-ELEC-SMT, IC-ELEC-COMP, IC-ELEC-SEMI
--   Commodity bridge : all rows with pack = '111_pack_mfg_electronics'
--   Routing rules    : all rows with pack = '111_pack_mfg_electronics'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '111_pack_mfg_electronics';
    v_version text := '1.0.0';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category WHERE tenant_id = v_tid AND code = 'IC-MFG-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first'; END IF;

    -- ── STAGE B: Stage data ───────────────────────────────────────────────

    CREATE TEMP TABLE tmp_sc (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text,
        procurement_type text NOT NULL DEFAULT 'goods', visibility text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false, is_regulated boolean NOT NULL DEFAULT false,
        sort_order smallint NOT NULL DEFAULT 0, is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-ELEC', 'Electronics Manufacturing', 'Components, PCB assembly, semiconductors, testing, and ESD packaging', 'goods', 530, true);

    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-ELEC-COMP',  'Electronic Components',  'Passive and active components: resistors, capacitors, ICs, connectors',  'SC-ELEC', 'goods', 531, false),
    ('SC-ELEC-PCB',   'PCB & PCBA Services',    'Bare PCB fabrication, SMT assembly, and through-hole soldering',         'SC-ELEC', 'goods', 532, false),
    ('SC-ELEC-TEST',  'Test & Measurement Eq.', 'Oscilloscopes, spectrum analysers, ICT fixtures, and burn-in chambers',  'SC-ELEC', 'goods', 533, false),
    ('SC-ELEC-SEMI',  'Semiconductors & Wafers','Silicon wafers, bare die, memory chips, and ASIC procurement',           'SC-ELEC', 'goods', 534, true),
    ('SC-ELEC-PACK',  'ESD & Electronics Pack.','Anti-static bags, ESD trays, moisture barrier bags, and reel packaging', 'SC-ELEC', 'goods', 535, false);

    CREATE TEMP TABLE tmp_bi (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, domain text NOT NULL, subtype text, parent_code text,
        sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-ELEC',  'Electronics Cost of Sales',   'Direct component and conversion costs for electronics manufacturing', 'COST_OF_SALES', 'ELECTRONICS',    'BI-COGS',  44),
    ('BI-CAPEX-ELEC', 'Electronics Capital Equipment','Capital investment in SMT lines, test equipment, and clean rooms',   'CAPEX',         'ELECTRONICS_MFG','BI-CAPEX', 34);

    CREATE TEMP TABLE tmp_ic (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text NOT NULL,
        level_no smallint NOT NULL DEFAULT 3, sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-ELEC-SMT',  'SMT & Assembly Equipment',    'Pick-and-place machines, reflow ovens, wave solder, and AOI systems', 'IC-MFG-EQ', 3, 330),
    ('IC-ELEC-COMP', 'Electronic Components',       'Passive components, ICs, connectors, and electromechanical parts',    'IC-COMP',   3, 331),
    ('IC-ELEC-SEMI', 'Semiconductors & Wafers',     'Silicon wafers, bare die, memory chips, microcontrollers, and ASICs', 'IC-COMP',   3, 332);

    CREATE TEMP TABLE tmp_bridge (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', cc_code text NOT NULL,
        mapping_type text NOT NULL DEFAULT 'broad', confidence numeric(5,2) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-ELEC-COMP',  '32000000', 'broad',   85, true,  'Electronic components and supplies — segment'),
    ('SC-ELEC-COMP',  '32100000', 'broad',   88, false, 'Passive electronic components — class'),
    ('SC-ELEC-PCB',   '32150000', 'broad',   85, true,  'Printed circuit assemblies — class'),
    ('SC-ELEC-TEST',  '41110000', 'broad',   80, true,  'Laboratory and measuring instruments — class'),
    ('SC-ELEC-SEMI',  '32101500', 'broad',   88, true,  'Semiconductors — family'),
    ('SC-ELEC-PACK',  '44102000', 'broad',   78, true,  'Storage and organisation equipment — class'),
    ('SC-ELEC-PCB',   '43211700', 'broad',   82, false, 'Computer components — family');

    CREATE TEMP TABLE tmp_route (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', match_mode text NOT NULL,
        code_from text NOT NULL, code_to text,
        priority smallint NOT NULL, confidence numeric(5,2) NOT NULL, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-ELEC-COMP',  'EXACT', '32000000', NULL,       30, 96, 'Electronic components segment → Components'),
    ('SC-ELEC-SEMI',  'EXACT', '32101500', NULL,       30, 96, 'Semiconductors family → Semi'),
    ('SC-ELEC-COMP',  'RANGE', '32000000', '32999999', 20, 88, 'Electronic components and supplies segment'),
    ('SC-ELEC-PCB',   'RANGE', '32150000', '32159999', 20, 88, 'Printed circuit assemblies class'),
    ('SC-ELEC-TEST',  'RANGE', '41110000', '41119999', 15, 80, 'Lab and measuring instruments class'),
    ('SC-ELEC-SEMI',  'RANGE', '32101500', '32101599', 20, 88, 'Semiconductors family'),
    ('SC-ELEC-PACK',  'RANGE', '44102000', '44102999', 10, 78, 'Storage and packaging class'),
    ('SC-ELEC-COMP',  'RANGE', '32000000', '32999999',  3, 55, 'Segment 32: Electronic components catchall'),
    ('SC-ELEC-TEST',  'RANGE', '41000000', '41999999',  3, 55, 'Segment 41: Lab equipment catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, NULL, s.seed_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        updated_at = now(), updated_by = v_su;

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, p.root_category_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type, is_regulated = EXCLUDED.is_regulated,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intents ─────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        domain = EXCLUDED.domain, subtype = EXCLUDED.subtype,
        parent_id = EXCLUDED.parent_id, depth = EXCLUDED.depth, sort_order = EXCLUDED.sort_order,
        metadata = master.business_intent.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-ELEC-COMP', 'BI-COGS-ELEC'), ('SC-ELEC-PCB',  'BI-COGS-ELEC'),
          ('SC-ELEC-SEMI', 'BI-COGS-ELEC'), ('SC-ELEC-PACK', 'BI-COGS-ELEC'),
          ('SC-ELEC-TEST', 'BI-CAPEX-ELEC')
      );

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'spend_category', sm.id, 'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id, level_no, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, level_no = EXCLUDED.level_no, sort_order = EXCLUDED.sort_order,
        metadata = master.item_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'item_category', im.id, 'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM (VALUES
        ('IC-ELEC-SMT',  '23150000', 'broad', 85, true,  'Manufacturing machinery and equipment — class'),
        ('IC-ELEC-COMP', '32100000', 'broad', 88, true,  'Passive electronic components — class'),
        ('IC-ELEC-SEMI', '32101500', 'broad', 88, true,  'Semiconductors — family')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ─────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode, code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT v_tid, r.domain, r.match_mode, r.code_from, r.code_to, sm.id, r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'description', r.description)),
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
    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] Expected 6 spend categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] Commodity bridge incomplete: expected >=7, got %',
            (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF EXISTS (SELECT 1 FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND match_mode = 'EXACT' AND confidence < 95) THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] EXACT rules must have confidence >= 95'; END IF;

    RAISE NOTICE '[111_pack_mfg_electronics] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
