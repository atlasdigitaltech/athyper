-- ============================================================================
-- INDUSTRY PACK — HOSPITALITY (Accommodation & Food Svc)
-- ============================================================================
-- File:     105_pack_hospitality.sql
-- Schemas:  master.spend_category, master.business_intent,
--           master.commodity_classification, control.commodity_code_to_category_rule
-- Purpose:  1 pack root + 4 leaves, 1 intent leaf, commodity bridge, routing
-- Depends:  020_base (spend categories, business intents, commodity codes),
-- Idempotent: Yes — UPSERT + delete-reinsert for routing
-- ============================================================================
-- PACK OWNS: SC-HOSP, SC-HOSP-FB, SC-HOSP-LINEN, SC-HOSP-PROP,
--            SC-HOSP-GUEST, BI-COGS,
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '105_pack_hospitality';
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
    ('SC-HOSP', 'Hospitality & Accommodation', 'Hotel, restaurant, and hospitality operations procurement', 'services', 410, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-HOSP-FB',    'Food & Beverage Supply',        'Fresh produce, dry goods, beverages, and kitchen consumables',        'SC-HOSP', 'goods',    411),
    ('SC-HOSP-LINEN', 'Linen & Amenities',             'Bed linen, towels, toiletries, and guest room amenities',             'SC-HOSP', 'goods',    412),
    ('SC-HOSP-PROP',  'Property Maintenance — Hotel',  'Hotel-specific HVAC, plumbing, fit-out, and FF&E maintenance',        'SC-HOSP', 'services', 413),
    ('SC-HOSP-GUEST', 'Guest Services & Tech',         'Property management systems, guest Wi-Fi, and concierge technology',  'SC-HOSP', 'services', 414);

    -- Business intents
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
    ('BI-COGS', 'Hospitality Cost of Sales', 'Direct costs of food, beverage, and guest services delivery', 'COST_OF_SALES', 'HOSPITALITY', 'BI-COGS', 38);

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
    -- Segment 50: Food and beverage products
    ('SC-HOSP-FB',    '50000000', 'related', 70, false, 'Food/beverage products — segment'),
    ('SC-HOSP-FB',    '50200000', 'broad',   85, true,  'Beverages — class level'),
    ('SC-HOSP-FB',    '50100000', 'broad',   85, false, 'Fruits and vegetables — class'),
    -- Linen & amenities
    ('SC-HOSP-LINEN', '52120000', 'broad',   82, true,  'Bedclothes and table linen — class'),
    ('SC-HOSP-LINEN', '53130000', 'related', 65, false, 'Personal care products — related'),
    -- Property maintenance
    ('SC-HOSP-PROP',  '72151500', 'broad',   80, true,  'Building maintenance services'),
    ('SC-HOSP-PROP',  '72150000', 'broad',   78, false, 'Building maintenance — class'),
    -- Guest services & tech
    ('SC-HOSP-GUEST', '43230000', 'related', 68, false, 'Software — PMS platforms'),
    ('SC-HOSP-GUEST', '81112200', 'broad',   80, true,  'Internet services — guest Wi-Fi'),
    -- Segment 90: Travel and lodging
    ('SC-HOSP-FB',    '90100000', 'related', 60, false, 'Restaurants and catering — related'),
    ('SC-HOSP-GUEST', '90111600', 'related', 65, false, 'Hotels and lodging — related');

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

    -- Layer 2 — RANGE (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-HOSP-FB',    'RANGE', '50100000', '50299999', 20, 85, 'Food and beverage classes'),
    ('SC-HOSP-LINEN', 'RANGE', '52120000', '52129999', 15, 82, 'Bedclothes and linen class'),
    ('SC-HOSP-PROP',  'RANGE', '72151500', '72151599', 15, 82, 'Building maintenance family — hotel'),
    ('SC-HOSP-GUEST', 'RANGE', '81112200', '81112299', 15, 82, 'Internet services family — guest tech');

    -- Layer 3 — SEGMENT CATCHALLS (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-HOSP-FB',    'RANGE', '50000000', '50999999', 5, 60, 'Segment 50: Food/beverage catchall'),
    ('SC-HOSP-LINEN', 'RANGE', '52000000', '52999999', 3, 55, 'Segment 52: Home/hospitality furnishings catchall'),
    ('SC-HOSP-GUEST', 'RANGE', '90000000', '90999999', 3, 55, 'Segment 90: Travel/lodging catchall');


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
          ('SC-HOSP-FB',    'BI-COGS'),
          ('SC-HOSP-LINEN', 'BI-COGS'),
          ('SC-HOSP-PROP',  'BI-OPEX'),
          ('SC-HOSP-GUEST', 'BI-OPEX')
      );

    -- ── STAGE D: UPSERT intent leaves ───────────────────────────────────
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


    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ────────────────
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
        RAISE EXCEPTION '[105_pack_hospitality] Expected 5 spend categories (1 root + 4 leaves), got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;
IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[105_pack_hospitality] Commodity bridge incomplete: expected >=5, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_code_to_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[105_pack_hospitality] Routing rules incomplete: expected >=5, got %',
            (SELECT count(*) FROM control.commodity_code_to_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[105_pack_hospitality] Pack loaded: % spend cats, domain intents, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_code_to_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
