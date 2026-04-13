-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: INFOCOMM (Information & Communication)
-- ============================================================================
-- File:     106_pack_infocomm.sql
-- Schemas:  master.spend_category, master.business_intent,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  1 pack root + 5 leaves, 2 intent leaves, commodity bridge, routing
-- Depends:  020_base (spend categories, business intents, commodity codes)
-- Idempotent: Yes — UPSERT + delete-reinsert for routing
-- ============================================================================
-- PACK OWNS: SC-ICT, SC-ICT-DC, SC-ICT-NET, SC-ICT-DEV, SC-ICT-CONTENT,
--            SC-ICT-CYBER, BI-COGS-ICT, BI-CAPEX-DC,
--            IC-ICT-SERVER, IC-ICT-NETWORK, IC-ICT-SW
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '106_pack_infocomm';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant & verify prerequisites ──────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION 'Base spend categories not loaded. Run 020 first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded. Run 021 first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-IT-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first';
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
    ('SC-ICT', 'Information & Communication Technology', 'ICT infrastructure, software development, and digital services', 'services', 420, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-ICT-DC',      'Data Centres',                 'Colocation, hosting, power/cooling, and physical DC infrastructure',     'SC-ICT', 'services', 421),
    ('SC-ICT-NET',     'Network Infrastructure',       'Routers, switches, fibre, SD-WAN, and network operations',              'SC-ICT', 'goods',    422),
    ('SC-ICT-DEV',     'Software Development',         'Custom development, QA, DevOps tooling, and agile delivery',            'SC-ICT', 'services', 423),
    ('SC-ICT-CONTENT', 'Content & Media Production',   'Video, audio, graphic design, CMS, and digital content creation',       'SC-ICT', 'services', 424),
    ('SC-ICT-CYBER',   'Managed Security Services',    'SOC-as-a-service, SIEM, pen testing, and threat intelligence',          'SC-ICT', 'services', 425);

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
    ('BI-COGS-ICT',  'ICT Cost of Sales',           'Direct costs of ICT service delivery and platform operations', 'COST_OF_SALES', 'ICT',         'BI-COGS',  39),
    ('BI-CAPEX-DC',  'Data Centre Capital Expense',  'Capital investment in data centre build-out and equipment',    'CAPEX',         'DATA_CENTRE', 'BI-CAPEX', 30);

    -- Item categories
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
    ('IC-ICT-SERVER',  'Servers & DC Hardware',   'Rack-mount and blade servers, storage arrays, and UPS systems',         'IC-IT-EQ', 3, 280),
    ('IC-ICT-NETWORK', 'Network Equipment',        'Routers, switches, firewalls, SD-WAN appliances, and wireless APs',    'IC-IT-EQ', 3, 281),
    ('IC-ICT-SW',      'Software Licences',        'Enterprise software licences, SaaS subscriptions, and developer tools','IC-IT-EQ', 3, 282);

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
    -- Segment 43: IT equipment, peripherals, and components
    ('SC-ICT-DC',      '43211500', 'broad',   82, true,  'Computer equipment — DC servers'),
    ('SC-ICT-DC',      '43222600', 'broad',   85, false, 'Computer server racks and accessories'),
    ('SC-ICT-NET',     '43222600', 'broad',   80, false, 'Network racks and enclosures'),
    ('SC-ICT-NET',     '43201400', 'broad',   85, true,  'Networking equipment — family'),
    ('SC-ICT-DEV',     '43230000', 'broad',   85, true,  'Software — class level'),
    ('SC-ICT-DEV',     '43231500', 'broad',   82, false, 'Business function software — dev tools'),
    ('SC-ICT-CYBER',   '43232300', 'broad',   85, true,  'Security and protection software'),
    ('SC-ICT-CYBER',   '43232400', 'broad',   82, false, 'Network security equipment'),
    -- Segment 81: Engineering and technology services
    ('SC-ICT-DEV',     '81111500', 'broad',   80, false, 'Engineering and technology services — dev'),
    ('SC-ICT-CONTENT', '82101500', 'broad',   78, true,  'Advertising / media production services'),
    ('SC-ICT-CONTENT', '43230000', 'related', 65, false, 'Software — CMS platforms'),
    ('SC-ICT-DC',      '81112200', 'broad',   80, false, 'Internet / hosting services — DC');

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
    ('SC-ICT-NET',   'EXACT', '43201400', NULL, 30, 96, 'Networking equipment → Network infra'),
    ('SC-ICT-CYBER', 'EXACT', '43232300', NULL, 30, 96, 'Security software → Managed security');

    -- Layer 2 — RANGE (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-ICT-DC',      'RANGE', '43222600', '43222699', 20, 85, 'Server racks and accessories family'),
    ('SC-ICT-NET',     'RANGE', '43201400', '43201499', 20, 85, 'Networking equipment family'),
    ('SC-ICT-DEV',     'RANGE', '43230000', '43239999', 15, 82, 'Software class — development'),
    ('SC-ICT-CYBER',   'RANGE', '43232300', '43232499', 20, 85, 'Security software and hardware families'),
    ('SC-ICT-CONTENT', 'RANGE', '82101500', '82101599', 15, 80, 'Advertising/media services family');

    -- Layer 3 — SEGMENT CATCHALLS (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-ICT-DC',      'RANGE', '43000000', '43999999', 5, 60, 'Segment 43: IT equipment catchall — DC'),
    ('SC-ICT-DEV',     'RANGE', '81000000', '81999999', 3, 55, 'Segment 81: Engineering/tech services catchall'),
    ('SC-ICT-CONTENT', 'RANGE', '82000000', '82999999', 3, 55, 'Segment 82: Advertising/marketing catchall — content');


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
          ('SC-ICT-DC',      'BI-CAPEX-DC'),
          ('SC-ICT-NET',     'BI-CAPEX-INFRA'),
          ('SC-ICT-DEV',     'BI-COGS-ICT'),
          ('SC-ICT-CONTENT', 'BI-COGS-ICT'),
          ('SC-ICT-CYBER',   'BI-OPEX-IT')
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

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
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
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM (VALUES
        ('IC-ICT-SERVER',  '43211500', 'broad', 85, true,  'Computer equipment — servers'),
        ('IC-ICT-SERVER',  '43222600', 'broad', 82, false, 'Server racks and accessories'),
        ('IC-ICT-NETWORK', '43201400', 'broad', 85, true,  'Networking equipment'),
        ('IC-ICT-SW',      '43230000', 'broad', 85, true,  'Software — class level')
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
                              'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
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

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ────────────────
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

    -- ── STAGE G: Assertions ─────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[106_pack_infocomm] Expected 6 spend categories (1 root + 5 leaves), got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[106_pack_infocomm] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[106_pack_infocomm] Commodity bridge incomplete: expected >=8, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[106_pack_infocomm] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[106_pack_infocomm] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[106_pack_infocomm] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
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
