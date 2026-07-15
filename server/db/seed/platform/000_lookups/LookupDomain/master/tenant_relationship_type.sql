INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('customer_partner', 'Customer Partner',
     'master.tenant_relationship_type',
     'Customer tenant explicitly connected to a partner tenant for Mesh collaboration.',
     10),
    ('implementation_partner', 'Implementation Partner',
     'master.tenant_relationship_type',
     'Partner tenant assigned to implement, configure, or support a customer tenant.',
     20),
    ('support_provider', 'Support Provider',
     'master.tenant_relationship_type',
     'Support relationship between a provider tenant and a customer tenant.',
     30),
    ('platform_support', 'Platform Support',
     'master.tenant_relationship_type',
     'Athyper platform-owner support relationship to a tenant.',
     40),
    ('customer_supplier', 'Customer Supplier',
     'master.tenant_relationship_type',
     'Customer tenant relationship to a supplier or supplier prospect.',
     50),
    ('customer_invited_supplier', 'Customer Invited Supplier',
     'master.tenant_relationship_type',
     'Pending relationship created when a customer invites a supplier that does not yet have a Mesh account.',
     60),
    ('affiliate', 'Affiliate',
     'master.tenant_relationship_type',
     'Related organization under a wider group relationship.',
     70),
    ('intercompany', 'Intercompany',
     'master.tenant_relationship_type',
     'Tenant-to-tenant relationship for controlled group or intercompany collaboration.',
     80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
