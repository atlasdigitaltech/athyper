-- LookupDomain/master/feature_access_type.sql
-- Lookup values for domain: master.feature_access_type
-- Shared by: group_feature_grant.access_type, principal_feature_grant.access_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('none',  'None',  'master.feature_access_type', 'No access — feature is not available to the grantee', 10),
    ('read',  'Read',  'master.feature_access_type', 'Read-only access to the feature',                      20),
    ('write', 'Write', 'master.feature_access_type', 'Full read/write access to the feature',                30),
    ('admin', 'Admin', 'master.feature_access_type', 'Administrative access including configuration',        40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
