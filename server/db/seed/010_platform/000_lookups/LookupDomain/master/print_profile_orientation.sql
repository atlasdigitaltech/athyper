-- LookupDomain/master/print_profile_orientation.sql
-- Lookup values for domain: master.print_profile.orientation
-- Page orientation for print profiles.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('portrait',  'Portrait',  'master.print_profile.orientation', 'Portrait orientation.',  10),
    ('landscape', 'Landscape', 'master.print_profile.orientation', 'Landscape orientation.', 20)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
