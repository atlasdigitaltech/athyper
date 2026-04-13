-- LookupDomain/master/asset_life_override_policy.sql
-- Lookup values for domain: master.asset_life_override_policy
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('allow',   'Allow',   'master.asset_life_override_policy', 'Useful life may be overridden at asset level',     10),
    ('require', 'Require', 'master.asset_life_override_policy', 'Useful life must be specified per-asset',          20),
    ('forbid',  'Forbid',  'master.asset_life_override_policy', 'Class useful life cannot be changed at asset level', 30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
