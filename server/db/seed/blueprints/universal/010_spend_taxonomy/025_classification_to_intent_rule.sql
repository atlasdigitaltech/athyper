-- Base intent-routing rules for commodity_category
-- (classification_source='COMMODITY_CATEGORY', covers Layer A + Layer B).
-- Idempotency = DELETE pack rows then re-INSERT, keyed by metadata._seed.pack.
-- Pack names are PRESERVED ('026_base' / '026_base_direct_ops') for compat with
-- any existing DB rows; do not rename.

-- BLOCK 1 — Layer A universal cross-functional rules.
DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '026_base';
    v_version text := '2.0.0';
    v_expected int := 0;
    v_actual   int := 0;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-OPEX') THEN
        RAISE EXCEPTION '[025] business_intents not seeded — run 021 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-IT-HW') THEN
        RAISE EXCEPTION '[025] commodity_categories not seeded — run 023 first';
    END IF;

    DELETE FROM control.commodity_classification_to_intent_rule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    CREATE TEMP TABLE tmp_cir (
        cc_code            text    NOT NULL,
        condition_type     text    NOT NULL,
        condition_config   jsonb   NOT NULL DEFAULT '{}',
        resolved_bi_code   text    NOT NULL,
        explanation_template text  NOT NULL,
        confidence         numeric(3,2) NOT NULL DEFAULT 1.00,
        priority           integer NOT NULL DEFAULT 50,
        direction          text
    ) ON COMMIT DROP;

    INSERT INTO tmp_cir VALUES
    ('SC-IT-HW', 'AMOUNT_ABOVE',  '{"threshold": 5000}', 'BI-CAPEX',
     'IT hardware cost {amount} {currency} exceeds 5 000 — CAPEX', 0.90, 10, 'INBOUND'),
    ('SC-IT-HW', 'FALLBACK',      '{}',                  'BI-OPEX',
     'IT hardware below CAPEX threshold — OPEX',                    0.95, 90, 'INBOUND'),

    -- Software & SaaS — SaaS subscriptions are always OPEX
    ('SC-IT-SW',    'IS_RECURRING', '{}', 'BI-OPEX',
     'Recurring software subscription — OPEX', 0.98, 10, 'INBOUND'),
    ('SC-IT-SW',    'AMOUNT_ABOVE', '{"threshold": 50000}', 'BI-CAPEX',
     'Software perpetual licence > 50 000 — CAPEX', 0.85, 20, 'INBOUND'),
    ('SC-IT-SW',    'FALLBACK',     '{}', 'BI-OPEX',
     'Software cost — default OPEX', 0.90, 90, 'INBOUND'),

    -- Cloud & Hosting — always OPEX
    ('SC-IT-CLOUD',  'FALLBACK', '{}', 'BI-OPEX',
     'Cloud and hosting — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-IT-SVC',    'FALLBACK', '{}', 'BI-OPEX',
     'IT services and support — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-IT-SEC',    'FALLBACK', '{}', 'BI-OPEX',
     'Cybersecurity — OPEX', 0.99, 90, 'INBOUND'),

    -- Telecom — always OPEX
    ('SC-TELCO-VOICE', 'FALLBACK', '{}', 'BI-OPEX', 'Voice & telephony — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-TELCO-DATA',  'FALLBACK', '{}', 'BI-OPEX', 'Data & internet — OPEX',  0.99, 90, 'INBOUND'),
    ('SC-TELCO-MOB',   'FALLBACK', '{}', 'BI-OPEX', 'Mobile & wireless — OPEX', 0.99, 90, 'INBOUND'),

    -- Office Supplies — OPEX
    ('SC-OFFICE-SUP',   'FALLBACK', '{}', 'BI-OPEX', 'Office supplies — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-OFFICE-PRINT', 'FALLBACK', '{}', 'BI-OPEX', 'Printing services — OPEX', 0.99, 90, 'INBOUND'),

    -- Office Furniture — CAPEX if above threshold
    ('SC-OFFICE-FURN', 'AMOUNT_ABOVE', '{"threshold": 10000}', 'BI-CAPEX',
     'Office furniture {amount} {currency} exceeds 10 000 — CAPEX', 0.85, 10, 'INBOUND'),
    ('SC-OFFICE-FURN', 'FALLBACK',     '{}', 'BI-OPEX',
     'Office furniture below CAPEX threshold — OPEX', 0.90, 90, 'INBOUND'),

    -- Office Equipment — CAPEX if above threshold
    ('SC-OFFICE-EQUIP', 'AMOUNT_ABOVE', '{"threshold": 5000}', 'BI-CAPEX',
     'Office equipment {amount} {currency} exceeds 5 000 — CAPEX', 0.85, 10, 'INBOUND'),
    ('SC-OFFICE-EQUIP', 'FALLBACK',     '{}', 'BI-OPEX',
     'Office equipment below CAPEX threshold — OPEX', 0.90, 90, 'INBOUND'),

    -- HR — OPEX
    ('SC-HR-RECRUIT', 'FALLBACK', '{}', 'BI-OPEX', 'Recruitment — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-HR-TRAIN',   'FALLBACK', '{}', 'BI-OPEX', 'Training — OPEX',    0.99, 90, 'INBOUND'),
    ('SC-HR-BEN',     'FALLBACK', '{}', 'BI-OPEX', 'Employee benefits — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-HR-PAYROLL', 'FALLBACK', '{}', 'BI-OPEX', 'Payroll services — OPEX',  0.99, 90, 'INBOUND'),

    -- Travel & Events — OPEX
    ('SC-TRAVEL-AIR',    'FALLBACK', '{}', 'BI-OPEX', 'Air travel — OPEX',        0.99, 90, 'INBOUND'),
    ('SC-TRAVEL-HOTEL',  'FALLBACK', '{}', 'BI-OPEX', 'Accommodation — OPEX',     0.99, 90, 'INBOUND'),
    ('SC-TRAVEL-GROUND', 'FALLBACK', '{}', 'BI-OPEX', 'Ground transport — OPEX',  0.99, 90, 'INBOUND'),
    ('SC-TRAVEL-EVENTS', 'FALLBACK', '{}', 'BI-OPEX', 'Events — OPEX',            0.99, 90, 'INBOUND'),

    -- Professional Services — OPEX (capex only for capitalised dev projects)
    ('SC-PROF-LEGAL',   'FALLBACK', '{}', 'BI-OPEX', 'Legal services — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-PROF-AUDIT',   'FALLBACK', '{}', 'BI-OPEX', 'Audit — OPEX',          0.99, 90, 'INBOUND'),
    ('SC-PROF-CONSULT', 'FALLBACK', '{}', 'BI-OPEX', 'Consulting — OPEX',     0.99, 90, 'INBOUND'),
    ('SC-PROF-ENG',     'FALLBACK', '{}', 'BI-OPEX', 'Engineering advisory — OPEX', 0.99, 90, 'INBOUND'),

    -- Marketing — OPEX
    ('SC-MKTG-DIGITAL', 'FALLBACK', '{}', 'BI-OPEX', 'Digital marketing — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-MKTG-TRAD',    'FALLBACK', '{}', 'BI-OPEX', 'Traditional advertising — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-MKTG-PR',      'FALLBACK', '{}', 'BI-OPEX', 'PR & comms — OPEX',         0.99, 90, 'INBOUND'),
    ('SC-MKTG-CX',      'FALLBACK', '{}', 'BI-OPEX', 'CX & research — OPEX',      0.99, 90, 'INBOUND'),

    -- Facilities — OPEX (rent is operating; large fit-outs may be CAPEX)
    ('SC-FAC-RENT',  'FALLBACK', '{}', 'BI-OPEX', 'Rent — OPEX',             0.99, 90, 'INBOUND'),
    ('SC-FAC-MAINT', 'FALLBACK', '{}', 'BI-OPEX', 'Facility maintenance — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-FAC-CLEAN', 'FALLBACK', '{}', 'BI-OPEX', 'Cleaning — OPEX',         0.99, 90, 'INBOUND'),
    ('SC-FAC-SECUR', 'FALLBACK', '{}', 'BI-OPEX', 'Facility security — OPEX', 0.99, 90, 'INBOUND'),

    -- Utilities — OPEX
    ('SC-UTIL-ELEC',  'FALLBACK', '{}', 'BI-OPEX', 'Electricity — OPEX',    0.99, 90, 'INBOUND'),
    ('SC-UTIL-WATER', 'FALLBACK', '{}', 'BI-OPEX', 'Water — OPEX',          0.99, 90, 'INBOUND'),
    ('SC-UTIL-GAS',   'FALLBACK', '{}', 'BI-OPEX', 'Natural gas — OPEX',    0.99, 90, 'INBOUND'),
    ('SC-UTIL-WASTE', 'FALLBACK', '{}', 'BI-OPEX', 'Waste management — OPEX', 0.99, 90, 'INBOUND'),

    -- Fleet — VEH=CAPEX, FUEL=OPEX, MAINT=OPEX
    ('SC-FLEET-VEH',   'FALLBACK', '{}', 'BI-CAPEX', 'Vehicle purchase — CAPEX',    0.90, 90, 'INBOUND'),
    ('SC-FLEET-FUEL',  'FALLBACK', '{}', 'BI-OPEX',  'Fleet fuel — OPEX',           0.99, 90, 'INBOUND'),
    ('SC-FLEET-MAINT', 'FALLBACK', '{}', 'BI-OPEX',  'Fleet maintenance — OPEX',    0.99, 90, 'INBOUND'),

    -- Insurance — OPEX
    ('SC-INS-PROP', 'FALLBACK', '{}', 'BI-OPEX', 'Property insurance — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-INS-LIAB', 'FALLBACK', '{}', 'BI-OPEX', 'Liability insurance — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-INS-EMP',  'FALLBACK', '{}', 'BI-OPEX', 'Employee insurance — OPEX',  0.99, 90, 'INBOUND'),

    -- Banking & Treasury — OPEX / ADMIN
    ('SC-BANK-FEE',   'FALLBACK', '{}', 'BI-ADMIN', 'Bank fees — ADMIN',      0.95, 90, 'INBOUND'),
    ('SC-BANK-FX',    'FALLBACK', '{}', 'BI-ADMIN', 'FX transactions — ADMIN', 0.90, 90, 'INBOUND'),
    ('SC-BANK-TREAS', 'FALLBACK', '{}', 'BI-ADMIN', 'Treasury services — ADMIN', 0.90, 90, 'INBOUND'),

    -- Taxes & Duties — REGULATORY
    ('SC-TAX-CORP', 'FALLBACK', '{}', 'BI-REG', 'Corporate taxes — REGULATORY',  0.99, 90, 'INBOUND'),
    ('SC-TAX-DUTY', 'FALLBACK', '{}', 'BI-REG', 'Duties and customs — REGULATORY', 0.95, 90, 'INBOUND'),
    ('SC-TAX-STAT', 'FALLBACK', '{}', 'BI-REG', 'Statutory fees — REGULATORY',    0.99, 90, 'INBOUND'),

    -- Safety & Compliance — OPEX / REGULATORY
    ('SC-SAFETY-SEC',  'FALLBACK', '{}', 'BI-OPEX', 'Physical security — OPEX',     0.99, 90, 'INBOUND'),
    ('SC-SAFETY-HSE',  'FALLBACK', '{}', 'BI-REG',  'HSE compliance — REGULATORY',  0.95, 90, 'INBOUND'),
    ('SC-SAFETY-COMP', 'FALLBACK', '{}', 'BI-REG',  'Regulatory compliance — REGULATORY', 0.95, 90, 'INBOUND'),

    -- ESG & Environmental — REGULATORY
    ('SC-ENV-WASTE',  'FALLBACK', '{}', 'BI-REG',  'Waste disposal — REGULATORY',       0.90, 90, 'INBOUND'),
    ('SC-ENV-CARBON', 'FALLBACK', '{}', 'BI-REG',  'Carbon offsets — REGULATORY',       0.85, 90, 'INBOUND'),
    ('SC-ENV-REMEDN', 'FALLBACK', '{}', 'BI-REG',  'Environmental remediation — REGULATORY', 0.90, 90, 'INBOUND'),

    -- Outsourced Services — OPEX
    ('SC-OUTSRC-BPO',    'FALLBACK', '{}', 'BI-OPEX', 'BPO — OPEX',             0.99, 90, 'INBOUND'),
    ('SC-OUTSRC-SHARED', 'FALLBACK', '{}', 'BI-OPEX', 'Shared services — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-OUTSRC-TEMP',   'FALLBACK', '{}', 'BI-OPEX', 'Temp staffing — OPEX',   0.99, 90, 'INBOUND'),

    -- Subscriptions & Licenses — OPEX
    ('SC-SUBS-LIC',  'FALLBACK', '{}', 'BI-OPEX', 'Software licenses — OPEX', 0.99, 90, 'INBOUND'),
    ('SC-SUBS-MEMB', 'FALLBACK', '{}', 'BI-OPEX', 'Memberships — OPEX',       0.99, 90, 'INBOUND'),
    ('SC-SUBS-PUB',  'FALLBACK', '{}', 'BI-OPEX', 'Publications — OPEX',      0.99, 90, 'INBOUND');

    INSERT INTO control.commodity_classification_to_intent_rule (
        tenant_id,
        classification_source, classification_id, direction,
        condition_type, condition_config,
        resolved_intent_id, resolved_domain,
        explanation_template, confidence, priority,
        metadata, created_by
    )
    SELECT
        v_tid,
        'COMMODITY_CATEGORY', cc.id, t.direction,
        t.condition_type, t.condition_config,
        bi.id, bi.domain,
        t.explanation_template, t.confidence, t.priority,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        v_su
    FROM tmp_cir t
    JOIN master.commodity_category cc
      ON cc.tenant_id = v_tid AND cc.code = t.cc_code
    JOIN master.business_intent bi
      ON bi.tenant_id = v_tid AND bi.code = t.resolved_bi_code;

    SELECT count(*) INTO v_expected FROM tmp_cir;
    SELECT count(*) INTO v_actual
    FROM control.commodity_classification_to_intent_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    IF v_actual <> v_expected THEN
        RAISE EXCEPTION '[025] Expected % Layer A intent rules, got %',
            v_expected, v_actual;
    END IF;

    RAISE NOTICE '[025] Layer A (pack=026_base): % intent rules inserted for % categories',
        v_actual,
        (SELECT count(DISTINCT classification_id) FROM control.commodity_classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;


-- BLOCK 2 — Layer B direct-operations rules.
DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '026_base_direct_ops';
    v_version text := '2.0.0';
    v_expected int := 0;
    v_actual   int := 0;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-CAPEQUIP-MACH') THEN
        RAISE EXCEPTION '[025] Layer B categories not seeded — run 023 first';
    END IF;

    DELETE FROM control.commodity_classification_to_intent_rule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    CREATE TEMP TABLE tmp_cir_b (
        cc_code            text    NOT NULL,
        condition_type     text    NOT NULL,
        condition_config   jsonb   NOT NULL DEFAULT '{}',
        resolved_bi_code   text    NOT NULL,
        explanation_template text  NOT NULL,
        confidence         numeric(3,2) NOT NULL DEFAULT 1.00,
        priority           integer NOT NULL DEFAULT 50,
        direction          text
    ) ON COMMIT DROP;

    INSERT INTO tmp_cir_b VALUES
    -- Raw Materials — COGS (they become COGS when sold as part of product)
    ('SC-RAW-METAL', 'FALLBACK', '{}', 'BI-COGS', 'Metals raw material — COGS', 0.95, 90, 'INBOUND'),
    ('SC-RAW-CHEM',  'FALLBACK', '{}', 'BI-COGS', 'Chemicals raw material — COGS', 0.95, 90, 'INBOUND'),
    ('SC-RAW-AGRI',  'FALLBACK', '{}', 'BI-COGS', 'Agricultural raw material — COGS', 0.90, 90, 'INBOUND'),

    -- Components — COGS
    ('SC-COMP-MECH',   'FALLBACK', '{}', 'BI-COGS', 'Mechanical components — COGS', 0.95, 90, 'INBOUND'),
    ('SC-COMP-ELEC',   'FALLBACK', '{}', 'BI-COGS', 'Electronic components — COGS', 0.95, 90, 'INBOUND'),
    ('SC-COMP-STRUCT', 'FALLBACK', '{}', 'BI-COGS', 'Structural components — COGS', 0.90, 90, 'INBOUND'),

    -- Packaging — COGS
    ('SC-PKG-PRIMARY',   'FALLBACK', '{}', 'BI-COGS', 'Primary packaging — COGS', 0.90, 90, 'INBOUND'),
    ('SC-PKG-SECONDARY', 'FALLBACK', '{}', 'BI-COGS', 'Secondary packaging — COGS', 0.90, 90, 'INBOUND'),
    ('SC-PKG-TRANSIT',   'FALLBACK', '{}', 'BI-COGS', 'Transit packaging — COGS',   0.85, 90, 'INBOUND'),

    -- Consumables — OPEX (industrial consumables are period costs)
    ('SC-CONSUM-CHEM',  'FALLBACK', '{}', 'BI-OPEX', 'Industrial chemicals — OPEX',  0.90, 90, 'INBOUND'),
    ('SC-CONSUM-LAB',   'FALLBACK', '{}', 'BI-OPEX', 'Lab consumables — OPEX',       0.90, 90, 'INBOUND'),
    ('SC-CONSUM-CLEAN', 'FALLBACK', '{}', 'BI-OPEX', 'Cleaning consumables — OPEX',  0.95, 90, 'INBOUND'),

    -- MRO — OPEX
    ('SC-MRO-SPARE',  'FALLBACK', '{}', 'BI-OPEX', 'Spare parts — OPEX',          0.90, 90, 'INBOUND'),
    ('SC-MRO-TOOL',   'FALLBACK', '{}', 'BI-OPEX', 'Maintenance tools — OPEX',    0.90, 90, 'INBOUND'),
    ('SC-MRO-SUPPLY', 'FALLBACK', '{}', 'BI-OPEX', 'Maintenance supplies — OPEX', 0.95, 90, 'INBOUND'),

    -- Production Services — OPEX
    ('SC-PRODSVC-CALIB', 'FALLBACK', '{}', 'BI-OPEX', 'Calibration services — OPEX', 0.90, 90, 'INBOUND'),
    ('SC-PRODSVC-PLANT', 'FALLBACK', '{}', 'BI-OPEX', 'Plant services — OPEX',       0.90, 90, 'INBOUND'),

    -- Contract Manufacturing — COGS
    ('SC-CONTRACT-MFG', 'FALLBACK', '{}', 'BI-COGS', 'Contract manufacturing — COGS', 0.90, 90, 'INBOUND'),
    ('SC-CONTRACT-ASM', 'FALLBACK', '{}', 'BI-COGS', 'Assembly subcontracting — COGS', 0.90, 90, 'INBOUND'),

    -- Freight & Customs — OPEX / REGULATORY
    ('SC-FREIGHT-ROAD', 'FALLBACK', '{}', 'BI-OPEX', 'Road freight — OPEX',   0.95, 90, 'INBOUND'),
    ('SC-FREIGHT-SEA',  'FALLBACK', '{}', 'BI-OPEX', 'Sea freight — OPEX',    0.95, 90, 'INBOUND'),
    ('SC-FREIGHT-AIR',  'FALLBACK', '{}', 'BI-OPEX', 'Air freight — OPEX',    0.95, 90, 'INBOUND'),
    ('SC-FREIGHT-CUST', 'FALLBACK', '{}', 'BI-REG',  'Customs duties — REGULATORY', 0.90, 90, 'INBOUND'),

    -- Warehousing — OPEX
    ('SC-WHSE-STORE', 'FALLBACK', '{}', 'BI-OPEX', 'Warehousing — OPEX',    0.95, 90, 'INBOUND'),
    ('SC-WHSE-COLD',  'FALLBACK', '{}', 'BI-OPEX', 'Cold chain — OPEX',     0.95, 90, 'INBOUND'),

    -- Quality & Testing — OPEX
    ('SC-QC-TEST',    'FALLBACK', '{}', 'BI-OPEX', 'Testing services — OPEX',       0.90, 90, 'INBOUND'),
    ('SC-QC-CERT',    'FALLBACK', '{}', 'BI-OPEX', 'Certification services — OPEX', 0.90, 90, 'INBOUND'),
    ('SC-QC-INSPECT', 'FALLBACK', '{}', 'BI-OPEX', 'Inspection services — OPEX',    0.90, 90, 'INBOUND'),

    -- Capital Equipment — CAPEX
    ('SC-CAPEQUIP-MACH', 'FALLBACK', '{}', 'BI-CAPEX', 'Machinery — CAPEX',       0.95, 90, 'INBOUND'),
    ('SC-CAPEQUIP-LINE', 'FALLBACK', '{}', 'BI-CAPEX', 'Production lines — CAPEX', 0.95, 90, 'INBOUND'),
    ('SC-CAPEQUIP-TOOL', 'AMOUNT_ABOVE', '{"threshold": 5000}', 'BI-CAPEX',
     'Tooling {amount} {currency} > 5 000 — CAPEX',                                0.85, 10, 'INBOUND'),
    ('SC-CAPEQUIP-TOOL', 'FALLBACK', '{}', 'BI-OPEX',
     'Tooling below CAPEX threshold — OPEX',                                        0.80, 90, 'INBOUND'),

    -- Temporary Works — OPEX
    ('SC-TEMPWK-SCAF', 'FALLBACK', '{}', 'BI-OPEX', 'Scaffolding — OPEX',  0.90, 90, 'INBOUND'),
    ('SC-TEMPWK-SITE', 'FALLBACK', '{}', 'BI-OPEX', 'Site services — OPEX', 0.95, 90, 'INBOUND'),

    -- Process Energy — OPEX
    ('SC-PROCNRG-STEAM', 'FALLBACK', '{}', 'BI-OPEX', 'Steam & thermal — OPEX',    0.95, 90, 'INBOUND'),
    ('SC-PROCNRG-COMP',  'FALLBACK', '{}', 'BI-OPEX', 'Compressed air/gases — OPEX', 0.95, 90, 'INBOUND');

    INSERT INTO control.commodity_classification_to_intent_rule (
        tenant_id,
        classification_source, classification_id, direction,
        condition_type, condition_config,
        resolved_intent_id, resolved_domain,
        explanation_template, confidence, priority,
        metadata, created_by
    )
    SELECT
        v_tid,
        'COMMODITY_CATEGORY', cc.id, t.direction,
        t.condition_type, t.condition_config,
        bi.id, bi.domain,
        t.explanation_template, t.confidence, t.priority,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        v_su
    FROM tmp_cir_b t
    JOIN master.commodity_category cc
      ON cc.tenant_id = v_tid AND cc.code = t.cc_code
    JOIN master.business_intent bi
      ON bi.tenant_id = v_tid AND bi.code = t.resolved_bi_code;

    SELECT count(*) INTO v_expected FROM tmp_cir_b;
    SELECT count(*) INTO v_actual
    FROM control.commodity_classification_to_intent_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    IF v_actual <> v_expected THEN
        RAISE EXCEPTION '[025] Expected % Layer B intent rules, got %',
            v_expected, v_actual;
    END IF;

    RAISE NOTICE '[025] Layer B (pack=026_base_direct_ops): % intent rules inserted',
        v_actual;

END $seed$;
