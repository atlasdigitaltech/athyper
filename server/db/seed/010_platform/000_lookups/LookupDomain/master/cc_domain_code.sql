-- LookupDomain/master/cc_domain_code.sql
-- Lookup values for domain: master.cc_domain_code
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('unspsc', 'UNSPSC', 'master.cc_domain_code', 'United Nations Standard Products and Services Code',  10),
    ('hs',     'HS',     'master.cc_domain_code', 'Harmonized System (customs)',                         20),
    ('naics',  'NAICS',  'master.cc_domain_code', 'North American Industry Classification System',       30),
    ('isic',   'ISIC',   'master.cc_domain_code', 'International Standard Industrial Classification',    40),
    ('gics',   'GICS',   'master.cc_domain_code', 'Global Industry Classification Standard',             50),
    ('sitc',   'SITC',   'master.cc_domain_code', 'Standard International Trade Classification',          60),
    ('custom', 'Custom', 'master.cc_domain_code', 'Tenant-defined taxonomy',                              70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
