-- LookupDomain/master/asset_class_status.sql
-- Lookup values for domain: master.asset_class_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('active',     'Active',      'master.asset_class_status', 'Class is in use for new assets',           10),
    ('deprecated', 'Deprecated',  'master.asset_class_status', 'Class no longer used for new assets',      20),
    ('inactive',   'Inactive',    'master.asset_class_status', 'Class is disabled',                        30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
