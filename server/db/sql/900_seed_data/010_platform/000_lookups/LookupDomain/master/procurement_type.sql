-- LookupDomain/master/procurement_type.sql
-- Lookup values for domain: master.procurement_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('goods',    'Goods',    'master.procurement_type', 'Physical goods procurement',      10),
    ('services', 'Services', 'master.procurement_type', 'Service procurement',             20),
    ('mixed',    'Mixed',    'master.procurement_type', 'Goods + services combination',    30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
