INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('earning',               'Earning',               'master.pay_component_type', 'Positive pay element added to gross salary (wages, allowances, bonuses)',       10),
    ('deduction',             'Deduction',             'master.pay_component_type', 'Employee-side deduction subtracted before net pay (PF, tax, loan recovery)',   20),
    ('statutory',             'Statutory',             'master.pay_component_type', 'Regulatory contribution borne by employer (PF employer share, ESI, gratuity)', 30),
    ('memo',                  'Memo',                  'master.pay_component_type', 'Computed summary figure, not posted to GL (gross, net, CTC)',                  40),
    ('employer_contribution', 'Employer Contribution', 'master.pay_component_type', 'Voluntary employer benefit cost (group insurance, NPS employer share)',         50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
