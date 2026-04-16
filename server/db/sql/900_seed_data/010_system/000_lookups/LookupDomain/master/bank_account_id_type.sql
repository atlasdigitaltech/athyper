-- LookupDomain/master/bank_account_id_type.sql
-- Lookup values for domain: master.bank_account_id_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('iban',  'IBAN',          'master.bank_account_id_type', 'International Bank Account Number', 10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('local', 'Local Account', 'master.bank_account_id_type', 'Country-local account format',     20, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);

-- Extended account identifier types (non-bank channels, added by payment method engine)
INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('upi_vpa',    'UPI VPA',        'master.bank_account_id_type', 'India UPI Virtual Payment Address',  30, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('mobile',     'Mobile Number',  'master.bank_account_id_type', 'Mobile money number in E.164 format',40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('email',      'Email Address',  'master.bank_account_id_type', 'Email-linked payout (PayPal, Venmo)',50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('wallet_id',  'Wallet ID',      'master.bank_account_id_type', 'Provider wallet identifier',         60, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('card_token', 'Card Token',     'master.bank_account_id_type', 'Tokenized card for push-to-card',    70, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
