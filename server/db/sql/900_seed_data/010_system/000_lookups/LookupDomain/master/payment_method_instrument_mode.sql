-- Lookup values for domain: master.payment_method_instrument_mode

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('bank_transfer',  'Bank Transfer',    'master.payment_method_instrument_mode', 'Wire, RTGS, local transfer, UPI',             10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('check',          'Check / Cheque',   'master.payment_method_instrument_mode', 'Paper check or demand draft',                 20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('cash',           'Cash',             'master.payment_method_instrument_mode', 'Physical cash payment',                       30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('card',           'Card',             'master.payment_method_instrument_mode', 'Credit / debit / prepaid card',               40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('gateway',        'Payment Gateway',  'master.payment_method_instrument_mode', 'Third-party gateway (Stripe, Adyen)',         50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('direct_debit',   'Direct Debit',     'master.payment_method_instrument_mode', 'Pull payment from payer account',             60, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('netting',        'Netting',          'master.payment_method_instrument_mode', 'Offset AP against AR',                        70, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('offset',         'Internal Offset',  'master.payment_method_instrument_mode', 'Internal intercompany offset',                80, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('upi',            'UPI',              'master.payment_method_instrument_mode', 'India Unified Payments Interface',            90, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('wallet_transfer','Wallet Transfer',  'master.payment_method_instrument_mode', 'Digital wallet payout (Wise, PayPal)',        100, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
