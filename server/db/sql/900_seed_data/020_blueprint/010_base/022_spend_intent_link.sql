-- ============================================================================
-- ATHYPER GROUP — BASE SPEND → INTENT LINKAGE
-- ============================================================================
-- File:     022_spend_intent_link.sql
-- Schema:   master.spend_category (UPDATE default_intent_id)
-- Purpose:  Backfill default_intent_id on all selectable (non-container) nodes
-- Depends:  020_spend_categories.sql, 021_business_intents.sql
-- Idempotent: Yes — UPDATE with resolved IDs
-- Spec ref: §6 default_intent_id Rule (Selectable-Node Contract)
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '022_base';
    v_version  text := '1.0.0';
    v_orphan_count integer;
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found';
    END IF;

    -- ── STAGE B: Stage linkage map ───────────────────────────────────────
    CREATE TEMP TABLE tmp_link (
        sc_code text NOT NULL,
        bi_code text NOT NULL
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- MAPPING: spend_category_code → default business_intent_code
    -- Rule: Every selectable (non-container) node MUST have an intent.
    -- Container-only nodes (roots) are NOT mapped here.
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO tmp_link (sc_code, bi_code) VALUES
    -- ── IT & Digital ─────────────────────────────────────────────────────
    ('SC-IT-HW',         'BI-OPEX-IT'),
    ('SC-IT-SW',         'BI-OPEX-IT'),
    ('SC-IT-CLOUD',      'BI-OPEX-IT'),
    ('SC-IT-SVC',        'BI-OPEX-IT'),
    ('SC-IT-SEC',        'BI-OPEX-IT'),

    -- ── Telecom & Connectivity ───────────────────────────────────────────
    ('SC-TELCO-VOICE',   'BI-OPEX-IT'),
    ('SC-TELCO-DATA',    'BI-OPEX-IT'),
    ('SC-TELCO-MOB',     'BI-OPEX-IT'),

    -- ── Office & Workplace ───────────────────────────────────────────────
    ('SC-OFFICE-SUP',    'BI-OPEX-FAC'),
    ('SC-OFFICE-FURN',   'BI-OPEX-FAC'),
    ('SC-OFFICE-EQUIP',  'BI-OPEX-FAC'),
    ('SC-OFFICE-PRINT',  'BI-OPEX-FAC'),

    -- ── HR, Talent & Benefits ────────────────────────────────────────────
    ('SC-HR-RECRUIT',    'BI-OPEX-HR'),
    ('SC-HR-TRAIN',      'BI-OPEX-HR'),
    ('SC-HR-BEN',        'BI-OPEX-HR'),
    ('SC-HR-PAYROLL',    'BI-OPEX-HR'),

    -- ── Travel, Events & Welfare ─────────────────────────────────────────
    ('SC-TRAVEL-AIR',    'BI-OPEX-HR'),
    ('SC-TRAVEL-HOTEL',  'BI-OPEX-HR'),
    ('SC-TRAVEL-GROUND', 'BI-OPEX-HR'),
    ('SC-TRAVEL-EVENTS', 'BI-OPEX-MKTG'),

    -- ── Professional Services ────────────────────────────────────────────
    ('SC-PROF-LEGAL',    'BI-OPEX-PROF'),
    ('SC-PROF-AUDIT',    'BI-OPEX-PROF'),
    ('SC-PROF-CONSULT',  'BI-OPEX-PROF'),
    ('SC-PROF-ENG',      'BI-OPEX-PROF'),

    -- ── Marketing, Media & CX ────────────────────────────────────────────
    ('SC-MKTG-DIGITAL',  'BI-OPEX-MKTG'),
    ('SC-MKTG-TRAD',     'BI-OPEX-MKTG'),
    ('SC-MKTG-PR',       'BI-OPEX-MKTG'),
    ('SC-MKTG-CX',       'BI-OPEX-MKTG'),

    -- ── Facilities & Occupancy ───────────────────────────────────────────
    ('SC-FAC-RENT',      'BI-OPEX-FAC'),
    ('SC-FAC-MAINT',     'BI-OPEX-MAINT'),
    ('SC-FAC-CLEAN',     'BI-OPEX-FAC'),
    ('SC-FAC-SECUR',     'BI-OPEX-SAFETY'),

    -- ── Utilities & Energy ───────────────────────────────────────────────
    ('SC-UTIL-ELEC',     'BI-OPEX-UTIL'),
    ('SC-UTIL-WATER',    'BI-OPEX-UTIL'),
    ('SC-UTIL-GAS',      'BI-OPEX-UTIL'),
    ('SC-UTIL-WASTE',    'BI-OPEX-ENV'),

    -- ── Fleet & Mobility ─────────────────────────────────────────────────
    ('SC-FLEET-VEH',     'BI-OPEX-FLEET'),
    ('SC-FLEET-FUEL',    'BI-OPEX-FUEL'),
    ('SC-FLEET-MAINT',   'BI-OPEX-FLEET'),

    -- ── Insurance ────────────────────────────────────────────────────────
    ('SC-INS-PROP',      'BI-OPEX-INS'),
    ('SC-INS-LIAB',      'BI-OPEX-INS'),
    ('SC-INS-EMP',       'BI-OPEX-INS'),

    -- ── Banking & Treasury ───────────────────────────────────────────────
    ('SC-BANK-FEE',      'BI-ADMIN-GEN'),
    ('SC-BANK-FX',       'BI-ADMIN-GEN'),
    ('SC-BANK-TREAS',    'BI-ADMIN-GEN'),

    -- ── Taxes & Duties ───────────────────────────────────────────────────
    ('SC-TAX-CORP',      'BI-REG-TAX'),
    ('SC-TAX-DUTY',      'BI-REG-TAX'),
    ('SC-TAX-STAT',      'BI-REG-TAX'),

    -- ── Security, HSE & Compliance ───────────────────────────────────────
    ('SC-SAFETY-SEC',    'BI-OPEX-SAFETY'),
    ('SC-SAFETY-HSE',    'BI-OPEX-SAFETY'),
    ('SC-SAFETY-COMP',   'BI-REG-COMP'),

    -- ── ESG & Environmental ──────────────────────────────────────────────
    ('SC-ENV-WASTE',     'BI-OPEX-ENV'),
    ('SC-ENV-CARBON',    'BI-OPEX-ENV'),
    ('SC-ENV-REMEDN',    'BI-REG-ENV'),

    -- ── Outsourced & Shared Services ─────────────────────────────────────
    ('SC-OUTSRC-BPO',    'BI-OPEX-OUTSRC'),
    ('SC-OUTSRC-SHARED', 'BI-OPEX-OUTSRC'),
    ('SC-OUTSRC-TEMP',   'BI-OPEX-OUTSRC'),

    -- ── Subscriptions & Licenses ─────────────────────────────────────────
    ('SC-SUBS-LIC',      'BI-OPEX-IT'),
    ('SC-SUBS-MEMB',     'BI-ADMIN-GEN'),
    ('SC-SUBS-PUB',      'BI-ADMIN-GEN'),

    -- ══════════════════════════════════════════════════════════════════════
    -- DIRECT OPERATIONS — Layer B leaves
    -- ══════════════════════════════════════════════════════════════════════

    -- ── Raw Materials ────────────────────────────────────────────────────
    ('SC-RAW-METAL',     'BI-COGS-MAT'),
    ('SC-RAW-CHEM',      'BI-COGS-MAT'),
    ('SC-RAW-AGRI',      'BI-COGS-MAT'),

    -- ── Components ───────────────────────────────────────────────────────
    ('SC-COMP-MECH',     'BI-COGS-MAT'),
    ('SC-COMP-ELEC',     'BI-COGS-MAT'),
    ('SC-COMP-STRUCT',   'BI-COGS-MAT'),

    -- ── Packaging ────────────────────────────────────────────────────────
    ('SC-PKG-PRIMARY',   'BI-COGS-MAT'),
    ('SC-PKG-SECONDARY', 'BI-COGS-MAT'),
    ('SC-PKG-TRANSIT',   'BI-COGS-FREIGHT'),

    -- ── Consumables & Chemicals ──────────────────────────────────────────
    ('SC-CONSUM-CHEM',   'BI-COGS-MAT'),
    ('SC-CONSUM-LAB',    'BI-COGS-OH'),
    ('SC-CONSUM-CLEAN',  'BI-COGS-OH'),

    -- ── MRO & Spare Parts ────────────────────────────────────────────────
    ('SC-MRO-SPARE',     'BI-OPEX-MRO'),
    ('SC-MRO-TOOL',      'BI-OPEX-MRO'),
    ('SC-MRO-SUPPLY',    'BI-OPEX-MRO'),

    -- ── Production Services ──────────────────────────────────────────────
    ('SC-PRODSVC-CALIB', 'BI-COGS-OH'),
    ('SC-PRODSVC-PLANT', 'BI-COGS-OH'),

    -- ── Contract Manufacturing ───────────────────────────────────────────
    ('SC-CONTRACT-MFG',  'BI-COGS-SUB'),
    ('SC-CONTRACT-ASM',  'BI-COGS-SUB'),

    -- ── Freight & Logistics ──────────────────────────────────────────────
    ('SC-FREIGHT-ROAD',  'BI-COGS-FREIGHT'),
    ('SC-FREIGHT-SEA',   'BI-COGS-FREIGHT'),
    ('SC-FREIGHT-AIR',   'BI-COGS-FREIGHT'),
    ('SC-FREIGHT-CUST',  'BI-COGS-FREIGHT'),

    -- ── Warehousing ──────────────────────────────────────────────────────
    ('SC-WHSE-STORE',    'BI-COGS-OH'),
    ('SC-WHSE-COLD',     'BI-COGS-OH'),

    -- ── Quality, Lab & Testing ───────────────────────────────────────────
    ('SC-QC-TEST',       'BI-COGS-OH'),
    ('SC-QC-CERT',       'BI-REG-COMP'),
    ('SC-QC-INSPECT',    'BI-COGS-OH'),

    -- ── Capital Equipment ────────────────────────────────────────────────
    ('SC-CAPEQUIP-MACH', 'BI-CAPEX-EQUIP'),
    ('SC-CAPEQUIP-TOOL', 'BI-CAPEX-TOOL'),
    ('SC-CAPEQUIP-LINE', 'BI-CAPEX-EQUIP'),

    -- ── Temporary Works ──────────────────────────────────────────────────
    ('SC-TEMPWK-SCAF',   'BI-COGS-OH'),
    ('SC-TEMPWK-SITE',   'BI-COGS-OH'),

    -- ── Process Energy ───────────────────────────────────────────────────
    ('SC-PROCNRG-STEAM', 'BI-OPEX-UTIL'),
    ('SC-PROCNRG-COMP',  'BI-OPEX-UTIL');


    -- ── STAGE C: Apply linkage ───────────────────────────────────────────
    UPDATE master.spend_category sc SET
        default_intent_id = bi.id,
        metadata = sc.metadata
                   || jsonb_build_object('_seed', jsonb_build_object(
                          'pack',      v_pack,
                          'version',   v_version,
                          'seeded_at', now()::text,
                          'intent_code', lnk.bi_code
                      )),
        updated_at = now(),
        updated_by = v_su
    FROM tmp_link lnk
    JOIN master.business_intent bi
      ON bi.tenant_id = v_tid AND bi.code = lnk.bi_code
    WHERE sc.tenant_id = v_tid
      AND sc.code = lnk.sc_code;


    -- ── STAGE D: HARD FAIL — selectable nodes without default_intent_id ──
    SELECT count(*) INTO v_orphan_count
    FROM master.spend_category
    WHERE tenant_id = v_tid
      AND status = 'active'
      AND default_intent_id IS NULL
      AND NOT COALESCE((metadata->'_seed'->>'container')::boolean, false);

    IF v_orphan_count > 0 THEN
        RAISE EXCEPTION '[022_base] HARD FAIL — % selectable spend categories without default_intent_id: %',
            v_orphan_count,
            (SELECT string_agg(code, ', ' ORDER BY code)
             FROM master.spend_category
             WHERE tenant_id = v_tid
               AND status = 'active'
               AND default_intent_id IS NULL
               AND NOT COALESCE((metadata->'_seed'->>'container')::boolean, false));
    END IF;

    -- ── STAGE E: Count assertions ────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid
          AND status = 'active'
          AND default_intent_id IS NOT NULL) < 80 THEN
        RAISE EXCEPTION '[022_base] Selectable nodes with intent incomplete: expected ≥80, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid
               AND status = 'active'
               AND default_intent_id IS NOT NULL);
    END IF;

    RAISE NOTICE '[022_base] Spend-intent linkage complete: % categories linked, 0 orphans',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid
           AND status = 'active'
           AND default_intent_id IS NOT NULL);

END $seed$;
