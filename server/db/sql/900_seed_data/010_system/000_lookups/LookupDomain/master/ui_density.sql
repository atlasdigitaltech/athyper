-- LookupDomain/master/ui_density.sql
-- Lookup values for domain: ui.density
-- Information density preference for master.principal_ui_profile.density_code.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('compact',     'Compact',     'ui.density', 'Minimal row height and whitespace. For power users on large monitors.', 10),
    ('comfortable', 'Comfortable', 'ui.density', 'Balanced default. Prioritises readability and touch targets.',          20),
    ('spacious',    'Spacious',    'ui.density', 'Generous whitespace and touch targets. Recommended for accessibility.', 30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
