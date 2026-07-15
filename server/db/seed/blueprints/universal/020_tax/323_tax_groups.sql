-- Tax groups and components. Per-country shape:
--   sales group(s) + purchase group(s) + WHT group(s) + zero/exempt where applicable.
-- Recoverable VAT/GST countries get paired SALE + PURCHASE groups.
-- India GST groups are state-specific (TG-IN-TN-*, TG-IN-MH-*).
-- Component trs_key direction matches 322 (SALE/PURCHASE, not OUTPUT/INPUT).

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "323_org", "version": "2.1.0"}}'::jsonb;
    v_zero jsonb;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    v_zero := '{"_seed": {"pack": "323_org", "version": "2.1.0", "zero_rated": true}}'::jsonb;

    -- ══════════════════════════════════════════════════════════════════════
    -- C0: Remove stale tax groups not in the current canonical code set.
    --     Old seeds used different naming conventions (e.g. VAT_STD_US_7PCT).
    --     tax_group_component.tax_group_id is NOT NULL so components go first.
    -- ══════════════════════════════════════════════════════════════════════
    -- Nullify nullable FK columns that reference stale universal-seed groups
    -- before deleting. Tenant/country-specific groups can coexist with the
    -- universal foundation and must not be pruned by this file.
    -- scp_tax_group_fk had ON DELETE SET NULL on a composite (tenant_id, col) FK —
    -- that action also nulls tenant_id, violating NOT NULL. Explicit UPDATE is required.
    UPDATE master.company_code_supplier_profile
    SET tax_group_id = NULL
    WHERE tenant_id = v_tid
      AND tax_group_id IN (
          SELECT id FROM control.tax_group
          WHERE tenant_id = v_tid
            AND metadata->'_seed'->>'pack' = '323_org'
            AND code NOT IN (
              'TG-MY-SST-SALES-10','TG-MY-SST-SVC-6','TG-MY-EXEMPT','TG-MY-WHT-10',
              'TG-QA-EXEMPT','TG-QA-WHT-5',
              'TG-SA-VAT-15-OUT','TG-SA-VAT-15-IN','TG-SA-VAT-ZERO','TG-SA-ZAKAT','TG-SA-WHT-5',
              'TG-AE-VAT-5-OUT','TG-AE-VAT-5-IN','TG-AE-VAT-ZERO',
              'TG-US-CA-SALES','TG-US-WHT-30',
              'TG-SG-GST-9-OUT','TG-SG-GST-9-IN','TG-SG-GST-ZERO','TG-SG-WHT-15',
              'TG-IN-TN-GST-18-OUT','TG-IN-TN-GST-18-IN','TG-IN-TN-GST-5-OUT','TG-IN-TN-GST-5-IN',
              'TG-IN-MH-GST-18-OUT','TG-IN-MH-GST-18-IN','TG-IN-MH-GST-5-OUT','TG-IN-MH-GST-5-IN',
              'TG-IN-IGST-18-OUT','TG-IN-IGST-18-IN','TG-IN-TDS-10','TG-IN-TCS-GOODS','TG-IN-TCS-SCRAP',
              'TG-CA-GST-5-OUT','TG-CA-GST-5-IN','TG-CA-HST-13-OUT','TG-CA-HST-13-IN','TG-CA-WHT-25',
              'TG-DE-UST-19-OUT','TG-DE-UST-19-IN','TG-DE-UST-7-OUT','TG-DE-UST-7-IN','TG-DE-WHT-25',
              'TG-TW-VAT-5-OUT','TG-TW-VAT-5-IN','TG-TW-WHT-20',
              'TG-ZA-VAT-15-OUT','TG-ZA-VAT-15-IN','TG-ZA-VAT-ZERO',
              'TG-ZA-MINING-5','TG-ZA-WHT-DIV','TG-ZA-WHT-INT',
              'TG-GB-VAT-20-OUT','TG-GB-VAT-20-IN','TG-GB-VAT-5-OUT','TG-GB-VAT-5-IN',
              'TG-GB-VAT-ZERO','TG-GB-WHT-20',
              'TG-JP-CT-10-OUT','TG-JP-CT-10-IN','TG-JP-CT-8-OUT','TG-JP-CT-8-IN','TG-JP-WHT-20',
              'TG-PH-VAT-12-OUT','TG-PH-VAT-12-IN','TG-PH-EWT-GOODS','TG-PH-EWT-SVC','TG-PH-FWT-INT'
            ));

    UPDATE master.company_code_supplier_profile
    SET default_wht_tax_group_id = NULL
    WHERE tenant_id = v_tid
      AND default_wht_tax_group_id IN (
          SELECT id FROM control.tax_group
          WHERE tenant_id = v_tid
            AND metadata->'_seed'->>'pack' = '323_org'
            AND code NOT IN (
              'TG-MY-SST-SALES-10','TG-MY-SST-SVC-6','TG-MY-EXEMPT','TG-MY-WHT-10',
              'TG-QA-EXEMPT','TG-QA-WHT-5',
              'TG-SA-VAT-15-OUT','TG-SA-VAT-15-IN','TG-SA-VAT-ZERO','TG-SA-ZAKAT','TG-SA-WHT-5',
              'TG-AE-VAT-5-OUT','TG-AE-VAT-5-IN','TG-AE-VAT-ZERO',
              'TG-US-CA-SALES','TG-US-WHT-30',
              'TG-SG-GST-9-OUT','TG-SG-GST-9-IN','TG-SG-GST-ZERO','TG-SG-WHT-15',
              'TG-IN-TN-GST-18-OUT','TG-IN-TN-GST-18-IN','TG-IN-TN-GST-5-OUT','TG-IN-TN-GST-5-IN',
              'TG-IN-MH-GST-18-OUT','TG-IN-MH-GST-18-IN','TG-IN-MH-GST-5-OUT','TG-IN-MH-GST-5-IN',
              'TG-IN-IGST-18-OUT','TG-IN-IGST-18-IN','TG-IN-TDS-10','TG-IN-TCS-GOODS','TG-IN-TCS-SCRAP',
              'TG-CA-GST-5-OUT','TG-CA-GST-5-IN','TG-CA-HST-13-OUT','TG-CA-HST-13-IN','TG-CA-WHT-25',
              'TG-DE-UST-19-OUT','TG-DE-UST-19-IN','TG-DE-UST-7-OUT','TG-DE-UST-7-IN','TG-DE-WHT-25',
              'TG-TW-VAT-5-OUT','TG-TW-VAT-5-IN','TG-TW-WHT-20',
              'TG-ZA-VAT-15-OUT','TG-ZA-VAT-15-IN','TG-ZA-VAT-ZERO',
              'TG-ZA-MINING-5','TG-ZA-WHT-DIV','TG-ZA-WHT-INT',
              'TG-GB-VAT-20-OUT','TG-GB-VAT-20-IN','TG-GB-VAT-5-OUT','TG-GB-VAT-5-IN',
              'TG-GB-VAT-ZERO','TG-GB-WHT-20',
              'TG-JP-CT-10-OUT','TG-JP-CT-10-IN','TG-JP-CT-8-OUT','TG-JP-CT-8-IN','TG-JP-WHT-20',
              'TG-PH-VAT-12-OUT','TG-PH-VAT-12-IN','TG-PH-EWT-GOODS','TG-PH-EWT-SVC','TG-PH-FWT-INT'
            ));

    -- pil_tax_group_fk and pil_wht_group_fk are composite (tenant_id, col) ON DELETE SET NULL —
    -- that action also nulls tenant_id, violating NOT NULL. Explicit UPDATEs required.
    UPDATE document.purchase_invoice_line
    SET tax_group_id = NULL
    WHERE tenant_id = v_tid
      AND tax_group_id IN (
          SELECT id FROM control.tax_group
          WHERE tenant_id = v_tid
            AND metadata->'_seed'->>'pack' = '323_org'
            AND code NOT IN (
              'TG-MY-SST-SALES-10','TG-MY-SST-SVC-6','TG-MY-EXEMPT','TG-MY-WHT-10',
              'TG-QA-EXEMPT','TG-QA-WHT-5',
              'TG-SA-VAT-15-OUT','TG-SA-VAT-15-IN','TG-SA-VAT-ZERO','TG-SA-ZAKAT','TG-SA-WHT-5',
              'TG-AE-VAT-5-OUT','TG-AE-VAT-5-IN','TG-AE-VAT-ZERO',
              'TG-US-CA-SALES','TG-US-WHT-30',
              'TG-SG-GST-9-OUT','TG-SG-GST-9-IN','TG-SG-GST-ZERO','TG-SG-WHT-15',
              'TG-IN-TN-GST-18-OUT','TG-IN-TN-GST-18-IN','TG-IN-TN-GST-5-OUT','TG-IN-TN-GST-5-IN',
              'TG-IN-MH-GST-18-OUT','TG-IN-MH-GST-18-IN','TG-IN-MH-GST-5-OUT','TG-IN-MH-GST-5-IN',
              'TG-IN-IGST-18-OUT','TG-IN-IGST-18-IN','TG-IN-TDS-10','TG-IN-TCS-GOODS','TG-IN-TCS-SCRAP',
              'TG-CA-GST-5-OUT','TG-CA-GST-5-IN','TG-CA-HST-13-OUT','TG-CA-HST-13-IN','TG-CA-WHT-25',
              'TG-DE-UST-19-OUT','TG-DE-UST-19-IN','TG-DE-UST-7-OUT','TG-DE-UST-7-IN','TG-DE-WHT-25',
              'TG-TW-VAT-5-OUT','TG-TW-VAT-5-IN','TG-TW-WHT-20',
              'TG-ZA-VAT-15-OUT','TG-ZA-VAT-15-IN','TG-ZA-VAT-ZERO',
              'TG-ZA-MINING-5','TG-ZA-WHT-DIV','TG-ZA-WHT-INT',
              'TG-GB-VAT-20-OUT','TG-GB-VAT-20-IN','TG-GB-VAT-5-OUT','TG-GB-VAT-5-IN',
              'TG-GB-VAT-ZERO','TG-GB-WHT-20',
              'TG-JP-CT-10-OUT','TG-JP-CT-10-IN','TG-JP-CT-8-OUT','TG-JP-CT-8-IN','TG-JP-WHT-20',
              'TG-PH-VAT-12-OUT','TG-PH-VAT-12-IN','TG-PH-EWT-GOODS','TG-PH-EWT-SVC','TG-PH-FWT-INT'
            ));

    UPDATE document.purchase_invoice_line
    SET withholding_tax_group_id = NULL
    WHERE tenant_id = v_tid
      AND withholding_tax_group_id IN (
          SELECT id FROM control.tax_group
          WHERE tenant_id = v_tid
            AND metadata->'_seed'->>'pack' = '323_org'
            AND code NOT IN (
              'TG-MY-SST-SALES-10','TG-MY-SST-SVC-6','TG-MY-EXEMPT','TG-MY-WHT-10',
              'TG-QA-EXEMPT','TG-QA-WHT-5',
              'TG-SA-VAT-15-OUT','TG-SA-VAT-15-IN','TG-SA-VAT-ZERO','TG-SA-ZAKAT','TG-SA-WHT-5',
              'TG-AE-VAT-5-OUT','TG-AE-VAT-5-IN','TG-AE-VAT-ZERO',
              'TG-US-CA-SALES','TG-US-WHT-30',
              'TG-SG-GST-9-OUT','TG-SG-GST-9-IN','TG-SG-GST-ZERO','TG-SG-WHT-15',
              'TG-IN-TN-GST-18-OUT','TG-IN-TN-GST-18-IN','TG-IN-TN-GST-5-OUT','TG-IN-TN-GST-5-IN',
              'TG-IN-MH-GST-18-OUT','TG-IN-MH-GST-18-IN','TG-IN-MH-GST-5-OUT','TG-IN-MH-GST-5-IN',
              'TG-IN-IGST-18-OUT','TG-IN-IGST-18-IN','TG-IN-TDS-10','TG-IN-TCS-GOODS','TG-IN-TCS-SCRAP',
              'TG-CA-GST-5-OUT','TG-CA-GST-5-IN','TG-CA-HST-13-OUT','TG-CA-HST-13-IN','TG-CA-WHT-25',
              'TG-DE-UST-19-OUT','TG-DE-UST-19-IN','TG-DE-UST-7-OUT','TG-DE-UST-7-IN','TG-DE-WHT-25',
              'TG-TW-VAT-5-OUT','TG-TW-VAT-5-IN','TG-TW-WHT-20',
              'TG-ZA-VAT-15-OUT','TG-ZA-VAT-15-IN','TG-ZA-VAT-ZERO',
              'TG-ZA-MINING-5','TG-ZA-WHT-DIV','TG-ZA-WHT-INT',
              'TG-GB-VAT-20-OUT','TG-GB-VAT-20-IN','TG-GB-VAT-5-OUT','TG-GB-VAT-5-IN',
              'TG-GB-VAT-ZERO','TG-GB-WHT-20',
              'TG-JP-CT-10-OUT','TG-JP-CT-10-IN','TG-JP-CT-8-OUT','TG-JP-CT-8-IN','TG-JP-WHT-20',
              'TG-PH-VAT-12-OUT','TG-PH-VAT-12-IN','TG-PH-EWT-GOODS','TG-PH-EWT-SVC','TG-PH-FWT-INT'
            ));

    DELETE FROM control.tax_group_component
    WHERE tenant_id = v_tid
      AND tax_group_id IN (
          SELECT id FROM control.tax_group
          WHERE tenant_id = v_tid
            AND metadata->'_seed'->>'pack' = '323_org'
            AND code NOT IN (
              'TG-MY-SST-SALES-10','TG-MY-SST-SVC-6','TG-MY-EXEMPT','TG-MY-WHT-10',
              'TG-QA-EXEMPT','TG-QA-WHT-5',
              'TG-SA-VAT-15-OUT','TG-SA-VAT-15-IN','TG-SA-VAT-ZERO','TG-SA-ZAKAT','TG-SA-WHT-5',
              'TG-AE-VAT-5-OUT','TG-AE-VAT-5-IN','TG-AE-VAT-ZERO',
              'TG-US-CA-SALES','TG-US-WHT-30',
              'TG-SG-GST-9-OUT','TG-SG-GST-9-IN','TG-SG-GST-ZERO','TG-SG-WHT-15',
              'TG-IN-TN-GST-18-OUT','TG-IN-TN-GST-18-IN','TG-IN-TN-GST-5-OUT','TG-IN-TN-GST-5-IN',
              'TG-IN-MH-GST-18-OUT','TG-IN-MH-GST-18-IN','TG-IN-MH-GST-5-OUT','TG-IN-MH-GST-5-IN',
              'TG-IN-IGST-18-OUT','TG-IN-IGST-18-IN','TG-IN-TDS-10','TG-IN-TCS-GOODS','TG-IN-TCS-SCRAP',
              'TG-CA-GST-5-OUT','TG-CA-GST-5-IN','TG-CA-HST-13-OUT','TG-CA-HST-13-IN','TG-CA-WHT-25',
              'TG-DE-UST-19-OUT','TG-DE-UST-19-IN','TG-DE-UST-7-OUT','TG-DE-UST-7-IN','TG-DE-WHT-25',
              'TG-TW-VAT-5-OUT','TG-TW-VAT-5-IN','TG-TW-WHT-20',
              'TG-ZA-VAT-15-OUT','TG-ZA-VAT-15-IN','TG-ZA-VAT-ZERO',
              'TG-ZA-MINING-5','TG-ZA-WHT-DIV','TG-ZA-WHT-INT',
              'TG-GB-VAT-20-OUT','TG-GB-VAT-20-IN','TG-GB-VAT-5-OUT','TG-GB-VAT-5-IN',
              'TG-GB-VAT-ZERO','TG-GB-WHT-20',
              'TG-JP-CT-10-OUT','TG-JP-CT-10-IN','TG-JP-CT-8-OUT','TG-JP-CT-8-IN','TG-JP-WHT-20',
              'TG-PH-VAT-12-OUT','TG-PH-VAT-12-IN','TG-PH-EWT-GOODS','TG-PH-EWT-SVC','TG-PH-FWT-INT'
            ));

    DELETE FROM control.tax_group
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = '323_org'
      AND code NOT IN (
        'TG-MY-SST-SALES-10','TG-MY-SST-SVC-6','TG-MY-EXEMPT','TG-MY-WHT-10',
        'TG-QA-EXEMPT','TG-QA-WHT-5',
        'TG-SA-VAT-15-OUT','TG-SA-VAT-15-IN','TG-SA-VAT-ZERO','TG-SA-ZAKAT','TG-SA-WHT-5',
        'TG-AE-VAT-5-OUT','TG-AE-VAT-5-IN','TG-AE-VAT-ZERO',
        'TG-US-CA-SALES','TG-US-WHT-30',
        'TG-SG-GST-9-OUT','TG-SG-GST-9-IN','TG-SG-GST-ZERO','TG-SG-WHT-15',
        'TG-IN-TN-GST-18-OUT','TG-IN-TN-GST-18-IN','TG-IN-TN-GST-5-OUT','TG-IN-TN-GST-5-IN',
        'TG-IN-MH-GST-18-OUT','TG-IN-MH-GST-18-IN','TG-IN-MH-GST-5-OUT','TG-IN-MH-GST-5-IN',
        'TG-IN-IGST-18-OUT','TG-IN-IGST-18-IN','TG-IN-TDS-10','TG-IN-TCS-GOODS','TG-IN-TCS-SCRAP',
        'TG-CA-GST-5-OUT','TG-CA-GST-5-IN','TG-CA-HST-13-OUT','TG-CA-HST-13-IN','TG-CA-WHT-25',
        'TG-DE-UST-19-OUT','TG-DE-UST-19-IN','TG-DE-UST-7-OUT','TG-DE-UST-7-IN','TG-DE-WHT-25',
        'TG-TW-VAT-5-OUT','TG-TW-VAT-5-IN','TG-TW-WHT-20',
        'TG-ZA-VAT-15-OUT','TG-ZA-VAT-15-IN','TG-ZA-VAT-ZERO',
        'TG-ZA-MINING-5','TG-ZA-WHT-DIV','TG-ZA-WHT-INT',
        'TG-GB-VAT-20-OUT','TG-GB-VAT-20-IN','TG-GB-VAT-5-OUT','TG-GB-VAT-5-IN',
        'TG-GB-VAT-ZERO','TG-GB-WHT-20',
        'TG-JP-CT-10-OUT','TG-JP-CT-10-IN','TG-JP-CT-8-OUT','TG-JP-CT-8-IN','TG-JP-WHT-20',
        'TG-PH-VAT-12-OUT','TG-PH-VAT-12-IN','TG-PH-EWT-GOODS','TG-PH-EWT-SVC','TG-PH-FWT-INT'
      );

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE A: Tax group headers
    -- Convention: -OUT = sales/output, -IN = purchase/input recovery
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO control.tax_group
        (tenant_id, code, name, description, is_compound, status, created_by, metadata)
    VALUES
    -- ─── MALAYSIA (SST — not recoverable, sale only) ────────────────────
    (v_tid, 'TG-MY-SST-SALES-10','MY SST Sales 10%',    'Sales tax on goods',     false,'active',v_su,v_meta),
    (v_tid, 'TG-MY-SST-SVC-6',   'MY SST Service 6%',   'Service tax',            false,'active',v_su,v_meta),
    (v_tid, 'TG-MY-EXEMPT',       'MY Exempt',            'No SST applicable',     false,'active',v_su,v_zero),
    (v_tid, 'TG-MY-WHT-10',       'MY WHT Standard 10%', 'Standard withholding',   false,'active',v_su,v_meta),

    -- ─── QATAR ──────────────────────────────────────────────────────────
    (v_tid, 'TG-QA-EXEMPT',       'QA No Tax',            'Qatar — no indirect',   false,'active',v_su,v_zero),
    (v_tid, 'TG-QA-WHT-5',        'QA WHT 5%',           'Qatar withholding',      false,'active',v_su,v_meta),

    -- ─── SAUDI ARABIA (paired sale + purchase) ──────────────────────────
    (v_tid, 'TG-SA-VAT-15-OUT',   'SA VAT 15% Output',   'Sales VAT 15%',          false,'active',v_su,v_meta),
    (v_tid, 'TG-SA-VAT-15-IN',    'SA VAT 15% Input',    'Purchase VAT 15% recovery',false,'active',v_su,v_meta),
    (v_tid, 'TG-SA-VAT-ZERO',     'SA VAT Zero-rated',   'Zero-rated exports',     false,'active',v_su,v_zero),
    (v_tid, 'TG-SA-ZAKAT',        'SA Zakat 2.5%',       'Annual zakat',           false,'active',v_su,v_meta),
    (v_tid, 'TG-SA-WHT-5',        'SA WHT Standard 5%',  'Standard WHT',           false,'active',v_su,v_meta),

    -- ─── UAE (paired) ───────────────────────────────────────────────────
    (v_tid, 'TG-AE-VAT-5-OUT',    'AE VAT 5% Output',    'Sales VAT 5%',           false,'active',v_su,v_meta),
    (v_tid, 'TG-AE-VAT-5-IN',     'AE VAT 5% Input',     'Purchase VAT 5% recovery',false,'active',v_su,v_meta),
    (v_tid, 'TG-AE-VAT-ZERO',     'AE VAT Zero-rated',   'Zero-rated',             false,'active',v_su,v_zero),

    -- ─── US ─────────────────────────────────────────────────────────────
    (v_tid, 'TG-US-CA-SALES',     'US CA Sales Tax 7.25%','California sales tax',   false,'active',v_su,v_meta),
    (v_tid, 'TG-US-WHT-30',       'US Federal WHT 30%',  'Federal WHT non-resident',false,'active',v_su,v_meta),

    -- ─── SINGAPORE (paired) ────────────────────────────────────────────
    (v_tid, 'TG-SG-GST-9-OUT',    'SG GST 9% Output',    'Sales GST 9%',           false,'active',v_su,v_meta),
    (v_tid, 'TG-SG-GST-9-IN',     'SG GST 9% Input',     'Purchase GST 9% recovery',false,'active',v_su,v_meta),
    (v_tid, 'TG-SG-GST-ZERO',     'SG GST Zero-rated',   'Zero-rated exports',     false,'active',v_su,v_zero),
    (v_tid, 'TG-SG-WHT-15',       'SG WHT 15%',          'Non-resident WHT',       false,'active',v_su,v_meta),

    -- ─── INDIA (state-specific compound groups) ─────────────────────────
    -- Tamil Nadu intra-state
    (v_tid, 'TG-IN-TN-GST-18-OUT','IN TN GST 18% Output','CGST 9% + TN SGST 9% output', true,'active',v_su,v_meta),
    (v_tid, 'TG-IN-TN-GST-18-IN', 'IN TN GST 18% Input', 'CGST 9% + TN SGST 9% input',  true,'active',v_su,v_meta),
    (v_tid, 'TG-IN-TN-GST-5-OUT', 'IN TN GST 5% Output', 'CGST 2.5% + TN SGST 2.5% output',true,'active',v_su,v_meta),
    (v_tid, 'TG-IN-TN-GST-5-IN',  'IN TN GST 5% Input',  'CGST 2.5% + TN SGST 2.5% input', true,'active',v_su,v_meta),
    -- Maharashtra intra-state
    (v_tid, 'TG-IN-MH-GST-18-OUT','IN MH GST 18% Output','CGST 9% + MH SGST 9% output',   true,'active',v_su,v_meta),
    (v_tid, 'TG-IN-MH-GST-18-IN', 'IN MH GST 18% Input', 'CGST 9% + MH SGST 9% input',    true,'active',v_su,v_meta),
    (v_tid, 'TG-IN-MH-GST-5-OUT', 'IN MH GST 5% Output', 'CGST 2.5% + MH SGST 2.5% output',true,'active',v_su,v_meta),
    (v_tid, 'TG-IN-MH-GST-5-IN',  'IN MH GST 5% Input',  'CGST 2.5% + MH SGST 2.5% input', true,'active',v_su,v_meta),
    -- Inter-state (no SGST, single IGST)
    (v_tid, 'TG-IN-IGST-18-OUT',  'IN IGST 18% Output',  'Inter-state output',       false,'active',v_su,v_meta),
    (v_tid, 'TG-IN-IGST-18-IN',   'IN IGST 18% Input',   'Inter-state input',        false,'active',v_su,v_meta),
    (v_tid, 'TG-IN-TDS-10',       'IN TDS Standard 10%', 'TDS professional svc',     false,'active',v_su,v_meta),
    -- TCS (Tax Collected at Source — seller collects from buyer)
    (v_tid, 'TG-IN-TCS-GOODS',    'IN TCS Goods 0.1%',   'TCS on goods sales >₹50L', false,'active',v_su,v_meta),
    (v_tid, 'TG-IN-TCS-SCRAP',    'IN TCS Scrap 1%',     'TCS on scrap sales',       false,'active',v_su,v_meta),

    -- ─── CANADA (paired) ───────────────────────────────────────────────
    (v_tid, 'TG-CA-GST-5-OUT',    'CA GST 5% Output',    'Sales GST',              false,'active',v_su,v_meta),
    (v_tid, 'TG-CA-GST-5-IN',     'CA GST 5% Input',     'Purchase GST recovery',  false,'active',v_su,v_meta),
    (v_tid, 'TG-CA-HST-13-OUT',   'CA HST 13% Output',   'HST output (ON/NB/NS/NL/PE)', false,'active',v_su,v_meta),
    (v_tid, 'TG-CA-HST-13-IN',    'CA HST 13% Input',    'HST input recovery',     false,'active',v_su,v_meta),
    (v_tid, 'TG-CA-WHT-25',       'CA WHT 25%',          'Non-resident WHT',       false,'active',v_su,v_meta),

    -- ─── GERMANY (paired) ──────────────────────────────────────────────
    (v_tid, 'TG-DE-UST-19-OUT',   'DE USt 19% Output',   'Standard Vorsteuer output',false,'active',v_su,v_meta),
    (v_tid, 'TG-DE-UST-19-IN',    'DE USt 19% Input',    'Standard Vorsteuer input', false,'active',v_su,v_meta),
    (v_tid, 'TG-DE-UST-7-OUT',    'DE USt 7% Output',    'Reduced output',         false,'active',v_su,v_meta),
    (v_tid, 'TG-DE-UST-7-IN',     'DE USt 7% Input',     'Reduced input',          false,'active',v_su,v_meta),
    (v_tid, 'TG-DE-WHT-25',       'DE KESt 25%',         'Capital gains WHT',      false,'active',v_su,v_meta),

    -- ─── TAIWAN (paired) ───────────────────────────────────────────────
    (v_tid, 'TG-TW-VAT-5-OUT',    'TW VAT 5% Output',    'Business tax output',    false,'active',v_su,v_meta),
    (v_tid, 'TG-TW-VAT-5-IN',     'TW VAT 5% Input',     'Business tax input',     false,'active',v_su,v_meta),
    (v_tid, 'TG-TW-WHT-20',       'TW WHT 20%',          'Non-resident WHT',       false,'active',v_su,v_meta),

    -- ─── SOUTH AFRICA (paired) ──────────────────────────────────────────
    (v_tid, 'TG-ZA-VAT-15-OUT',   'ZA VAT 15% Output',   'Standard output',        false,'active',v_su,v_meta),
    (v_tid, 'TG-ZA-VAT-15-IN',    'ZA VAT 15% Input',    'Standard input recovery', false,'active',v_su,v_meta),
    (v_tid, 'TG-ZA-VAT-ZERO',     'ZA VAT Zero-rated',   'Zero-rated exports/food',false,'active',v_su,v_zero),
    (v_tid, 'TG-ZA-MINING-5',     'ZA Mining Royalty 5%', 'Crude petroleum royalty', false,'active',v_su,v_meta),
    (v_tid, 'TG-ZA-WHT-DIV',      'ZA WHT Dividends 20%','Dividends tax WHT',       false,'active',v_su,v_meta),
    (v_tid, 'TG-ZA-WHT-INT',      'ZA WHT Interest 15%', 'Interest WHT',            false,'active',v_su,v_meta),

    -- ─── UK (paired) ───────────────────────────────────────────────────
    (v_tid, 'TG-GB-VAT-20-OUT',   'GB VAT 20% Output',   'Standard output',        false,'active',v_su,v_meta),
    (v_tid, 'TG-GB-VAT-20-IN',    'GB VAT 20% Input',    'Standard input recovery', false,'active',v_su,v_meta),
    (v_tid, 'TG-GB-VAT-5-OUT',    'GB VAT 5% Output',    'Reduced output',         false,'active',v_su,v_meta),
    (v_tid, 'TG-GB-VAT-5-IN',     'GB VAT 5% Input',     'Reduced input recovery', false,'active',v_su,v_meta),
    (v_tid, 'TG-GB-VAT-ZERO',     'GB VAT Zero-rated',   'Zero-rated exports/food',false,'active',v_su,v_zero),
    (v_tid, 'TG-GB-WHT-20',       'GB Income Tax WHT 20%','Non-resident income WHT', false,'active',v_su,v_meta),

    -- ─── JAPAN (paired) ────────────────────────────────────────────────
    (v_tid, 'TG-JP-CT-10-OUT',    'JP CT 10% Output',    'Standard output',        false,'active',v_su,v_meta),
    (v_tid, 'TG-JP-CT-10-IN',     'JP CT 10% Input',     'Standard input recovery', false,'active',v_su,v_meta),
    (v_tid, 'TG-JP-CT-8-OUT',     'JP CT 8% Output',     'Reduced output (food)',  false,'active',v_su,v_meta),
    (v_tid, 'TG-JP-CT-8-IN',      'JP CT 8% Input',      'Reduced input (food)',   false,'active',v_su,v_meta),
    (v_tid, 'TG-JP-WHT-20',       'JP WHT 20.42%',       'Non-resident WHT',       false,'active',v_su,v_meta),

    -- ─── PHILIPPINES (paired) ──────────────────────────────────────────
    (v_tid, 'TG-PH-VAT-12-OUT',   'PH VAT 12% Output',   'Standard output',       false,'active',v_su,v_meta),
    (v_tid, 'TG-PH-VAT-12-IN',    'PH VAT 12% Input',    'Standard input recovery',false,'active',v_su,v_meta),
    (v_tid, 'TG-PH-EWT-GOODS',    'PH EWT Goods 1%',     'Expanded WHT on goods', false,'active',v_su,v_meta),
    (v_tid, 'TG-PH-EWT-SVC',      'PH EWT Services 2%',  'Expanded WHT on services',false,'active',v_su,v_meta),
    (v_tid, 'TG-PH-FWT-INT',      'PH FWT Interest 20%', 'Final WHT on interest income',false,'active',v_su,v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        is_compound = EXCLUDED.is_compound, metadata = EXCLUDED.metadata,
        updated_at = now(), updated_by = v_su
    WHERE (control.tax_group.name, control.tax_group.description,
           control.tax_group.is_compound, control.tax_group.metadata)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.is_compound, EXCLUDED.metadata);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: Tax group components (group → rate_schedule)
    -- ══════════════════════════════════════════════════════════════════════
    CREATE TEMP TABLE tmp_tg ON COMMIT DROP AS SELECT code, id FROM control.tax_group WHERE tenant_id = v_tid;

    -- Build schedule lookup: tj_code|tt_code|direction|component → id
    CREATE TEMP TABLE tmp_trs ON COMMIT DROP AS
    SELECT
        tj.code || '|' || tt.code || '|' || trs.tax_direction
            || '|' || COALESCE(trs.component_code, '') AS key,
        trs.id
    FROM control.tax_rate_schedule trs
    JOIN master.tax_jurisdiction tj ON tj.id = trs.jurisdiction_id
    JOIN master.tax_type tt ON tt.id = trs.tax_type_id
    WHERE trs.tenant_id = v_tid AND trs.is_active = true
      AND trs.metadata->'_seed'->>'pack' = '322_org';

    -- Purge existing components for canonical groups before re-seeding.
    -- Required for idempotency: prevents tgc_group_seq_uq violations when
    -- 322 has replaced schedule IDs but leftover components still hold old seqs.
    DELETE FROM control.tax_group_component
    WHERE tenant_id = v_tid
      AND tax_group_id IN (SELECT id FROM tmp_tg);

    INSERT INTO control.tax_group_component
        (tenant_id, tax_group_id, tax_rate_schedule_id, calculation_seq,
         status, created_by, metadata)
    SELECT v_tid, tg.id, trs.id, v.seq, 'active', v_su, v_meta
    FROM (VALUES
    -- MY (sale only — SST not recoverable)
    ('TG-MY-SST-SALES-10','TJ-MY|MY-SST-SALES|SALE|',           1),
    ('TG-MY-SST-SVC-6',   'TJ-MY|MY-SST-SVC|SALE|',             1),
    ('TG-MY-WHT-10',      'TJ-MY|MY-WHT|SALE|standard',          1),
    -- QA
    ('TG-QA-WHT-5',       'TJ-QA|QA-WHT|SALE|standard',          1),
    -- SA (sale + purchase paired)
    ('TG-SA-VAT-15-OUT',  'TJ-SA|SA-VAT|SALE|',                   1),
    ('TG-SA-VAT-15-IN',   'TJ-SA|SA-VAT|PURCHASE|',               1),
    ('TG-SA-ZAKAT',        'TJ-SA|SA-ZAKAT|SALE|',                 1),
    ('TG-SA-WHT-5',       'TJ-SA|SA-WHT|SALE|standard',           1),
    -- AE
    ('TG-AE-VAT-5-OUT',   'TJ-AE|AE-VAT|SALE|',                  1),
    ('TG-AE-VAT-5-IN',    'TJ-AE|AE-VAT|PURCHASE|',              1),
    -- US
    ('TG-US-CA-SALES',    'TJ-US-CA|US-SALES|SALE|',              1),
    ('TG-US-WHT-30',      'TJ-US|US-WHT|SALE|standard',           1),
    -- SG
    ('TG-SG-GST-9-OUT',   'TJ-SG|SG-GST|SALE|',                  1),
    ('TG-SG-GST-9-IN',    'TJ-SG|SG-GST|PURCHASE|',              1),
    ('TG-SG-WHT-15',      'TJ-SG|SG-WHT|SALE|standard',          1),
    -- IN Tamil Nadu compound (CGST seq 1 + TN-SGST seq 2)
    ('TG-IN-TN-GST-18-OUT','TJ-IN|IN-CGST|SALE|std-18',          1),
    ('TG-IN-TN-GST-18-OUT','TJ-IN-TN|IN-SGST|SALE|std-18',       2),
    ('TG-IN-TN-GST-18-IN', 'TJ-IN|IN-CGST|PURCHASE|std-18',      1),
    ('TG-IN-TN-GST-18-IN', 'TJ-IN-TN|IN-SGST|PURCHASE|std-18',   2),
    ('TG-IN-TN-GST-5-OUT', 'TJ-IN|IN-CGST|SALE|red-5',           1),
    ('TG-IN-TN-GST-5-OUT', 'TJ-IN-TN|IN-SGST|SALE|red-5',        2),
    ('TG-IN-TN-GST-5-IN',  'TJ-IN|IN-CGST|PURCHASE|red-5',       1),
    ('TG-IN-TN-GST-5-IN',  'TJ-IN-TN|IN-SGST|PURCHASE|red-5',    2),
    -- IN Maharashtra compound (18%)
    ('TG-IN-MH-GST-18-OUT','TJ-IN|IN-CGST|SALE|std-18',          1),
    ('TG-IN-MH-GST-18-OUT','TJ-IN-MH|IN-SGST|SALE|std-18',       2),
    ('TG-IN-MH-GST-18-IN', 'TJ-IN|IN-CGST|PURCHASE|std-18',      1),
    ('TG-IN-MH-GST-18-IN', 'TJ-IN-MH|IN-SGST|PURCHASE|std-18',   2),
    -- IN Maharashtra compound (5%)
    ('TG-IN-MH-GST-5-OUT', 'TJ-IN|IN-CGST|SALE|red-5',           1),
    ('TG-IN-MH-GST-5-OUT', 'TJ-IN-MH|IN-SGST|SALE|red-5',        2),
    ('TG-IN-MH-GST-5-IN',  'TJ-IN|IN-CGST|PURCHASE|red-5',       1),
    ('TG-IN-MH-GST-5-IN',  'TJ-IN-MH|IN-SGST|PURCHASE|red-5',    2),
    -- IN inter-state
    ('TG-IN-IGST-18-OUT',  'TJ-IN|IN-IGST|SALE|std-18',          1),
    ('TG-IN-IGST-18-IN',   'TJ-IN|IN-IGST|PURCHASE|std-18',      1),
    ('TG-IN-TDS-10',       'TJ-IN|IN-TDS|SALE|standard',          1),
    -- IN TCS (Tax Collected at Source)
    ('TG-IN-TCS-GOODS',    'TJ-IN|IN-TCS|SALE|goods',             1),
    ('TG-IN-TCS-SCRAP',    'TJ-IN|IN-TCS|SALE|scrap',             1),
    -- CA
    ('TG-CA-GST-5-OUT',   'TJ-CA|CA-GST|SALE|',                   1),
    ('TG-CA-GST-5-IN',    'TJ-CA|CA-GST|PURCHASE|',               1),
    ('TG-CA-HST-13-OUT',  'TJ-CA|CA-HST|SALE|standard',           1),
    ('TG-CA-HST-13-IN',   'TJ-CA|CA-HST|PURCHASE|standard',       1),
    ('TG-CA-WHT-25',      'TJ-CA|CA-WHT|SALE|standard',           1),
    -- DE
    ('TG-DE-UST-19-OUT',  'TJ-DE|DE-UST|SALE|standard',           1),
    ('TG-DE-UST-19-IN',   'TJ-DE|DE-UST|PURCHASE|standard',       1),
    ('TG-DE-UST-7-OUT',   'TJ-DE|DE-UST|SALE|reduced',            1),
    ('TG-DE-UST-7-IN',    'TJ-DE|DE-UST|PURCHASE|reduced',        1),
    ('TG-DE-WHT-25',      'TJ-DE|DE-WHT|SALE|standard',           1),
    -- TW
    ('TG-TW-VAT-5-OUT',   'TJ-TW|TW-VAT|SALE|',                  1),
    ('TG-TW-VAT-5-IN',    'TJ-TW|TW-VAT|PURCHASE|',              1),
    ('TG-TW-WHT-20',      'TJ-TW|TW-WHT|SALE|standard',          1),
    -- ZA
    ('TG-ZA-VAT-15-OUT',  'TJ-ZA|ZA-VAT|SALE|',                  1),
    ('TG-ZA-VAT-15-IN',   'TJ-ZA|ZA-VAT|PURCHASE|',              1),
    ('TG-ZA-MINING-5',    'TJ-ZA|ZA-MINING-ROY|SALE|crude',       1),
    ('TG-ZA-WHT-DIV',     'TJ-ZA|ZA-WHT|SALE|dividends',          1),
    ('TG-ZA-WHT-INT',     'TJ-ZA|ZA-WHT|SALE|interest',           1),
    -- GB
    ('TG-GB-VAT-20-OUT',  'TJ-GB|GB-VAT|SALE|standard',           1),
    ('TG-GB-VAT-20-IN',   'TJ-GB|GB-VAT|PURCHASE|standard',       1),
    ('TG-GB-VAT-5-OUT',   'TJ-GB|GB-VAT|SALE|reduced',            1),
    ('TG-GB-VAT-5-IN',    'TJ-GB|GB-VAT|PURCHASE|reduced',        1),
    ('TG-GB-WHT-20',      'TJ-GB|GB-WHT|SALE|standard',           1),
    -- JP
    ('TG-JP-CT-10-OUT',   'TJ-JP|JP-CT|SALE|standard',            1),
    ('TG-JP-CT-10-IN',    'TJ-JP|JP-CT|PURCHASE|standard',        1),
    ('TG-JP-CT-8-OUT',    'TJ-JP|JP-CT|SALE|reduced',             1),
    ('TG-JP-CT-8-IN',     'TJ-JP|JP-CT|PURCHASE|reduced',         1),
    ('TG-JP-WHT-20',      'TJ-JP|JP-WHT|SALE|standard',           1),
    -- PH
    ('TG-PH-VAT-12-OUT',  'TJ-PH|PH-VAT|SALE|',                  1),
    ('TG-PH-VAT-12-IN',   'TJ-PH|PH-VAT|PURCHASE|',              1),
    ('TG-PH-EWT-GOODS',   'TJ-PH|PH-EWT|SALE|goods',             1),
    ('TG-PH-EWT-SVC',     'TJ-PH|PH-EWT|SALE|services',          1),
    ('TG-PH-FWT-INT',     'TJ-PH|PH-FWT|SALE|interest',          1)
    ) AS v(tg_code, trs_key, seq)
    JOIN tmp_tg tg ON tg.code = v.tg_code
    JOIN tmp_trs trs ON trs.key = v.trs_key
    ON CONFLICT (tax_group_id, tax_rate_schedule_id) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Every seed-managed non-zero-rated group has at least 1 component.
    -- Scoped to 323_org groups to exclude stale rows from prior seed versions.
    IF EXISTS (
        SELECT tg.code FROM control.tax_group tg
        WHERE tg.tenant_id = v_tid
          AND tg.metadata->'_seed'->>'pack' = '323_org'
          AND NOT COALESCE((tg.metadata->'_seed'->>'zero_rated')::boolean, false)
          AND NOT EXISTS (
              SELECT 1 FROM control.tax_group_component tgc
              WHERE tgc.tax_group_id = tg.id AND tgc.tenant_id = tg.tenant_id)
    ) THEN RAISE EXCEPTION '323 FAIL: non-zero group with no components: %',
        (SELECT string_agg(tg.code, ', ') FROM control.tax_group tg
         WHERE tg.tenant_id = v_tid
           AND tg.metadata->'_seed'->>'pack' = '323_org'
           AND NOT COALESCE((tg.metadata->'_seed'->>'zero_rated')::boolean, false)
           AND NOT EXISTS (
               SELECT 1 FROM control.tax_group_component tgc
               WHERE tgc.tax_group_id = tg.id AND tgc.tenant_id = tg.tenant_id));
    END IF;

    -- A2: Every zero-rated group has NO components
    IF EXISTS (
        SELECT tg.code FROM control.tax_group tg
        WHERE tg.tenant_id = v_tid
          AND COALESCE((tg.metadata->'_seed'->>'zero_rated')::boolean, false)
          AND EXISTS (
              SELECT 1 FROM control.tax_group_component tgc
              WHERE tgc.tax_group_id = tg.id AND tgc.tenant_id = tg.tenant_id)
    ) THEN RAISE EXCEPTION '323 FAIL: zero-rated group should have no components'; END IF;

    -- A3: No component references a missing schedule
    IF EXISTS (
        SELECT tgc.id FROM control.tax_group_component tgc
        WHERE tgc.tenant_id = v_tid
          AND NOT EXISTS (
              SELECT 1 FROM control.tax_rate_schedule trs
              WHERE trs.id = tgc.tax_rate_schedule_id AND trs.tenant_id = tgc.tenant_id)
    ) THEN RAISE EXCEPTION '323 FAIL: component references missing schedule'; END IF;

    -- A4: Seed-managed compound groups have exactly 2 components each
    IF EXISTS (
        SELECT tg.code, count(tgc.id) FROM control.tax_group tg
        JOIN control.tax_group_component tgc ON tgc.tax_group_id = tg.id
        WHERE tg.tenant_id = v_tid AND tg.is_compound = true
          AND tg.metadata->'_seed'->>'pack' = '323_org'
        GROUP BY tg.code HAVING count(tgc.id) != 2
    ) THEN RAISE EXCEPTION '323 FAIL: compound group without exactly 2 components'; END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: backfill tax_group.jurisdiction_id (Phase 2)
    -- Each group's scope jurisdiction derives from its code prefix:
    --   TG-IN-TN-* → TJ-IN-TN, TG-IN-MH-* → TJ-IN-MH, TG-IN-IGST-* → TJ-IN,
    --   TG-IN-TDS/TCS → TJ-IN, TG-US-CA-* → TJ-US-CA, rest → country code.
    -- ══════════════════════════════════════════════════════════════════════
    UPDATE control.tax_group tg
       SET jurisdiction_id = tj.id,
           updated_at = now(),
           updated_by = v_su
      FROM master.tax_jurisdiction tj
     WHERE tg.tenant_id = v_tid
       AND tj.tenant_id = v_tid
       AND tg.metadata->'_seed'->>'pack' = '323_org'
       AND tj.code = CASE
           WHEN tg.code LIKE 'TG-IN-TN-%'    THEN 'TJ-IN-TN'
           WHEN tg.code LIKE 'TG-IN-MH-%'    THEN 'TJ-IN-MH'
           WHEN tg.code LIKE 'TG-US-CA-%'    THEN 'TJ-US-CA'
           WHEN tg.code LIKE 'TG-MY-%'       THEN 'TJ-MY'
           WHEN tg.code LIKE 'TG-QA-%'       THEN 'TJ-QA'
           WHEN tg.code LIKE 'TG-SA-%'       THEN 'TJ-SA'
           WHEN tg.code LIKE 'TG-AE-%'       THEN 'TJ-AE'
           WHEN tg.code LIKE 'TG-US-%'       THEN 'TJ-US'
           WHEN tg.code LIKE 'TG-SG-%'       THEN 'TJ-SG'
           WHEN tg.code LIKE 'TG-IN-%'       THEN 'TJ-IN'
           WHEN tg.code LIKE 'TG-CA-%'       THEN 'TJ-CA'
           WHEN tg.code LIKE 'TG-DE-%'       THEN 'TJ-DE'
           WHEN tg.code LIKE 'TG-TW-%'       THEN 'TJ-TW'
           WHEN tg.code LIKE 'TG-ZA-%'       THEN 'TJ-ZA'
           WHEN tg.code LIKE 'TG-GB-%'       THEN 'TJ-GB'
           WHEN tg.code LIKE 'TG-JP-%'       THEN 'TJ-JP'
           WHEN tg.code LIKE 'TG-PH-%'       THEN 'TJ-PH'
       END
       AND (tg.jurisdiction_id IS DISTINCT FROM tj.id);

    -- A5: every 323_org-seeded group must now have a jurisdiction
    IF EXISTS (
        SELECT 1 FROM control.tax_group tg
        WHERE tg.tenant_id = v_tid
          AND tg.metadata->'_seed'->>'pack' = '323_org'
          AND tg.jurisdiction_id IS NULL
    ) THEN
        RAISE EXCEPTION '323 FAIL: % group(s) missing jurisdiction_id backfill: %',
            (SELECT count(*) FROM control.tax_group tg
              WHERE tg.tenant_id = v_tid AND tg.metadata->'_seed'->>'pack' = '323_org'
                AND tg.jurisdiction_id IS NULL),
            (SELECT string_agg(code, ', ' ORDER BY code) FROM control.tax_group tg
              WHERE tg.tenant_id = v_tid AND tg.metadata->'_seed'->>'pack' = '323_org'
                AND tg.jurisdiction_id IS NULL);
    END IF;

    RAISE NOTICE '323: % groups (% with components, % zero-rated), % components total',
        (SELECT count(*) FROM control.tax_group WHERE tenant_id = v_tid),
        (SELECT count(*) FROM control.tax_group tg WHERE tg.tenant_id = v_tid
           AND NOT COALESCE((tg.metadata->'_seed'->>'zero_rated')::boolean, false)),
        (SELECT count(*) FROM control.tax_group tg WHERE tg.tenant_id = v_tid
           AND COALESCE((tg.metadata->'_seed'->>'zero_rated')::boolean, false)),
        (SELECT count(*) FROM control.tax_group_component WHERE tenant_id = v_tid);
END $seed$;
