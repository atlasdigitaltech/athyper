-- seed-contract-version: 1
-- seed-pack: neon.control.lookup.catalog_p2p_lookup_values
-- seed-pack-version: 1.0.0
-- seed-dataset: neon.control.lookup.catalog_p2p_lookup_values
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:88
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/control/document_sequence_doc_type.sql,server/db/seed/platform/000_lookups/LookupDomain/document/je_source_doc_type.sql,server/db/seed/platform/000_lookups/LookupDomain/document/p2p_lookup_values.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_p2p_lookup_values: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('control.document_sequence_doc_type', 'Document sequence document type', 'Document types that require sequential numbering. Tenant-extensible — tenants may add custom document types.', 'control', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.acct_dist_account_source', 'Accounting Distribution Account Source', 'Provenance of the resolved GL account on an accounting distribution row (PENDING, PROFILE, FALLBACK). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.acct_dist_distribution_basis', 'Accounting Distribution Split Basis', 'How the split is calculated on an accounting distribution row (PERCENT, AMOUNT, QUANTITY). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.invoice_budget_check_result', 'Invoice Budget Check Result', 'Outcome of the budget availability check on a purchase invoice (PASSED, WARNED, OVERRIDE, BLOCKED, EXEMPT). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.invoice_match_status', 'Invoice Match Status', 'Three-way match progress status for an invoice or invoice line (unmatched, partially_matched, fully_matched, match_exception). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.invoice_match_type', 'Invoice Match Type', 'Matching strategy for AP invoices (three_way, two_way, evaluated_receipt, no_match). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.je_source_doc_type', 'Journal entry source document type', 'Originating document type for the journal entry. is_extensible=true — tenants may add custom source document types.', 'document', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.line_type', 'Invoice Line Type', 'Source classification for an invoice line (contract, catalog, marketplace, noncatalog). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.match_exception_type', 'Match Exception Type', 'Types of invoice matching exceptions (price_variance, quantity_variance, missing_receipt, duplicate_invoice, tax_variance, fx_variance, retention_variance, advance_recovery_mismatch). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.payment_entry_type', 'Payment Entry Type', 'Type of outbound payment (standard, retention_release, advance, final, partial, down_payment, netting, urgent). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.procurement_type', 'Invoice Line Procurement Type', 'Nature of the item or service on an invoice line (goods, services). Platform-governed.', 'document', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  ('purchase_invoice', 'Purchase Invoice', 'control.document_sequence_doc_type', 'Accounts Payable (AP) invoice from a supplier.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sales_invoice', 'Sales Invoice', 'control.document_sequence_doc_type', 'Accounts Receivable (AR) invoice to a customer.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('credit_note', 'Credit Note', 'control.document_sequence_doc_type', 'Credit memo issued to a customer or received from a supplier.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('debit_note', 'Debit Note', 'control.document_sequence_doc_type', 'Debit memo issued to a customer or sent to a supplier.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payment_entry', 'Payment Entry', 'control.document_sequence_doc_type', 'Payment made or received.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('journal_entry', 'Journal Entry', 'control.document_sequence_doc_type', 'Manual general ledger journal entry.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('delivery_note', 'Delivery Note', 'control.document_sequence_doc_type', 'Inbound logistics delivery artifact', NULL, 65, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('receipt', 'Receipt', 'control.document_sequence_doc_type', 'Receipt for inventory or asset inbound.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('service_sheet', 'Service Sheet', 'control.document_sequence_doc_type', 'Approvable service completion sheet', NULL, 72, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('purchase_requisition', 'Purchase Requisition', 'control.document_sequence_doc_type', 'Internal purchase request', NULL, 75, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('purchase_order', 'Purchase Order', 'control.document_sequence_doc_type', 'Purchase order sent to a supplier.', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('purchase_order_confirmation', 'PO Confirmation', 'control.document_sequence_doc_type', 'Supplier PO acknowledgement artifact', NULL, 82, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('invoice_match_case', 'Invoice Match Case', 'control.document_sequence_doc_type', 'Invoice reconciliation case header', NULL, 87, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sales_order', 'Sales Order', 'control.document_sequence_doc_type', 'Sales order from a customer.', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payment_remittance_output', 'Payment Remittance Output', 'control.document_sequence_doc_type', 'Remittance advice output to supplier', NULL, 95, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('commitment', 'Commitment', 'control.document_sequence_doc_type', 'Budget commitment or encumbrance.', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pending', 'Pending Resolution', 'document.acct_dist_account_source', 'AD row created; GL account not yet resolved (pre-posting state).', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('profile', 'Resolved via Accounting Profile', 'document.acct_dist_account_source', 'GL resolved at posting via control.acct_profile_entry_template.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fallback', 'Resolved via Fallback Path', 'document.acct_dist_account_source', 'GL resolved at posting via the hardcoded posting-service fallback (no matching profile).', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('percent', 'Percent', 'document.acct_dist_distribution_basis', 'Split expressed as a percentage of the line total (split_pct required).', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('amount', 'Amount', 'document.acct_dist_distribution_basis', 'Split expressed as an absolute amount (split_amount required).', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('quantity', 'Quantity', 'document.acct_dist_distribution_basis', 'Split expressed as a quantity of the line UOM (split_quantity required).', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('passed', 'Passed', 'document.invoice_budget_check_result', 'Budget check passed; sufficient funds available', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('warned', 'Warned', 'document.invoice_budget_check_result', 'Budget nearly exhausted; within warning threshold', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('override', 'Override Approved', 'document.invoice_budget_check_result', 'Over budget but manually overridden by authorised user', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('blocked', 'Blocked', 'document.invoice_budget_check_result', 'Insufficient budget; invoice cannot proceed without override', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('exempt', 'Exempt', 'document.invoice_budget_check_result', 'Invoice is exempt from budget checking (e.g. statutory)', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('unmatched', 'Unmatched', 'document.invoice_match_status', 'No matching GR or SES linked yet', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('partially_matched', 'Partially Matched', 'document.invoice_match_status', 'Some lines or quantity matched; remainder pending', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fully_matched', 'Fully Matched', 'document.invoice_match_status', 'All lines matched within tolerance', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('match_exception', 'Match Exception', 'document.invoice_match_status', 'Variance outside tolerance; requires resolution', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('three_way', 'Three-Way', 'document.invoice_match_type', 'PO <-> GR <-> Invoice match', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('two_way', 'Two-Way', 'document.invoice_match_type', 'PO <-> Invoice match (no GR required)', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('no_match', 'No Match', 'document.invoice_match_type', 'Non-PO invoice; no matching required', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('evaluated_receipt', 'Evaluated Receipt', 'document.invoice_match_type', 'ERS: system auto-generates invoice at GR', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('manual', 'Manual', 'document.je_source_doc_type', 'Manually created journal entry', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('purchase_invoice', 'Purchase Invoice', 'document.je_source_doc_type', 'Originated from purchase invoice', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payment_entry', 'Payment Entry', 'document.je_source_doc_type', 'Originated from payment entry', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('bank_recon', 'Bank Reconciliation', 'document.je_source_doc_type', 'Originated from bank reconciliation sign-off', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('credit_note', 'Credit Note', 'document.je_source_doc_type', 'Originated from credit note', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('debit_note', 'Debit Note', 'document.je_source_doc_type', 'Originated from debit note', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('accrual', 'Accrual', 'document.je_source_doc_type', 'Accrual or provision entry', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('reclass', 'Reclass', 'document.je_source_doc_type', 'Reclassification entry', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fx_revaluation', 'FX Revaluation', 'document.je_source_doc_type', 'Foreign exchange revaluation', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('depreciation', 'Depreciation', 'document.je_source_doc_type', 'Asset depreciation entry', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ic_elimination', 'IC Elimination', 'document.je_source_doc_type', 'Intercompany elimination entry', NULL, 110, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('reversal', 'Reversal', 'document.je_source_doc_type', 'Reversal of a prior entry', NULL, 120, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('correction', 'Correction', 'document.je_source_doc_type', 'Correction of a prior entry', NULL, 130, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('year_end_close', 'Year End Close', 'document.je_source_doc_type', 'Year-end closing entry', NULL, 140, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('opening_balance', 'Opening Balance', 'document.je_source_doc_type', 'Opening balance carry-forward entry', NULL, 150, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('receipt', 'Receipt', 'document.je_source_doc_type', 'Originated from a customer receipt or receipt adjustment', NULL, 160, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('service_sheet', 'Service Sheet', 'document.je_source_doc_type', 'Accrual at service sheet posting', NULL, 160, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('commitment_encumbrance', 'Commitment Encumbrance', 'document.je_source_doc_type', 'PO/contract encumbrance at approval', NULL, 170, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sales_invoice', 'Sales Invoice', 'document.je_source_doc_type', 'Originated from a sales invoice', NULL, 170, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('advance_payment', 'Advance Payment', 'document.je_source_doc_type', 'Advance to supplier prepayment posting', NULL, 180, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payroll', 'Payroll', 'document.je_source_doc_type', 'Originated from salary or payroll processing', NULL, 180, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('advance_recovery', 'Advance Recovery', 'document.je_source_doc_type', 'Advance recovery at invoice matching', NULL, 190, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('travel_expense', 'Travel Expense', 'document.je_source_doc_type', 'Originated from travel expense processing', NULL, 190, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('advance', 'Advance', 'document.je_source_doc_type', 'Originated from employee, customer, or supplier advance processing', NULL, 200, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('retention_release', 'Retention Release', 'document.je_source_doc_type', 'AP retention payable release payment', NULL, 200, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('retention', 'Retention', 'document.je_source_doc_type', 'Originated from retention accrual or release', NULL, 210, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tax_engine', 'Tax Engine', 'document.je_source_doc_type', 'Originated from VAT, WHT, or tax adjustment processing', NULL, 220, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('import', 'Import', 'document.je_source_doc_type', 'Imported journal entry', NULL, 230, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup_test', 'Finance Setup Test', 'document.je_source_doc_type', 'Controlled post-and-reverse readiness test journal', NULL, 240, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cross_book', 'Cross-Book Derivation', 'document.je_source_doc_type', 'Derived automatically by an effective book posting rule', NULL, 250, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('contract', 'Contract', 'document.line_type', 'Line originated from a contract source', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('catalog', 'Catalog', 'document.line_type', 'Line originated from a catalog source', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('marketplace', 'Marketplace', 'document.line_type', 'Line originated from a marketplace source', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('noncatalog', 'NonCatalog', 'document.line_type', 'Line not sourced from contract or catalog', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('price_variance', 'Price Variance', 'document.match_exception_type', 'Invoice unit price differs from PO', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('quantity_variance', 'Quantity Variance', 'document.match_exception_type', 'Invoice qty differs from GR accepted qty', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('amount_variance', 'Amount Variance', 'document.match_exception_type', 'Net amount variance beyond tolerance', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('missing_receipt', 'Missing Receipt', 'document.match_exception_type', 'No matching GR or SES found', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('duplicate_invoice', 'Duplicate Invoice', 'document.match_exception_type', 'Probable duplicate of an existing invoice', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tax_variance', 'Tax Variance', 'document.match_exception_type', 'Tax amount differs from calculation', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fx_variance', 'FX Variance', 'document.match_exception_type', 'Exchange rate variance on foreign invoice', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('retention_variance', 'Retention Variance', 'document.match_exception_type', 'Retention amount mismatch', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('advance_recovery_mismatch', 'Advance Recovery Mismatch', 'document.match_exception_type', 'Advance deduction does not match records', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('standard', 'Standard', 'document.payment_entry_type', 'Standard full or partial payment', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('advance', 'Advance', 'document.payment_entry_type', 'Advance payment against commitment', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('retention_release', 'Retention Release', 'document.payment_entry_type', 'Release of AP retention payable', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('partial', 'Partial', 'document.payment_entry_type', 'Partial payment on invoice', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('final', 'Final', 'document.payment_entry_type', 'Final payment closing the invoice', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('down_payment', 'Down Payment', 'document.payment_entry_type', 'Down payment / prepayment', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('urgent', 'Urgent', 'document.payment_entry_type', 'Urgent out-of-cycle payment', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('netting', 'Netting', 'document.payment_entry_type', 'Netted payment across multiple invoices', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('goods', 'Goods', 'document.procurement_type', 'Physical goods delivered', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('services', 'Services', 'document.procurement_type', 'Services rendered or contracted', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.document_sequence_doc_type', 'document.acct_dist_account_source', 'document.acct_dist_distribution_basis', 'document.invoice_budget_check_result', 'document.invoice_match_status', 'document.invoice_match_type', 'document.je_source_doc_type', 'document.line_type', 'document.match_exception_type', 'document.payment_entry_type', 'document.procurement_type'])) <> 88 THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_p2p_lookup_values: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['control.document_sequence_doc_type', 'document.acct_dist_account_source', 'document.acct_dist_distribution_basis', 'document.invoice_budget_check_result', 'document.invoice_match_status', 'document.invoice_match_type', 'document.je_source_doc_type', 'document.line_type', 'document.match_exception_type', 'document.payment_entry_type', 'document.procurement_type']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_p2p_lookup_values: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.document_sequence_doc_type', 'document.acct_dist_account_source', 'document.acct_dist_distribution_basis', 'document.invoice_budget_check_result', 'document.invoice_match_status', 'document.invoice_match_type', 'document.je_source_doc_type', 'document.line_type', 'document.match_exception_type', 'document.payment_entry_type', 'document.procurement_type']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_p2p_lookup_values: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.document_sequence_doc_type', 'document.acct_dist_account_source', 'document.acct_dist_distribution_basis', 'document.invoice_budget_check_result', 'document.invoice_match_status', 'document.invoice_match_type', 'document.je_source_doc_type', 'document.line_type', 'document.match_exception_type', 'document.payment_entry_type', 'document.procurement_type']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_p2p_lookup_values: semantic assertion failed';
  END IF;
END $assertions$;
