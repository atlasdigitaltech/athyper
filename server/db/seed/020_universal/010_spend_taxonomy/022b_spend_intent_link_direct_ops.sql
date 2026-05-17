-- ============================================================================
-- UNIVERSAL — DIRECT-OPS SPEND → INTENT LINKAGE (Layer B)
-- ============================================================================
-- File:     022b_spend_intent_link_direct_ops.sql
-- Schema:   master.spend_category (UPDATE default_intent_id)
-- Purpose:  Backfill default_intent_id on all Layer B selectable nodes (35)
-- Depends:  020b_spend_categories_direct_ops.sql (Layer B categories)
--           021b_business_intents_direct_ops.sql (BI-COGS-*, BI-OPEX,
--             BI-CAPEX, BI-CAPEX, BI-CAPEX)
--           022_spend_intent_link.sql (021_base intents must also exist)
-- Idempotent: Yes — UPDATE with resolved IDs
-- Spec ref: §6 default_intent_id Rule (Layer B extension)
-- ============================================================================
-- OPT-IN: Run after 020b + 021b + 022_spend_intent_link.sql complete.
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '022_base_direct_ops';
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

    -- Verify Layer B spend categories loaded (020b)
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-RAW-METAL') THEN
        RAISE EXCEPTION '[022_base_direct_ops] SC-RAW-METAL not found — run 020b_spend_categories_direct_ops.sql first';
    END IF;

    -- Verify direct-ops intents loaded (021b)
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION '[022_base_direct_ops] BI-COGS not found — run 021b_business_intents_direct_ops.sql first';
    END IF;

    -- ── STAGE B: Stage linkage map ───────────────────────────────────────
    DROP TABLE IF EXISTS tmp_link;
    CREATE TEMP TABLE tmp_link (
        sc_code text PRIMARY KEY,
        bi_code text NOT NULL
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- MAPPING: Layer B spend_category_code → default business_intent_code
    -- Rule: Every selectable (non-container) node MUST have an intent.
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO tmp_link (sc_code, bi_code) VALUES
    -- ── Raw Materials ────────────────────────────────────────────────────
    ('SC-RAW-METAL',     'BI-COGS'),
    ('SC-RAW-CHEM',      'BI-COGS'),
    ('SC-RAW-AGRI',      'BI-COGS'),

    -- ── Components ───────────────────────────────────────────────────────
    ('SC-COMP-MECH',     'BI-COGS'),
    ('SC-COMP-ELEC',     'BI-COGS'),
    ('SC-COMP-STRUCT',   'BI-COGS'),

    -- ── Packaging ────────────────────────────────────────────────────────
    ('SC-PKG-PRIMARY',   'BI-COGS'),
    ('SC-PKG-SECONDARY', 'BI-COGS'),
    ('SC-PKG-TRANSIT',   'BI-COGS'),

    -- ── Consumables & Chemicals ──────────────────────────────────────────
    ('SC-CONSUM-CHEM',   'BI-COGS'),
    ('SC-CONSUM-LAB',    'BI-COGS'),
    ('SC-CONSUM-CLEAN',  'BI-COGS'),

    -- ── MRO & Spare Parts ────────────────────────────────────────────────
    ('SC-MRO-SPARE',     'BI-OPEX'),
    ('SC-MRO-TOOL',      'BI-OPEX'),
    ('SC-MRO-SUPPLY',    'BI-OPEX'),

    -- ── Production Services ──────────────────────────────────────────────
    ('SC-PRODSVC-CALIB', 'BI-COGS'),
    ('SC-PRODSVC-PLANT', 'BI-COGS'),

    -- ── Contract Manufacturing ───────────────────────────────────────────
    ('SC-CONTRACT-MFG',  'BI-COGS'),
    ('SC-CONTRACT-ASM',  'BI-COGS'),

    -- ── Freight & Logistics ──────────────────────────────────────────────
    ('SC-FREIGHT-ROAD',  'BI-COGS'),
    ('SC-FREIGHT-SEA',   'BI-COGS'),
    ('SC-FREIGHT-AIR',   'BI-COGS'),
    ('SC-FREIGHT-CUST',  'BI-COGS'),

    -- ── Warehousing ──────────────────────────────────────────────────────
    ('SC-WHSE-STORE',    'BI-COGS'),
    ('SC-WHSE-COLD',     'BI-COGS'),

    -- ── Quality, Lab & Testing ───────────────────────────────────────────
    ('SC-QC-TEST',       'BI-COGS'),
    ('SC-QC-CERT',       'BI-REG'),
    ('SC-QC-INSPECT',    'BI-COGS'),

    -- ── Capital Equipment ────────────────────────────────────────────────
    ('SC-CAPEQUIP-MACH', 'BI-CAPEX'),
    ('SC-CAPEQUIP-TOOL', 'BI-CAPEX'),
    ('SC-CAPEQUIP-LINE', 'BI-CAPEX'),

    -- ── Temporary Works ──────────────────────────────────────────────────
    ('SC-TEMPWK-SCAF',   'BI-COGS'),
    ('SC-TEMPWK-SITE',   'BI-COGS'),

    -- ── Process Energy ───────────────────────────────────────────────────
    ('SC-PROCNRG-STEAM', 'BI-COGS'),
    ('SC-PROCNRG-COMP',  'BI-COGS');


    -- STAGE C: Validate coverage — every Layer B selectable leaf must be in tmp_link.
    SELECT count(*) INTO v_actual_link_count FROM tmp_link;

    SELECT count(*) INTO v_expected_link_count
    FROM master.spend_category
    WHERE tenant_id = v_tid
      AND parent_id IS NOT NULL
      AND NOT COALESCE((metadata->'_seed'->>'container')::boolean, false)
      AND metadata->'_seed'->>'pack' = '020_base_direct_ops';

    IF v_actual_link_count <> v_expected_link_count THEN
        RAISE EXCEPTION '[022_base_direct_ops] Linkage map coverage mismatch: expected % selectable direct-ops categories, got % mappings',
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
         AND sc.metadata->'_seed'->>'pack' = '020_base_direct_ops'
        WHERE sc.id IS NULL
    ) THEN
        RAISE EXCEPTION '[022_base_direct_ops] Linkage map references unknown or non-selectable direct-ops categories: %',
            (SELECT string_agg(lnk.sc_code, ', ' ORDER BY lnk.sc_code)
             FROM tmp_link lnk
             LEFT JOIN master.spend_category sc
               ON sc.tenant_id = v_tid
              AND sc.code = lnk.sc_code
              AND sc.parent_id IS NOT NULL
              AND NOT COALESCE((sc.metadata->'_seed'->>'container')::boolean, false)
              AND sc.metadata->'_seed'->>'pack' = '020_base_direct_ops'
             WHERE sc.id IS NULL);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM master.spend_category sc
        LEFT JOIN tmp_link lnk ON lnk.sc_code = sc.code
        WHERE sc.tenant_id = v_tid
          AND sc.parent_id IS NOT NULL
          AND NOT COALESCE((sc.metadata->'_seed'->>'container')::boolean, false)
          AND sc.metadata->'_seed'->>'pack' = '020_base_direct_ops'
          AND lnk.sc_code IS NULL
    ) THEN
        RAISE EXCEPTION '[022_base_direct_ops] Selectable direct-ops categories missing from linkage map: %',
            (SELECT string_agg(sc.code, ', ' ORDER BY sc.code)
             FROM master.spend_category sc
             LEFT JOIN tmp_link lnk ON lnk.sc_code = sc.code
             WHERE sc.tenant_id = v_tid
               AND sc.parent_id IS NOT NULL
               AND NOT COALESCE((sc.metadata->'_seed'->>'container')::boolean, false)
               AND sc.metadata->'_seed'->>'pack' = '020_base_direct_ops'
               AND lnk.sc_code IS NULL);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM tmp_link lnk
        LEFT JOIN master.business_intent bi
          ON bi.tenant_id = v_tid AND bi.code = lnk.bi_code
        WHERE bi.id IS NULL
    ) THEN
        RAISE EXCEPTION '[022_base_direct_ops] Linkage map references unknown business intents: %',
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

    -- ── STAGE E: HARD FAIL — direct-ops selectable nodes without intent ──
    SELECT count(*) INTO v_orphan_count
    FROM master.spend_category
    WHERE tenant_id = v_tid
      AND status = 'active'
      AND default_intent_id IS NULL
      AND NOT COALESCE((metadata->'_seed'->>'container')::boolean, false)
      AND metadata->'_seed'->>'pack' = '020_base_direct_ops';

    IF v_orphan_count > 0 THEN
        RAISE EXCEPTION '[022_base_direct_ops] HARD FAIL — % direct-ops categories without default_intent_id: %',
            v_orphan_count,
            (SELECT string_agg(code, ', ' ORDER BY code)
             FROM master.spend_category
             WHERE tenant_id = v_tid
               AND status = 'active'
               AND default_intent_id IS NULL
               AND NOT COALESCE((metadata->'_seed'->>'container')::boolean, false)
               AND metadata->'_seed'->>'pack' = '020_base_direct_ops');
    END IF;

    -- ── STAGE F: Count assertions ────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid
          AND default_intent_id IS NOT NULL
          AND metadata->'_intent_seed'->>'pack' = v_pack) <> v_actual_link_count THEN
        RAISE EXCEPTION '[022_base_direct_ops] Linked nodes count mismatch: expected %, got %',
            v_actual_link_count,
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid
               AND default_intent_id IS NOT NULL
               AND metadata->'_intent_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[022_base_direct_ops] Direct-ops spend-intent linkage complete: % categories linked, 0 orphans',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid
           AND default_intent_id IS NOT NULL
           AND metadata->'_intent_seed'->>'pack' = v_pack);

END $seed$;
