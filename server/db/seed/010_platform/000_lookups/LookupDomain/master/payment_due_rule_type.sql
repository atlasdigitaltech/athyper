-- LookupDomain/master/payment_due_rule_type.sql
-- Lookup values for domain: master.payment_due_rule_type
-- Used by: payment_term.due_rule_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('net_days',    'Net Days',       'master.payment_due_rule_type', 'Due N days from base event date',                  10),
    ('end_of_month','End of Month',   'master.payment_due_rule_type', 'Due on the last day of the month',                 20),
    ('specific_day','Specific Day',   'master.payment_due_rule_type', 'Due on a specific day of month (e.g. day 15)',     30),
    ('installment', 'Installment',    'master.payment_due_rule_type', 'Spread across multiple installment due dates',     40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
