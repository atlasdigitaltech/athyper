-- ============================================================================
-- document/03_constraints.sql
-- Table constraints reconstructed from the live catalog.
-- Generated from the live Neon database document schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."asset_transaction"
  ADD CONSTRAINT "asset_txn_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."attendance_adjustment_request"
  ADD CONSTRAINT "attendance_adjustment_request_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."attendance_day"
  ADD CONSTRAINT "attendance_day_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."bank_recon_case_line"
  ADD CONSTRAINT "brcl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."bank_statement_line"
  ADD CONSTRAINT "bsl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "book_posting_derivation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."command_log"
  ADD CONSTRAINT "cmdl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."commitment_release_allocation"
  ADD CONSTRAINT "cra_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."compensation_assignment"
  ADD CONSTRAINT "compensation_assignment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."compensation_change"
  ADD CONSTRAINT "compensation_change_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."delivery_note"
  ADD CONSTRAINT "dn_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."depreciation_run"
  ADD CONSTRAINT "depreciation_run_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."depreciation_run_line"
  ADD CONSTRAINT "depreciation_run_line_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."depreciation_schedule"
  ADD CONSTRAINT "depreciation_schedule_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."doc_attachment"
  ADD CONSTRAINT "doc_attachment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."employee_tax_declaration"
  ADD CONSTRAINT "employee_tax_declaration_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."employee_tax_declaration_line"
  ADD CONSTRAINT "employee_tax_declaration_line_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."fx_revaluation_run"
  ADD CONSTRAINT "fxrr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."hr_case"
  ADD CONSTRAINT "hr_case_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."import_request"
  ADD CONSTRAINT "import_request_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."import_request_chunk"
  ADD CONSTRAINT "import_chunk_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."invoice_match_case"
  ADD CONSTRAINT "imc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."invoice_tax_snapshot"
  ADD CONSTRAINT "its_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "journal_entry_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "journal_line_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."journal_line_reference"
  ADD CONSTRAINT "journal_line_reference_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."leave_balance_entry"
  ADD CONSTRAINT "leave_balance_entry_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."match_exception"
  ADD CONSTRAINT "me_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."obligation_horizon"
  ADD CONSTRAINT "oh_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."offboarding_case"
  ADD CONSTRAINT "offboarding_case_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."onboarding_case"
  ADD CONSTRAINT "onboarding_case_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."operating_organization_resource_company"
  ADD CONSTRAINT "oor_company_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."payment_remittance_output"
  ADD CONSTRAINT "pro_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."payroll_period"
  ADD CONSTRAINT "payroll_period_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."payroll_run"
  ADD CONSTRAINT "payroll_run_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."payroll_run_employee"
  ADD CONSTRAINT "payroll_run_employee_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."people_request"
  ADD CONSTRAINT "people_request_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."policy_acknowledgment"
  ADD CONSTRAINT "policy_acknowledgment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."purchase_order_confirmation"
  ADD CONSTRAINT "poc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."render_job"
  ADD CONSTRAINT "render_job_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."render_output"
  ADD CONSTRAINT "render_output_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sales_opportunity_company"
  ADD CONSTRAINT "sales_opportunity_company_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sales_order"
  ADD CONSTRAINT "sales_order_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sales_order_intercompany_fulfillment"
  ADD CONSTRAINT "sales_order_ic_fulfillment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sales_quotation_allocation"
  ADD CONSTRAINT "sales_quotation_allocation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sales_quotation_company"
  ADD CONSTRAINT "sales_quotation_company_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."shift_assignment"
  ADD CONSTRAINT "shift_assignment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sourcing_event_award"
  ADD CONSTRAINT "sourcing_event_award_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sourcing_event_award_allocation"
  ADD CONSTRAINT "sourcing_event_award_alloc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sourcing_event_company"
  ADD CONSTRAINT "sourcing_event_company_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sourcing_event_demand"
  ADD CONSTRAINT "sourcing_event_demand_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."stocktake"
  ADD CONSTRAINT "st_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."stocktake_line"
  ADD CONSTRAINT "stl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."supplier_rebuild_orphan_quarantine"
  ADD CONSTRAINT "srq_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."time_punch"
  ADD CONSTRAINT "time_punch_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."wht_certificate"
  ADD CONSTRAINT "whtc_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_line_dist_uq" UNIQUE (source_doc_type, source_doc_id, source_line_id, distribution_no);

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."asset_transaction"
  ADD CONSTRAINT "asset_txn_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."attendance_adjustment_request"
  ADD CONSTRAINT "attendance_adjustment_request_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."attendance_adjustment_request"
  ADD CONSTRAINT "attendance_adjustment_request_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."attendance_day"
  ADD CONSTRAINT "attendance_day_employee_date_uq" UNIQUE (tenant_id, employee_id, attendance_date);

ALTER TABLE ONLY "document"."attendance_day"
  ADD CONSTRAINT "attendance_day_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_case_number_uq" UNIQUE (tenant_id, bank_account_id, case_number);

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."bank_recon_case_line"
  ADD CONSTRAINT "brcl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."bank_statement_line"
  ADD CONSTRAINT "bsl_stmt_line_uq" UNIQUE (tenant_id, bank_statement_id, line_no);

ALTER TABLE ONLY "document"."bank_statement_line"
  ADD CONSTRAINT "bsl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "book_posting_derivation_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_idempotency_uq" UNIQUE (tenant_id, idempotency_key);

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_source_rule_version_uq" UNIQUE (tenant_id, source_journal_id, posting_rule_id, posting_rule_version);

ALTER TABLE ONLY "document"."command_log"
  ADD CONSTRAINT "cmdl_dedup_uq" UNIQUE (tenant_id, operation, idempotency_key);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_tenant_code_uq" UNIQUE (tenant_id, company_code_id, code);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_line_no_uq" UNIQUE (commitment_id, line_no);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."commitment_release_allocation"
  ADD CONSTRAINT "cra_release_line_uq" UNIQUE (release_commitment_id, release_line_id);

ALTER TABLE ONLY "document"."commitment_release_allocation"
  ADD CONSTRAINT "cra_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."compensation_assignment"
  ADD CONSTRAINT "compensation_assignment_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."compensation_assignment"
  ADD CONSTRAINT "compensation_assignment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."compensation_change"
  ADD CONSTRAINT "compensation_change_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."compensation_change"
  ADD CONSTRAINT "compensation_change_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."delivery_note"
  ADD CONSTRAINT "dn_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."delivery_note"
  ADD CONSTRAINT "dn_tenant_number_uq" UNIQUE (tenant_id, company_code_id, delivery_note_number);

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_line_uq" UNIQUE (delivery_note_id, line_no);

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."depreciation_run"
  ADD CONSTRAINT "depreciation_run_period_book_uq" UNIQUE (tenant_id, company_code_id, book_type, fiscal_year, period_number, is_reversal);

ALTER TABLE ONLY "document"."depreciation_run"
  ADD CONSTRAINT "depreciation_run_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."depreciation_run_line"
  ADD CONSTRAINT "depreciation_run_line_run_asset_uq" UNIQUE (run_id, asset_book_id);

ALTER TABLE ONLY "document"."depreciation_run_line"
  ADD CONSTRAINT "depreciation_run_line_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."depreciation_schedule"
  ADD CONSTRAINT "depreciation_schedule_book_ver_period_uq" UNIQUE (asset_book_id, schedule_version, fiscal_year, period_number);

ALTER TABLE ONLY "document"."depreciation_schedule"
  ADD CONSTRAINT "depreciation_schedule_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."doc_attachment"
  ADD CONSTRAINT "doc_attachment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."employee_tax_declaration"
  ADD CONSTRAINT "employee_tax_declaration_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."employee_tax_declaration"
  ADD CONSTRAINT "employee_tax_declaration_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."employee_tax_declaration_line"
  ADD CONSTRAINT "employee_tax_declaration_line_no_uq" UNIQUE (tenant_id, employee_tax_declaration_id, line_no);

ALTER TABLE ONLY "document"."employee_tax_declaration_line"
  ADD CONSTRAINT "employee_tax_declaration_line_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_tenant_code_ver_uq" UNIQUE (tenant_id, company_code_id, code, version);

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."fx_revaluation_run"
  ADD CONSTRAINT "fxrr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."hr_case"
  ADD CONSTRAINT "hr_case_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."hr_case"
  ADD CONSTRAINT "hr_case_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_tenant_code_uq" UNIQUE (tenant_id, company_code_id, elimination_code);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."import_request"
  ADD CONSTRAINT "import_request_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_tenant_number_uq" UNIQUE (tenant_id, company_code_id, agreement_number);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_tenant_number_uq" UNIQUE (tenant_id, company_code_id, ic_txn_number);

ALTER TABLE ONLY "document"."invoice_match_case"
  ADD CONSTRAINT "imc_invoice_uq" UNIQUE (tenant_id, purchase_invoice_id);

ALTER TABLE ONLY "document"."invoice_match_case"
  ADD CONSTRAINT "imc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."invoice_tax_snapshot"
  ADD CONSTRAINT "its_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "journal_entry_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "journal_entry_tenant_number_uq" UNIQUE (tenant_id, company_code_id, je_number);

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "journal_line_je_line_uq" UNIQUE (tenant_id, journal_entry_id, line_no);

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "journal_line_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."leave_balance_entry"
  ADD CONSTRAINT "leave_balance_entry_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."match_exception"
  ADD CONSTRAINT "me_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_tenant_number_uq" UNIQUE (tenant_id, company_code_id, batch_number);

ALTER TABLE ONLY "document"."offboarding_case"
  ADD CONSTRAINT "offboarding_case_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."offboarding_case"
  ADD CONSTRAINT "offboarding_case_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."onboarding_case"
  ADD CONSTRAINT "onboarding_case_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."onboarding_case"
  ADD CONSTRAINT "onboarding_case_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."operating_organization_resource_company"
  ADD CONSTRAINT "oor_company_resource_uq" UNIQUE (tenant_id, resource_owner_id, company_code_id);

ALTER TABLE ONLY "document"."operating_organization_resource_company"
  ADD CONSTRAINT "oor_company_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_resource_uq" UNIQUE (tenant_id, resource_type, resource_id);

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_scope_uq" UNIQUE (tenant_id, company_code_id, supplier_id, currency_code);

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_tenant_number_uq" UNIQUE (tenant_id, company_code_id, payment_number);

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_line_uq" UNIQUE (payment_entry_id, line_no);

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."payment_remittance_output"
  ADD CONSTRAINT "pro_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."payment_remittance_output"
  ADD CONSTRAINT "pro_tenant_number_uq" UNIQUE (tenant_id, company_code_id, remittance_number);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."payroll_period"
  ADD CONSTRAINT "payroll_period_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."payroll_period"
  ADD CONSTRAINT "payroll_period_group_period_uq" UNIQUE (tenant_id, pay_group_id, period_year, period_number);

ALTER TABLE ONLY "document"."payroll_period"
  ADD CONSTRAINT "payroll_period_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_employee_uq" UNIQUE (tenant_id, payroll_run_id, employee_id);

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_no_uq" UNIQUE (tenant_id, payroll_result_id, line_no);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."payroll_run"
  ADD CONSTRAINT "payroll_run_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."payroll_run"
  ADD CONSTRAINT "payroll_run_journal_uq" UNIQUE (tenant_id, posted_journal_entry_id);

ALTER TABLE ONLY "document"."payroll_run"
  ADD CONSTRAINT "payroll_run_period_no_uq" UNIQUE (tenant_id, payroll_period_id, run_no);

ALTER TABLE ONLY "document"."payroll_run"
  ADD CONSTRAINT "payroll_run_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."payroll_run_employee"
  ADD CONSTRAINT "payroll_run_employee_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."payroll_run_employee"
  ADD CONSTRAINT "payroll_run_employee_uq" UNIQUE (tenant_id, payroll_run_id, employee_id);

ALTER TABLE ONLY "document"."people_request"
  ADD CONSTRAINT "people_request_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."people_request"
  ADD CONSTRAINT "people_request_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."policy_acknowledgment"
  ADD CONSTRAINT "policy_acknowledgment_policy_uq" UNIQUE (tenant_id, employee_id, policy_code, policy_version);

ALTER TABLE ONLY "document"."policy_acknowledgment"
  ADD CONSTRAINT "policy_acknowledgment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_tenant_code_uq" UNIQUE (tenant_id, company_code_id, code);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_line_uq" UNIQUE (purchase_invoice_id, line_no);

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."purchase_order_confirmation"
  ADD CONSTRAINT "poc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."purchase_order_confirmation"
  ADD CONSTRAINT "poc_tenant_number_uq" UNIQUE (tenant_id, company_code_id, confirmation_number);

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_line_uq" UNIQUE (confirmation_id, line_no);

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_tenant_number_uq" UNIQUE (tenant_id, company_code_id, requisition_number);

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_line_no_uq" UNIQUE (purchase_requisition_id, line_no);

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_tenant_code_uq" UNIQUE (tenant_id, company_code_id, code);

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_line_uq" UNIQUE (receipt_id, line_no);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."render_output"
  ADD CONSTRAINT "render_output_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sales_opportunity_company"
  ADD CONSTRAINT "sales_opportunity_company_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sales_opportunity_company"
  ADD CONSTRAINT "sales_opportunity_company_uq" UNIQUE (tenant_id, opportunity_id, company_code_id);

ALTER TABLE ONLY "document"."sales_order"
  ADD CONSTRAINT "sales_order_code_uq" UNIQUE (tenant_id, company_code_id, code);

ALTER TABLE ONLY "document"."sales_order"
  ADD CONSTRAINT "sales_order_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sales_order_intercompany_fulfillment"
  ADD CONSTRAINT "sales_order_ic_fulfillment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sales_order_intercompany_fulfillment"
  ADD CONSTRAINT "sales_order_ic_fulfillment_uq" UNIQUE (tenant_id, sales_order_id, fulfillment_company_code_id);

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sales_quotation_allocation"
  ADD CONSTRAINT "sales_quotation_allocation_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sales_quotation_allocation"
  ADD CONSTRAINT "sales_quotation_allocation_uq" UNIQUE (tenant_id, quotation_id, company_code_id);

ALTER TABLE ONLY "document"."sales_quotation_company"
  ADD CONSTRAINT "sales_quotation_company_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sales_quotation_company"
  ADD CONSTRAINT "sales_quotation_company_uq" UNIQUE (tenant_id, quotation_id, company_code_id);

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_source_no_uq" UNIQUE (tenant_id, source_line_id, schedule_no, version_number);

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_code_uq" UNIQUE (tenant_id, company_code_id, gift_code);

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_tenant_number_uq" UNIQUE (tenant_id, company_code_id, service_sheet_number);

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_line_uq" UNIQUE (service_sheet_id, line_no);

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."shift_assignment"
  ADD CONSTRAINT "shift_assignment_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."shift_assignment"
  ADD CONSTRAINT "shift_assignment_employee_date_uq" UNIQUE (tenant_id, employee_id, work_date);

ALTER TABLE ONLY "document"."shift_assignment"
  ADD CONSTRAINT "shift_assignment_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sourcing_event_award"
  ADD CONSTRAINT "sourcing_event_award_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sourcing_event_award"
  ADD CONSTRAINT "sourcing_event_award_uq" UNIQUE (tenant_id, sourcing_event_id, supplier_id);

ALTER TABLE ONLY "document"."sourcing_event_award_allocation"
  ADD CONSTRAINT "sourcing_event_award_alloc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sourcing_event_award_allocation"
  ADD CONSTRAINT "sourcing_event_award_alloc_uq" UNIQUE (tenant_id, award_id, company_code_id);

ALTER TABLE ONLY "document"."sourcing_event_company"
  ADD CONSTRAINT "sourcing_event_company_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sourcing_event_company"
  ADD CONSTRAINT "sourcing_event_company_uq" UNIQUE (tenant_id, sourcing_event_id, company_code_id);

ALTER TABLE ONLY "document"."sourcing_event_demand"
  ADD CONSTRAINT "sourcing_event_demand_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sourcing_event_demand"
  ADD CONSTRAINT "sourcing_event_demand_uq" UNIQUE (tenant_id, sourcing_event_id, purchase_requisition_line_id);

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_uq" UNIQUE (tenant_id, award_allocation_id, beneficiary_company_code_id);

ALTER TABLE ONLY "document"."stocktake"
  ADD CONSTRAINT "st_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."stocktake_line"
  ADD CONSTRAINT "stl_line_uq" UNIQUE (stocktake_id, line_no);

ALTER TABLE ONLY "document"."stocktake_line"
  ADD CONSTRAINT "stl_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."time_punch"
  ADD CONSTRAINT "time_punch_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_tenant_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."wht_certificate"
  ADD CONSTRAINT "whtc_tenant_cert_uq" UNIQUE (tenant_id, company_code_id, certificate_no);

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_stage_no_uq" UNIQUE (workflow_request_id, stage_no);

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_amount_chk" CHECK (distribution_basis <> 'AMOUNT'::text OR split_amount IS NOT NULL);

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_amount_status_chk" CHECK (amount_status = ANY (ARRAY['PROVISIONAL'::text, 'FINAL'::text, 'POSTED'::text]));

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_basis_chk" CHECK (distribution_basis = ANY (ARRAY['PERCENT'::text, 'AMOUNT'::text, 'QUANTITY'::text]));

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_budget_chk" CHECK (budget_check_result IS NULL OR (budget_check_result = ANY (ARRAY['passed'::text, 'warned'::text, 'override'::text, 'blocked'::text, 'exempt'::text])));

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_dist_no_chk" CHECK (distribution_no > 0);

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_distributed_nonneg" CHECK (distributed_amount >= 0::numeric);

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_pct_chk" CHECK (distribution_basis <> 'PERCENT'::text OR split_pct IS NOT NULL AND split_pct > 0::numeric);

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_qty_chk" CHECK (distribution_basis <> 'QUANTITY'::text OR split_quantity IS NOT NULL);

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_source_chk" CHECK (account_source = ANY (ARRAY['PENDING'::text, 'OVERRIDE'::text, 'PROFILE'::text, 'FALLBACK'::text]));

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_source_type_chk" CHECK (source_doc_type = ANY (ARRAY['purchase_requisition_line'::text, 'commitment_line'::text, 'purchase_invoice_line'::text, 'receipt_line'::text, 'service_sheet_line'::text]));

ALTER TABLE ONLY "document"."asset_transaction"
  ADD CONSTRAINT "asset_txn_reversal_chk" CHECK (is_reversal = false AND reversal_of_id IS NULL OR is_reversal = true AND reversal_of_id IS NOT NULL);

ALTER TABLE ONLY "document"."attendance_adjustment_request"
  ADD CONSTRAINT "attendance_adjustment_request_json_chk" CHECK (jsonb_typeof(requested_values) = 'object'::text AND jsonb_typeof(approved_values) = 'object'::text);

ALTER TABLE ONLY "document"."attendance_adjustment_request"
  ADD CONSTRAINT "attendance_adjustment_request_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."attendance_day"
  ADD CONSTRAINT "attendance_day_minutes_chk" CHECK (scheduled_minutes >= 0 AND worked_minutes >= 0 AND paid_minutes >= 0 AND overtime_minutes >= 0 AND late_minutes >= 0 AND early_leave_minutes >= 0 AND absence_minutes >= 0);

ALTER TABLE ONLY "document"."attendance_day"
  ADD CONSTRAINT "attendance_day_overtime_consistency_chk" CHECK (worked_minutes <= (scheduled_minutes + overtime_minutes));

ALTER TABLE ONLY "document"."attendance_day"
  ADD CONSTRAINT "attendance_day_status_chk" CHECK (status = ANY (ARRAY['open'::text, 'approved'::text, 'locked'::text, 'voided'::text]));

ALTER TABLE ONLY "document"."attendance_day"
  ADD CONSTRAINT "attendance_day_trace_chk" CHECK (jsonb_typeof(calculation_trace) = 'object'::text);

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_case_type_chk" CHECK (case_type = ANY (ARRAY['exact_match'::text, 'amount_match'::text, 'near_match'::text, 'manual'::text, 'exception'::text, 'bank_charge'::text, 'fx_difference'::text]));

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_confidence_rng_chk" CHECK (confidence_score >= 0::numeric AND confidence_score <= 1::numeric);

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_signoff_pair_chk" CHECK ((signed_off_at IS NULL) = (signed_off_by IS NULL));

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_status_chk" CHECK (status = ANY (ARRAY['open'::text, 'matched'::text, 'signed_off'::text, 'voided'::text]));

ALTER TABLE ONLY "document"."bank_recon_case_line"
  ADD CONSTRAINT "brcl_side_chk" CHECK (side = ANY (ARRAY['payment'::text, 'statement'::text]));

ALTER TABLE ONLY "document"."bank_recon_case_line"
  ADD CONSTRAINT "brcl_side_xor_chk" CHECK (side = 'payment'::text AND payment_entry_id IS NOT NULL AND bank_statement_line_id IS NULL OR side = 'statement'::text AND bank_statement_line_id IS NOT NULL AND payment_entry_id IS NULL);

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_format_chk" CHECK (source_format = ANY (ARRAY['csv'::text, 'ofx'::text, 'mt940'::text, 'bai2'::text, 'manual'::text]));

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_period_chk" CHECK (period_end_date >= period_start_date);

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_signoff_pair_chk" CHECK ((signed_off_at IS NULL) = (signed_off_by IS NULL));

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_status_chk" CHECK (status = ANY (ARRAY['imported'::text, 'matching'::text, 'signed_off'::text, 'archived'::text]));

ALTER TABLE ONLY "document"."bank_statement_line"
  ADD CONSTRAINT "bsl_recon_status_chk" CHECK (recon_status = ANY (ARRAY['unmatched'::text, 'matched'::text, 'split'::text, 'exception'::text, 'excluded'::text]));

ALTER TABLE ONLY "document"."bank_statement_line"
  ADD CONSTRAINT "bsl_tx_type_chk" CHECK (transaction_type = ANY (ARRAY['payment'::text, 'receipt'::text, 'fee'::text, 'interest'::text, 'fx'::text, 'transfer'::text, 'reversal'::text, 'other'::text]));

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_attempt_count_chk" CHECK (attempt_count >= 0);

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_failure_chk" CHECK (status = 'failed'::text AND error_message IS NOT NULL OR status <> 'failed'::text);

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_key_nonempty_chk" CHECK (btrim(idempotency_key) <> ''::text);

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_rule_version_chk" CHECK (posting_rule_version > 0);

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'suppressed'::text, 'failed'::text]));

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_target_status_chk" CHECK (status = 'completed'::text AND target_journal_id IS NOT NULL OR status <> 'completed'::text);

ALTER TABLE ONLY "document"."command_log"
  ADD CONSTRAINT "cmdl_status_chk" CHECK (status = ANY (ARRAY['processing'::text, 'done'::text, 'error'::text]));

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_amount_nonneg" CHECK (total_amount >= 0::numeric);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_check_chk" CHECK (budget_check_result IS NULL OR (budget_check_result = ANY (ARRAY['passed'::text, 'warned'::text, 'override'::text, 'blocked'::text, 'exempt'::text])));

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_code_nonempty" CHECK (is_provisional OR btrim(code) <> ''::text);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_currency_triad_chk" CHECK (status = 'draft'::text OR currency_code = base_currency_code AND exchange_rate = 1.0 OR currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0::numeric);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_date_chk" CHECK (expiry_date IS NULL OR expiry_date > effective_date);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_fulfilled_lte_total" CHECK (fulfilled_amount <= total_amount);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_fulfilled_nonneg" CHECK (fulfilled_amount >= 0::numeric);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_fx_policy_chk" CHECK (fx_policy = ANY (ARRAY['spot_on_event'::text, 'fixed_at_commitment'::text, 'manual_contract_rate'::text]));

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_invoiced_lte_total" CHECK (invoiced_amount <= total_amount);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_invoiced_nonneg" CHECK (invoiced_amount >= 0::numeric);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_no_self_parent" CHECK (parent_commitment_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_no_self_renew" CHECK (renewed_from_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_order_type_domain_chk" CHECK (order_type IS NULL OR (order_type = ANY (ARRAY['standard'::text, 'blanket'::text, 'service'::text, 'emergency'::text])));

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_order_type_scope_chk" CHECK (order_type IS NULL OR commitment_type = 'purchase_order'::text);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_paid_lte_invoiced" CHECK (paid_amount <= invoiced_amount);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_paid_nonneg" CHECK (paid_amount >= 0::numeric);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_party_chk" CHECK (party_type IS NULL AND party_id IS NULL OR party_type IS NOT NULL AND party_id IS NOT NULL);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_period_chk" CHECK (period_number IS NULL OR period_number >= 1 AND period_number <= 16);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_provisional_code_chk" CHECK (is_provisional = false OR code = ''::text);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_provisional_status_chk" CHECK (is_provisional = false OR status = 'draft'::text);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_release_pair_chk" CHECK (parent_commitment_id IS NULL AND release_sequence_no IS NULL OR parent_commitment_id IS NOT NULL AND release_sequence_no IS NOT NULL);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_released_nonneg" CHECK (released_amount >= 0::numeric);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_renewal_chk" CHECK (renewal_count >= 0);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_scheduled_nonneg" CHECK (scheduled_amount >= 0::numeric);

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'active'::text, 'partially_fulfilled'::text, 'fully_fulfilled'::text, 'closed'::text, 'cancelled'::text, 'expired'::text, 'suspended'::text, 'rejected'::text]));

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_status_source_chk" CHECK (status_source = ANY (ARRAY['manual'::text, 'derived'::text, 'system'::text, 'terminal'::text]));

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_terminal_status_chk" CHECK (terminal_status IS NULL OR (terminal_status = ANY (ARRAY['CANCELED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_type_chk" CHECK (commitment_type = ANY (ARRAY['purchase_order'::text, 'contract'::text, 'lease'::text, 'subscription'::text, 'standing_order'::text, 'framework_agreement'::text, 'grant_award'::text, 'internal_order'::text]));

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_version_self_chk" CHECK (previous_version_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_invoiced_nonneg" CHECK (invoiced_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_line_type_chk" CHECK (line_type = ANY (ARRAY['contract'::text, 'catalog'::text, 'marketplace'::text, 'noncatalog'::text]));

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_no_self_parent" CHECK (parent_contract_line_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_price_nonneg" CHECK (unit_price >= 0::numeric);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_price_unit_pos" CHECK (price_unit > 0::numeric);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_proc_type_chk" CHECK (procurement_type = ANY (ARRAY['goods'::text, 'services'::text]));

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_qty_pos" CHECK (quantity > 0::numeric);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_received_nonneg" CHECK (received_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_released_amt_nonneg" CHECK (released_amount >= 0::numeric);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_released_nonneg" CHECK (released_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_status_chk" CHECK (status = ANY (ARRAY['open'::text, 'partially_received'::text, 'fully_received'::text, 'partially_invoiced'::text, 'fully_invoiced'::text, 'closed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_tax_nonneg" CHECK (tax_amount >= 0::numeric);

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_tolerance_chk" CHECK ((over_delivery_tolerance IS NULL OR over_delivery_tolerance >= 0::numeric) AND (under_delivery_tolerance IS NULL OR under_delivery_tolerance >= 0::numeric));

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_wht_nonneg" CHECK (withholding_tax_amount >= 0::numeric);

ALTER TABLE ONLY "document"."commitment_release_allocation"
  ADD CONSTRAINT "cra_amt_nonneg" CHECK (released_amount >= 0::numeric);

ALTER TABLE ONLY "document"."commitment_release_allocation"
  ADD CONSTRAINT "cra_no_self_release" CHECK (parent_commitment_id <> release_commitment_id);

ALTER TABLE ONLY "document"."commitment_release_allocation"
  ADD CONSTRAINT "cra_qty_nonneg" CHECK (released_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."commitment_release_allocation"
  ADD CONSTRAINT "cra_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'cancelled'::text, 'superseded'::text]));

ALTER TABLE ONLY "document"."compensation_assignment"
  ADD CONSTRAINT "compensation_assignment_amount_chk" CHECK (base_amount >= 0::numeric AND (annualized_amount IS NULL OR annualized_amount >= 0::numeric));

ALTER TABLE ONLY "document"."compensation_assignment"
  ADD CONSTRAINT "compensation_assignment_currency_chk" CHECK (currency_code ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "document"."compensation_assignment"
  ADD CONSTRAINT "compensation_assignment_dates_chk" CHECK (effective_until IS NULL OR effective_until >= effective_from);

ALTER TABLE ONLY "document"."compensation_change"
  ADD CONSTRAINT "compensation_change_json_chk" CHECK (jsonb_typeof(old_values) = 'object'::text AND jsonb_typeof(new_values) = 'object'::text);

ALTER TABLE ONLY "document"."compensation_change"
  ADD CONSTRAINT "compensation_change_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."delivery_note"
  ADD CONSTRAINT "dn_amount_nonneg" CHECK (total_amount >= 0::numeric);

ALTER TABLE ONLY "document"."delivery_note"
  ADD CONSTRAINT "dn_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'in_transit'::text, 'arrived'::text, 'partially_receipted'::text, 'fully_receipted'::text, 'returned'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."delivery_note"
  ADD CONSTRAINT "dn_status_source_chk" CHECK (status_source = ANY (ARRAY['manual'::text, 'derived'::text, 'system'::text, 'terminal'::text]));

ALTER TABLE ONLY "document"."delivery_note"
  ADD CONSTRAINT "dn_terminal_status_chk" CHECK (terminal_status IS NULL OR (terminal_status = ANY (ARRAY['CANCELED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY "document"."delivery_note"
  ADD CONSTRAINT "dn_version_self_chk" CHECK (previous_version_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_damaged_nonneg" CHECK (damaged_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_line_type_chk" CHECK (line_type = ANY (ARRAY['contract'::text, 'catalog'::text, 'marketplace'::text, 'noncatalog'::text]));

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_proc_type_chk" CHECK (procurement_type = ANY (ARRAY['goods'::text, 'services'::text]));

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_qty_chk" CHECK ((damaged_quantity + rejected_quantity) <= received_quantity);

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_received_nonneg" CHECK (received_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_rejected_nonneg" CHECK (rejected_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_shipped_pos" CHECK (shipped_quantity > 0::numeric);

ALTER TABLE ONLY "document"."depreciation_run"
  ADD CONSTRAINT "depreciation_run_error_count_pos" CHECK (error_count >= 0);

ALTER TABLE ONLY "document"."depreciation_run"
  ADD CONSTRAINT "depreciation_run_reversal_chk" CHECK (is_reversal = false AND reversal_of_id IS NULL OR is_reversal = true AND reversal_of_id IS NOT NULL);

ALTER TABLE ONLY "document"."depreciation_run_line"
  ADD CONSTRAINT "depreciation_run_line_amount_pos" CHECK (depreciation_amount >= 0::numeric);

ALTER TABLE ONLY "document"."depreciation_schedule"
  ADD CONSTRAINT "depreciation_schedule_amount_pos" CHECK (schedule_amount >= 0::numeric);

ALTER TABLE ONLY "document"."depreciation_schedule"
  ADD CONSTRAINT "depreciation_schedule_cum_pos" CHECK (cumulative_amount >= 0::numeric);

ALTER TABLE ONLY "document"."doc_attachment"
  ADD CONSTRAINT "doc_attachment_filename_chk" CHECK (btrim(filename) <> ''::text);

ALTER TABLE ONLY "document"."doc_attachment"
  ADD CONSTRAINT "doc_attachment_size_chk" CHECK (size_bytes >= 0);

ALTER TABLE ONLY "document"."employee_tax_declaration"
  ADD CONSTRAINT "employee_tax_declaration_country_chk" CHECK (country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE ONLY "document"."employee_tax_declaration"
  ADD CONSTRAINT "employee_tax_declaration_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'superseded'::text]));

ALTER TABLE ONLY "document"."employee_tax_declaration_line"
  ADD CONSTRAINT "employee_tax_declaration_line_payload_chk" CHECK (jsonb_typeof(payload) = 'object'::text);

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_confidence_chk" CHECK (confidence_level IS NULL OR confidence_level >= 0::numeric AND confidence_level <= 1::numeric);

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_no_self_base" CHECK (based_on_scenario_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_period_range_chk" CHECK (period_from >= 1 AND period_from <= 16 AND period_to >= 1 AND period_to <= 16 AND period_from <= period_to);

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_purpose_chk" CHECK (scenario_purpose = ANY (ARRAY['BUDGET'::text, 'FORECAST'::text, 'REFORECAST'::text, 'PROJECTION'::text, 'STRATEGIC'::text, 'SCENARIO_ANALYSIS'::text]));

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'in_review'::text, 'approved'::text, 'published'::text, 'superseded'::text, 'archived'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_type_chk" CHECK (scenario_type = ANY (ARRAY['EXPECTED'::text, 'BEST_CASE'::text, 'WORST_CASE'::text, 'STRETCH'::text, 'CONSERVATIVE'::text, 'BASELINE'::text, 'WHAT_IF'::text, 'SENSITIVITY'::text]));

ALTER TABLE ONLY "document"."forecast_scenario"
  ADD CONSTRAINT "fs_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "document"."fx_revaluation_run"
  ADD CONSTRAINT "fxrr_gain_nonneg" CHECK (total_unrealized_gain >= 0::numeric);

ALTER TABLE ONLY "document"."fx_revaluation_run"
  ADD CONSTRAINT "fxrr_loss_nonneg" CHECK (total_unrealized_loss >= 0::numeric);

ALTER TABLE ONLY "document"."fx_revaluation_run"
  ADD CONSTRAINT "fxrr_period_chk" CHECK (period_number >= 1 AND period_number <= 16);

ALTER TABLE ONLY "document"."fx_revaluation_run"
  ADD CONSTRAINT "fxrr_reverse_chk" CHECK (NOT is_auto_reversed OR auto_reverse_date IS NOT NULL);

ALTER TABLE ONLY "document"."fx_revaluation_run"
  ADD CONSTRAINT "fxrr_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'calculated'::text, 'posted'::text, 'reversed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."hr_case"
  ADD CONSTRAINT "hr_case_closed_chk" CHECK (closed_at IS NULL OR closed_at >= opened_at);

ALTER TABLE ONLY "document"."hr_case"
  ADD CONSTRAINT "hr_case_priority_chk" CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]));

ALTER TABLE ONLY "document"."hr_case"
  ADD CONSTRAINT "hr_case_status_chk" CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'pending'::text, 'resolved'::text, 'closed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."hr_case"
  ADD CONSTRAINT "hr_case_type_chk" CHECK (case_type = ANY (ARRAY['general'::text, 'grievance'::text, 'disciplinary'::text, 'health'::text, 'other'::text]));

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_amount_positive" CHECK (elimination_amount > 0::numeric);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_approval_chk" CHECK (approval_route = ANY (ARRAY['AUTO'::text, 'STANDARD'::text, 'ENHANCED'::text, 'MANUAL'::text]));

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_code_nonempty" CHECK (btrim(elimination_code) <> ''::text);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_date_chk" CHECK (elimination_date <= posting_date);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_entity_chk" CHECK (source_company_code_id IS DISTINCT FROM counterparty_company_code_id);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_fx_rate_chk" CHECK (currency_code = functional_currency_code OR exchange_rate IS NOT NULL);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_no_self_je" CHECK (je_id IS DISTINCT FROM reversal_je_id);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_period_chk" CHECK (period_number >= 1 AND period_number <= 16);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_score_chk" CHECK (decision_score IS NULL OR decision_score >= 0::numeric AND decision_score <= 1::numeric);

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_status_chk" CHECK (status = ANY (ARRAY['calculated'::text, 'approved'::text, 'posted'::text, 'reversed'::text, 'rejected'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."ic_elimination"
  ADD CONSTRAINT "ice_type_chk" CHECK (elimination_type = ANY (ARRAY['REVENUE_EXPENSE'::text, 'RECEIVABLE_PAYABLE'::text, 'INVENTORY_MARKUP'::text, 'IC_PROFIT'::text, 'MINORITY_INTEREST'::text, 'INVESTMENT'::text, 'DIVIDEND'::text, 'LOAN'::text, 'OTHER'::text]));

ALTER TABLE ONLY "document"."import_request"
  ADD CONSTRAINT "import_request_entity_fmt" CHECK (btrim(entity_name) <> ''::text);

ALTER TABLE ONLY "document"."import_request"
  ADD CONSTRAINT "import_request_file_fmt" CHECK (btrim(file_ref) <> ''::text);

ALTER TABLE ONLY "document"."import_request"
  ADD CONSTRAINT "import_request_format_chk" CHECK (file_format = ANY (ARRAY['csv'::text, 'xlsx'::text, 'tsv'::text]));

ALTER TABLE ONLY "document"."import_request"
  ADD CONSTRAINT "import_request_mapping_chk" CHECK (jsonb_typeof(mapping_config) = 'array'::text);

ALTER TABLE ONLY "document"."import_request"
  ADD CONSTRAINT "import_request_mode_chk" CHECK (import_mode = ANY (ARRAY['create'::text, 'update'::text, 'upsert'::text]));

ALTER TABLE ONLY "document"."import_request"
  ADD CONSTRAINT "import_request_options_chk" CHECK (jsonb_typeof(options) = 'object'::text);

ALTER TABLE ONLY "document"."import_request"
  ADD CONSTRAINT "import_request_rows_chk" CHECK (processed_rows >= 0 AND success_count >= 0 AND error_count >= 0);

ALTER TABLE ONLY "document"."import_request"
  ADD CONSTRAINT "import_request_status_chk" CHECK (status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."import_request_chunk"
  ADD CONSTRAINT "import_chunk_counts_chk" CHECK (success_count >= 0 AND error_count >= 0);

ALTER TABLE ONLY "document"."import_request_chunk"
  ADD CONSTRAINT "import_chunk_errors_chk" CHECK (jsonb_typeof(errors_json) = 'array'::text);

ALTER TABLE ONLY "document"."import_request_chunk"
  ADD CONSTRAINT "import_chunk_rows_chk" CHECK (row_start > 0 AND row_end >= row_start AND chunk_index >= 0);

ALTER TABLE ONLY "document"."import_request_chunk"
  ADD CONSTRAINT "import_chunk_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_agreement_type_chk" CHECK (agreement_type = ANY (ARRAY['GOODS'::text, 'SERVICES'::text, 'LOAN'::text, 'ROYALTY'::text, 'MANAGEMENT_FEE'::text, 'COST_SHARING'::text, 'OTHER'::text]));

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_conflict_chk" CHECK (conflict_strategy = ANY (ARRAY['HIGHEST_PRIORITY'::text, 'MOST_SPECIFIC'::text, 'ERROR_ON_CONFLICT'::text]));

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_effective_date_chk" CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_entity_chk" CHECK (source_company_code_id IS DISTINCT FROM dest_company_code_id);

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_markup_chk" CHECK (markup_pct IS NULL OR markup_pct >= '-100'::integer::numeric AND markup_pct <= 1000::numeric);

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_no_self_supersede" CHECK (supersedes_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_number_nonempty" CHECK (btrim(agreement_number) <> ''::text);

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_priority_chk" CHECK (priority >= 0);

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'superseded'::text, 'expired'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_tp_method_chk" CHECK (transfer_pricing_method = ANY (ARRAY['CUP'::text, 'COST_PLUS'::text, 'RESALE_MINUS'::text, 'TNMM'::text, 'PROFIT_SPLIT'::text, 'COMPARABLE_PROFIT'::text, 'OTHER'::text]));

ALTER TABLE ONLY "document"."intercompany_agreement"
  ADD CONSTRAINT "ica_version_chk" CHECK (version >= 1);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_amount_positive" CHECK (amount > 0::numeric);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_doc_date_chk" CHECK (document_date <= posting_date);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_entity_chk" CHECK (source_company_code_id IS DISTINCT FROM dest_company_code_id);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_fx_rate_chk" CHECK (currency_code = base_currency_code OR exchange_rate IS NOT NULL);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_match_status_chk" CHECK (match_status = ANY (ARRAY['UNMATCHED'::text, 'MATCHED'::text, 'DISPUTED'::text, 'PARTIALLY_MATCHED'::text]));

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_no_self_mirror" CHECK (mirror_txn_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_number_nonempty" CHECK (btrim(ic_txn_number) <> ''::text);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_period_chk" CHECK (period_number IS NULL OR period_number >= 1 AND period_number <= 16);

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'created'::text, 'posted'::text, 'netted'::text, 'settled'::text, 'disputed'::text, 'cancelled'::text, 'reversed'::text]));

ALTER TABLE ONLY "document"."intercompany_transaction"
  ADD CONSTRAINT "ict_type_chk" CHECK (txn_type = ANY (ARRAY['RECHARGE'::text, 'PURCHASE'::text, 'SALE'::text, 'LOAN_DRAWDOWN'::text, 'LOAN_REPAYMENT'::text, 'ROYALTY'::text, 'MANAGEMENT_FEE'::text, 'COST_ALLOCATION'::text, 'DIVIDEND'::text, 'OTHER'::text]));

ALTER TABLE ONLY "document"."invoice_match_case"
  ADD CONSTRAINT "imc_exception_nonneg" CHECK (exception_count >= 0);

ALTER TABLE ONLY "document"."invoice_match_case"
  ADD CONSTRAINT "imc_result_chk" CHECK (match_result = ANY (ARRAY['pending'::text, 'matched'::text, 'matched_with_tolerance'::text, 'exception'::text, 'force_matched'::text, 'rejected'::text]));

ALTER TABLE ONLY "document"."invoice_match_case"
  ADD CONSTRAINT "imc_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'exception'::text, 'resolved'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."invoice_match_case"
  ADD CONSTRAINT "imc_type_chk" CHECK (match_type = ANY (ARRAY['three_way'::text, 'two_way'::text, 'no_match'::text, 'evaluated_receipt'::text]));

ALTER TABLE ONLY "document"."invoice_tax_snapshot"
  ADD CONSTRAINT "its_base_nonneg" CHECK (tax_base_amount >= 0::numeric);

ALTER TABLE ONLY "document"."invoice_tax_snapshot"
  ADD CONSTRAINT "its_tax_rate_nonneg" CHECK (tax_rate >= 0::numeric);

ALTER TABLE ONLY "document"."invoice_tax_snapshot"
  ADD CONSTRAINT "its_wht_basis_chk" CHECK (wht_basis IS NULL OR is_withholding = true);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_amount_nonneg_chk" CHECK (total_debit >= 0::numeric AND total_credit >= 0::numeric);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_auto_reverse_chk" CHECK (NOT is_auto_reverse OR auto_reverse_date IS NOT NULL);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_balanced_chk" CHECK (total_debit = total_credit);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_doc_date_chk" CHECK (document_date <= posting_date);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_line_count_nonneg_chk" CHECK (line_count >= 0);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_no_self_ref" CHECK (reversal_of_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_number_nonempty" CHECK (btrim(je_number) <> ''::text);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_posted_audit_chk" CHECK (status <> 'posted'::text OR posted_at IS NOT NULL AND posted_by IS NOT NULL);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_prior_period_chk" CHECK (NOT prior_period_flag OR original_period_year IS NOT NULL AND original_period_number IS NOT NULL);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_reversal_link_chk" CHECK (NOT is_reversal OR reversal_of_id IS NOT NULL);

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'created'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'posted'::text, 'reversed'::text]));

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "jl_base_nonneg_chk" CHECK (base_debit >= 0::numeric AND base_credit >= 0::numeric);

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "jl_base_polarity_chk" CHECK (base_debit > 0::numeric AND base_credit = 0::numeric OR base_debit = 0::numeric AND base_credit > 0::numeric);

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "jl_fx_rate_chk" CHECK (transaction_currency = base_currency AND (exchange_rate IS NULL OR exchange_rate = 1.0) OR transaction_currency <> base_currency AND exchange_rate IS NOT NULL AND exchange_rate > 0::numeric);

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "jl_line_no_pos_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "jl_party_chk" CHECK (party_type IS NULL AND party_id IS NULL OR party_type IS NOT NULL AND party_id IS NOT NULL);

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "jl_side_match_chk" CHECK (transaction_debit > 0::numeric AND base_debit > 0::numeric OR transaction_credit > 0::numeric AND base_credit > 0::numeric);

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "jl_txn_nonneg_chk" CHECK (transaction_debit >= 0::numeric AND transaction_credit >= 0::numeric);

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "jl_txn_polarity_chk" CHECK (transaction_debit > 0::numeric AND transaction_credit = 0::numeric OR transaction_debit = 0::numeric AND transaction_credit > 0::numeric);

ALTER TABLE ONLY "document"."journal_line_reference"
  ADD CONSTRAINT "jlr_amount_pos_chk" CHECK (allocated_amount > 0::numeric);

ALTER TABLE ONLY "document"."journal_line_reference"
  ADD CONSTRAINT "jlr_component_bucket_chk" CHECK (component_bucket IS NULL OR (component_bucket = ANY (ARRAY['DISTRIBUTABLE_COST'::text, 'BASE_COST'::text, 'COST_REDUCTION'::text, 'COST_ADDITION'::text, 'SEPARATE_DEBIT'::text, 'SEPARATE_CREDIT'::text, 'RECOVERABLE_TAX'::text, 'NONRECOVERABLE_TAX'::text, 'WHT_LIABILITY'::text, 'RETENTION_LIABILITY'::text, 'SELF_ASSESSED_INPUT'::text, 'SELF_ASSESSED_OUTPUT'::text, 'SETTLEMENT_DISCOUNT'::text, 'MEMO'::text])));

ALTER TABLE ONLY "document"."leave_balance_entry"
  ADD CONSTRAINT "leave_balance_entry_period_chk" CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start);

ALTER TABLE ONLY "document"."leave_balance_entry"
  ADD CONSTRAINT "leave_balance_entry_source_chk" CHECK (btrim(source_doc_type) <> ''::text);

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_dates_chk" CHECK (end_date >= start_date);

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_half_chk" CHECK ((start_half IS NULL OR (start_half = ANY (ARRAY['first'::text, 'second'::text]))) AND (end_half IS NULL OR (end_half = ANY (ARRAY['first'::text, 'second'::text]))));

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_quantity_chk" CHECK (requested_quantity > 0::numeric AND (approved_quantity IS NULL OR approved_quantity >= 0::numeric));

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'withdrawn'::text]));

ALTER TABLE ONLY "document"."match_exception"
  ADD CONSTRAINT "me_resolution_chk" CHECK (resolution_type IS NULL OR (resolution_type = ANY (ARRAY['ACCEPTED'::text, 'FORCE_MATCHED'::text, 'CREDIT_NOTE_REQUESTED'::text, 'WRITTEN_OFF'::text, 'PRICE_ADJUSTMENT'::text, 'QUANTITY_ADJUSTMENT'::text, 'REJECTED'::text])));

ALTER TABLE ONLY "document"."match_exception"
  ADD CONSTRAINT "me_resolved_pair_chk" CHECK ((resolved_by IS NULL) = (resolved_at IS NULL));

ALTER TABLE ONLY "document"."match_exception"
  ADD CONSTRAINT "me_status_chk" CHECK (status = ANY (ARRAY['open'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'force_matched'::text, 'written_off'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."match_exception"
  ADD CONSTRAINT "me_type_chk" CHECK (exception_type = ANY (ARRAY['PRICE_VARIANCE'::text, 'QUANTITY_VARIANCE'::text, 'AMOUNT_VARIANCE'::text, 'MISSING_RECEIPT'::text, 'DUPLICATE_INVOICE'::text, 'TAX_VARIANCE'::text, 'FX_VARIANCE'::text, 'RETENTION_VARIANCE'::text, 'ADVANCE_RECOVERY_MISMATCH'::text]));

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_cutoff_chk" CHECK (cut_off_date <= batch_date);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_direction_chk" CHECK (net_direction = ANY (ARRAY['A_TO_B'::text, 'B_TO_A'::text, 'ZERO'::text]));

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_entity_chk" CHECK (company_code_a_id IS DISTINCT FROM company_code_b_id);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_gross_a_nonneg" CHECK (gross_amount_a_to_b >= 0::numeric);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_gross_b_nonneg" CHECK (gross_amount_b_to_a >= 0::numeric);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_net_nonneg" CHECK (net_amount >= 0::numeric);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_number_nonempty" CHECK (btrim(batch_number) <> ''::text);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_period_chk" CHECK (period_number IS NULL OR period_number >= 1 AND period_number <= 16);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_settlement_chk" CHECK (settlement_date IS NULL OR settlement_date >= batch_date);

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'calculated'::text, 'approved'::text, 'settled'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."netting_batch"
  ADD CONSTRAINT "nb_txn_count_nonneg" CHECK (txn_count >= 0);

ALTER TABLE ONLY "document"."obligation_horizon"
  ADD CONSTRAINT "oh_amendment_chk" CHECK (amendment_count >= 0);

ALTER TABLE ONLY "document"."obligation_horizon"
  ADD CONSTRAINT "oh_amount_chk" CHECK (amount >= 0::numeric);

ALTER TABLE ONLY "document"."obligation_horizon"
  ADD CONSTRAINT "oh_confidence_chk" CHECK (confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "document"."obligation_horizon"
  ADD CONSTRAINT "oh_period_range_chk" CHECK (period_from >= 1 AND period_from <= 12 AND period_to >= 1 AND period_to <= 12 AND period_from <= period_to);

ALTER TABLE ONLY "document"."obligation_horizon"
  ADD CONSTRAINT "oh_retention_chk" CHECK (retention_pct IS NULL OR retention_pct >= 0::numeric AND retention_pct <= 100::numeric);

ALTER TABLE ONLY "document"."obligation_horizon"
  ADD CONSTRAINT "oh_source_chk" CHECK (source_type = ANY (ARRAY['CONTRACT'::text, 'PO'::text, 'SUBSCRIPTION'::text, 'LEASE'::text, 'FORECAST_MODEL'::text, 'MANUAL'::text]));

ALTER TABLE ONLY "document"."obligation_horizon"
  ADD CONSTRAINT "oh_spread_chk" CHECK (spread_method = ANY (ARRAY['EVEN'::text, 'FRONT_LOADED'::text, 'BACK_LOADED'::text, 'MILESTONE'::text, 'CUSTOM'::text]));

ALTER TABLE ONLY "document"."obligation_horizon"
  ADD CONSTRAINT "oh_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'cancelled'::text, 'superseded'::text]));

ALTER TABLE ONLY "document"."obligation_horizon"
  ADD CONSTRAINT "oh_tier_chk" CHECK (obligation_tier = ANY (ARRAY['PLANNED'::text, 'FORECAST'::text, 'RESERVED'::text, 'COMMITTED'::text, 'CONSUMED'::text]));

ALTER TABLE ONLY "document"."offboarding_case"
  ADD CONSTRAINT "offboarding_case_json_chk" CHECK (jsonb_typeof(checklist) = 'array'::text);

ALTER TABLE ONLY "document"."offboarding_case"
  ADD CONSTRAINT "offboarding_case_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."onboarding_case"
  ADD CONSTRAINT "onboarding_case_json_chk" CHECK (jsonb_typeof(checklist) = 'array'::text);

ALTER TABLE ONLY "document"."onboarding_case"
  ADD CONSTRAINT "onboarding_case_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."operating_organization_resource_company"
  ADD CONSTRAINT "oor_company_amount_chk" CHECK (allocation_amount IS NULL OR allocation_amount >= 0::numeric);

ALTER TABLE ONLY "document"."operating_organization_resource_company"
  ADD CONSTRAINT "oor_company_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."operating_organization_resource_company"
  ADD CONSTRAINT "oor_company_percent_chk" CHECK (allocation_percent IS NULL OR allocation_percent >= 0::numeric AND allocation_percent <= 100::numeric);

ALTER TABLE ONLY "document"."operating_organization_resource_company"
  ADD CONSTRAINT "oor_company_role_chk" CHECK (participation_role = ANY (ARRAY['lead_buyer'::text, 'lead_seller'::text, 'participant'::text, 'beneficiary'::text]));

ALTER TABLE ONLY "document"."operating_organization_resource_company"
  ADD CONSTRAINT "oor_company_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text]));

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_domain_chk" CHECK (domain = ANY (ARRAY['procurement'::text, 'sales'::text]));

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_resource_chk" CHECK (domain = 'procurement'::text AND (resource_type = ANY (ARRAY['sourcing_project'::text, 'sourcing_event'::text, 'rfp'::text, 'rfq'::text, 'award_recommendation'::text])) OR domain = 'sales'::text AND (resource_type = ANY (ARRAY['lead'::text, 'campaign'::text, 'opportunity'::text, 'quotation'::text, 'tender_response'::text])));

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_role_chk" CHECK (ownership_role = 'owner'::text);

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text]));

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_adv_cnt_nneg" CHECK (advance_invoice_count >= 0);

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_advance_nneg" CHECK (advance_balance >= 0::numeric);

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_currency_len" CHECK (char_length(currency_code) = 3 OR currency_code = ''::text);

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_ret_cnt_nneg" CHECK (retention_invoice_count >= 0);

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_retention_nneg" CHECK (retention_balance >= 0::numeric);

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_amount_pos" CHECK (payment_amount > 0::numeric);

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_currency_triad_chk" CHECK (status = 'draft'::text OR currency_code = base_currency_code AND exchange_rate = 1.0 OR currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0::numeric);

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_direction_chk" CHECK (payment_direction = ANY (ARRAY['OUTBOUND'::text, 'INBOUND'::text]));

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_no_self_reversal" CHECK (reversal_of_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_number_nonempty" CHECK (btrim(payment_number) <> ''::text);

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_payment_currency_triad_chk" CHECK (payment_currency_code IS NULL OR status = 'draft'::text OR payment_currency_code = base_currency_code AND payment_exchange_rate = 1.0 OR payment_currency_code <> base_currency_code AND payment_exchange_rate IS NOT NULL AND payment_exchange_rate > 0::numeric);

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_period_chk" CHECK (period_number >= 1 AND period_number <= 16);

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_posting_pair_chk" CHECK ((posted_at IS NULL) = (posted_by IS NULL));

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'posted'::text, 'transmitted'::text, 'printed'::text, 'cleared'::text, 'reversed'::text, 'voided'::text, 'cancelled'::text, 'rejected'::text]));

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_type_chk" CHECK (payment_type = ANY (ARRAY['standard'::text, 'advance'::text, 'retention_release'::text, 'partial'::text, 'final'::text, 'down_payment'::text, 'urgent'::text, 'netting'::text]));

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_void_chk" CHECK (NOT is_voided OR voided_at IS NOT NULL);

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_allocated_pos" CHECK (allocated_amount > 0::numeric);

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_deductions_lte_allocated" CHECK ((discount_amount + withholding_tax_amount + advance_recovery_amount + retention_amount) <= allocated_amount);

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_deductions_nonneg" CHECK (discount_amount >= 0::numeric AND withholding_tax_amount >= 0::numeric AND advance_recovery_amount >= 0::numeric AND retention_amount >= 0::numeric);

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_invoice_or_cmt" CHECK (purchase_invoice_id IS NOT NULL OR commitment_id IS NOT NULL);

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."payment_remittance_output"
  ADD CONSTRAINT "pro_delivery_chk" CHECK (delivery_method = ANY (ARRAY['EMAIL'::text, 'PORTAL'::text, 'EDI'::text, 'FAX'::text, 'PRINT'::text, 'API'::text]));

ALTER TABLE ONLY "document"."payment_remittance_output"
  ADD CONSTRAINT "pro_delivery_status_chk" CHECK (delivery_status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'bounced'::text]));

ALTER TABLE ONLY "document"."payment_remittance_output"
  ADD CONSTRAINT "pro_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'generated'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_applied_nonneg" CHECK (applied_amount >= 0::numeric);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_basis_nonneg" CHECK (calculated_basis_amount >= 0::numeric);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_clause_snap_chk" CHECK (clause_snapshot IS NULL OR jsonb_typeof(clause_snapshot) = 'object'::text);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_clause_type_chk" CHECK (clause_type = ANY (ARRAY['ADVANCE'::text, 'ADVANCE_RECOVERY'::text, 'RETENTION'::text, 'RETENTION_RELEASE'::text, 'DUE_DATE'::text]));

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_default_amt_nonneg" CHECK (default_amount >= 0::numeric);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_due_date_base_chk" CHECK (clause_type <> 'DUE_DATE'::text OR base_event_date IS NOT NULL);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_due_date_code_chk" CHECK (clause_type <> 'DUE_DATE'::text OR clause_code = 'DUE_DATE'::text);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_due_date_no_clause_chk" CHECK (clause_type <> 'DUE_DATE'::text OR clause_id IS NULL);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_due_date_req_chk" CHECK (clause_type <> 'DUE_DATE'::text OR resolved_due_date IS NOT NULL);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_eval_seq_positive" CHECK (evaluation_sequence_no > 0);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_no_self_reverse" CHECK (reversed_by_application_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_no_self_supersede" CHECK (superseded_by_application_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_nonpo_snapshot_chk" CHECK (commitment_id IS NOT NULL OR term_snapshot IS NOT NULL);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_nonpo_term_ref_chk" CHECK (commitment_id IS NOT NULL OR payment_term_id IS NOT NULL);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_override_consistency_chk" CHECK (override_decision IS NULL OR override_decided_by IS NOT NULL AND override_decided_at IS NOT NULL);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_override_decision_chk" CHECK (override_decision IS NULL OR (override_decision = ANY (ARRAY['approve'::text, 'reject'::text, 'escalate'::text])));

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_override_reason_chk" CHECK (manual_override_reason IS NOT NULL OR system_reason_code IS NOT NULL OR (applied_pct IS NULL OR default_pct IS NULL OR applied_pct = default_pct) AND applied_amount = default_amount);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_pc_origin_clause_type_chk" CHECK (pricing_component_id IS NULL OR (clause_type = ANY (ARRAY['RETENTION'::text, 'RETENTION_RELEASE'::text, 'ADVANCE'::text, 'ADVANCE_RECOVERY'::text]))) NOT VALID;

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_remaining_nonneg" CHECK (remaining_balance_amount >= 0::numeric);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_reversal_effective_chk" CHECK (reversed_by_application_id IS NULL OR is_effective = false);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_running_nonneg" CHECK (running_total_amount >= 0::numeric);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_schedule_needs_commitment" CHECK (schedule_id IS NULL OR commitment_id IS NOT NULL);

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_status_chk" CHECK (application_status = ANY (ARRAY['APPLIED'::text, 'SKIPPED'::text, 'CLAMPED'::text, 'EXHAUSTED'::text, 'NOT_YET_ELIGIBLE'::text]));

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_system_reason_chk" CHECK (system_reason_code IS NULL OR (system_reason_code = ANY (ARRAY['CEILING_CLAMPED'::text, 'CEILING_REACHED'::text, 'THRESHOLD_NOT_MET'::text, 'CAP_EXHAUSTED'::text, 'CATCH_UP'::text, 'FLEXIBILITY_APPLIED'::text])));

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_term_snap_chk" CHECK (term_snapshot IS NULL OR jsonb_typeof(term_snapshot) = 'object'::text);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_alloc_nonneg" CHECK (allocated_payment_amount >= 0::numeric);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_basis_nonneg" CHECK (discount_basis_amount >= 0::numeric);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_days_nonneg" CHECK (qualified_days_actual >= 0);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_discount_nonneg" CHECK (discount_amount >= 0::numeric);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_no_self_reverse" CHECK (reverses_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_nonpo_term_ref_chk" CHECK (commitment_id IS NOT NULL OR payment_term_id IS NOT NULL);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_pct_range" CHECK (discount_pct IS NULL OR discount_pct >= 0::numeric AND discount_pct <= 100::numeric);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_reversal_ref_chk" CHECK (NOT is_reversal OR reverses_id IS NOT NULL);

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_status_chk" CHECK (application_status = ANY (ARRAY['QUALIFIED'::text, 'NOT_QUALIFIED'::text, 'PARTIAL'::text, 'WAIVED'::text, 'EXPIRED'::text, 'REVERSED'::text]));

ALTER TABLE ONLY "document"."payroll_period"
  ADD CONSTRAINT "payroll_period_dates_chk" CHECK (period_end >= period_start);

ALTER TABLE ONLY "document"."payroll_period"
  ADD CONSTRAINT "payroll_period_number_chk" CHECK (period_number >= 1 AND period_number <= 53);

ALTER TABLE ONLY "document"."payroll_period"
  ADD CONSTRAINT "payroll_period_status_chk" CHECK (status = ANY (ARRAY['open'::text, 'processing'::text, 'closed'::text, 'locked'::text]));

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_amount_chk" CHECK (gross_amount >= 0::numeric AND employee_deduction_amount >= 0::numeric AND employer_contribution_amount >= 0::numeric AND net_amount >= 0::numeric);

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_currency_chk" CHECK (currency_code ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_net_consistency_chk" CHECK (abs(net_amount - (gross_amount - employee_deduction_amount)) < 0.005);

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_status_chk" CHECK (status = ANY (ARRAY['calculated'::text, 'approved'::text, 'posted'::text, 'voided'::text]));

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_trace_chk" CHECK (jsonb_typeof(calculation_trace) = 'object'::text);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_amount_chk" CHECK (amount >= 0::numeric);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_component_type_chk" CHECK (component_type = ANY (ARRAY['earning'::text, 'deduction'::text, 'employer_contribution'::text, 'statutory'::text, 'memo'::text]));

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_currency_chk" CHECK (currency_code ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_json_chk" CHECK (jsonb_typeof(evaluated_inputs) = 'object'::text AND jsonb_typeof(evaluated_outputs) = 'object'::text AND jsonb_typeof(evaluation_trace) = 'object'::text);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."payroll_run"
  ADD CONSTRAINT "payroll_run_no_chk" CHECK (run_no >= 1);

ALTER TABLE ONLY "document"."payroll_run"
  ADD CONSTRAINT "payroll_run_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'calculating'::text, 'calculated'::text, 'approved'::text, 'posted'::text, 'cancelled'::text, 'reversed'::text]));

ALTER TABLE ONLY "document"."payroll_run"
  ADD CONSTRAINT "payroll_run_type_chk" CHECK (run_type = ANY (ARRAY['regular'::text, 'offcycle'::text, 'correction'::text, 'final'::text]));

ALTER TABLE ONLY "document"."payroll_run_employee"
  ADD CONSTRAINT "payroll_run_employee_status_chk" CHECK (status = ANY (ARRAY['included'::text, 'excluded'::text, 'calculated'::text, 'error'::text]));

ALTER TABLE ONLY "document"."people_request"
  ADD CONSTRAINT "people_request_payload_chk" CHECK (jsonb_typeof(requested_payload) = 'object'::text AND jsonb_typeof(approved_payload) = 'object'::text);

ALTER TABLE ONLY "document"."people_request"
  ADD CONSTRAINT "people_request_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."people_request"
  ADD CONSTRAINT "people_request_type_chk" CHECK (request_type = ANY (ARRAY['profile_change'::text, 'bank_update'::text, 'contact_change'::text, 'document_request'::text, 'other'::text]));

ALTER TABLE ONLY "document"."policy_acknowledgment"
  ADD CONSTRAINT "policy_acknowledgment_payload_chk" CHECK (jsonb_typeof(evidence_payload) = 'object'::text);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_amount_nonneg_chk" CHECK (amount_value IS NULL OR amount_value >= 0::numeric);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_apportion_basis_chk" CHECK (apportion_basis IS NULL OR (apportion_basis = ANY (ARRAY['value'::text, 'quantity'::text, 'weight'::text, 'equal'::text])));

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_apportion_chk" CHECK (is_apportioned = false AND is_apportioned_from_id IS NULL OR is_apportioned = true AND is_apportioned_from_id IS NOT NULL AND entry_level = 'line'::text);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_basis_chk" CHECK (basis = ANY (ARRAY['percent'::text, 'amount'::text, 'per_unit'::text, 'flat'::text]));

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_basis_value_chk" CHECK (basis = 'percent'::text AND rate_value IS NOT NULL AND amount_value IS NULL OR basis = 'per_unit'::text AND rate_value IS NOT NULL AND amount_value IS NULL OR (basis = ANY (ARRAY['amount'::text, 'flat'::text])) AND amount_value IS NOT NULL AND rate_value IS NULL);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_computed_base_nonneg_chk" CHECK (computed_base_amount >= 0::numeric);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_computed_nonneg_chk" CHECK (computed_amount >= 0::numeric);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_currency_chk" CHECK (currency_code = base_currency_code AND exchange_rate = 1.0 OR currency_code <> base_currency_code AND exchange_rate > 0::numeric);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_entry_level_chk" CHECK (entry_level = ANY (ARRAY['header'::text, 'line'::text]));

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_entry_level_scope_chk" CHECK (entry_level = 'header'::text AND source_line_id IS NULL OR entry_level = 'line'::text AND source_line_id IS NOT NULL);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_no_self_supersede" CHECK (superseded_by_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_origin_chk" CHECK (origin = ANY (ARRAY['manual'::text, 'inherited'::text, 'vendor_default'::text, 'system_resolved'::text]));

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_rate_nonneg_chk" CHECK (rate_value IS NULL OR rate_value >= 0::numeric);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_recoverable_chk" CHECK (recoverable_pct IS NULL OR recoverable_pct >= 0::numeric AND recoverable_pct <= 100::numeric);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_sequence_chk" CHECK (sequence > 0);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_source_doc_type_chk" CHECK (source_doc_type = ANY (ARRAY['purchase_requisition_line'::text, 'commitment_line'::text, 'purchase_invoice_line'::text, 'receipt_line'::text, 'service_sheet_line'::text]));

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_supersede_pair_chk" CHECK (superseded_by_id IS NULL AND superseded_at IS NULL AND superseded_by_user IS NULL OR superseded_by_id IS NOT NULL AND superseded_at IS NOT NULL AND superseded_by_user IS NOT NULL);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_tax_fields_scope_chk" CHECK ((term_type = ANY (ARRAY['tax'::text, 'withholding'::text])) AND tax_group_id IS NOT NULL OR (term_type <> ALL (ARRAY['tax'::text, 'withholding'::text])) AND tax_group_id IS NULL AND is_inclusive IS NULL AND recoverable_pct IS NULL AND tax_section_code IS NULL);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_term_type_chk" CHECK (term_type = ANY (ARRAY['discount'::text, 'charge'::text, 'tax'::text, 'withholding'::text, 'retention'::text, 'principal_marker'::text]));

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_wht_metadata_snapshot_chk" CHECK (term_type <> 'withholding'::text OR metadata ? 'rate_schedule_id'::text AND metadata ? 'wht_basis'::text AND metadata ? 'resolved_rate'::text);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_wht_no_recoverable_chk" CHECK (term_type <> 'withholding'::text OR recoverable_pct IS NULL OR recoverable_pct = 0::numeric);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_wht_not_inclusive_chk" CHECK (term_type <> 'withholding'::text OR is_inclusive IS NOT TRUE);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_advance_nonneg" CHECK (advance_deduction_amount >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_amount_chk" CHECK (total_amount >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_budget_chk" CHECK (budget_check_result IS NULL OR (budget_check_result = ANY (ARRAY['passed'::text, 'warned'::text, 'override'::text, 'blocked'::text, 'exempt'::text])));

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_commitment_req" CHECK (status = 'proforma'::text OR (invoice_source <> ALL (ARRAY['po_based'::text, 'contract_based'::text])) OR commitment_id IS NOT NULL);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_currency_triad_chk" CHECK (status = 'draft'::text OR currency_code = base_currency_code AND exchange_rate = 1.0 OR currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_match_status_chk" CHECK (match_status = ANY (ARRAY['unmatched'::text, 'partially_matched'::text, 'fully_matched'::text, 'match_exception'::text]));

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_match_type_chk" CHECK (match_type = ANY (ARRAY['three_way'::text, 'two_way'::text, 'no_match'::text, 'evaluated_receipt'::text]));

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_paid_nonneg" CHECK (paid_amount >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_period_chk" CHECK (period_number >= 1 AND period_number <= 16);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_retention_nonneg" CHECK (retention_amount >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_source_chk" CHECK (invoice_source = ANY (ARRAY['po_based'::text, 'contract_based'::text, 'non_po'::text, 'one_time_supplier'::text]));

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_status_chk" CHECK (status = ANY (ARRAY['proforma'::text, 'draft'::text, 'pending_approval'::text, 'approved'::text, 'posted'::text, 'partially_paid'::text, 'fully_paid'::text, 'on_hold'::text, 'reversed'::text, 'cancelled'::text, 'rejected'::text]));

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_status_source_chk" CHECK (status_source = ANY (ARRAY['manual'::text, 'derived'::text, 'system'::text, 'terminal'::text]));

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_supplier_invoice_date_req" CHECK (status = 'proforma'::text OR supplier_invoice_date IS NOT NULL);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_supplier_invoice_number_req" CHECK (status = 'proforma'::text OR supplier_invoice_number IS NOT NULL AND btrim(supplier_invoice_number) <> ''::text);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_tax_mode_chk" CHECK (tax_mode = ANY (ARRAY['exclusive'::text, 'inclusive'::text, 'out_of_scope'::text]));

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_tax_mode_no_tax_chk" CHECK (tax_mode IS DISTINCT FROM 'no_tax'::text OR tax_amount = 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_tax_mode_req" CHECK (status = 'proforma'::text OR tax_mode IS NOT NULL);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_tax_mode_source_chk" CHECK (tax_mode_source IS NULL OR (tax_mode_source = ANY (ARRAY['supplier_profile'::text, 'tax_group'::text, 'company_default'::text, 'user_override'::text, 'cannot_infer'::text])));

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_tax_nonneg" CHECK (tax_amount >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_terminal_status_chk" CHECK (terminal_status IS NULL OR (terminal_status = ANY (ARRAY['CANCELED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_type_chk" CHECK (invoice_type = ANY (ARRAY['standard'::text, 'credit_note'::text, 'debit_note'::text, 'advance'::text, 'retention_release'::text, 'self_billed'::text, 'final'::text]));

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_version_self_chk" CHECK (previous_version_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_wht_nonneg" CHECK (withholding_tax_amount >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_line_type_chk" CHECK (line_type = ANY (ARRAY['contract'::text, 'catalog'::text, 'marketplace'::text, 'noncatalog'::text]));

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_match_status_chk" CHECK (match_status = ANY (ARRAY['unmatched'::text, 'partially_matched'::text, 'fully_matched'::text, 'match_exception'::text]));

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_price_nonneg" CHECK (unit_price >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_price_unit_pos" CHECK (price_unit > 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_proc_type_chk" CHECK (procurement_type = ANY (ARRAY['goods'::text, 'services'::text]));

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_qty_nonzero" CHECK (quantity <> 0::numeric);

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_source_binding_shape_chk" CHECK (source_binding IS NULL OR jsonb_typeof(source_binding) = 'object'::text AND source_binding ? 'sourceType'::text AND jsonb_typeof(source_binding -> 'sourceType'::text) = 'string'::text);

ALTER TABLE ONLY "document"."purchase_order_confirmation"
  ADD CONSTRAINT "poc_status_chk" CHECK (status = ANY (ARRAY['received'::text, 'confirmed'::text, 'changes_proposed'::text, 'changes_accepted'::text, 'changes_rejected'::text, 'rejected'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."purchase_order_confirmation"
  ADD CONSTRAINT "poc_status_source_chk" CHECK (status_source = ANY (ARRAY['manual'::text, 'derived'::text, 'system'::text, 'terminal'::text]));

ALTER TABLE ONLY "document"."purchase_order_confirmation"
  ADD CONSTRAINT "poc_terminal_status_chk" CHECK (terminal_status IS NULL OR (terminal_status = ANY (ARRAY['CANCELED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY "document"."purchase_order_confirmation"
  ADD CONSTRAINT "poc_type_chk" CHECK (confirmation_type = ANY (ARRAY['FULL_CONFIRM'::text, 'PARTIAL_CONFIRM'::text, 'CHANGE_PROPOSAL'::text, 'REJECTION'::text]));

ALTER TABLE ONLY "document"."purchase_order_confirmation"
  ADD CONSTRAINT "poc_version_self_chk" CHECK (previous_version_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_line_status_chk" CHECK (line_status = ANY (ARRAY['confirmed'::text, 'changed'::text, 'rejected'::text, 'partial'::text]));

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_line_type_chk" CHECK (line_type = ANY (ARRAY['contract'::text, 'catalog'::text, 'marketplace'::text, 'noncatalog'::text]));

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_price_nonneg" CHECK (confirmed_unit_price >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_proc_type_chk" CHECK (procurement_type = ANY (ARRAY['goods'::text, 'services'::text]));

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_qty_pos" CHECK (confirmed_quantity > 0::numeric);

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_amount_nonneg" CHECK (total_amount >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_check_chk" CHECK (budget_check_result IS NULL OR (budget_check_result = ANY (ARRAY['passed'::text, 'warned'::text, 'override'::text, 'blocked'::text, 'exempt'::text])));

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_currency_triad_chk" CHECK (status = 'draft'::text OR currency_code = base_currency_code AND exchange_rate = 1.0 OR currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0::numeric);

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_number_nonempty" CHECK (btrim(requisition_number) <> ''::text);

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_period_chk" CHECK (period_number IS NULL OR period_number >= 1 AND period_number <= 16);

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'partially_converted'::text, 'fully_converted'::text, 'closed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_status_source_chk" CHECK (status_source = ANY (ARRAY['manual'::text, 'derived'::text, 'system'::text, 'terminal'::text]));

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_terminal_status_chk" CHECK (terminal_status IS NULL OR (terminal_status = ANY (ARRAY['CANCELED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_type_chk" CHECK (requisition_type = ANY (ARRAY['standard'::text, 'urgent'::text, 'blanket'::text, 'framework_call_off'::text, 'capex'::text]));

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_version_self_chk" CHECK (previous_version_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_committed_chk" CHECK (committed_quantity >= 0::numeric AND committed_quantity <= quantity);

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_line_type_chk" CHECK (line_type = ANY (ARRAY['contract'::text, 'catalog'::text, 'marketplace'::text, 'noncatalog'::text]));

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_price_nonneg" CHECK (unit_price >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_price_unit_pos" CHECK (price_unit > 0::numeric);

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_proc_type_chk" CHECK (procurement_type = ANY (ARRAY['goods'::text, 'services'::text]));

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_qty_pos" CHECK (quantity > 0::numeric);

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_status_chk" CHECK (status = ANY (ARRAY['open'::text, 'partially_converted'::text, 'converted'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_tax_nonneg" CHECK (tax_amount >= 0::numeric);

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_tolerance_chk" CHECK ((over_delivery_tolerance IS NULL OR over_delivery_tolerance >= 0::numeric) AND (under_delivery_tolerance IS NULL OR under_delivery_tolerance >= 0::numeric));

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_wht_nonneg" CHECK (withholding_tax_amount >= 0::numeric);

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_amount_nonneg" CHECK (total_amount >= 0::numeric);

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_currency_triad_chk" CHECK (status = 'draft'::text OR currency_code = base_currency_code AND exchange_rate = 1.0 OR currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0::numeric);

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_period_chk" CHECK (period_number >= 1 AND period_number <= 16);

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'posted'::text, 'reversed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_status_source_chk" CHECK (status_source = ANY (ARRAY['manual'::text, 'derived'::text, 'system'::text, 'terminal'::text]));

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_terminal_status_chk" CHECK (terminal_status IS NULL OR (terminal_status = ANY (ARRAY['CANCELED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_version_self_chk" CHECK (previous_version_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_accepted_nonneg" CHECK (accepted_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_line_type_chk" CHECK (line_type = ANY (ARRAY['contract'::text, 'catalog'::text, 'marketplace'::text, 'noncatalog'::text]));

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_price_nonneg" CHECK (unit_price >= 0::numeric);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_price_unit_pos" CHECK (price_unit > 0::numeric);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_proc_type_chk" CHECK (procurement_type = ANY (ARRAY['goods'::text, 'services'::text]));

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_qty_chk" CHECK ((accepted_quantity + rejected_quantity) <= received_quantity);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_qty_pos" CHECK (received_quantity > 0::numeric);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_rejected_nonneg" CHECK (rejected_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_tax_nonneg" CHECK (tax_amount >= 0::numeric);

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_wht_nonneg" CHECK (withholding_tax_amount >= 0::numeric);

ALTER TABLE ONLY "document"."render_job"
  ADD CONSTRAINT "render_job_attempts_cap" CHECK (attempts <= max_attempts);

ALTER TABLE ONLY "document"."render_job"
  ADD CONSTRAINT "render_job_attempts_pos" CHECK (attempts >= 0);

ALTER TABLE ONLY "document"."render_job"
  ADD CONSTRAINT "render_job_duration_pos" CHECK (duration_ms IS NULL OR duration_ms >= 0);

ALTER TABLE ONLY "document"."render_job"
  ADD CONSTRAINT "render_job_max_pos" CHECK (max_attempts > 0);

ALTER TABLE ONLY "document"."render_job"
  ADD CONSTRAINT "render_job_status_chk" CHECK (status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text, 'RETRYING'::text]));

ALTER TABLE ONLY "document"."render_output"
  ADD CONSTRAINT "render_output_entity_id_chk" CHECK (btrim(entity_id) <> ''::text);

ALTER TABLE ONLY "document"."render_output"
  ADD CONSTRAINT "render_output_entity_name_chk" CHECK (btrim(entity_name) <> ''::text);

ALTER TABLE ONLY "document"."render_output"
  ADD CONSTRAINT "render_output_manifest_ver_chk" CHECK (manifest_version >= 1);

ALTER TABLE ONLY "document"."render_output"
  ADD CONSTRAINT "render_output_operation_chk" CHECK (btrim(operation) <> ''::text);

ALTER TABLE ONLY "document"."render_output"
  ADD CONSTRAINT "render_output_size_chk" CHECK (size_bytes IS NULL OR size_bytes >= 0);

ALTER TABLE ONLY "document"."render_output"
  ADD CONSTRAINT "render_output_status_chk" CHECK (status = ANY (ARRAY['QUEUED'::text, 'RENDERING'::text, 'RENDERED'::text, 'DELIVERED'::text, 'FAILED'::text, 'ARCHIVED'::text, 'REVOKED'::text]));

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_model_chk" CHECK (selling_model = ANY (ARRAY['federated'::text, 'principal_seller'::text]));

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_principal_chk" CHECK (selling_model <> 'principal_seller'::text OR principal_seller_company_id IS NOT NULL);

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'qualified'::text, 'proposal'::text, 'won'::text, 'lost'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."sales_opportunity_company"
  ADD CONSTRAINT "sales_opportunity_company_role_chk" CHECK (participation_role = ANY (ARRAY['lead_seller'::text, 'participant'::text, 'fulfillment'::text]));

ALTER TABLE ONLY "document"."sales_opportunity_company"
  ADD CONSTRAINT "sales_opportunity_company_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'removed'::text]));

ALTER TABLE ONLY "document"."sales_order"
  ADD CONSTRAINT "sales_order_amount_chk" CHECK (total_amount >= 0::numeric);

ALTER TABLE ONLY "document"."sales_order"
  ADD CONSTRAINT "sales_order_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'active'::text, 'closed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."sales_order_intercompany_fulfillment"
  ADD CONSTRAINT "sales_order_ic_amount_chk" CHECK (allocation_amount >= 0::numeric);

ALTER TABLE ONLY "document"."sales_order_intercompany_fulfillment"
  ADD CONSTRAINT "sales_order_ic_company_chk" CHECK (selling_company_code_id <> fulfillment_company_code_id);

ALTER TABLE ONLY "document"."sales_order_intercompany_fulfillment"
  ADD CONSTRAINT "sales_order_ic_status_chk" CHECK (status = ANY (ARRAY['planned'::text, 'posted'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_model_chk" CHECK (selling_model = ANY (ARRAY['federated'::text, 'principal_seller'::text]));

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_principal_chk" CHECK (selling_model <> 'principal_seller'::text OR principal_seller_company_id IS NOT NULL);

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'converted'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."sales_quotation_allocation"
  ADD CONSTRAINT "sales_quotation_allocation_amount_chk" CHECK (allocation_amount IS NULL OR allocation_amount >= 0::numeric);

ALTER TABLE ONLY "document"."sales_quotation_allocation"
  ADD CONSTRAINT "sales_quotation_allocation_percent_chk" CHECK (allocation_percent IS NULL OR allocation_percent >= 0::numeric AND allocation_percent <= 100::numeric);

ALTER TABLE ONLY "document"."sales_quotation_allocation"
  ADD CONSTRAINT "sales_quotation_allocation_status_chk" CHECK (status = ANY (ARRAY['planned'::text, 'converted'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."sales_quotation_company"
  ADD CONSTRAINT "sales_quotation_company_role_chk" CHECK (participation_role = ANY (ARRAY['lead_seller'::text, 'participant'::text, 'fulfillment'::text]));

ALTER TABLE ONLY "document"."sales_quotation_company"
  ADD CONSTRAINT "sales_quotation_company_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'removed'::text]));

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_amount_nonneg" CHECK (scheduled_amount IS NULL OR scheduled_amount >= 0::numeric);

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_fulfilled_amt_nonneg" CHECK (fulfilled_amount >= 0::numeric);

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_fulfilled_le_sched" CHECK (fulfilled_quantity <= scheduled_quantity);

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_fulfilled_nonneg" CHECK (fulfilled_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_fulfillment_status_chk" CHECK (fulfillment_status = ANY (ARRAY['open'::text, 'partial'::text, 'fulfilled'::text, 'closed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_kind_chk" CHECK (schedule_kind = ANY (ARRAY['delivery'::text, 'billing_milestone'::text, 'release_window'::text]));

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_qty_pos" CHECK (scheduled_quantity > 0::numeric);

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_schedule_no_chk" CHECK (schedule_no > 0);

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_source_type_chk" CHECK (source_doc_type = ANY (ARRAY['purchase_requisition_line'::text, 'commitment_line'::text, 'purchase_invoice_line'::text]));

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'superseded'::text, 'retired'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_status_source_chk" CHECK (status_source = ANY (ARRAY['manual'::text, 'derived'::text, 'system'::text, 'terminal'::text]));

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_terminal_status_chk" CHECK (terminal_status IS NULL OR (terminal_status = ANY (ARRAY['CANCELED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_version_pos" CHECK (version_number >= 1);

ALTER TABLE ONLY "document"."schedule_line"
  ADD CONSTRAINT "schl_version_self_chk" CHECK (previous_version_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_source_payload_obj_chk" CHECK (jsonb_typeof(source_payload) = 'object'::text);

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]));

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_value_nonneg_chk" CHECK (gift_value IS NULL OR gift_value >= 0::numeric);

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_amount_nonneg" CHECK (total_amount >= 0::numeric);

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_currency_triad_chk" CHECK (status = 'draft'::text OR currency_code = base_currency_code AND exchange_rate = 1.0 OR currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0::numeric);

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_period_chk" CHECK (period_number >= 1 AND period_number <= 16);

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_period_range_chk" CHECK (service_period_to >= service_period_from);

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'pending_acceptance'::text, 'accepted'::text, 'pending_approval'::text, 'approved'::text, 'posted'::text, 'reversed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_status_source_chk" CHECK (status_source = ANY (ARRAY['manual'::text, 'derived'::text, 'system'::text, 'terminal'::text]));

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_terminal_status_chk" CHECK (terminal_status IS NULL OR (terminal_status = ANY (ARRAY['CANCELED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_version_self_chk" CHECK (previous_version_id IS DISTINCT FROM id);

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_line_type_chk" CHECK (line_type = ANY (ARRAY['contract'::text, 'catalog'::text, 'marketplace'::text, 'noncatalog'::text]));

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_pct_chk" CHECK (completion_pct IS NULL OR completion_pct >= 0::numeric AND completion_pct <= 100::numeric);

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_price_nonneg" CHECK (unit_price >= 0::numeric);

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_price_unit_pos" CHECK (price_unit > 0::numeric);

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_proc_type_chk" CHECK (procurement_type = ANY (ARRAY['goods'::text, 'services'::text]));

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_qty_pos" CHECK (quantity > 0::numeric);

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_tax_nonneg" CHECK (tax_amount >= 0::numeric);

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_wht_nonneg" CHECK (withholding_tax_amount >= 0::numeric);

ALTER TABLE ONLY "document"."shift_assignment"
  ADD CONSTRAINT "shift_assignment_date_consistency_chk" CHECK (planned_start_at::date = work_date);

ALTER TABLE ONLY "document"."shift_assignment"
  ADD CONSTRAINT "shift_assignment_status_chk" CHECK (status = ANY (ARRAY['scheduled'::text, 'worked'::text, 'adjusted'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."shift_assignment"
  ADD CONSTRAINT "shift_assignment_time_chk" CHECK (planned_end_at > planned_start_at);

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_buying_model_chk" CHECK (buying_model = ANY (ARRAY['federated'::text, 'central_buyer'::text]));

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_central_buyer_chk" CHECK (buying_model <> 'central_buyer'::text OR central_buyer_company_id IS NOT NULL);

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_date_chk" CHECK (close_at IS NULL OR open_at IS NULL OR close_at > open_at);

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'evaluation'::text, 'awarded'::text, 'cancelled'::text, 'closed'::text]));

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_type_chk" CHECK (event_type = ANY (ARRAY['rfp'::text, 'rfq'::text]));

ALTER TABLE ONLY "document"."sourcing_event_award"
  ADD CONSTRAINT "sourcing_event_award_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."sourcing_event_award"
  ADD CONSTRAINT "sourcing_event_award_status_chk" CHECK (award_status = ANY (ARRAY['recommended'::text, 'approved'::text, 'rejected'::text, 'converted'::text]));

ALTER TABLE ONLY "document"."sourcing_event_award_allocation"
  ADD CONSTRAINT "sourcing_event_award_alloc_amount_chk" CHECK (allocation_amount IS NULL OR allocation_amount >= 0::numeric);

ALTER TABLE ONLY "document"."sourcing_event_award_allocation"
  ADD CONSTRAINT "sourcing_event_award_alloc_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."sourcing_event_award_allocation"
  ADD CONSTRAINT "sourcing_event_award_alloc_percent_chk" CHECK (allocation_percent IS NULL OR allocation_percent >= 0::numeric AND allocation_percent <= 100::numeric);

ALTER TABLE ONLY "document"."sourcing_event_award_allocation"
  ADD CONSTRAINT "sourcing_event_award_alloc_status_chk" CHECK (status = ANY (ARRAY['planned'::text, 'converted'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."sourcing_event_company"
  ADD CONSTRAINT "sourcing_event_company_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."sourcing_event_company"
  ADD CONSTRAINT "sourcing_event_company_role_chk" CHECK (participation_role = ANY (ARRAY['lead_buyer'::text, 'participant'::text, 'beneficiary'::text]));

ALTER TABLE ONLY "document"."sourcing_event_company"
  ADD CONSTRAINT "sourcing_event_company_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'removed'::text]));

ALTER TABLE ONLY "document"."sourcing_event_demand"
  ADD CONSTRAINT "sourcing_event_demand_amount_chk" CHECK (requested_amount IS NULL OR requested_amount >= 0::numeric);

ALTER TABLE ONLY "document"."sourcing_event_demand"
  ADD CONSTRAINT "sourcing_event_demand_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."sourcing_event_demand"
  ADD CONSTRAINT "sourcing_event_demand_qty_chk" CHECK (requested_quantity IS NULL OR requested_quantity >= 0::numeric);

ALTER TABLE ONLY "document"."sourcing_event_demand"
  ADD CONSTRAINT "sourcing_event_demand_status_chk" CHECK (status = ANY (ARRAY['included'::text, 'withdrawn'::text, 'converted'::text]));

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_amount_chk" CHECK (allocation_amount >= 0::numeric);

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_company_chk" CHECK (source_company_code_id <> beneficiary_company_code_id);

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_metadata_obj_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_status_chk" CHECK (status = ANY (ARRAY['planned'::text, 'posted'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."stocktake"
  ADD CONSTRAINT "st_completed_chk" CHECK (status <> 'completed'::text OR completed_at IS NOT NULL AND completed_by IS NOT NULL);

ALTER TABLE ONLY "document"."stocktake"
  ADD CONSTRAINT "st_line_count_chk" CHECK (total_line_count >= 0 AND variance_line_count >= 0);

ALTER TABLE ONLY "document"."stocktake"
  ADD CONSTRAINT "st_reference_no_chk" CHECK (reference_no IS NULL OR btrim(reference_no) <> ''::text);

ALTER TABLE ONLY "document"."stocktake"
  ADD CONSTRAINT "st_status_chk" CHECK (status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "document"."stocktake"
  ADD CONSTRAINT "st_variance_je_chk" CHECK (variance_je_id IS NULL OR status = 'completed'::text);

ALTER TABLE ONLY "document"."stocktake_line"
  ADD CONSTRAINT "stl_currency_chk" CHECK (btrim(currency_code::text) <> ''::text);

ALTER TABLE ONLY "document"."stocktake_line"
  ADD CONSTRAINT "stl_line_no_chk" CHECK (line_no > 0);

ALTER TABLE ONLY "document"."stocktake_line"
  ADD CONSTRAINT "stl_posting_pair_chk" CHECK ((posted_at IS NULL) = (posted_by IS NULL));

ALTER TABLE ONLY "document"."stocktake_line"
  ADD CONSTRAINT "stl_system_qty_chk" CHECK (system_qty >= 0::numeric);

ALTER TABLE ONLY "document"."stocktake_line"
  ADD CONSTRAINT "stl_unit_cost_chk" CHECK (unit_cost >= 0::numeric);

ALTER TABLE ONLY "document"."supplier_rebuild_orphan_quarantine"
  ADD CONSTRAINT "srq_action_chk" CHECK (action_taken = ANY (ARRAY['nulled_and_tagged'::text, 'detected_blocking'::text, 'force_skipped'::text]));

ALTER TABLE ONLY "document"."time_punch"
  ADD CONSTRAINT "time_punch_json_chk" CHECK (jsonb_typeof(geo_payload) = 'object'::text AND jsonb_typeof(raw_payload) = 'object'::text);

ALTER TABLE ONLY "document"."time_punch"
  ADD CONSTRAINT "time_punch_source_type_chk" CHECK (source_type = ANY (ARRAY['manual'::text, 'biometric'::text, 'mobile'::text, 'rfid'::text, 'kiosk'::text, 'system'::text]));

ALTER TABLE ONLY "document"."time_punch"
  ADD CONSTRAINT "time_punch_status_chk" CHECK (status = ANY (ARRAY['accepted'::text, 'rejected'::text, 'voided'::text]));

ALTER TABLE ONLY "document"."time_punch"
  ADD CONSTRAINT "time_punch_type_chk" CHECK (punch_type = ANY (ARRAY['in'::text, 'out'::text, 'break_start'::text, 'break_end'::text]));

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_code_fmt" CHECK (code !~ '\s'::text);

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_code_nonempty" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_name_nonempty" CHECK (btrim(name) <> ''::text);

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_no_behalf_chk" CHECK (requested_by = created_by);

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_subject_chk" CHECK (principal_id = created_by);

ALTER TABLE ONLY "document"."wht_certificate"
  ADD CONSTRAINT "whtc_cert_nonempty" CHECK (btrim(certificate_no) <> ''::text);

ALTER TABLE ONLY "document"."wht_certificate"
  ADD CONSTRAINT "whtc_gross_nonneg" CHECK (gross_amount >= 0::numeric);

ALTER TABLE ONLY "document"."wht_certificate"
  ADD CONSTRAINT "whtc_issued_state" CHECK (status <> 'issued'::text OR issued_at IS NOT NULL);

ALTER TABLE ONLY "document"."wht_certificate"
  ADD CONSTRAINT "whtc_period_order" CHECK (period_to >= period_from);

ALTER TABLE ONLY "document"."wht_certificate"
  ADD CONSTRAINT "whtc_status_chk" CHECK (status = ANY (ARRAY['draft'::text, 'issued'::text, 'voided'::text]));

ALTER TABLE ONLY "document"."wht_certificate"
  ADD CONSTRAINT "whtc_voided_state" CHECK (status <> 'voided'::text OR voided_at IS NOT NULL AND void_reason IS NOT NULL);

ALTER TABLE ONLY "document"."wht_certificate"
  ADD CONSTRAINT "whtc_wht_lte_gross" CHECK (wht_amount <= gross_amount);

ALTER TABLE ONLY "document"."wht_certificate"
  ADD CONSTRAINT "whtc_wht_nonneg" CHECK (wht_amount >= 0::numeric);

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_decided_consistency" CHECK (decision IS NULL OR (status <> ALL (ARRAY['pending'::text, 'escalated'::text])) AND decided_at IS NOT NULL AND decided_by IS NOT NULL);

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_decision_chk" CHECK (decision IS NULL OR (decision = ANY (ARRAY['approve'::text, 'reject'::text, 'escalate'::text])));

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_entity_chk" CHECK (btrim(entity_type) <> ''::text AND btrim(entity_id) <> ''::text);

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_snapshot_chk" CHECK (entity_snapshot IS NULL OR jsonb_typeof(entity_snapshot) = 'object'::text);

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'escalated'::text, 'canceled'::text]));

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_template_snap_chk" CHECK (template_snapshot IS NULL OR jsonb_typeof(template_snapshot) = 'object'::text);

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_completed_chk" CHECK ((status <> ALL (ARRAY['completed'::text, 'skipped'::text, 'canceled'::text])) OR completed_at IS NOT NULL);

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_mode_chk" CHECK (mode = ANY (ARRAY['serial'::text, 'parallel'::text]));

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_quorum_chk" CHECK (quorum IS NULL OR jsonb_typeof(quorum) = 'object'::text);

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_stage_no_chk" CHECK (stage_no > 0);

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_started_chk" CHECK (status = 'pending'::text OR (status = ANY (ARRAY['active'::text, 'completed'::text, 'skipped'::text])) AND started_at IS NOT NULL);

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'completed'::text, 'skipped'::text, 'canceled'::text]));

ALTER TABLE ONLY "document"."accounting_distribution"
  ADD CONSTRAINT "ad_asset_fk" FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."attendance_adjustment_request"
  ADD CONSTRAINT "attendance_adjustment_day_fk" FOREIGN KEY (tenant_id, attendance_day_id) REFERENCES document.attendance_day(tenant_id, id);

ALTER TABLE ONLY "document"."attendance_adjustment_request"
  ADD CONSTRAINT "attendance_adjustment_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."attendance_adjustment_request"
  ADD CONSTRAINT "attendance_adjustment_workflow_fk" FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id);

ALTER TABLE ONLY "document"."attendance_day"
  ADD CONSTRAINT "attendance_day_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."attendance_day"
  ADD CONSTRAINT "attendance_day_shift_fk" FOREIGN KEY (tenant_id, shift_assignment_id) REFERENCES document.shift_assignment(tenant_id, id);

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_bank_account_fk" FOREIGN KEY (tenant_id, bank_account_id) REFERENCES master.bank_account(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_sign_off_je_fk" FOREIGN KEY (sign_off_je_id) REFERENCES document.journal_entry(id) ON DELETE SET NULL;

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_signed_off_by_fk" FOREIGN KEY (signed_off_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."bank_recon_case"
  ADD CONSTRAINT "brc_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_recon_case_line"
  ADD CONSTRAINT "brcl_case_fk" FOREIGN KEY (tenant_id, bank_recon_case_id) REFERENCES document.bank_recon_case(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."bank_recon_case_line"
  ADD CONSTRAINT "brcl_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_recon_case_line"
  ADD CONSTRAINT "brcl_payment_fk" FOREIGN KEY (tenant_id, payment_entry_id) REFERENCES document.payment_entry(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_recon_case_line"
  ADD CONSTRAINT "brcl_stmt_line_fk" FOREIGN KEY (tenant_id, bank_statement_line_id) REFERENCES document.bank_statement_line(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_recon_case_line"
  ADD CONSTRAINT "brcl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_bank_account_fk" FOREIGN KEY (tenant_id, bank_account_id) REFERENCES master.bank_account(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_sign_off_je_fk" FOREIGN KEY (sign_off_je_id) REFERENCES document.journal_entry(id) ON DELETE SET NULL;

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_signed_off_by_fk" FOREIGN KEY (signed_off_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."bank_statement"
  ADD CONSTRAINT "bst_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."bank_statement_line"
  ADD CONSTRAINT "bsl_recon_case_fk" FOREIGN KEY (tenant_id, recon_case_id) REFERENCES document.bank_recon_case(tenant_id, id) ON DELETE SET NULL (recon_case_id) NOT VALID;

ALTER TABLE ONLY "document"."bank_statement_line"
  ADD CONSTRAINT "bsl_statement_fk" FOREIGN KEY (tenant_id, bank_statement_id) REFERENCES document.bank_statement(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."bank_statement_line"
  ADD CONSTRAINT "bsl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_posting_rule_fk" FOREIGN KEY (tenant_id, posting_rule_id) REFERENCES control.book_posting_rule(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_source_journal_fk" FOREIGN KEY (tenant_id, source_journal_id) REFERENCES document.journal_entry(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_target_journal_fk" FOREIGN KEY (tenant_id, target_journal_id) REFERENCES document.journal_entry(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."book_posting_derivation"
  ADD CONSTRAINT "bpd_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."command_log"
  ADD CONSTRAINT "cmdl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_previous_version_fk" FOREIGN KEY (tenant_id, previous_version_id) REFERENCES document.commitment(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."commitment"
  ADD CONSTRAINT "cmt_renewed_from_fk" FOREIGN KEY (tenant_id, renewed_from_id) REFERENCES document.commitment(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_asset_class_fk" FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_commitment_fk" FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_from_jur_fk" FOREIGN KEY (tenant_id, from_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_requisition_line_fk" FOREIGN KEY (tenant_id, requisition_line_id) REFERENCES document.purchase_requisition_line(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_shipfrom_address_fk" FOREIGN KEY (tenant_id, shipfrom_address_id) REFERENCES master.address(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_shipto_address_fk" FOREIGN KEY (tenant_id, shipto_address_id) REFERENCES master.address(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."commitment_line"
  ADD CONSTRAINT "cl_to_jur_fk" FOREIGN KEY (tenant_id, to_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."compensation_assignment"
  ADD CONSTRAINT "compensation_assignment_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."compensation_assignment"
  ADD CONSTRAINT "compensation_assignment_employment_fk" FOREIGN KEY (tenant_id, employment_id) REFERENCES master.employment(tenant_id, id);

ALTER TABLE ONLY "document"."compensation_assignment"
  ADD CONSTRAINT "compensation_assignment_group_fk" FOREIGN KEY (tenant_id, pay_group_id) REFERENCES master.pay_group(tenant_id, id);

ALTER TABLE ONLY "document"."compensation_assignment"
  ADD CONSTRAINT "compensation_assignment_structure_fk" FOREIGN KEY (tenant_id, pay_structure_id) REFERENCES master.pay_structure(tenant_id, id);

ALTER TABLE ONLY "document"."compensation_change"
  ADD CONSTRAINT "compensation_change_assignment_fk" FOREIGN KEY (tenant_id, compensation_assignment_id) REFERENCES document.compensation_assignment(tenant_id, id);

ALTER TABLE ONLY "document"."compensation_change"
  ADD CONSTRAINT "compensation_change_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."compensation_change"
  ADD CONSTRAINT "compensation_change_workflow_fk" FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id);

ALTER TABLE ONLY "document"."delivery_note"
  ADD CONSTRAINT "dn_commitment_fk" FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."delivery_note"
  ADD CONSTRAINT "dn_previous_version_fk" FOREIGN KEY (tenant_id, previous_version_id) REFERENCES document.delivery_note(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_commitment_line_fk" FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."delivery_note_line"
  ADD CONSTRAINT "dnl_dn_fk" FOREIGN KEY (tenant_id, delivery_note_id) REFERENCES document.delivery_note(tenant_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."doc_attachment"
  ADD CONSTRAINT "da_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."doc_attachment"
  ADD CONSTRAINT "da_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."doc_attachment"
  ADD CONSTRAINT "da_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "document"."doc_attachment"
  ADD CONSTRAINT "da_uploaded_by_fk" FOREIGN KEY (uploaded_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "document"."employee_tax_declaration"
  ADD CONSTRAINT "employee_tax_declaration_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."employee_tax_declaration"
  ADD CONSTRAINT "employee_tax_declaration_employment_fk" FOREIGN KEY (tenant_id, employment_id) REFERENCES master.employment(tenant_id, id);

ALTER TABLE ONLY "document"."employee_tax_declaration"
  ADD CONSTRAINT "employee_tax_declaration_workflow_fk" FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id);

ALTER TABLE ONLY "document"."employee_tax_declaration_line"
  ADD CONSTRAINT "employee_tax_declaration_line_parent_fk" FOREIGN KEY (tenant_id, employee_tax_declaration_id) REFERENCES document.employee_tax_declaration(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."hr_case"
  ADD CONSTRAINT "hr_case_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."import_request_chunk"
  ADD CONSTRAINT "import_chunk_request_fk" FOREIGN KEY (import_request_id) REFERENCES document.import_request(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."invoice_match_case"
  ADD CONSTRAINT "imc_invoice_fk" FOREIGN KEY (tenant_id, purchase_invoice_id) REFERENCES document.purchase_invoice(tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE ONLY "document"."invoice_tax_snapshot"
  ADD CONSTRAINT "itsnap_pi_fk" FOREIGN KEY (tenant_id, purchase_invoice_id) REFERENCES document.purchase_invoice(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."invoice_tax_snapshot"
  ADD CONSTRAINT "itsnap_pil_fk" FOREIGN KEY (tenant_id, invoice_line_id) REFERENCES document.purchase_invoice_line(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_derived_from_fk" FOREIGN KEY (tenant_id, derived_from_je_id) REFERENCES document.journal_entry(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_posting_rule_fk" FOREIGN KEY (tenant_id, posting_rule_id) REFERENCES control.book_posting_rule(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_reversal_of_fk" FOREIGN KEY (tenant_id, reversal_of_id) REFERENCES document.journal_entry(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."journal_entry"
  ADD CONSTRAINT "je_reversed_by_fk" FOREIGN KEY (tenant_id, reversed_by_id) REFERENCES document.journal_entry(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."journal_line"
  ADD CONSTRAINT "jl_je_fk" FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES document.journal_entry(tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE ONLY "document"."journal_line_reference"
  ADD CONSTRAINT "jlr_jl_fk" FOREIGN KEY (tenant_id, journal_line_id) REFERENCES document.journal_line(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."leave_balance_entry"
  ADD CONSTRAINT "leave_balance_entry_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."leave_balance_entry"
  ADD CONSTRAINT "leave_balance_entry_plan_fk" FOREIGN KEY (tenant_id, leave_plan_id) REFERENCES master.leave_plan(tenant_id, id);

ALTER TABLE ONLY "document"."leave_balance_entry"
  ADD CONSTRAINT "leave_balance_entry_type_fk" FOREIGN KEY (tenant_id, leave_type_id) REFERENCES master.leave_type(tenant_id, id);

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_plan_fk" FOREIGN KEY (tenant_id, leave_plan_id) REFERENCES master.leave_plan(tenant_id, id);

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_type_fk" FOREIGN KEY (tenant_id, leave_type_id) REFERENCES master.leave_type(tenant_id, id);

ALTER TABLE ONLY "document"."leave_request"
  ADD CONSTRAINT "leave_request_workflow_fk" FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id);

ALTER TABLE ONLY "document"."match_exception"
  ADD CONSTRAINT "imx_case_fk" FOREIGN KEY (tenant_id, invoice_match_case_id) REFERENCES document.invoice_match_case(tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE ONLY "document"."match_exception"
  ADD CONSTRAINT "imx_pil_fk" FOREIGN KEY (tenant_id, invoice_line_id) REFERENCES document.purchase_invoice_line(tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE ONLY "document"."offboarding_case"
  ADD CONSTRAINT "offboarding_case_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."offboarding_case"
  ADD CONSTRAINT "offboarding_case_workflow_fk" FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id);

ALTER TABLE ONLY "document"."onboarding_case"
  ADD CONSTRAINT "onboarding_case_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."onboarding_case"
  ADD CONSTRAINT "onboarding_case_person_fk" FOREIGN KEY (tenant_id, person_id) REFERENCES master.person(tenant_id, id);

ALTER TABLE ONLY "document"."onboarding_case"
  ADD CONSTRAINT "onboarding_case_workflow_fk" FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id);

ALTER TABLE ONLY "document"."operating_organization_resource_company"
  ADD CONSTRAINT "oor_company_code_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "document"."operating_organization_resource_company"
  ADD CONSTRAINT "oor_company_owner_fk" FOREIGN KEY (tenant_id, resource_owner_id) REFERENCES document.operating_organization_resource_owner(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_central_company_fk" FOREIGN KEY (tenant_id, central_company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_org_fk" FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization(tenant_id, id);

ALTER TABLE ONLY "document"."operating_organization_resource_owner"
  ADD CONSTRAINT "oor_owner_seller_company_fk" FOREIGN KEY (tenant_id, principal_seller_company_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_supplier_fk" FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."party_advance_balance"
  ADD CONSTRAINT "pab_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."payment_entry"
  ADD CONSTRAINT "pe_bsl_fk" FOREIGN KEY (tenant_id, bank_statement_line_id) REFERENCES document.bank_statement_line(tenant_id, id) ON DELETE SET NULL (bank_statement_line_id) NOT VALID;

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_invoice_fk" FOREIGN KEY (tenant_id, purchase_invoice_id) REFERENCES document.purchase_invoice(tenant_id, id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_payment_fk" FOREIGN KEY (tenant_id, payment_entry_id) REFERENCES document.payment_entry(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."payment_entry_allocation"
  ADD CONSTRAINT "pea_pta_fk" FOREIGN KEY (tenant_id, payment_term_application_id) REFERENCES document.payment_term_application(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY "document"."payment_remittance_output"
  ADD CONSTRAINT "prem_payment_fk" FOREIGN KEY (tenant_id, payment_entry_id) REFERENCES document.payment_entry(tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_invoice_fk" FOREIGN KEY (tenant_id, invoice_id) REFERENCES document.purchase_invoice(tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_invoice_line_fk" FOREIGN KEY (tenant_id, invoice_line_id) REFERENCES document.purchase_invoice_line(tenant_id, id) ON DELETE SET NULL (invoice_line_id) NOT VALID;

ALTER TABLE ONLY "document"."payment_term_application"
  ADD CONSTRAINT "pta_pricing_component_fk" FOREIGN KEY (tenant_id, pricing_component_id) REFERENCES document.pricing_component(tenant_id, id) ON DELETE SET NULL (pricing_component_id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_invoice_fk" FOREIGN KEY (tenant_id, invoice_id) REFERENCES document.purchase_invoice(tenant_id, id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE ONLY "document"."payment_term_discount_result"
  ADD CONSTRAINT "ptdr_payment_fk" FOREIGN KEY (tenant_id, payment_id) REFERENCES document.payment_entry(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."payroll_period"
  ADD CONSTRAINT "payroll_period_group_fk" FOREIGN KEY (tenant_id, pay_group_id) REFERENCES master.pay_group(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_render_fk" FOREIGN KEY (tenant_id, render_output_id) REFERENCES document.render_output(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_run_employee_fk" FOREIGN KEY (tenant_id, payroll_run_employee_id) REFERENCES document.payroll_run_employee(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result"
  ADD CONSTRAINT "payroll_result_run_fk" FOREIGN KEY (tenant_id, payroll_run_id) REFERENCES document.payroll_run(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_component_fk" FOREIGN KEY (tenant_id, pay_component_id) REFERENCES master.pay_component(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_cost_center_fk" FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_formula_fk" FOREIGN KEY (tenant_id, formula_expression_version_id) REFERENCES control.formula_expression_version(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_profit_center_fk" FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_project_fk" FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_result_fk" FOREIGN KEY (tenant_id, payroll_result_id) REFERENCES document.payroll_result(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."payroll_result_line"
  ADD CONSTRAINT "payroll_result_line_site_fk" FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_run"
  ADD CONSTRAINT "payroll_run_journal_fk" FOREIGN KEY (tenant_id, posted_journal_entry_id) REFERENCES document.journal_entry(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_run"
  ADD CONSTRAINT "payroll_run_period_fk" FOREIGN KEY (tenant_id, payroll_period_id) REFERENCES document.payroll_period(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_run_employee"
  ADD CONSTRAINT "payroll_run_employee_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."payroll_run_employee"
  ADD CONSTRAINT "payroll_run_employee_run_fk" FOREIGN KEY (tenant_id, payroll_run_id) REFERENCES document.payroll_run(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."people_request"
  ADD CONSTRAINT "people_request_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."people_request"
  ADD CONSTRAINT "people_request_workflow_fk" FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id);

ALTER TABLE ONLY "document"."policy_acknowledgment"
  ADD CONSTRAINT "policy_acknowledgment_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_apportioned_from_fk" FOREIGN KEY (is_apportioned_from_id) REFERENCES document.pricing_component(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_condition_type_fk" FOREIGN KEY (condition_type_id) REFERENCES master.condition_type(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."pricing_component"
  ADD CONSTRAINT "pc_superseded_by_fk" FOREIGN KEY (superseded_by_id) REFERENCES document.pricing_component(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_commitment_fk" FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice"
  ADD CONSTRAINT "pi_previous_version_fk" FOREIGN KEY (tenant_id, previous_version_id) REFERENCES document.purchase_invoice(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_asset_class_fk" FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_commitment_line_fk" FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_from_jur_fk" FOREIGN KEY (tenant_id, from_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_invoice_fk" FOREIGN KEY (tenant_id, purchase_invoice_id) REFERENCES document.purchase_invoice(tenant_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_receipt_line_fk" FOREIGN KEY (tenant_id, receipt_line_id) REFERENCES document.receipt_line(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_service_sheet_line_fk" FOREIGN KEY (tenant_id, service_sheet_line_id) REFERENCES document.service_sheet_line(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_shipfrom_address_fk" FOREIGN KEY (tenant_id, shipfrom_address_id) REFERENCES master.address(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_shipto_address_fk" FOREIGN KEY (tenant_id, shipto_address_id) REFERENCES master.address(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_site_fk" FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_to_jur_fk" FOREIGN KEY (tenant_id, to_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_invoice_line"
  ADD CONSTRAINT "pil_wht_tax_group_fk" FOREIGN KEY (tenant_id, withholding_tax_group_id) REFERENCES control.tax_group(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY "document"."purchase_order_confirmation"
  ADD CONSTRAINT "poc_commitment_fk" FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_order_confirmation"
  ADD CONSTRAINT "poc_previous_version_fk" FOREIGN KEY (tenant_id, previous_version_id) REFERENCES document.purchase_order_confirmation(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_commitment_line_fk" FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_order_confirmation_line"
  ADD CONSTRAINT "pocl_poc_fk" FOREIGN KEY (tenant_id, confirmation_id) REFERENCES document.purchase_order_confirmation(tenant_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_requisition"
  ADD CONSTRAINT "pr_previous_version_fk" FOREIGN KEY (tenant_id, previous_version_id) REFERENCES document.purchase_requisition(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."purchase_requisition_line"
  ADD CONSTRAINT "prl_pr_fk" FOREIGN KEY (tenant_id, purchase_requisition_id) REFERENCES document.purchase_requisition(tenant_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_commitment_fk" FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_delivery_note_fk" FOREIGN KEY (tenant_id, delivery_note_id) REFERENCES document.delivery_note(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."receipt"
  ADD CONSTRAINT "rcp_previous_version_fk" FOREIGN KEY (tenant_id, previous_version_id) REFERENCES document.receipt(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_asset_class_fk" FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_commitment_line_fk" FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_delivery_note_line_fk" FOREIGN KEY (tenant_id, delivery_note_line_id) REFERENCES document.delivery_note_line(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."receipt_line"
  ADD CONSTRAINT "rcpl_receipt_fk" FOREIGN KEY (tenant_id, receipt_id) REFERENCES document.receipt(tenant_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_customer_fk" FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_oo_fk" FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_principal_seller_fk" FOREIGN KEY (tenant_id, principal_seller_company_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_opportunity"
  ADD CONSTRAINT "sales_opportunity_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sales_opportunity_company"
  ADD CONSTRAINT "sales_opportunity_company_code_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_opportunity_company"
  ADD CONSTRAINT "sales_opportunity_company_event_fk" FOREIGN KEY (tenant_id, opportunity_id) REFERENCES document.sales_opportunity(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sales_order"
  ADD CONSTRAINT "sales_order_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_order"
  ADD CONSTRAINT "sales_order_customer_fk" FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_order"
  ADD CONSTRAINT "sales_order_quote_fk" FOREIGN KEY (tenant_id, quotation_id) REFERENCES document.sales_quotation(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_order"
  ADD CONSTRAINT "sales_order_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sales_order_intercompany_fulfillment"
  ADD CONSTRAINT "sales_order_ic_fulfillment_company_fk" FOREIGN KEY (tenant_id, fulfillment_company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_order_intercompany_fulfillment"
  ADD CONSTRAINT "sales_order_ic_order_fk" FOREIGN KEY (tenant_id, sales_order_id) REFERENCES document.sales_order(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sales_order_intercompany_fulfillment"
  ADD CONSTRAINT "sales_order_ic_selling_company_fk" FOREIGN KEY (tenant_id, selling_company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_customer_fk" FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_oo_fk" FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_opportunity_fk" FOREIGN KEY (tenant_id, opportunity_id) REFERENCES document.sales_opportunity(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_principal_seller_fk" FOREIGN KEY (tenant_id, principal_seller_company_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_quotation"
  ADD CONSTRAINT "sales_quotation_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sales_quotation_allocation"
  ADD CONSTRAINT "sales_quotation_alloc_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_quotation_allocation"
  ADD CONSTRAINT "sales_quotation_alloc_order_fk" FOREIGN KEY (tenant_id, output_sales_order_id) REFERENCES document.sales_order(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_quotation_allocation"
  ADD CONSTRAINT "sales_quotation_alloc_quote_fk" FOREIGN KEY (tenant_id, quotation_id) REFERENCES document.sales_quotation(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sales_quotation_company"
  ADD CONSTRAINT "sales_quotation_company_code_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sales_quotation_company"
  ADD CONSTRAINT "sales_quotation_company_quote_fk" FOREIGN KEY (tenant_id, quotation_id) REFERENCES document.sales_quotation(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_status_changed_by_fk" FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."seed_gift"
  ADD CONSTRAINT "seed_gift_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_commitment_fk" FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."service_sheet"
  ADD CONSTRAINT "ssh_previous_version_fk" FOREIGN KEY (tenant_id, previous_version_id) REFERENCES document.service_sheet(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_commitment_line_fk" FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_from_jur_fk" FOREIGN KEY (tenant_id, from_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_shipfrom_address_fk" FOREIGN KEY (tenant_id, shipfrom_address_id) REFERENCES master.address(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_shipto_address_fk" FOREIGN KEY (tenant_id, shipto_address_id) REFERENCES master.address(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_site_fk" FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_ssh_fk" FOREIGN KEY (tenant_id, service_sheet_id) REFERENCES document.service_sheet(tenant_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."service_sheet_line"
  ADD CONSTRAINT "sshl_to_jur_fk" FOREIGN KEY (tenant_id, to_tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "document"."shift_assignment"
  ADD CONSTRAINT "shift_assignment_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."shift_assignment"
  ADD CONSTRAINT "shift_assignment_shift_type_fk" FOREIGN KEY (tenant_id, shift_type_id) REFERENCES master.shift_type(tenant_id, id);

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_central_company_fk" FOREIGN KEY (tenant_id, central_buyer_company_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_oo_fk" FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sourcing_event"
  ADD CONSTRAINT "sourcing_event_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sourcing_event_award"
  ADD CONSTRAINT "sourcing_event_award_event_fk" FOREIGN KEY (tenant_id, sourcing_event_id) REFERENCES document.sourcing_event(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sourcing_event_award_allocation"
  ADD CONSTRAINT "sourcing_event_award_alloc_award_fk" FOREIGN KEY (tenant_id, award_id) REFERENCES document.sourcing_event_award(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sourcing_event_award_allocation"
  ADD CONSTRAINT "sourcing_event_award_alloc_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sourcing_event_company"
  ADD CONSTRAINT "sourcing_event_company_code_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sourcing_event_company"
  ADD CONSTRAINT "sourcing_event_company_event_fk" FOREIGN KEY (tenant_id, sourcing_event_id) REFERENCES document.sourcing_event(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sourcing_event_demand"
  ADD CONSTRAINT "sourcing_event_demand_company_fk" FOREIGN KEY (tenant_id, demand_company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sourcing_event_demand"
  ADD CONSTRAINT "sourcing_event_demand_event_fk" FOREIGN KEY (tenant_id, sourcing_event_id) REFERENCES document.sourcing_event(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sourcing_event_demand"
  ADD CONSTRAINT "sourcing_event_demand_line_fk" FOREIGN KEY (tenant_id, purchase_requisition_line_id) REFERENCES document.purchase_requisition_line(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_award_fk" FOREIGN KEY (tenant_id, award_allocation_id) REFERENCES document.sourcing_event_award_allocation(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_beneficiary_company_fk" FOREIGN KEY (tenant_id, beneficiary_company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_commitment_fk" FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_source_company_fk" FOREIGN KEY (tenant_id, source_company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."sourcing_event_intercompany_allocation"
  ADD CONSTRAINT "sourcing_event_ic_alloc_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."time_punch"
  ADD CONSTRAINT "time_punch_employee_fk" FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id);

ALTER TABLE ONLY "document"."time_punch"
  ADD CONSTRAINT "time_punch_shift_fk" FOREIGN KEY (tenant_id, shift_assignment_id) REFERENCES document.shift_assignment(tenant_id, id);

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_requested_by_fk" FOREIGN KEY (requested_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_scby_fk" FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."user_profile_update_request"
  ADD CONSTRAINT "upupr_workflow_fk" FOREIGN KEY (workflow_request_id) REFERENCES document.workflow_request(id) ON DELETE SET NULL;

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_decided_by_fk" FOREIGN KEY (decided_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_definition_fk" FOREIGN KEY (workflow_definition_id) REFERENCES control.workflow_definition(id) ON DELETE SET NULL;

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_requested_by_fk" FOREIGN KEY (requested_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_template_fk" FOREIGN KEY (workflow_template_id) REFERENCES control.workflow_template(id) ON DELETE SET NULL;

ALTER TABLE ONLY "document"."workflow_request"
  ADD CONSTRAINT "wreq_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_request_fk" FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_sla_fk" FOREIGN KEY (sla_policy_id) REFERENCES control.workflow_sla_policy(id) ON DELETE SET NULL;

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_template_stage_fk" FOREIGN KEY (template_stage_id) REFERENCES control.workflow_template_stage(id) ON DELETE SET NULL;

ALTER TABLE ONLY "document"."workflow_stage"
  ADD CONSTRAINT "wstg_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
