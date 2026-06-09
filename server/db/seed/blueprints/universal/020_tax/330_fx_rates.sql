-- ============================================================================
-- 330_fx_rates.sql — FX rates: ALL active currencies → MYR (group reporting)
-- ============================================================================
-- Tables  : master.fx_rate
-- Schema  : master | Depends: master.tenant, shared.currency
-- Pack    : 330_org  (metadata._seed.pack — used for delete-owned idempotency)
-- Version : 4.0.1    (FY2026 extended to Q1+Q2; SPOT anchor set to 2026-05-15)
--
-- ── Rationale ────────────────────────────────────────────────────────────────
-- Group reporting currency is MYR. Tenants can be onboarded with ANY base
-- currency from shared.currency. To guarantee that consolidation, FX
-- revaluation, and triangulation (master.get_fx_rate) work on day one — for
-- every tenant regardless of base currency — at least one PERIOD_END and one
-- SPOT rate to MYR must exist for every active ISO 4217 currency.
--
-- ── Scope ────────────────────────────────────────────────────────────────────
-- 1) FY2025 quarterly PERIOD_END history (Jan/Mar/Jun/Sep/Dec) for the
--    "core 13" currencies that drive the demo intercompany/consolidation
--    flows (USD, QAR, SAR, AED, SGD, INR, CAD, EUR, TWD, ZAR, GBP, JPY, PHP).
--    These are needed for FY2025 close-period revaluation demos.
--
-- 2) FY2026 Q1+Q2 PERIOD_END (Jan 31, Feb 28, Mar 31, Apr 30, May 31, Jun 30)
--    for ALL 150 active currencies. Every ISO 4217 currency in shared.currency
--    (excluding MYR itself, deprecated HRK/ZWL, and non-monetary codes
--    XAU/XAG/XPT/XPD/XDR) gets full H1-2026 PERIOD_END coverage so that
--    period-close revaluation works for any month through June 2026.
--
-- 3) SPOT rate (anchored at 2026-05-15) for all 150 currencies — for live
--    transaction posting (purchase invoices, sales invoices, payments) where
--    rate_type='SPOT' is the default. Rate = Mar 31 anchor × 0.99540
--    (reflecting continued MYR appreciation through May).
--
-- ── Coverage summary ─────────────────────────────────────────────────────────
--    FY2025 quarterly PERIOD_END :  5 dates × 13 ccy  =   65 rows
--    FY2026 Q1+Q2 PERIOD_END     :  6 dates × 150 ccy =  900 rows
--    SPOT (2026-05-15)           :  1 date  × 150 ccy =  150 rows
--    ──────────────────────────────────────────────  ───────
--    TOTAL                                             1115 rows
--
-- ── Currency exclusions (intentional) ────────────────────────────────────────
--    MYR                  — base/group currency (FK CHECK from <> to)
--    HRK                  — deprecated (Croatia adopted EUR 2023-01-01)
--    ZWL                  — deprecated (replaced by ZWG 2024-04-05)
--    XAU/XAG/XPT/XPD      — precious metals (priced per troy ounce, not FX)
--    XDR                  — IMF Special Drawing Rights (not transactional)
--
-- ── Rate convention ──────────────────────────────────────────────────────────
-- All rates are quoted as: 1 unit of foreign currency = X MYR.
-- The inverse_rate column is GENERATED ALWAYS, no need to insert it.
--
-- ── Q1+Q2 2026 rate progression (all currencies) ─────────────────────────────
-- A uniform MYR appreciation of ≈0.23%/month is applied (consistent story
-- across all 150 currencies):
--    Jan 31 = anchor × 1.00690   (≈ +0.69% — MYR weaker in Jan)
--    Feb 28 = anchor × 1.00230   (≈ +0.23%)
--    Mar 31 = anchor × 1.00000   (base anchor)
--    Apr 30 = anchor × 0.99770   (≈ −0.23%)
--    May 31 = anchor × 0.99540   (≈ −0.46%; also drives SPOT)
--    Jun 30 = anchor × 0.99310   (≈ −0.69%)
-- USD example: 4.3800 → 4.3600 → 4.3500 → 4.340 → 4.330 → 4.320
--
-- ── Idempotency ──────────────────────────────────────────────────────────────
-- master.fx_rate has no natural unique constraint accessible to ON CONFLICT
-- (the unique index is partial — WHERE is_active = true), so this seed uses
-- delete-owned-then-reinsert keyed on metadata._seed.pack = '330_org'.
-- ============================================================================

DO $seed$
DECLARE
    v_tid       uuid;
    v_su        uuid  := '00000000-0000-0000-0000-000000000000';
    v_meta      jsonb := '{"_seed": {"pack": "330_org", "version": "4.0.1"}}'::jsonb;
    v_inserted  int;
    v_active    int;
    v_missing   text;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- PREREQUISITE: MYR (target) must exist
    -- ══════════════════════════════════════════════════════════════════════════
    IF NOT EXISTS (SELECT 1 FROM shared.currency WHERE code = 'MYR') THEN
        RAISE EXCEPTION '330 FAIL: MYR not in shared.currency';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- SEED UPDATE STRATEGY: delete-owned-then-reinsert
    -- ══════════════════════════════════════════════════════════════════════════
    DELETE FROM master.fx_rate
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = '330_org';

    -- ══════════════════════════════════════════════════════════════════════════
    -- BASE RATE TABLE (Mar 31, 2026 anchor — drives Q1 PERIOD_END + SPOT)
    -- All rates: 1 unit foreign currency → X MYR (approximate mid-market).
    -- ══════════════════════════════════════════════════════════════════════════
    CREATE TEMP TABLE tmp_base (
        from_curr character(3) PRIMARY KEY,
        rate      numeric(18,10) NOT NULL CHECK (rate > 0)
    ) ON COMMIT DROP;

    INSERT INTO tmp_base (from_curr, rate) VALUES
    -- ── Major reserve currencies ─────────────────────────────────────────────
    ('USD', 4.3500000000), ('EUR', 4.7500000000), ('GBP', 5.5200000000),
    ('JPY', 0.0288000000), ('CNY', 0.6042000000), ('CHF', 5.0581000000),
    ('CAD', 3.2000000000), ('AUD', 2.8618000000), ('NZD', 2.6048000000),
    ('HKD', 0.5591000000), ('SGD', 3.2600000000),

    -- ── Middle East · Gulf · Levant ──────────────────────────────────────────
    ('AED', 1.1850000000), ('SAR', 1.1600000000), ('QAR', 1.2030000000),
    ('BHD', 11.5400000000), ('KWD', 14.1234000000), ('OMR', 11.3000000000),
    ('JOD', 6.1354000000), ('ILS', 1.1918000000), ('LBP', 0.0000486000),
    ('YER', 0.0174000000), ('IQD', 0.0033200000), ('IRR', 0.0001036000),
    ('SYP', 0.0003350000), ('EGP', 0.0888000000), ('TRY', 0.1338000000),

    -- ── Europe (non-EUR) ─────────────────────────────────────────────────────
    ('NOK', 0.4085000000), ('SEK', 0.4123000000), ('DKK', 0.6341000000),
    ('ISK', 0.0315000000), ('PLN', 1.0957000000), ('CZK', 0.1875000000),
    ('HUF', 0.0120800000), ('RON', 0.9498000000), ('BGN', 2.4167000000),
    ('RSD', 0.0404000000), ('BAM', 2.4167000000), ('MKD', 0.0770000000),
    ('ALL', 0.0470000000), ('MDL', 0.2424000000), ('UAH', 0.1056000000),
    ('BYN', 1.3303000000), ('RUB', 0.0470000000), ('GEL', 1.6353000000),

    -- ── Asia ─────────────────────────────────────────────────────────────────
    ('INR', 0.0520000000), ('PKR', 0.0155400000), ('BDT', 0.0366000000),
    ('LKR', 0.0147500000), ('NPR', 0.0326000000), ('BTN', 0.0521000000),
    ('AFN', 0.0621000000), ('MVR', 0.2825000000), ('MMK', 0.0020710000),
    ('KHR', 0.0010660000), ('LAK', 0.0002000000), ('VND', 0.0001710000),
    ('THB', 0.1236000000), ('IDR', 0.0002700000), ('PHP', 0.0770000000),
    ('TWD', 0.1355000000), ('KRW', 0.0032460000), ('KPW', 0.0048300000),
    ('MOP', 0.5438000000), ('BND', 3.2600000000), ('MNT', 0.0012870000),
    ('KZT', 0.0091200000), ('UZS', 0.0003460000), ('TJS', 0.3973000000),
    ('KGS', 0.0498000000), ('AZN', 2.5588000000), ('AMD', 0.0112700000),
    ('TMT', 1.2429000000),

    -- ── Pacific ──────────────────────────────────────────────────────────────
    ('PGK', 1.1013000000), ('FJD', 1.9163000000), ('SBD', 0.5148000000),
    ('TOP', 1.8201000000), ('VUV', 0.0360000000), ('WST', 1.5591000000),
    ('XPF', 0.0395000000),

    -- ── Africa ───────────────────────────────────────────────────────────────
    ('ZAR', 0.2400000000), ('NGN', 0.0028500000), ('KES', 0.0335000000),
    ('GHS', 0.3480000000), ('MAD', 0.4372000000), ('DZD', 0.0325000000),
    ('TND', 1.4032000000), ('LYD', 0.8969000000), ('ETB', 0.0357000000),
    ('UGX', 0.0011300000), ('TZS', 0.0016600000), ('RWF', 0.0031750000),
    ('BIF', 0.0014750000), ('DJF', 0.0244000000), ('GMD', 0.0613000000),
    ('GNF', 0.0005030000), ('LRD', 0.0217500000), ('SLE', 0.1925000000),
    ('SDG', 0.0072500000), ('SSP', 0.0033460000), ('SOS', 0.0076200000),
    ('BWP', 0.3140000000), ('SZL', 0.2351000000), ('LSL', 0.2351000000),
    ('NAD', 0.2351000000), ('MWK', 0.0025100000), ('ZMW', 0.1582000000),
    ('ZWG', 0.1642000000), ('AOA', 0.0047300000), ('MZN', 0.0680000000),
    ('CDF', 0.0015400000), ('KMF', 0.0096500000), ('CVE', 0.0431000000),
    ('ERN', 0.2900000000), ('MGA', 0.0009670000), ('MRU', 0.1096000000),
    ('MUR', 0.0956000000), ('SCR', 0.3107000000), ('STN', 0.1916000000),
    ('XAF', 0.0072500000), ('XOF', 0.0072500000),

    -- ── Americas ─────────────────────────────────────────────────────────────
    ('BRL', 0.7436000000), ('ARS', 0.0040500000), ('MXN', 0.2122000000),
    ('CLP', 0.0044400000), ('COP', 0.0010480000), ('PEN', 1.1508000000),
    ('VES', 0.0862000000), ('BOB', 0.6296000000), ('PYG', 0.0005650000),
    ('UYU', 0.1101000000), ('GTQ', 0.5591000000), ('HNL', 0.1750000000),
    ('NIO', 0.1182000000), ('CRC', 0.0085300000), ('DOP', 0.0719000000),
    ('HTG', 0.0330000000), ('JMD', 0.0279000000), ('TTD', 0.6416000000),
    ('BSD', 4.3500000000), ('BBD', 2.1750000000), ('BZD', 2.1750000000),
    ('SRD', 0.1208000000), ('GYD', 0.0208000000), ('KYD', 5.2410000000),
    ('AWG', 2.4302000000), ('ANG', 2.4302000000), ('BMD', 4.3500000000),
    ('CUP', 0.1813000000), ('PAB', 4.3500000000), ('XCD', 1.6111000000);

    -- Self-reference safety: if MYR slipped in, fail loudly
    IF EXISTS (SELECT 1 FROM tmp_base WHERE from_curr = 'MYR') THEN
        RAISE EXCEPTION '330 FAIL: MYR cannot appear as a from_currency';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- PREREQUISITE: every base currency exists & is active in shared.currency
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT string_agg(b.from_curr, ', ' ORDER BY b.from_curr)
    INTO v_missing
    FROM tmp_base b
    WHERE NOT EXISTS (
        SELECT 1 FROM shared.currency c
        WHERE c.code = b.from_curr AND c.status = 'active'
    );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '330 FAIL: missing or non-active currency in shared.currency: %', v_missing;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- TMP_FX — staging table for all rate rows (PERIOD_END + SPOT + history)
    -- ══════════════════════════════════════════════════════════════════════════
    CREATE TEMP TABLE tmp_fx (
        from_curr character(3)   NOT NULL,
        rate      numeric(18,10) NOT NULL,
        eff_date  date           NOT NULL,
        rate_type text           NOT NULL
    ) ON COMMIT DROP;

    -- ── LAYER 1 — FY2026 Q1+Q2 PERIOD_END for ALL 150 currencies (6 dates each) ─
    -- Generated from tmp_base × 6 H1-2026 month-ends with uniform progression.
    INSERT INTO tmp_fx (from_curr, rate, eff_date, rate_type)
    SELECT
        b.from_curr,
        ROUND(b.rate * d.mult, 10) AS rate,
        d.eff_date,
        'PERIOD_END'
    FROM tmp_base b
    CROSS JOIN (VALUES
        (DATE '2026-01-31', 1.00690),
        (DATE '2026-02-28', 1.00230),
        (DATE '2026-03-31', 1.00000),
        (DATE '2026-04-30', 0.99770),
        (DATE '2026-05-31', 0.99540),
        (DATE '2026-06-30', 0.99310)
    ) AS d(eff_date, mult);

    -- ── LAYER 2 — SPOT (current transaction rate, anchored at 2026-05-15) ────
    -- One row per currency. Matches the May 31 PERIOD_END rate (anchor × 0.99540).
    INSERT INTO tmp_fx (from_curr, rate, eff_date, rate_type)
    SELECT b.from_curr, ROUND(b.rate * 0.99540, 10), DATE '2026-05-15', 'SPOT'
    FROM tmp_base b;

    -- ── LAYER 3 — FY2025 quarterly PERIOD_END for the 13 demo-driver currencies
    -- (USD, QAR, SAR, AED, SGD, INR, CAD, EUR, TWD, ZAR, GBP, JPY, PHP).
    -- Used by FY2025 month-end revaluation, consolidation, and KPI demos.
    INSERT INTO tmp_fx (from_curr, rate, eff_date, rate_type) VALUES
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
    ('PHP', 0.0772, '2025-12-31', 'PERIOD_END');

    -- Pre-insert sanity: no duplicate natural keys in tmp_fx
    IF EXISTS (
        SELECT 1 FROM tmp_fx
        GROUP BY from_curr, eff_date, rate_type
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION '330 FAIL: duplicate (from_curr, eff_date, rate_type) in tmp_fx';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- INSERT into master.fx_rate
    -- ══════════════════════════════════════════════════════════════════════════
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

    -- ══════════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════════

    -- A1: All 150 active "from" currencies seeded (one row per ccy minimum)
    IF (SELECT count(DISTINCT from_currency) FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org') != 150
    THEN
        RAISE EXCEPTION '330 FAIL: expected 150 distinct source currencies, got %',
            (SELECT count(DISTINCT from_currency) FROM master.fx_rate
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org');
    END IF;

    -- A2: No from = to currency rows (defensive — table CHECK already enforces)
    IF EXISTS (
        SELECT 1 FROM master.fx_rate
        WHERE tenant_id = v_tid AND from_currency = to_currency
          AND metadata->'_seed'->>'pack' = '330_org'
    ) THEN
        RAISE EXCEPTION '330 FAIL: fx_rate row with from = to currency';
    END IF;

    -- A3: No duplicate natural keys within seed
    IF EXISTS (
        SELECT 1 FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
        GROUP BY from_currency, to_currency, rate_type, effective_date
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION '330 FAIL: duplicate FX rate natural key in seed';
    END IF;

    -- A4: Exact total row count (1115 = 65 FY2025 + 900 FY2026 Q1+Q2 + 150 SPOT)
    IF v_inserted != 1115 THEN
        RAISE EXCEPTION '330 FAIL: expected exactly 1115 FX rates, inserted %', v_inserted;
    END IF;

    -- A5: Sub-counts by rate_type (965 = 900 FY2026 Q1+Q2 + 65 FY2025)
    IF (SELECT count(*) FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
          AND rate_type = 'PERIOD_END') != 965
    THEN
        RAISE EXCEPTION '330 FAIL: expected 965 PERIOD_END rates, got %',
            (SELECT count(*) FROM master.fx_rate
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
               AND rate_type = 'PERIOD_END');
    END IF;

    IF (SELECT count(*) FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
          AND rate_type = 'SPOT') != 150
    THEN
        RAISE EXCEPTION '330 FAIL: expected 150 SPOT rates, got %',
            (SELECT count(*) FROM master.fx_rate
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
               AND rate_type = 'SPOT');
    END IF;

    -- A6: Tenant-onboarding guarantee — every active currency in
    -- shared.currency (excluding MYR base, deprecated codes, metals/SDR)
    -- has at least one MYR rate of each kind (PERIOD_END + SPOT) on file.
    SELECT count(*) INTO v_active
    FROM shared.currency c
    WHERE c.status = 'active'
      AND c.code <> 'MYR'
      AND c.code NOT IN ('XAU','XAG','XPT','XPD','XDR','HRK','ZWL');

    IF EXISTS (
        SELECT 1
        FROM shared.currency c
        WHERE c.status = 'active'
          AND c.code <> 'MYR'
          AND c.code NOT IN ('XAU','XAG','XPT','XPD','XDR','HRK','ZWL')
          AND NOT EXISTS (
              SELECT 1 FROM master.fx_rate r
              WHERE r.tenant_id = v_tid
                AND r.from_currency = c.code
                AND r.to_currency = 'MYR'
                AND r.rate_type = 'SPOT'
                AND r.metadata->'_seed'->>'pack' = '330_org'
          )
    ) THEN
        RAISE EXCEPTION '330 FAIL: at least one active currency has no SPOT → MYR rate (tenant-onboarding guarantee broken)';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM shared.currency c
        WHERE c.status = 'active'
          AND c.code <> 'MYR'
          AND c.code NOT IN ('XAU','XAG','XPT','XPD','XDR','HRK','ZWL')
          AND NOT EXISTS (
              SELECT 1 FROM master.fx_rate r
              WHERE r.tenant_id = v_tid
                AND r.from_currency = c.code
                AND r.to_currency = 'MYR'
                AND r.rate_type = 'PERIOD_END'
                AND r.effective_date = DATE '2026-03-31'
                AND r.metadata->'_seed'->>'pack' = '330_org'
          )
    ) THEN
        RAISE EXCEPTION '330 FAIL: at least one active currency has no Mar-2026 PERIOD_END → MYR rate';
    END IF;

    -- A7: All rates strictly positive (defensive — CHECK already enforces)
    IF EXISTS (
        SELECT 1 FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
          AND rate <= 0
    ) THEN
        RAISE EXCEPTION '330 FAIL: non-positive rate detected';
    END IF;

    RAISE NOTICE '330: % FX rates inserted (% PERIOD_END, % SPOT) covering % active currencies → MYR (H1 2026 Q1+Q2 + SPOT @2026-05-15; FY2025 quarterly for 13 demo-driver currencies)',
        v_inserted,
        (SELECT count(*) FROM master.fx_rate
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
           AND rate_type = 'PERIOD_END'),
        (SELECT count(*) FROM master.fx_rate
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
           AND rate_type = 'SPOT'),
        v_active;
END $seed$;
