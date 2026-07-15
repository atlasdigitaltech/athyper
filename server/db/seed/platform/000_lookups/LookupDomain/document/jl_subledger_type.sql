INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('ap',         'Accounts Payable', 'document.jl_subledger_type', 'AP subledger',         10),
    ('ar',         'Accounts Receivable','document.jl_subledger_type','AR subledger',         20),
    ('asset',      'Asset',            'document.jl_subledger_type', 'Fixed asset subledger', 30),
    ('inventory',  'Inventory',        'document.jl_subledger_type', 'Inventory subledger',   40),
    ('wip',        'WIP',              'document.jl_subledger_type', 'Work in progress subledger', 50),
    ('commission', 'Commission',       'document.jl_subledger_type', 'Commission subledger',  60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
