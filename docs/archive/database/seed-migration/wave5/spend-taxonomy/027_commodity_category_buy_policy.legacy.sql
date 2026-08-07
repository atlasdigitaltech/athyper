-- Tenant-default buy policy per leaf commodity_category (95 rows).
-- scope_type=TENANT, mapping_mode=ALLOW, is_default=true.
-- This row supplies the UI display default for the taxonomy browser;
-- runtime routing still goes through the 025 FALLBACK intent rules.

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '027_commodity_buy_policy';
    v_version text := '1.0.0';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-OPEX') THEN
        RAISE EXCEPTION '[027] business_intents not seeded — run 021 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION '[027] commodity_categories not seeded — run 023 first';
    END IF;

    DELETE FROM control.commodity_category_buy_policy
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    CREATE TEMP TABLE tmp_cc_intent (
        cc_code         text NOT NULL,
        bi_code         text NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_cc_intent (cc_code, bi_code) VALUES
    ('SC-IT-HW',         'BI-OPEX'),   -- default OPEX; CAPEX threshold handled at runtime
    ('SC-IT-SW',         'BI-OPEX'),
    ('SC-IT-CLOUD',      'BI-OPEX'),
    ('SC-IT-SVC',        'BI-OPEX'),
    ('SC-IT-SEC',        'BI-OPEX'),
    -- Telecom
    ('SC-TELCO-VOICE',   'BI-OPEX'),
    ('SC-TELCO-DATA',    'BI-OPEX'),
    ('SC-TELCO-MOB',     'BI-OPEX'),
    -- Office & Workplace
    ('SC-OFFICE-SUP',    'BI-OPEX'),
    ('SC-OFFICE-FURN',   'BI-OPEX'),   -- default OPEX; CAPEX threshold at runtime
    ('SC-OFFICE-EQUIP',  'BI-OPEX'),
    ('SC-OFFICE-PRINT',  'BI-OPEX'),
    -- HR
    ('SC-HR-RECRUIT',    'BI-OPEX'),
    ('SC-HR-TRAIN',      'BI-OPEX'),
    ('SC-HR-BEN',        'BI-OPEX'),
    ('SC-HR-PAYROLL',    'BI-OPEX'),
    -- Travel
    ('SC-TRAVEL-AIR',    'BI-OPEX'),
    ('SC-TRAVEL-HOTEL',  'BI-OPEX'),
    ('SC-TRAVEL-GROUND', 'BI-OPEX'),
    ('SC-TRAVEL-EVENTS', 'BI-OPEX'),
    -- Professional Services
    ('SC-PROF-LEGAL',    'BI-OPEX'),
    ('SC-PROF-AUDIT',    'BI-OPEX'),
    ('SC-PROF-CONSULT',  'BI-OPEX'),
    ('SC-PROF-ENG',      'BI-OPEX'),
    -- Marketing
    ('SC-MKTG-DIGITAL',  'BI-OPEX'),
    ('SC-MKTG-TRAD',     'BI-OPEX'),
    ('SC-MKTG-PR',       'BI-OPEX'),
    ('SC-MKTG-CX',       'BI-OPEX'),
    -- Facilities
    ('SC-FAC-RENT',      'BI-OPEX'),
    ('SC-FAC-MAINT',     'BI-OPEX'),
    ('SC-FAC-CLEAN',     'BI-OPEX'),
    ('SC-FAC-SECUR',     'BI-OPEX'),
    -- Utilities
    ('SC-UTIL-ELEC',     'BI-OPEX'),
    ('SC-UTIL-WATER',    'BI-OPEX'),
    ('SC-UTIL-GAS',      'BI-OPEX'),
    ('SC-UTIL-WASTE',    'BI-OPEX'),
    -- Fleet
    ('SC-FLEET-VEH',     'BI-CAPEX'),
    ('SC-FLEET-FUEL',    'BI-OPEX'),
    ('SC-FLEET-MAINT',   'BI-OPEX'),
    -- Insurance
    ('SC-INS-PROP',      'BI-OPEX'),
    ('SC-INS-LIAB',      'BI-OPEX'),
    ('SC-INS-EMP',       'BI-OPEX'),
    -- Banking
    ('SC-BANK-FEE',      'BI-ADMIN'),
    ('SC-BANK-FX',       'BI-ADMIN'),
    ('SC-BANK-TREAS',    'BI-ADMIN'),
    -- Taxes
    ('SC-TAX-CORP',      'BI-REG'),
    ('SC-TAX-DUTY',      'BI-REG'),
    ('SC-TAX-STAT',      'BI-REG'),
    -- Safety
    ('SC-SAFETY-SEC',    'BI-OPEX'),
    ('SC-SAFETY-HSE',    'BI-REG'),
    ('SC-SAFETY-COMP',   'BI-REG'),
    -- ESG
    ('SC-ENV-WASTE',     'BI-REG'),
    ('SC-ENV-CARBON',    'BI-REG'),
    ('SC-ENV-REMEDN',    'BI-REG'),
    -- Outsourced
    ('SC-OUTSRC-BPO',    'BI-OPEX'),
    ('SC-OUTSRC-SHARED', 'BI-OPEX'),
    ('SC-OUTSRC-TEMP',   'BI-OPEX'),
    -- Subscriptions
    ('SC-SUBS-LIC',      'BI-OPEX'),
    ('SC-SUBS-MEMB',     'BI-OPEX'),
    ('SC-SUBS-PUB',      'BI-OPEX');

    INSERT INTO tmp_cc_intent (cc_code, bi_code) VALUES
    ('SC-RAW-METAL',        'BI-COGS'),
    ('SC-RAW-CHEM',         'BI-COGS'),
    ('SC-RAW-AGRI',         'BI-COGS'),
    -- Components
    ('SC-COMP-MECH',        'BI-COGS'),
    ('SC-COMP-ELEC',        'BI-COGS'),
    ('SC-COMP-STRUCT',      'BI-COGS'),
    -- Packaging
    ('SC-PKG-PRIMARY',      'BI-COGS'),
    ('SC-PKG-SECONDARY',    'BI-COGS'),
    ('SC-PKG-TRANSIT',      'BI-COGS'),
    -- Consumables
    ('SC-CONSUM-CHEM',      'BI-OPEX'),
    ('SC-CONSUM-LAB',       'BI-OPEX'),
    ('SC-CONSUM-CLEAN',     'BI-OPEX'),
    -- MRO
    ('SC-MRO-SPARE',        'BI-OPEX'),
    ('SC-MRO-TOOL',         'BI-OPEX'),
    ('SC-MRO-SUPPLY',       'BI-OPEX'),
    -- Production Services
    ('SC-PRODSVC-CALIB',    'BI-OPEX'),
    ('SC-PRODSVC-PLANT',    'BI-OPEX'),
    -- Contract Manufacturing
    ('SC-CONTRACT-MFG',     'BI-COGS'),
    ('SC-CONTRACT-ASM',     'BI-COGS'),
    -- Freight
    ('SC-FREIGHT-ROAD',     'BI-OPEX'),
    ('SC-FREIGHT-SEA',      'BI-OPEX'),
    ('SC-FREIGHT-AIR',      'BI-OPEX'),
    ('SC-FREIGHT-CUST',     'BI-REG'),
    -- Warehousing
    ('SC-WHSE-STORE',       'BI-OPEX'),
    ('SC-WHSE-COLD',        'BI-OPEX'),
    -- Quality
    ('SC-QC-TEST',          'BI-OPEX'),
    ('SC-QC-CERT',          'BI-OPEX'),
    ('SC-QC-INSPECT',       'BI-OPEX'),
    -- Capital Equipment
    ('SC-CAPEQUIP-MACH',    'BI-CAPEX'),
    ('SC-CAPEQUIP-LINE',    'BI-CAPEX'),
    ('SC-CAPEQUIP-TOOL',    'BI-OPEX'),   -- default OPEX; CAPEX threshold at runtime
    -- Temporary Works
    ('SC-TEMPWK-SCAF',      'BI-OPEX'),
    ('SC-TEMPWK-SITE',      'BI-OPEX'),
    -- Process Energy
    ('SC-PROCNRG-STEAM',    'BI-OPEX'),
    ('SC-PROCNRG-COMP',     'BI-OPEX');

    INSERT INTO control.commodity_category_buy_policy (
        tenant_id,
        commodity_category_id, business_intent_id,
        scope_type, scope_id, company_code_id,
        mapping_mode, is_default, sort_order,
        effective_from,
        metadata, created_by
    )
    SELECT
        v_tid,
        cc.id, bi.id,
        'TENANT', NULL, NULL,
        'ALLOW', true, 0,
        CURRENT_DATE,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        v_su
    FROM tmp_cc_intent t
    JOIN master.commodity_category cc
      ON cc.tenant_id = v_tid AND cc.code = t.cc_code
    JOIN master.business_intent bi
      ON bi.tenant_id = v_tid AND bi.code = t.bi_code;

    IF (SELECT count(*) FROM control.commodity_category_buy_policy
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 95 THEN
        RAISE EXCEPTION '[027_commodity_buy_policy] Expected 95 buy policy rows (60 Layer A + 35 Layer B), got %',
            (SELECT count(*) FROM control.commodity_category_buy_policy
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[027_commodity_buy_policy] % tenant-level buy policy rows inserted (one per leaf category)',
        (SELECT count(*) FROM control.commodity_category_buy_policy
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
