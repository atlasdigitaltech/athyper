-- LookupDomain/control/field_compute_mode.sql
-- Lookup values for domain: entity_field.compute_mode
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('database',   'Database',   'entity_field.compute_mode', 10),
    ('server',     'Server',     'entity_field.compute_mode', 20),
    ('client',     'Client',     'entity_field.compute_mode', 30),
    ('projection', 'Projection', 'entity_field.compute_mode', 40)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
