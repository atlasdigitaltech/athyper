INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',   'Standard',   'master.spend_visibility', 'Visible to all users',          10),
    ('restricted', 'Restricted', 'master.spend_visibility', 'Restricted to procurement',     20),
    ('hidden',     'Hidden',     'master.spend_visibility', 'Hidden from self-service',      30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
