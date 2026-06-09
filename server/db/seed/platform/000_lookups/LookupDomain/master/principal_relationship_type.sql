-- LookupDomain/master/principal_relationship_type.sql
-- Lookup values for domain: master.principal_relationship_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('same_human', 'Same Human',
     'master.principal_relationship_type',
     'Verified correlation that two principals represent the same human in different planes or tenants.',
     10),
    ('duplicate_candidate', 'Duplicate Candidate',
     'master.principal_relationship_type',
     'Potential duplicate principal requiring review.',
     20),
    ('duplicate_confirmed', 'Duplicate Confirmed',
     'master.principal_relationship_type',
     'Duplicate principal has been confirmed but not necessarily merged.',
     30),
    ('merged_into', 'Merged Into',
     'master.principal_relationship_type',
     'Source principal has been merged into the target principal.',
     40),
    ('transfer_requested', 'Transfer Requested',
     'master.principal_relationship_type',
     'Principal ownership/access transfer has been requested.',
     50),
    ('transfer_completed', 'Transfer Completed',
     'master.principal_relationship_type',
     'Principal ownership/access transfer has been completed.',
     60),
    ('support_shadow_for', 'Support Shadow For',
     'master.principal_relationship_type',
     'Tenant-local support shadow principal mapped to the product-owner principal it represents.',
     70),
    ('email_alias', 'Email Alias',
     'master.principal_relationship_type',
     'Principals are correlated by verified email alias relationship.',
     80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
