-- ============================================================================
-- FILE: 062_full_coverage_rules.sql
-- Purpose: Phase 1c — classification → intent rules for the 75 leaf spend
--          categories NOT covered by 061_min_intake_rules.sql.
--          Together with 061 this achieves 100% leaf-level prepopulation
--          (95 of 95 base-pack leaf categories covered).
--
-- Depends on:
--   020_spend_categories.sql  (base pack — SC-* codes must exist)
--   021_business_intents.sql  (base pack — BI-* codes must exist)
--   061_min_intake_rules.sql  (canonical BI-* domain intents used below)
--
-- Intent targets used (all from base pack 021 unless noted):
--   BI-OPEX, BI-OPEX, BI-OPEX, BI-OPEX, BI-OPEX,
--   BI-OPEX, BI-OPEX, BI-OPEX, BI-OPEX, BI-OPEX,
--   BI-OPEX, BI-OPEX, BI-OPEX,
--   BI-CAPEX, BI-CAPEX, BI-CAPEX, BI-CAPEX, BI-CAPEX,
--   BI-COGS, BI-COGS, BI-COGS,
--   BI-REG, BI-ADMIN
--   Canonical domain intent coverage from 061/062
--
-- Idempotent: WHERE NOT EXISTS guard on (tenant_id, classification_id,
--             condition_type, resolved_intent_id).
-- Priority scheme (same as 061):
--   10-99 = conditional (AMOUNT_ABOVE); 500 = FALLBACK catch-all.
-- ============================================================================

DO $seed_full_coverage$
DECLARE
    v_tenant  record;
    v_row     record;
    v_tid     uuid;
    v_sys     uuid := '00000000-0000-0000-0000-000000000000';
    v_sc_id   uuid;
    v_bi_id   uuid;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id = v_tid AND status = 'active') THEN
        RAISE EXCEPTION '[seed] active tenant % not found', v_tid;
    END IF;


    -- ── Mapping table: (sc_code, bi_code, bi_domain, condition, cfg, priority, conf) ──
    CREATE TEMP TABLE tmp_cat_map (
        sc_code        text    NOT NULL,
        bi_code        text    NOT NULL,
        bi_domain      text    NOT NULL,
        condition_type text    NOT NULL DEFAULT 'FALLBACK',
        condition_cfg  text    NOT NULL DEFAULT '{}',   -- stored as text, cast to jsonb
        priority       integer NOT NULL DEFAULT 500,
        confidence     numeric NOT NULL DEFAULT 0.85,
        explanation    text    NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_cat_map
        (sc_code, bi_code, bi_domain, condition_type, condition_cfg, priority, confidence, explanation)
    VALUES

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-TELCO children (3) → BI-OPEX (telecoms = IT/digital cluster)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-TELCO-VOICE', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Voice & telephony — IT OPEX'),
    ('SC-TELCO-DATA',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Data & internet connectivity — IT OPEX'),
    ('SC-TELCO-MOB',   'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Mobile & wireless — IT OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-OFFICE remaining children (3)
    -- Small furniture/equipment → BI-OPEX; large → BI-CAPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-OFFICE-FURN',  'BI-CAPEX', 'CAPEX', 'AMOUNT_ABOVE', '{"threshold":2000}', 10, 0.88, 'Office furniture above 2,000 threshold — CAPEX'),
    ('SC-OFFICE-FURN',  'BI-OPEX',    'OPEX',  'FALLBACK',     '{}',                500, 0.85, 'Office furniture below CAPEX threshold — facilities OPEX'),
    ('SC-OFFICE-EQUIP', 'BI-CAPEX', 'CAPEX', 'AMOUNT_ABOVE', '{"threshold":5000}', 10, 0.90, 'Office equipment above 5,000 threshold — CAPEX'),
    ('SC-OFFICE-EQUIP', 'BI-OPEX',    'OPEX',  'FALLBACK',     '{}',                500, 0.85, 'Office equipment below CAPEX threshold — facilities OPEX'),
    ('SC-OFFICE-PRINT', 'BI-OPEX',    'OPEX',  'FALLBACK',     '{}',                500, 0.88, 'Printing & reprographics — facilities OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-HR children (4) → BI-OPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-HR-RECRUIT',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Recruitment & staffing — HR OPEX'),
    ('SC-HR-TRAIN',    'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Training & development — HR OPEX'),
    ('SC-HR-BEN',      'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Employee benefits — HR OPEX'),
    ('SC-HR-PAYROLL',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Payroll processing services — HR OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-TRAVEL remaining children (3)
    -- Travel rules use BI-OPEX first, with BI-ADMIN as a low-priority fallback.
    -- Rule is inserted per bi_code, so two separate lookups are NOT needed —
    -- the engine uses whichever intent ID is resolved.
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-TRAVEL-HOTEL',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Hotel accommodation — travel OPEX'),
    ('SC-TRAVEL-GROUND', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Ground transportation — travel OPEX'),
    ('SC-TRAVEL-EVENTS', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Events & conferences — travel OPEX'),
    -- BI-ADMIN fallback if BI-OPEX is not selected
    ('SC-TRAVEL-HOTEL',  'BI-ADMIN', 'ADMIN', 'FALLBACK', '{}', 900, 0.75, 'Hotel accommodation — admin general fallback'),
    ('SC-TRAVEL-GROUND', 'BI-ADMIN', 'ADMIN', 'FALLBACK', '{}', 900, 0.75, 'Ground transport — admin general fallback'),
    ('SC-TRAVEL-EVENTS', 'BI-ADMIN', 'ADMIN', 'FALLBACK', '{}', 900, 0.75, 'Events & conferences — admin general fallback'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-MKTG remaining children (3) -> BI-OPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-MKTG-TRAD', 'BI-OPEX',    'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Traditional advertising — marketing OPEX'),
    ('SC-MKTG-PR',   'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'PR & communications — marketing OPEX'),
    ('SC-MKTG-CX',   'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Customer experience & research — marketing OPEX'),
    -- Low-priority duplicate fallback for MKTG-TRAD
    ('SC-MKTG-TRAD', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 900, 0.75, 'Traditional advertising — marketing OPEX base fallback'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-FAC remaining children (2)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-FAC-CLEAN', 'BI-OPEX',    'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Cleaning & janitorial — facilities OPEX'),
    ('SC-FAC-SECUR', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Facility security — safety OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-UTIL children (4) → BI-OPEX / BI-OPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-UTIL-ELEC',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.95, 'Electricity — utilities OPEX'),
    ('SC-UTIL-WATER', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.95, 'Water & sewerage — utilities OPEX'),
    ('SC-UTIL-GAS',   'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.95, 'Natural gas — utilities OPEX'),
    ('SC-UTIL-WASTE', 'BI-OPEX',  'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Waste management — environmental OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-FLEET children (3)
    -- Vehicle purchase above threshold → CAPEX; lease/small purchase → OPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-FLEET-VEH',   'BI-CAPEX', 'CAPEX', 'AMOUNT_ABOVE', '{"threshold":20000}', 10, 0.90, 'Vehicle purchase above 20,000 — fleet CAPEX'),
    ('SC-FLEET-VEH',   'BI-OPEX',  'OPEX',  'FALLBACK',     '{}',                 500, 0.80, 'Vehicle/lease below CAPEX threshold — fleet OPEX'),
    ('SC-FLEET-FUEL',  'BI-OPEX',   'OPEX',  'FALLBACK',     '{}',                 500, 0.95, 'Fleet fuel — fuel OPEX'),
    ('SC-FLEET-MAINT', 'BI-OPEX',  'OPEX',  'FALLBACK',     '{}',                 500, 0.90, 'Fleet maintenance — fleet OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-INS children (3) → BI-OPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-INS-PROP', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Property & asset insurance — insurance OPEX'),
    ('SC-INS-LIAB', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Liability insurance — insurance OPEX'),
    ('SC-INS-EMP',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Employee insurance — insurance OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-BANK children (3) → BI-OPEX (bank charges = overhead)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-BANK-FEE',   'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.85, 'Bank fees & charges — overhead OPEX'),
    ('SC-BANK-FX',    'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.80, 'FX services — overhead OPEX'),
    ('SC-BANK-TREAS', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.80, 'Treasury services — overhead OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-TAX children (3) → BI-REG
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-TAX-CORP', 'BI-REG', 'REGULATORY', 'FALLBACK', '{}', 500, 0.92, 'Corporate taxes — regulatory'),
    ('SC-TAX-DUTY', 'BI-REG', 'REGULATORY', 'FALLBACK', '{}', 500, 0.92, 'Import duties & customs — regulatory'),
    ('SC-TAX-STAT', 'BI-REG', 'REGULATORY', 'FALLBACK', '{}', 500, 0.90, 'Statutory fees & levies — regulatory'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-SAFETY children (3) → BI-OPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-SAFETY-SEC',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Physical security — safety OPEX'),
    ('SC-SAFETY-HSE',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Health, safety & environment — safety OPEX'),
    ('SC-SAFETY-COMP', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Compliance & regulatory monitoring — safety OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-ENV children (3) → BI-OPEX / BI-REG
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-ENV-WASTE',  'BI-OPEX', 'OPEX',       'FALLBACK', '{}', 500, 0.90, 'Waste & recycling — environmental OPEX'),
    ('SC-ENV-CARBON', 'BI-OPEX', 'OPEX',       'FALLBACK', '{}', 500, 0.88, 'Carbon & emissions management — environmental OPEX'),
    ('SC-ENV-REMEDN', 'BI-REG',  'REGULATORY', 'FALLBACK', '{}', 500, 0.88, 'Environmental remediation — regulatory compliance cost'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-OUTSRC children (3) → BI-OPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-OUTSRC-BPO',    'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'BPO services — outsourcing OPEX'),
    ('SC-OUTSRC-SHARED', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Shared service centre — outsourcing OPEX'),
    ('SC-OUTSRC-TEMP',   'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Temporary staffing — outsourcing OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-SUBS children (3)
    -- Software licenses, memberships, and publications -> BI-OPEX, with BI-ADMIN fallback
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-SUBS-LIC',  'BI-OPEX',   'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Software licenses — IT OPEX'),
    ('SC-SUBS-MEMB', 'BI-OPEX',    'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Memberships & associations — subscriptions OPEX'),
    ('SC-SUBS-PUB',  'BI-OPEX',    'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Publications & subscriptions — subscriptions OPEX'),
    ('SC-SUBS-MEMB', 'BI-ADMIN', 'ADMIN','FALLBACK', '{}', 900, 0.72, 'Memberships — admin general fallback'),
    ('SC-SUBS-PUB',  'BI-ADMIN', 'ADMIN','FALLBACK', '{}', 900, 0.72, 'Publications — admin general fallback'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-RAW children (3) → BI-COGS (direct materials)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-RAW-METAL', 'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.92, 'Metals & alloys — COGS material'),
    ('SC-RAW-CHEM',  'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.92, 'Chemicals & polymers — COGS material'),
    ('SC-RAW-AGRI',  'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Agricultural raw materials — COGS material'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-COMP children (3) → BI-COGS
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-COMP-MECH',   'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.92, 'Mechanical components — COGS material'),
    ('SC-COMP-ELEC',   'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.92, 'Electrical & electronic components — COGS material'),
    ('SC-COMP-STRUCT', 'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Structural components — COGS material'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-PKG children (3) → BI-COGS (packaging is direct production cost)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-PKG-PRIMARY',   'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Primary packaging — COGS material'),
    ('SC-PKG-SECONDARY', 'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Secondary packaging — COGS material'),
    ('SC-PKG-TRANSIT',   'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.88, 'Transit packaging — COGS material'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-CONSUM children (3) → BI-OPEX (consumables = MRO-adjacent)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-CONSUM-CHEM',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.85, 'Industrial chemicals (consumable) — MRO OPEX'),
    ('SC-CONSUM-LAB',   'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.85, 'Lab consumables — MRO OPEX'),
    ('SC-CONSUM-CLEAN', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Cleaning consumables — MRO OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-MRO children (3) → BI-OPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-MRO-SPARE',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Spare parts — MRO OPEX'),
    ('SC-MRO-TOOL',   'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Maintenance tools — MRO OPEX'),
    ('SC-MRO-SUPPLY', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Maintenance supplies — MRO OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-PRODSVC children (2) → BI-OPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-PRODSVC-CALIB', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Calibration services — maintenance OPEX'),
    ('SC-PRODSVC-PLANT', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Plant operations services — maintenance OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-CONTRACT children (2) → BI-COGS (contract manufacturing = COGS subcontract)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-CONTRACT-MFG', 'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.92, 'Contract manufacturing — COGS subcontract'),
    ('SC-CONTRACT-ASM', 'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Assembly subcontracting — COGS subcontract'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-FREIGHT children (4) → BI-COGS
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-FREIGHT-ROAD', 'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Road freight — COGS freight'),
    ('SC-FREIGHT-SEA',  'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Sea freight — COGS freight'),
    ('SC-FREIGHT-AIR',  'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.88, 'Air freight — COGS freight'),
    ('SC-FREIGHT-CUST', 'BI-COGS', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.88, 'Customs & brokerage — COGS freight'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-WHSE children (2) → BI-OPEX (warehousing = facilities overhead)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-WHSE-STORE', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.85, 'Warehousing & storage — facilities OPEX'),
    ('SC-WHSE-COLD',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.85, 'Cold chain services — facilities OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-QC children (3) → BI-OPEX (quality = compliance/safety cluster)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-QC-TEST',    'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Testing & analysis — safety/quality OPEX'),
    ('SC-QC-CERT',    'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Certification & accreditation — safety/quality OPEX'),
    ('SC-QC-INSPECT', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Inspection services — safety/quality OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-CAPEQUIP children (3) → BI-CAPEX / BI-CAPEX / BI-CAPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-CAPEQUIP-MACH', 'BI-CAPEX',  'CAPEX', 'FALLBACK', '{}', 500, 0.95, 'Machinery — CAPEX'),
    ('SC-CAPEQUIP-TOOL', 'BI-CAPEX',  'CAPEX', 'FALLBACK', '{}', 500, 0.95, 'Tooling & fixtures — CAPEX'),
    ('SC-CAPEQUIP-LINE', 'BI-CAPEX', 'CAPEX', 'FALLBACK', '{}', 500, 0.92, 'Production lines — equipment CAPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-TEMPWK children (2) → BI-OPEX (temp works = facilities-adjacent)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-TEMPWK-SCAF', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Scaffolding & access — facilities OPEX'),
    ('SC-TEMPWK-SITE', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Site services — facilities OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-PROCNRG children (2) → BI-OPEX (process energy = utility input)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-PROCNRG-STEAM', 'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Steam & thermal — utilities OPEX'),
    ('SC-PROCNRG-COMP',  'BI-OPEX', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Compressed air & gases — utilities OPEX');

    -- ── Insert rules per tenant ───────────────────────────────────────────────
    FOR v_tenant IN
        SELECT id AS tenant_id FROM master.tenant WHERE id = v_tid AND status = 'active'
    LOOP
        FOR v_row IN SELECT * FROM tmp_cat_map LOOP

            SELECT id INTO v_sc_id
              FROM master.commodity_category
             WHERE tenant_id = v_tenant.tenant_id AND code = v_row.sc_code;
            CONTINUE WHEN v_sc_id IS NULL;

            SELECT id INTO v_bi_id
              FROM master.business_intent
             WHERE tenant_id = v_tenant.tenant_id AND code = v_row.bi_code;
            CONTINUE WHEN v_bi_id IS NULL;   -- intent absent → skip (safe degradation)

            INSERT INTO control.commodity_classification_to_intent_rule (
                tenant_id, classification_source, classification_id, direction,
                condition_type, condition_config, applies_to_flows,
                resolved_intent_id, resolved_domain,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT
                v_tenant.tenant_id,
                'COMMODITY_CATEGORY', v_sc_id, 'INBOUND',
                v_row.condition_type,
                v_row.condition_cfg::jsonb,
                ARRAY['NON_PO','DIRECT_PURCHASE','PURCHASE_CONTRACT'],
                v_bi_id, v_row.bi_domain,
                v_row.explanation,
                v_row.confidence, v_row.priority,
                CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.commodity_classification_to_intent_rule
                 WHERE tenant_id           = v_tenant.tenant_id
                   AND classification_source = 'COMMODITY_CATEGORY'
                   AND classification_id  = v_sc_id
                   AND condition_type     = v_row.condition_type
                   AND resolved_intent_id = v_bi_id
            );

        END LOOP;
    END LOOP;

    RAISE NOTICE '062_full_coverage_rules: classification to intent rules seeded for tenant %', v_tid;
END $seed_full_coverage$;
