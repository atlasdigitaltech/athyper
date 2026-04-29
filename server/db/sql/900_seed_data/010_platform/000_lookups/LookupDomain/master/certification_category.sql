-- LookupDomain/master/certification_category.sql
-- Lookup domain + values for: master.certification_category
-- Used by: master.certification_type.category
-- Idempotent: WHERE NOT EXISTS guards

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.certification_category',
       'Certification Category',
       'Category grouping for certification types (quality, safety, ESG, halal, etc.).',
       'master', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'master.certification_category'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('quality',                 'Quality Management',       'master.certification_category', 'ISO 9001 and quality management system certifications',        10),
    ('information_security',    'Information Security',     'master.certification_category', 'ISO 27001, SOC 2, NIST cybersecurity certifications',          20),
    ('esg',                     'ESG / Sustainability',     'master.certification_category', 'Environmental, Social, Governance and sustainability ratings',  30),
    ('safety',                  'Health & Safety',          'master.certification_category', 'ISO 45001, OHSAS 18001, workplace safety certifications',       40),
    ('food_safety',             'Food Safety',              'master.certification_category', 'HACCP, ISO 22000, food handling and processing certifications', 50),
    ('halal',                   'Halal',                    'master.certification_category', 'Halal compliance certifications from recognised bodies',        60),
    ('financial',               'Financial / Audit',        'master.certification_category', 'Financial audit, PCI-DSS, SOX compliance certifications',       70),
    ('environmental',           'Environmental',            'master.certification_category', 'ISO 14001, carbon footprint, environmental management',         80),
    ('trade_compliance',        'Trade Compliance',         'master.certification_category', 'AEO, C-TPAT, customs and trade compliance certifications',      90),
    ('data_privacy',            'Data Privacy',             'master.certification_category', 'GDPR, ISO 27701, PDPA data privacy certifications',            100),
    ('other',                   'Other',                    'master.certification_category', 'Certification category not otherwise listed',                  110)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
