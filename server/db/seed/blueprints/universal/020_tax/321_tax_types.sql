-- master.tax_type catalogue per jurisdiction.
-- Category constraint = INDIRECT, WITHHOLDING, CUSTOMS_DUTY, SURCHARGE.
-- Transactional taxes only — CIT/income tax is a period-end JE and intentionally excluded.

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "321_org", "version": "2.1.0"}}'::jsonb;

    -- master.condition_type system rows live at tenant_id IS NULL.
    v_ct_gst        uuid;
    v_ct_hst        uuid;
    v_ct_pst        uuid;
    v_ct_sales      uuid;
    v_ct_use        uuid;
    v_ct_vat        uuid;
    v_ct_wht        uuid;
    v_ct_customs    uuid;
    v_ct_surcharge  uuid;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    SELECT id INTO v_ct_gst       FROM master.condition_type WHERE code = 'TAX_GST'          AND tenant_id IS NULL;
    SELECT id INTO v_ct_hst       FROM master.condition_type WHERE code = 'TAX_HST'          AND tenant_id IS NULL;
    SELECT id INTO v_ct_pst       FROM master.condition_type WHERE code = 'TAX_PST'          AND tenant_id IS NULL;
    SELECT id INTO v_ct_sales     FROM master.condition_type WHERE code = 'TAX_SALES'        AND tenant_id IS NULL;
    SELECT id INTO v_ct_use       FROM master.condition_type WHERE code = 'TAX_USE'          AND tenant_id IS NULL;
    SELECT id INTO v_ct_vat       FROM master.condition_type WHERE code = 'TAX_VAT'          AND tenant_id IS NULL;
    SELECT id INTO v_ct_wht       FROM master.condition_type WHERE code = 'WHT_GENERIC'      AND tenant_id IS NULL;
    SELECT id INTO v_ct_customs   FROM master.condition_type WHERE code = 'CHG_CUSTOMS_DUTY' AND tenant_id IS NULL;
    SELECT id INTO v_ct_surcharge FROM master.condition_type WHERE code = 'TAX_SURCHARGE'    AND tenant_id IS NULL;

    -- Fail-fast: every kind referenced below must resolve.
    IF v_ct_gst IS NULL OR v_ct_hst IS NULL OR v_ct_pst IS NULL OR v_ct_sales IS NULL
       OR v_ct_use IS NULL OR v_ct_vat IS NULL OR v_ct_wht IS NULL
       OR v_ct_customs IS NULL OR v_ct_surcharge IS NULL
    THEN
        RAISE EXCEPTION '321: condition_type catalog row(s) missing — run 004_condition_type.sql first';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- C0: Remove stale tax types not in the current canonical set.
    --     Old seed versions used different code formats (e.g. VAT-AE, VAT-STD).
    --     Prune in FK-reverse order — no ON DELETE CASCADE on any of these:
    --       ledger.tax_calculation      → control.tax_rate_schedule → master.tax_type
    --       control.tax_group_component → control.tax_rate_schedule → master.tax_type
    --       control.tax_rate_schedule   → master.tax_type
    -- ══════════════════════════════════════════════════════════════════════
    DELETE FROM ledger.tax_calculation
    WHERE tenant_id = v_tid
      AND tax_rate_schedule_id IN (
          SELECT id FROM control.tax_rate_schedule
          WHERE tenant_id = v_tid
            AND tax_type_id IN (
                SELECT id FROM master.tax_type
                WHERE tenant_id = v_tid
                  AND code NOT IN (
                    'MY-SST-SALES','MY-SST-SVC','MY-WHT',
                    'QA-WHT',
                    'SA-VAT','SA-WHT','SA-ZAKAT',
                    'AE-VAT',
                    'US-SALES','US-WHT',
                    'SG-GST','SG-WHT',
                    'IN-CGST','IN-SGST','IN-IGST','IN-TDS','IN-TCS','IN-CUSTOMS','IN-CESS',
                    'CA-GST','CA-PST','CA-HST','CA-WHT',
                    'DE-UST','DE-WHT','DE-CUSTOMS',
                    'TW-VAT','TW-WHT',
                    'ZA-VAT','ZA-WHT','ZA-MINING-ROY',
                    'GB-VAT','GB-WHT','GB-CUSTOMS',
                    'JP-CT','JP-WHT',
                    'PH-VAT','PH-EWT','PH-FWT'
                  )));

    DELETE FROM control.tax_group_component
    WHERE tenant_id = v_tid
      AND tax_rate_schedule_id IN (
          SELECT id FROM control.tax_rate_schedule
          WHERE tenant_id = v_tid
            AND tax_type_id IN (
                SELECT id FROM master.tax_type
                WHERE tenant_id = v_tid
                  AND code NOT IN (
                    'MY-SST-SALES','MY-SST-SVC','MY-WHT',
                    'QA-WHT',
                    'SA-VAT','SA-WHT','SA-ZAKAT',
                    'AE-VAT',
                    'US-SALES','US-WHT',
                    'SG-GST','SG-WHT',
                    'IN-CGST','IN-SGST','IN-IGST','IN-TDS','IN-TCS','IN-CUSTOMS','IN-CESS',
                    'CA-GST','CA-PST','CA-HST','CA-WHT',
                    'DE-UST','DE-WHT','DE-CUSTOMS',
                    'TW-VAT','TW-WHT',
                    'ZA-VAT','ZA-WHT','ZA-MINING-ROY',
                    'GB-VAT','GB-WHT','GB-CUSTOMS',
                    'JP-CT','JP-WHT',
                    'PH-VAT','PH-EWT','PH-FWT'
                  )));

    DELETE FROM control.tax_rate_schedule
    WHERE tenant_id = v_tid
      AND tax_type_id IN (
          SELECT id FROM master.tax_type
          WHERE tenant_id = v_tid
            AND code NOT IN (
              'MY-SST-SALES','MY-SST-SVC','MY-WHT',
              'QA-WHT',
              'SA-VAT','SA-WHT','SA-ZAKAT',
              'AE-VAT',
              'US-SALES','US-WHT',
              'SG-GST','SG-WHT',
              'IN-CGST','IN-SGST','IN-IGST','IN-TDS','IN-TCS','IN-CUSTOMS','IN-CESS',
              'CA-GST','CA-PST','CA-HST','CA-WHT',
              'DE-UST','DE-WHT','DE-CUSTOMS',
              'TW-VAT','TW-WHT',
              'ZA-VAT','ZA-WHT','ZA-MINING-ROY',
              'GB-VAT','GB-WHT','GB-CUSTOMS',
              'JP-CT','JP-WHT',
              'PH-VAT','PH-EWT','PH-FWT'
            ));

    DELETE FROM master.tax_type
    WHERE tenant_id = v_tid
      AND code NOT IN (
        'MY-SST-SALES','MY-SST-SVC','MY-WHT',
        'QA-WHT',
        'SA-VAT','SA-WHT','SA-ZAKAT',
        'AE-VAT',
        'US-SALES','US-WHT',
        'SG-GST','SG-WHT',
        'IN-CGST','IN-SGST','IN-IGST','IN-TDS','IN-TCS','IN-CUSTOMS','IN-CESS',
        'CA-GST','CA-PST','CA-HST','CA-WHT',
        'DE-UST','DE-WHT','DE-CUSTOMS',
        'TW-VAT','TW-WHT',
        'ZA-VAT','ZA-WHT','ZA-MINING-ROY',
        'GB-VAT','GB-WHT','GB-CUSTOMS',
        'JP-CT','JP-WHT',
        'PH-VAT','PH-EWT','PH-FWT'
      );

    -- ══════════════════════════════════════════════════════════════════════
    -- Canonical tax type upsert
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO master.tax_type
        (tenant_id, code, name,
         condition_type_id,
         sort_order, status, created_by, metadata)
    VALUES
    -- ─── MALAYSIA ────────────────────────────────────────────────────────
    (v_tid, 'MY-SST-SALES',  'MY Sales Tax (SST)',          v_ct_sales,     10, 'active', v_su, v_meta),
    (v_tid, 'MY-SST-SVC',    'MY Service Tax (SST)',         v_ct_sales,     11, 'active', v_su, v_meta),
    (v_tid, 'MY-WHT',        'MY Withholding Tax',           v_ct_wht,       12, 'active', v_su, v_meta),
    -- ─── QATAR ──────────────────────────────────────────────────────────
    (v_tid, 'QA-WHT',        'QA Withholding Tax',           v_ct_wht,       20, 'active', v_su, v_meta),
    -- ─── SAUDI ARABIA ───────────────────────────────────────────────────
    (v_tid, 'SA-VAT',        'SA Value Added Tax',           v_ct_vat,       30, 'active', v_su, v_meta),
    (v_tid, 'SA-WHT',        'SA Withholding Tax',           v_ct_wht,       31, 'active', v_su, v_meta),
    (v_tid, 'SA-ZAKAT',      'SA Zakat',                     v_ct_surcharge, 32, 'active', v_su, v_meta),
    -- ─── UAE ────────────────────────────────────────────────────────────
    (v_tid, 'AE-VAT',        'AE Value Added Tax',           v_ct_vat,       40, 'active', v_su, v_meta),
    -- ─── UNITED STATES ──────────────────────────────────────────────────
    (v_tid, 'US-SALES',      'US State Sales Tax',           v_ct_sales,     50, 'active', v_su, v_meta),
    (v_tid, 'US-WHT',        'US Federal WHT (Chapter 3)',   v_ct_wht,       51, 'active', v_su, v_meta),
    -- ─── SINGAPORE ──────────────────────────────────────────────────────
    (v_tid, 'SG-GST',        'SG Goods & Services Tax',      v_ct_gst,       60, 'active', v_su, v_meta),
    (v_tid, 'SG-WHT',        'SG Withholding Tax',           v_ct_wht,       61, 'active', v_su, v_meta),
    -- ─── INDIA ──────────────────────────────────────────────────────────
    -- CGST and SGST combine in compound groups (CGST+SGST intra-state); compounding lives in tax_group_component.
    (v_tid, 'IN-CGST',       'IN Central GST',               v_ct_gst,       70, 'active', v_su, v_meta),
    (v_tid, 'IN-SGST',       'IN State GST',                 v_ct_gst,       71, 'active', v_su, v_meta),
    (v_tid, 'IN-IGST',       'IN Integrated GST',            v_ct_gst,       72, 'active', v_su, v_meta),
    (v_tid, 'IN-TDS',        'IN Tax Deducted at Source',    v_ct_wht,       73, 'active', v_su, v_meta),
    (v_tid, 'IN-TCS',        'IN Tax Collected at Source',   v_ct_wht,       74, 'active', v_su, v_meta),
    (v_tid, 'IN-CUSTOMS',    'IN Customs Duty',              v_ct_customs,   75, 'active', v_su, v_meta),
    (v_tid, 'IN-CESS',       'IN Compensation Cess',         v_ct_surcharge, 76, 'active', v_su, v_meta),
    -- ─── CANADA ─────────────────────────────────────────────────────────
    (v_tid, 'CA-GST',        'CA Goods & Services Tax',      v_ct_gst,       80, 'active', v_su, v_meta),
    (v_tid, 'CA-PST',        'CA Provincial Sales Tax',      v_ct_pst,       81, 'active', v_su, v_meta),
    (v_tid, 'CA-HST',        'CA Harmonized Sales Tax',      v_ct_hst,       82, 'active', v_su, v_meta),
    (v_tid, 'CA-WHT',        'CA Withholding Tax',           v_ct_wht,       83, 'active', v_su, v_meta),
    -- ─── GERMANY ────────────────────────────────────────────────────────
    (v_tid, 'DE-UST',        'DE Umsatzsteuer (VAT)',        v_ct_vat,       90, 'active', v_su, v_meta),
    (v_tid, 'DE-WHT',        'DE Kapitalertragsteuer (WHT)', v_ct_wht,       91, 'active', v_su, v_meta),
    (v_tid, 'DE-CUSTOMS',    'DE EU Customs Duty',           v_ct_customs,   92, 'active', v_su, v_meta),
    -- ─── TAIWAN ─────────────────────────────────────────────────────────
    (v_tid, 'TW-VAT',        'TW Business Tax (VAT)',        v_ct_vat,      100, 'active', v_su, v_meta),
    (v_tid, 'TW-WHT',        'TW Withholding Tax',           v_ct_wht,      101, 'active', v_su, v_meta),
    -- ─── SOUTH AFRICA ───────────────────────────────────────────────────
    (v_tid, 'ZA-VAT',        'ZA Value Added Tax',           v_ct_vat,      110, 'active', v_su, v_meta),
    (v_tid, 'ZA-WHT',        'ZA Dividends / Interest WHT',  v_ct_wht,      111, 'active', v_su, v_meta),
    (v_tid, 'ZA-MINING-ROY', 'ZA Mining Royalty',            v_ct_surcharge,112, 'active', v_su, v_meta),
    -- ─── UNITED KINGDOM ─────────────────────────────────────────────────
    (v_tid, 'GB-VAT',        'GB Value Added Tax',           v_ct_vat,      120, 'active', v_su, v_meta),
    (v_tid, 'GB-WHT',        'GB Income Tax (WHT)',          v_ct_wht,      121, 'active', v_su, v_meta),
    (v_tid, 'GB-CUSTOMS',    'GB Customs Duty',              v_ct_customs,  122, 'active', v_su, v_meta),
    -- ─── JAPAN ──────────────────────────────────────────────────────────
    (v_tid, 'JP-CT',         'JP Consumption Tax',           v_ct_vat,      130, 'active', v_su, v_meta),
    (v_tid, 'JP-WHT',        'JP Withholding Tax',           v_ct_wht,      131, 'active', v_su, v_meta),
    -- ─── PHILIPPINES ────────────────────────────────────────────────────
    (v_tid, 'PH-VAT',        'PH Value Added Tax',           v_ct_vat,      140, 'active', v_su, v_meta),
    (v_tid, 'PH-EWT',        'PH Expanded WHT',              v_ct_wht,      141, 'active', v_su, v_meta),
    (v_tid, 'PH-FWT',        'PH Final WHT',                 v_ct_wht,      142, 'active', v_su, v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        condition_type_id = EXCLUDED.condition_type_id,
        sort_order = EXCLUDED.sort_order,
        updated_at = now(), updated_by = v_su
    WHERE (master.tax_type.name,
           master.tax_type.condition_type_id,
           master.tax_type.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name,
           EXCLUDED.condition_type_id,
           EXCLUDED.sort_order);

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Total type count
    IF (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid) < 38
    THEN RAISE EXCEPTION '321 FAIL: expected ≥38 tax types, got %',
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid);
    END IF;

    -- A2: Every active tax_type maps to a condition_type catalog row
    IF EXISTS (
        SELECT code FROM master.tax_type
        WHERE tenant_id = v_tid AND status = 'active' AND condition_type_id IS NULL
    ) THEN
        RAISE EXCEPTION '321 FAIL: % tax_type row(s) without condition_type_id linkage',
            (SELECT count(*) FROM master.tax_type
              WHERE tenant_id = v_tid AND status = 'active' AND condition_type_id IS NULL);
    END IF;

    -- A3: Every active tax_type maps to a condition_type whose term_type is
    --     one of {tax, withholding, charge} — these are the only kinds the
    --     tax engine knows how to classify.
    IF EXISTS (
        SELECT tt.code FROM master.tax_type tt
        LEFT JOIN master.condition_type ct ON ct.id = tt.condition_type_id
        WHERE tt.tenant_id = v_tid
          AND tt.status = 'active'
          AND (ct.term_type IS NULL OR ct.term_type NOT IN ('tax','withholding','charge'))
    ) THEN
        RAISE EXCEPTION '321 FAIL: tax_type linked to condition_type with invalid term_type';
    END IF;

    RAISE NOTICE '321: % tax types, all linked to condition_type (tax: %, withholding: %, charge: %)',
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid),
        (SELECT count(*) FROM master.tax_type tt
           JOIN master.condition_type ct ON ct.id = tt.condition_type_id
          WHERE tt.tenant_id = v_tid AND ct.term_type = 'tax'),
        (SELECT count(*) FROM master.tax_type tt
           JOIN master.condition_type ct ON ct.id = tt.condition_type_id
          WHERE tt.tenant_id = v_tid AND ct.term_type = 'withholding'),
        (SELECT count(*) FROM master.tax_type tt
           JOIN master.condition_type ct ON ct.id = tt.condition_type_id
          WHERE tt.tenant_id = v_tid AND ct.term_type = 'charge');
END $seed$;
