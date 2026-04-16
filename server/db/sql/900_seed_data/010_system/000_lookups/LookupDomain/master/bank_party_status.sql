-- LookupDomain/master/bank_party_status.sql
-- Lookup values for domain: master.bank_party_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('active',   'Active',   'master.bank_party_status', 'In use',                10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('inactive', 'Inactive', 'master.bank_party_status', 'Temporarily disabled',  20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('archived', 'Archived', 'master.bank_party_status', 'Permanently retired',   30, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
