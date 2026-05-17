-- LookupDomain/master/tax_category.sql
-- Lookup values for domain: master.tax_category
-- Used by: tax_type.category
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('income',      'Income Tax',       'master.tax_category', 'Tax levied on earnings of individuals and corporations', 10),
    ('sales',       'Sales Tax',        'master.tax_category', 'Tax on sale of goods and services at point of sale',     20),
    ('vat',         'VAT',              'master.tax_category', 'Value Added Tax collected at each production stage',     30),
    ('gst',         'GST',              'master.tax_category', 'Goods and Services Tax (unified indirect tax)',          40),
    ('withholding', 'Withholding Tax',  'master.tax_category', 'Tax withheld at source on payments (TDS/TCS)',          50),
    ('excise',      'Excise Duty',      'master.tax_category', 'Tax on manufacture or sale of specific goods',          60),
    ('customs',     'Customs Duty',     'master.tax_category', 'Tax on imported/exported goods',                        70),
    ('payroll',     'Payroll Tax',      'master.tax_category', 'Employment / social contribution taxes',                 80),
    ('property',    'Property Tax',     'master.tax_category', 'Tax levied on real property ownership',                 90),
    ('stamp_duty',  'Stamp Duty',       'master.tax_category', 'Tax on legal documents, contracts, or transactions',   100)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
