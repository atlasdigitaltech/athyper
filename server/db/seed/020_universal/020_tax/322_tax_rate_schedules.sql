-- ============================================================================
-- 322_tax_rate_schedules.sql — Tax rate schedules (effective-dated)
-- ============================================================================
-- Tables: control.tax_rate_schedule
-- Fix 1: Proper UPSERT (delete-owned-then-reinsert) — seed corrections land
-- Fix 2: Both SALE and PURCHASE schedules for recoverable indirect taxes
-- Fix 3: Strong assertions
-- ============================================================================
-- CRITICAL DDL NOTE:
-- DDL CHECK constraint trs_direction_chk allows:
--   'PURCHASE','SALE','PAYMENT','IMPORT','EXPORT','BOTH'
-- The source spec used OUTPUT/INPUT — corrected here to SALE/PURCHASE.
-- SALE  = output direction (charged to customers)
-- PURCHASE = input direction (recoverable from suppliers)
-- ============================================================================
-- Depends: 320 (jurisdictions), 321 (tax_types)
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "322_org", "version": "2.1.1"}}'::jsonb;
    v_inserted int;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    CREATE TEMP TABLE tmp_tj ON COMMIT DROP AS SELECT code, id FROM master.tax_jurisdiction WHERE tenant_id = v_tid;
    CREATE TEMP TABLE tmp_tt ON COMMIT DROP AS SELECT code, id FROM master.tax_type WHERE tenant_id = v_tid;

    -- ══════════════════════════════════════════════════════════════════════
    -- Rate seed table: one row per (jurisdiction, type, direction, component)
    -- For recoverable indirect taxes: SALE + PURCHASE pairs are both required
    -- ══════════════════════════════════════════════════════════════════════
    CREATE TEMP TABLE tmp_rates (
        tj_code      text NOT NULL,
        tt_code      text NOT NULL,
        direction    text NOT NULL,       -- SALE or PURCHASE (DDL-valid values)
        component    text,
        rate         numeric(18,6) NOT NULL,
        recover_mode text NOT NULL DEFAULT 'NONE',
        recover_pct  numeric(5,2),
        reverse_mode text NOT NULL DEFAULT 'NONE',
        priority     smallint NOT NULL DEFAULT 10
    ) ON COMMIT DROP;

    INSERT INTO tmp_rates VALUES
    -- ─── MALAYSIA (SST — not recoverable, sale only) ────────────────────
    ('TJ-MY', 'MY-SST-SALES', 'SALE',     NULL,        10.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-MY', 'MY-SST-SVC',   'SALE',     NULL,         6.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-MY', 'MY-WHT',       'SALE',     'standard',  10.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-MY', 'MY-WHT',       'SALE',     'royalty',   10.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-MY', 'MY-WHT',       'SALE',     'interest',  15.00, 'NONE', NULL, 'NONE', 12),

    -- ─── QATAR ──────────────────────────────────────────────────────────
    ('TJ-QA', 'QA-WHT',       'SALE',     'standard',   5.00, 'NONE', NULL, 'NONE', 10),

    -- ─── SAUDI ARABIA (VAT recoverable — SALE + PURCHASE pair) ──────────
    ('TJ-SA', 'SA-VAT',       'SALE',     NULL,         15.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-SA', 'SA-VAT',       'PURCHASE', NULL,         15.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-SA', 'SA-VAT',       'SALE',     'zero',        0.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-SA', 'SA-WHT',       'SALE',     'standard',    5.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-SA', 'SA-WHT',       'SALE',     'management', 20.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-SA', 'SA-ZAKAT',     'SALE',     NULL,          2.50, 'NONE', NULL, 'NONE', 10),

    -- ─── UAE (VAT recoverable) ──────────────────────────────────────────
    ('TJ-AE', 'AE-VAT',       'SALE',     NULL,          5.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-AE', 'AE-VAT',       'PURCHASE', NULL,          5.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-AE', 'AE-VAT',       'SALE',     'zero',        0.00, 'NONE', NULL, 'NONE', 11),

    -- ─── UNITED STATES (sales tax — not recoverable) ────────────────────
    ('TJ-US-CA','US-SALES',    'SALE',     NULL,          7.25, 'NONE', NULL, 'NONE', 10),
    ('TJ-US',   'US-WHT',     'SALE',     'standard',   30.00, 'NONE', NULL, 'NONE', 10),

    -- ─── SINGAPORE (GST recoverable) ────────────────────────────────────
    ('TJ-SG', 'SG-GST',       'SALE',     NULL,          9.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-SG', 'SG-GST',       'PURCHASE', NULL,          9.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-SG', 'SG-GST',       'SALE',     'zero',        0.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-SG', 'SG-WHT',       'SALE',     'standard',   15.00, 'NONE', NULL, 'NONE', 10),

    -- ─── INDIA (GST recoverable — CGST/SGST/IGST all with PURCHASE) ────
    -- Standard 18% (CGST 9% + SGST 9% intra-state, or IGST 18% inter-state)
    ('TJ-IN',    'IN-CGST',   'SALE',     'std-18',      9.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN',    'IN-CGST',   'PURCHASE', 'std-18',      9.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-IN-TN', 'IN-SGST',  'SALE',     'std-18',      9.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN-TN', 'IN-SGST',  'PURCHASE', 'std-18',      9.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-IN-MH', 'IN-SGST',  'SALE',     'std-18',      9.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN-MH', 'IN-SGST',  'PURCHASE', 'std-18',      9.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-IN',    'IN-IGST',   'SALE',     'std-18',     18.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN',    'IN-IGST',   'PURCHASE', 'std-18',     18.00, 'FULL', NULL, 'NONE', 10),
    -- Reduced 5% (CGST 2.5% + SGST 2.5%)
    ('TJ-IN',    'IN-CGST',   'SALE',     'red-5',       2.50, 'NONE', NULL, 'NONE', 11),
    ('TJ-IN',    'IN-CGST',   'PURCHASE', 'red-5',       2.50, 'FULL', NULL, 'NONE', 11),
    ('TJ-IN-TN', 'IN-SGST',  'SALE',     'red-5',       2.50, 'NONE', NULL, 'NONE', 11),
    ('TJ-IN-TN', 'IN-SGST',  'PURCHASE', 'red-5',       2.50, 'FULL', NULL, 'NONE', 11),
    ('TJ-IN-MH', 'IN-SGST',  'SALE',     'red-5',       2.50, 'NONE', NULL, 'NONE', 11),
    ('TJ-IN-MH', 'IN-SGST',  'PURCHASE', 'red-5',       2.50, 'FULL', NULL, 'NONE', 11),
    -- TDS (Tax Deducted at Source — payer deducts before remitting to payee)
    ('TJ-IN',    'IN-TDS',    'SALE',     'standard',   10.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN',    'IN-TDS',    'SALE',     'rent',       10.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-IN',    'IN-TDS',    'SALE',     'professional',10.00,'NONE', NULL, 'NONE', 12),
    ('TJ-IN',    'IN-TDS',    'SALE',     'contractor',  1.00, 'NONE', NULL, 'NONE', 13),
    -- TCS (Tax Collected at Source — seller collects from buyer at point of sale)
    -- Sec 206C(1H): sale of goods above ₹50L threshold → 0.1%
    -- Sec 206C(1):  scrap sales → 1% (standard listed rate)
    ('TJ-IN',    'IN-TCS',    'SALE',     'goods',       0.10, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN',    'IN-TCS',    'SALE',     'scrap',       1.00, 'NONE', NULL, 'NONE', 11),

    -- ─── CANADA (GST + HST recoverable) ────────────────────────────────
    ('TJ-CA', 'CA-GST',       'SALE',     NULL,          5.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-CA', 'CA-GST',       'PURCHASE', NULL,          5.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-CA', 'CA-HST',       'SALE',     'standard',   13.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-CA', 'CA-HST',       'PURCHASE', 'standard',   13.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-CA', 'CA-WHT',       'SALE',     'standard',   25.00, 'NONE', NULL, 'NONE', 10),

    -- ─── GERMANY (USt recoverable) ──────────────────────────────────────
    ('TJ-DE', 'DE-UST',       'SALE',     'standard',   19.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-DE', 'DE-UST',       'PURCHASE', 'standard',   19.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-DE', 'DE-UST',       'SALE',     'reduced',     7.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-DE', 'DE-UST',       'PURCHASE', 'reduced',     7.00, 'FULL', NULL, 'NONE', 11),
    ('TJ-DE', 'DE-WHT',       'SALE',     'standard',   25.00, 'NONE', NULL, 'NONE', 10),

    -- ─── TAIWAN (VAT recoverable) ───────────────────────────────────────
    ('TJ-TW', 'TW-VAT',       'SALE',     NULL,          5.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-TW', 'TW-VAT',       'PURCHASE', NULL,          5.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-TW', 'TW-WHT',       'SALE',     'standard',   20.00, 'NONE', NULL, 'NONE', 10),

    -- ─── SOUTH AFRICA (VAT recoverable) ─────────────────────────────────
    ('TJ-ZA', 'ZA-VAT',       'SALE',     NULL,         15.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-ZA', 'ZA-VAT',       'PURCHASE', NULL,         15.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-ZA', 'ZA-VAT',       'SALE',     'zero',        0.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-ZA', 'ZA-WHT',       'SALE',     'dividends',  20.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-ZA', 'ZA-WHT',       'SALE',     'interest',   15.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-ZA', 'ZA-MINING-ROY','SALE',     'crude',       5.00, 'NONE', NULL, 'NONE', 10),

    -- ─── UNITED KINGDOM (VAT recoverable) ───────────────────────────────
    ('TJ-GB', 'GB-VAT',       'SALE',     'standard',   20.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-GB', 'GB-VAT',       'PURCHASE', 'standard',   20.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-GB', 'GB-VAT',       'SALE',     'reduced',     5.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-GB', 'GB-VAT',       'PURCHASE', 'reduced',     5.00, 'FULL', NULL, 'NONE', 11),
    ('TJ-GB', 'GB-VAT',       'SALE',     'zero',        0.00, 'NONE', NULL, 'NONE', 12),
    ('TJ-GB', 'GB-WHT',       'SALE',     'standard',   20.00, 'NONE', NULL, 'NONE', 10),

    -- ─── JAPAN (consumption recoverable) ─────────────────────────────────
    ('TJ-JP', 'JP-CT',        'SALE',     'standard',   10.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-JP', 'JP-CT',        'PURCHASE', 'standard',   10.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-JP', 'JP-CT',        'SALE',     'reduced',     8.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-JP', 'JP-CT',        'PURCHASE', 'reduced',     8.00, 'FULL', NULL, 'NONE', 11),
    ('TJ-JP', 'JP-WHT',       'SALE',     'standard',   20.42, 'NONE', NULL, 'NONE', 10),

    -- ─── PHILIPPINES (VAT recoverable) ──────────────────────────────────
    ('TJ-PH', 'PH-VAT',       'SALE',     NULL,         12.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-PH', 'PH-VAT',       'PURCHASE', NULL,         12.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-PH', 'PH-EWT',       'SALE',     'goods',       1.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-PH', 'PH-EWT',       'SALE',     'services',    2.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-PH', 'PH-EWT',       'SALE',     'professional',10.00,'NONE', NULL, 'NONE', 12),
    ('TJ-PH', 'PH-FWT',       'SALE',     'interest',   20.00, 'NONE', NULL, 'NONE', 10);

    -- Guard against silent skips from the inner joins below. Non-recoverable
    -- rates such as US sales tax must be validated too, not just VAT/GST pairs.
    IF EXISTS (
        SELECT 1
        FROM tmp_rates r
        LEFT JOIN tmp_tj tj ON tj.code = r.tj_code
        LEFT JOIN tmp_tt tt ON tt.code = r.tt_code
        WHERE tj.id IS NULL OR tt.id IS NULL
    ) THEN RAISE EXCEPTION '322 FAIL: rate seed missing jurisdiction/type lookup: %',
        (SELECT string_agg(
                    r.tj_code || '|' || r.tt_code ||
                    CASE
                        WHEN tj.id IS NULL AND tt.id IS NULL THEN ' (missing jurisdiction and type)'
                        WHEN tj.id IS NULL THEN ' (missing jurisdiction)'
                        ELSE ' (missing type)'
                    END,
                    ', ' ORDER BY r.tj_code, r.tt_code, r.direction, COALESCE(r.component, '')
                )
         FROM tmp_rates r
         LEFT JOIN tmp_tj tj ON tj.code = r.tj_code
         LEFT JOIN tmp_tt tt ON tt.code = r.tt_code
         WHERE tj.id IS NULL OR tt.id IS NULL);
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- SEED UPDATE STRATEGY: delete-owned-then-reinsert
    -- Prune dependents first (no ON DELETE CASCADE on these FKs):
    --   ledger.tax_calculation      → control.tax_rate_schedule
    --   control.tax_group_component → control.tax_rate_schedule
    -- ══════════════════════════════════════════════════════════════════════
    DELETE FROM ledger.tax_calculation
    WHERE tenant_id = v_tid
      AND tax_rate_schedule_id IN (
          SELECT id FROM control.tax_rate_schedule
          WHERE tenant_id = v_tid
            AND metadata->'_seed'->>'pack' = '322_org');

    DELETE FROM control.tax_group_component
    WHERE tenant_id = v_tid
      AND tax_rate_schedule_id IN (
          SELECT id FROM control.tax_rate_schedule
          WHERE tenant_id = v_tid
            AND metadata->'_seed'->>'pack' = '322_org');

    DELETE FROM control.tax_rate_schedule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = '322_org';

    WITH ins AS (
        INSERT INTO control.tax_rate_schedule
            (tenant_id, jurisdiction_id, tax_type_id,
             tax_direction, component_code,
             rate_kind, rate_value,
             recoverability_mode, recoverability_percent,
             reverse_charge_mode, calculation_basis,
             effective_from, priority,
             status, created_by, metadata)
        SELECT
            v_tid, tj.id, tt.id,
            r.direction, r.component,
            'PERCENT', r.rate,
            r.recover_mode, r.recover_pct,
            r.reverse_mode, 'LINE_NET',
            '2025-01-01'::date, r.priority,
            'active', v_su, v_meta
        FROM tmp_rates r
        JOIN tmp_tj tj ON tj.code = r.tj_code
        JOIN tmp_tt tt ON tt.code = r.tt_code
        RETURNING id
    )
    SELECT count(*) INTO v_inserted FROM ins;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Minimum rate count (70 base + 2 IN-TCS = 72)
    IF (SELECT count(*) FROM control.tax_rate_schedule WHERE tenant_id = v_tid) < 72
    THEN RAISE EXCEPTION '322 FAIL: expected ≥72 rate schedules, got %',
        (SELECT count(*) FROM control.tax_rate_schedule WHERE tenant_id = v_tid);
    END IF;

    -- A2: Every seed-managed recoverable type has at least 1 SALE schedule.
    -- Scoped to 321_org types to exclude stale rows from prior seed versions.
    IF EXISTS (
        SELECT tt.code FROM master.tax_type tt
        WHERE tt.tenant_id = v_tid AND tt.is_recoverable = true
          AND tt.metadata->'_seed'->>'pack' = '321_org'
          AND NOT EXISTS (
              SELECT 1 FROM control.tax_rate_schedule trs
              WHERE trs.tenant_id = v_tid AND trs.tax_type_id = tt.id
                AND trs.tax_direction = 'SALE')
    ) THEN RAISE EXCEPTION '322 FAIL: recoverable tax type with no SALE schedule: %',
        (SELECT string_agg(tt.code, ', ') FROM master.tax_type tt
         WHERE tt.tenant_id = v_tid AND tt.is_recoverable = true
           AND tt.metadata->'_seed'->>'pack' = '321_org'
           AND NOT EXISTS (
               SELECT 1 FROM control.tax_rate_schedule trs
               WHERE trs.tenant_id = v_tid AND trs.tax_type_id = tt.id
                 AND trs.tax_direction = 'SALE'));
    END IF;

    -- A3: Every seed-managed recoverable type has at least 1 PURCHASE schedule.
    IF EXISTS (
        SELECT tt.code FROM master.tax_type tt
        WHERE tt.tenant_id = v_tid AND tt.is_recoverable = true
          AND tt.metadata->'_seed'->>'pack' = '321_org'
          AND NOT EXISTS (
              SELECT 1 FROM control.tax_rate_schedule trs
              WHERE trs.tenant_id = v_tid AND trs.tax_type_id = tt.id
                AND trs.tax_direction = 'PURCHASE')
    ) THEN RAISE EXCEPTION '322 FAIL: recoverable tax type with no PURCHASE schedule: %',
        (SELECT string_agg(tt.code, ', ') FROM master.tax_type tt
         WHERE tt.tenant_id = v_tid AND tt.is_recoverable = true
           AND tt.metadata->'_seed'->>'pack' = '321_org'
           AND NOT EXISTS (
               SELECT 1 FROM control.tax_rate_schedule trs
               WHERE trs.tenant_id = v_tid AND trs.tax_type_id = tt.id
                 AND trs.tax_direction = 'PURCHASE'));
    END IF;

    -- A4: No schedule references a missing jurisdiction or tax type
    IF EXISTS (
        SELECT trs.id FROM control.tax_rate_schedule trs
        WHERE trs.tenant_id = v_tid
          AND NOT EXISTS (SELECT 1 FROM master.tax_jurisdiction tj WHERE tj.id = trs.jurisdiction_id)
    ) THEN RAISE EXCEPTION '322 FAIL: schedule references missing jurisdiction'; END IF;

    IF EXISTS (
        SELECT trs.id FROM control.tax_rate_schedule trs
        WHERE trs.tenant_id = v_tid
          AND NOT EXISTS (SELECT 1 FROM master.tax_type tt WHERE tt.id = trs.tax_type_id AND tt.tenant_id = trs.tenant_id)
    ) THEN RAISE EXCEPTION '322 FAIL: schedule references missing tax type'; END IF;

    -- A5: Every declared seed rate exists as an active 322_org schedule.
    IF EXISTS (
        SELECT 1
        FROM tmp_rates r
        JOIN tmp_tj tj ON tj.code = r.tj_code
        JOIN tmp_tt tt ON tt.code = r.tt_code
        WHERE NOT EXISTS (
            SELECT 1
            FROM control.tax_rate_schedule trs
            WHERE trs.tenant_id = v_tid
              AND trs.jurisdiction_id = tj.id
              AND trs.tax_type_id = tt.id
              AND trs.tax_direction = r.direction
              AND COALESCE(trs.component_code, '') = COALESCE(r.component, '')
              AND trs.is_active = true
              AND trs.metadata->'_seed'->>'pack' = '322_org')
    ) THEN RAISE EXCEPTION '322 FAIL: declared rate has no active schedule: %',
        (SELECT string_agg(r.tj_code || '|' || r.tt_code || '|' || r.direction || '|' || COALESCE(r.component, ''),
                           ', ' ORDER BY r.tj_code, r.tt_code, r.direction, COALESCE(r.component, ''))
         FROM tmp_rates r
         JOIN tmp_tj tj ON tj.code = r.tj_code
         JOIN tmp_tt tt ON tt.code = r.tt_code
         WHERE NOT EXISTS (
             SELECT 1
             FROM control.tax_rate_schedule trs
             WHERE trs.tenant_id = v_tid
               AND trs.jurisdiction_id = tj.id
               AND trs.tax_type_id = tt.id
               AND trs.tax_direction = r.direction
               AND COALESCE(trs.component_code, '') = COALESCE(r.component, '')
               AND trs.is_active = true
               AND trs.metadata->'_seed'->>'pack' = '322_org'));
    END IF;

    RAISE NOTICE '322: % rate schedules (% SALE, % PURCHASE)',
        (SELECT count(*) FROM control.tax_rate_schedule WHERE tenant_id = v_tid),
        (SELECT count(*) FROM control.tax_rate_schedule WHERE tenant_id = v_tid AND tax_direction = 'SALE'),
        (SELECT count(*) FROM control.tax_rate_schedule WHERE tenant_id = v_tid AND tax_direction = 'PURCHASE');
END $seed$;
