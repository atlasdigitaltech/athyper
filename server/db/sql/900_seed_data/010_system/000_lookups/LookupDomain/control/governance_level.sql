-- LookupDomain/control/governance_level.sql
-- Lookup values for domain: entity.governance_level
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('full',       'Full',       'entity.governance_level', 10),
    ('light',      'Light',      'entity.governance_level', 20),
    ('audit_only', 'Audit Only', 'entity.governance_level', 30),
    ('none',       'None',       'entity.governance_level', 40)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
