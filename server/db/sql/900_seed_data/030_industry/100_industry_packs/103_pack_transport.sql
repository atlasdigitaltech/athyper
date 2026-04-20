-- ============================================================================
-- ATHYPER GROUP — EXTENSION PACK: TRANSPORT & STORAGE
-- ============================================================================
-- File:     103_pack_transport.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for road, rail, marine, air cargo, and 3PL operations
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-then-insert for routing
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-TRANS, SC-TRANS-ROAD, SC-TRANS-RAIL,
--                      SC-TRANS-MARINE, SC-TRANS-AIR, SC-TRANS-3PL
--   Business intents : BI-COGS-TRANS, BI-CAPEX-VESSEL
--   Item categories  : IC-TRN-TRAILER, IC-TRN-CONTAINER
--   Commodity bridge : all rows with pack = '103_pack_transport'
--   Routing rules    : all rows with pack = '103_pack_transport'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '103_pack_transport';
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
                   WHERE tenant_id = v_tid AND code = 'IC-VEH') THEN
        RAISE EXCEPTION 'Base item category IC-VEH not loaded — run 025 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-HVY-EQ') THEN
        RAISE EXCEPTION 'Base item category IC-HVY-EQ not loaded — run 025 first';
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
    ('SC-TRANS', 'Transport & Storage', 'Road, rail, marine, air cargo, and third-party logistics', 'services', 430, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-TRANS-ROAD',   'Road Haulage',          'Full truckload, LTL, tanker, and last-mile road transport',       'SC-TRANS', 'services', 431, false),
    ('SC-TRANS-RAIL',   'Rail Services',          'Intermodal rail freight, bulk rail, and rail siding operations',  'SC-TRANS', 'services', 432, true),
    ('SC-TRANS-MARINE', 'Marine Transport',       'Container shipping, bulk carriers, tankers, and port handling',   'SC-TRANS', 'services', 433, true),
    ('SC-TRANS-AIR',    'Air Cargo Operations',   'Air freight, charter cargo, and airport handling services',       'SC-TRANS', 'services', 434, true),
    ('SC-TRANS-3PL',    '3PL & Fulfilment',       'Third-party logistics, order fulfilment, and value-added services','SC-TRANS','services', 435, false);

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
    ('BI-COGS-TRANS',   'Transport Cost of Sales',       'Direct transport and haulage costs tied to revenue',   'COST_OF_SALES', 'TRANSPORT', 'BI-COGS',  40),
    ('BI-CAPEX-VESSEL', 'Vessel & Fleet Capital',        'Capital spend on vessels, rolling stock, and aircraft', 'CAPEX',         'VESSEL',    'BI-CAPEX', 32);

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

    -- Segment 78: Transport, storage, and mail services
    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-TRANS-ROAD',   '78101800', 'broad',   85, true,  'Freight trucking services — family'),
    ('SC-TRANS-ROAD',   '78101900', 'broad',   80, false, 'Intermodal freight transport — family'),
    ('SC-TRANS-RAIL',   '78101500', 'broad',   85, true,  'Railway transport — family'),
    ('SC-TRANS-RAIL',   '78101502', 'exact',   98, false, 'Rail freight services'),
    ('SC-TRANS-MARINE', '78101700', 'broad',   85, true,  'Marine freight services — family'),
    ('SC-TRANS-MARINE', '78101703', 'exact',   98, false, 'Containerised sea freight'),
    ('SC-TRANS-AIR',    '78101600', 'broad',   85, true,  'Air freight services — family'),
    ('SC-TRANS-AIR',    '78101601', 'exact',   98, false, 'Domestic air cargo'),
    ('SC-TRANS-3PL',    '78141500', 'broad',   82, true,  'General warehousing and 3PL — family'),
    ('SC-TRANS-3PL',    '78141600', 'broad',   78, false, 'Specialized warehousing — family');

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
    ('IC-TRN-TRAILER',   'Trailers & Semi-trailers', 'Flatbeds, reefers, tankers, and curtainsiders',      'IC-VEH',    3, 270),
    ('IC-TRN-CONTAINER', 'Shipping Containers',       'ISO containers, tank containers, and reefer units',  'IC-HVY-EQ', 3, 271);

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
    ('SC-TRANS-ROAD',   'EXACT', '78101800', NULL, 30, 97, 'Freight trucking → Road'),
    ('SC-TRANS-RAIL',   'EXACT', '78101502', NULL, 30, 98, 'Rail freight services → Rail'),
    ('SC-TRANS-MARINE', 'EXACT', '78101703', NULL, 30, 98, 'Containerised sea freight → Marine'),
    ('SC-TRANS-AIR',    'EXACT', '78101601', NULL, 30, 98, 'Domestic air cargo → Air'),
    ('SC-TRANS-3PL',    'EXACT', '78141500', NULL, 30, 96, 'General warehousing → 3PL');

    -- Layer 2 — RANGE families (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-TRANS-ROAD',   'RANGE', '78101800', '78101899', 20, 88, 'Freight trucking family'),
    ('SC-TRANS-ROAD',   'RANGE', '78101900', '78101999', 15, 82, 'Intermodal freight family'),
    ('SC-TRANS-RAIL',   'RANGE', '78101500', '78101599', 20, 88, 'Railway transport family'),
    ('SC-TRANS-MARINE', 'RANGE', '78101700', '78101799', 20, 88, 'Marine freight family'),
    ('SC-TRANS-AIR',    'RANGE', '78101600', '78101699', 20, 88, 'Air freight family'),
    ('SC-TRANS-3PL',    'RANGE', '78141500', '78141699', 15, 82, 'Warehousing and 3PL families');

    -- Layer 3 — Segment catchalls (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-TRANS-ROAD', 'RANGE', '78000000', '78999999', 3, 55, 'Segment 78: Transport/storage catchall'),
    ('SC-TRANS-3PL',  'RANGE', '78140000', '78149999', 5, 60, 'Class 7814: Warehousing catchall');

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
        ('SC-TRANS-ROAD',   'BI-COGS-TRANS'),
        ('SC-TRANS-RAIL',   'BI-COGS-TRANS'),
        ('SC-TRANS-MARINE', 'BI-COGS-TRANS'),
        ('SC-TRANS-AIR',    'BI-COGS-TRANS'),
        ('SC-TRANS-3PL',    'BI-COGS-TRANS')
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
        ('IC-TRN-TRAILER',   '25101500', 'broad', 82, true,  'Motor vehicles — family'),
        ('IC-TRN-CONTAINER', '24110000', 'broad', 78, true,  'Containers and packaging — class')
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
        RAISE EXCEPTION '[103_pack_transport] Spend category load incomplete: expected 6, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[103_pack_transport] Business intent load incomplete: expected 2, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[103_pack_transport] Commodity bridge load incomplete: expected >=10, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[103_pack_transport] Routing rule load incomplete: expected >=13, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[103_pack_transport] Item category load incomplete: expected 2, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- Confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[103_pack_transport] EXACT rules must have confidence >= 95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[103_pack_transport] Catchall rules (priority <= 9) must have confidence <= 70';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND priority >= 30 AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[103_pack_transport] EXACT priority rules (>=30) must have confidence >= 95';
    END IF;

    RAISE NOTICE '[103_pack_transport] Pack loaded: % spend categories, % intents, % item categories, % bridge rows, % routing rules',
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
