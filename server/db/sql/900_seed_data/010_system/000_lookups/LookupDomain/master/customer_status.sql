-- LookupDomain/master/customer_status.sql
-- Lookup values for domain: master.customer_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('active',   'Active',   'master.customer_status', 'In use',               10),
    ('inactive', 'Inactive', 'master.customer_status', 'Temporarily disabled',  20),
    ('blocked',  'Blocked',  'master.customer_status', 'Credit-blocked',        30),
    ('archived', 'Archived', 'master.customer_status', 'Permanently closed',    40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
