-- LookupDomain/master/pay_contribution_category.sql
-- Lookup values for domain: master.pay_contribution_category
-- Used by employee_statutory_enrollment.contribution_category
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',  'Standard',   'master.pay_contribution_category', 'Full statutory contribution at the prevailing rate',                                    10),
    ('reduced',   'Reduced',    'master.pay_contribution_category', 'Lower contribution rate due to age, wage ceiling breach, or scheme rule',               20),
    ('voluntary', 'Voluntary',  'master.pay_contribution_category', 'Employee elects to contribute above the statutory minimum',                             30),
    ('exempt',    'Exempt',     'master.pay_contribution_category', 'Employee is legally exempt from this scheme (non-resident, age bracket, other)',        40),
    ('deferred',  'Deferred',   'master.pay_contribution_category', 'Contribution deferred pending scheme eligibility confirmation',                         50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
