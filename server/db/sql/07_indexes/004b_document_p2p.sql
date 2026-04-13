-- =============================================================================
-- 07_indexes/004b_document_p2p.sql  –  Performance indexes for P2P tables
-- =============================================================================
-- Naming: <table_abbrev>_<description>_idx
-- Partial indexes used where status filtering is the dominant access pattern.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PURCHASE REQUISITION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pr_tenant_status_idx
    ON document.purchase_requisition (tenant_id, status);

CREATE INDEX IF NOT EXISTS pr_tenant_company_idx
    ON document.purchase_requisition (tenant_id, company_code_id, document_date DESC);

CREATE INDEX IF NOT EXISTS pr_requested_by_idx
    ON document.purchase_requisition (tenant_id, requested_by)
    WHERE status NOT IN ('fully_converted','closed','cancelled');

CREATE INDEX IF NOT EXISTS pr_active_idx
    ON document.purchase_requisition (tenant_id, company_code_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS pr_workflow_idx
    ON document.purchase_requisition (workflow_request_id)
    WHERE workflow_request_id IS NOT NULL;

-- purchase_requisition_line
CREATE INDEX IF NOT EXISTS prl_requisition_idx
    ON document.purchase_requisition_line (tenant_id, purchase_requisition_id);

CREATE INDEX IF NOT EXISTS prl_status_open_idx
    ON document.purchase_requisition_line (tenant_id, purchase_requisition_id)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS prl_item_idx
    ON document.purchase_requisition_line (tenant_id, item_id)
    WHERE item_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMITMENT PROCUREMENT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cp_supplier_idx
    ON document.commitment_procurement (tenant_id, supplier_id);

CREATE INDEX IF NOT EXISTS cp_parent_contract_idx
    ON document.commitment_procurement (tenant_id, parent_contract_id)
    WHERE parent_contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cp_release_orders_idx
    ON document.commitment_procurement (tenant_id, parent_contract_id)
    WHERE is_release_order = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMITMENT LINE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cl_commitment_idx
    ON document.commitment_line (tenant_id, commitment_id);

CREATE INDEX IF NOT EXISTS cl_open_lines_idx
    ON document.commitment_line (tenant_id, commitment_id)
    WHERE status IN ('open','partially_received','partially_invoiced');

CREATE INDEX IF NOT EXISTS cl_item_idx
    ON document.commitment_line (tenant_id, item_id)
    WHERE item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cl_req_line_idx
    ON document.commitment_line (tenant_id, requisition_line_id)
    WHERE requisition_line_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMITMENT RELEASE ALLOCATION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cra_parent_line_active_idx
    ON document.commitment_release_allocation (tenant_id, parent_line_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS cra_release_commitment_idx
    ON document.commitment_release_allocation (tenant_id, release_commitment_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PURCHASE ORDER CONFIRMATION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS poc_commitment_idx
    ON document.purchase_order_confirmation (tenant_id, commitment_id);

CREATE INDEX IF NOT EXISTS poc_supplier_pending_idx
    ON document.purchase_order_confirmation (tenant_id, supplier_id)
    WHERE status IN ('received','changes_proposed');

-- ─────────────────────────────────────────────────────────────────────────────
-- DELIVERY NOTE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS dn_commitment_idx
    ON document.delivery_note (tenant_id, commitment_id);

CREATE INDEX IF NOT EXISTS dn_supplier_idx
    ON document.delivery_note (tenant_id, supplier_id);

CREATE INDEX IF NOT EXISTS dn_arrival_pending_idx
    ON document.delivery_note (tenant_id, expected_arrival_date)
    WHERE status IN ('draft','in_transit');

CREATE INDEX IF NOT EXISTS dn_site_idx
    ON document.delivery_note (tenant_id, delivery_site_id);

-- delivery_note_line
CREATE INDEX IF NOT EXISTS dnl_delivery_note_idx
    ON document.delivery_note_line (tenant_id, delivery_note_id);

CREATE INDEX IF NOT EXISTS dnl_commitment_line_idx
    ON document.delivery_note_line (tenant_id, commitment_line_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- GOODS RECEIPT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS gr_commitment_idx
    ON document.goods_receipt (tenant_id, commitment_id);

CREATE INDEX IF NOT EXISTS gr_supplier_idx
    ON document.goods_receipt (tenant_id, supplier_id);

CREATE INDEX IF NOT EXISTS gr_posting_date_idx
    ON document.goods_receipt (tenant_id, company_code_id, posting_date DESC);

CREATE INDEX IF NOT EXISTS gr_pending_approval_idx
    ON document.goods_receipt (tenant_id, company_code_id)
    WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS gr_unposted_approved_idx
    ON document.goods_receipt (tenant_id)
    WHERE status = 'approved' AND is_posted = false;

CREATE INDEX IF NOT EXISTS gr_workflow_idx
    ON document.goods_receipt (workflow_request_id)
    WHERE workflow_request_id IS NOT NULL;

-- goods_receipt_line
CREATE INDEX IF NOT EXISTS grl_gr_idx
    ON document.goods_receipt_line (tenant_id, goods_receipt_id);

CREATE INDEX IF NOT EXISTS grl_commitment_line_idx
    ON document.goods_receipt_line (tenant_id, commitment_line_id);

CREATE INDEX IF NOT EXISTS grl_item_idx
    ON document.goods_receipt_line (tenant_id, item_id);

CREATE INDEX IF NOT EXISTS grl_warehouse_idx
    ON document.goods_receipt_line (tenant_id, warehouse_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SERVICE ENTRY SHEET
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ses_commitment_idx
    ON document.service_entry_sheet (tenant_id, commitment_id);

CREATE INDEX IF NOT EXISTS ses_supplier_idx
    ON document.service_entry_sheet (tenant_id, supplier_id);

CREATE INDEX IF NOT EXISTS ses_posting_date_idx
    ON document.service_entry_sheet (tenant_id, company_code_id, posting_date DESC);

CREATE INDEX IF NOT EXISTS ses_pending_acceptance_idx
    ON document.service_entry_sheet (tenant_id)
    WHERE status = 'pending_acceptance';

CREATE INDEX IF NOT EXISTS ses_pending_approval_idx
    ON document.service_entry_sheet (tenant_id)
    WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS ses_unposted_approved_idx
    ON document.service_entry_sheet (tenant_id)
    WHERE status = 'approved' AND is_posted = false;

-- service_entry_sheet_line
CREATE INDEX IF NOT EXISTS sesl_ses_idx
    ON document.service_entry_sheet_line (tenant_id, service_entry_sheet_id);

CREATE INDEX IF NOT EXISTS sesl_commitment_line_idx
    ON document.service_entry_sheet_line (tenant_id, commitment_line_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PURCHASE INVOICE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pi_supplier_idx
    ON document.purchase_invoice (tenant_id, supplier_id);

CREATE INDEX IF NOT EXISTS pi_commitment_idx
    ON document.purchase_invoice (tenant_id, commitment_id)
    WHERE commitment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pi_posting_date_idx
    ON document.purchase_invoice (tenant_id, company_code_id, posting_date DESC);

CREATE INDEX IF NOT EXISTS pi_due_date_idx
    ON document.purchase_invoice (tenant_id, due_date)
    WHERE status IN ('posted','partially_paid') AND due_date IS NOT NULL;

-- Aging reports scoped by company: (tenant, company, due_date) covers
-- "show me all overdue invoices for company X" without a cross-company fan-out.
CREATE INDEX IF NOT EXISTS pi_aging_company_idx
    ON document.purchase_invoice (tenant_id, company_code_id, due_date)
    WHERE status IN ('posted','partially_paid') AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS pi_match_status_idx
    ON document.purchase_invoice (tenant_id, match_status)
    WHERE match_status IN ('unmatched','partially_matched','match_exception');

CREATE INDEX IF NOT EXISTS pi_pending_approval_idx
    ON document.purchase_invoice (tenant_id, company_code_id)
    WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS pi_on_hold_idx
    ON document.purchase_invoice (tenant_id)
    WHERE is_on_hold = true;

-- Duplicate invoice detection: supplier + supplier_invoice_number + date
CREATE INDEX IF NOT EXISTS pi_supplier_invoice_dedup_idx
    ON document.purchase_invoice (tenant_id, supplier_id, supplier_invoice_number, supplier_invoice_date)
    WHERE supplier_id IS NOT NULL AND status NOT IN ('cancelled','rejected');

CREATE INDEX IF NOT EXISTS pi_workflow_idx
    ON document.purchase_invoice (workflow_request_id)
    WHERE workflow_request_id IS NOT NULL;

-- purchase_invoice_line
CREATE INDEX IF NOT EXISTS pil_invoice_idx
    ON document.purchase_invoice_line (tenant_id, purchase_invoice_id);

CREATE INDEX IF NOT EXISTS pil_commitment_line_idx
    ON document.purchase_invoice_line (tenant_id, commitment_line_id)
    WHERE commitment_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pil_gr_line_idx
    ON document.purchase_invoice_line (tenant_id, goods_receipt_line_id)
    WHERE goods_receipt_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pil_match_exception_idx
    ON document.purchase_invoice_line (tenant_id, purchase_invoice_id)
    WHERE match_status = 'match_exception';

-- ─────────────────────────────────────────────────────────────────────────────
-- INVOICE MATCH CASE + EXCEPTIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS imc_pending_idx
    ON document.invoice_match_case (tenant_id, company_code_id)
    WHERE status IN ('pending','in_progress','exception');

CREATE INDEX IF NOT EXISTS me_match_case_idx
    ON document.match_exception (tenant_id, invoice_match_case_id);

CREATE INDEX IF NOT EXISTS me_open_exceptions_idx
    ON document.match_exception (tenant_id, invoice_line_id)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS me_workflow_idx
    ON document.match_exception (workflow_request_id)
    WHERE workflow_request_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PAYMENT ENTRY
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pe_supplier_idx
    ON document.payment_entry (tenant_id, supplier_id)
    WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pe_posting_date_idx
    ON document.payment_entry (tenant_id, company_code_id, posting_date DESC);

CREATE INDEX IF NOT EXISTS pe_value_date_idx
    ON document.payment_entry (tenant_id, value_date)
    WHERE status IN ('approved','posted') AND is_transmitted = false;

CREATE INDEX IF NOT EXISTS pe_pending_approval_idx
    ON document.payment_entry (tenant_id, company_code_id)
    WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS pe_unposted_approved_idx
    ON document.payment_entry (tenant_id)
    WHERE status = 'approved' AND is_posted = false;

CREATE INDEX IF NOT EXISTS pe_payment_run_idx
    ON document.payment_entry (tenant_id, payment_run_id)
    WHERE payment_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pe_workflow_idx
    ON document.payment_entry (workflow_request_id)
    WHERE workflow_request_id IS NOT NULL;

-- payment_entry_allocation
CREATE INDEX IF NOT EXISTS pea_payment_idx
    ON document.payment_entry_allocation (tenant_id, payment_entry_id);

CREATE INDEX IF NOT EXISTS pea_invoice_idx
    ON document.payment_entry_allocation (tenant_id, purchase_invoice_id)
    WHERE purchase_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pea_commitment_idx
    ON document.payment_entry_allocation (tenant_id, commitment_id)
    WHERE commitment_id IS NOT NULL;

-- payment_remittance_output
CREATE INDEX IF NOT EXISTS pro_payment_idx
    ON document.payment_remittance_output (tenant_id, payment_entry_id);

CREATE INDEX IF NOT EXISTS pro_pending_delivery_idx
    ON document.payment_remittance_output (tenant_id)
    WHERE delivery_status = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCOUNTING DISTRIBUTION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ad_source_doc_idx
    ON document.accounting_distribution (tenant_id, source_doc_type, source_doc_id);

CREATE INDEX IF NOT EXISTS ad_source_line_idx
    ON document.accounting_distribution (tenant_id, source_line_id);

CREATE INDEX IF NOT EXISTS ad_spend_category_idx
    ON document.accounting_distribution (tenant_id, spend_category_id)
    WHERE spend_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ad_business_intent_idx
    ON document.accounting_distribution (tenant_id, business_intent_id)
    WHERE business_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ad_capex_idx
    ON document.accounting_distribution (tenant_id, source_doc_id)
    WHERE is_capex = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- INVOICE SNAPSHOTS  (lightweight – only cross-reference index)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ips_supplier_idx
    ON document.invoice_party_snapshot (tenant_id, supplier_id)
    WHERE supplier_id IS NOT NULL;
