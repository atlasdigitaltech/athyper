-- Routes incoming UNSPSC codes to commodity_category via PREFIX match_mode.
-- Priority scheme: 90 narrow (6+ digit family), 70 medium (4-digit segment),
-- 50 broad (2-digit segment group). Higher priority wins when multiple match.
-- Idempotency = DELETE-then-INSERT by metadata._seed.pack; pack names
-- PRESERVED ('024_base' / '024_base_direct_ops') for compat — do not rename.

-- BLOCK 1 — Layer A universal routing.
DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '024_base';
    v_version text := '2.0.0';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION '[026] commodity_categories not seeded — run 023 first';
    END IF;

    DELETE FROM control.commodity_code_to_category_rule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    CREATE TEMP TABLE tmp_routing (
        unspsc_prefix   text    NOT NULL,
        cc_code         text    NOT NULL,
        priority        smallint NOT NULL DEFAULT 50,
        confidence      numeric(5,2) NOT NULL DEFAULT 80.00
    ) ON COMMIT DROP;

    INSERT INTO tmp_routing (unspsc_prefix, cc_code, priority, confidence) VALUES
    ('432100', 'SC-IT-HW', 90, 90),   -- Computer Equipment
    ('432300', 'SC-IT-SW', 90, 90),   -- Software
    ('811100', 'SC-IT-SVC', 70, 80),   -- Computer services (broad → also cloud)
    ('432', 'SC-IT-HW', 50, 75),   -- All IT hardware UNSPSC 43xx
    ('811', 'SC-IT-SVC', 50, 70),   -- All computer services

    -- ── Telecom ───────────────────────────────────────────────────────────
    ('831100', 'SC-TELCO-VOICE', 70, 85),
    ('831', 'SC-TELCO-VOICE', 50, 70),

    -- ── Office Supplies ───────────────────────────────────────────────────
    ('441100', 'SC-OFFICE-SUP', 70, 90),
    ('441000', 'SC-OFFICE-EQUIP', 70, 85),
    ('561000', 'SC-OFFICE-FURN', 70, 90),
    ('821100', 'SC-OFFICE-PRINT', 80, 85),  -- printing beats marketing at same prefix
    ('441', 'SC-OFFICE-SUP', 50, 75),
    ('561', 'SC-OFFICE-FURN', 50, 75),

    -- ── HR & Benefits ─────────────────────────────────────────────────────
    ('931300', 'SC-HR-RECRUIT', 70, 80),
    ('861300', 'SC-HR-TRAIN', 70, 85),
    ('731100', 'SC-HR-BEN', 70, 75),
    ('801100', 'SC-HR-PAYROLL', 70, 70),

    -- ── Travel & Events ───────────────────────────────────────────────────
    ('781100', 'SC-TRAVEL-AIR', 70, 90),
    ('901100', 'SC-TRAVEL-HOTEL', 70, 90),
    ('781200', 'SC-TRAVEL-GROUND', 70, 85),
    ('801700', 'SC-TRAVEL-EVENTS', 70, 75),
    ('781', 'SC-TRAVEL-AIR', 50, 70),
    ('901', 'SC-TRAVEL-HOTEL', 50, 70),

    -- ── Professional Services ─────────────────────────────────────────────
    ('811400', 'SC-PROF-ENG', 70, 80),
    ('801000', 'SC-PROF-CONSULT', 70, 75),
    ('801', 'SC-PROF-CONSULT', 50, 65),

    -- ── Marketing ────────────────────────────────────────────────────────
    ('821100', 'SC-MKTG-TRAD', 70, 75),
    ('801200', 'SC-MKTG-PR', 70, 80),
    ('821', 'SC-MKTG-TRAD', 50, 65),

    -- ── Facilities ───────────────────────────────────────────────────────
    ('801400', 'SC-FAC-RENT', 70, 85),
    ('721000', 'SC-FAC-MAINT', 70, 85),
    ('761100', 'SC-FAC-CLEAN', 70, 90),
    ('921000', 'SC-FAC-SECUR', 70, 85),
    ('721', 'SC-FAC-MAINT', 50, 70),
    ('761', 'SC-FAC-CLEAN', 50, 75),

    -- ── Utilities ────────────────────────────────────────────────────────
    ('831010', 'SC-UTIL-ELEC', 70, 80),  -- Electrical utilities (UNSPSC 8310 family)
    ('771000', 'SC-UTIL-WASTE', 70, 85),  -- environmental management — lower priority than SC-ENV-WASTE
    ('771', 'SC-UTIL-WASTE', 50, 70),

    -- ── Fleet & Mobility ─────────────────────────────────────────────────
    ('251000', 'SC-FLEET-VEH', 70, 90),
    ('151000', 'SC-FLEET-FUEL', 70, 90),
    ('781800', 'SC-FLEET-MAINT', 70, 80),
    ('251', 'SC-FLEET-VEH', 50, 80),
    ('151', 'SC-FLEET-FUEL', 50, 80),

    -- ── Insurance ────────────────────────────────────────────────────────
    ('731300', 'SC-INS-PROP', 70, 85),
    ('731', 'SC-INS-PROP', 50, 70),

    -- ── Banking & Treasury ───────────────────────────────────────────────
    ('841000', 'SC-BANK-FEE', 70, 85),
    ('841300', 'SC-BANK-FX', 70, 85),
    ('841', 'SC-BANK-FEE', 50, 70),

    -- ── Taxes & Duties ───────────────────────────────────────────────────
    ('931600', 'SC-TAX-CORP', 70, 80),
    ('931', 'SC-TAX-CORP', 50, 65),

    -- ── Safety & HSE ─────────────────────────────────────────────────────
    ('921000', 'SC-SAFETY-SEC', 80, 80),  -- priority 80: beats SC-FAC-SECUR (70) at same prefix
    ('771300', 'SC-SAFETY-HSE', 70, 85),

    -- ── ESG & Environmental ──────────────────────────────────────────────
    ('771000', 'SC-ENV-WASTE', 80, 80),  -- priority 80: beats SC-UTIL-WASTE (70) at same prefix
    ('771', 'SC-ENV-WASTE', 51, 65),

    -- ── Outsourced Services ───────────────────────────────────────────────
    ('931300', 'SC-OUTSRC-TEMP', 69, 75),
    ('801', 'SC-OUTSRC-BPO', 49, 60),

    -- ── Subscriptions & Licenses ─────────────────────────────────────────
    ('432300', 'SC-SUBS-LIC', 89, 85),
    ('861000', 'SC-SUBS-MEMB', 70, 80),
    ('821', 'SC-SUBS-PUB', 49, 65);

    INSERT INTO control.commodity_code_to_category_rule (
        tenant_id,
        commodity_domain_code, match_mode,
        code_from, code_to, code_level,
        commodity_category_id,
        priority, confidence,
        metadata, created_by
    )
    SELECT
        v_tid,
        'unspsc', 'PREFIX',
        t.unspsc_prefix, NULL, NULL,
        cc.id,
        t.priority, t.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        v_su
    FROM tmp_routing t
    JOIN master.commodity_category cc
      ON cc.tenant_id = v_tid AND cc.code = t.cc_code;

    RAISE NOTICE '[026] Layer A routing rules (pack=024_base): % rules inserted',
        (SELECT count(*) FROM control.commodity_code_to_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;


-- BLOCK 2 — Layer B direct-operations routing.
DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '024_base_direct_ops';
    v_version text := '2.0.0';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-CAPEQUIP-MACH') THEN
        RAISE EXCEPTION '[026] Layer B categories not seeded — run 023 first';
    END IF;

    DELETE FROM control.commodity_code_to_category_rule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    CREATE TEMP TABLE tmp_routing_b (
        unspsc_prefix   text     NOT NULL,
        cc_code         text     NOT NULL,
        priority        smallint NOT NULL DEFAULT 50,
        confidence      numeric(5,2) NOT NULL DEFAULT 80.00
    ) ON COMMIT DROP;

    INSERT INTO tmp_routing_b (unspsc_prefix, cc_code, priority, confidence) VALUES
    -- ── Raw Materials ─────────────────────────────────────────────────────
    ('111000', 'SC-RAW-METAL', 70, 90),
    ('121000', 'SC-RAW-CHEM', 80, 90),  -- raw material input wins over consumable at same prefix
    ('101000', 'SC-RAW-AGRI', 70, 85),
    ('111', 'SC-RAW-METAL', 50, 80),
    ('121', 'SC-RAW-CHEM', 50, 80),
    ('101', 'SC-RAW-AGRI', 50, 75),

    -- ── Components ───────────────────────────────────────────────────────
    ('311600', 'SC-COMP-MECH', 70, 85),
    ('321000', 'SC-COMP-ELEC', 70, 85),
    ('301000', 'SC-COMP-STRUCT', 70, 80),
    ('311', 'SC-COMP-MECH', 50, 75),
    ('321', 'SC-COMP-ELEC', 50, 75),
    ('301', 'SC-COMP-STRUCT', 50, 70),

    -- ── Packaging ────────────────────────────────────────────────────────
    ('241200', 'SC-PKG-PRIMARY', 70, 90),
    ('241', 'SC-PKG-SECONDARY', 50, 75),

    -- ── Consumables ──────────────────────────────────────────────────────
    ('121000', 'SC-CONSUM-CHEM', 70, 80),
    ('411100', 'SC-CONSUM-LAB', 70, 90),
    ('471300', 'SC-CONSUM-CLEAN', 80, 90),  -- cleaning supplies beat generic MRO at same prefix
    ('411', 'SC-CONSUM-LAB', 50, 75),
    ('471', 'SC-CONSUM-CLEAN', 50, 75),

    -- ── MRO ──────────────────────────────────────────────────────────────
    ('312000', 'SC-MRO-SPARE', 70, 85),
    ('271100', 'SC-MRO-TOOL', 70, 85),
    ('471300', 'SC-MRO-SUPPLY', 70, 75),
    ('271', 'SC-MRO-TOOL', 50, 75),

    -- ── Production Services ───────────────────────────────────────────────
    ('811400', 'SC-PRODSVC-CALIB', 80, 80),  -- calibration more specific than general QC testing

    -- ── Contract Manufacturing ────────────────────────────────────────────
    ('801300', 'SC-CONTRACT-MFG', 70, 80),

    -- ── Freight & Logistics ───────────────────────────────────────────────
    ('781000', 'SC-FREIGHT-ROAD', 70, 90),
    ('781300', 'SC-FREIGHT-SEA', 90, 90),  -- UNSPSC 78130000 = water/sea transportation
    ('781200', 'SC-FREIGHT-CUST', 90, 85),
    ('781300', 'SC-WHSE-STORE', 70, 85),
    ('781', 'SC-FREIGHT-ROAD', 51, 70),

    -- ── Quality & Testing ─────────────────────────────────────────────────
    ('811400', 'SC-QC-TEST', 71, 80),

    -- ── Capital Equipment ─────────────────────────────────────────────────
    ('401000', 'SC-CAPEQUIP-MACH', 70, 90),
    ('271200', 'SC-CAPEQUIP-TOOL', 70, 85),
    ('401', 'SC-CAPEQUIP-MACH', 50, 80),

    -- ── Process Energy ────────────────────────────────────────────────────
    ('151100', 'SC-PROCNRG-STEAM', 70, 80),
    ('131000', 'SC-PROCNRG-COMP', 70, 80),
    ('131', 'SC-PROCNRG-COMP', 50, 75);

    INSERT INTO control.commodity_code_to_category_rule (
        tenant_id,
        commodity_domain_code, match_mode,
        code_from, code_to, code_level,
        commodity_category_id,
        priority, confidence,
        metadata, created_by
    )
    SELECT
        v_tid,
        'unspsc', 'PREFIX',
        t.unspsc_prefix, NULL, NULL,
        cc.id,
        t.priority, t.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        v_su
    FROM tmp_routing_b t
    JOIN master.commodity_category cc
      ON cc.tenant_id = v_tid AND cc.code = t.cc_code;

    RAISE NOTICE '[026] Layer B routing rules (pack=024_base_direct_ops): % rules inserted',
        (SELECT count(*) FROM control.commodity_code_to_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
