-- ============================================================================
-- 321_tax_types.sql — Tax type catalog per jurisdiction
-- ============================================================================
-- Tables: master.tax_type
-- DDL category constraint: INDIRECT, WITHHOLDING, CUSTOMS_DUTY, SURCHARGE
-- Scope: Transactional taxes only. CIT/income tax is period-end JE, not
--        per-document tax calculation — intentionally excluded.
-- Depends: 320 (tax_jurisdictions)
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "321_org", "version": "2.0.0"}}'::jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    INSERT INTO master.tax_type
        (tenant_id, code, name, category,
         is_recoverable, is_deducted_at_source, is_included_in_price,
         sort_order, status, created_by, metadata)
    VALUES
    -- ─── MALAYSIA ────────────────────────────────────────────────────────
    (v_tid, 'MY-SST-SALES',  'MY Sales Tax (SST)',          'INDIRECT',     false, false, false, 10, 'active', v_su, v_meta),
    (v_tid, 'MY-SST-SVC',    'MY Service Tax (SST)',         'INDIRECT',     false, false, false, 11, 'active', v_su, v_meta),
    (v_tid, 'MY-WHT',        'MY Withholding Tax',           'WITHHOLDING',  false, true,  false, 12, 'active', v_su, v_meta),
    -- ─── QATAR ──────────────────────────────────────────────────────────
    (v_tid, 'QA-WHT',        'QA Withholding Tax',           'WITHHOLDING',  false, true,  false, 20, 'active', v_su, v_meta),
    -- ─── SAUDI ARABIA ───────────────────────────────────────────────────
    (v_tid, 'SA-VAT',        'SA Value Added Tax',           'INDIRECT',     true,  false, false, 30, 'active', v_su, v_meta),
    (v_tid, 'SA-WHT',        'SA Withholding Tax',           'WITHHOLDING',  false, true,  false, 31, 'active', v_su, v_meta),
    (v_tid, 'SA-ZAKAT',      'SA Zakat',                     'SURCHARGE',    false, false, false, 32, 'active', v_su, v_meta),
    -- ─── UAE ────────────────────────────────────────────────────────────
    (v_tid, 'AE-VAT',        'AE Value Added Tax',           'INDIRECT',     true,  false, false, 40, 'active', v_su, v_meta),
    -- ─── UNITED STATES ──────────────────────────────────────────────────
    (v_tid, 'US-SALES',      'US State Sales Tax',           'INDIRECT',     false, false, false, 50, 'active', v_su, v_meta),
    (v_tid, 'US-WHT',        'US Federal WHT (Chapter 3)',   'WITHHOLDING',  false, true,  false, 51, 'active', v_su, v_meta),
    -- ─── SINGAPORE ──────────────────────────────────────────────────────
    (v_tid, 'SG-GST',        'SG Goods & Services Tax',      'INDIRECT',     true,  false, false, 60, 'active', v_su, v_meta),
    (v_tid, 'SG-WHT',        'SG Withholding Tax',           'WITHHOLDING',  false, true,  false, 61, 'active', v_su, v_meta),
    -- ─── INDIA ──────────────────────────────────────────────────────────
    (v_tid, 'IN-CGST',       'IN Central GST',               'INDIRECT',     true,  false, false, 70, 'active', v_su, v_meta),
    (v_tid, 'IN-SGST',       'IN State GST',                 'INDIRECT',     true,  false, false, 71, 'active', v_su, v_meta),
    (v_tid, 'IN-IGST',       'IN Integrated GST',            'INDIRECT',     true,  false, false, 72, 'active', v_su, v_meta),
    (v_tid, 'IN-TDS',        'IN Tax Deducted at Source',    'WITHHOLDING',  false, true,  false, 73, 'active', v_su, v_meta),
    (v_tid, 'IN-TCS',        'IN Tax Collected at Source',   'WITHHOLDING',  false, true,  false, 74, 'active', v_su, v_meta),
    (v_tid, 'IN-CUSTOMS',    'IN Customs Duty',              'CUSTOMS_DUTY', false, false, false, 75, 'active', v_su, v_meta),
    (v_tid, 'IN-CESS',       'IN Compensation Cess',         'SURCHARGE',    false, false, false, 76, 'active', v_su, v_meta),
    -- ─── CANADA ─────────────────────────────────────────────────────────
    (v_tid, 'CA-GST',        'CA Goods & Services Tax',      'INDIRECT',     true,  false, false, 80, 'active', v_su, v_meta),
    (v_tid, 'CA-PST',        'CA Provincial Sales Tax',      'INDIRECT',     false, false, false, 81, 'active', v_su, v_meta),
    (v_tid, 'CA-HST',        'CA Harmonized Sales Tax',      'INDIRECT',     true,  false, false, 82, 'active', v_su, v_meta),
    (v_tid, 'CA-WHT',        'CA Withholding Tax',           'WITHHOLDING',  false, true,  false, 83, 'active', v_su, v_meta),
    -- ─── GERMANY ────────────────────────────────────────────────────────
    (v_tid, 'DE-UST',        'DE Umsatzsteuer (VAT)',        'INDIRECT',     true,  false, false, 90, 'active', v_su, v_meta),
    (v_tid, 'DE-WHT',        'DE Kapitalertragsteuer (WHT)', 'WITHHOLDING',  false, true,  false, 91, 'active', v_su, v_meta),
    (v_tid, 'DE-CUSTOMS',    'DE EU Customs Duty',           'CUSTOMS_DUTY', false, false, false, 92, 'active', v_su, v_meta),
    -- ─── TAIWAN ─────────────────────────────────────────────────────────
    (v_tid, 'TW-VAT',        'TW Business Tax (VAT)',        'INDIRECT',     true,  false, false,100, 'active', v_su, v_meta),
    (v_tid, 'TW-WHT',        'TW Withholding Tax',           'WITHHOLDING',  false, true,  false,101, 'active', v_su, v_meta),
    -- ─── SOUTH AFRICA ───────────────────────────────────────────────────
    (v_tid, 'ZA-VAT',        'ZA Value Added Tax',           'INDIRECT',     true,  false, false,110, 'active', v_su, v_meta),
    (v_tid, 'ZA-WHT',        'ZA Dividends / Interest WHT',  'WITHHOLDING',  false, true,  false,111, 'active', v_su, v_meta),
    (v_tid, 'ZA-MINING-ROY', 'ZA Mining Royalty',            'SURCHARGE',    false, false, false,112, 'active', v_su, v_meta),
    -- ─── UNITED KINGDOM ─────────────────────────────────────────────────
    (v_tid, 'GB-VAT',        'GB Value Added Tax',           'INDIRECT',     true,  false, false,120, 'active', v_su, v_meta),
    (v_tid, 'GB-WHT',        'GB Income Tax (WHT)',          'WITHHOLDING',  false, true,  false,121, 'active', v_su, v_meta),
    (v_tid, 'GB-CUSTOMS',    'GB Customs Duty',              'CUSTOMS_DUTY', false, false, false,122, 'active', v_su, v_meta),
    -- ─── JAPAN ──────────────────────────────────────────────────────────
    (v_tid, 'JP-CT',         'JP Consumption Tax',           'INDIRECT',     true,  false, false,130, 'active', v_su, v_meta),
    (v_tid, 'JP-WHT',        'JP Withholding Tax',           'WITHHOLDING',  false, true,  false,131, 'active', v_su, v_meta),
    -- ─── PHILIPPINES ────────────────────────────────────────────────────
    (v_tid, 'PH-VAT',        'PH Value Added Tax',           'INDIRECT',     true,  false, false,140, 'active', v_su, v_meta),
    (v_tid, 'PH-EWT',        'PH Expanded WHT',              'WITHHOLDING',  false, true,  false,141, 'active', v_su, v_meta),
    (v_tid, 'PH-FWT',        'PH Final WHT',                 'WITHHOLDING',  false, true,  false,142, 'active', v_su, v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, category = EXCLUDED.category,
        is_recoverable = EXCLUDED.is_recoverable,
        is_deducted_at_source = EXCLUDED.is_deducted_at_source,
        updated_at = now(), updated_by = v_su
    WHERE (master.tax_type.name, master.tax_type.category,
           master.tax_type.is_recoverable, master.tax_type.is_deducted_at_source)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.category,
           EXCLUDED.is_recoverable, EXCLUDED.is_deducted_at_source);

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Total type count
    IF (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid) < 38
    THEN RAISE EXCEPTION '321 FAIL: expected ≥38 tax types, got %',
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid);
    END IF;

    -- A2: All 4 categories represented
    IF (SELECT count(DISTINCT category) FROM master.tax_type WHERE tenant_id = v_tid) != 4
    THEN RAISE EXCEPTION '321 FAIL: expected 4 categories, got %',
        (SELECT count(DISTINCT category) FROM master.tax_type WHERE tenant_id = v_tid);
    END IF;

    -- A3: Every recoverable type is INDIRECT
    IF EXISTS (
        SELECT code FROM master.tax_type
        WHERE tenant_id = v_tid AND is_recoverable AND category != 'INDIRECT'
    ) THEN RAISE EXCEPTION '321 FAIL: recoverable non-INDIRECT type found'; END IF;

    -- A4: Every deducted-at-source type is WITHHOLDING
    IF EXISTS (
        SELECT code FROM master.tax_type
        WHERE tenant_id = v_tid AND is_deducted_at_source AND category != 'WITHHOLDING'
    ) THEN RAISE EXCEPTION '321 FAIL: deducted-at-source non-WITHHOLDING type found'; END IF;

    RAISE NOTICE '321: % tax types across 4 categories (INDIRECT: %, WHT: %, CUSTOMS: %, SURCHARGE: %)',
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid),
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid AND category = 'INDIRECT'),
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid AND category = 'WITHHOLDING'),
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid AND category = 'CUSTOMS_DUTY'),
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid AND category = 'SURCHARGE');
END $seed$;
