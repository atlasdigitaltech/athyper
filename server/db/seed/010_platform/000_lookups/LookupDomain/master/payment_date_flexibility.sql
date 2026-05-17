-- LookupDomain/master/payment_date_flexibility.sql
-- Lookup values for domain: master.payment_date_flexibility
-- Used by: payment_term.due_date_flexibility
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('none',                  'No Adjustment',        'master.payment_date_flexibility', 'Due date is not adjusted for non-business days',              10),
    ('next_business_day',     'Next Business Day',    'master.payment_date_flexibility', 'Move to the next available business day if non-business',     20),
    ('last_business_day',     'Last Business Day',    'master.payment_date_flexibility', 'Move to the preceding business day if non-business',          30),
    ('nearest_business_day',  'Nearest Business Day', 'master.payment_date_flexibility', 'Move to whichever business day is closest',                  40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
