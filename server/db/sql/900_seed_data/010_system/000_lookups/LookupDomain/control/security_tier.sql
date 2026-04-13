-- LookupDomain/control/security_tier.sql
-- Lookup values for domain: entity.security_tier
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('platform_critical', 'Platform Critical', 'entity.security_tier', 10),
    ('tenant_critical',   'Tenant Critical',   'entity.security_tier', 20),
    ('operational',       'Operational',        'entity.security_tier', 30),
    ('config',            'Config',             'entity.security_tier', 40)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
