INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('standard',     'Standard',     'master.business_intent.visibility', 'Standard visibility.',     10),
    ('restricted',   'Restricted',   'master.business_intent.visibility', 'Restricted visibility.',   20),
    ('confidential', 'Confidential', 'master.business_intent.visibility', 'Confidential visibility.', 30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
