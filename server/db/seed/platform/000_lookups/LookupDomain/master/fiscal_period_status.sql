INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('future',     'Future',     'master.fiscal_period.status', 'Future period.',      10),
    ('open',       'Open',       'master.fiscal_period.status', 'Open period.',        20),
    ('soft_close', 'Soft Close', 'master.fiscal_period.status', 'Soft-closed period.', 30),
    ('hard_close', 'Hard Close', 'master.fiscal_period.status', 'Hard-closed period.', 40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
