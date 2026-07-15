INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('parent',        'Parent',        'master.legal_entity_type', 'Holding / parent company',        10),
    ('subsidiary',    'Subsidiary',    'master.legal_entity_type', 'Controlled subsidiary',           20),
    ('associate',     'Associate',     'master.legal_entity_type', 'Significant influence (20-50%)',  30),
    ('joint_venture', 'Joint Venture', 'master.legal_entity_type', 'Jointly controlled entity',       40),
    ('branch',        'Branch',        'master.legal_entity_type', 'Branch of parent',                50),
    ('standalone',    'Standalone',    'master.legal_entity_type', 'Single-entity tenant',            60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
