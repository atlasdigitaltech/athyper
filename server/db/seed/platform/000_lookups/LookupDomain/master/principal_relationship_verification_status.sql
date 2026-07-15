INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('unverified', 'Unverified',
     'master.principal_relationship_verification_status',
     'Correlation exists but has not been verified.',
     10),
    ('pending', 'Pending',
     'master.principal_relationship_verification_status',
     'Correlation verification is in progress.',
     20),
    ('verified', 'Verified',
     'master.principal_relationship_verification_status',
     'Correlation has been verified.',
     30),
    ('rejected', 'Rejected',
     'master.principal_relationship_verification_status',
     'Correlation was reviewed and rejected.',
     40),
    ('superseded', 'Superseded',
     'master.principal_relationship_verification_status',
     'Correlation was replaced by a newer relationship.',
     50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
