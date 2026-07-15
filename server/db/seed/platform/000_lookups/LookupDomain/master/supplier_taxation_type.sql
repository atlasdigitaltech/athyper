-- Used by: master.party_tax_profile.taxation_type.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.supplier_taxation_type',
       'Supplier Taxation Type',
       'How the supplier is taxed in a given jurisdiction (standard, WHT, reverse charge, exempt).',
       'master', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'master.supplier_taxation_type'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',        'Standard',             'master.supplier_taxation_type', 'Standard taxation — VAT/GST charged at standard rate',          10),
    ('withholding',     'Withholding Tax',       'master.supplier_taxation_type', 'Buyer deducts WHT at source before remitting',                 20),
    ('reverse_charge',  'Reverse Charge',        'master.supplier_taxation_type', 'Tax liability reversed to buyer (cross-border services)',       30),
    ('zero_rated',      'Zero-Rated',            'master.supplier_taxation_type', 'Supply taxable at 0% (exports, certain necessities)',           40),
    ('exempt',          'Exempt',                'master.supplier_taxation_type', 'Supply is exempt from tax (no input credit clawback)',          50),
    ('out_of_scope',    'Out of Scope',          'master.supplier_taxation_type', 'Transaction outside tax scope (e.g. salary, donation)',         60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
