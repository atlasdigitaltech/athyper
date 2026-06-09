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
    ('upi_settlement',     'UPI Settlement',       'control.payment_settlement_posting_role', 'UPI payment settlement (India)',             150, true, 'active', '00000000-0000-0000-0000-000000000000'),

    -- ── AP Non-PO cycle roles (added by AP Non-PO module) ──────────────────
    ('ap_trade_payable',
     'AP Trade Payable',
     'control.payment_settlement_posting_role',
     'Balance-sheet liability credited on invoice post; debited on payment post. '
     'Distinct from ap_clearing: this is the permanent trade payable (IFRS-L-AP-TRADE).',
     200, true, 'active', '00000000-0000-0000-0000-000000000000'),

    ('input_tax_recoverable',
     'Input Tax Recoverable',
     'control.payment_settlement_posting_role',
     'Recoverable input VAT/GST on AP invoices. Debited at invoice post. '
     'Settles against output tax in periodic tax return.',
     210, true, 'active', '00000000-0000-0000-0000-000000000000'),

    ('wht_payable',
     'Withholding Tax Payable',
     'control.payment_settlement_posting_role',
     'Withholding tax deducted from supplier payment at invoice post. '
     'Credited on post; remitted to tax authority on due date.',
     220, true, 'active', '00000000-0000-0000-0000-000000000000'),

    ('ap_retention_payable',
     'AP Retention Payable',
     'control.payment_settlement_posting_role',
     'Retention amount withheld from supplier payment until milestone / DLP expiry. '
     'Credit on invoice post; debit on retention release payment. '
     'IS A LIABILITY (IFRS-L-AP-RETENTION), not a receivable asset.',
     230, true, 'active', '00000000-0000-0000-0000-000000000000'),

    ('ap_advance_recovery',
     'AP Advance Recovery',
     'control.payment_settlement_posting_role',
     'Intermediate role used when an invoice recovers a previously-paid advance. '
     'Credit on invoice post (reduces payable); debit on the advance payment. '
     'Net effect: reduces AP Advance balance.',
     240, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
