INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('pii',          'Personally Identifiable Information',
     'log.field_classification',
     'Fields that directly identify a person (name, email, NIC, passport). '
     'Retention: 7 years. GDPR Article 4(1) scope.',
     10),
    ('sensitive',    'Sensitive',
     'log.field_classification',
     'Fields requiring heightened access control but not strictly PII '
     '(salary, performance rating, medical notes). Retention: 2 years.',
     20),
    ('confidential', 'Confidential',
     'log.field_classification',
     'Business-confidential data (pricing, contracts, M&A data). Retention: 2 years.',
     30),
    ('regulated',    'Regulated',
     'log.field_classification',
     'Fields subject to specific regulatory retention or access requirements '
     '(GDPR special categories, PDPA sensitive data). Retention: 7 years.',
     40),
    ('financial',    'Financial',
     'log.field_classification',
     'Financial data requiring SOX-level access logging (GL balances, payment details). '
     'Retention: 7 years.',
     50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
