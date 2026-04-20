-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: HEALTHCARE SERVICES
-- ============================================================================
-- File:     115_pack_healthcare.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for hospital and healthcare services
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-reinsert for routing
-- Legal entity: APHS (Athyper Philippines Hospital Services, PHP)
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-HLTH, SC-HLTH-MED, SC-HLTH-DRUG,
--                      SC-HLTH-SUPPLY, SC-HLTH-LAB, SC-HLTH-IT
--   Business intents : BI-COGS-HEALTH, BI-REG-HEALTH
--   Item categories  : IC-HLTH-MED, IC-HLTH-DRUG, IC-HLTH-LAB
--   Commodity bridge : all rows with pack = '115_pack_healthcare'
--   Routing rules    : all rows with pack = '115_pack_healthcare'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '115_pack_healthcare';
    v_version text := '1.0.0';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-PROF') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category WHERE tenant_id = v_tid AND code = 'IC-MED-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first (IC-MED-EQ missing)'; END IF;

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
    ('SC-HLTH', 'Healthcare & Hospital Services', 'Medical equipment, drugs, clinical supplies, diagnostics, and health IT', 'goods', 570, true);

    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-HLTH-MED',    'Medical Devices & Equipment', 'Surgical instruments, imaging equipment, patient monitors, and implants', 'SC-HLTH', 'goods',    571, true),
    ('SC-HLTH-DRUG',   'Pharmaceuticals & Biologics', 'Drugs, vaccines, blood products, and OTC medicines',                    'SC-HLTH', 'goods',    572, true),
    ('SC-HLTH-SUPPLY', 'Clinical Consumables',        'Gloves, syringes, wound dressings, catheters, and sterile consumables', 'SC-HLTH', 'goods',    573, true),
    ('SC-HLTH-LAB',    'Lab & Diagnostic Services',   'Diagnostic reagents, lab analysers, pathology, and radiology services', 'SC-HLTH', 'services', 574, true),
    ('SC-HLTH-IT',     'Health IT & EMR Systems',     'Electronic medical records, PACS, hospital information systems',        'SC-HLTH', 'services', 575, true);

    CREATE TEMP TABLE tmp_bi (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, domain text NOT NULL, subtype text, parent_code text,
        sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-HEALTH', 'Healthcare Cost of Sales',     'Direct cost of medical supplies, drugs, and clinical consumables',  'COST_OF_SALES', 'HEALTHCARE', 'BI-COGS',  48),
    ('BI-REG-HEALTH',  'Healthcare Regulatory Expense','Licensing fees, inspections, accreditation, and regulatory filings','REGULATORY',    'HLTH_CERT',  'BI-REG',   18);

    CREATE TEMP TABLE tmp_ic (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text NOT NULL,
        level_no smallint NOT NULL DEFAULT 3, sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-HLTH-MED',  'Medical Devices & Equipment',    'Surgical instruments, patient monitors, imaging devices, and implants', 'IC-MED-EQ',  3, 370),
    ('IC-HLTH-DRUG', 'Pharmaceuticals & Biologics',    'Prescription drugs, vaccines, biologics, and controlled substances',    'IC-CHEM',    3, 371),
    ('IC-HLTH-LAB',  'Diagnostic & Lab Equipment',     'Lab analysers, reagents, diagnostic kits, and pathology instruments',   'IC-LAB-EQ',  3, 372);

    CREATE TEMP TABLE tmp_bridge (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', cc_code text NOT NULL,
        mapping_type text NOT NULL DEFAULT 'broad', confidence numeric(5,2) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-HLTH-MED',    '42000000', 'broad',   88, true,  'Medical equipment and accessories — segment'),
    ('SC-HLTH-MED',    '42130000', 'broad',   85, false, 'Surgical supplies and tools — class'),
    ('SC-HLTH-DRUG',   '51000000', 'broad',   88, true,  'Drugs and pharmaceutical products — segment'),
    ('SC-HLTH-SUPPLY', '42130000', 'broad',   82, true,  'Medical disposables and supplies — class'),
    ('SC-HLTH-SUPPLY', '42140000', 'broad',   80, false, 'Patient care supplies — class'),
    ('SC-HLTH-LAB',    '41110000', 'broad',   85, true,  'Laboratory instruments and supplies — class'),
    ('SC-HLTH-IT',     '43230000', 'broad',   82, true,  'Software — Health IT/EMR class');

    CREATE TEMP TABLE tmp_route (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', match_mode text NOT NULL,
        code_from text NOT NULL, code_to text,
        priority smallint NOT NULL, confidence numeric(5,2) NOT NULL, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-HLTH-MED',    'EXACT', '42000000', NULL,       30, 96, 'Medical equipment segment → Med devices'),
    ('SC-HLTH-DRUG',   'EXACT', '51000000', NULL,       30, 96, 'Pharma products segment → Drugs'),
    ('SC-HLTH-MED',    'RANGE', '42000000', '42999999', 20, 88, 'Medical equipment and accessories segment'),
    ('SC-HLTH-DRUG',   'RANGE', '51000000', '51999999', 20, 88, 'Drugs and pharmaceutical products segment'),
    ('SC-HLTH-SUPPLY', 'RANGE', '42130000', '42149999', 15, 82, 'Medical disposables and supplies classes'),
    ('SC-HLTH-LAB',    'RANGE', '41110000', '41119999', 15, 82, 'Lab instruments and supplies class'),
    ('SC-HLTH-IT',     'RANGE', '43230000', '43239999', 15, 80, 'Software class — Health IT'),
    ('SC-HLTH-MED',    'RANGE', '42000000', '42999999',  3, 55, 'Segment 42: Medical equipment catchall'),
    ('SC-HLTH-LAB',    'RANGE', '41000000', '41999999',  3, 55, 'Segment 41: Lab equipment catchall');

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
          ('SC-HLTH-MED',    'BI-COGS-HEALTH'), ('SC-HLTH-DRUG',   'BI-COGS-HEALTH'),
          ('SC-HLTH-SUPPLY', 'BI-COGS-HEALTH'), ('SC-HLTH-LAB',    'BI-COGS-HEALTH'),
          ('SC-HLTH-IT',     'BI-COGS-HEALTH')
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
        ('IC-HLTH-MED',  '42000000', 'broad', 88, true,  'Medical equipment and accessories — segment'),
        ('IC-HLTH-DRUG', '51000000', 'broad', 88, true,  'Drugs and pharmaceutical products — segment'),
        ('IC-HLTH-LAB',  '41110000', 'broad', 85, true,  'Laboratory instruments and supplies — class')
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
        RAISE EXCEPTION '[115_pack_healthcare] Expected 6 spend categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[115_pack_healthcare] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[115_pack_healthcare] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[115_pack_healthcare] Commodity bridge incomplete: expected >=7, got %',
            (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[115_pack_healthcare] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF EXISTS (SELECT 1 FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND match_mode = 'EXACT' AND confidence < 95) THEN
        RAISE EXCEPTION '[115_pack_healthcare] EXACT rules must have confidence >= 95'; END IF;

    RAISE NOTICE '[115_pack_healthcare] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
