-- Used by: tax_jurisdiction.filing_frequency.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('monthly',        'Monthly',           'master.tax_filing_frequency', 'Returns filed every calendar month',                10),
    ('bimonthly',      'Bi-Monthly',        'master.tax_filing_frequency', 'Returns filed every two calendar months (e.g. TW)', 15),
    ('quarterly',      'Quarterly',         'master.tax_filing_frequency', 'Returns filed every calendar quarter',              20),
    ('semi_annually',  'Semi-Annually',     'master.tax_filing_frequency', 'Returns filed twice per year',                      30),
    ('annually',       'Annually',          'master.tax_filing_frequency', 'Returns filed once per fiscal/calendar year',       40),
    ('on_demand',      'On Demand',         'master.tax_filing_frequency', 'Filed on occurrence (e.g. withholding TDS)',        50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
