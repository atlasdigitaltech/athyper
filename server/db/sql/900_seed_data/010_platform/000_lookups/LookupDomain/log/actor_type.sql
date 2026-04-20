-- LookupDomain/log/actor_type.sql
-- Lookup values for domain: log.actor_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('principal',  'Principal',
     'log.actor_type',
     'Human user or service account authenticated via Keycloak session.',
     10),
    ('service',    'Service',
     'log.actor_type',
     'Non-interactive service or integration calling the platform API.',
     20),
    ('system',     'System',
     'log.actor_type',
     'Platform-internal automated actor (scheduler, migration, background worker).',
     30),
    ('migration',  'Migration',
     'log.actor_type',
     'Data migration script. Used to tag bulk-migrated rows in audit_log.',
     40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
