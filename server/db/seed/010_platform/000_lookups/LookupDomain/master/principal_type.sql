-- LookupDomain/master/principal_type.sql
-- Lookup values for domain: master.principal_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('user', 'User',
     'master.principal_type',
     'Human user authenticated via Keycloak. Has a principal_profile with display name and IdP binding.',
     10),
    ('service_account', 'Service Account',
     'master.principal_type',
     'Non-human actor representing an application or integration. is_service_account=true, no MFA required.',
     20),
    ('bot', 'Bot',
     'master.principal_type',
     'Automated agent performing platform tasks (e.g. scheduler, data pipeline). Operates without login session.',
     30),
    ('system', 'System',
     'master.principal_type',
     'Platform-internal system principal. Reserved for the bootstrap systemadmin actor. Cannot be assigned to new principals.',
     0)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
