-- LookupDomain/control/entity_kind.sql
-- Lookup values for domain: entity.kind
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('ent', 'Entity',      'entity.kind', 10),
    ('sub', 'Sub-Entity',  'entity.kind', 20),
    ('ext', 'Extension',   'entity.kind', 30),
    ('arch','Archive',     'entity.kind', 40)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
