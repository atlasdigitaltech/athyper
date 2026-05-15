-- ============================================================================
-- UNIVERSAL — GENERIC BASE SPEND → INTENT LINKAGE
-- ============================================================================
-- File:     022_spend_intent_link.sql
-- Schema:   master.spend_category (UPDATE default_intent_id)
-- Purpose:  Backfill default_intent_id on selectable generic 020_base nodes
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
    v_expected_link_count integer;
    v_actual_link_count integer;
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ── STAGE B: Stage linkage map ───────────────────────────────────────
    CREATE TEMP TABLE tmp_link (
        sc_code text PRIMARY KEY,
        bi_code text NOT NULL
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- MAPPING: spend_category_code → default business_intent_code
    -- Rule: Every selectable generic 020_base node MUST have an intent.
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
    ('SC-FLEET-VEH',     'BI-CAPEX-FLEET'),
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
    ('SC-SUBS-PUB',      'BI-ADMIN-GEN');


    -- STAGE C: Validate one-to-one base seed coverage.
    SELECT count(*) INTO v_actual_link_count
    FROM tmp_link;

    SELECT count(*) INTO v_expected_link_count
    FROM master.spend_category
    WHERE tenant_id = v_tid
      AND parent_id IS NOT NULL
      AND NOT COALESCE((metadata->'_seed'->>'container')::boolean, false)
      AND metadata->'_seed'->>'pack' = '020_base';

    IF v_actual_link_count <> v_expected_link_count THEN
        RAISE EXCEPTION '[022_base] Linkage map coverage mismatch: expected % selectable 020_base categories, got % mappings',
            v_expected_link_count, v_actual_link_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM tmp_link lnk
        LEFT JOIN master.spend_category sc
          ON sc.tenant_id = v_tid
         AND sc.code = lnk.sc_code
         AND sc.parent_id IS NOT NULL
         AND NOT COALESCE((sc.metadata->'_seed'->>'container')::boolean, false)
         AND sc.metadata->'_seed'->>'pack' = '020_base'
        WHERE sc.id IS NULL
    ) THEN
        RAISE EXCEPTION '[022_base] Linkage map references unknown or non-selectable base spend categories: %',
            (SELECT string_agg(lnk.sc_code, ', ' ORDER BY lnk.sc_code)
             FROM tmp_link lnk
             LEFT JOIN master.spend_category sc
               ON sc.tenant_id = v_tid
              AND sc.code = lnk.sc_code
              AND sc.parent_id IS NOT NULL
              AND NOT COALESCE((sc.metadata->'_seed'->>'container')::boolean, false)
              AND sc.metadata->'_seed'->>'pack' = '020_base'
             WHERE sc.id IS NULL);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM master.spend_category sc
        LEFT JOIN tmp_link lnk ON lnk.sc_code = sc.code
        WHERE sc.tenant_id = v_tid
          AND sc.parent_id IS NOT NULL
          AND NOT COALESCE((sc.metadata->'_seed'->>'container')::boolean, false)
          AND sc.metadata->'_seed'->>'pack' = '020_base'
          AND lnk.sc_code IS NULL
    ) THEN
        RAISE EXCEPTION '[022_base] Selectable base spend categories missing from linkage map: %',
            (SELECT string_agg(sc.code, ', ' ORDER BY sc.code)
             FROM master.spend_category sc
             LEFT JOIN tmp_link lnk ON lnk.sc_code = sc.code
             WHERE sc.tenant_id = v_tid
               AND sc.parent_id IS NOT NULL
               AND NOT COALESCE((sc.metadata->'_seed'->>'container')::boolean, false)
               AND sc.metadata->'_seed'->>'pack' = '020_base'
               AND lnk.sc_code IS NULL);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM tmp_link lnk
        LEFT JOIN master.business_intent bi
          ON bi.tenant_id = v_tid AND bi.code = lnk.bi_code
        WHERE bi.id IS NULL
    ) THEN
        RAISE EXCEPTION '[022_base] Linkage map references unknown business intents: %',
            (SELECT string_agg(missing.bi_code, ', ' ORDER BY missing.bi_code)
             FROM (
                 SELECT DISTINCT lnk.bi_code
                 FROM tmp_link lnk
                 LEFT JOIN master.business_intent bi
                   ON bi.tenant_id = v_tid AND bi.code = lnk.bi_code
                 WHERE bi.id IS NULL
             ) missing);
    END IF;

    -- STAGE D: Apply linkage.
    UPDATE master.spend_category sc SET
        default_intent_id = bi.id,
        metadata = sc.metadata
                   || jsonb_build_object('_intent_seed', jsonb_build_object(
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


    -- ── STAGE E: HARD FAIL — selectable nodes without default_intent_id ──
    -- Scope: only 020_base categories; industry packs link their own categories.
    SELECT count(*) INTO v_orphan_count
    FROM master.spend_category
    WHERE tenant_id = v_tid
      AND status = 'active'
      AND default_intent_id IS NULL
      AND NOT COALESCE((metadata->'_seed'->>'container')::boolean, false)
      AND metadata->'_seed'->>'pack' = '020_base';

    IF v_orphan_count > 0 THEN
        RAISE EXCEPTION '[022_base] HARD FAIL — % selectable spend categories without default_intent_id: %',
            v_orphan_count,
            (SELECT string_agg(code, ', ' ORDER BY code)
             FROM master.spend_category
             WHERE tenant_id = v_tid
               AND status = 'active'
               AND default_intent_id IS NULL
               AND NOT COALESCE((metadata->'_seed'->>'container')::boolean, false)
               AND metadata->'_seed'->>'pack' = '020_base');
    END IF;

    -- ── STAGE F: Count assertions ────────────────────────────────────────
    -- Stage D stamps _intent_seed.pack='022_base' on every linked row.
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid
          AND default_intent_id IS NOT NULL
          AND metadata->'_intent_seed'->>'pack' = v_pack) <> v_actual_link_count THEN
        RAISE EXCEPTION '[022_base] Selectable nodes with intent incomplete: expected %, got %',
            v_actual_link_count,
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid
               AND default_intent_id IS NOT NULL
               AND metadata->'_intent_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[022_base] Spend-intent linkage complete: % universal categories linked, 0 orphans',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid
           AND default_intent_id IS NOT NULL
           AND metadata->'_intent_seed'->>'pack' = v_pack);

END $seed$;
