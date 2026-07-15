INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('email', 'Email OTP',
     'control.mfa_method_type',
     'One-time password delivered via email. Requires contact_link_id (channel_type=email).',
     10),
    ('sms', 'SMS OTP',
     'control.mfa_method_type',
     'One-time password delivered via SMS. Requires contact_link_id (channel_type=sms).',
     20),
    ('totp', 'TOTP (Authenticator App)',
     'control.mfa_method_type',
     'Time-based one-time password via authenticator app. Secret stored in Keycloak only. No contact_link_id.',
     30),
    ('webauthn', 'WebAuthn / FIDO2',
     'control.mfa_method_type',
     'Hardware security key or platform authenticator. Credential stored in Keycloak. No contact_link_id.',
     40),
    ('backup', 'Backup / Recovery Codes',
     'control.mfa_method_type',
     'Single-use recovery codes for account access when primary MFA unavailable. Codes stored in Keycloak.',
     50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
