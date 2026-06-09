-- LookupDomain/control/bank_format_rule_payment_network.sql
-- Lookup values for domain: control.bank_format_rule_payment_network
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('swift',          'SWIFT',          'control.bank_format_rule_payment_network', 'SWIFT international wire',     10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('sepa',           'SEPA',           'control.bank_format_rule_payment_network', 'Single Euro Payments Area',    20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('ach',            'ACH',            'control.bank_format_rule_payment_network', 'US Automated Clearing House',  30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('local_transfer', 'Local Transfer', 'control.bank_format_rule_payment_network', 'Domestic bank transfer',       40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('rtgs',           'RTGS',           'control.bank_format_rule_payment_network', 'Real-Time Gross Settlement',   50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('giro',           'Giro',           'control.bank_format_rule_payment_network', 'Giro payment',                 60, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('check',          'Check / Cheque', 'control.bank_format_rule_payment_network', 'Paper check or cheque',        70, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);

-- Extended payment networks (non-bank rails, added by payment method engine)
INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('upi',           'UPI',           'control.bank_format_rule_payment_network', 'India Unified Payments Interface',  80, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('mobile_money',  'Mobile Money',  'control.bank_format_rule_payment_network', 'Mobile money (M-Pesa, GCash)',     90, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('wallet_payout', 'Wallet Payout', 'control.bank_format_rule_payment_network', 'Digital wallet payout',           100, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('push_to_card',  'Push to Card',  'control.bank_format_rule_payment_network', 'Visa Direct / Mastercard Send',   110, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('email_payout',  'Email Payout',  'control.bank_format_rule_payment_network', 'Email-addressed payout',          120, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
