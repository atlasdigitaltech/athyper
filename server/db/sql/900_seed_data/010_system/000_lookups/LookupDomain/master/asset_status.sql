-- LookupDomain/master/asset_status.sql
-- Lookup values for domain: master.asset_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',       'Draft',            'master.asset_status', 'Asset record created, not yet active',       10),
    ('wip',         'Work in Progress', 'master.asset_status', 'Asset under construction or WIP',            15),
    ('active',      'Active',           'master.asset_status', 'Asset in service',                           20),
    ('suspended',   'Suspended',        'master.asset_status', 'Asset temporarily out of service',           30),
    ('retired',     'Retired',          'master.asset_status', 'Asset retired from service',                 40),
    ('disposed',    'Disposed',         'master.asset_status', 'Asset disposed / sold',                      50),
    ('transferred', 'Transferred Out',  'master.asset_status', 'Asset transferred to another entity',        60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
