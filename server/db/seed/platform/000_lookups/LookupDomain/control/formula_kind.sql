-- LookupDomain/control/formula_kind.sql
-- Lookup values for domain: control.formula_kind
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('payroll',  'Payroll',    'control.formula_kind', 'Salary component calculation: earnings, deductions, statutory contributions',            10),
    ('accrual',  'Accrual',   'control.formula_kind', 'Month-end or period-end provision accrual (gratuity, leave encashment)',                 20),
    ('tax',      'Tax',       'control.formula_kind', 'Income tax or withholding tax computation using rate slabs / tables',                    30),
    ('benefit',  'Benefit',   'control.formula_kind', 'Employee benefit valuation (medical insurance premium, perquisite valuation)',           40),
    ('leave',    'Leave',     'control.formula_kind', 'Leave balance accrual, encashment, or carry-forward computation',                       50),
    ('pricing',  'Pricing',   'control.formula_kind', 'Commercial pricing or margin formula unrelated to payroll or HR',                       60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
