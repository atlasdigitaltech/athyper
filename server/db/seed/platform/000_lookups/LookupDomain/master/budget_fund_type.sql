-- Used by: budget_profile.fund_type.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('capex',     'CapEx',        'master.budget_fund_type', 'Capital expenditure budget for fixed assets',      10),
    ('opex',      'OpEx',         'master.budget_fund_type', 'Operating expenditure budget for running costs',   20),
    ('project',   'Project',      'master.budget_fund_type', 'Time-bound project-specific budget',              30),
    ('general',   'General',      'master.budget_fund_type', 'General discretionary operating budget',          40),
    ('emergency', 'Emergency',    'master.budget_fund_type', 'Emergency reserve fund',                          50),
    ('reserve',   'Reserve',      'master.budget_fund_type', 'Strategic reserve or contingency fund',           60),
    ('grant',     'Grant',        'master.budget_fund_type', 'Externally funded grant budget',                  70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
