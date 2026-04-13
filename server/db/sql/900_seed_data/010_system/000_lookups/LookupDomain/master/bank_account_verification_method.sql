-- Lookup values for domain: master.bank_account_verification_method
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('micro_deposit',   'Micro-Deposit',       'master.bank_account_verification_method', 'Trial amounts verification',          10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('bank_letter',     'Bank Letter',         'master.bank_account_verification_method', 'Official bank confirmation',          20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('cancelled_cheque','Cancelled Cheque',     'master.bank_account_verification_method', 'Cancelled cheque image',              30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('vendor_portal',   'Vendor Portal',       'master.bank_account_verification_method', 'Self-service vendor portal entry',    40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('manual',          'Manual Verification', 'master.bank_account_verification_method', 'Manually verified by staff',          50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('api_validation',  'API Validation',      'master.bank_account_verification_method', 'Bank API / open banking',             60, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
