-- LookupDomain/master/principal_source.sql
-- Lookup values for domain: master.principal_source
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('local',       'Local',        'master.principal_source', 'Created directly in the platform (email + password)',   10),
    ('sso',         'SSO',          'master.principal_source', 'Provisioned via single sign-on at first login',         20),
    ('scim',        'SCIM',         'master.principal_source', 'Provisioned via SCIM directory sync',                   30),
    ('api',         'API',          'master.principal_source', 'Provisioned programmatically via platform API',         40),
    ('import',      'Import',       'master.principal_source', 'Bulk-imported from a file or migration tool',           50),
    ('provisioned', 'Provisioned',  'master.principal_source', 'Pre-provisioned by platform setup / seed',              60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
