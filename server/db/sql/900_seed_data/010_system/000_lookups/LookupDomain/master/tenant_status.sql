-- LookupDomain/master/tenant_status.sql
-- Lookup values for domain: master.tenant_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('provisioning', 'Provisioning',
     'master.tenant_status',
     'Tenant has been registered but setup is not yet complete. Login blocked.',
     10),
    ('active', 'Active',
     'master.tenant_status',
     'Tenant is fully operational. All features accessible per subscription tier.',
     20),
    ('suspended', 'Suspended',
     'master.tenant_status',
     'Tenant temporarily disabled (non-payment, compliance hold). Principals cannot log in.',
     30),
    ('terminated', 'Terminated',
     'master.tenant_status',
     'Tenant permanently closed. Terminal state — no further transitions allowed.',
     40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
