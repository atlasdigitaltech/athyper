-- Lookup values for domain: control.bank_interface_file_format

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('pain_001',       'ISO 20022 pain.001',   'control.bank_interface_file_format', 'SEPA/ISO credit transfer initiation',              10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('nacha_ccd',      'NACHA CCD',            'control.bank_interface_file_format', 'US ACH corporate credit/debit',                    20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('nacha_ppd',      'NACHA PPD',            'control.bank_interface_file_format', 'US ACH prearranged payment/deposit',               30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('mt101',          'SWIFT MT101',          'control.bank_interface_file_format', 'SWIFT request for transfer',                       40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('bank_csv',       'Bank CSV',             'control.bank_interface_file_format', 'Bank-specific CSV payment file',                   50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('bank_json',      'Bank JSON',            'control.bank_interface_file_format', 'Bank-specific JSON payment payload',               60, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('check_layout_a', 'Check Layout A',       'control.bank_interface_file_format', 'Standard check print layout',                      70, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('camt_053',       'ISO 20022 camt.053',   'control.bank_interface_file_format', 'Bank-to-customer statement',                       80, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('camt_054',       'ISO 20022 camt.054',   'control.bank_interface_file_format', 'Bank-to-customer debit/credit notification',       90, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
