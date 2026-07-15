-- Used by: master.supplier.employee_count_band.
-- 'e' prefix on every code is intentional — lookup_value_code_fmt requires codes to start with a letter.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.employee_count_band',
       'Employee Count Band',
       'Standardised headcount bands for supplier business profile.',
       'master', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'master.employee_count_band'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('e1_10',       '1 – 10',           'master.employee_count_band', 'Micro enterprise',           10),
    ('e11_50',      '11 – 50',          'master.employee_count_band', 'Small enterprise',           20),
    ('e51_200',     '51 – 200',         'master.employee_count_band', 'Small-medium enterprise',    30),
    ('e201_500',    '201 – 500',        'master.employee_count_band', 'Medium enterprise',          40),
    ('e501_1000',   '501 – 1,000',      'master.employee_count_band', 'Upper medium enterprise',    50),
    ('e1001_5000',  '1,001 – 5,000',    'master.employee_count_band', 'Large enterprise',           60),
    ('e5001_plus',  '5,001+',           'master.employee_count_band', 'Very large / multinational', 70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
