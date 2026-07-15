INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('authentication', 'Authentication',
     'log.security_event_category',
     'Login, logout, and credential verification events.',
     10),
    ('authorisation',  'Authorisation',
     'log.security_event_category',
     'Access control checks, permission grants and denials.',
     20),
    ('session',        'Session',
     'log.security_event_category',
     'Session creation, expiry, and revocation events.',
     30),
    ('mfa',            'MFA',
     'log.security_event_category',
     'Multi-factor authentication challenges, verifications, lockouts.',
     40),
    ('password',       'Password',
     'log.security_event_category',
     'Password change, reset, and expiry events.',
     50),
    ('account',        'Account',
     'log.security_event_category',
     'Account lockout, unlock, device trust events.',
     60),
    ('api_key',        'API Key',
     'log.security_event_category',
     'API key creation, rotation, and revocation events.',
     70),
    ('suspicious',     'Suspicious Activity',
     'log.security_event_category',
     'Anomalous behaviour flagged by risk scoring (brute-force, impossible travel, etc.).',
     80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
