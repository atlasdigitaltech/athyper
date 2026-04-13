-- LookupDomain/master/cost_center_status.sql
-- Lookup values for domain: master.cost_center_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',    'Draft',    'master.cost_center_status', 'Not yet activated',     10),
    ('active',   'Active',   'master.cost_center_status', 'In use',               20),
    ('inactive', 'Inactive', 'master.cost_center_status', 'Temporarily disabled',  30),
    ('archived', 'Archived', 'master.cost_center_status', 'Permanently closed',    40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
