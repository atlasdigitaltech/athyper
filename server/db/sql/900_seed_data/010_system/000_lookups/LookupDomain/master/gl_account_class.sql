-- LookupDomain/master/gl_account_class.sql
-- Lookup values for domain: master.gl_account_class
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('asset',            'Asset',            'master.gl_account_class', 'Resources controlled by entity',                    10),
    ('liability',        'Liability',        'master.gl_account_class', 'Present obligations',                               20),
    ('equity',           'Equity',           'master.gl_account_class', 'Residual interest',                                 30),
    ('income',           'Income',           'master.gl_account_class', 'Revenue and other income',                          40),
    ('expense',          'Expense',          'master.gl_account_class', 'Costs and other expenses',                          50),
    ('contra_asset',     'Contra Asset',     'master.gl_account_class', 'Offsets an asset (e.g. accumulated depreciation)',  60),
    ('contra_liability', 'Contra Liability', 'master.gl_account_class', 'Offsets a liability (e.g. bond discount)',          70),
    ('contra_equity',    'Contra Equity',    'master.gl_account_class', 'Offsets equity (e.g. treasury stock, dividends)',   80),
    ('contra_revenue',   'Contra Revenue',   'master.gl_account_class', 'Offsets revenue (e.g. returns, discounts)',         90),
    ('contra_expense',   'Contra Expense',   'master.gl_account_class', 'Offsets expense (e.g. purchase discounts)',        100)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
