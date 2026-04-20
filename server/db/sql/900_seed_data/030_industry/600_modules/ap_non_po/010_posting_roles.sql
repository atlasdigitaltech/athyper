-- ============================================================================
-- FILE: blueprint/010_posting_roles.sql
-- Purpose: Add 5 Non-PO-specific posting roles to existing lookup domain
-- Depends on: control.lookup_domain 'control.payment_settlement_posting_role'
--             (seeded by base pack — domain is is_extensible=true)
-- Idempotent: WHERE NOT EXISTS guard
-- ============================================================================
-- Existing roles from base pack:
--   ap_clearing, ar_clearing, bank_settlement, wallet_settlement, bank_fee,
--   gateway_fee, card_fee, discount_earned, discount_given, fx_gain, fx_loss,
--   chargeback, payment_suspense, prepaid_clearing, upi_settlement
--
-- New roles added by this file (Non-PO cycle specific):
--   ap_trade_payable       — balance-sheet AP liability (distinct from ap_clearing)
--   input_tax_recoverable  — recoverable VAT/GST on AP invoices
--   wht_payable            — withholding tax deducted at invoice post, payable to authority
--   ap_retention_payable   — retention withheld on invoice, released on milestone
--   ap_advance_recovery    — intermediate when an invoice recovers a prior advance
-- ============================================================================

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('ap_trade_payable',
     'AP Trade Payable',
     'control.payment_settlement_posting_role',
     'Balance-sheet liability credited on invoice post; debited on payment post. '
     'Distinct from ap_clearing: this is the permanent trade payable (IFRS-L-AP-TRADE).',
     200),

    ('input_tax_recoverable',
     'Input Tax Recoverable',
     'control.payment_settlement_posting_role',
     'Recoverable input VAT/GST on AP invoices. Debited at invoice post. '
     'Settles against output tax in periodic tax return.',
     210),

    ('wht_payable',
     'Withholding Tax Payable',
     'control.payment_settlement_posting_role',
     'Withholding tax deducted from supplier payment at invoice post. '
     'Credited on post; remitted to tax authority on due date. '
     'Works together with WHT accumulators + certificate issuance.',
     220),

    ('ap_retention_payable',
     'AP Retention Payable',
     'control.payment_settlement_posting_role',
     'Retention amount withheld from supplier payment until milestone / DLP expiry. '
     'Credit on invoice post; debit on retention release payment. '
     'IS A LIABILITY (IFRS-L-AP-RETENTION), not a receivable asset.',
     230),

    ('ap_advance_recovery',
     'AP Advance Recovery',
     'control.payment_settlement_posting_role',
     'Intermediate role used when an invoice recovers a previously-paid advance. '
     'Credit on invoice post (reduces payable); debit on the advance payment was '
     'originally posted to AP Advance (asset). Net effect: reduces AP Advance balance.',
     240)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code
      AND x.code = v.code
      AND x.tenant_id IS NULL
);
