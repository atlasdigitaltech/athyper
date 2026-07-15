-- is_extensible = true: tenants may add custom recovery methods.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.payment_term_recovery_method',
       'Payment term recovery method',
       'Methods for recovering advance or retention amounts: pro-rata, lump-sum, milestone-based, etc. '
       'Tenant-extensible.',
       'master', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'master.payment_term_recovery_method'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('pro_rata',          'Pro Rata',          'master.payment_term_recovery_method', 'Recovered proportionally across invoices',          10),
    ('lump_sum_first',    'Lump Sum First',    'master.payment_term_recovery_method', 'Recovered as lump sum from the first invoice',      20),
    ('milestone_based',   'Milestone Based',   'master.payment_term_recovery_method', 'Recovered at defined milestones',                   30),
    ('equal_installment', 'Equal Installment', 'master.payment_term_recovery_method', 'Recovered in equal installments across invoices',   40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
