-- LookupDomain/master/legal_entity_framework.sql
-- Lookup values for domain: master.legal_entity_framework
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('ifrs',       'IFRS',       'master.legal_entity_framework', 'International Financial Reporting Standards',  10),
    ('us_gaap',    'US GAAP',    'master.legal_entity_framework', 'United States GAAP',                           20),
    ('local_gaap', 'Local GAAP', 'master.legal_entity_framework', 'Country-specific local standards',             30),
    ('mfrs',       'MFRS',       'master.legal_entity_framework', 'Malaysian FRS',                                40),
    ('ind_as',     'Ind AS',     'master.legal_entity_framework', 'Indian Accounting Standards',                  50),
    ('socpa',      'SOCPA',      'master.legal_entity_framework', 'Saudi Organization for CPAs',                  60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
