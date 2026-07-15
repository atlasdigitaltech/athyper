INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('master.business_partner_extension_type',
     'Business Partner Extension Type',
     'Extension actions for an existing business partner: add supplier/customer role or company-code scope.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('supplier_role',          'Extend BP as Supplier',              'master.business_partner_extension_type', 'Add the AP supplier role to an existing BP.',           10),
    ('customer_role',          'Extend BP as Customer',              'master.business_partner_extension_type', 'Add the AR customer role to an existing BP.',           20),
    ('supplier_company_code',  'Extend Supplier to Company Code',    'master.business_partner_extension_type', 'Add AP operating scope for one company code.',          30),
    ('customer_company_code',  'Extend Customer to Company Code',    'master.business_partner_extension_type', 'Add AR operating scope for one company code.',          40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
