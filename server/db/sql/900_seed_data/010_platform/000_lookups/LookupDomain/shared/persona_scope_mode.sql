-- LookupDomain/shared/persona_scope_mode.sql
-- Lookup values for domain: shared.persona_scope_mode
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('tenant', 'Tenant',
     'shared.persona_scope_mode',
     'Persona scoped to a single tenant. Permissions resolved within tenant boundary only.',
     10),
    ('global', 'Global',
     'shared.persona_scope_mode',
     'Persona applies across all tenants. Used for platform-wide read access roles.',
     20),
    ('system', 'System',
     'shared.persona_scope_mode',
     'Reserved for platform-internal system personas. Not assignable to regular principals.',
     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
