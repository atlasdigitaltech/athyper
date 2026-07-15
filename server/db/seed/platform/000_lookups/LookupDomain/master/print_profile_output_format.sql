INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('pdf',  'PDF',  'master.print_profile.output_format', 'PDF output.',        10),
    ('html', 'HTML', 'master.print_profile.output_format', 'HTML output.',        20),
    ('png',  'PNG',  'master.print_profile.output_format', 'PNG image output.',  30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
