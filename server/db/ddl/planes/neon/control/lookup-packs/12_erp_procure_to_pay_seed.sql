-- seed-contract-version: 1
-- seed-pack: neon.control.lookup.erp_procure_to_pay
-- seed-pack-version: 1.0.0
-- seed-dataset: neon.control.lookup.erp_procure_to_pay
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:163
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/control/bank_format_rule_payment_network.sql,server/db/seed/platform/000_lookups/LookupDomain/control/payment_settlement_posting_role.sql,server/db/seed/platform/000_lookups/LookupDomain/document/commitment_fx_policy.sql,server/db/seed/platform/000_lookups/LookupDomain/document/purchase_invoice_advance_type.sql,server/db/seed/platform/000_lookups/LookupDomain/document/purchase_invoice_application_strategy.sql,server/db/seed/platform/000_lookups/LookupDomain/document/purchase_invoice_credit_reason.sql,server/db/seed/platform/000_lookups/LookupDomain/document/purchase_invoice_debit_reason.sql,server/db/seed/platform/000_lookups/LookupDomain/document/purchase_invoice_recovery_method.sql,server/db/seed/platform/000_lookups/LookupDomain/document/purchase_invoice_release_type.sql,server/db/seed/platform/000_lookups/LookupDomain/document/purchase_invoice_tax_mode.sql,server/db/seed/platform/000_lookups/LookupDomain/document/purchase_invoice_tax_mode_source.sql,server/db/seed/platform/000_lookups/LookupDomain/master/party_payment_terms.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_date_flexibility.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_due_rule_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_method_direction.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_method_instrument_mode.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_term_applicable_to.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_term_basis_amount_mode.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_term_discount_basis_mode.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_term_flexibility_mode.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_term_recovery_method.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_term_release_event.sql,server/db/seed/platform/000_lookups/LookupDomain/master/payment_term_trigger_event.sql,server/db/seed/platform/000_lookups/LookupDomain/master/supplier_business_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/supplier_legal_form.sql,server/db/seed/platform/000_lookups/LookupDomain/master/supplier_payment_method.sql,server/db/seed/platform/000_lookups/LookupDomain/master/supplier_tax_classification.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_procure_to_pay: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('control.bank_format_rule_payment_network', 'Payment network', 'Payment rail / clearing network.', 'control', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('control.payment_settlement_posting_role', 'Payment settlement posting role', 'Posting role codes used in payment settlement rules.', 'control', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.commitment_fx_policy', 'Commitment FX Policy', 'How exchange rates are captured for a commitment: spot_on_event, fixed_at_commitment, manual_contract_rate. Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.purchase_invoice_advance_type', 'Purchase Invoice Advance Type', 'Commercial basis for an advance payment (% of contract value, fixed amount, milestone). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.purchase_invoice_application_strategy', 'Purchase Invoice Application Strategy', 'How a credit or debit is applied to open payables (apply now, hold, pro-rata, net). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.purchase_invoice_credit_reason', 'Purchase Invoice Credit Reason', 'Reason selected for a supplier credit note. Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.purchase_invoice_debit_reason', 'Purchase Invoice Debit Reason', 'Reason selected for a buyer-issued debit note. Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.purchase_invoice_recovery_method', 'Purchase Invoice Recovery Method', 'How an advance payment is recovered from future invoices. Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.purchase_invoice_release_type', 'Purchase Invoice Retention Release Type', 'How retained balances are released (partial, full, milestone-based). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.purchase_invoice_tax_mode', 'Purchase Invoice Tax Mode', 'Interpretation of how tax_amount relates to Invoice Total: inclusive (tax within total), exclusive (tax added on top), or no_tax (exempt/zero-rated). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.purchase_invoice_tax_mode_source', 'Tax Mode Source', 'Records how tax_mode was determined on an AP invoice, for audit trail and UI attribution. Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.party_payment_terms', 'Payment terms (party)', 'Shared payment terms vocabulary for customer + supplier. is_extensible=true ??? tenants may define custom terms.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_date_flexibility', 'Payment Date Flexibility', 'Adjustment rule when due date falls on a non-business day (none, next_business_day, last_business_day, nearest_business_day). is_extensible=false ??? flexibility modes are engine constants.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_due_rule_type', 'Payment Due Rule Type', 'Algorithm for computing the due date (net_days, end_of_month, specific_day, installment). is_extensible=false ??? due rule drives the date calculation engine.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_method_direction', 'Payment method direction', 'Direction scope. Shared across method, policy, binding, settlement.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_method_instrument_mode', 'Instrument mode', 'Instrument classification.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_term_applicable_to', 'Payment Term Applicable To', 'Party direction for which a payment term applies (supplier, customer, intercompany, both). is_extensible=false ??? direction is a platform-governed billing invariant.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_term_basis_amount_mode', 'Payment Term Basis Amount Mode', 'What the percentage/formula is calculated on (gross, net, pre_tax, line_total). is_extensible=false ??? basis drives engine calculation.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_term_discount_basis_mode', 'Payment Discount Basis Mode', 'Calculation basis for early-payment discount tiers (percentage_of_gross, percentage_of_net, fixed_amount, tiered). is_extensible=false ??? basis drives discount engine.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_term_flexibility_mode', 'Payment Term Flexibility Mode', 'Editability of a clause after term application (fixed, flexible, negotiable). is_extensible=false ??? engine constant.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_term_recovery_method', 'Payment term recovery method', 'Methods for recovering advance or retention amounts: pro-rata, lump-sum, milestone-based, etc. Tenant-extensible.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_term_release_event', 'Payment term release event', 'Events that trigger retention release: practical completion, final acceptance, DLP expiry, etc. Tenant-extensible.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.payment_term_trigger_event', 'Payment term trigger event', 'Events that trigger payment term milestones: PO approval, contract signing, invoice, etc. Tenant-extensible.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.supplier_business_type', 'Supplier Business Type', 'Nature of business for supplier profiling. Multi-value ??? a supplier can have more than one type.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.supplier_legal_form', 'Supplier Legal Form', 'Legal incorporation form for supplier entities (Sdn Bhd, PLC, Partnership, etc.).', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.supplier_payment_method', 'Supplier payment method', 'How supplier is paid (wire, check, ACH, card, netting, cash). is_extensible=true ??? tenants may add custom methods.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.supplier_tax_classification', 'Supplier Tax Classification', 'Tax entity classification for a supplier in a given jurisdiction.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  source_schema = excluded.source_schema, is_extensible = excluded.is_extensible,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_domain.name, control.lookup_domain.description,
       control.lookup_domain.source_schema, control.lookup_domain.is_extensible,
       control.lookup_domain.metadata, control.lookup_domain.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.source_schema,
       excluded.is_extensible, excluded.metadata, excluded.status);

INSERT INTO control.lookup_value
  (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
VALUES
  ('swift', 'SWIFT', 'control.bank_format_rule_payment_network', 'SWIFT international wire', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sepa', 'SEPA', 'control.bank_format_rule_payment_network', 'Single Euro Payments Area', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ach', 'ACH', 'control.bank_format_rule_payment_network', 'US Automated Clearing House', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('local_transfer', 'Local Transfer', 'control.bank_format_rule_payment_network', 'Domestic bank transfer', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('rtgs', 'RTGS', 'control.bank_format_rule_payment_network', 'Real-Time Gross Settlement', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('giro', 'Giro', 'control.bank_format_rule_payment_network', 'Giro payment', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('check', 'Check / Cheque', 'control.bank_format_rule_payment_network', 'Paper check or cheque', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upi', 'UPI', 'control.bank_format_rule_payment_network', 'India Unified Payments Interface', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('mobile_money', 'Mobile Money', 'control.bank_format_rule_payment_network', 'Mobile money (M-Pesa, GCash)', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('wallet_payout', 'Wallet Payout', 'control.bank_format_rule_payment_network', 'Digital wallet payout', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('push_to_card', 'Push to Card', 'control.bank_format_rule_payment_network', 'Visa Direct / Mastercard Send', NULL, 110, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('email_payout', 'Email Payout', 'control.bank_format_rule_payment_network', 'Email-addressed payout', NULL, 120, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap_clearing', 'AP Clearing', 'control.payment_settlement_posting_role', 'Accounts payable clearing', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ar_clearing', 'AR Clearing', 'control.payment_settlement_posting_role', 'Accounts receivable clearing', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('bank_settlement', 'Bank Settlement', 'control.payment_settlement_posting_role', 'Cash/bank settlement', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('wallet_settlement', 'Wallet Settlement', 'control.payment_settlement_posting_role', 'Digital wallet settlement', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('bank_fee', 'Bank Fee', 'control.payment_settlement_posting_role', 'Bank charges and transaction fees', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('gateway_fee', 'Gateway Fee', 'control.payment_settlement_posting_role', 'Payment gateway processing fee', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('card_fee', 'Card Processing Fee', 'control.payment_settlement_posting_role', 'Card network / interchange fee', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('discount_earned', 'Discount Earned', 'control.payment_settlement_posting_role', 'Early payment discount captured', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('discount_given', 'Discount Given', 'control.payment_settlement_posting_role', 'Settlement discount offered to customer', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fx_gain', 'FX Gain', 'control.payment_settlement_posting_role', 'Foreign exchange gain on settlement', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fx_loss', 'FX Loss', 'control.payment_settlement_posting_role', 'Foreign exchange loss on settlement', NULL, 110, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('chargeback', 'Chargeback', 'control.payment_settlement_posting_role', 'Card/gateway chargeback or dispute', NULL, 120, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payment_suspense', 'Payment Suspense', 'control.payment_settlement_posting_role', 'Unmatched or unallocated payment suspense', NULL, 130, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('prepaid_clearing', 'Prepaid Clearing', 'control.payment_settlement_posting_role', 'Prepaid card / stored-value clearing', NULL, 140, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upi_settlement', 'UPI Settlement', 'control.payment_settlement_posting_role', 'UPI payment settlement (India)', NULL, 150, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap_trade_payable', 'AP Trade Payable', 'control.payment_settlement_posting_role', 'Balance-sheet liability credited on invoice post; debited on payment post. Distinct from ap_clearing: this is the permanent trade payable (IFRS-L-AP-TRADE).', NULL, 200, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('input_tax_recoverable', 'Input Tax Recoverable', 'control.payment_settlement_posting_role', 'Recoverable input VAT/GST on AP invoices. Debited at invoice post. Settles against output tax in periodic tax return.', NULL, 210, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('wht_payable', 'Withholding Tax Payable', 'control.payment_settlement_posting_role', 'Withholding tax deducted from supplier payment at invoice post. Credited on post; remitted to tax authority on due date.', NULL, 220, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap_retention_payable', 'AP Retention Payable', 'control.payment_settlement_posting_role', 'Retention amount withheld from supplier payment until milestone / DLP expiry. Credit on invoice post; debit on retention release payment. IS A LIABILITY (IFRS-L-AP-RETENTION), not a receivable asset.', NULL, 230, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap_advance_recovery', 'AP Advance Recovery', 'control.payment_settlement_posting_role', 'Intermediate role used when an invoice recovers a previously-paid advance. Credit on invoice post (reduces payable); debit on the advance payment. Net effect: reduces AP Advance balance.', NULL, 240, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('spot_on_event', 'Spot on Event', 'document.commitment_fx_policy', 'Rate captured at each fulfilment / invoice event using the spot rate at that time.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fixed_at_commitment', 'Fixed at Commitment', 'document.commitment_fx_policy', 'Rate frozen at the commitment header and applied to every downstream event.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('manual_contract_rate', 'Manual Contract Rate', 'document.commitment_fx_policy', 'Contractually agreed rate maintained manually on the commitment; may be superseded by amendment.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('percent_contract_value', '% of contract value', 'document.purchase_invoice_advance_type', 'Advance calculated as a percentage of contract value.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fixed_amount', 'Fixed amount', 'document.purchase_invoice_advance_type', 'Advance entered as a fixed amount.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('milestone_advance', 'Milestone advance', 'document.purchase_invoice_advance_type', 'Advance linked to a milestone.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('apply_now', 'Apply now to specific invoice', 'document.purchase_invoice_application_strategy', 'Apply against the selected original invoice.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('hold_for_allocation', 'Hold for future allocation', 'document.purchase_invoice_application_strategy', 'Hold the adjustment for future allocation.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pro_rata_open_balance', 'Apply pro-rata across open balance', 'document.purchase_invoice_application_strategy', 'Apply across the supplier open balance.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('next_payment_run', 'Net against next payment run', 'document.purchase_invoice_application_strategy', 'Net against the next supplier payment run.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('price_adjustment', 'Price adjustment', 'document.purchase_invoice_credit_reason', 'Post-invoice price correction.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('goods_returned', 'Goods returned', 'document.purchase_invoice_credit_reason', 'Supplier credit for returned goods.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('allowance_discount', 'Allowance / discount', 'document.purchase_invoice_credit_reason', 'Supplier allowance or discount credit.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('billing_error', 'Billing error', 'document.purchase_invoice_credit_reason', 'Correction for a billing error.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tax_correction', 'Tax correction', 'document.purchase_invoice_credit_reason', 'Correction of tax treatment or amount.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('other', 'Other', 'document.purchase_invoice_credit_reason', 'Other credit reason.', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('damaged_goods', 'Damaged goods', 'document.purchase_invoice_debit_reason', 'Debit raised for damaged goods.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('short_delivery', 'Short delivery', 'document.purchase_invoice_debit_reason', 'Debit raised for a delivery shortfall.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sla_penalty', 'Penalty / SLA breach', 'document.purchase_invoice_debit_reason', 'Debit raised for a contractual penalty.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('rebate', 'Rebate', 'document.purchase_invoice_debit_reason', 'Debit raised for a rebate.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('freight_back_charge', 'Freight back-charge', 'document.purchase_invoice_debit_reason', 'Debit raised for freight charged back to supplier.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('other', 'Other', 'document.purchase_invoice_debit_reason', 'Other debit reason.', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('next_3_invoices', 'Auto-recover from next 3 invoices', 'document.purchase_invoice_recovery_method', 'Recover evenly from the next three invoices.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('proportional', 'Auto-recover proportionally', 'document.purchase_invoice_recovery_method', 'Recover proportionally from future invoices.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('manual_allocation', 'Manual allocation only', 'document.purchase_invoice_recovery_method', 'Recover only when manually allocated.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('partial', 'Partial', 'document.purchase_invoice_release_type', 'Release part of the selected retention balance.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('full_release', 'Full release', 'document.purchase_invoice_release_type', 'Release all selected retention balance.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('milestone_based', 'Milestone-based', 'document.purchase_invoice_release_type', 'Release based on milestone completion.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('inclusive', 'Inclusive', 'document.purchase_invoice_tax_mode', 'Tax is included within Invoice Total. Net = Total ?? (1 + rate). Common in B2C and many VAT jurisdictions.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('exclusive', 'Exclusive', 'document.purchase_invoice_tax_mode', 'Tax is added on top of Invoice Total. Payable = Total + Tax. Common in B2B and GST regimes.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('no_tax', 'No Tax', 'document.purchase_invoice_tax_mode', 'Invoice is tax-exempt or zero-rated. tax_amount must be 0.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('supplier_profile', 'Supplier Profile', 'document.purchase_invoice_tax_mode_source', 'Tax mode defaulted from the supplier''s tax configuration profile.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tax_group', 'Tax Group', 'document.purchase_invoice_tax_mode_source', 'Tax mode inferred from the invoice''s tax group settings.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('company_default', 'Company Default', 'document.purchase_invoice_tax_mode_source', 'Tax mode set from the company code''s default tax configuration.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('user_override', 'User Override', 'document.purchase_invoice_tax_mode_source', 'Tax mode was manually overridden by the user (requires ap.override_tax_mode permission).', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cannot_infer', 'Cannot Infer', 'document.purchase_invoice_tax_mode_source', 'System could not determine tax mode from available supplier/tax data ??? user must enter manually.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('net_15', 'Net 15', 'master.party_payment_terms', 'Payment due in 15 days', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('net_30', 'Net 30', 'master.party_payment_terms', 'Payment due in 30 days', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('net_45', 'Net 45', 'master.party_payment_terms', 'Payment due in 45 days', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('net_60', 'Net 60', 'master.party_payment_terms', 'Payment due in 60 days', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('net_90', 'Net 90', 'master.party_payment_terms', 'Payment due in 90 days', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cod', 'COD', 'master.party_payment_terms', 'Cash on delivery', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('prepaid', 'Prepaid', 'master.party_payment_terms', 'Payment before delivery', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('none', 'No Adjustment', 'master.payment_date_flexibility', 'Due date is not adjusted for non-business days', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('next_business_day', 'Next Business Day', 'master.payment_date_flexibility', 'Move to the next available business day if non-business', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('last_business_day', 'Last Business Day', 'master.payment_date_flexibility', 'Move to the preceding business day if non-business', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('nearest_business_day', 'Nearest Business Day', 'master.payment_date_flexibility', 'Move to whichever business day is closest', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('net_days', 'Net Days', 'master.payment_due_rule_type', 'Due N days from base event date', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('end_of_month', 'End of Month', 'master.payment_due_rule_type', 'Due on the last day of the month', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('specific_day', 'Specific Day', 'master.payment_due_rule_type', 'Due on a specific day of month (e.g. day 15)', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('installment', 'Installment', 'master.payment_due_rule_type', 'Spread across multiple installment due dates', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('outbound', 'Outbound', 'master.payment_method_direction', 'Disbursement / payment sent', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('inbound', 'Inbound', 'master.payment_method_direction', 'Collection / payment received', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('both', 'Both', 'master.payment_method_direction', 'Applicable in both directions', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('bank_transfer', 'Bank Transfer', 'master.payment_method_instrument_mode', 'Wire, RTGS, local transfer, UPI', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('check', 'Check / Cheque', 'master.payment_method_instrument_mode', 'Paper check or demand draft', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cash', 'Cash', 'master.payment_method_instrument_mode', 'Physical cash payment', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('card', 'Card', 'master.payment_method_instrument_mode', 'Credit / debit / prepaid card', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('gateway', 'Payment Gateway', 'master.payment_method_instrument_mode', 'Third-party gateway (Stripe, Adyen)', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('direct_debit', 'Direct Debit', 'master.payment_method_instrument_mode', 'Pull payment from payer account', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('netting', 'Netting', 'master.payment_method_instrument_mode', 'Offset AP against AR', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('offset', 'Internal Offset', 'master.payment_method_instrument_mode', 'Internal intercompany offset', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upi', 'UPI', 'master.payment_method_instrument_mode', 'India Unified Payments Interface', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('wallet_transfer', 'Wallet Transfer', 'master.payment_method_instrument_mode', 'Digital wallet payout (Wise, PayPal)', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('supplier', 'Supplier', 'master.payment_term_applicable_to', 'Applies to outbound AP payments to suppliers', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('customer', 'Customer', 'master.payment_term_applicable_to', 'Applies to inbound AR payments from customers', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('intercompany', 'Intercompany', 'master.payment_term_applicable_to', 'Applies to intercompany settlements', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('both', 'Both', 'master.payment_term_applicable_to', 'Applies to both supplier and customer terms', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('gross', 'Gross', 'master.payment_term_basis_amount_mode', 'Percentage applies to gross amount (before discounts/tax)', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('net', 'Net', 'master.payment_term_basis_amount_mode', 'Percentage applies to net amount (after all discounts)', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pre_tax', 'Pre-Tax', 'master.payment_term_basis_amount_mode', 'Percentage applies to amount before tax is added', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('line_total', 'Line Total', 'master.payment_term_basis_amount_mode', 'Percentage applies to the individual line item total', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('percentage_of_gross', 'Percentage of Gross', 'master.payment_term_discount_basis_mode', 'Discount % applied to gross invoice total', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('percentage_of_net', 'Percentage of Net', 'master.payment_term_discount_basis_mode', 'Discount % applied to net (post-deduction) total', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fixed_amount', 'Fixed Amount', 'master.payment_term_discount_basis_mode', 'Fixed currency discount independent of invoice total', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tiered', 'Tiered', 'master.payment_term_discount_basis_mode', 'Discount determined by payment amount tier bracket', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fixed', 'Fixed', 'master.payment_term_flexibility_mode', 'Clause amounts and dates are locked after application', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('flexible', 'Flexible', 'master.payment_term_flexibility_mode', 'Amounts can be adjusted within min/max bounds', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('negotiable', 'Negotiable', 'master.payment_term_flexibility_mode', 'Open for negotiation on each individual transaction', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pro_rata', 'Pro Rata', 'master.payment_term_recovery_method', 'Recovered proportionally across invoices', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('lump_sum_first', 'Lump Sum First', 'master.payment_term_recovery_method', 'Recovered as lump sum from the first invoice', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('milestone_based', 'Milestone Based', 'master.payment_term_recovery_method', 'Recovered at defined milestones', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('equal_installment', 'Equal Installment', 'master.payment_term_recovery_method', 'Recovered in equal installments across invoices', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('practical_completion', 'Practical Completion', 'master.payment_term_release_event', 'Released upon practical completion of works', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('final_acceptance', 'Final Acceptance', 'master.payment_term_release_event', 'Released upon final acceptance', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('dlp_expiry', 'DLP Expiry', 'master.payment_term_release_event', 'Released when defects liability period expires', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('warranty_expiry', 'Warranty Expiry', 'master.payment_term_release_event', 'Released when warranty period expires', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('custom_milestone', 'Custom Milestone', 'master.payment_term_release_event', 'Released on a custom-defined milestone', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('gazette_notification', 'Gazette Notification', 'master.payment_term_release_event', 'Released upon gazette notification', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('on_po_approval', 'On PO Approval', 'master.payment_term_trigger_event', 'Triggered when the purchase order is approved', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('on_contract_signing', 'On Contract Signing', 'master.payment_term_trigger_event', 'Triggered when the contract is signed', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('on_mobilization', 'On Mobilization', 'master.payment_term_trigger_event', 'Triggered when mobilization begins', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('on_first_delivery', 'On First Delivery', 'master.payment_term_trigger_event', 'Triggered on the first delivery of goods', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('on_invoice', 'On Invoice', 'master.payment_term_trigger_event', 'Triggered when the invoice is received', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('on_payment', 'On Payment', 'master.payment_term_trigger_event', 'Triggered when the payment is made', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('on_final_acceptance', 'On Final Acceptance', 'master.payment_term_trigger_event', 'Triggered when final acceptance is confirmed', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('service_provider', 'Service Provider', 'master.supplier_business_type', 'Provides services rather than physical goods', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('goods_manufacturer', 'Goods Manufacturer', 'master.supplier_business_type', 'Manufactures physical goods', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('distributor', 'Distributor', 'master.supplier_business_type', 'Distributes goods from manufacturer to buyers', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('retailer', 'Retailer', 'master.supplier_business_type', 'Sells goods directly to end consumers', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('logistics_provider', 'Logistics Provider', 'master.supplier_business_type', 'Freight, courier, 3PL, or warehousing services', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('technology_provider', 'Technology Provider', 'master.supplier_business_type', 'Software, hardware, IT infrastructure or SaaS', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('professional_services', 'Professional Services', 'master.supplier_business_type', 'Legal, audit, consulting, advisory', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('construction', 'Construction / Engineering', 'master.supplier_business_type', 'Civil, structural, or MEP works', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('financial_services', 'Financial Services', 'master.supplier_business_type', 'Banking, insurance, leasing, fintech', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('government', 'Government Body', 'master.supplier_business_type', 'Public sector / statutory authority supplier', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ngo', 'NGO / Non-Profit', 'master.supplier_business_type', 'Non-governmental or charitable organisation', NULL, 110, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('other', 'Other', 'master.supplier_business_type', 'Business type not otherwise classified', NULL, 120, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('private_limited', 'Private Limited Company', 'master.supplier_legal_form', 'Sdn Bhd / Pte Ltd / Ltd / LLC', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('public_listed', 'Public Listed Company', 'master.supplier_legal_form', 'Berhad / PLC / Corp listed on a stock exchange', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('partnership', 'Partnership', 'master.supplier_legal_form', 'General or limited partnership', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('llp', 'Limited Liability Partnership', 'master.supplier_legal_form', 'LLP structure', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sole_proprietor', 'Sole Proprietor', 'master.supplier_legal_form', 'Single-owner business', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cooperative', 'Cooperative', 'master.supplier_legal_form', 'Member-owned cooperative or society', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('government', 'Government / Statutory Body', 'master.supplier_legal_form', 'Government-owned entity or statutory authority', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ngo', 'NGO / Non-Profit', 'master.supplier_legal_form', 'Non-governmental or charitable organisation', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('branch', 'Branch Office', 'master.supplier_legal_form', 'Branch or representative office of a foreign entity', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('other', 'Other', 'master.supplier_legal_form', 'Other legal form not listed above', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('wire', 'Wire transfer', 'master.supplier_payment_method', 'Bank wire transfer', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('check', 'Check', 'master.supplier_payment_method', 'Paper check', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ach', 'ACH', 'master.supplier_payment_method', 'Automated clearing house', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('card', 'Card', 'master.supplier_payment_method', 'Credit/debit card', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('netting', 'Netting', 'master.supplier_payment_method', 'Offset against receivable', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cash', 'Cash', 'master.supplier_payment_method', 'Cash payment', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('company', 'Company', 'master.supplier_tax_classification', 'Incorporated company subject to corporate tax', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('individual', 'Individual', 'master.supplier_tax_classification', 'Natural person / sole trader', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('partnership', 'Partnership', 'master.supplier_tax_classification', 'Partnership entity', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('government', 'Government', 'master.supplier_tax_classification', 'Government body or statutory authority', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('non_profit', 'Non-Profit / NGO', 'master.supplier_tax_classification', 'Charitable or non-profit organisation', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('exempt', 'Tax Exempt', 'master.supplier_tax_classification', 'Entity with formal tax-exempt status', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('other', 'Other', 'master.supplier_tax_classification', 'Classification not otherwise listed', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  sort_order = excluded.sort_order, is_system = excluded.is_system,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_value.name, control.lookup_value.description,
       control.lookup_value.category, control.lookup_value.sort_order,
       control.lookup_value.is_system, control.lookup_value.metadata,
       control.lookup_value.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.category, excluded.sort_order,
       excluded.is_system, excluded.metadata, excluded.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.bank_format_rule_payment_network', 'control.payment_settlement_posting_role', 'document.commitment_fx_policy', 'document.purchase_invoice_advance_type', 'document.purchase_invoice_application_strategy', 'document.purchase_invoice_credit_reason', 'document.purchase_invoice_debit_reason', 'document.purchase_invoice_recovery_method', 'document.purchase_invoice_release_type', 'document.purchase_invoice_tax_mode', 'document.purchase_invoice_tax_mode_source', 'master.party_payment_terms', 'master.payment_date_flexibility', 'master.payment_due_rule_type', 'master.payment_method_direction', 'master.payment_method_instrument_mode', 'master.payment_term_applicable_to', 'master.payment_term_basis_amount_mode', 'master.payment_term_discount_basis_mode', 'master.payment_term_flexibility_mode', 'master.payment_term_recovery_method', 'master.payment_term_release_event', 'master.payment_term_trigger_event', 'master.supplier_business_type', 'master.supplier_legal_form', 'master.supplier_payment_method', 'master.supplier_tax_classification'])) <> 163 THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_procure_to_pay: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['control.bank_format_rule_payment_network', 'control.payment_settlement_posting_role', 'document.commitment_fx_policy', 'document.purchase_invoice_advance_type', 'document.purchase_invoice_application_strategy', 'document.purchase_invoice_credit_reason', 'document.purchase_invoice_debit_reason', 'document.purchase_invoice_recovery_method', 'document.purchase_invoice_release_type', 'document.purchase_invoice_tax_mode', 'document.purchase_invoice_tax_mode_source', 'master.party_payment_terms', 'master.payment_date_flexibility', 'master.payment_due_rule_type', 'master.payment_method_direction', 'master.payment_method_instrument_mode', 'master.payment_term_applicable_to', 'master.payment_term_basis_amount_mode', 'master.payment_term_discount_basis_mode', 'master.payment_term_flexibility_mode', 'master.payment_term_recovery_method', 'master.payment_term_release_event', 'master.payment_term_trigger_event', 'master.supplier_business_type', 'master.supplier_legal_form', 'master.supplier_payment_method', 'master.supplier_tax_classification']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_procure_to_pay: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.bank_format_rule_payment_network', 'control.payment_settlement_posting_role', 'document.commitment_fx_policy', 'document.purchase_invoice_advance_type', 'document.purchase_invoice_application_strategy', 'document.purchase_invoice_credit_reason', 'document.purchase_invoice_debit_reason', 'document.purchase_invoice_recovery_method', 'document.purchase_invoice_release_type', 'document.purchase_invoice_tax_mode', 'document.purchase_invoice_tax_mode_source', 'master.party_payment_terms', 'master.payment_date_flexibility', 'master.payment_due_rule_type', 'master.payment_method_direction', 'master.payment_method_instrument_mode', 'master.payment_term_applicable_to', 'master.payment_term_basis_amount_mode', 'master.payment_term_discount_basis_mode', 'master.payment_term_flexibility_mode', 'master.payment_term_recovery_method', 'master.payment_term_release_event', 'master.payment_term_trigger_event', 'master.supplier_business_type', 'master.supplier_legal_form', 'master.supplier_payment_method', 'master.supplier_tax_classification']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_procure_to_pay: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.bank_format_rule_payment_network', 'control.payment_settlement_posting_role', 'document.commitment_fx_policy', 'document.purchase_invoice_advance_type', 'document.purchase_invoice_application_strategy', 'document.purchase_invoice_credit_reason', 'document.purchase_invoice_debit_reason', 'document.purchase_invoice_recovery_method', 'document.purchase_invoice_release_type', 'document.purchase_invoice_tax_mode', 'document.purchase_invoice_tax_mode_source', 'master.party_payment_terms', 'master.payment_date_flexibility', 'master.payment_due_rule_type', 'master.payment_method_direction', 'master.payment_method_instrument_mode', 'master.payment_term_applicable_to', 'master.payment_term_basis_amount_mode', 'master.payment_term_discount_basis_mode', 'master.payment_term_flexibility_mode', 'master.payment_term_recovery_method', 'master.payment_term_release_event', 'master.payment_term_trigger_event', 'master.supplier_business_type', 'master.supplier_legal_form', 'master.supplier_payment_method', 'master.supplier_tax_classification']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_procure_to_pay: semantic assertion failed';
  END IF;
END $assertions$;
