-- LookupDomain/control/bank_format_rule_bank_id_type.sql
-- Lookup values for domain: control.bank_format_rule_bank_id_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('bic',       'BIC / SWIFT',   'control.bank_format_rule_bank_id_type', 'SWIFT/BIC institution code',          10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('aba',       'ABA Routing',   'control.bank_format_rule_bank_id_type', 'US ABA routing transit number',       20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('sort_code', 'UK Sort Code',  'control.bank_format_rule_bank_id_type', 'UK bank sort code',                   30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('ifsc',      'IFSC',          'control.bank_format_rule_bank_id_type', 'India Financial System Code',         40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('bsb',       'BSB',           'control.bank_format_rule_bank_id_type', 'Australia Bank-State-Branch',         50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('clabe',     'CLABE',         'control.bank_format_rule_bank_id_type', 'Mexico CLABE routing',                60, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('bank_code', 'Bank Code',     'control.bank_format_rule_bank_id_type', 'Generic national bank code',          70, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('none',      'None',          'control.bank_format_rule_bank_id_type', 'No bank identifier required',         80, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
