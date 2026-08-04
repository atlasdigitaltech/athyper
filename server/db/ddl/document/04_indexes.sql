-- ============================================================================
-- document/04_indexes.sql
-- Non-constraint indexes reconstructed from the live catalog.
-- Generated from the live Neon database document schema. Do not hand-edit.
-- ============================================================================

CREATE INDEX ad_asset_id_idx ON document.accounting_distribution USING btree (tenant_id, asset_id) WHERE asset_id IS NOT NULL;

CREATE INDEX ad_source_doc_idx ON document.accounting_distribution USING btree (tenant_id, source_doc_type, source_doc_id);

CREATE INDEX ad_source_line_idx ON document.accounting_distribution USING btree (tenant_id, source_line_id);

CREATE INDEX atx_asset_book_idx ON document.asset_transaction USING btree (tenant_id, asset_id, asset_book_id);

CREATE INDEX atx_company_idx ON document.asset_transaction USING btree (tenant_id, company_code_id);

CREATE INDEX atx_je_idx ON document.asset_transaction USING btree (reference_je_id) WHERE reference_je_id IS NOT NULL;

CREATE INDEX atx_period_idx ON document.asset_transaction USING btree (tenant_id, company_code_id, fiscal_year, period_number);

CREATE INDEX atx_run_idx ON document.asset_transaction USING btree (depreciation_run_id) WHERE depreciation_run_id IS NOT NULL;

CREATE INDEX atx_type_idx ON document.asset_transaction USING btree (tenant_id, company_code_id, txn_type);

CREATE INDEX attendance_adjustment_workflow_idx ON document.attendance_adjustment_request USING btree (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE INDEX attendance_day_employee_date_idx ON document.attendance_day USING btree (tenant_id, employee_id, attendance_date DESC);

CREATE INDEX brc_bank_account_idx ON document.bank_recon_case USING btree (tenant_id, bank_account_id, created_at DESC);

CREATE INDEX brc_company_idx ON document.bank_recon_case USING btree (tenant_id, company_code_id, created_at DESC);

CREATE INDEX brc_open_idx ON document.bank_recon_case USING btree (tenant_id, bank_account_id) WHERE status = ANY (ARRAY['open'::text, 'matched'::text]);

CREATE INDEX brcl_case_idx ON document.bank_recon_case_line USING btree (tenant_id, bank_recon_case_id);

CREATE INDEX brcl_payment_idx ON document.bank_recon_case_line USING btree (tenant_id, payment_entry_id) WHERE payment_entry_id IS NOT NULL;

CREATE INDEX brcl_stmt_line_idx ON document.bank_recon_case_line USING btree (tenant_id, bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL;

CREATE INDEX bst_bank_account_period_idx ON document.bank_statement USING btree (tenant_id, bank_account_id, period_end_date DESC);

CREATE INDEX bst_company_idx ON document.bank_statement USING btree (tenant_id, company_code_id, period_end_date DESC);

CREATE UNIQUE INDEX bst_source_hash_uq ON document.bank_statement USING btree (tenant_id, bank_account_id, source_hash) WHERE source_hash IS NOT NULL;

CREATE INDEX bst_status_idx ON document.bank_statement USING btree (tenant_id, status) WHERE status = ANY (ARRAY['imported'::text, 'matching'::text]);

CREATE INDEX bsl_date_amount_idx ON document.bank_statement_line USING btree (tenant_id, bank_statement_id, transaction_date, amount);

CREATE UNIQUE INDEX bsl_idempotency_uq ON document.bank_statement_line USING btree (tenant_id, bank_statement_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX bsl_recon_case_idx ON document.bank_statement_line USING btree (recon_case_id) WHERE recon_case_id IS NOT NULL;

CREATE INDEX bsl_statement_line_idx ON document.bank_statement_line USING btree (tenant_id, bank_statement_id, line_no);

CREATE INDEX bsl_unmatched_idx ON document.bank_statement_line USING btree (tenant_id, bank_statement_id, transaction_date) WHERE recon_status = 'unmatched'::text;

CREATE INDEX bpd_failure_idx ON document.book_posting_derivation USING btree (tenant_id, company_code_id, last_attempt_at DESC) WHERE status = 'failed'::text;

CREATE INDEX bpd_rule_status_idx ON document.book_posting_derivation USING btree (tenant_id, posting_rule_id, status);

CREATE INDEX bpd_source_idx ON document.book_posting_derivation USING btree (tenant_id, source_journal_id, created_at DESC);

CREATE INDEX bpd_target_idx ON document.book_posting_derivation USING btree (tenant_id, target_journal_id) WHERE target_journal_id IS NOT NULL;

CREATE INDEX ix_cl_cleanup ON document.command_log USING btree (created_at) WHERE status = ANY (ARRAY['done'::text, 'error'::text]);

CREATE INDEX ix_cl_tenant_op ON document.command_log USING btree (tenant_id, operation, created_at DESC);

CREATE INDEX idx_cmt_company ON document.commitment USING btree (company_code_id);

CREATE INDEX idx_cmt_expiry ON document.commitment USING btree (expiry_date) WHERE expiry_date IS NOT NULL;

CREATE INDEX idx_cmt_fiscal ON document.commitment USING btree (tenant_id, fiscal_year, period_number);

CREATE INDEX idx_cmt_party ON document.commitment USING btree (party_id) WHERE party_id IS NOT NULL;

CREATE INDEX idx_cmt_provisional_expiry ON document.commitment USING btree (tenant_id, draft_expires_at) WHERE is_provisional = true AND status = 'draft'::text AND code = ''::text;

CREATE INDEX idx_cmt_status ON document.commitment USING btree (tenant_id, status) WHERE status <> ALL (ARRAY['fully_fulfilled'::text, 'closed'::text, 'cancelled'::text, 'expired'::text]);

CREATE INDEX idx_cmt_tenant ON document.commitment USING btree (tenant_id);

CREATE INDEX idx_cmt_workflow ON document.commitment USING btree (workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE UNIQUE INDEX uq_cmt_active_provisional ON document.commitment USING btree (tenant_id, commitment_type, draft_started_by, company_code_id) WHERE is_provisional = true;

CREATE INDEX cl_asset_class_idx ON document.commitment_line USING btree (tenant_id, asset_class_id) WHERE asset_class_id IS NOT NULL;

CREATE INDEX cl_commitment_idx ON document.commitment_line USING btree (tenant_id, commitment_id);

CREATE INDEX cl_item_idx ON document.commitment_line USING btree (tenant_id, item_id) WHERE item_id IS NOT NULL;

CREATE INDEX cl_open_lines_idx ON document.commitment_line USING btree (tenant_id, commitment_id) WHERE status = ANY (ARRAY['open'::text, 'partially_received'::text, 'partially_invoiced'::text]);

CREATE INDEX cl_req_line_idx ON document.commitment_line USING btree (tenant_id, requisition_line_id) WHERE requisition_line_id IS NOT NULL;

CREATE INDEX cl_shipto_address_idx ON document.commitment_line USING btree (tenant_id, shipto_address_id) WHERE shipto_address_id IS NOT NULL;

CREATE INDEX cl_site_idx ON document.commitment_line USING btree (tenant_id, site_id) WHERE site_id IS NOT NULL;

CREATE INDEX cra_parent_line_active_idx ON document.commitment_release_allocation USING btree (tenant_id, parent_line_id) WHERE status = 'active'::text;

CREATE INDEX cra_release_commitment_idx ON document.commitment_release_allocation USING btree (tenant_id, release_commitment_id);

CREATE INDEX compensation_assignment_employee_idx ON document.compensation_assignment USING btree (tenant_id, employee_id, effective_from DESC);

CREATE INDEX compensation_assignment_employment_idx ON document.compensation_assignment USING btree (tenant_id, employment_id) WHERE employment_id IS NOT NULL;

CREATE UNIQUE INDEX compensation_assignment_one_open_active_uq ON document.compensation_assignment USING btree (tenant_id, employee_id, pay_group_id) WHERE effective_until IS NULL AND status = 'active'::text;

CREATE INDEX compensation_change_workflow_idx ON document.compensation_change USING btree (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE INDEX dn_arrival_pending_idx ON document.delivery_note USING btree (tenant_id, expected_arrival_date) WHERE status = ANY (ARRAY['draft'::text, 'in_transit'::text]);

CREATE INDEX dn_commitment_idx ON document.delivery_note USING btree (tenant_id, commitment_id);

CREATE INDEX dn_site_idx ON document.delivery_note USING btree (tenant_id, delivery_site_id);

CREATE INDEX dn_supplier_idx ON document.delivery_note USING btree (tenant_id, supplier_id);

CREATE INDEX dnl_commitment_line_idx ON document.delivery_note_line USING btree (tenant_id, commitment_line_id);

CREATE INDEX dnl_delivery_note_idx ON document.delivery_note_line USING btree (tenant_id, delivery_note_id);

CREATE INDEX dr_company_idx ON document.depreciation_run USING btree (tenant_id, company_code_id);

CREATE UNIQUE INDEX dr_idempotency_uq ON document.depreciation_run USING btree (tenant_id, company_code_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX dr_period_idx ON document.depreciation_run USING btree (tenant_id, company_code_id, fiscal_year, period_number);

CREATE INDEX dr_status_idx ON document.depreciation_run USING btree (tenant_id, status);

CREATE INDEX drl_asset_idx ON document.depreciation_run_line USING btree (tenant_id, asset_id);

CREATE INDEX drl_book_idx ON document.depreciation_run_line USING btree (tenant_id, asset_book_id);

CREATE INDEX drl_run_idx ON document.depreciation_run_line USING btree (tenant_id, run_id);

CREATE INDEX ds_book_ver_idx ON document.depreciation_schedule USING btree (tenant_id, asset_book_id, schedule_version);

CREATE INDEX ds_period_idx ON document.depreciation_schedule USING btree (fiscal_year, period_number);

CREATE INDEX ds_unactual_pidx ON document.depreciation_schedule USING btree (asset_book_id, schedule_version) WHERE actual_amount IS NULL;

CREATE INDEX doc_attachment_entity_idx ON document.doc_attachment USING btree (tenant_id, entity_type, entity_id);

CREATE UNIQUE INDEX employee_tax_declaration_year_uq_nonnull ON document.employee_tax_declaration USING btree (tenant_id, employee_id, employment_id, country_code, tax_year) WHERE employment_id IS NOT NULL;

CREATE UNIQUE INDEX employee_tax_declaration_year_uq_null ON document.employee_tax_declaration USING btree (tenant_id, employee_id, country_code, tax_year) WHERE employment_id IS NULL;

CREATE INDEX tax_declaration_employee_idx ON document.employee_tax_declaration USING btree (tenant_id, employee_id, tax_year DESC);

CREATE INDEX idx_fs_baseline ON document.forecast_scenario USING btree (tenant_id, is_baseline) WHERE is_baseline = true;

CREATE INDEX idx_fs_company ON document.forecast_scenario USING btree (company_code_id);

CREATE INDEX idx_fs_fiscal ON document.forecast_scenario USING btree (tenant_id, fiscal_year);

CREATE INDEX idx_fs_model ON document.forecast_scenario USING btree (planning_model_id) WHERE planning_model_id IS NOT NULL;

CREATE INDEX idx_fs_status ON document.forecast_scenario USING btree (tenant_id, status) WHERE status <> ALL (ARRAY['archived'::text, 'cancelled'::text]);

CREATE INDEX idx_fs_tenant ON document.forecast_scenario USING btree (tenant_id);

CREATE UNIQUE INDEX fxrr_idempotency_uq ON document.fx_revaluation_run USING btree (tenant_id, company_code_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX fxrr_period_idx ON document.fx_revaluation_run USING btree (tenant_id, company_code_id, fiscal_year, period_number);

CREATE INDEX hr_case_assigned_status_idx ON document.hr_case USING btree (tenant_id, assigned_to, status) WHERE assigned_to IS NOT NULL;

CREATE INDEX hr_case_employee_status_idx ON document.hr_case USING btree (tenant_id, employee_id, status) WHERE employee_id IS NOT NULL;

CREATE INDEX ice_approval_queue_idx ON document.ic_elimination USING btree (tenant_id, approval_route, status) WHERE status = 'calculated'::text AND (approval_route = ANY (ARRAY['ENHANCED'::text, 'MANUAL'::text]));

CREATE INDEX ice_consol_group_idx ON document.ic_elimination USING btree (tenant_id, consolidation_group, fiscal_year, period_number);

CREATE INDEX ice_ic_txn_idx ON document.ic_elimination USING btree (tenant_id, ic_transaction_id) WHERE ic_transaction_id IS NOT NULL;

CREATE INDEX ice_pair_period_idx ON document.ic_elimination USING btree (tenant_id, source_company_code_id, counterparty_company_code_id, fiscal_year, period_number);

CREATE INDEX import_request_tenant_entity_idx ON document.import_request USING btree (tenant_id, entity_name, created_at DESC);

CREATE INDEX import_request_tenant_status_idx ON document.import_request USING btree (tenant_id, status, created_at DESC);

CREATE INDEX import_chunk_request_idx ON document.import_request_chunk USING btree (import_request_id, chunk_index);

CREATE INDEX import_chunk_status_idx ON document.import_request_chunk USING btree (import_request_id, status) WHERE status = ANY (ARRAY['pending'::text, 'processing'::text]);

CREATE INDEX ica_company_idx ON document.intercompany_agreement USING btree (tenant_id, company_code_id);

CREATE INDEX ica_pair_idx ON document.intercompany_agreement USING btree (tenant_id, source_company_code_id, dest_company_code_id, agreement_type) WHERE status = 'active'::text;

CREATE INDEX ica_supersedes_idx ON document.intercompany_agreement USING btree (tenant_id, supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE INDEX ict_agreement_idx ON document.intercompany_transaction USING btree (tenant_id, agreement_id) WHERE agreement_id IS NOT NULL;

CREATE INDEX ict_match_status_idx ON document.intercompany_transaction USING btree (tenant_id, match_status) WHERE match_status = ANY (ARRAY['UNMATCHED'::text, 'DISPUTED'::text]);

CREATE INDEX ict_mirror_idx ON document.intercompany_transaction USING btree (tenant_id, mirror_txn_id) WHERE mirror_txn_id IS NOT NULL;

CREATE INDEX ict_netting_idx ON document.intercompany_transaction USING btree (tenant_id, netting_batch_id) WHERE netting_batch_id IS NOT NULL;

CREATE INDEX ict_pair_period_idx ON document.intercompany_transaction USING btree (tenant_id, source_company_code_id, dest_company_code_id, fiscal_year, period_number);

CREATE INDEX imc_pending_idx ON document.invoice_match_case USING btree (tenant_id, company_code_id) WHERE status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'exception'::text]);

CREATE INDEX je_auto_reverse_pidx ON document.journal_entry USING btree (tenant_id, auto_reverse_date) WHERE is_auto_reverse = true AND status = 'posted'::text;

CREATE INDEX je_book_idx ON document.journal_entry USING btree (tenant_id, book_id);

CREATE INDEX je_company_idx ON document.journal_entry USING btree (tenant_id, company_code_id);

CREATE UNIQUE INDEX je_idempotency_uq ON document.journal_entry USING btree (tenant_id, book_idempotency_key) WHERE book_idempotency_key IS NOT NULL;

CREATE INDEX je_override_idx ON document.journal_entry USING btree (tenant_id, close_override_id) WHERE close_override_id IS NOT NULL;

CREATE INDEX je_period_idx ON document.journal_entry USING btree (tenant_id, fiscal_period_id);

CREATE INDEX je_posting_date_idx ON document.journal_entry USING btree (tenant_id, company_code_id, posting_date);

CREATE INDEX je_reversal_idx ON document.journal_entry USING btree (tenant_id, reversal_of_id) WHERE reversal_of_id IS NOT NULL;

CREATE INDEX je_source_doc_idx ON document.journal_entry USING btree (tenant_id, source_doc_type, source_doc_id) WHERE source_doc_id IS NOT NULL;

CREATE INDEX je_status_idx ON document.journal_entry USING btree (tenant_id, company_code_id, status);

CREATE INDEX jl_account_idx ON document.journal_line USING btree (tenant_id, gl_account_id);

CREATE INDEX jl_cc_idx ON document.journal_line USING btree (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;

CREATE INDEX jl_company_idx ON document.journal_line USING btree (tenant_id, company_code_id);

CREATE INDEX jl_je_idx ON document.journal_line USING btree (tenant_id, journal_entry_id);

CREATE INDEX jl_party_idx ON document.journal_line USING btree (tenant_id, party_type, party_id) WHERE party_id IS NOT NULL;

CREATE INDEX jl_pc_idx ON document.journal_line USING btree (tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;

CREATE INDEX jl_period_account_idx ON document.journal_line USING btree (tenant_id, company_code_id, fiscal_year, period_number, gl_account_id);

CREATE INDEX jl_project_idx ON document.journal_line USING btree (tenant_id, project_id) WHERE project_id IS NOT NULL;

CREATE INDEX jl_site_idx ON document.journal_line USING btree (tenant_id, site_id) WHERE site_id IS NOT NULL;

CREATE INDEX jl_subledger_idx ON document.journal_line USING btree (tenant_id, subledger_type, party_id) WHERE subledger_type IS NOT NULL;

CREATE INDEX jlr_line_idx ON document.journal_line_reference USING btree (tenant_id, journal_line_id);

CREATE UNIQUE INDEX jlr_line_ref_uq ON document.journal_line_reference USING btree (tenant_id, journal_line_id, ref_doc_type, ref_doc_id, COALESCE(ref_doc_line_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX jlr_ref_doc_idx ON document.journal_line_reference USING btree (tenant_id, ref_doc_type, ref_doc_id);

CREATE INDEX jlr_ref_line_idx ON document.journal_line_reference USING btree (tenant_id, ref_doc_line_id) WHERE ref_doc_line_id IS NOT NULL;

CREATE INDEX leave_balance_employee_type_idx ON document.leave_balance_entry USING btree (tenant_id, employee_id, leave_type_id, entry_date DESC);

CREATE INDEX leave_balance_plan_employee_idx ON document.leave_balance_entry USING btree (tenant_id, leave_plan_id, employee_id) WHERE leave_plan_id IS NOT NULL;

CREATE INDEX leave_request_employee_dates_idx ON document.leave_request USING btree (tenant_id, employee_id, start_date DESC, end_date DESC);

CREATE INDEX leave_request_type_status_idx ON document.leave_request USING btree (tenant_id, leave_type_id, status);

CREATE INDEX leave_request_workflow_idx ON document.leave_request USING btree (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE INDEX me_match_case_idx ON document.match_exception USING btree (tenant_id, invoice_match_case_id);

CREATE INDEX me_open_exceptions_idx ON document.match_exception USING btree (tenant_id, invoice_line_id) WHERE status = 'open'::text;

CREATE INDEX me_workflow_idx ON document.match_exception USING btree (workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE UNIQUE INDEX nb_idempotency_uq ON document.netting_batch USING btree (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX nb_pair_period_idx ON document.netting_batch USING btree (tenant_id, company_code_a_id, company_code_b_id, fiscal_year, period_number);

CREATE INDEX oh_commitment_idx ON document.obligation_horizon USING btree (commitment_id);

CREATE UNIQUE INDEX oh_commitment_sched_year_uq ON document.obligation_horizon USING btree (tenant_id, commitment_id, COALESCE(schedule_id, '00000000-0000-0000-0000-000000000000'::uuid), fiscal_year);

CREATE INDEX oh_tenant_fy_idx ON document.obligation_horizon USING btree (tenant_id, company_code_id, fiscal_year);

CREATE INDEX oh_tier_active_pidx ON document.obligation_horizon USING btree (obligation_tier, tenant_id, fiscal_year) WHERE is_active = true;

CREATE INDEX onboarding_case_target_start_idx ON document.onboarding_case USING btree (tenant_id, target_start_date) WHERE target_start_date IS NOT NULL;

CREATE INDEX ix_pab_company ON document.party_advance_balance USING btree (tenant_id, company_code_id, currency_code);

CREATE INDEX ix_pab_supplier ON document.party_advance_balance USING btree (tenant_id, supplier_id);

CREATE INDEX pe_bank_stmt_line_idx ON document.payment_entry USING btree (bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL;

CREATE INDEX pe_payment_run_idx ON document.payment_entry USING btree (tenant_id, payment_run_id) WHERE payment_run_id IS NOT NULL;

CREATE INDEX pe_pending_approval_idx ON document.payment_entry USING btree (tenant_id, company_code_id) WHERE status = 'pending_approval'::text;

CREATE INDEX pe_posting_date_idx ON document.payment_entry USING btree (tenant_id, company_code_id, posting_date DESC);

CREATE INDEX pe_supplier_idx ON document.payment_entry USING btree (tenant_id, supplier_id) WHERE supplier_id IS NOT NULL;

CREATE INDEX pe_unposted_approved_idx ON document.payment_entry USING btree (tenant_id) WHERE status = 'approved'::text AND is_posted = false;

CREATE INDEX pe_value_date_idx ON document.payment_entry USING btree (tenant_id, value_date) WHERE (status = ANY (ARRAY['approved'::text, 'posted'::text])) AND is_transmitted = false;

CREATE INDEX pe_workflow_idx ON document.payment_entry USING btree (workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE INDEX pea_commitment_idx ON document.payment_entry_allocation USING btree (tenant_id, commitment_id) WHERE commitment_id IS NOT NULL;

CREATE INDEX pea_invoice_idx ON document.payment_entry_allocation USING btree (tenant_id, purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL;

CREATE INDEX pea_payment_idx ON document.payment_entry_allocation USING btree (tenant_id, payment_entry_id);

CREATE INDEX pro_payment_idx ON document.payment_remittance_output USING btree (tenant_id, payment_entry_id);

CREATE INDEX pro_pending_delivery_idx ON document.payment_remittance_output USING btree (tenant_id) WHERE delivery_status = 'pending'::text;

CREATE INDEX ix_pta_pricing_component ON document.payment_term_application USING btree (tenant_id, pricing_component_id) WHERE pricing_component_id IS NOT NULL;

CREATE INDEX pta_commitment_clause_idx ON document.payment_term_application USING btree (commitment_id, clause_code) WHERE is_effective = true;

CREATE INDEX pta_commitment_cumulative_idx ON document.payment_term_application USING btree (commitment_id, clause_code, evaluation_sequence_no) WHERE is_effective = true;

CREATE UNIQUE INDEX pta_invoice_clause_uq ON document.payment_term_application USING btree (invoice_id, clause_code, COALESCE(invoice_line_id, '00000000-0000-0000-0000-000000000000'::uuid), evaluation_sequence_no);

CREATE INDEX pta_invoice_idx ON document.payment_term_application USING btree (invoice_id);

CREATE INDEX ptdr_invoice_idx ON document.payment_term_discount_result USING btree (invoice_id);

CREATE INDEX ptdr_payment_idx ON document.payment_term_discount_result USING btree (payment_id);

CREATE UNIQUE INDEX ptdr_payment_invoice_tier_uq ON document.payment_term_discount_result USING btree (payment_id, invoice_id, COALESCE(qualified_tier_no::integer, 0)) WHERE is_reversal = false;

CREATE UNIQUE INDEX ptdr_single_reversal_uq ON document.payment_term_discount_result USING btree (reverses_id) WHERE is_reversal = true;

CREATE INDEX payroll_period_group_idx ON document.payroll_period USING btree (tenant_id, pay_group_id, period_year, period_number);

CREATE INDEX payroll_result_employee_idx ON document.payroll_result USING btree (tenant_id, employee_id);

CREATE INDEX payroll_result_run_idx ON document.payroll_result USING btree (tenant_id, payroll_run_id);

CREATE INDEX payroll_result_line_component_idx ON document.payroll_result_line USING btree (tenant_id, pay_component_id);

CREATE INDEX payroll_result_line_result_idx ON document.payroll_result_line USING btree (tenant_id, payroll_result_id, line_no);

CREATE INDEX payroll_run_period_idx ON document.payroll_run USING btree (tenant_id, payroll_period_id, run_no);

CREATE INDEX people_request_workflow_idx ON document.people_request USING btree (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE INDEX policy_acknowledgment_policy_idx ON document.policy_acknowledgment USING btree (tenant_id, policy_code, policy_version);

CREATE INDEX ix_pc_apportion_chain ON document.pricing_component USING btree (tenant_id, is_apportioned_from_id) WHERE is_apportioned_from_id IS NOT NULL;

CREATE INDEX ix_pc_condition_type ON document.pricing_component USING btree (tenant_id, condition_type_id) WHERE superseded_by_id IS NULL;

CREATE INDEX ix_pc_source_active ON document.pricing_component USING btree (tenant_id, source_doc_type, source_doc_id, source_line_id, term_type, sequence) WHERE superseded_by_id IS NULL;

CREATE INDEX ix_pc_supersede_chain ON document.pricing_component USING btree (tenant_id, superseded_by_id) WHERE superseded_by_id IS NOT NULL;

CREATE INDEX pi_aging_company_idx ON document.purchase_invoice USING btree (tenant_id, company_code_id, due_date) WHERE (status = ANY (ARRAY['posted'::text, 'partially_paid'::text])) AND due_date IS NOT NULL;

CREATE INDEX pi_ap_je_idx ON document.purchase_invoice USING btree (ap_je_id) WHERE ap_je_id IS NOT NULL;

CREATE INDEX pi_commitment_idx ON document.purchase_invoice USING btree (tenant_id, commitment_id) WHERE commitment_id IS NOT NULL;

CREATE INDEX pi_due_date_idx ON document.purchase_invoice USING btree (tenant_id, company_code_id, due_date) WHERE status = ANY (ARRAY['approved'::text, 'posted'::text, 'partially_paid'::text]);

CREATE INDEX pi_fiscal_period_idx ON document.purchase_invoice USING btree (tenant_id, company_code_id, fiscal_year, period_number);

CREATE INDEX pi_match_status_idx ON document.purchase_invoice USING btree (tenant_id, match_status) WHERE match_status = ANY (ARRAY['unmatched'::text, 'partially_matched'::text, 'match_exception'::text]);

CREATE INDEX pi_pending_approval_idx ON document.purchase_invoice USING btree (tenant_id, company_code_id) WHERE status = 'pending_approval'::text;

CREATE INDEX pi_posting_date_idx ON document.purchase_invoice USING btree (tenant_id, company_code_id, posting_date DESC);

CREATE INDEX pi_supplier_idx ON document.purchase_invoice USING btree (tenant_id, supplier_id);

CREATE INDEX pi_supplier_invoice_dedup_idx ON document.purchase_invoice USING btree (tenant_id, supplier_id, supplier_invoice_number, supplier_invoice_date) WHERE supplier_id IS NOT NULL AND (status <> ALL (ARRAY['cancelled'::text, 'rejected'::text, 'proforma'::text]));

CREATE INDEX pi_supplier_status_idx ON document.purchase_invoice USING btree (tenant_id, company_code_id, supplier_id, status, posting_date DESC) WHERE is_active = true;

CREATE INDEX pi_workflow_idx ON document.purchase_invoice USING btree (workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE INDEX pil_asset_class_idx ON document.purchase_invoice_line USING btree (tenant_id, asset_class_id) WHERE asset_class_id IS NOT NULL;

CREATE INDEX pil_business_intent_idx ON document.purchase_invoice_line USING btree (tenant_id, business_intent_id) WHERE business_intent_id IS NOT NULL;

CREATE INDEX pil_commitment_line_idx ON document.purchase_invoice_line USING btree (tenant_id, commitment_line_id) WHERE commitment_line_id IS NOT NULL;

CREATE INDEX pil_commodity_category_idx ON document.purchase_invoice_line USING btree (tenant_id, commodity_category_id) WHERE commodity_category_id IS NOT NULL;

CREATE INDEX pil_invoice_idx ON document.purchase_invoice_line USING btree (tenant_id, purchase_invoice_id, line_no);

CREATE INDEX pil_match_exception_idx ON document.purchase_invoice_line USING btree (tenant_id, purchase_invoice_id) WHERE match_status = 'match_exception'::text;

CREATE INDEX pil_match_status_idx ON document.purchase_invoice_line USING btree (tenant_id, match_status) WHERE match_status <> 'fully_matched'::text;

CREATE INDEX pil_receipt_line_idx ON document.purchase_invoice_line USING btree (tenant_id, receipt_line_id) WHERE receipt_line_id IS NOT NULL;

CREATE INDEX pil_service_sheet_line_idx ON document.purchase_invoice_line USING btree (tenant_id, service_sheet_line_id) WHERE service_sheet_line_id IS NOT NULL;

CREATE INDEX pil_shipto_address_idx ON document.purchase_invoice_line USING btree (tenant_id, shipto_address_id) WHERE shipto_address_id IS NOT NULL;

CREATE INDEX pil_source_binding_gin ON document.purchase_invoice_line USING gin (source_binding) WHERE source_binding IS NOT NULL;

CREATE INDEX pil_to_jurisdiction_idx ON document.purchase_invoice_line USING btree (tenant_id, to_tax_jurisdiction_id) WHERE to_tax_jurisdiction_id IS NOT NULL;

CREATE INDEX poc_commitment_idx ON document.purchase_order_confirmation USING btree (tenant_id, commitment_id);

CREATE INDEX poc_supplier_pending_idx ON document.purchase_order_confirmation USING btree (tenant_id, supplier_id) WHERE status = ANY (ARRAY['received'::text, 'changes_proposed'::text]);

CREATE INDEX pr_active_idx ON document.purchase_requisition USING btree (tenant_id, company_code_id) WHERE is_active = true;

CREATE INDEX pr_requested_by_idx ON document.purchase_requisition USING btree (tenant_id, requested_by) WHERE status <> ALL (ARRAY['fully_converted'::text, 'closed'::text, 'cancelled'::text]);

CREATE INDEX pr_tenant_company_idx ON document.purchase_requisition USING btree (tenant_id, company_code_id, document_date DESC);

CREATE INDEX pr_tenant_status_idx ON document.purchase_requisition USING btree (tenant_id, status);

CREATE INDEX pr_workflow_idx ON document.purchase_requisition USING btree (workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE INDEX prl_item_idx ON document.purchase_requisition_line USING btree (tenant_id, item_id) WHERE item_id IS NOT NULL;

CREATE INDEX prl_requisition_idx ON document.purchase_requisition_line USING btree (tenant_id, purchase_requisition_id);

CREATE INDEX prl_status_open_idx ON document.purchase_requisition_line USING btree (tenant_id, purchase_requisition_id) WHERE status = 'open'::text;

CREATE INDEX rcp_commitment_idx ON document.receipt USING btree (tenant_id, commitment_id);

CREATE INDEX rcp_pending_approval_idx ON document.receipt USING btree (tenant_id, company_code_id) WHERE status = 'pending_approval'::text;

CREATE INDEX rcp_posting_date_idx ON document.receipt USING btree (tenant_id, company_code_id, posting_date DESC);

CREATE INDEX rcp_supplier_idx ON document.receipt USING btree (tenant_id, supplier_id);

CREATE INDEX rcp_workflow_idx ON document.receipt USING btree (workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE INDEX rcpl_asset_class_idx ON document.receipt_line USING btree (tenant_id, asset_class_id) WHERE asset_class_id IS NOT NULL;

CREATE INDEX rcpl_commitment_line_idx ON document.receipt_line USING btree (tenant_id, commitment_line_id);

CREATE INDEX rcpl_item_idx ON document.receipt_line USING btree (tenant_id, item_id);

CREATE INDEX rcpl_parent_idx ON document.receipt_line USING btree (tenant_id, receipt_id);

CREATE INDEX rcpl_warehouse_idx ON document.receipt_line USING btree (tenant_id, warehouse_id);

CREATE INDEX render_job_output_idx ON document.render_job USING btree (tenant_id, output_id);

CREATE INDEX render_job_pending_idx ON document.render_job USING btree (tenant_id, created_at) WHERE status = ANY (ARRAY['PENDING'::text, 'RETRYING'::text]);

CREATE INDEX render_output_entity_idx ON document.render_output USING btree (tenant_id, entity_name, entity_id);

CREATE UNIQUE INDEX render_output_inflight_uq ON document.render_output USING btree (tenant_id, template_version_id, entity_name, entity_id, operation, variant, locale) WHERE status = ANY (ARRAY['QUEUED'::text, 'RENDERING'::text]);

CREATE INDEX render_output_status_idx ON document.render_output USING btree (tenant_id, status) WHERE status <> ALL (ARRAY['ARCHIVED'::text, 'REVOKED'::text]);

CREATE INDEX sales_opportunity_oo_idx ON document.sales_opportunity USING btree (tenant_id, operating_organization_id, status);

CREATE INDEX sales_quotation_oo_idx ON document.sales_quotation USING btree (tenant_id, operating_organization_id, status);

CREATE INDEX sales_quotation_alloc_company_idx ON document.sales_quotation_allocation USING btree (tenant_id, company_code_id, status);

CREATE INDEX schl_open_by_date_idx ON document.schedule_line USING btree (tenant_id, scheduled_date) WHERE is_current_version = true AND (fulfillment_status = ANY (ARRAY['open'::text, 'partial'::text]));

CREATE INDEX schl_previous_version_idx ON document.schedule_line USING btree (tenant_id, previous_version_id) WHERE previous_version_id IS NOT NULL;

CREATE INDEX schl_source_current_idx ON document.schedule_line USING btree (tenant_id, source_doc_type, source_line_id) WHERE is_current_version = true AND terminal_status IS NULL;

CREATE INDEX schl_source_doc_idx ON document.schedule_line USING btree (tenant_id, source_doc_id);

CREATE INDEX seed_gift_company_status_idx ON document.seed_gift USING btree (tenant_id, company_code_id, status);

CREATE INDEX seed_gift_created_idx ON document.seed_gift USING btree (tenant_id, created_at DESC);

CREATE INDEX seed_gift_recipient_idx ON document.seed_gift USING btree (tenant_id, lower(recipient_email)) WHERE recipient_email IS NOT NULL;

CREATE INDEX seed_gift_source_ref_idx ON document.seed_gift USING btree (tenant_id, source_ref) WHERE source_ref IS NOT NULL;

CREATE INDEX ssh_commitment_idx ON document.service_sheet USING btree (tenant_id, commitment_id);

CREATE INDEX ssh_pending_acceptance_idx ON document.service_sheet USING btree (tenant_id) WHERE status = 'pending_acceptance'::text;

CREATE INDEX ssh_pending_approval_idx ON document.service_sheet USING btree (tenant_id) WHERE status = 'pending_approval'::text;

CREATE INDEX ssh_posting_date_idx ON document.service_sheet USING btree (tenant_id, company_code_id, posting_date DESC);

CREATE INDEX ssh_supplier_idx ON document.service_sheet USING btree (tenant_id, supplier_id);

CREATE INDEX sshl_commitment_line_idx ON document.service_sheet_line USING btree (tenant_id, commitment_line_id);

CREATE INDEX sshl_parent_idx ON document.service_sheet_line USING btree (tenant_id, service_sheet_id);

CREATE INDEX shift_assignment_employee_date_idx ON document.shift_assignment USING btree (tenant_id, employee_id, work_date DESC);

CREATE INDEX sourcing_event_tenant_oo_idx ON document.sourcing_event USING btree (tenant_id, operating_organization_id, status);

CREATE INDEX sourcing_event_award_alloc_company_idx ON document.sourcing_event_award_allocation USING btree (tenant_id, company_code_id, status);

CREATE INDEX sourcing_event_demand_company_idx ON document.sourcing_event_demand USING btree (tenant_id, demand_company_code_id, status);

CREATE INDEX sourcing_event_ic_alloc_beneficiary_idx ON document.sourcing_event_intercompany_allocation USING btree (tenant_id, beneficiary_company_code_id, status);

CREATE INDEX st_date_idx ON document.stocktake USING btree (tenant_id, company_code_id, stocktake_date DESC);

CREATE INDEX st_open_pidx ON document.stocktake USING btree (tenant_id, company_code_id, status) WHERE status = ANY (ARRAY['planned'::text, 'in_progress'::text]);

CREATE INDEX st_variance_je_idx ON document.stocktake USING btree (tenant_id, variance_je_id) WHERE variance_je_id IS NOT NULL;

CREATE INDEX st_warehouse_idx ON document.stocktake USING btree (tenant_id, warehouse_id);

CREATE INDEX stl_item_idx ON document.stocktake_line USING btree (tenant_id, item_id);

CREATE INDEX stl_stocktake_idx ON document.stocktake_line USING btree (tenant_id, stocktake_id);

CREATE INDEX stl_variance_pidx ON document.stocktake_line USING btree (tenant_id, stocktake_id) WHERE (counted_qty - system_qty) <> 0::numeric;

CREATE INDEX stl_warehouse_idx ON document.stocktake_line USING btree (tenant_id, warehouse_id);

CREATE INDEX srq_source_idx ON document.supplier_rebuild_orphan_quarantine USING btree (source_table, detected_at DESC);

CREATE INDEX time_punch_employee_time_idx ON document.time_punch USING btree (tenant_id, employee_id, punch_at DESC);

CREATE UNIQUE INDEX time_punch_employee_timestamp_uq ON document.time_punch USING btree (tenant_id, employee_id, punch_at) WHERE status = 'accepted'::text;

CREATE INDEX ix_upupr_active ON document.user_profile_update_request USING btree (tenant_id, requested_by) WHERE is_active = true;

CREATE INDEX ix_upupr_created ON document.user_profile_update_request USING btree (tenant_id, created_at DESC);

CREATE INDEX ix_upupr_created_by ON document.user_profile_update_request USING btree (tenant_id, created_by);

CREATE UNIQUE INDEX ix_upupr_one_active_per_principal ON document.user_profile_update_request USING btree (tenant_id, principal_id) WHERE is_active = true;

CREATE INDEX ix_upupr_principal ON document.user_profile_update_request USING btree (tenant_id, principal_id);

CREATE INDEX ix_upupr_requested_by ON document.user_profile_update_request USING btree (tenant_id, requested_by);

CREATE INDEX ix_upupr_scope ON document.user_profile_update_request USING gin (request_scope);

CREATE INDEX ix_upupr_tenant_status ON document.user_profile_update_request USING btree (tenant_id, status);

CREATE INDEX ix_upupr_workflow ON document.user_profile_update_request USING btree (workflow_request_id);

CREATE INDEX whtc_active_period_pidx ON document.wht_certificate USING btree (tenant_id, company_code_id, period_from, period_to) WHERE status <> 'voided'::text;

CREATE INDEX whtc_company_party_idx ON document.wht_certificate USING btree (tenant_id, company_code_id, counterparty_id);

CREATE INDEX wreq_entity_idx ON document.workflow_request USING btree (entity_type, entity_id, created_at DESC);

CREATE UNIQUE INDEX wreq_one_pending_per_entity_uix ON document.workflow_request USING btree (tenant_id, entity_type, entity_id) WHERE status = 'pending'::text;

CREATE INDEX wreq_requester_idx ON document.workflow_request USING btree (tenant_id, requested_by, created_at DESC);

CREATE INDEX wreq_tenant_pending_idx ON document.workflow_request USING btree (tenant_id, created_at DESC) WHERE status = 'pending'::text;

CREATE INDEX wstg_active_pidx ON document.workflow_stage USING btree (tenant_id, workflow_request_id) WHERE status = 'active'::text;

CREATE INDEX wstg_request_ordered_idx ON document.workflow_stage USING btree (tenant_id, workflow_request_id, stage_no);
