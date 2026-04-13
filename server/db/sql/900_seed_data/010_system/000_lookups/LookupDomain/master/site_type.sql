-- LookupDomain/master/site_type.sql
-- Lookup values for domain: master.site_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('plant',  'Plant',  'master.site_type', 'Manufacturing facility',    10),
    ('office', 'Office', 'master.site_type', 'Corporate / admin office',  20),
    ('store',  'Store',  'master.site_type', 'Retail outlet',             30),
    ('branch', 'Branch', 'master.site_type', 'Branch office',             40),
    ('yard',   'Yard',   'master.site_type', 'Open storage / staging',    50),
    ('depot',  'Depot',  'master.site_type', 'Distribution / logistics',  60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
