-- ============================================================================
-- ATHYPER GROUP — BASE ROUTING RULES
-- ============================================================================
-- File:     024_routing_rules.sql
-- Schema:   control.commodity_to_spend_category_rule
-- Purpose:  Route incoming commodity codes → spend categories (3-layer rules)
-- Depends:  020_spend_categories.sql, 001_shared/008a_commodity_code_unspsc.sql
-- Idempotent: Yes — ON CONFLICT DO UPDATE
-- Spec ref: §8 Routing Rule Conventions
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
    v_pack     text := '024_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION 'Base seed not loaded. Run 020 first.';
    END IF;

    -- ── STAGE B: Build spend_category resolve map ────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    -- ── STAGE C: Stage routing rules ─────────────────────────────────────
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,           -- NULL for EXACT
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER 1 — EXACT OVERRIDES (priority 30+, confidence 95–100)
    -- High-volume or high-risk codes that must route precisely
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    -- IT & Digital
    ('SC-IT-HW',      'EXACT', '43211503', NULL, 30, 98, 'Notebook computers → IT Hardware'),
    ('SC-IT-HW',      'EXACT', '43211507', NULL, 30, 98, 'Desktop computers → IT Hardware'),
    ('SC-IT-HW',      'EXACT', '43211708', NULL, 30, 97, 'Flat panel displays → IT Hardware'),
    ('SC-IT-SW',      'EXACT', '43231500', NULL, 30, 96, 'Business function software → IT Software'),
    ('SC-IT-CLOUD',   'EXACT', '81112200', NULL, 30, 96, 'Internet services → Cloud'),
    ('SC-IT-SEC',     'EXACT', '43232300', NULL, 30, 96, 'Security software → Cybersecurity'),

    -- Telecom
    ('SC-TELCO-VOICE', 'EXACT', '83111502', NULL, 30, 97, 'Local telephone service'),
    ('SC-TELCO-DATA',  'EXACT', '83111603', NULL, 30, 97, 'Internet service provider ISP'),
    ('SC-TELCO-MOB',   'EXACT', '83111702', NULL, 30, 97, 'Mobile telephone service'),

    -- Office
    ('SC-OFFICE-SUP', 'EXACT', '44121600', NULL, 30, 96, 'Writing instruments'),

    -- Travel
    ('SC-TRAVEL-AIR',   'EXACT', '78111502', NULL, 30, 98, 'Domestic air transport'),
    ('SC-TRAVEL-HOTEL', 'EXACT', '90111601', NULL, 30, 98, 'Hotels'),

    -- Professional services
    ('SC-PROF-LEGAL',  'EXACT', '80121609', NULL, 30, 97, 'Contract law services'),
    ('SC-PROF-AUDIT',  'EXACT', '84111502', NULL, 30, 97, 'Financial auditing services'),

    -- Freight
    ('SC-FREIGHT-ROAD', 'EXACT', '78101802', NULL, 30, 97, 'Local trucking services'),
    ('SC-FREIGHT-SEA',  'EXACT', '78101703', NULL, 30, 97, 'Containerised freight'),
    ('SC-FREIGHT-AIR',  'EXACT', '78101601', NULL, 30, 97, 'Domestic air cargo');

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER 2 — FAMILY / CLASS RANGES (priority 10–29, confidence 80–94)
    -- Standard routing for known UNSPSC families
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    -- IT
    ('SC-IT-HW',       'RANGE', '43210000', '43219999', 20, 88, 'Computer equipment family'),
    ('SC-IT-SW',       'RANGE', '43230000', '43239999', 20, 85, 'Software family'),
    ('SC-IT-CLOUD',    'RANGE', '81112200', '81112299', 20, 85, 'Internet services family'),
    ('SC-IT-SVC',      'RANGE', '81111500', '81111999', 15, 82, 'IT services families'),
    ('SC-IT-SEC',      'RANGE', '43232300', '43232399', 20, 85, 'Security software family'),

    -- Telecom
    ('SC-TELCO-VOICE', 'RANGE', '83111500', '83111599', 15, 82, 'Telephone services family'),
    ('SC-TELCO-DATA',  'RANGE', '83111600', '83111699', 15, 82, 'Internet access family'),
    ('SC-TELCO-MOB',   'RANGE', '83111700', '83111799', 15, 82, 'Mobile comms family'),

    -- Office
    ('SC-OFFICE-SUP',   'RANGE', '44120000', '44129999', 15, 85, 'Office supplies class'),
    ('SC-OFFICE-FURN',  'RANGE', '56101500', '56101999', 15, 85, 'Office furniture family'),
    ('SC-OFFICE-EQUIP', 'RANGE', '44100000', '44109999', 15, 82, 'Office machines class'),

    -- HR
    ('SC-HR-RECRUIT',  'RANGE', '80111600', '80111699', 15, 82, 'Staffing services family'),
    ('SC-HR-TRAIN',    'RANGE', '86130000', '86139999', 15, 82, 'Vocational training class'),

    -- Travel
    ('SC-TRAVEL-AIR',    'RANGE', '78111500', '78111599', 20, 88, 'Air passenger transport'),
    ('SC-TRAVEL-HOTEL',  'RANGE', '90111600', '90111699', 20, 88, 'Hotels family'),
    ('SC-TRAVEL-GROUND', 'RANGE', '78111800', '78111899', 15, 82, 'Vehicle rental family'),
    ('SC-TRAVEL-EVENTS', 'RANGE', '80141600', '80141699', 15, 80, 'Events management family'),

    -- Professional
    ('SC-PROF-LEGAL',   'RANGE', '80121600', '80121699', 15, 85, 'Legal services family'),
    ('SC-PROF-AUDIT',   'RANGE', '84111500', '84111599', 15, 85, 'Accounting services family'),
    ('SC-PROF-CONSULT', 'RANGE', '80101500', '80101599', 15, 82, 'Management consulting family'),
    ('SC-PROF-ENG',     'RANGE', '81101500', '81101599', 15, 82, 'Engineering services family'),

    -- Marketing
    ('SC-MKTG-DIGITAL', 'RANGE', '82101500', '82101599', 15, 80, 'Advertising services family'),
    ('SC-MKTG-PR',      'RANGE', '80141500', '80141599', 15, 80, 'PR services family'),

    -- Facilities
    ('SC-FAC-MAINT', 'RANGE', '72151500', '72151599', 15, 82, 'Building maintenance family'),
    ('SC-FAC-CLEAN', 'RANGE', '76111500', '76111599', 15, 85, 'Cleaning services family'),
    ('SC-FAC-SECUR', 'RANGE', '92121500', '92121599', 15, 82, 'Security guard family'),

    -- Utilities
    ('SC-UTIL-ELEC',  'RANGE', '83101500', '83101599', 15, 85, 'Electric utilities family'),
    ('SC-UTIL-WATER', 'RANGE', '83101600', '83101699', 15, 85, 'Water utilities family'),
    ('SC-UTIL-GAS',   'RANGE', '83101800', '83101899', 15, 85, 'Gas utilities family'),

    -- Fleet
    ('SC-FLEET-VEH',   'RANGE', '25101500', '25101999', 15, 85, 'Motor vehicles family'),
    ('SC-FLEET-FUEL',  'RANGE', '15101500', '15101599', 15, 85, 'Petroleum fuels family'),

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
    ('SC-QC-TEST',    'RANGE', '41115400', '41115499', 15, 82, 'Measuring instruments family'),
    ('SC-QC-CERT',    'RANGE', '93141800', '93141899', 15, 80, 'Inspection services family'),

    -- MRO
    ('SC-MRO-TOOL', 'RANGE', '27110000', '27119999', 15, 82, 'Hand tools class'),

    -- Insurance
    ('SC-INS-PROP', 'RANGE', '84131500', '84131599', 15, 82, 'Property insurance family'),
    ('SC-INS-LIAB', 'RANGE', '84131600', '84131699', 15, 82, 'Liability insurance family');


    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER 3 — SEGMENT CATCHALLS (priority 1–9, confidence 55–70)
    -- Broad fallback for entire UNSPSC segments
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-IT-HW',         'RANGE', '43000000', '43999999', 5, 60, 'Segment 43: IT equipment catchall'),
    ('SC-TELCO-DATA',    'RANGE', '83000000', '83999999', 3, 55, 'Segment 83: Utilities/telecom catchall'),
    ('SC-OFFICE-SUP',    'RANGE', '44000000', '44999999', 5, 60, 'Segment 44: Office equipment catchall'),
    ('SC-HR-RECRUIT',    'RANGE', '80110000', '80119999', 5, 58, 'Class 8011: HR services catchall'),
    ('SC-TRAVEL-AIR',    'RANGE', '78110000', '78119999', 5, 58, 'Class 7811: Passenger transport catchall'),
    ('SC-PROF-CONSULT',  'RANGE', '80100000', '80109999', 5, 58, 'Class 8010: Business services catchall'),
    ('SC-MKTG-DIGITAL',  'RANGE', '82000000', '82999999', 3, 55, 'Segment 82: Advertising/marketing catchall'),
    ('SC-FAC-MAINT',     'RANGE', '72000000', '72999999', 3, 55, 'Segment 72: Building/construction catchall'),
    ('SC-UTIL-ELEC',     'RANGE', '83100000', '83109999', 5, 60, 'Class 8310: Utilities catchall'),
    ('SC-FLEET-VEH',     'RANGE', '25000000', '25999999', 3, 55, 'Segment 25: Vehicles catchall'),
    ('SC-INS-PROP',      'RANGE', '84130000', '84139999', 5, 58, 'Class 8413: Insurance catchall'),
    ('SC-BANK-FEE',      'RANGE', '84110000', '84119999', 5, 58, 'Class 8411: Financial services catchall'),
    ('SC-SAFETY-HSE',    'RANGE', '46000000', '46999999', 3, 55, 'Segment 46: Defence/security catchall'),
    ('SC-ENV-WASTE',     'RANGE', '77000000', '77999999', 3, 55, 'Segment 77: Environmental catchall'),
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
    ('SC-FLEET-FUEL',    'RANGE', '15000000', '15999999', 3, 55, 'Segment 15: Fuels catchall'),
    ('SC-QC-TEST',       'RANGE', '41000000', '41999999', 3, 55, 'Segment 41: Lab/testing equipment catchall'),
    ('SC-FAC-CLEAN',     'RANGE', '76000000', '76999999', 3, 55, 'Segment 76: Cleaning services catchall'),
    ('SC-FAC-SECUR',     'RANGE', '92000000', '92999999', 3, 55, 'Segment 92: Defence/security services catchall'),
    ('SC-OUTSRC-BPO',    'RANGE', '80160000', '80169999', 5, 60, 'Class 8016: BPO services catchall'),
    ('SC-HR-TRAIN',      'RANGE', '86000000', '86999999', 3, 55, 'Segment 86: Education/training catchall'),
    ('SC-TRAVEL-HOTEL',  'RANGE', '90000000', '90999999', 3, 55, 'Segment 90: Travel/lodging catchall'),
    ('SC-OFFICE-FURN',   'RANGE', '56000000', '56999999', 3, 55, 'Segment 56: Furniture catchall'),
    ('SC-CAPEQUIP-TOOL', 'RANGE', '30000000', '30999999', 3, 55, 'Segment 30: Structures/components catchall');


    -- ── STAGE D: UPSERT routing rules (delete-then-insert by pack) ─────────
    -- Delete ALL prior rows for this pack first, then re-insert the full batch.
    -- This is identical to the pattern used in all pack files and is safe because
    -- each pack owns its own rows exclusively (identified by metadata._seed.pack).
    -- Patch upgrades that add new rules simply bump v_version; re-running an older
    -- version will still land all rows that version defines.
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
          AND metadata->'_seed'->>'pack' = v_pack) < 50 THEN
        RAISE EXCEPTION '[024_base] Routing rule load incomplete: expected ≥50, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- §11.3.3 confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[024_base] EXACT rules must have confidence ≥95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[024_base] Catchall rules (priority ≤9) must have confidence ≤70';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND priority >= 30 AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[024_base] EXACT priority rules (≥30) must have confidence ≥95';
    END IF;

    RAISE NOTICE '[024_base] Routing rules loaded: % total (L1=%, L2=%, L3=%)',
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND priority >= 30),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND priority BETWEEN 10 AND 29),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND priority <= 9);

END $seed$;
