INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('opex',            'Opex',            'master.business_intent.domain', 'Operating expenditure.',  10),
    ('capex',           'Capex',           'master.business_intent.domain', 'Capital expenditure.',    20),
    ('revenue',         'Revenue',         'master.business_intent.domain', 'Revenue intent.',         30),
    ('cost_of_sales',   'Cost Of Sales',   'master.business_intent.domain', 'Cost of sales intent.',   40),
    ('transfer',        'Transfer',        'master.business_intent.domain', 'Transfer intent.',        50),
    ('regulatory',      'Regulatory',      'master.business_intent.domain', 'Regulatory intent.',      60),
    ('admin',           'Admin',           'master.business_intent.domain', 'Administrative intent.',  70),
    ('deferred_revenue','Deferred Revenue','master.business_intent.domain', 'Deferred revenue intent.', 80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
