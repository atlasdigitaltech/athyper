-- Used by: payment_term_clause.calc_mode.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('percentage',    'Percentage',    'master.payment_term_calc_mode', 'Amount = basis × default_pct / 100',           10),
    ('fixed_amount',  'Fixed Amount',  'master.payment_term_calc_mode', 'Amount is a fixed currency value',              20),
    ('formula',       'Formula',       'master.payment_term_calc_mode', 'Amount derived from a formula expression',      30),
    ('rate_table',    'Rate Table',    'master.payment_term_calc_mode', 'Amount looked up from a tiered rate table',     40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
