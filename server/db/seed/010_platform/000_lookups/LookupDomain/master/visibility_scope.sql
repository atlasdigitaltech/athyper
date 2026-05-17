-- LookupDomain/master/visibility_scope.sql
-- Lookup values for domain: master.visibility_scope
-- Shared by: auth_group_role.visibility_scope, access_grant.visibility_scope
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('global',     'Global',     'master.visibility_scope', 'Visible to all principals in the tenant',              10),
    ('company',    'Company',    'master.visibility_scope', 'Visible within a specific company code scope',          20),
    ('department', 'Department', 'master.visibility_scope', 'Visible within a cost center / department boundary',    30),
    ('personal',   'Personal',   'master.visibility_scope', 'Visible to the grant owner only',                      40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
