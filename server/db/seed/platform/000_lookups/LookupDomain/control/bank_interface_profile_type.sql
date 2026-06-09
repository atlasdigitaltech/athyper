-- LookupDomain/control/bank_interface_profile_type.sql
-- Lookup values for domain: control.bank_interface_profile_type

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('file',        'File',        'control.bank_interface_profile_type', 'File-based (PAIN.001, NACHA, MT101)',         10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('api',         'API',         'control.bank_interface_profile_type', 'Real-time API (bank H2H, PSP, gateway)',     20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('check_print', 'Check Print', 'control.bank_interface_profile_type', 'Check printing / stock layout',              30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('manual',      'Manual',      'control.bank_interface_profile_type', 'Manual / offline processing',                40, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
