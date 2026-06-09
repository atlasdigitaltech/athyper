-- LookupDomain/master/print_profile_paper_size.sql
-- Lookup values for domain: master.print_profile.paper_size
-- Paper size for print profiles.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('a3',     'A3',     'master.print_profile.paper_size', 'A3 paper.',     10),
    ('a4',     'A4',     'master.print_profile.paper_size', 'A4 paper.',     20),
    ('a5',     'A5',     'master.print_profile.paper_size', 'A5 paper.',     30),
    ('b4',     'B4',     'master.print_profile.paper_size', 'B4 paper.',     40),
    ('letter', 'Letter', 'master.print_profile.paper_size', 'Letter paper.', 50),
    ('legal',  'Legal',  'master.print_profile.paper_size', 'Legal paper.',  60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
