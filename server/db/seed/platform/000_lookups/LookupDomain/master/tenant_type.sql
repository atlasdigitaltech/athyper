INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('platform_internal', 'Platform Internal',
     'master.tenant_type',
     'System/internal platform tenant used for bootstrap and platform-owned records.',
     0),
    ('platform_owner', 'Platform Owner',
     'master.tenant_type',
     'Athyper product-owner tenant. Used with platform-control support identities.',
     10),
    ('customer', 'Customer',
     'master.tenant_type',
     'Licensed Neon tenant using the Business Operating Platform.',
     20),
    ('customer_partner', 'Customer Partner',
     'master.tenant_type',
     'Organization that is both a customer tenant and a partner/network participant.',
     30),
    ('partner', 'Partner',
     'master.tenant_type',
     'Mesh partner organization participating in the collaboration network.',
     40),
    ('partner_prospect', 'Partner Prospect',
     'master.tenant_type',
     'Provisional partner tenant created during invite/onboarding before activation.',
     50),
    ('supplier', 'Supplier',
     'master.tenant_type',
     'Supplier organization with an activated collaboration/network account.',
     60),
    ('supplier_prospect', 'Supplier Prospect',
     'master.tenant_type',
     'Temporary supplier tenant created from a customer invite before the supplier completes onboarding.',
     70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
