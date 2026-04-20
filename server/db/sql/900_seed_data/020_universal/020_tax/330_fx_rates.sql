-- ============================================================================
-- 330_fx_rates.sql — FX rates: 13 currencies → MYR (group reporting)
-- ============================================================================
-- Tables: master.fx_rate
-- Scope: Selected key month-end PERIOD_END rates (not full monthly series)
--        FY2025: quarterly closing (Jan, Mar, Jun, Sep, Dec)
--        FY2026: Q1 closing (Jan, Feb, Mar)
--        SPOT rates for current date only
-- All rates: 1 unit of foreign currency = X MYR (approximate demo values)
-- Idempotency: delete-owned-then-reinsert (metadata._seed.pack = '330_org')
-- Depends: master.tenant, shared.currency
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "330_org", "version": "2.0.0"}}'::jsonb;
    v_inserted int;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- PREREQUISITE: Verify all 13 source currencies + MYR exist
    -- ══════════════════════════════════════════════════════════════════════
    IF EXISTS (
        SELECT v.code FROM (VALUES
            ('USD'),('QAR'),('SAR'),('AED'),('SGD'),('INR'),('CAD'),
            ('EUR'),('TWD'),('ZAR'),('GBP'),('JPY'),('PHP')
        ) AS v(code)
        WHERE NOT EXISTS (SELECT 1 FROM shared.currency c WHERE c.code = v.code)
    ) THEN RAISE EXCEPTION '330 FAIL: missing currency in shared.currency: %',
        (SELECT string_agg(v.code, ', ') FROM (VALUES
            ('USD'),('QAR'),('SAR'),('AED'),('SGD'),('INR'),('CAD'),
            ('EUR'),('TWD'),('ZAR'),('GBP'),('JPY'),('PHP')
        ) AS v(code)
        WHERE NOT EXISTS (SELECT 1 FROM shared.currency c WHERE c.code = v.code));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM shared.currency WHERE code = 'MYR')
    THEN RAISE EXCEPTION '330 FAIL: MYR not in shared.currency'; END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- SEED UPDATE STRATEGY: delete-owned-then-reinsert
    -- fx_rate has no natural unique constraint beyond PK, so ON CONFLICT
    -- would create duplicates on rerun. Delete seed-owned rows first.
    -- ══════════════════════════════════════════════════════════════════════
    DELETE FROM master.fx_rate
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = '330_org';

    -- ══════════════════════════════════════════════════════════════════════
    -- RATES: 1 unit of foreign currency = X MYR (approximate mid-market)
    -- ══════════════════════════════════════════════════════════════════════
    CREATE TEMP TABLE tmp_fx (
        from_curr character(3) NOT NULL,
        rate      numeric(18,10) NOT NULL,
        eff_date  date NOT NULL,
        rate_type text NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_fx VALUES
    -- ─── 2025 PERIOD_END — quarterly key dates ──────────────────────────
    -- USD → MYR
    ('USD', 4.4700, '2025-01-31', 'PERIOD_END'), ('USD', 4.4500, '2025-03-31', 'PERIOD_END'),
    ('USD', 4.4300, '2025-06-30', 'PERIOD_END'), ('USD', 4.4100, '2025-09-30', 'PERIOD_END'),
    ('USD', 4.4000, '2025-12-31', 'PERIOD_END'),
    -- QAR → MYR
    ('QAR', 1.2280, '2025-01-31', 'PERIOD_END'), ('QAR', 1.2230, '2025-03-31', 'PERIOD_END'),
    ('QAR', 1.2175, '2025-06-30', 'PERIOD_END'), ('QAR', 1.2120, '2025-09-30', 'PERIOD_END'),
    ('QAR', 1.2088, '2025-12-31', 'PERIOD_END'),
    -- SAR → MYR
    ('SAR', 1.1920, '2025-01-31', 'PERIOD_END'), ('SAR', 1.1870, '2025-03-31', 'PERIOD_END'),
    ('SAR', 1.1815, '2025-06-30', 'PERIOD_END'), ('SAR', 1.1760, '2025-09-30', 'PERIOD_END'),
    ('SAR', 1.1733, '2025-12-31', 'PERIOD_END'),
    -- AED → MYR
    ('AED', 1.2170, '2025-01-31', 'PERIOD_END'), ('AED', 1.2120, '2025-03-31', 'PERIOD_END'),
    ('AED', 1.2065, '2025-06-30', 'PERIOD_END'), ('AED', 1.2010, '2025-09-30', 'PERIOD_END'),
    ('AED', 1.1981, '2025-12-31', 'PERIOD_END'),
    -- SGD → MYR
    ('SGD', 3.3200, '2025-01-31', 'PERIOD_END'), ('SGD', 3.3100, '2025-03-31', 'PERIOD_END'),
    ('SGD', 3.3000, '2025-06-30', 'PERIOD_END'), ('SGD', 3.2900, '2025-09-30', 'PERIOD_END'),
    ('SGD', 3.2800, '2025-12-31', 'PERIOD_END'),
    -- INR → MYR
    ('INR', 0.0530, '2025-01-31', 'PERIOD_END'), ('INR', 0.0528, '2025-03-31', 'PERIOD_END'),
    ('INR', 0.0526, '2025-06-30', 'PERIOD_END'), ('INR', 0.0524, '2025-09-30', 'PERIOD_END'),
    ('INR', 0.0522, '2025-12-31', 'PERIOD_END'),
    -- CAD → MYR
    ('CAD', 3.2500, '2025-01-31', 'PERIOD_END'), ('CAD', 3.2400, '2025-03-31', 'PERIOD_END'),
    ('CAD', 3.2300, '2025-06-30', 'PERIOD_END'), ('CAD', 3.2200, '2025-09-30', 'PERIOD_END'),
    ('CAD', 3.2100, '2025-12-31', 'PERIOD_END'),
    -- EUR → MYR
    ('EUR', 4.8500, '2025-01-31', 'PERIOD_END'), ('EUR', 4.8300, '2025-03-31', 'PERIOD_END'),
    ('EUR', 4.8100, '2025-06-30', 'PERIOD_END'), ('EUR', 4.7900, '2025-09-30', 'PERIOD_END'),
    ('EUR', 4.7700, '2025-12-31', 'PERIOD_END'),
    -- TWD → MYR
    ('TWD', 0.1380, '2025-01-31', 'PERIOD_END'), ('TWD', 0.1375, '2025-03-31', 'PERIOD_END'),
    ('TWD', 0.1370, '2025-06-30', 'PERIOD_END'), ('TWD', 0.1365, '2025-09-30', 'PERIOD_END'),
    ('TWD', 0.1360, '2025-12-31', 'PERIOD_END'),
    -- ZAR → MYR
    ('ZAR', 0.2450, '2025-01-31', 'PERIOD_END'), ('ZAR', 0.2440, '2025-03-31', 'PERIOD_END'),
    ('ZAR', 0.2430, '2025-06-30', 'PERIOD_END'), ('ZAR', 0.2420, '2025-09-30', 'PERIOD_END'),
    ('ZAR', 0.2410, '2025-12-31', 'PERIOD_END'),
    -- GBP → MYR
    ('GBP', 5.6200, '2025-01-31', 'PERIOD_END'), ('GBP', 5.6000, '2025-03-31', 'PERIOD_END'),
    ('GBP', 5.5800, '2025-06-30', 'PERIOD_END'), ('GBP', 5.5600, '2025-09-30', 'PERIOD_END'),
    ('GBP', 5.5400, '2025-12-31', 'PERIOD_END'),
    -- JPY → MYR (per 1 JPY)
    ('JPY', 0.0298, '2025-01-31', 'PERIOD_END'), ('JPY', 0.0296, '2025-03-31', 'PERIOD_END'),
    ('JPY', 0.0294, '2025-06-30', 'PERIOD_END'), ('JPY', 0.0292, '2025-09-30', 'PERIOD_END'),
    ('JPY', 0.0290, '2025-12-31', 'PERIOD_END'),
    -- PHP → MYR
    ('PHP', 0.0780, '2025-01-31', 'PERIOD_END'), ('PHP', 0.0778, '2025-03-31', 'PERIOD_END'),
    ('PHP', 0.0776, '2025-06-30', 'PERIOD_END'), ('PHP', 0.0774, '2025-09-30', 'PERIOD_END'),
    ('PHP', 0.0772, '2025-12-31', 'PERIOD_END'),

    -- ─── 2026 Q1 PERIOD_END ─────────────────────────────────────────────
    ('USD', 4.3800, '2026-01-31', 'PERIOD_END'), ('USD', 4.3600, '2026-02-28', 'PERIOD_END'),
    ('USD', 4.3500, '2026-03-31', 'PERIOD_END'),
    ('QAR', 1.2030, '2026-03-31', 'PERIOD_END'), ('SAR', 1.1600, '2026-03-31', 'PERIOD_END'),
    ('AED', 1.1850, '2026-03-31', 'PERIOD_END'), ('SGD', 3.2600, '2026-03-31', 'PERIOD_END'),
    ('INR', 0.0520, '2026-03-31', 'PERIOD_END'), ('CAD', 3.2000, '2026-03-31', 'PERIOD_END'),
    ('EUR', 4.7500, '2026-03-31', 'PERIOD_END'), ('TWD', 0.1355, '2026-03-31', 'PERIOD_END'),
    ('ZAR', 0.2400, '2026-03-31', 'PERIOD_END'), ('GBP', 5.5200, '2026-03-31', 'PERIOD_END'),
    ('JPY', 0.0288, '2026-03-31', 'PERIOD_END'), ('PHP', 0.0770, '2026-03-31', 'PERIOD_END'),

    -- ─── SPOT — current transaction rate (today) ────────────────────────
    ('USD', 4.3500, '2026-03-31', 'SPOT'), ('QAR', 1.2030, '2026-03-31', 'SPOT'),
    ('SAR', 1.1600, '2026-03-31', 'SPOT'), ('AED', 1.1850, '2026-03-31', 'SPOT'),
    ('SGD', 3.2600, '2026-03-31', 'SPOT'), ('INR', 0.0520, '2026-03-31', 'SPOT'),
    ('CAD', 3.2000, '2026-03-31', 'SPOT'), ('EUR', 4.7500, '2026-03-31', 'SPOT'),
    ('TWD', 0.1355, '2026-03-31', 'SPOT'), ('ZAR', 0.2400, '2026-03-31', 'SPOT'),
    ('GBP', 5.5200, '2026-03-31', 'SPOT'), ('JPY', 0.0288, '2026-03-31', 'SPOT'),
    ('PHP', 0.0770, '2026-03-31', 'SPOT');

    -- ══════════════════════════════════════════════════════════════════════
    -- INSERT (clean — no conflict possible after delete-owned)
    -- ══════════════════════════════════════════════════════════════════════
    WITH ins AS (
        INSERT INTO master.fx_rate
            (tenant_id, from_currency, to_currency, rate, rate_type,
             effective_date, source, status, created_by, metadata)
        SELECT
            v_tid, f.from_curr, 'MYR', f.rate, f.rate_type,
            f.eff_date, 'CUSTOM', 'active', v_su, v_meta
        FROM tmp_fx f
        RETURNING id
    )
    SELECT count(*) INTO v_inserted FROM ins;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: All 13 currency pairs present
    IF (SELECT count(DISTINCT from_currency) FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org') != 13
    THEN RAISE EXCEPTION '330 FAIL: expected 13 source currencies, got %',
        (SELECT count(DISTINCT from_currency) FROM master.fx_rate
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org');
    END IF;

    -- A2: No from = to currency rows
    IF EXISTS (
        SELECT id FROM master.fx_rate
        WHERE tenant_id = v_tid AND from_currency = to_currency
          AND metadata->'_seed'->>'pack' = '330_org'
    ) THEN RAISE EXCEPTION '330 FAIL: fx_rate row with from = to currency'; END IF;

    -- A3: No duplicate natural keys within seed
    IF EXISTS (
        SELECT from_currency, to_currency, rate_type, effective_date, count(*)
        FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
        GROUP BY from_currency, to_currency, rate_type, effective_date
        HAVING count(*) > 1
    ) THEN RAISE EXCEPTION '330 FAIL: duplicate FX rate natural key in seed'; END IF;

    -- A4: Exact row count (93 = 80 PERIOD_END + 13 SPOT)
    IF v_inserted != 93
    THEN RAISE EXCEPTION '330 FAIL: expected exactly 93 FX rates, inserted %', v_inserted; END IF;

    -- A5: Sub-counts by rate_type
    IF (SELECT count(*) FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
          AND rate_type = 'PERIOD_END') != 80
    THEN RAISE EXCEPTION '330 FAIL: expected 80 PERIOD_END rates'; END IF;

    IF (SELECT count(*) FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
          AND rate_type = 'SPOT') != 13
    THEN RAISE EXCEPTION '330 FAIL: expected 13 SPOT rates'; END IF;

    RAISE NOTICE '330: % FX rates (% PERIOD_END, % SPOT) across 13 currencies → MYR',
        v_inserted,
        (SELECT count(*) FROM master.fx_rate
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
           AND rate_type = 'PERIOD_END'),
        (SELECT count(*) FROM master.fx_rate
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
           AND rate_type = 'SPOT');
END $seed$;
