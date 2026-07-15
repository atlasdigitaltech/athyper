-- Used by: budget_profile.fund_source.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('internal',       'Internal',        'master.budget_fund_source', 'Funded from internal operations',               10),
    ('grant',          'Grant',           'master.budget_fund_source', 'Externally granted funds (government / NGO)',   20),
    ('revenue',        'Revenue',         'master.budget_fund_source', 'Funded from operating revenue',                 30),
    ('debt',           'Debt / Loan',     'master.budget_fund_source', 'Funded via borrowing or credit facility',       40),
    ('equity',         'Equity',          'master.budget_fund_source', 'Funded via equity capital raise',               50),
    ('carry_forward',  'Carry Forward',   'master.budget_fund_source', 'Unspent balance carried over from prior year',  60),
    ('joint_venture',  'Joint Venture',   'master.budget_fund_source', 'Jointly funded by a partnership arrangement',   70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
