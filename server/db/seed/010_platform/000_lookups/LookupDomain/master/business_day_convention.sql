-- LookupDomain/master/business_day_convention.sql
-- Lookup values for domain: master.business_day_convention
-- Used by: payment_term.business_day_convention
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('unadjusted',          'Unadjusted',           'master.business_day_convention', 'Date is not adjusted — used as-is even on non-business days',                    10),
    ('following',           'Following',            'master.business_day_convention', 'Move to the next business day if date falls on non-business day (ISDA)',         20),
    ('preceding',           'Preceding',            'master.business_day_convention', 'Move to the previous business day if date falls on non-business day (ISDA)',     30),
    ('modified_following',  'Modified Following',   'master.business_day_convention', 'Following unless it crosses month end, then preceding (most common, ISDA)',      40),
    ('modified_preceding',  'Modified Preceding',   'master.business_day_convention', 'Preceding unless it crosses month start, then following (ISDA)',                 50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
