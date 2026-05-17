-- LookupDomain/master/idp_provider_type.sql
-- Lookup values for domain: master.idp_provider_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('keycloak',  'Keycloak',            'master.idp_provider_type', 'Athyper built-in Keycloak IdP',               10),
    ('google',    'Google',              'master.idp_provider_type', 'Google OIDC / Workspace',                     20),
    ('microsoft', 'Microsoft / Entra',   'master.idp_provider_type', 'Microsoft Entra ID (Azure AD) OIDC/SAML',    30),
    ('okta',      'Okta',                'master.idp_provider_type', 'Okta OIDC/SAML federation',                  40),
    ('saml',      'Generic SAML',        'master.idp_provider_type', 'Generic SAML 2.0 identity provider',         50),
    ('ldap',      'LDAP / AD',           'master.idp_provider_type', 'LDAP or Active Directory directory service',  60),
    ('github',    'GitHub',              'master.idp_provider_type', 'GitHub OAuth2 OIDC',                          70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
