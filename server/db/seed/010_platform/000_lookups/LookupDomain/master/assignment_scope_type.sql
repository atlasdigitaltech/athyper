-- LookupDomain/master/assignment_scope_type.sql
-- Lookup values for domain: master.assignment_scope_type
-- Shared by: auth_group_role.assignment_scope_type, access_grant.assignment_scope_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('global',      'Global',      'master.assignment_scope_type', 'Assignment applies across all resources in the tenant',   10),
    ('company',     'Company',     'master.assignment_scope_type', 'Assignment scoped to a specific company code',             20),
    ('department',  'Department',  'master.assignment_scope_type', 'Assignment scoped to a cost center or department',         30),
    ('project',     'Project',     'master.assignment_scope_type', 'Assignment scoped to a specific project',                  40),
    ('cost_center', 'Cost Center', 'master.assignment_scope_type', 'Assignment scoped to a specific cost center node',         50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
