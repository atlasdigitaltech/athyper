-- LookupDomain/master/bank_account_verification_method.sql
-- Lookup values for domain: master.bank_account_verification_method
-- Idempotent: WHERE NOT EXISTS guard

-- Migrate any existing 'vendor_portal' code rows to 'supplier_portal' (rename applied 2026-05)
UPDATE control.lookup_value
   SET code = 'supplier_portal', name = 'Supplier Portal', description = 'Self-service supplier portal entry'
 WHERE domain_code = 'master.bank_account_verification_method' AND code = 'vendor_portal' AND tenant_id IS NULL;

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('micro_deposit',   'Micro-Deposit',       'master.bank_account_verification_method', 'Trial amounts verification',          10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('bank_letter',     'Bank Letter',         'master.bank_account_verification_method', 'Official bank confirmation',          20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('cancelled_cheque','Cancelled Cheque',     'master.bank_account_verification_method', 'Cancelled cheque image',              30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('supplier_portal', 'Supplier Portal',     'master.bank_account_verification_method', 'Self-service supplier portal entry',  40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('manual',          'Manual Verification', 'master.bank_account_verification_method', 'Manually verified by staff',          50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('api_validation',  'API Validation',      'master.bank_account_verification_method', 'Bank API / open banking',             60, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
