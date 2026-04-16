-- LookupDomain/control/payment_settlement_posting_role.sql
-- Lookup values for domain: control.payment_settlement_posting_role

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('ap_clearing',        'AP Clearing',          'control.payment_settlement_posting_role', 'Accounts payable clearing',                   10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('ar_clearing',        'AR Clearing',          'control.payment_settlement_posting_role', 'Accounts receivable clearing',                20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('bank_settlement',    'Bank Settlement',      'control.payment_settlement_posting_role', 'Cash/bank settlement',                        30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('wallet_settlement',  'Wallet Settlement',    'control.payment_settlement_posting_role', 'Digital wallet settlement',                   40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('bank_fee',           'Bank Fee',             'control.payment_settlement_posting_role', 'Bank charges and transaction fees',            50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('gateway_fee',        'Gateway Fee',          'control.payment_settlement_posting_role', 'Payment gateway processing fee',              60, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('card_fee',           'Card Processing Fee',  'control.payment_settlement_posting_role', 'Card network / interchange fee',              70, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('discount_earned',    'Discount Earned',      'control.payment_settlement_posting_role', 'Early payment discount captured',             80, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('discount_given',     'Discount Given',       'control.payment_settlement_posting_role', 'Settlement discount offered to customer',     90, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('fx_gain',            'FX Gain',              'control.payment_settlement_posting_role', 'Foreign exchange gain on settlement',        100, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('fx_loss',            'FX Loss',              'control.payment_settlement_posting_role', 'Foreign exchange loss on settlement',        110, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('chargeback',         'Chargeback',           'control.payment_settlement_posting_role', 'Card/gateway chargeback or dispute',         120, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('payment_suspense',   'Payment Suspense',     'control.payment_settlement_posting_role', 'Unmatched or unallocated payment suspense',  130, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('prepaid_clearing',   'Prepaid Clearing',     'control.payment_settlement_posting_role', 'Prepaid card / stored-value clearing',       140, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('upi_settlement',     'UPI Settlement',       'control.payment_settlement_posting_role', 'UPI payment settlement (India)',             150, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
