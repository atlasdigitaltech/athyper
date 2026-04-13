-- LookupDomain/master/project_item_status.sql
-- Lookup values for domain: master.project_item_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',     'Draft',     'master.project_item_status', 'Not started',    10),
    ('active',    'Active',    'master.project_item_status', 'In progress',    20),
    ('on_hold',   'On Hold',   'master.project_item_status', 'Paused',         30),
    ('completed', 'Completed', 'master.project_item_status', 'Work complete',  40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
