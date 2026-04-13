-- =============================================================================
-- 06_constraints/004b_document_p2p.sql  –  Foreign-key constraints for P2P tables
-- =============================================================================
-- All composite FKs follow (tenant_id, child_id) → (tenant_id, id) pattern.
-- Columns intentionally NOT FK-constrained (per existing DDL convention):
--   dimension columns (cost_center_id, profit_center_id, project_id, dimension_set_id)
--   tax engine refs (tax_group_id, withholding_tax_group_id, tax_rate_schedule_id)
--   budget refs (budget_allocation_id)
--   audit actor refs (created_by, updated_by, approved_by, posted_by, etc.)
--   polymorphic source refs (source_doc_id, source_line_id on accounting_distribution)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PURCHASE REQUISITION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.purchase_requisition ADD CONSTRAINT pr_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_requisition ADD CONSTRAINT pr_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_requisition ADD CONSTRAINT pr_workflow_fk
        FOREIGN KEY (workflow_request_id)
        REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_requisition ADD CONSTRAINT pr_encumbrance_je_fk
        FOREIGN KEY (encumbrance_je_id)
        REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- purchase_requisition_line ───────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.purchase_requisition_line ADD CONSTRAINT prl_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_requisition_line ADD CONSTRAINT prl_pr_fk
        FOREIGN KEY (tenant_id, purchase_requisition_id)
        REFERENCES document.purchase_requisition (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_requisition_line ADD CONSTRAINT prl_spend_category_fk
        FOREIGN KEY (tenant_id, spend_category_id)
        REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_requisition_line ADD CONSTRAINT prl_business_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id)
        REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMITMENT PROCUREMENT EXTENSION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_parent_contract_fk
        FOREIGN KEY (tenant_id, parent_contract_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_payment_term_fk
        FOREIGN KEY (tenant_id, payment_term_id)
        REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_payment_method_fk
        FOREIGN KEY (tenant_id, payment_method_id)
        REFERENCES master.payment_method (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_requisition_fk
        FOREIGN KEY (tenant_id, requisition_id)
        REFERENCES document.purchase_requisition (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMITMENT LINE
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.commitment_line ADD CONSTRAINT cl_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_line ADD CONSTRAINT cl_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_line ADD CONSTRAINT cl_requisition_line_fk
        FOREIGN KEY (tenant_id, requisition_line_id)
        REFERENCES document.purchase_requisition_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_line ADD CONSTRAINT cl_parent_line_fk
        FOREIGN KEY (tenant_id, parent_contract_line_id)
        REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_line ADD CONSTRAINT cl_spend_category_fk
        FOREIGN KEY (tenant_id, spend_category_id)
        REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_line ADD CONSTRAINT cl_business_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id)
        REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMITMENT RELEASE ALLOCATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_parent_commitment_fk
        FOREIGN KEY (tenant_id, parent_commitment_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_parent_line_fk
        FOREIGN KEY (tenant_id, parent_line_id)
        REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_release_commitment_fk
        FOREIGN KEY (tenant_id, release_commitment_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_release_line_fk
        FOREIGN KEY (tenant_id, release_line_id)
        REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMITMENT SNAPSHOTS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.commitment_party_snapshot ADD CONSTRAINT cps_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_party_snapshot ADD CONSTRAINT cps_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_address_snapshot ADD CONSTRAINT cas_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_address_snapshot ADD CONSTRAINT cas_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PURCHASE ORDER CONFIRMATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_amendment_fk
        FOREIGN KEY (tenant_id, amendment_commitment_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- purchase_order_confirmation_line ────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.purchase_order_confirmation_line ADD CONSTRAINT pocl_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_order_confirmation_line ADD CONSTRAINT pocl_confirmation_fk
        FOREIGN KEY (tenant_id, confirmation_id)
        REFERENCES document.purchase_order_confirmation (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_order_confirmation_line ADD CONSTRAINT pocl_commitment_line_fk
        FOREIGN KEY (tenant_id, commitment_line_id)
        REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DELIVERY NOTE
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.delivery_note ADD CONSTRAINT dn_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.delivery_note ADD CONSTRAINT dn_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.delivery_note ADD CONSTRAINT dn_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.delivery_note ADD CONSTRAINT dn_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.delivery_note ADD CONSTRAINT dn_site_fk
        FOREIGN KEY (tenant_id, delivery_site_id)
        REFERENCES master.site (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- delivery_note_line ──────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.delivery_note_line ADD CONSTRAINT dnl_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.delivery_note_line ADD CONSTRAINT dnl_delivery_note_fk
        FOREIGN KEY (tenant_id, delivery_note_id)
        REFERENCES document.delivery_note (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.delivery_note_line ADD CONSTRAINT dnl_commitment_line_fk
        FOREIGN KEY (tenant_id, commitment_line_id)
        REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- GOODS RECEIPT
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_delivery_note_fk
        FOREIGN KEY (tenant_id, delivery_note_id)
        REFERENCES document.delivery_note (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_accrual_je_fk
        FOREIGN KEY (accrual_je_id)
        REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_reversal_of_fk
        FOREIGN KEY (tenant_id, reversal_of_id)
        REFERENCES document.goods_receipt (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_workflow_fk
        FOREIGN KEY (workflow_request_id)
        REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- goods_receipt_line ──────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_gr_fk
        FOREIGN KEY (tenant_id, goods_receipt_id)
        REFERENCES document.goods_receipt (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_commitment_line_fk
        FOREIGN KEY (tenant_id, commitment_line_id)
        REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_delivery_note_line_fk
        FOREIGN KEY (tenant_id, delivery_note_line_id)
        REFERENCES document.delivery_note_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_inventory_movement_fk
        FOREIGN KEY (tenant_id, inventory_movement_id)
        REFERENCES ledger.inventory_movement (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_fulfillment_fk
        FOREIGN KEY (tenant_id, fulfillment_id)
        REFERENCES ledger.commitment_fulfillment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SERVICE ENTRY SHEET
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_accrual_je_fk
        FOREIGN KEY (accrual_je_id)
        REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_reversal_of_fk
        FOREIGN KEY (tenant_id, reversal_of_id)
        REFERENCES document.service_entry_sheet (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_workflow_fk
        FOREIGN KEY (workflow_request_id)
        REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- service_entry_sheet_line ────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_ses_fk
        FOREIGN KEY (tenant_id, service_entry_sheet_id)
        REFERENCES document.service_entry_sheet (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_commitment_line_fk
        FOREIGN KEY (tenant_id, commitment_line_id)
        REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_fulfillment_fk
        FOREIGN KEY (tenant_id, fulfillment_id)
        REFERENCES ledger.commitment_fulfillment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_spend_category_fk
        FOREIGN KEY (tenant_id, spend_category_id)
        REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_business_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id)
        REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PURCHASE INVOICE
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_payment_term_fk
        FOREIGN KEY (tenant_id, payment_term_id)
        REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_payment_method_fk
        FOREIGN KEY (tenant_id, payment_method_id)
        REFERENCES master.payment_method (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_workflow_fk
        FOREIGN KEY (workflow_request_id)
        REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_ap_je_fk
        FOREIGN KEY (ap_je_id)
        REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_reversal_of_fk
        FOREIGN KEY (tenant_id, reversal_of_id)
        REFERENCES document.purchase_invoice (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- purchase_invoice_line ───────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_invoice_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_commitment_line_fk
        FOREIGN KEY (tenant_id, commitment_line_id)
        REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_gr_line_fk
        FOREIGN KEY (tenant_id, goods_receipt_line_id)
        REFERENCES document.goods_receipt_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_ses_line_fk
        FOREIGN KEY (tenant_id, ses_line_id)
        REFERENCES document.service_entry_sheet_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_spend_category_fk
        FOREIGN KEY (tenant_id, spend_category_id)
        REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_business_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id)
        REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- INVOICE SNAPSHOTS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.invoice_party_snapshot ADD CONSTRAINT ips_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_party_snapshot ADD CONSTRAINT ips_invoice_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_party_snapshot ADD CONSTRAINT ips_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_address_snapshot ADD CONSTRAINT ias_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_address_snapshot ADD CONSTRAINT ias_invoice_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_bank_snapshot ADD CONSTRAINT ibs_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_bank_snapshot ADD CONSTRAINT ibs_invoice_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_tax_snapshot ADD CONSTRAINT its_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_tax_snapshot ADD CONSTRAINT its_invoice_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_tax_snapshot ADD CONSTRAINT its_invoice_line_fk
        FOREIGN KEY (tenant_id, invoice_line_id)
        REFERENCES document.purchase_invoice_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- INVOICE MATCH CASE + EXCEPTIONS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.invoice_match_case ADD CONSTRAINT imc_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_match_case ADD CONSTRAINT imc_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_match_case ADD CONSTRAINT imc_invoice_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.invoice_match_case ADD CONSTRAINT imc_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.match_exception ADD CONSTRAINT me_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.match_exception ADD CONSTRAINT me_match_case_fk
        FOREIGN KEY (tenant_id, invoice_match_case_id)
        REFERENCES document.invoice_match_case (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.match_exception ADD CONSTRAINT me_invoice_line_fk
        FOREIGN KEY (tenant_id, invoice_line_id)
        REFERENCES document.purchase_invoice_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.match_exception ADD CONSTRAINT me_workflow_fk
        FOREIGN KEY (workflow_request_id)
        REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PAYMENT ENTRY
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.payment_entry ADD CONSTRAINT pe_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry ADD CONSTRAINT pe_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry ADD CONSTRAINT pe_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry ADD CONSTRAINT pe_payment_method_fk
        FOREIGN KEY (tenant_id, payment_method_id)
        REFERENCES master.payment_method (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry ADD CONSTRAINT pe_bank_account_fk
        FOREIGN KEY (tenant_id, bank_account_id)
        REFERENCES master.bank_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry ADD CONSTRAINT pe_supplier_bank_link_fk
        FOREIGN KEY (tenant_id, supplier_bank_link_id)
        REFERENCES master.bank_account_link (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry ADD CONSTRAINT pe_workflow_fk
        FOREIGN KEY (workflow_request_id)
        REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry ADD CONSTRAINT pe_payment_je_fk
        FOREIGN KEY (payment_je_id)
        REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry ADD CONSTRAINT pe_reversal_of_fk
        FOREIGN KEY (tenant_id, reversal_of_id)
        REFERENCES document.payment_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- payment_entry_allocation ────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation ADD CONSTRAINT pea_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation ADD CONSTRAINT pea_payment_fk
        FOREIGN KEY (tenant_id, payment_entry_id)
        REFERENCES document.payment_entry (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation ADD CONSTRAINT pea_invoice_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation ADD CONSTRAINT pea_commitment_fk
        FOREIGN KEY (tenant_id, commitment_id)
        REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation ADD CONSTRAINT pea_pta_fk
        FOREIGN KEY (tenant_id, payment_term_application_id)
        REFERENCES document.payment_term_application (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- payment_remittance_output ───────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.payment_remittance_output ADD CONSTRAINT pro_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_remittance_output ADD CONSTRAINT pro_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_remittance_output ADD CONSTRAINT pro_payment_fk
        FOREIGN KEY (tenant_id, payment_entry_id)
        REFERENCES document.payment_entry (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_remittance_output ADD CONSTRAINT pro_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_remittance_output ADD CONSTRAINT pro_render_output_fk
        FOREIGN KEY (render_output_id)
        REFERENCES document.render_output (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCOUNTING DISTRIBUTION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_gl_account_fk
        FOREIGN KEY (tenant_id, gl_account_id)
        REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id)
        REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_spend_category_fk
        FOREIGN KEY (tenant_id, spend_category_id)
        REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_encumbrance_je_fk
        FOREIGN KEY (encumbrance_je_id)
        REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
