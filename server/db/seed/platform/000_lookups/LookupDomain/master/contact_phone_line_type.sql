-- LookupDomain/master/contact_phone_line_type.sql
-- Lookup values for domain: master.contact_phone_line_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('mobile',    'Mobile',    'master.contact_phone_line_type', 'Mobile / cellular number',         10),
    ('landline',  'Landline',  'master.contact_phone_line_type', 'Fixed landline / PSTN number',     20),
    ('voip',      'VoIP',      'master.contact_phone_line_type', 'Voice over IP number',             30),
    ('fax',       'Fax',       'master.contact_phone_line_type', 'Facsimile / fax line',             40),
    ('toll_free', 'Toll-Free', 'master.contact_phone_line_type', 'Toll-free number (0800 / 1800)',   50),
    ('satellite', 'Satellite', 'master.contact_phone_line_type', 'Satellite phone number',           60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
