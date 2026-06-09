-- LookupDomain/master/project_settlement_type.sql
-- Lookup values for domain: master.project_settlement_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('cost_center', 'Cost Center', 'master.project_settlement_type', 'Settle to CC',      10),
    ('asset',       'Asset',       'master.project_settlement_type', 'Capitalize',         20),
    ('gl_account',  'GL Account',  'master.project_settlement_type', 'Settle to account',  30),
    ('order',       'Order',       'master.project_settlement_type', 'Settle to order',    40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
