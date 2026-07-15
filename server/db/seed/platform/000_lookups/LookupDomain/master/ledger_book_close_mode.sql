INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('unified',     'Unified',     'master.ledger_book_close_mode', 'All books close together',                 10),
    ('independent', 'Independent', 'master.ledger_book_close_mode', 'Each book closes on its own schedule',     20),
    ('staggered',   'Staggered',   'master.ledger_book_close_mode', 'Books close in defined sequence',          30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
