INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('bracket',   'Tax Bracket',     'control.rate_table_kind', 'Progressive slab table: each row covers range_from→range_until at a specific rate',  10),
    ('tiered',    'Tiered Rate',     'control.rate_table_kind', 'Contribution rate varies by cumulative total (waterfall / step-down rates)',          20),
    ('statutory', 'Statutory Flat',  'control.rate_table_kind', 'Single flat rate mandated by law with an optional wage ceiling and cap amount',      30),
    ('lookup',    'Key Lookup',      'control.rate_table_kind', 'Multi-key lookup table; rows identified by key_values JSONB (age, category…)',       40),
    ('flat',      'Flat Rate',       'control.rate_table_kind', 'Single fixed rate applied to the entire base regardless of amount',                  50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
