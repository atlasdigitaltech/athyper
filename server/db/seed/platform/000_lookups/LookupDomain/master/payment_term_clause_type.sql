-- Used by: payment_term_clause.clause_type.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('advance',       'Advance',       'master.payment_term_clause_type', 'Upfront payment before work begins',                           10),
    ('milestone',     'Milestone',     'master.payment_term_clause_type', 'Payment triggered on completion of a defined milestone',       20),
    ('retention',     'Retention',     'master.payment_term_clause_type', 'Amount withheld until defect liability period expires',        30),
    ('holdback',      'Holdback',      'master.payment_term_clause_type', 'Portion held pending final acceptance or warranty',            40),
    ('earnest_money', 'Earnest Money', 'master.payment_term_clause_type', 'Good-faith deposit paid at contract signing',                  50),
    ('drawdown',      'Drawdown',      'master.payment_term_clause_type', 'Scheduled drawdown from a committed facility or credit line',  60),
    ('balloon',       'Balloon',       'master.payment_term_clause_type', 'Large final payment after periodic installments',              70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
