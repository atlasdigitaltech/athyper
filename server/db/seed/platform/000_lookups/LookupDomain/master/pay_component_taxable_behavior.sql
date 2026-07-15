INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('taxable',           'Fully Taxable',      'master.pay_component_taxable_behavior', 'Entire amount is included in taxable income (basic salary, bonuses)',              10),
    ('non_taxable',       'Non-Taxable',        'master.pay_component_taxable_behavior', 'Exempt from income tax up to prescribed limits (transport, medical allowances)',   20),
    ('partially_taxable', 'Partially Taxable',  'master.pay_component_taxable_behavior', 'Taxable only above a statutory ceiling (HRA — exempt portion depends on rent)',   30),
    ('statutory_exempt',  'Statutory Exempt',   'master.pay_component_taxable_behavior', 'Deduction qualifies for tax relief under statute (PF, NPS contributions)',        40),
    ('perquisite',        'Perquisite',         'master.pay_component_taxable_behavior', 'Non-cash benefit valued at prescribed rate and added to taxable income',          50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
