-- LookupDomain/control/field_cardinality.sql
-- Lookup values for domain: entity_field.cardinality
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('one',         'One',         'entity_field.cardinality', 10),
    ('many',        'Many',        'entity_field.cardinality', 20),
    ('zero_or_one', 'Zero or One', 'entity_field.cardinality', 30)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
