-- LookupDomain/master/tenant_relationship_direction.sql
-- Lookup values for domain: master.tenant_relationship_direction
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('outbound', 'Outbound',
     'master.tenant_relationship_direction',
     'from_tenant initiated or owns the relationship request.',
     10),
    ('inbound', 'Inbound',
     'master.tenant_relationship_direction',
     'to_tenant initiated or owns the relationship request.',
     20),
    ('mutual', 'Mutual',
     'master.tenant_relationship_direction',
     'Relationship is jointly owned or symmetrical.',
     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
