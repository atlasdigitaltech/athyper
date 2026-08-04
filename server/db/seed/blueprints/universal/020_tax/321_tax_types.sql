-- master.tax_type catalogue per jurisdiction.
-- Category constraint = INDIRECT, WITHHOLDING, CUSTOMS_DUTY, SURCHARGE.
-- Transactional taxes only â€” CIT/income tax is a period-end JE and intentionally excluded.

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
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
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set â€” run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- The catalog is published in the system tenant, while the current FK
    -- deliberately requires a tenant-local condition identity. Materialize
    -- only the nine tax conditions consumed by this pack.
    INSERT INTO master.condition_type(
      id,tenant_id,code,name,description,term_type,term_sub_type,default_basis,
      default_rate,default_amount,default_apportion_basis,is_subject_to_tax,is_apportionable,
      applies_to_classes,default_cost_effect,default_posting_pattern,
      default_distribution_policy,default_capitalization_policy,default_posting_role_code,
      origin,sort_order,metadata,status,created_by)
    SELECT md5('wave5:tenant-tax-condition:'||v_tid||':'||source.code)::uuid,v_tid,
      source.code,source.name,source.description,source.term_type,source.term_sub_type,
      source.default_basis,source.default_rate,source.default_amount,source.default_apportion_basis,
      source.is_subject_to_tax,source.is_apportionable,source.applies_to_classes,
      source.default_cost_effect,source.default_posting_pattern,source.default_distribution_policy,
      source.default_capitalization_policy,source.default_posting_role_code,'tenant',source.sort_order,
      jsonb_build_object('_seed',jsonb_build_object('pack','321_org','version','2.1.0'),'source_condition_code',source.code),
      'active',v_su
    FROM master.condition_type source
    WHERE source.tenant_id='00000000-0000-0000-0000-000000000000'::uuid
      AND source.code IN ('TAX_GST','TAX_HST','TAX_PST','TAX_SALES','TAX_USE','TAX_VAT','WHT_GENERIC','CHG_CUSTOMS_DUTY','TAX_SURCHARGE')
    ON CONFLICT(tenant_id,code) DO NOTHING;

    SELECT id INTO v_ct_gst       FROM master.condition_type WHERE code = 'TAX_GST'          AND tenant_id = v_tid;
    SELECT id INTO v_ct_hst       FROM master.condition_type WHERE code = 'TAX_HST'          AND tenant_id = v_tid;
    SELECT id INTO v_ct_pst       FROM master.condition_type WHERE code = 'TAX_PST'          AND tenant_id = v_tid;
    SELECT id INTO v_ct_sales     FROM master.condition_type WHERE code = 'TAX_SALES'        AND tenant_id = v_tid;
    SELECT id INTO v_ct_use       FROM master.condition_type WHERE code = 'TAX_USE'          AND tenant_id = v_tid;
    SELECT id INTO v_ct_vat       FROM master.condition_type WHERE code = 'TAX_VAT'          AND tenant_id = v_tid;
    SELECT id INTO v_ct_wht       FROM master.condition_type WHERE code = 'WHT_GENERIC'      AND tenant_id = v_tid;
    SELECT id INTO v_ct_customs   FROM master.condition_type WHERE code = 'CHG_CUSTOMS_DUTY' AND tenant_id = v_tid;
    SELECT id INTO v_ct_surcharge FROM master.condition_type WHERE code = 'TAX_SURCHARGE'    AND tenant_id = v_tid;

    -- Fail-fast: every kind referenced below must resolve.
    IF v_ct_gst IS NULL OR v_ct_hst IS NULL OR v_ct_pst IS NULL OR v_ct_sales IS NULL
       OR v_ct_use IS NULL OR v_ct_vat IS NULL OR v_ct_wht IS NULL
       OR v_ct_customs IS NULL OR v_ct_surcharge IS NULL
    THEN
        RAISE EXCEPTION '321: condition_type catalog row(s) missing â€” run 004_condition_type.sql first';
    END IF;

    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    -- Retire obsolete seed-owned tax types without deleting schedules or calculations.
    UPDATE master.tax_type
       SET status='retired',updated_at=now(),updated_by=v_su
     WHERE tenant_id=v_tid
       AND metadata->'_seed'->>'pack'='321_org'
       AND code NOT IN (
         'MY-SST-SALES','MY-SST-SVC','MY-WHT','QA-WHT','SA-VAT','SA-WHT','SA-ZAKAT','AE-VAT',
         'US-SALES','US-WHT','SG-GST','SG-WHT','IN-CGST','IN-SGST','IN-IGST','IN-TDS','IN-TCS',
         'IN-CUSTOMS','IN-CESS','CA-GST','CA-PST','CA-HST','CA-WHT','DE-UST','DE-WHT','DE-CUSTOMS',
         'TW-VAT','TW-WHT','ZA-VAT','ZA-WHT','ZA-MINING-ROY','GB-VAT','GB-WHT','GB-CUSTOMS',
         'JP-CT','JP-WHT','PH-VAT','PH-EWT','PH-FWT')
       AND status<>'inactive';

    -- Legacy aliases that can appear from prior tenant seeds. Retire as retired
    -- so they cannot block assertion checks but remain auditable for cleanup.
    UPDATE master.tax_type
       SET status='retired', updated_at = now(), updated_by = v_su,
           metadata = COALESCE(metadata, '{}'::jsonb)
                     || jsonb_build_object('_seed', jsonb_build_object('321_legacy_retired', now()::text))
     WHERE tenant_id = v_tid
       AND status='active'
       AND code IN ('VAT_EG', 'VAT_SA', 'WHT_EG', 'WHT_SA');
    WITH seed_rows(tenant_id,code,name,condition_type_id,sort_order,status,created_by,metadata) AS (VALUES
    -- â”€â”€â”€ MALAYSIA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'MY-SST-SALES',  'MY Sales Tax (SST)',          v_ct_sales,     10, 'active', v_su, v_meta),
    (v_tid, 'MY-SST-SVC',    'MY Service Tax (SST)',         v_ct_sales,     11, 'active', v_su, v_meta),
    (v_tid, 'MY-WHT',        'MY Withholding Tax',           v_ct_wht,       12, 'active', v_su, v_meta),
    -- â”€â”€â”€ QATAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'QA-WHT',        'QA Withholding Tax',           v_ct_wht,       20, 'active', v_su, v_meta),
    -- â”€â”€â”€ SAUDI ARABIA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'SA-VAT',        'SA Value Added Tax',           v_ct_vat,       30, 'active', v_su, v_meta),
    (v_tid, 'SA-WHT',        'SA Withholding Tax',           v_ct_wht,       31, 'active', v_su, v_meta),
    (v_tid, 'SA-ZAKAT',      'SA Zakat',                     v_ct_surcharge, 32, 'active', v_su, v_meta),
    -- â”€â”€â”€ UAE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'AE-VAT',        'AE Value Added Tax',           v_ct_vat,       40, 'active', v_su, v_meta),
    -- â”€â”€â”€ UNITED STATES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'US-SALES',      'US State Sales Tax',           v_ct_sales,     50, 'active', v_su, v_meta),
    (v_tid, 'US-WHT',        'US Federal WHT (Chapter 3)',   v_ct_wht,       51, 'active', v_su, v_meta),
    -- â”€â”€â”€ SINGAPORE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'SG-GST',        'SG Goods & Services Tax',      v_ct_gst,       60, 'active', v_su, v_meta),
    (v_tid, 'SG-WHT',        'SG Withholding Tax',           v_ct_wht,       61, 'active', v_su, v_meta),
    -- â”€â”€â”€ INDIA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- CGST and SGST combine in compound groups (CGST+SGST intra-state); compounding lives in tax_group_component.
    (v_tid, 'IN-CGST',       'IN Central GST',               v_ct_gst,       70, 'active', v_su, v_meta),
    (v_tid, 'IN-SGST',       'IN State GST',                 v_ct_gst,       71, 'active', v_su, v_meta),
    (v_tid, 'IN-IGST',       'IN Integrated GST',            v_ct_gst,       72, 'active', v_su, v_meta),
    (v_tid, 'IN-TDS',        'IN Tax Deducted at Source',    v_ct_wht,       73, 'active', v_su, v_meta),
    (v_tid, 'IN-TCS',        'IN Tax Collected at Source',   v_ct_wht,       74, 'active', v_su, v_meta),
    (v_tid, 'IN-CUSTOMS',    'IN Customs Duty',              v_ct_customs,   75, 'active', v_su, v_meta),
    (v_tid, 'IN-CESS',       'IN Compensation Cess',         v_ct_surcharge, 76, 'active', v_su, v_meta),
    -- â”€â”€â”€ CANADA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'CA-GST',        'CA Goods & Services Tax',      v_ct_gst,       80, 'active', v_su, v_meta),
    (v_tid, 'CA-PST',        'CA Provincial Sales Tax',      v_ct_pst,       81, 'active', v_su, v_meta),
    (v_tid, 'CA-HST',        'CA Harmonized Sales Tax',      v_ct_hst,       82, 'active', v_su, v_meta),
    (v_tid, 'CA-WHT',        'CA Withholding Tax',           v_ct_wht,       83, 'active', v_su, v_meta),
    -- â”€â”€â”€ GERMANY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'DE-UST',        'DE Umsatzsteuer (VAT)',        v_ct_vat,       90, 'active', v_su, v_meta),
    (v_tid, 'DE-WHT',        'DE Kapitalertragsteuer (WHT)', v_ct_wht,       91, 'active', v_su, v_meta),
    (v_tid, 'DE-CUSTOMS',    'DE EU Customs Duty',           v_ct_customs,   92, 'active', v_su, v_meta),
    -- â”€â”€â”€ TAIWAN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'TW-VAT',        'TW Business Tax (VAT)',        v_ct_vat,      100, 'active', v_su, v_meta),
    (v_tid, 'TW-WHT',        'TW Withholding Tax',           v_ct_wht,      101, 'active', v_su, v_meta),
    -- â”€â”€â”€ SOUTH AFRICA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'ZA-VAT',        'ZA Value Added Tax',           v_ct_vat,      110, 'active', v_su, v_meta),
    (v_tid, 'ZA-WHT',        'ZA Dividends / Interest WHT',  v_ct_wht,      111, 'active', v_su, v_meta),
    (v_tid, 'ZA-MINING-ROY', 'ZA Mining Royalty',            v_ct_surcharge,112, 'active', v_su, v_meta),
    -- â”€â”€â”€ UNITED KINGDOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'GB-VAT',        'GB Value Added Tax',           v_ct_vat,      120, 'active', v_su, v_meta),
    (v_tid, 'GB-WHT',        'GB Income Tax (WHT)',          v_ct_wht,      121, 'active', v_su, v_meta),
    (v_tid, 'GB-CUSTOMS',    'GB Customs Duty',              v_ct_customs,  122, 'active', v_su, v_meta),
    -- â”€â”€â”€ JAPAN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'JP-CT',         'JP Consumption Tax',           v_ct_vat,      130, 'active', v_su, v_meta),
    (v_tid, 'JP-WHT',        'JP Withholding Tax',           v_ct_wht,      131, 'active', v_su, v_meta),
    -- â”€â”€â”€ PHILIPPINES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (v_tid, 'PH-VAT',        'PH Value Added Tax',           v_ct_vat,      140, 'active', v_su, v_meta),
    (v_tid, 'PH-EWT',        'PH Expanded WHT',              v_ct_wht,      141, 'active', v_su, v_meta),
    (v_tid, 'PH-FWT',        'PH Final WHT',                 v_ct_wht,      142, 'active', v_su, v_meta))
    INSERT INTO master.tax_type
        (tenant_id,code,name,tax_class,section_code_mode,condition_type_id,
         sort_order,status,created_by,metadata)
    SELECT tenant_id,code,name,
      CASE
        WHEN condition_type_id=v_ct_wht THEN 'withholding'
        WHEN condition_type_id=v_ct_customs THEN 'customs'
        WHEN condition_type_id=v_ct_surcharge THEN 'levy'
        ELSE 'indirect'
      END::master.tax_class_d,
      CASE
        WHEN code IN ('IN-TDS','IN-TCS','PH-EWT','PH-FWT') THEN 'required'
        WHEN condition_type_id=v_ct_wht THEN 'optional'
        ELSE 'not_used'
      END::master.tax_section_code_mode_d,
      condition_type_id,sort_order,status,created_by,metadata
    FROM seed_rows
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        tax_class = EXCLUDED.tax_class,
        section_code_mode = EXCLUDED.section_code_mode,
        condition_type_id = EXCLUDED.condition_type_id,
        sort_order = EXCLUDED.sort_order,
        status='active',updated_at = now(), updated_by = v_su
    WHERE (master.tax_type.name,
           master.tax_type.tax_class,master.tax_type.section_code_mode,
           master.tax_type.condition_type_id,
           master.tax_type.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name,EXCLUDED.tax_class,EXCLUDED.section_code_mode,
           EXCLUDED.condition_type_id,
           EXCLUDED.sort_order);

    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    -- ASSERTIONS
    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    -- A1: Total type count
    IF (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid) < 38
    THEN RAISE EXCEPTION '321 FAIL: expected â‰¥38 tax types, got %',
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
    --     one of {tax, withholding, charge} â€” these are the only kinds the
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

