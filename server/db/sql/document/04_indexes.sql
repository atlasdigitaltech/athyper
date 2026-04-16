-- ============================================================================
-- document/04_indexes.sql
-- Concept: Document Indexes — header+line, snapshot, and matching query paths
-- Depends on: 04_tables/004_document.sql and sub-tables
-- Merged from: 004_document, 004a_document_journal, 004b_document_commitment,
--              004d_document_invoice, 004e_document_payment, 004f_document_assets,
--              004g_document_ic, 004h_document_inventory, 004i_document_p2p
-- ============================================================================

-- ============================================================================
-- Workflow / Render (document.workflow_request, render_output, render_job)
-- ============================================================================
CREATE INDEX IF NOT EXISTS wts_template_ordered_idx
    ON control.workflow_template_stage (workflow_template_id, stage_no ASC);

-- ── control.workflow_template_rule ───────────────────────────────────────────
-- Rules for a template stage ordered by priority
CREATE INDEX IF NOT EXISTS wtr_template_stage_idx
    ON control.workflow_template_rule (workflow_template_id, stage_no, priority ASC);

-- ── document.workflow_request ────────────────────────────────────────────────
-- Tenant active requests
CREATE INDEX IF NOT EXISTS wreq_tenant_pending_idx
    ON document.workflow_request (tenant_id, created_at DESC)
    WHERE status = 'pending';
-- Entity's workflow history
CREATE INDEX IF NOT EXISTS wreq_entity_idx
    ON document.workflow_request (entity_type, entity_id, created_at DESC);
-- Idempotency: one pending workflow per entity at a time.
-- createRequest() inserts with ON CONFLICT DO NOTHING and re-fetches on violation.
CREATE UNIQUE INDEX IF NOT EXISTS wreq_one_pending_per_entity_uix
    ON document.workflow_request (tenant_id, entity_type, entity_id)
    WHERE status = 'pending';

-- ── document.user_profile_update_request ───────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_upupr_tenant_status   ON document.user_profile_update_request (tenant_id, status);
CREATE INDEX IF NOT EXISTS ix_upupr_requested_by    ON document.user_profile_update_request (tenant_id, requested_by);
CREATE INDEX IF NOT EXISTS ix_upupr_created_by      ON document.user_profile_update_request (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS ix_upupr_principal       ON document.user_profile_update_request (tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS ix_upupr_workflow        ON document.user_profile_update_request (workflow_request_id);
CREATE INDEX IF NOT EXISTS ix_upupr_created         ON document.user_profile_update_request (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_upupr_active          ON document.user_profile_update_request (tenant_id, requested_by)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS ix_upupr_scope           ON document.user_profile_update_request USING GIN (request_scope);

-- OQ-01: One active UPUPR per principal per tenant
CREATE UNIQUE INDEX IF NOT EXISTS ix_upupr_one_active_per_principal
    ON document.user_profile_update_request (tenant_id, principal_id)
    WHERE is_active = true;


-- =============================================================================
-- §9  DOCUMENT · PRINT · BRANDING  —  document indexes
-- =============================================================================

-- ── document.render_output ─────────────────────────────────────────────────
-- Idempotency: prevents same render being queued twice concurrently
CREATE UNIQUE INDEX IF NOT EXISTS render_output_inflight_uq
    ON document.render_output
    (tenant_id, template_version_id, entity_name, entity_id, operation, variant, locale)
    WHERE status IN ('QUEUED', 'RENDERING');
CREATE INDEX IF NOT EXISTS render_output_entity_idx
    ON document.render_output (tenant_id, entity_name, entity_id);
CREATE INDEX IF NOT EXISTS render_output_status_idx
    ON document.render_output (tenant_id, status)
    WHERE status NOT IN ('ARCHIVED', 'REVOKED');

-- ── document.render_job ────────────────────────────────────────────────────
-- Worker pickup queue: pending + retrying jobs ordered by creation time
CREATE INDEX IF NOT EXISTS render_job_pending_idx
    ON document.render_job (tenant_id, created_at)
    WHERE status IN ('PENDING', 'RETRYING');
CREATE INDEX IF NOT EXISTS render_job_output_idx
    ON document.render_job (tenant_id, output_id);


-- ============================================================================
-- Journal / GL / FX + accounting_distribution
-- ============================================================================
CREATE INDEX IF NOT EXISTS je_company_idx      ON document.journal_entry (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS je_book_idx         ON document.journal_entry (tenant_id, book_id);
CREATE INDEX IF NOT EXISTS je_period_idx       ON document.journal_entry (tenant_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS je_posting_date_idx ON document.journal_entry (tenant_id, company_code_id, posting_date);
CREATE INDEX IF NOT EXISTS je_source_doc_idx   ON document.journal_entry (tenant_id, source_doc_type, source_doc_id)
    WHERE source_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS je_reversal_idx     ON document.journal_entry (tenant_id, reversal_of_id)
    WHERE reversal_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS je_override_idx     ON document.journal_entry (tenant_id, close_override_id)
    WHERE close_override_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS je_status_idx       ON document.journal_entry (tenant_id, company_code_id, status);
CREATE INDEX IF NOT EXISTS je_auto_reverse_pidx ON document.journal_entry (tenant_id, auto_reverse_date)
    WHERE is_auto_reverse = true AND status = 'posted';

-- ── document.journal_line ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS jl_je_idx              ON document.journal_line (tenant_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS jl_company_idx         ON document.journal_line (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS jl_account_idx         ON document.journal_line (tenant_id, gl_account_id);
CREATE INDEX IF NOT EXISTS jl_cc_idx              ON document.journal_line (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_pc_idx              ON document.journal_line (tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_project_idx         ON document.journal_line (tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_site_idx            ON document.journal_line (tenant_id, site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_party_idx           ON document.journal_line (tenant_id, party_type, party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_subledger_idx       ON document.journal_line (tenant_id, subledger_type, party_id) WHERE subledger_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_period_account_idx  ON document.journal_line (tenant_id, company_code_id, fiscal_year, period_number, gl_account_id);

-- ── document.journal_line_reference ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS jlr_line_idx      ON document.journal_line_reference (tenant_id, journal_line_id);
CREATE INDEX IF NOT EXISTS jlr_ref_doc_idx   ON document.journal_line_reference (tenant_id, ref_doc_type, ref_doc_id);
CREATE INDEX IF NOT EXISTS jlr_ref_line_idx  ON document.journal_line_reference (tenant_id, ref_doc_line_id) WHERE ref_doc_line_id IS NOT NULL;

-- ── document.fx_revaluation_run ──────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS fxrr_idempotency_uq
    ON document.fx_revaluation_run (tenant_id, company_code_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS fxrr_period_idx
    ON document.fx_revaluation_run (tenant_id, company_code_id, fiscal_year, period_number);

-- ── document.accounting_distribution ─────────────────────────────────────────
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


-- ============================================================================
-- Commitment engine + obligation horizon + forecast scenario
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_cmt_tenant         ON document.commitment (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cmt_company        ON document.commitment (company_code_id);
CREATE INDEX IF NOT EXISTS idx_cmt_allocation     ON document.commitment (budget_allocation_id)
    WHERE budget_allocation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmt_status         ON document.commitment (tenant_id, status)
    WHERE status NOT IN ('fully_fulfilled','closed','cancelled','expired');
CREATE INDEX IF NOT EXISTS idx_cmt_expiry         ON document.commitment (expiry_date)
    WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmt_fiscal         ON document.commitment (tenant_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_cmt_party          ON document.commitment (party_id)
    WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmt_workflow       ON document.commitment (workflow_request_id)
    WHERE workflow_request_id IS NOT NULL;

-- ── document.commitment_procurement ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cp_supplier_idx
    ON document.commitment_procurement (tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS cp_parent_contract_idx
    ON document.commitment_procurement (tenant_id, parent_contract_id)
    WHERE parent_contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cp_release_orders_idx
    ON document.commitment_procurement (tenant_id, parent_contract_id)
    WHERE is_release_order = true;

-- ── document.commitment_line ─────────────────────────────────────────────────
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

-- ── document.commitment_release_allocation ───────────────────────────────────
CREATE INDEX IF NOT EXISTS cra_parent_line_active_idx
    ON document.commitment_release_allocation (tenant_id, parent_line_id)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS cra_release_commitment_idx
    ON document.commitment_release_allocation (tenant_id, release_commitment_id);

-- ── document.obligation_horizon ──────────────────────────────────────────────
-- Unique: one obligation row per (tenant, commitment, schedule?, fiscal_year)
CREATE UNIQUE INDEX IF NOT EXISTS oh_commitment_sched_year_uq
    ON document.obligation_horizon (
        tenant_id, commitment_id,
        COALESCE(schedule_id, '00000000-0000-0000-0000-000000000000'::uuid),
        fiscal_year);
CREATE INDEX IF NOT EXISTS oh_tenant_fy_idx
    ON document.obligation_horizon (tenant_id, company_code_id, fiscal_year);
CREATE INDEX IF NOT EXISTS oh_commitment_idx
    ON document.obligation_horizon (commitment_id);
-- Tier-based filtering for promotion queries
CREATE INDEX IF NOT EXISTS oh_tier_active_pidx
    ON document.obligation_horizon (obligation_tier, tenant_id, fiscal_year)
    WHERE is_active = true;

-- ── document.forecast_scenario ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fs_tenant          ON document.forecast_scenario (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fs_company         ON document.forecast_scenario (company_code_id);
CREATE INDEX IF NOT EXISTS idx_fs_fiscal          ON document.forecast_scenario (tenant_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fs_status          ON document.forecast_scenario (tenant_id, status)
    WHERE status NOT IN ('archived','cancelled');
CREATE INDEX IF NOT EXISTS idx_fs_baseline        ON document.forecast_scenario (tenant_id, is_baseline)
    WHERE is_baseline = true;
CREATE INDEX IF NOT EXISTS idx_fs_model           ON document.forecast_scenario (planning_model_id)
    WHERE planning_model_id IS NOT NULL;


-- ============================================================================
-- Invoice domain
-- ============================================================================
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

-- ── document.purchase_invoice_line ───────────────────────────────────────────
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

-- ── document.invoice_party_snapshot ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ips_supplier_idx
    ON document.invoice_party_snapshot (tenant_id, supplier_id)
    WHERE supplier_id IS NOT NULL;

-- ── document.invoice_match_case ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS imc_pending_idx
    ON document.invoice_match_case (tenant_id, company_code_id)
    WHERE status IN ('pending','in_progress','exception');

-- ── document.match_exception ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS me_match_case_idx
    ON document.match_exception (tenant_id, invoice_match_case_id);
CREATE INDEX IF NOT EXISTS me_open_exceptions_idx
    ON document.match_exception (tenant_id, invoice_line_id)
    WHERE status = 'open';
CREATE INDEX IF NOT EXISTS me_workflow_idx
    ON document.match_exception (workflow_request_id)
    WHERE workflow_request_id IS NOT NULL;

-- ── document.payment_term_application ────────────────────────────────────────
-- pta: all applications for an invoice
CREATE INDEX IF NOT EXISTS pta_invoice_idx
    ON document.payment_term_application (invoice_id);
-- pta: commitment + clause lookup (deduction evaluation)
CREATE INDEX IF NOT EXISTS pta_commitment_clause_idx
    ON document.payment_term_application (commitment_id, clause_code)
    WHERE is_effective = true;
-- pta: cumulative running totals per commitment x clause_code
CREATE INDEX IF NOT EXISTS pta_commitment_cumulative_idx
    ON document.payment_term_application (commitment_id, clause_code, evaluation_sequence_no)
    WHERE is_effective = true;


-- ============================================================================
-- Payment domain
-- ============================================================================
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

-- ── document.payment_entry_allocation ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pea_payment_idx
    ON document.payment_entry_allocation (tenant_id, payment_entry_id);
CREATE INDEX IF NOT EXISTS pea_invoice_idx
    ON document.payment_entry_allocation (tenant_id, purchase_invoice_id)
    WHERE purchase_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pea_commitment_idx
    ON document.payment_entry_allocation (tenant_id, commitment_id)
    WHERE commitment_id IS NOT NULL;

-- ── document.payment_remittance_output ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS pro_payment_idx
    ON document.payment_remittance_output (tenant_id, payment_entry_id);
CREATE INDEX IF NOT EXISTS pro_pending_delivery_idx
    ON document.payment_remittance_output (tenant_id)
    WHERE delivery_status = 'pending';

-- ── document.payment_term_discount_result ────────────────────────────────────
-- ptdr: all discount results for a payment
CREATE INDEX IF NOT EXISTS ptdr_payment_idx
    ON document.payment_term_discount_result (payment_id);
-- ptdr: all discount results for an invoice
CREATE INDEX IF NOT EXISTS ptdr_invoice_idx
    ON document.payment_term_discount_result (invoice_id);


-- ============================================================================
-- Fixed asset transactions
-- ============================================================================
CREATE INDEX IF NOT EXISTS atx_company_idx       ON document.asset_transaction (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS atx_asset_book_idx    ON document.asset_transaction (tenant_id, asset_id, asset_book_id);
CREATE INDEX IF NOT EXISTS atx_period_idx        ON document.asset_transaction (tenant_id, company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS atx_type_idx          ON document.asset_transaction (tenant_id, company_code_id, txn_type);
CREATE INDEX IF NOT EXISTS atx_run_idx           ON document.asset_transaction (depreciation_run_id)
    WHERE depreciation_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS atx_je_idx            ON document.asset_transaction (reference_je_id)
    WHERE reference_je_id IS NOT NULL;

-- ── document.depreciation_run ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS dr_company_idx        ON document.depreciation_run (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS dr_period_idx         ON document.depreciation_run (tenant_id, company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS dr_status_idx         ON document.depreciation_run (tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS dr_idempotency_uq
    ON document.depreciation_run (tenant_id, company_code_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ── document.depreciation_run_line ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS drl_run_idx           ON document.depreciation_run_line (tenant_id, run_id);
CREATE INDEX IF NOT EXISTS drl_asset_idx         ON document.depreciation_run_line (tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS drl_book_idx          ON document.depreciation_run_line (tenant_id, asset_book_id);

-- ── document.depreciation_schedule ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ds_book_ver_idx       ON document.depreciation_schedule (tenant_id, asset_book_id, schedule_version);
CREATE INDEX IF NOT EXISTS ds_period_idx         ON document.depreciation_schedule (fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS ds_unactual_pidx      ON document.depreciation_schedule (asset_book_id, schedule_version)
    WHERE actual_amount IS NULL;


-- ============================================================================
-- Intercompany engine
-- ============================================================================
CREATE INDEX IF NOT EXISTS ica_pair_idx
    ON document.intercompany_agreement (tenant_id, source_company_code_id, dest_company_code_id, agreement_type)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ica_supersedes_idx
    ON document.intercompany_agreement (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ica_company_idx
    ON document.intercompany_agreement (tenant_id, company_code_id);

-- ── document.intercompany_transaction ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ict_pair_period_idx
    ON document.intercompany_transaction (
        tenant_id, source_company_code_id, dest_company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS ict_agreement_idx
    ON document.intercompany_transaction (tenant_id, agreement_id)
    WHERE agreement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ict_mirror_idx
    ON document.intercompany_transaction (tenant_id, mirror_txn_id)
    WHERE mirror_txn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ict_netting_idx
    ON document.intercompany_transaction (tenant_id, netting_batch_id)
    WHERE netting_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ict_match_status_idx
    ON document.intercompany_transaction (tenant_id, match_status)
    WHERE match_status IN ('UNMATCHED','DISPUTED');

-- ── document.netting_batch ───────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS nb_idempotency_uq
    ON document.netting_batch (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS nb_pair_period_idx
    ON document.netting_batch (tenant_id, company_code_a_id, company_code_b_id, fiscal_year, period_number);

-- ── document.ic_elimination ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ice_pair_period_idx
    ON document.ic_elimination (tenant_id, source_company_code_id, counterparty_company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS ice_consol_group_idx
    ON document.ic_elimination (tenant_id, consolidation_group, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS ice_ic_txn_idx
    ON document.ic_elimination (tenant_id, ic_transaction_id)
    WHERE ic_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ice_approval_queue_idx
    ON document.ic_elimination (tenant_id, approval_route, status)
    WHERE status = 'calculated' AND approval_route IN ('ENHANCED','MANUAL');


-- ============================================================================
-- Inventory management
-- ============================================================================
CREATE INDEX IF NOT EXISTS st_warehouse_idx
    ON document.stocktake (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS st_open_pidx
    ON document.stocktake (tenant_id, company_code_id, status)
    WHERE status IN ('planned', 'in_progress');
CREATE INDEX IF NOT EXISTS st_date_idx
    ON document.stocktake (tenant_id, company_code_id, stocktake_date DESC);
CREATE INDEX IF NOT EXISTS st_variance_je_idx
    ON document.stocktake (tenant_id, variance_je_id)
    WHERE variance_je_id IS NOT NULL;

-- ── document.stocktake_line ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS stl_stocktake_idx
    ON document.stocktake_line (tenant_id, stocktake_id);
CREATE INDEX IF NOT EXISTS stl_item_idx
    ON document.stocktake_line (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS stl_warehouse_idx
    ON document.stocktake_line (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS stl_variance_pidx
    ON document.stocktake_line (tenant_id, stocktake_id)
    WHERE (counted_qty - system_qty) <> 0;


-- ============================================================================
-- P2P (purchase requisition → service entry sheet)
-- ============================================================================
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

-- ── document.purchase_requisition_line ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS prl_requisition_idx
    ON document.purchase_requisition_line (tenant_id, purchase_requisition_id);
CREATE INDEX IF NOT EXISTS prl_status_open_idx
    ON document.purchase_requisition_line (tenant_id, purchase_requisition_id)
    WHERE status = 'open';
CREATE INDEX IF NOT EXISTS prl_item_idx
    ON document.purchase_requisition_line (tenant_id, item_id)
    WHERE item_id IS NOT NULL;

-- ── document.purchase_order_confirmation ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS poc_commitment_idx
    ON document.purchase_order_confirmation (tenant_id, commitment_id);
CREATE INDEX IF NOT EXISTS poc_supplier_pending_idx
    ON document.purchase_order_confirmation (tenant_id, supplier_id)
    WHERE status IN ('received','changes_proposed');

-- ── document.delivery_note ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS dn_commitment_idx
    ON document.delivery_note (tenant_id, commitment_id);
CREATE INDEX IF NOT EXISTS dn_supplier_idx
    ON document.delivery_note (tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS dn_arrival_pending_idx
    ON document.delivery_note (tenant_id, expected_arrival_date)
    WHERE status IN ('draft','in_transit');
CREATE INDEX IF NOT EXISTS dn_site_idx
    ON document.delivery_note (tenant_id, delivery_site_id);

-- ── document.delivery_note_line ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS dnl_delivery_note_idx
    ON document.delivery_note_line (tenant_id, delivery_note_id);
CREATE INDEX IF NOT EXISTS dnl_commitment_line_idx
    ON document.delivery_note_line (tenant_id, commitment_line_id);

-- ── document.goods_receipt ───────────────────────────────────────────────────
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

-- ── document.goods_receipt_line ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS grl_gr_idx
    ON document.goods_receipt_line (tenant_id, goods_receipt_id);
CREATE INDEX IF NOT EXISTS grl_commitment_line_idx
    ON document.goods_receipt_line (tenant_id, commitment_line_id);
CREATE INDEX IF NOT EXISTS grl_item_idx
    ON document.goods_receipt_line (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS grl_warehouse_idx
    ON document.goods_receipt_line (tenant_id, warehouse_id);

-- ── document.service_entry_sheet ─────────────────────────────────────────────
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

-- ── document.service_entry_sheet_line ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS sesl_ses_idx
    ON document.service_entry_sheet_line (tenant_id, service_entry_sheet_id);
CREATE INDEX IF NOT EXISTS sesl_commitment_line_idx
    ON document.service_entry_sheet_line (tenant_id, commitment_line_id);

-- ── document.wht_certificate ─────────────────────────────────────────────────
-- R7-C: lookup by vendor + company + period
CREATE INDEX IF NOT EXISTS whtc_company_party_idx
    ON document.wht_certificate (tenant_id, company_code_id, counterparty_id);

-- Active (non-voided) certs for a period
CREATE INDEX IF NOT EXISTS whtc_active_period_pidx
    ON document.wht_certificate (tenant_id, company_code_id, period_from, period_to)
    WHERE status <> 'voided';
