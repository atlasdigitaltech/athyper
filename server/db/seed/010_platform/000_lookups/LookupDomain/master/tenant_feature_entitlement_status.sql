-- LookupDomain/master/tenant_feature_entitlement_status.sql
-- Lookup values for domain: master.tenant_feature_entitlement.status
-- Lifecycle status for tenant feature entitlements.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('active',    'Active',    'master.tenant_feature_entitlement.status', 'Active entitlement.',    10),
    ('suspended', 'Suspended', 'master.tenant_feature_entitlement.status', 'Suspended entitlement.', 20),
    ('trial',     'Trial',     'master.tenant_feature_entitlement.status', 'Trial entitlement.',     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
