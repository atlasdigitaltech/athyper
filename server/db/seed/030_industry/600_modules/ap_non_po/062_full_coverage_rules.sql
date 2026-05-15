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
--   061_min_intake_rules.sql  (pack-specific intents: OPEX-TRAVEL, OPEX-MKTG,
--                              OPEX-SUBS created there are used below)
--
-- Intent targets used (all from base pack 021 unless noted):
--   BI-OPEX-IT, BI-OPEX-HR, BI-OPEX-FAC, BI-OPEX-UTIL, BI-OPEX-FUEL,
--   BI-OPEX-INS, BI-OPEX-MKTG, BI-OPEX-FLEET, BI-OPEX-SAFETY, BI-OPEX-ENV,
--   BI-OPEX-MRO, BI-OPEX-MAINT, BI-OPEX-OUTSRC,
--   BI-CAPEX-IT, BI-CAPEX-FLEET, BI-CAPEX-EQUIP, BI-CAPEX-MACH, BI-CAPEX-TOOL,
--   BI-COGS-MAT, BI-COGS-SUB, BI-COGS-FREIGHT,
--   BI-REG-TAX, BI-ADMIN-GEN
--   Pack-specific (061): OPEX-TRAVEL, OPEX-MKTG, OPEX-SUBS
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
    v_sys     uuid := '00000000-0000-0000-0000-000000000000';
    v_sc_id   uuid;
    v_bi_id   uuid;
BEGIN

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
    -- SC-TELCO children (3) → BI-OPEX-IT (telecoms = IT/digital cluster)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-TELCO-VOICE', 'BI-OPEX-IT', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Voice & telephony — IT OPEX'),
    ('SC-TELCO-DATA',  'BI-OPEX-IT', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Data & internet connectivity — IT OPEX'),
    ('SC-TELCO-MOB',   'BI-OPEX-IT', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Mobile & wireless — IT OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-OFFICE remaining children (3)
    -- Small furniture/equipment → BI-OPEX-FAC; large → BI-CAPEX-EQUIP
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-OFFICE-FURN',  'BI-CAPEX-EQUIP', 'CAPEX', 'AMOUNT_ABOVE', '{"threshold":2000}', 10, 0.88, 'Office furniture above 2,000 threshold — CAPEX'),
    ('SC-OFFICE-FURN',  'BI-OPEX-FAC',    'OPEX',  'FALLBACK',     '{}',                500, 0.85, 'Office furniture below CAPEX threshold — facilities OPEX'),
    ('SC-OFFICE-EQUIP', 'BI-CAPEX-EQUIP', 'CAPEX', 'AMOUNT_ABOVE', '{"threshold":5000}', 10, 0.90, 'Office equipment above 5,000 threshold — CAPEX'),
    ('SC-OFFICE-EQUIP', 'BI-OPEX-FAC',    'OPEX',  'FALLBACK',     '{}',                500, 0.85, 'Office equipment below CAPEX threshold — facilities OPEX'),
    ('SC-OFFICE-PRINT', 'BI-OPEX-FAC',    'OPEX',  'FALLBACK',     '{}',                500, 0.88, 'Printing & reprographics — facilities OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-HR children (4) → BI-OPEX-HR
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-HR-RECRUIT',  'BI-OPEX-HR', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Recruitment & staffing — HR OPEX'),
    ('SC-HR-TRAIN',    'BI-OPEX-HR', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Training & development — HR OPEX'),
    ('SC-HR-BEN',      'BI-OPEX-HR', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Employee benefits — HR OPEX'),
    ('SC-HR-PAYROLL',  'BI-OPEX-HR', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Payroll processing services — HR OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-TRAVEL remaining children (3)
    -- Try OPEX-TRAVEL (from 061) first; engine resolves by bi_code lookup.
    -- Falls back to BI-ADMIN-GEN if OPEX-TRAVEL not seeded for this tenant.
    -- Rule is inserted per bi_code, so two separate lookups are NOT needed —
    -- the engine uses whichever intent ID is resolved.
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-TRAVEL-HOTEL',  'OPEX-TRAVEL', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Hotel accommodation — travel OPEX'),
    ('SC-TRAVEL-GROUND', 'OPEX-TRAVEL', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Ground transportation — travel OPEX'),
    ('SC-TRAVEL-EVENTS', 'OPEX-TRAVEL', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Events & conferences — travel OPEX'),
    -- BI-ADMIN-GEN fallback if OPEX-TRAVEL intent absent
    ('SC-TRAVEL-HOTEL',  'BI-ADMIN-GEN', 'ADMIN', 'FALLBACK', '{}', 900, 0.75, 'Hotel accommodation — admin general fallback'),
    ('SC-TRAVEL-GROUND', 'BI-ADMIN-GEN', 'ADMIN', 'FALLBACK', '{}', 900, 0.75, 'Ground transport — admin general fallback'),
    ('SC-TRAVEL-EVENTS', 'BI-ADMIN-GEN', 'ADMIN', 'FALLBACK', '{}', 900, 0.75, 'Events & conferences — admin general fallback'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-MKTG remaining children (3) → OPEX-MKTG (061) / BI-OPEX-MKTG (base)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-MKTG-TRAD', 'OPEX-MKTG',    'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Traditional advertising — marketing OPEX'),
    ('SC-MKTG-PR',   'BI-OPEX-MKTG', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'PR & communications — marketing OPEX'),
    ('SC-MKTG-CX',   'BI-OPEX-MKTG', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Customer experience & research — marketing OPEX'),
    -- BI-OPEX-MKTG fallback for MKTG-TRAD if OPEX-MKTG absent
    ('SC-MKTG-TRAD', 'BI-OPEX-MKTG', 'OPEX', 'FALLBACK', '{}', 900, 0.75, 'Traditional advertising — marketing OPEX base fallback'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-FAC remaining children (2)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-FAC-CLEAN', 'BI-OPEX-FAC',    'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Cleaning & janitorial — facilities OPEX'),
    ('SC-FAC-SECUR', 'BI-OPEX-SAFETY', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Facility security — safety OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-UTIL children (4) → BI-OPEX-UTIL / BI-OPEX-ENV
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-UTIL-ELEC',  'BI-OPEX-UTIL', 'OPEX', 'FALLBACK', '{}', 500, 0.95, 'Electricity — utilities OPEX'),
    ('SC-UTIL-WATER', 'BI-OPEX-UTIL', 'OPEX', 'FALLBACK', '{}', 500, 0.95, 'Water & sewerage — utilities OPEX'),
    ('SC-UTIL-GAS',   'BI-OPEX-UTIL', 'OPEX', 'FALLBACK', '{}', 500, 0.95, 'Natural gas — utilities OPEX'),
    ('SC-UTIL-WASTE', 'BI-OPEX-ENV',  'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Waste management — environmental OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-FLEET children (3)
    -- Vehicle purchase above threshold → CAPEX; lease/small purchase → OPEX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-FLEET-VEH',   'BI-CAPEX-FLEET', 'CAPEX', 'AMOUNT_ABOVE', '{"threshold":20000}', 10, 0.90, 'Vehicle purchase above 20,000 — fleet CAPEX'),
    ('SC-FLEET-VEH',   'BI-OPEX-FLEET',  'OPEX',  'FALLBACK',     '{}',                 500, 0.80, 'Vehicle/lease below CAPEX threshold — fleet OPEX'),
    ('SC-FLEET-FUEL',  'BI-OPEX-FUEL',   'OPEX',  'FALLBACK',     '{}',                 500, 0.95, 'Fleet fuel — fuel OPEX'),
    ('SC-FLEET-MAINT', 'BI-OPEX-FLEET',  'OPEX',  'FALLBACK',     '{}',                 500, 0.90, 'Fleet maintenance — fleet OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-INS children (3) → BI-OPEX-INS
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-INS-PROP', 'BI-OPEX-INS', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Property & asset insurance — insurance OPEX'),
    ('SC-INS-LIAB', 'BI-OPEX-INS', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Liability insurance — insurance OPEX'),
    ('SC-INS-EMP',  'BI-OPEX-INS', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Employee insurance — insurance OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-BANK children (3) → BI-OPEX-FAC (bank charges = overhead)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-BANK-FEE',   'BI-OPEX-FAC', 'OPEX', 'FALLBACK', '{}', 500, 0.85, 'Bank fees & charges — overhead OPEX'),
    ('SC-BANK-FX',    'BI-OPEX-FAC', 'OPEX', 'FALLBACK', '{}', 500, 0.80, 'FX services — overhead OPEX'),
    ('SC-BANK-TREAS', 'BI-OPEX-FAC', 'OPEX', 'FALLBACK', '{}', 500, 0.80, 'Treasury services — overhead OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-TAX children (3) → BI-REG-TAX
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-TAX-CORP', 'BI-REG-TAX', 'REGULATORY', 'FALLBACK', '{}', 500, 0.92, 'Corporate taxes — regulatory'),
    ('SC-TAX-DUTY', 'BI-REG-TAX', 'REGULATORY', 'FALLBACK', '{}', 500, 0.92, 'Import duties & customs — regulatory'),
    ('SC-TAX-STAT', 'BI-REG-TAX', 'REGULATORY', 'FALLBACK', '{}', 500, 0.90, 'Statutory fees & levies — regulatory'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-SAFETY children (3) → BI-OPEX-SAFETY
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-SAFETY-SEC',  'BI-OPEX-SAFETY', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Physical security — safety OPEX'),
    ('SC-SAFETY-HSE',  'BI-OPEX-SAFETY', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Health, safety & environment — safety OPEX'),
    ('SC-SAFETY-COMP', 'BI-OPEX-SAFETY', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Compliance & regulatory monitoring — safety OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-ENV children (3) → BI-OPEX-ENV / BI-REG-ENV
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-ENV-WASTE',  'BI-OPEX-ENV', 'OPEX',       'FALLBACK', '{}', 500, 0.90, 'Waste & recycling — environmental OPEX'),
    ('SC-ENV-CARBON', 'BI-OPEX-ENV', 'OPEX',       'FALLBACK', '{}', 500, 0.88, 'Carbon & emissions management — environmental OPEX'),
    ('SC-ENV-REMEDN', 'BI-REG-ENV',  'REGULATORY', 'FALLBACK', '{}', 500, 0.88, 'Environmental remediation — regulatory compliance cost'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-OUTSRC children (3) → BI-OPEX-OUTSRC
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-OUTSRC-BPO',    'BI-OPEX-OUTSRC', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'BPO services — outsourcing OPEX'),
    ('SC-OUTSRC-SHARED', 'BI-OPEX-OUTSRC', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Shared service centre — outsourcing OPEX'),
    ('SC-OUTSRC-TEMP',   'BI-OPEX-OUTSRC', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Temporary staffing — outsourcing OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-SUBS children (3)
    -- Software licenses → BI-OPEX-IT; memberships/pubs → OPEX-SUBS (061) or BI-ADMIN-GEN
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-SUBS-LIC',  'BI-OPEX-IT',   'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Software licenses — IT OPEX'),
    ('SC-SUBS-MEMB', 'OPEX-SUBS',    'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Memberships & associations — subscriptions OPEX'),
    ('SC-SUBS-PUB',  'OPEX-SUBS',    'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Publications & subscriptions — subscriptions OPEX'),
    ('SC-SUBS-MEMB', 'BI-ADMIN-GEN', 'ADMIN','FALLBACK', '{}', 900, 0.72, 'Memberships — admin general fallback'),
    ('SC-SUBS-PUB',  'BI-ADMIN-GEN', 'ADMIN','FALLBACK', '{}', 900, 0.72, 'Publications — admin general fallback'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-RAW children (3) → BI-COGS-MAT (direct materials)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-RAW-METAL', 'BI-COGS-MAT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.92, 'Metals & alloys — COGS material'),
    ('SC-RAW-CHEM',  'BI-COGS-MAT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.92, 'Chemicals & polymers — COGS material'),
    ('SC-RAW-AGRI',  'BI-COGS-MAT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Agricultural raw materials — COGS material'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-COMP children (3) → BI-COGS-MAT
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-COMP-MECH',   'BI-COGS-MAT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.92, 'Mechanical components — COGS material'),
    ('SC-COMP-ELEC',   'BI-COGS-MAT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.92, 'Electrical & electronic components — COGS material'),
    ('SC-COMP-STRUCT', 'BI-COGS-MAT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Structural components — COGS material'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-PKG children (3) → BI-COGS-MAT (packaging is direct production cost)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-PKG-PRIMARY',   'BI-COGS-MAT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Primary packaging — COGS material'),
    ('SC-PKG-SECONDARY', 'BI-COGS-MAT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Secondary packaging — COGS material'),
    ('SC-PKG-TRANSIT',   'BI-COGS-MAT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.88, 'Transit packaging — COGS material'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-CONSUM children (3) → BI-OPEX-MRO (consumables = MRO-adjacent)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-CONSUM-CHEM',  'BI-OPEX-MRO', 'OPEX', 'FALLBACK', '{}', 500, 0.85, 'Industrial chemicals (consumable) — MRO OPEX'),
    ('SC-CONSUM-LAB',   'BI-OPEX-MRO', 'OPEX', 'FALLBACK', '{}', 500, 0.85, 'Lab consumables — MRO OPEX'),
    ('SC-CONSUM-CLEAN', 'BI-OPEX-MRO', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Cleaning consumables — MRO OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-MRO children (3) → BI-OPEX-MRO
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-MRO-SPARE',  'BI-OPEX-MRO', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Spare parts — MRO OPEX'),
    ('SC-MRO-TOOL',   'BI-OPEX-MRO', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Maintenance tools — MRO OPEX'),
    ('SC-MRO-SUPPLY', 'BI-OPEX-MRO', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Maintenance supplies — MRO OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-PRODSVC children (2) → BI-OPEX-MAINT
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-PRODSVC-CALIB', 'BI-OPEX-MAINT', 'OPEX', 'FALLBACK', '{}', 500, 0.90, 'Calibration services — maintenance OPEX'),
    ('SC-PRODSVC-PLANT', 'BI-OPEX-MAINT', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Plant operations services — maintenance OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-CONTRACT children (2) → BI-COGS-SUB (contract manufacturing = COGS subcontract)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-CONTRACT-MFG', 'BI-COGS-SUB', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.92, 'Contract manufacturing — COGS subcontract'),
    ('SC-CONTRACT-ASM', 'BI-COGS-SUB', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Assembly subcontracting — COGS subcontract'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-FREIGHT children (4) → BI-COGS-FREIGHT
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-FREIGHT-ROAD', 'BI-COGS-FREIGHT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Road freight — COGS freight'),
    ('SC-FREIGHT-SEA',  'BI-COGS-FREIGHT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.90, 'Sea freight — COGS freight'),
    ('SC-FREIGHT-AIR',  'BI-COGS-FREIGHT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.88, 'Air freight — COGS freight'),
    ('SC-FREIGHT-CUST', 'BI-COGS-FREIGHT', 'COST_OF_SALES', 'FALLBACK', '{}', 500, 0.88, 'Customs & brokerage — COGS freight'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-WHSE children (2) → BI-OPEX-FAC (warehousing = facilities overhead)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-WHSE-STORE', 'BI-OPEX-FAC', 'OPEX', 'FALLBACK', '{}', 500, 0.85, 'Warehousing & storage — facilities OPEX'),
    ('SC-WHSE-COLD',  'BI-OPEX-FAC', 'OPEX', 'FALLBACK', '{}', 500, 0.85, 'Cold chain services — facilities OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-QC children (3) → BI-OPEX-SAFETY (quality = compliance/safety cluster)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-QC-TEST',    'BI-OPEX-SAFETY', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Testing & analysis — safety/quality OPEX'),
    ('SC-QC-CERT',    'BI-OPEX-SAFETY', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Certification & accreditation — safety/quality OPEX'),
    ('SC-QC-INSPECT', 'BI-OPEX-SAFETY', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Inspection services — safety/quality OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-CAPEQUIP children (3) → BI-CAPEX-MACH / BI-CAPEX-TOOL / BI-CAPEX-EQUIP
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-CAPEQUIP-MACH', 'BI-CAPEX-MACH',  'CAPEX', 'FALLBACK', '{}', 500, 0.95, 'Machinery — CAPEX'),
    ('SC-CAPEQUIP-TOOL', 'BI-CAPEX-TOOL',  'CAPEX', 'FALLBACK', '{}', 500, 0.95, 'Tooling & fixtures — CAPEX'),
    ('SC-CAPEQUIP-LINE', 'BI-CAPEX-EQUIP', 'CAPEX', 'FALLBACK', '{}', 500, 0.92, 'Production lines — equipment CAPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-TEMPWK children (2) → BI-OPEX-FAC (temp works = facilities-adjacent)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-TEMPWK-SCAF', 'BI-OPEX-FAC', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Scaffolding & access — facilities OPEX'),
    ('SC-TEMPWK-SITE', 'BI-OPEX-FAC', 'OPEX', 'FALLBACK', '{}', 500, 0.88, 'Site services — facilities OPEX'),

    -- ══════════════════════════════════════════════════════════════════════
    -- SC-PROCNRG children (2) → BI-OPEX-UTIL (process energy = utility input)
    -- ══════════════════════════════════════════════════════════════════════
    ('SC-PROCNRG-STEAM', 'BI-OPEX-UTIL', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Steam & thermal — utilities OPEX'),
    ('SC-PROCNRG-COMP',  'BI-OPEX-UTIL', 'OPEX', 'FALLBACK', '{}', 500, 0.92, 'Compressed air & gases — utilities OPEX');

    -- ── Insert rules per tenant ───────────────────────────────────────────────
    FOR v_tenant IN
        SELECT id AS tenant_id FROM master.tenant WHERE status = 'active'
    LOOP
        FOR v_row IN SELECT * FROM tmp_cat_map LOOP

            SELECT id INTO v_sc_id
              FROM master.spend_category
             WHERE tenant_id = v_tenant.tenant_id AND code = v_row.sc_code;
            CONTINUE WHEN v_sc_id IS NULL;

            SELECT id INTO v_bi_id
              FROM master.business_intent
             WHERE tenant_id = v_tenant.tenant_id AND code = v_row.bi_code;
            CONTINUE WHEN v_bi_id IS NULL;   -- intent absent → skip (safe degradation)

            INSERT INTO control.classification_to_intent_rule (
                tenant_id, classification_source, classification_id, direction,
                condition_type, condition_config, applies_to_flows,
                resolved_intent_id, resolved_domain,
                explanation_template, confidence, priority,
                effective_from, status, created_by
            )
            SELECT
                v_tenant.tenant_id,
                'SPEND_CATEGORY', v_sc_id, 'INBOUND',
                v_row.condition_type,
                v_row.condition_cfg::jsonb,
                ARRAY['NON_PO','DIRECT_PURCHASE','PURCHASE_CONTRACT'],
                v_bi_id, v_row.bi_domain,
                v_row.explanation,
                v_row.confidence, v_row.priority,
                CURRENT_DATE, 'active', v_sys
            WHERE NOT EXISTS (
                SELECT 1 FROM control.classification_to_intent_rule
                 WHERE tenant_id           = v_tenant.tenant_id
                   AND classification_id  = v_sc_id
                   AND condition_type     = v_row.condition_type
                   AND resolved_intent_id = v_bi_id
            );

        END LOOP;
    END LOOP;

    RAISE NOTICE '062_full_coverage_rules: classification → intent rules seeded for 75 remaining leaf categories across all active tenants';
END $seed_full_coverage$;
