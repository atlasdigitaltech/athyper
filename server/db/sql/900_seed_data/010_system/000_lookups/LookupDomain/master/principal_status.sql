-- LookupDomain/master/principal_status.sql
-- Lookup values for domain: master.principal_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('active', 'Active',
     'master.principal_status',
     'Principal is enabled and may authenticate. Default state after registration.',
     10),
    ('pending_verification', 'Pending Verification',
     'master.principal_status',
     'Principal created but primary email not yet verified. Login blocked until verified.',
     20),
    ('suspended', 'Suspended',
     'master.principal_status',
     'Principal temporarily disabled by tenant admin. Cannot log in.',
     30),
    ('terminated', 'Terminated',
     'master.principal_status',
     'Principal permanently deactivated. Data retained for audit; login permanently blocked.',
     40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
