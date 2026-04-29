-- LookupDomain/master/supplier_tax_classification.sql
-- Lookup domain + values for: master.supplier_tax_classification
-- Used by: master.supplier_tax_profile.tax_classification
-- Idempotent: WHERE NOT EXISTS guards

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.supplier_tax_classification',
       'Supplier Tax Classification',
       'Tax entity classification for a supplier in a given jurisdiction.',
       'master', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'master.supplier_tax_classification'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('company',         'Company',              'master.supplier_tax_classification', 'Incorporated company subject to corporate tax',    10),
    ('individual',      'Individual',           'master.supplier_tax_classification', 'Natural person / sole trader',                     20),
    ('partnership',     'Partnership',          'master.supplier_tax_classification', 'Partnership entity',                               30),
    ('government',      'Government',           'master.supplier_tax_classification', 'Government body or statutory authority',           40),
    ('non_profit',      'Non-Profit / NGO',     'master.supplier_tax_classification', 'Charitable or non-profit organisation',            50),
    ('exempt',          'Tax Exempt',           'master.supplier_tax_classification', 'Entity with formal tax-exempt status',             60),
    ('other',           'Other',                'master.supplier_tax_classification', 'Classification not otherwise listed',              70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
