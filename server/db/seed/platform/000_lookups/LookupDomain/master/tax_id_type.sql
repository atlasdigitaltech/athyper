INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('vat',   'VAT',   'master.tax_id_type', 'Value Added Tax registration',                    10),
    ('gst',   'GST',   'master.tax_id_type', 'Goods & Services Tax registration',               20),
    ('tin',   'TIN',   'master.tax_id_type', 'Taxpayer Identification Number',                   30),
    ('ein',   'EIN',   'master.tax_id_type', 'Employer Identification Number (US)',              40),
    ('abn',   'ABN',   'master.tax_id_type', 'Australian Business Number',                      50),
    ('sst',   'SST',   'master.tax_id_type', 'Sales & Service Tax (Malaysia)',                   60),
    ('crn',   'CRN',   'master.tax_id_type', 'Commercial Registration Number (GCC)',            70),
    ('pan',   'PAN',   'master.tax_id_type', 'Permanent Account Number (India)',                80),
    ('utr',   'UTR',   'master.tax_id_type', 'Unique Taxpayer Reference (UK)',                  90),
    ('other', 'Other', 'master.tax_id_type', 'Jurisdiction-specific identifier not listed',     100)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
