-- ============================================================================
-- INDUSTRY PACK — REAL ESTATE (Property & Development)
-- ============================================================================
-- File:     102_pack_real_estate.sql
-- Schemas:  master.spend_category, master.business_intent,
--           master.commodity_classification, control.commodity_code_to_category_rule
-- Purpose:  Industry pack for property development, management, and leasing
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           027_commodity_bridge.sql, 024_routing_rules.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-then-insert for routing
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-RE, SC-RE-DEV, SC-RE-MGMT, SC-RE-LEASE, SC-RE-VAL
--   Business intents : BI-COGS, BI-REV-RENT, BI-REG
--   Commodity bridge : all rows with pack = '102_pack_real_estate'
--   Routing rules    : all rows with pack = '102_pack_real_estate'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '102_pack_real_estate';
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
    ('SC-RE', 'Real Estate & Property', 'Property development, management, leasing, and valuation services', 'services', 420, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-RE-DEV',   'Property Development',     'Land acquisition, master planning, and real estate development',     'SC-RE', 'services', 421, true),
    ('SC-RE-MGMT',  'Property Management',      'Facilities management, tenant services, and building operations',   'SC-RE', 'services', 422, false),
    ('SC-RE-LEASE', 'Leasing & Tenancy',        'Commercial and residential lease administration and brokerage',     'SC-RE', 'services', 423, true),
    ('SC-RE-VAL',   'Valuation & Appraisal',    'Property valuation, market appraisal, and feasibility studies',     'SC-RE', 'services', 424, false);

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
    ('BI-COGS', 'Property Cost of Sales',          'Direct costs of property management and operations',           'COST_OF_SALES', 'PROPERTY',           'BI-COGS', 38),
    ('BI-REV-RENT',  'Rental Revenue Cost',             'Costs directly tied to rental income generation',              'COST_OF_SALES', 'RENTAL',             'BI-COGS', 39),
    ('BI-REG',  'Property Regulatory Compliance',  'Zoning permits, title registration, and building compliance',  'REGULATORY',    'PROPERTY_COMPLIANCE','BI-REG',  56);

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
    -- Real estate services
    ('SC-RE-DEV',   '80131500', 'broad',   85, true,  'Real estate services — family'),
    ('SC-RE-DEV',   '80131600', 'broad',   80, false, 'Real estate management — family'),
    ('SC-RE-MGMT',  '80131600', 'broad',   85, true,  'Real estate management services'),
    ('SC-RE-MGMT',  '72150000', 'broad',   78, false, 'Building maintenance — class'),
    ('SC-RE-LEASE', '80131500', 'broad',   82, false, 'Real estate services — leasing'),
    ('SC-RE-LEASE', '80131700', 'broad',   85, true,  'Real estate rental — family'),
    ('SC-RE-VAL',   '80131500', 'related', 72, true,  'Real estate services — valuation related'),
    ('SC-RE-VAL',   '80101500', 'related', 65, false, 'Management advisory — appraisal related');

    -- B5: Routing rules
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
    ('SC-RE-DEV',   'EXACT', '80131500', NULL, 30, 96, 'Real estate services → Development'),
    ('SC-RE-MGMT',  'EXACT', '80131600', NULL, 30, 97, 'Real estate management → Management'),
    ('SC-RE-LEASE', 'EXACT', '80131700', NULL, 30, 97, 'Real estate rental → Leasing'),
    ('SC-RE-MGMT',  'EXACT', '72150000', NULL, 30, 95, 'Building maintenance → Management');

    -- Layer 2 — RANGE families (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-RE-DEV',   'RANGE', '80131500', '80131599', 20, 88, 'Real estate services family'),
    ('SC-RE-MGMT',  'RANGE', '80131600', '80131699', 20, 88, 'Real estate management family'),
    ('SC-RE-LEASE', 'RANGE', '80131700', '80131799', 20, 88, 'Real estate rental family'),
    ('SC-RE-MGMT',  'RANGE', '72150000', '72159999', 15, 82, 'Building maintenance class'),
    ('SC-RE-VAL',   'RANGE', '80131500', '80131599', 10, 80, 'Real estate services — valuation fallback');

    -- Layer 3 — Segment catchalls (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-RE-DEV',  'RANGE', '80130000', '80139999', 5, 60, 'Class 8013: Real estate catchall'),
    ('SC-RE-MGMT', 'RANGE', '72000000', '72999999', 3, 55, 'Segment 72: Building services catchall');

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
        ('SC-RE-DEV',   'BI-CAPEX'),
        ('SC-RE-MGMT',  'BI-COGS'),
        ('SC-RE-LEASE', 'BI-COGS'),
        ('SC-RE-VAL',   'BI-OPEX')
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
        RAISE EXCEPTION '[102_pack_real_estate] Spend category load incomplete: expected 5, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;
IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[102_pack_real_estate] Commodity bridge load incomplete: expected >=8, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_code_to_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[102_pack_real_estate] Routing rule load incomplete: expected >=11, got %',
            (SELECT count(*) FROM control.commodity_code_to_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- Confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_code_to_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[102_pack_real_estate] EXACT rules must have confidence >= 95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_code_to_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[102_pack_real_estate] Catchall rules (priority <= 9) must have confidence <= 70';
    END IF;

    RAISE NOTICE '[102_pack_real_estate] Pack loaded: % spend categories, domain intents, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_code_to_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
