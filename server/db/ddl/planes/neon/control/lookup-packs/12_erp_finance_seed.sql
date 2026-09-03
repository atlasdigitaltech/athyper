-- seed-contract-version: 1
-- seed-pack: neon.control.lookup.erp_finance
-- seed-pack-version: 1.0.0
-- seed-dataset: neon.control.lookup.erp_finance
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:125
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/control/accounting_domain.sql,server/db/seed/platform/000_lookups/LookupDomain/control/bpr_account_strategy.sql,server/db/seed/platform/000_lookups/LookupDomain/document/jl_subledger_type.sql,server/db/seed/platform/000_lookups/LookupDomain/finance/postability_reason.sql,server/db/seed/platform/000_lookups/LookupDomain/master/bank_account_link_purpose.sql,server/db/seed/platform/000_lookups/LookupDomain/master/bank_account_local_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/bank_account_reconciliation_mode.sql,server/db/seed/platform/000_lookups/LookupDomain/master/bank_account_usage_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/bank_account_verification_method.sql,server/db/seed/platform/000_lookups/LookupDomain/master/book_assignment_conflict.sql,server/db/seed/platform/000_lookups/LookupDomain/master/chart_of_account_framework.sql,server/db/seed/platform/000_lookups/LookupDomain/master/cost_center_category.sql,server/db/seed/platform/000_lookups/LookupDomain/master/cost_center_node_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/fiscal_period_status.sql,server/db/seed/platform/000_lookups/LookupDomain/master/gl_account_balance.sql,server/db/seed/platform/000_lookups/LookupDomain/master/gl_account_node_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/gl_account_subledger.sql,server/db/seed/platform/000_lookups/LookupDomain/master/ledger_book_close_mode.sql,server/db/seed/platform/000_lookups/LookupDomain/master/ledger_book_standard.sql,server/db/seed/platform/000_lookups/LookupDomain/master/pay_component_taxable_behavior.sql,server/db/seed/platform/000_lookups/LookupDomain/master/profit_center_node_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/profit_center_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/tax_filing_frequency.sql,server/db/seed/platform/000_lookups/LookupDomain/master/tax_id_type.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_finance: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('control.accounting_domain', 'Accounting Domain', 'Economic domain classification resolved by commodity_classification_to_intent_rule.resolved_domain. Drives GL account selection and budget bucket assignment (OPEX, CAPEX, ADMIN, etc.). is_extensible=false — domains are accounting-governed.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('control.bpr_account_strategy', 'BPR account strategy', 'How the target account is determined (same, map, profile).', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.jl_subledger_type', 'Journal line subledger type', 'Which subledger the journal line posts to. is_extensible=true — tenants may add custom subledger types.', 'document', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance.postability_reason', 'Finance Postability Reason', 'Canonical reason codes surfaced by periodPostability, accountPostability, and finance-setup conflicts. Shared enum registry — UI, backend, notifications, and workflow gates all resolve reason strings via this domain.', 'finance', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.bank_account_link_purpose', 'Bank account link purpose', 'Business purpose of bank account link.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.bank_account_local_type', 'Bank account local type', 'Local account classification.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.bank_account_reconciliation_mode', 'Reconciliation mode', 'How bank statement lines are matched.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.bank_account_usage_type', 'Bank account usage type', 'House bank operational usage.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.bank_account_verification_method', 'Bank account verification method', 'How bank details were verified.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.chart_of_account_framework', 'Chart framework', 'Accounting standard the chart aligns to. is_extensible=true — tenants may add custom frameworks.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.company_code_book_assignment_conflict', 'Book assignment conflict resolution', 'Strategy when multiple book assignments overlap for the same entity.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.cost_center_category', 'Cost center category', 'Functional classification (production, admin, sales, etc.). is_extensible=true — tenants may add custom categories.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.cost_center_node_type', 'Cost center node type', 'HEADER (rollup-only) or POSTING (accepts journal entries).', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.fiscal_period.status', 'Fiscal Period Status', 'Posting status for fiscal periods (future, open, soft_close, hard_close). Platform-governed.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.gl_account_balance', 'Normal balance', 'Natural balance side (debit or credit).', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.gl_account_node_type', 'GL account node type', 'HEADER (group/summary) or POSTING (leaf, accepts journal lines).', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.gl_account_subledger', 'Subledger type', 'Which subledger links to this account (AP, AR, asset, inventory, etc.). is_extensible=true — tenants may add custom subledger types.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.ledger_book_close_mode', 'Ledger book close mode', 'Period-close coordination mode (unified, independent, staggered).', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.ledger_book_standard', 'Ledger book accounting standard', 'Accounting standard the ledger book follows. is_extensible=true — tenants may add country-specific standards.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.pay_component_taxable_behavior', 'Pay Component Taxable Behavior', 'Tax treatment of a pay component (fully_taxable, partially_taxable, exempt, statutory). is_extensible=false — tax behavior is legally defined.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.profit_center_node_type', 'Profit center node type', 'HEADER (rollup-only) or POSTING (postable).', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.profit_center_type', 'Profit center type', 'Business function class (revenue, service, investment, shared). is_extensible=true — tenants may add custom types.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.tax_filing_frequency', 'Tax Filing Frequency', 'How often tax returns must be filed with the jurisdiction (monthly, bimonthly, quarterly, semi_annually, annually, on_demand). is_extensible=false — filing frequencies are jurisdiction-regulated.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.tax_id_type', 'Tax identifier type', 'Type of tax registration (VAT, GST, TIN, EIN, ABN, SST, etc.). is_extensible=true — tenants may add jurisdiction-specific types.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  ('opex', 'Operating Expense', 'control.accounting_domain', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('capex', 'Capital Expenditure', 'control.accounting_domain', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('admin', 'Admin / G&A', 'control.accounting_domain', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('revenue', 'Revenue', 'control.accounting_domain', NULL, NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cost_of_sales', 'Cost of Sales', 'control.accounting_domain', NULL, NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('transfer', 'Inter-Company Transfer', 'control.accounting_domain', NULL, NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('regulatory', 'Regulatory / Statutory', 'control.accounting_domain', NULL, NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('deferred_revenue', 'Deferred Revenue', 'control.accounting_domain', NULL, NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('same', 'Same Account', 'control.bpr_account_strategy', 'Post to same GL account in target book', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('map', 'Account Map', 'control.bpr_account_strategy', 'Use explicit account mapping table', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('profile', 'Profile', 'control.bpr_account_strategy', 'Derive from posting profile rules', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap', 'Accounts Payable', 'document.jl_subledger_type', 'AP subledger', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ar', 'Accounts Receivable', 'document.jl_subledger_type', 'AR subledger', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('asset', 'Asset', 'document.jl_subledger_type', 'Fixed asset subledger', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('inventory', 'Inventory', 'document.jl_subledger_type', 'Inventory subledger', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('wip', 'WIP', 'document.jl_subledger_type', 'Work in progress subledger', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('commission', 'Commission', 'document.jl_subledger_type', 'Commission subledger', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('period_open', 'Period open', 'finance.postability_reason', 'Period is open for posting.', NULL, 10, true, '{"severity":"info","chip_hint":"postable","scope_kind":"period"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('period_adjustment_only', 'Period adjustment-only', 'finance.postability_reason', 'Period is soft-closed; only adjustment postings allowed.', NULL, 20, true, '{"severity":"warning","chip_hint":"adjustment_only","scope_kind":"period"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('period_hard_closed', 'Period hard-closed', 'finance.postability_reason', 'Period is hard-closed; no postings permitted.', NULL, 30, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"period"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('period_not_opened', 'Period not opened', 'finance.postability_reason', 'Period has not been opened yet.', NULL, 40, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"period"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('book_period_missing', 'Book period missing', 'finance.postability_reason', 'No book_period_status row for this book+period — treated as future/locked.', NULL, 50, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"period"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('control_missing', 'Company control missing', 'finance.postability_reason', 'No company_code_gl_account row for this account.', NULL, 60, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('control_blocked_manual', 'Blocked for manual posting', 'finance.postability_reason', 'blocked_for_manual=true on the company control.', NULL, 70, true, '{"severity":"warning","chip_hint":"adjustment_only","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('control_blocked_auto', 'Blocked for auto posting', 'finance.postability_reason', 'blocked_for_auto=true on the company control.', NULL, 80, true, '{"severity":"warning","chip_hint":"adjustment_only","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('control_posting_disallowed', 'Posting disallowed on control', 'finance.postability_reason', 'posting_allowed=false on the company control.', NULL, 90, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('gl_account_inactive', 'GL account inactive', 'finance.postability_reason', 'gl_account.status is not active.', NULL, 100, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('gl_account_not_posting', 'GL account is header/summary', 'finance.postability_reason', 'gl_account.node_type is not posting (header/summary node).', NULL, 110, true, '{"severity":"info","chip_hint":"read_only","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('chart_assignment_inactive', 'Chart assignment inactive', 'finance.postability_reason', 'company_code_chart_assignment.status <> active for the operating assignment.', NULL, 120, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"both"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('posting_role_unknown', 'Posting role unknown', 'finance.postability_reason', 'The supplied role does not resolve to an active canonical posting role.', NULL, 130, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('posting_role_book_not_assigned', 'Posting-role book not assigned', 'finance.postability_reason', 'The requested ledger book is not actively assigned to the company on the resolution date.', NULL, 140, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('posting_role_mapping_missing', 'Posting-role mapping missing', 'finance.postability_reason', 'A required posting role has no effective GL-account assignment for the company and book.', NULL, 150, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('posting_role_account_not_postable', 'Posting-role account not postable', 'finance.postability_reason', 'The mapped GL account is inactive, non-posting, or blocked for automatic posting.', NULL, 160, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('posting_role_normal_balance_mismatch', 'Posting-role normal balance mismatch', 'finance.postability_reason', 'The mapped GL account normal balance is incompatible with the canonical posting role.', NULL, 170, true, '{"severity":"blocker","chip_hint":"locked","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('posting_role_resolved', 'Posting role resolved', 'finance.postability_reason', 'The canonical role resolved to an effective postable GL account.', NULL, 180, true, '{"severity":"info","chip_hint":"postable","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('posting_role_not_required', 'Posting role not required', 'finance.postability_reason', 'The role is available in the catalog but is not required by active company policies.', NULL, 190, true, '{"severity":"info","chip_hint":"read_only","scope_kind":"account"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('default', 'Default', 'master.bank_account_link_purpose', 'General-purpose payment account', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('disbursement', 'Disbursement', 'master.bank_account_link_purpose', 'Outbound payments (house bank)', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('collection', 'Collection', 'master.bank_account_link_purpose', 'Inbound receipts (house bank)', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payroll', 'Payroll', 'master.bank_account_link_purpose', 'Salary / wages payment', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('refund', 'Refund', 'master.bank_account_link_purpose', 'Customer refund disbursement', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('reimbursement', 'Reimbursement', 'master.bank_account_link_purpose', 'Employee expense reimbursement', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('advance', 'Advance', 'master.bank_account_link_purpose', 'Advance payment account', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('commission', 'Commission', 'master.bank_account_link_purpose', 'Commission / incentive payment', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('current', 'Current Account', 'master.bank_account_local_type', 'Checking / current account', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('savings', 'Savings Account', 'master.bank_account_local_type', 'Savings / deposit account', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('escrow', 'Escrow Account', 'master.bank_account_local_type', 'Escrow / trust account', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payroll', 'Payroll Account', 'master.bank_account_local_type', 'Dedicated payroll account', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('petty_cash', 'Petty Cash', 'master.bank_account_local_type', 'Petty cash float', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('manual', 'Manual', 'master.bank_account_reconciliation_mode', 'Manual matching by user', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('auto', 'Automatic', 'master.bank_account_reconciliation_mode', 'System auto-matches', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('semi_auto', 'Semi-Auto', 'master.bank_account_reconciliation_mode', 'System proposes, user confirms', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('disbursement', 'Disbursement', 'master.bank_account_usage_type', 'Outbound payments', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('collection', 'Collection', 'master.bank_account_usage_type', 'Inbound receipts', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payroll', 'Payroll', 'master.bank_account_usage_type', 'Payroll processing', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('treasury', 'Treasury', 'master.bank_account_usage_type', 'Treasury operations', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('escrow', 'Escrow', 'master.bank_account_usage_type', 'Escrow operations', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('petty_cash', 'Petty Cash', 'master.bank_account_usage_type', 'Petty cash replenishment', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('micro_deposit', 'Micro-Deposit', 'master.bank_account_verification_method', 'Trial amounts verification', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('bank_letter', 'Bank Letter', 'master.bank_account_verification_method', 'Official bank confirmation', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cancelled_cheque', 'Cancelled Cheque', 'master.bank_account_verification_method', 'Cancelled cheque image', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('supplier_portal', 'Supplier Portal', 'master.bank_account_verification_method', 'Self-service supplier portal entry', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('manual', 'Manual Verification', 'master.bank_account_verification_method', 'Manually verified by staff', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('api_validation', 'API Validation', 'master.bank_account_verification_method', 'Bank API / open banking', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ifrs', 'IFRS', 'master.chart_of_account_framework', 'IFRS-aligned structure', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('us_gaap', 'US GAAP', 'master.chart_of_account_framework', 'US GAAP-aligned', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('reporting_taxonomy', 'Reporting Taxonomy', 'master.chart_of_account_framework', 'Internal non-operating group reporting taxonomy', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('highest_priority', 'Highest Priority', 'master.company_code_book_assignment_conflict', 'Use assignment with highest priority value', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('most_specific', 'Most Specific', 'master.company_code_book_assignment_conflict', 'Use most narrowly scoped assignment', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('error_on_conflict', 'Error on Conflict', 'master.company_code_book_assignment_conflict', 'Raise error when assignments conflict', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('production', 'Production', 'master.cost_center_category', 'Manufacturing / assembly', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('admin', 'Administration', 'master.cost_center_category', 'General & administrative', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sales', 'Sales', 'master.cost_center_category', 'Sales & distribution', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('service', 'Service', 'master.cost_center_category', 'Service delivery', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('logistics', 'Logistics', 'master.cost_center_category', 'Warehousing & transport', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('r_and_d', 'R&D', 'master.cost_center_category', 'Research & development', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('shared', 'Shared Services', 'master.cost_center_category', 'Shared IT/HR/Finance', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('header', 'Header', 'master.cost_center_node_type', 'Rollup-only, no posting', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('posting', 'Posting', 'master.cost_center_node_type', 'Accepts JE line postings', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('future', 'Future', 'master.fiscal_period.status', 'Future period.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('open', 'Open', 'master.fiscal_period.status', 'Open period.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('soft_close', 'Soft Close', 'master.fiscal_period.status', 'Soft-closed period.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('hard_close', 'Hard Close', 'master.fiscal_period.status', 'Hard-closed period.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('debit', 'Debit', 'master.gl_account_balance', 'Natural debit (asset, expense)', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('credit', 'Credit', 'master.gl_account_balance', 'Natural credit (liability, equity, income)', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('header', 'Header', 'master.gl_account_node_type', 'Group / summary — no posting', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('posting', 'Posting', 'master.gl_account_node_type', 'Leaf — accepts JE lines', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap', 'Accounts Payable', 'master.gl_account_subledger', 'Trade payables', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ar', 'Accounts Receivable', 'master.gl_account_subledger', 'Trade receivables', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('asset', 'Fixed Assets', 'master.gl_account_subledger', 'Asset register', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('inventory', 'Inventory', 'master.gl_account_subledger', 'Inventory valuation', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('wip', 'Work in Progress', 'master.gl_account_subledger', 'Production WIP', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('commission', 'Commission', 'master.gl_account_subledger', 'Commission accrual', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('unified', 'Unified', 'master.ledger_book_close_mode', 'All books close together', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('independent', 'Independent', 'master.ledger_book_close_mode', 'Each book closes on its own schedule', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('staggered', 'Staggered', 'master.ledger_book_close_mode', 'Books close in defined sequence', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ifrs', 'IFRS', 'master.ledger_book_standard', 'International Financial Reporting Standards', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('us_gaap', 'US GAAP', 'master.ledger_book_standard', 'United States GAAP', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('taxable', 'Fully Taxable', 'master.pay_component_taxable_behavior', 'Entire amount is included in taxable income (basic salary, bonuses)', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('non_taxable', 'Non-Taxable', 'master.pay_component_taxable_behavior', 'Exempt from income tax up to prescribed limits (transport, medical allowances)', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('partially_taxable', 'Partially Taxable', 'master.pay_component_taxable_behavior', 'Taxable only above a statutory ceiling (HRA — exempt portion depends on rent)', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('statutory_exempt', 'Statutory Exempt', 'master.pay_component_taxable_behavior', 'Deduction qualifies for tax relief under statute (PF, NPS contributions)', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('perquisite', 'Perquisite', 'master.pay_component_taxable_behavior', 'Non-cash benefit valued at prescribed rate and added to taxable income', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('header', 'Header', 'master.profit_center_node_type', 'Rollup-only', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('posting', 'Posting', 'master.profit_center_node_type', 'Postable', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('revenue', 'Revenue', 'master.profit_center_type', 'Revenue-generating unit', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('service', 'Service', 'master.profit_center_type', 'Internal service provider', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('investment', 'Investment', 'master.profit_center_type', 'Investment / holding', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('shared', 'Shared', 'master.profit_center_type', 'Shared / corporate overhead', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('monthly', 'Monthly', 'master.tax_filing_frequency', 'Returns filed every calendar month', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('bimonthly', 'Bi-Monthly', 'master.tax_filing_frequency', 'Returns filed every two calendar months (e.g. TW)', NULL, 15, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('quarterly', 'Quarterly', 'master.tax_filing_frequency', 'Returns filed every calendar quarter', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('semi_annually', 'Semi-Annually', 'master.tax_filing_frequency', 'Returns filed twice per year', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('annually', 'Annually', 'master.tax_filing_frequency', 'Returns filed once per fiscal/calendar year', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('on_demand', 'On Demand', 'master.tax_filing_frequency', 'Filed on occurrence (e.g. withholding TDS)', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('vat', 'VAT', 'master.tax_id_type', 'Value Added Tax registration', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('gst', 'GST', 'master.tax_id_type', 'Goods & Services Tax registration', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tin', 'TIN', 'master.tax_id_type', 'Taxpayer Identification Number', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ein', 'EIN', 'master.tax_id_type', 'Employer Identification Number (US)', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('abn', 'ABN', 'master.tax_id_type', 'Australian Business Number', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sst', 'SST', 'master.tax_id_type', 'Sales & Service Tax (Malaysia)', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('crn', 'CRN', 'master.tax_id_type', 'Commercial Registration Number (GCC)', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pan', 'PAN', 'master.tax_id_type', 'Permanent Account Number (India)', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('utr', 'UTR', 'master.tax_id_type', 'Unique Taxpayer Reference (UK)', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('other', 'Other', 'master.tax_id_type', 'Jurisdiction-specific identifier not listed', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.accounting_domain', 'control.bpr_account_strategy', 'document.jl_subledger_type', 'finance.postability_reason', 'master.bank_account_link_purpose', 'master.bank_account_local_type', 'master.bank_account_reconciliation_mode', 'master.bank_account_usage_type', 'master.bank_account_verification_method', 'master.chart_of_account_framework', 'master.company_code_book_assignment_conflict', 'master.cost_center_category', 'master.cost_center_node_type', 'master.fiscal_period.status', 'master.gl_account_balance', 'master.gl_account_node_type', 'master.gl_account_subledger', 'master.ledger_book_close_mode', 'master.ledger_book_standard', 'master.pay_component_taxable_behavior', 'master.profit_center_node_type', 'master.profit_center_type', 'master.tax_filing_frequency', 'master.tax_id_type'])) <> 125 THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_finance: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['control.accounting_domain', 'control.bpr_account_strategy', 'document.jl_subledger_type', 'finance.postability_reason', 'master.bank_account_link_purpose', 'master.bank_account_local_type', 'master.bank_account_reconciliation_mode', 'master.bank_account_usage_type', 'master.bank_account_verification_method', 'master.chart_of_account_framework', 'master.company_code_book_assignment_conflict', 'master.cost_center_category', 'master.cost_center_node_type', 'master.fiscal_period.status', 'master.gl_account_balance', 'master.gl_account_node_type', 'master.gl_account_subledger', 'master.ledger_book_close_mode', 'master.ledger_book_standard', 'master.pay_component_taxable_behavior', 'master.profit_center_node_type', 'master.profit_center_type', 'master.tax_filing_frequency', 'master.tax_id_type']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_finance: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.accounting_domain', 'control.bpr_account_strategy', 'document.jl_subledger_type', 'finance.postability_reason', 'master.bank_account_link_purpose', 'master.bank_account_local_type', 'master.bank_account_reconciliation_mode', 'master.bank_account_usage_type', 'master.bank_account_verification_method', 'master.chart_of_account_framework', 'master.company_code_book_assignment_conflict', 'master.cost_center_category', 'master.cost_center_node_type', 'master.fiscal_period.status', 'master.gl_account_balance', 'master.gl_account_node_type', 'master.gl_account_subledger', 'master.ledger_book_close_mode', 'master.ledger_book_standard', 'master.pay_component_taxable_behavior', 'master.profit_center_node_type', 'master.profit_center_type', 'master.tax_filing_frequency', 'master.tax_id_type']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_finance: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.accounting_domain', 'control.bpr_account_strategy', 'document.jl_subledger_type', 'finance.postability_reason', 'master.bank_account_link_purpose', 'master.bank_account_local_type', 'master.bank_account_reconciliation_mode', 'master.bank_account_usage_type', 'master.bank_account_verification_method', 'master.chart_of_account_framework', 'master.company_code_book_assignment_conflict', 'master.cost_center_category', 'master.cost_center_node_type', 'master.fiscal_period.status', 'master.gl_account_balance', 'master.gl_account_node_type', 'master.gl_account_subledger', 'master.ledger_book_close_mode', 'master.ledger_book_standard', 'master.pay_component_taxable_behavior', 'master.profit_center_node_type', 'master.profit_center_type', 'master.tax_filing_frequency', 'master.tax_id_type']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_finance: semantic assertion failed';
  END IF;
END $assertions$;
