-- LookupDomain/control/accounting_domain.sql
-- Lookup values for domain: control.accounting_domain
-- Economic domain classification resolved by commodity_classification_to_intent_rule.resolved_domain.
-- Lookup codes are lowercase; commodity_classification_to_intent_rule stores uppercase.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('opex',             'Operating Expense',      'control.accounting_domain', 10),
    ('capex',            'Capital Expenditure',    'control.accounting_domain', 20),
    ('admin',            'Admin / G&A',            'control.accounting_domain', 30),
    ('revenue',          'Revenue',                'control.accounting_domain', 40),
    ('cost_of_sales',    'Cost of Sales',          'control.accounting_domain', 50),
    ('transfer',         'Inter-Company Transfer', 'control.accounting_domain', 60),
    ('regulatory',       'Regulatory / Statutory', 'control.accounting_domain', 70),
    ('deferred_revenue', 'Deferred Revenue',       'control.accounting_domain', 80)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
