-- LookupDomain/master/profit_center_node_type.sql
-- Lookup values for domain: master.profit_center_node_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('header',  'Header',  'master.profit_center_node_type', 'Rollup-only', 10),
    ('posting', 'Posting', 'master.profit_center_node_type', 'Postable',    20)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
