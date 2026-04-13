-- LookupDomain/master/chart_of_account_status.sql
-- Lookup values for domain: master.chart_of_account_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',   'Draft',   'master.chart_of_account_status', 'Under construction',  10),
    ('active',  'Active',  'master.chart_of_account_status', 'In use',              20),
    ('locked',  'Locked',  'master.chart_of_account_status', 'No new accounts',     30),
    ('retired', 'Retired', 'master.chart_of_account_status', 'Superseded by newer', 40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
