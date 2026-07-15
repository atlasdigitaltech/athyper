-- Tenant-extensible: tenants may register additional branded themes beyond light/dark/system.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('light',  'Light',  'ui.appearance_mode', 'Light theme. White background, dark text.',                                        10),
    ('dark',   'Dark',   'ui.appearance_mode', 'Dark theme. Dark background, light text.',                                         20),
    ('system', 'System', 'ui.appearance_mode', 'Follow OS preference. Switches automatically between light and dark. Default.',    30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
