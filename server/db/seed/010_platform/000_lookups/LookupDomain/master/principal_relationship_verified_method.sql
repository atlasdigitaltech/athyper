-- LookupDomain/master/principal_relationship_verified_method.sql
-- Lookup values for domain: master.principal_relationship_verified_method
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('email_match', 'Email Match',
     'master.principal_relationship_verified_method',
     'Verified using normalized email match and policy-approved context.',
     10),
    ('email_otp', 'Email OTP',
     'master.principal_relationship_verified_method',
     'Verified by one-time passcode sent to the email owner.',
     20),
    ('idp_claim', 'IdP Claim',
     'master.principal_relationship_verified_method',
     'Verified through identity provider claim or federation metadata.',
     30),
    ('admin_review', 'Admin Review',
     'master.principal_relationship_verified_method',
     'Verified by authorized administrator review.',
     40),
    ('user_claim', 'User Claim',
     'master.principal_relationship_verified_method',
     'Verified through user-initiated claim/consent flow.',
     50),
    ('support_grant', 'Support Grant',
     'master.principal_relationship_verified_method',
     'Verified through a tenant-approved support access grant.',
     60),
    ('migration', 'Migration',
     'master.principal_relationship_verified_method',
     'Verified by controlled data migration or backfill.',
     70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
