-- LookupDomain/master/bank_party_national_bank_code_type.sql
-- Lookup values for domain: master.bank_party_national_bank_code_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('aba',        'ABA Routing',        'master.bank_party_national_bank_code_type', 'US routing transit number',          10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('sort_code',  'UK Sort Code',       'master.bank_party_national_bank_code_type', 'UK bank branch identifier',          20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('ifsc',       'IFSC Code',          'master.bank_party_national_bank_code_type', 'India Financial System Code',        30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('bsb',        'BSB Number',         'master.bank_party_national_bank_code_type', 'Australia Bank-State-Branch',        40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('clabe_bank', 'CLABE Bank Code',    'master.bank_party_national_bank_code_type', 'Mexico CLABE bank identifier',      50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('bank_code',  'National Bank Code', 'master.bank_party_national_bank_code_type', 'Generic national bank code',        60, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('transit',    'Transit Number',     'master.bank_party_national_bank_code_type', 'Canada transit routing number',     70, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('blz',        'Bankleitzahl',       'master.bank_party_national_bank_code_type', 'Germany bank routing number',       80, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
