-- LookupDomain/log/password_change_reason.sql
-- Lookup values for domain: log.password_change_reason
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('voluntary',             'Voluntary Change',
     'log.password_change_reason',
     'Principal chose to change their password.',
     10),
    ('admin_reset',           'Admin Reset',
     'log.password_change_reason',
     'Password reset initiated by a tenant admin or platform admin.',
     20),
    ('policy_expiry',         'Policy Expiry',
     'log.password_change_reason',
     'Password expired per tenant password control.',
     30),
    ('compromise_suspected',  'Compromise Suspected',
     'log.password_change_reason',
     'Forced reset triggered by suspected credential compromise or breach alert.',
     40),
    ('initial_set',           'Initial Set',
     'log.password_change_reason',
     'First password set after account creation or invitation acceptance.',
     50),
    ('mfa_upgrade',           'MFA Upgrade',
     'log.password_change_reason',
     'Password re-set as part of MFA enrollment or method upgrade.',
     60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
