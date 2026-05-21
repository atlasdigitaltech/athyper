-- LookupDomain/master/principal_source.sql
-- Lookup values for domain: master.principal_source
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('internal',    'Internal',     'master.principal_source', 'Created directly by the platform or trusted internal workflow.',        10),
    ('oidc_jit',    'OIDC JIT',     'master.principal_source', 'Just-in-time principal provisioned from OIDC login.',                   20),
    ('saml_jit',    'SAML JIT',     'master.principal_source', 'Just-in-time principal provisioned from SAML login.',                   30),
    ('support_jit', 'Support JIT',  'master.principal_source', 'Tenant-local support principal provisioned for audited support access.', 40),
    ('invite_jit',  'Invite JIT',   'master.principal_source', 'Principal provisioned from invitation or supplier onboarding.',         50),
    ('scim',        'SCIM',         'master.principal_source', 'Provisioned via SCIM directory sync.',                                  60),
    ('api',         'API',          'master.principal_source', 'Provisioned programmatically via platform API.',                        70),
    ('import',      'Import',       'master.principal_source', 'Bulk-imported from a file or migration tool.',                          80),
    ('local',       'Local Legacy', 'master.principal_source', 'Legacy value for local user creation. Prefer internal.',                90),
    ('sso',         'SSO Legacy',   'master.principal_source', 'Legacy value for SSO provisioning. Prefer oidc_jit or saml_jit.',       100),
    ('provisioned', 'Provisioned Legacy', 'master.principal_source', 'Legacy value for pre-provisioned setup. Prefer internal.',        110)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
