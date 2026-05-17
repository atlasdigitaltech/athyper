-- ============================================================================
-- UNIVERSAL — BASE COMMODITY CLASSIFICATION BRIDGE
-- ============================================================================
-- File:     027_commodity_bridge.sql
-- Schema:   master.commodity_classification
-- Purpose:  Bridge spend_category to UNSPSC commodity codes
-- Depends:  020_spend_categories.sql,
--           001_shared/008a_commodity_code_unspsc.sql
-- Idempotent: Yes — ON CONFLICT DO UPDATE
-- Spec ref: §7 Commodity Classification Bridge, §15 Alignment Rules
-- ============================================================================
-- NOTE: domain_code is ALWAYS lowercase ('unspsc') per §7.1
-- NOTE: mapping_type uses ONLY legal values per §7.2
-- NOTE: provenance = 'seed' per §13.3
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '023_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- Verify base spend categories loaded
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION 'Base seed not loaded. Run 020 first.';
    END IF;

    -- ── STAGE B: Stage bridge data ───────────────────────────────────────
    -- Each row maps a spend_category to a UNSPSC code with confidence + type
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,             -- spend_category.code
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,             -- commodity_code.code in shared.commodity_code
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- BRIDGE DATA — spend_category → UNSPSC
    -- Confidence tiers per §10:
    --   95–100: Exact leaf anchor
    --   80–94:  Family/class anchor (broader)
    --   55–79:  Segment-level / related
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- ── SC-IT children ───────────────────────────────────────────────────
    ('SC-IT-HW',      '43211500', 'broad',   85, true,  'Computers — family level'),
    ('SC-IT-HW',      '43211503', 'exact',   98, false, 'Notebook computers'),
    ('SC-IT-HW',      '43211507', 'exact',   98, false, 'Desktop computers'),
    ('SC-IT-HW',      '43211700', 'broad',   82, false, 'Computer displays — family'),
    ('SC-IT-SW',      '43230000', 'broad',   80, true,  'Software — class level'),
    ('SC-IT-SW',      '43231500', 'broad',   85, false, 'Business function specific software'),
    ('SC-IT-CLOUD',   '81112200', 'broad',   82, true,  'Internet services — family'),
    ('SC-IT-SVC',     '81111800', 'broad',   82, true,  'System administration services'),
    ('SC-IT-SVC',     '81111500', 'broad',   80, false, 'Engineering and technology services'),
    ('SC-IT-SEC',     '43232300', 'broad',   82, true,  'Security and protection software'),

    -- ── SC-TELCO children ────────────────────────────────────────────────
    ('SC-TELCO-VOICE', '83111500', 'broad',   82, true,  'Local and long distance telephone'),
    ('SC-TELCO-DATA',  '83111600', 'broad',   82, true,  'Internet access services'),
    ('SC-TELCO-MOB',   '83111700', 'broad',   82, true,  'Mobile communication services'),

    -- ── SC-OFFICE children ───────────────────────────────────────────────
    ('SC-OFFICE-SUP',   '44120000', 'broad',   85, true,  'Office supplies — class'),
    ('SC-OFFICE-FURN',  '56101500', 'broad',   85, true,  'Office furniture'),
    ('SC-OFFICE-EQUIP', '44100000', 'broad',   82, true,  'Office machines — class'),
    ('SC-OFFICE-PRINT', '82121500', 'broad',   80, true,  'Printing services'),

    -- ── SC-HR children ───────────────────────────────────────────────────
    ('SC-HR-RECRUIT',  '80111600', 'broad',   82, true,  'Temporary personnel services'),
    ('SC-HR-TRAIN',    '86130000', 'broad',   82, true,  'Vocational training — class'),
    ('SC-HR-BEN',      '84121800', 'broad',   78, true,  'Employee benefit consulting'),
    ('SC-HR-PAYROLL',  '80111500', 'broad',   80, true,  'Human resource services'),

    -- ── SC-TRAVEL children ───────────────────────────────────────────────
    ('SC-TRAVEL-AIR',    '78111500', 'broad',   85, true,  'Passenger air transportation'),
    ('SC-TRAVEL-HOTEL',  '90111600', 'broad',   85, true,  'Hotels and lodging'),
    ('SC-TRAVEL-GROUND', '78111800', 'broad',   82, true,  'Vehicle rental services'),
    ('SC-TRAVEL-EVENTS', '80141600', 'broad',   80, true,  'Events management'),

    -- ── SC-PROF children ─────────────────────────────────────────────────
    ('SC-PROF-LEGAL',   '80121600', 'broad',   85, true,  'Legal services'),
    ('SC-PROF-AUDIT',   '84111500', 'broad',   85, true,  'Accounting services'),
    ('SC-PROF-CONSULT', '80101500', 'broad',   82, true,  'Management advisory services'),
    ('SC-PROF-ENG',     '81101500', 'broad',   82, true,  'Professional engineering services'),

    -- ── SC-MKTG children ─────────────────────────────────────────────────
    ('SC-MKTG-DIGITAL', '82101500', 'broad',   80, true,  'Advertising services'),
    ('SC-MKTG-TRAD',    '82101600', 'broad',   80, true,  'Advertising agency services'),
    ('SC-MKTG-PR',      '80141500', 'broad',   80, true,  'Public relations services'),
    ('SC-MKTG-CX',      '80111700', 'broad',   78, true,  'Market research'),

    -- ── SC-FAC children ──────────────────────────────────────────────────
    ('SC-FAC-RENT',  '80131500', 'broad',   82, true,  'Real estate services'),
    ('SC-FAC-MAINT', '72151500', 'broad',   82, true,  'Building maintenance services'),
    ('SC-FAC-CLEAN', '76111500', 'broad',   85, true,  'Cleaning and janitorial services'),
    ('SC-FAC-SECUR', '92121500', 'broad',   82, true,  'Security guard services'),

    -- ── SC-UTIL children ─────────────────────────────────────────────────
    ('SC-UTIL-ELEC',  '83101500', 'broad',   85, true,  'Electrical power generation'),
    ('SC-UTIL-WATER', '83101600', 'broad',   85, true,  'Water utilities'),
    ('SC-UTIL-GAS',   '83101800', 'broad',   85, true,  'Natural gas utilities'),
    ('SC-UTIL-WASTE', '76120000', 'broad',   82, true,  'Refuse disposal and treatment — class'),

    -- ── SC-FLEET children ────────────────────────────────────────────────
    ('SC-FLEET-VEH',   '25101500', 'broad',   85, true,  'Motor vehicles'),
    ('SC-FLEET-FUEL',  '15101500', 'broad',   85, true,  'Petroleum and distillates'),
    ('SC-FLEET-MAINT', '78181500', 'broad',   80, true,  'Vehicle maintenance services'),

    -- ── SC-INS children ──────────────────────────────────────────────────
    ('SC-INS-PROP', '84131500', 'broad',   82, true,  'Insurance services for structures'),
    ('SC-INS-LIAB', '84131600', 'broad',   82, true,  'Liability insurance'),
    ('SC-INS-EMP',  '84131500', 'related', 65, false, 'Employee insurance — related'),

    -- ── SC-BANK children ─────────────────────────────────────────────────
    ('SC-BANK-FEE',   '84111600', 'broad',   78, true,  'Banking services'),
    ('SC-BANK-FX',    '84111700', 'broad',   78, true,  'Foreign exchange services'),
    ('SC-BANK-TREAS', '84111800', 'broad',   78, true,  'Investment and asset management'),

    -- ── SC-TAX children ──────────────────────────────────────────────────
    ('SC-TAX-CORP',  '84111500', 'related', 65, true,  'Tax accounting — related'),
    ('SC-TAX-DUTY',  '78131800', 'related', 60, true,  'Customs management — related'),
    ('SC-TAX-STAT',  '93151500', 'related', 55, true,  'Government fees — related'),

    -- ── SC-SAFETY children ───────────────────────────────────────────────
    ('SC-SAFETY-SEC',  '92121500', 'broad',   80, true,  'Security guard services'),
    ('SC-SAFETY-HSE',  '46180000', 'broad',   80, true,  'Safety and rescue equipment — class'),
    ('SC-SAFETY-COMP', '93141800', 'related', 65, true,  'Inspection services — related'),

    -- ── SC-ENV children ──────────────────────────────────────────────────
    ('SC-ENV-WASTE',  '76120000', 'broad',   82, true,  'Refuse disposal and treatment'),
    ('SC-ENV-CARBON', '77101600', 'related', 65, true,  'Environmental monitoring'),
    ('SC-ENV-REMEDN', '77101700', 'broad',   78, true,  'Environmental remediation'),

    -- ── SC-OUTSRC children ───────────────────────────────────────────────
    ('SC-OUTSRC-BPO',    '80161500', 'broad',   80, true,  'Financial business process outsourcing'),
    ('SC-OUTSRC-SHARED', '80161500', 'related', 70, false, 'Shared services — related'),
    ('SC-OUTSRC-TEMP',   '80111600', 'broad',   82, true,  'Temporary staffing services'),

    -- ── SC-SUBS children ─────────────────────────────────────────────────
    ('SC-SUBS-LIC',  '43230000', 'related', 70, true,  'Software — related for licences'),
    ('SC-SUBS-MEMB', '94131600', 'related', 60, true,  'Professional associations'),
    ('SC-SUBS-PUB',  '55101500', 'related', 65, true,  'Publications and periodicals'),

    -- ══════════════════════════════════════════════════════════════════════
    -- DIRECT OPERATIONS — Layer B leaves
    -- ══════════════════════════════════════════════════════════════════════

    -- ── SC-RAW children ──────────────────────────────────────────────────
    ('SC-RAW-METAL', '11101500', 'broad',   85, true,  'Metals and minerals'),
    ('SC-RAW-CHEM',  '12160000', 'broad',   85, true,  'Solvents — class'),
    ('SC-RAW-AGRI',  '10170000', 'broad',   82, true,  'Plant materials — class'),

    -- ── SC-COMP children ─────────────────────────────────────────────────
    ('SC-COMP-MECH',   '31160000', 'broad',   85, true,  'Bearings, gears, and related — class'),
    ('SC-COMP-ELEC',   '32100000', 'broad',   85, true,  'Electronic components — class'),
    ('SC-COMP-STRUCT', '30100000', 'broad',   82, true,  'Structural components — class'),

    -- ── SC-PKG children ──────────────────────────────────────────────────
    ('SC-PKG-PRIMARY',   '24110000', 'broad',   85, true,  'Containers and packaging'),
    ('SC-PKG-SECONDARY', '24110000', 'related', 70, false, 'Containers — secondary packaging'),
    ('SC-PKG-TRANSIT',   '24110000', 'related', 65, false, 'Containers — transit packaging'),

    -- ── SC-CONSUM children ───────────────────────────────────────────────
    ('SC-CONSUM-CHEM',  '12350000', 'broad',   82, true,  'Additives — class'),
    ('SC-CONSUM-LAB',   '41110000', 'broad',   85, true,  'Laboratory instruments — class'),
    ('SC-CONSUM-CLEAN', '47130000', 'broad',   82, true,  'Cleaning supplies — class'),

    -- ── SC-MRO children ──────────────────────────────────────────────────
    ('SC-MRO-SPARE',  '31000000', 'broad',   70, true,  'Manufacturing components — segment'),
    ('SC-MRO-TOOL',   '27110000', 'broad',   82, true,  'Hand tools — class'),
    ('SC-MRO-SUPPLY', '31200000', 'broad',   78, true,  'Industrial lubricants — class'),

    -- ── SC-PRODSVC children ──────────────────────────────────────────────
    ('SC-PRODSVC-CALIB', '41115300', 'broad',   85, true,  'Calibration instruments'),
    ('SC-PRODSVC-PLANT', '72101500', 'related', 70, true,  'Building and facility construction'),

    -- ── SC-CONTRACT children ─────────────────────────────────────────────
    ('SC-CONTRACT-MFG', '73150000', 'broad',   80, true,  'Industrial process machinery'),
    ('SC-CONTRACT-ASM', '73150000', 'related', 70, false, 'Assembly subcontracting — related'),

    -- ── SC-FREIGHT children ──────────────────────────────────────────────
    ('SC-FREIGHT-ROAD', '78101800', 'broad',   85, true,  'Freight trucking services'),
    ('SC-FREIGHT-SEA',  '78101700', 'broad',   85, true,  'Marine freight services'),
    ('SC-FREIGHT-AIR',  '78101600', 'broad',   85, true,  'Air freight services'),
    ('SC-FREIGHT-CUST', '78131800', 'broad',   82, true,  'Customs brokerage services'),

    -- ── SC-WHSE children ─────────────────────────────────────────────────
    ('SC-WHSE-STORE', '78141500', 'broad',   82, true,  'General warehousing'),
    ('SC-WHSE-COLD',  '78141500', 'narrow',  78, false, 'Cold chain — narrower scope'),

    -- ── SC-QC children ───────────────────────────────────────────────────
    ('SC-QC-TEST',    '41115400', 'broad',   85, true,  'Measuring instruments and accessories'),
    ('SC-QC-CERT',    '93141800', 'broad',   80, true,  'Inspection services'),
    ('SC-QC-INSPECT', '93141800', 'related', 72, false, 'Inspection — related scope'),

    -- ── SC-CAPEQUIP children ─────────────────────────────────────────────
    ('SC-CAPEQUIP-MACH', '23000000', 'broad',   75, true,  'Industrial manufacturing segment'),
    ('SC-CAPEQUIP-TOOL', '27000000', 'broad',   75, true,  'Tools and general machinery segment'),
    ('SC-CAPEQUIP-LINE', '23150000', 'broad',   78, true,  'Metal working machinery'),

    -- ── SC-TEMPWK children ───────────────────────────────────────────────
    ('SC-TEMPWK-SCAF', '30171500', 'broad',   80, true,  'Scaffolding'),
    ('SC-TEMPWK-SITE', '72151500', 'related', 65, true,  'Building maintenance — related'),

    -- ── SC-PROCNRG children ──────────────────────────────────────────────
    ('SC-PROCNRG-STEAM', '40141600', 'broad',   78, true,  'Industrial heaters'),
    ('SC-PROCNRG-COMP',  '40142000', 'broad',   80, true,  'Compressors');

    -- ── STAGE B.2: Pre-check — all SC bridge UNSPSC codes must exist ─────────
    -- Silent JOIN drops cause the count assertion to fail and roll back the whole
    -- file. Fail here with a clear message listing the missing codes instead.
    IF EXISTS (
        SELECT 1 FROM tmp_bridge b
        WHERE NOT EXISTS (
            SELECT 1 FROM shared.commodity_code cc
            WHERE cc.domain_code = b.domain AND cc.code = b.cc_code
        )
    ) THEN
        RAISE EXCEPTION '[023_base] spend_category bridge: UNSPSC codes missing from shared.commodity_code'
            ' — ensure 008a_commodity_code_unspsc.sql ran first. Missing: %',
            (SELECT string_agg(DISTINCT b.cc_code, ', ' ORDER BY b.cc_code)
             FROM tmp_bridge b
             WHERE NOT EXISTS (
                 SELECT 1 FROM shared.commodity_code cc
                 WHERE cc.domain_code = b.domain AND cc.code = b.cc_code
             ));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: Build resolve maps ──────────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    -- ── STAGE D: UPSERT spend_category bridge rows ──────────────────────
    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid,
        'spend_category',
        sm.id,
        'commodity',
        b.domain,
        cc.id,
        b.mapping_type,
        b.confidence,
        'seed',
        b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
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
                              'pack',      v_pack,
                              'version',   v_version,
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
    -- STAGE E: Assertions ──────────────────────────────────────────────

    -- spend_category bridge count
    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid
          AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 100 THEN
        RAISE EXCEPTION '[023_base] spend_category bridge incomplete: expected ≥100, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid
               AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- §11.3.3 confidence tier validation (both owner types)
    IF EXISTS (
        SELECT 1 FROM master.commodity_classification
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND mapping_type = 'exact' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[023_base] exact bridge rows must have confidence ≥95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.commodity_classification
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND mapping_type = 'broad' AND (confidence < 55 OR confidence > 94)
    ) THEN
        RAISE WARNING '[023_base] broad bridge rows outside 55–94 range detected';
    END IF;
    RAISE NOTICE '[023_base] Commodity bridge loaded: % spend_category rows',
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
