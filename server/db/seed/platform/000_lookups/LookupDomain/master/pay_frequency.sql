INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('daily',        'Daily',            'master.pay_frequency', 'Paid every working day',                        10),
    ('weekly',       'Weekly',           'master.pay_frequency', 'Paid once per week',                            20),
    ('bi_weekly',    'Bi-Weekly',        'master.pay_frequency', 'Paid every two weeks (26 runs/year)',           30),
    ('semi_monthly', 'Semi-Monthly',     'master.pay_frequency', 'Paid twice per month (24 runs/year)',           40),
    ('monthly',      'Monthly',          'master.pay_frequency', 'Paid once per month (12 runs/year)',            50),
    ('quarterly',    'Quarterly',        'master.pay_frequency', 'Paid every three months (4 runs/year)',         60),
    ('annual',       'Annual',           'master.pay_frequency', 'Paid once per year (commissions, bonuses)',     70),
    ('on_demand',    'On Demand',        'master.pay_frequency', 'Ad-hoc payment triggered manually',            80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
