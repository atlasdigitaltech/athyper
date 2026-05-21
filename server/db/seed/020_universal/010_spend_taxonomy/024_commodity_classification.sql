-- ============================================================================
-- UNIVERSAL — COMMODITY CLASSIFICATION (UNSPSC BRIDGE)
-- ============================================================================
-- File:     024_commodity_classification.sql
-- Schema:   master.commodity_classification
-- Purpose:  Links each commodity category to its primary UNSPSC segment/family.
--           owner_type='commodity_category', classification_type='commodity',
--           domain_code='unspsc'.
-- Depends:  023_commodity_category (categories must exist)
--           shared.commodity_code (UNSPSC codes must exist)
-- Idempotent: Yes — ON CONFLICT (tenant_id, owner_type, owner_id,
--             classification_type, domain_code, code_id) DO NOTHING
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '024_commodity_classification';
    v_version text := '1.0.0';
    v_inserted int := 0;
    v_skipped  int := 0;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.commodity_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION '[024] commodity_category not seeded — run 023 first';
    END IF;

    -- ── Stage UNSPSC segment mappings ─────────────────────────────────────
    -- Each row: (category_code, unspsc_code, mapping_type, confidence, is_primary)
    -- Codes reference shared.commodity_code where domain_code='unspsc'.
    -- If a code does not exist in shared.commodity_code the row is silently skipped.
    CREATE TEMP TABLE tmp_cc_bridge (
        cc_code        text    NOT NULL,
        unspsc_code    text    NOT NULL,
        mapping_type   text    NOT NULL DEFAULT 'broad',
        confidence     numeric(5,2) NOT NULL DEFAULT 80.00,
        is_primary     boolean NOT NULL DEFAULT true
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER A — Universal cross-functional mappings
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_cc_bridge (cc_code, unspsc_code, mapping_type, confidence) VALUES
    -- IT & Digital
    ('SC-IT-HW',        '43210000', 'broad',  85),   -- Computer Equipment and Accessories
    ('SC-IT-SW',        '43230000', 'broad',  85),   -- Software
    ('SC-IT-CLOUD',     '81110000', 'broad',  80),   -- Computer services
    ('SC-IT-SVC',       '81110000', 'broad',  75),   -- Computer services
    ('SC-IT-SEC',       '81110000', 'broad',  75),   -- Computer services
    -- Telecom
    ('SC-TELCO-VOICE',  '83110000', 'broad',  85),   -- Telephone and data communication services
    ('SC-TELCO-DATA',   '83110000', 'broad',  85),   -- Telephone and data communication services
    ('SC-TELCO-MOB',    '83110000', 'broad',  80),   -- Telephone and data communication services
    -- Office & Workplace
    ('SC-OFFICE-SUP',   '44110000', 'broad',  90),   -- Office supplies
    ('SC-OFFICE-FURN',  '56100000', 'broad',  90),   -- Furniture
    ('SC-OFFICE-EQUIP', '44100000', 'broad',  85),   -- Office machines
    ('SC-OFFICE-PRINT', '82110000', 'broad',  85),   -- Printing and publishing services
    -- HR & Benefits
    ('SC-HR-RECRUIT',   '93130000', 'broad',  80),   -- Employment services
    ('SC-HR-TRAIN',     '86130000', 'broad',  85),   -- Education and training
    ('SC-HR-BEN',       '73110000', 'broad',  75),   -- Insurance services (benefits)
    ('SC-HR-PAYROLL',   '80110000', 'broad',  75),   -- Human resource management
    -- Travel & Events
    ('SC-TRAVEL-AIR',   '78110000', 'broad',  90),   -- Air transportation services
    ('SC-TRAVEL-HOTEL', '90110000', 'broad',  90),   -- Hotels and lodging
    ('SC-TRAVEL-GROUND','78120000', 'broad',  85),   -- Ground transportation services
    ('SC-TRAVEL-EVENTS','80170000', 'broad',  75),   -- Meeting and event planning
    -- Professional Services
    ('SC-PROF-LEGAL',   '80110000', 'broad',  85),   -- Legal services
    ('SC-PROF-AUDIT',   '80110000', 'broad',  85),   -- Accounting and auditing services
    ('SC-PROF-CONSULT', '80100000', 'broad',  80),   -- Management advisory services
    ('SC-PROF-ENG',     '81140000', 'broad',  80),   -- Engineering services
    -- Marketing & CX
    ('SC-MKTG-DIGITAL', '82110000', 'broad',  80),   -- Advertising services
    ('SC-MKTG-TRAD',    '82110000', 'broad',  80),   -- Advertising services
    ('SC-MKTG-PR',      '80120000', 'broad',  80),   -- Public relations services
    ('SC-MKTG-CX',      '80100000', 'broad',  75),   -- Management advisory / market research
    -- Facilities
    ('SC-FAC-RENT',     '80140000', 'broad',  85),   -- Real estate services
    ('SC-FAC-MAINT',    '72100000', 'broad',  85),   -- Building maintenance services
    ('SC-FAC-CLEAN',    '76110000', 'broad',  90),   -- Cleaning and janitorial services
    ('SC-FAC-SECUR',    '92100000', 'broad',  85),   -- Security services
    -- Utilities
    ('SC-UTIL-ELEC',    '83101000', 'broad',  80),   -- Electrical utilities (UNSPSC 83101000)
    ('SC-UTIL-WATER',   '83102000', 'broad',  80),   -- Water utilities (UNSPSC 83102000)
    ('SC-UTIL-GAS',     '83101500', 'broad',  80),   -- Gas utilities (UNSPSC 83101500)
    ('SC-UTIL-WASTE',   '77100000', 'broad',  85),   -- Environmental management
    -- Fleet & Mobility
    ('SC-FLEET-VEH',    '25100000', 'broad',  90),   -- Motor vehicles
    ('SC-FLEET-FUEL',   '15100000', 'broad',  90),   -- Fuels and fuel additives
    ('SC-FLEET-MAINT',  '78180000', 'broad',  80),   -- Motor vehicle maintenance
    -- Insurance
    ('SC-INS-PROP',     '73130000', 'broad',  85),   -- Property insurance
    ('SC-INS-LIAB',     '73130000', 'broad',  80),   -- Liability insurance
    ('SC-INS-EMP',      '73130000', 'broad',  80),   -- Group insurance
    -- Banking & FX
    ('SC-BANK-FEE',     '84100000', 'broad',  85),   -- Banking and investment services
    ('SC-BANK-FX',      '84130000', 'broad',  85),   -- Foreign exchange
    ('SC-BANK-TREAS',   '84100000', 'broad',  80),   -- Treasury services
    -- Taxes & Duties
    ('SC-TAX-CORP',     '93160000', 'broad',  80),   -- Tax services
    ('SC-TAX-DUTY',     '93160000', 'broad',  85),   -- Customs and duties
    ('SC-TAX-STAT',     '93160000', 'broad',  75),   -- Government fees
    -- Safety & Compliance
    ('SC-SAFETY-SEC',   '92100000', 'broad',  85),   -- Security services
    ('SC-SAFETY-HSE',   '77130000', 'broad',  85),   -- Occupational health and safety
    ('SC-SAFETY-COMP',  '80100000', 'broad',  75),   -- Compliance consulting
    -- ESG & Environmental
    ('SC-ENV-WASTE',    '77100000', 'broad',  85),   -- Waste management
    ('SC-ENV-CARBON',   '77100000', 'broad',  80),   -- Environmental services
    ('SC-ENV-REMEDN',   '77100000', 'broad',  85),   -- Environmental remediation
    -- Outsourced Services
    ('SC-OUTSRC-BPO',   '80110000', 'broad',  80),   -- BPO / management services
    ('SC-OUTSRC-SHARED','80110000', 'broad',  75),   -- Shared services
    ('SC-OUTSRC-TEMP',  '93130000', 'broad',  80),   -- Temporary staffing
    -- Subscriptions & Licenses
    ('SC-SUBS-LIC',     '43230000', 'broad',  85),   -- Software licenses
    ('SC-SUBS-MEMB',    '86100000', 'broad',  80),   -- Membership organizations
    ('SC-SUBS-PUB',     '82110000', 'broad',  75);   -- Publishing and subscriptions

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER B — Direct-operations mappings
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_cc_bridge (cc_code, unspsc_code, mapping_type, confidence) VALUES
    -- Raw Materials
    ('SC-RAW-METAL',        '11100000', 'broad',  90),   -- Ores, minerals and metals
    ('SC-RAW-CHEM',         '12100000', 'broad',  90),   -- Organic chemicals
    ('SC-RAW-AGRI',         '10100000', 'broad',  85),   -- Agricultural products
    -- Components
    ('SC-COMP-MECH',        '31160000', 'broad',  85),   -- Mechanical components
    ('SC-COMP-ELEC',        '32100000', 'broad',  85),   -- Electronic components
    ('SC-COMP-STRUCT',      '30100000', 'broad',  80),   -- Structural components
    -- Packaging
    ('SC-PKG-PRIMARY',      '24120000', 'broad',  90),   -- Containers and packaging
    ('SC-PKG-SECONDARY',    '24120000', 'broad',  85),   -- Containers and packaging
    ('SC-PKG-TRANSIT',      '24120000', 'broad',  85),   -- Containers and packaging
    -- Consumables
    ('SC-CONSUM-CHEM',      '12100000', 'broad',  85),   -- Industrial chemicals
    ('SC-CONSUM-LAB',       '41110000', 'broad',  90),   -- Laboratory equipment and supplies
    ('SC-CONSUM-CLEAN',     '47130000', 'broad',  90),   -- Cleaning equipment and supplies
    -- MRO
    ('SC-MRO-SPARE',        '31200000', 'broad',  85),   -- Bearings, springs and spare parts
    ('SC-MRO-TOOL',         '27110000', 'broad',  85),   -- Hand tools
    ('SC-MRO-SUPPLY',       '47130000', 'broad',  80),   -- MRO supplies
    -- Production Services
    ('SC-PRODSVC-CALIB',    '81140000', 'broad',  85),   -- Engineering services / calibration
    ('SC-PRODSVC-PLANT',    '81140000', 'broad',  80),   -- Plant engineering services
    -- Contract Manufacturing
    ('SC-CONTRACT-MFG',     '80130000', 'broad',  80),   -- Contract manufacturing
    ('SC-CONTRACT-ASM',     '80130000', 'broad',  80),   -- Assembly services
    -- Freight & Logistics
    ('SC-FREIGHT-ROAD',     '78100000', 'broad',  90),   -- Transportation services
    ('SC-FREIGHT-SEA',      '78130000', 'broad',  90),   -- Water/sea freight (UNSPSC 78130000)
    ('SC-FREIGHT-AIR',      '78110000', 'broad',  90),   -- Air freight services
    ('SC-FREIGHT-CUST',     '78120000', 'broad',  85),   -- Customs brokerage
    -- Warehousing
    ('SC-WHSE-STORE',       '78130000', 'broad',  85),   -- Warehousing and storage
    ('SC-WHSE-COLD',        '78130000', 'broad',  85),   -- Cold chain / refrigerated storage
    -- Quality & Testing
    ('SC-QC-TEST',          '81140000', 'broad',  85),   -- Testing services
    ('SC-QC-CERT',          '81140000', 'broad',  85),   -- Certification services
    ('SC-QC-INSPECT',       '81140000', 'broad',  85),   -- Inspection services
    -- Capital Equipment
    ('SC-CAPEQUIP-MACH',    '40100000', 'broad',  90),   -- Industrial machinery
    ('SC-CAPEQUIP-LINE',    '40100000', 'broad',  85),   -- Production line equipment
    ('SC-CAPEQUIP-TOOL',    '27120000', 'broad',  85),   -- Machine tools and tooling
    -- Temporary Works
    ('SC-TEMPWK-SCAF',      '72110000', 'broad',  80),   -- Building construction services
    ('SC-TEMPWK-SITE',      '72110000', 'broad',  75),   -- Site services
    -- Process Energy
    ('SC-PROCNRG-STEAM',    '15110000', 'broad',  80),   -- Fuels and energy
    ('SC-PROCNRG-COMP',     '13100000', 'broad',  80);   -- Industrial gases

    -- ── Insert bridge rows ────────────────────────────────────────────────
    WITH mapped AS (
        SELECT
            cc.id   AS owner_id,
            sc.id   AS code_id,
            b.mapping_type,
            b.confidence,
            b.is_primary
        FROM tmp_cc_bridge b
        JOIN master.commodity_category cc
          ON cc.tenant_id = v_tid
         AND cc.code = b.cc_code
        JOIN shared.commodity_code sc
          ON sc.domain_code = 'unspsc'
         AND sc.code = b.unspsc_code
    )
    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        metadata, created_by
    )
    SELECT
        v_tid, 'commodity_category', m.owner_id,
        'commodity', 'unspsc', m.code_id,
        m.mapping_type, m.confidence, 'seed', m.is_primary,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        v_su
    FROM mapped m
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    SELECT count(*) INTO v_skipped
    FROM tmp_cc_bridge b
    LEFT JOIN master.commodity_category cc
        ON cc.tenant_id = v_tid AND cc.code = b.cc_code
    LEFT JOIN shared.commodity_code sc
        ON sc.domain_code = 'unspsc' AND sc.code = b.unspsc_code
    WHERE cc.id IS NULL OR sc.id IS NULL;

    RAISE NOTICE '[024_commodity_classification] % UNSPSC bridge rows inserted, % skipped (code not in shared.commodity_code)',
        v_inserted, v_skipped;

END $seed$;
