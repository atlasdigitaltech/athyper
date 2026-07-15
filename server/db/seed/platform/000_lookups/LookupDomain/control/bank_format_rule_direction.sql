INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('outbound', 'Outbound', 'control.bank_format_rule_direction', 'Payments sent',     10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('inbound',  'Inbound',  'control.bank_format_rule_direction', 'Payments received', 20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('both',     'Both',     'control.bank_format_rule_direction', 'Both directions',   30, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
