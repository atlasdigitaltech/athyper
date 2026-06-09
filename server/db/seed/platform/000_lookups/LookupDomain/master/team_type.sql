-- LookupDomain/master/team_type.sql
-- Lookup values for domain: master.team_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('functional',       'Functional',        'master.team_type', 'Permanent team organized around a business function',       10),
    ('project',          'Project',           'master.team_type', 'Temporary team assembled for a specific project',            20),
    ('virtual',          'Virtual',           'master.team_type', 'Cross-location or distributed team with no physical anchor', 30),
    ('cross_functional', 'Cross-Functional',  'master.team_type', 'Team spanning multiple functional areas',                    40),
    ('committee',        'Committee',         'master.team_type', 'Governance or oversight committee with defined membership',  50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
