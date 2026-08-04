-- ============================================================================
-- document/06_triggers.sql
-- Non-internal triggers reconstructed from the live catalog.
-- Generated from the live Neon database document schema. Do not hand-edit.
-- ============================================================================

CREATE TRIGGER trg_ad_dimension_set_hash BEFORE INSERT OR UPDATE OF cost_center_id, profit_center_id, project_id ON document.accounting_distribution FOR EACH ROW EXECUTE FUNCTION document.trg_ad_dimension_set_hash_refresh();

COMMENT ON TRIGGER "trg_ad_dimension_set_hash" ON "document"."accounting_distribution" IS 'Keeps dimension_set_id in sync with the three scalar dimensions on AD (cost_center, profit_center, project). Site dimension is sourced from the P2P line. Includes the Stage 3 final-posting UPDATE.';

CREATE TRIGGER trg_ad_status_gated_mutation BEFORE DELETE OR UPDATE ON document.accounting_distribution FOR EACH ROW EXECUTE FUNCTION document.fn_ad_status_gated_mutation();

COMMENT ON TRIGGER "trg_ad_status_gated_mutation" ON "document"."accounting_distribution" IS 'Blocks UPDATE/DELETE when OLD parent PI status is terminal (posted/partially_paid/fully_paid/reversed/cancelled). Allows the Stage 3 final-posting UPDATE because OLD parent is still ''approved'' at that moment. Posting service ordering is critical: AD UPDATEs BEFORE pi.status=posted.';

CREATE TRIGGER trg_ad_validate_polymorphic_source BEFORE INSERT OR UPDATE OF source_doc_type, source_doc_id, source_line_id ON document.accounting_distribution FOR EACH ROW EXECUTE FUNCTION document.fn_ad_validate_polymorphic_source();

COMMENT ON TRIGGER "trg_ad_validate_polymorphic_source" ON "document"."accounting_distribution" IS 'Validates polymorphic source tuple: parent row exists in the correct table per source_doc_type, tenant matches, source_doc_id (header) owns source_line_id. Hard-validates purchase_invoice_line; other source types soft-validated pending per-domain wiring.';

CREATE TRIGGER trg_atx_book_guard BEFORE INSERT OR UPDATE OF asset_book_id, asset_id, book_type ON document.asset_transaction FOR EACH ROW EXECUTE FUNCTION document.trg_asset_txn_book_guard();

CREATE TRIGGER trg_atx_book_type_lookup BEFORE INSERT OR UPDATE OF book_type ON document.asset_transaction FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_book_type', 'book_type');

CREATE TRIGGER trg_atx_status_changed BEFORE UPDATE ON document.asset_transaction FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_atx_txn_type_lookup BEFORE INSERT OR UPDATE OF txn_type ON document.asset_transaction FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.asset_txn_type', 'txn_type');

CREATE TRIGGER trg_atx_updated_at BEFORE UPDATE ON document.asset_transaction FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_status_changed BEFORE UPDATE ON document.attendance_adjustment_request FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.attendance_adjustment_request FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.attendance_day FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_brcl_active_uniqueness BEFORE INSERT ON document.bank_recon_case_line FOR EACH ROW EXECUTE FUNCTION document.fn_brcl_active_uniqueness();

CREATE TRIGGER trg_brcl_immutable BEFORE DELETE OR UPDATE ON document.bank_recon_case_line FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

CREATE TRIGGER trg_cmt_default_requested_by BEFORE INSERT ON document.commitment FOR EACH ROW EXECUTE FUNCTION shared.trg_default_requested_by();

CREATE TRIGGER trg_cmt_immutability_guard BEFORE UPDATE ON document.commitment FOR EACH ROW WHEN ((old.status = ANY (ARRAY['closed'::text, 'cancelled'::text, 'expired'::text])) OR old.terminal_status IS NOT NULL) EXECUTE FUNCTION document.trg_cmt_immutability_guard();

CREATE TRIGGER trg_cmt_row_version BEFORE UPDATE ON document.commitment FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

CREATE TRIGGER trg_cmt_status_changed BEFORE UPDATE ON document.commitment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_cmt_updated_at BEFORE UPDATE ON document.commitment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_commitment_derive_period BEFORE INSERT OR UPDATE OF document_date, company_code_id ON document.commitment FOR EACH ROW EXECUTE FUNCTION document.commitment_derive_period();

CREATE TRIGGER trg_cl_block_delete_with_active_ad BEFORE DELETE ON document.commitment_line FOR EACH ROW EXECUTE FUNCTION document.fn_cl_block_delete_with_active_ad();

COMMENT ON TRIGGER "trg_cl_block_delete_with_active_ad" ON "document"."commitment_line" IS 'Belt-and-suspenders DB-side guard against orphaning accounting_distribution rows on commitment_line delete. Raises CL011 with sample AD ids when violated.';

CREATE TRIGGER trg_cl_block_delete_with_active_pc BEFORE DELETE ON document.commitment_line FOR EACH ROW EXECUTE FUNCTION document.fn_cl_block_delete_with_active_pc();

COMMENT ON TRIGGER "trg_cl_block_delete_with_active_pc" ON "document"."commitment_line" IS 'Belt-and-suspenders DB-side guard against orphaning pricing_component rows on commitment_line delete. Raises CL012 with sample PC ids when violated.';

CREATE TRIGGER trg_cl_block_delete_with_active_schedule BEFORE DELETE ON document.commitment_line FOR EACH ROW EXECUTE FUNCTION document.fn_cl_block_delete_with_active_schedule();

COMMENT ON TRIGGER "trg_cl_block_delete_with_active_schedule" ON "document"."commitment_line" IS 'Belt-and-suspenders DB-side guard against orphaning schedule_line rows on commitment_line delete. Raises CL010 with sample schedule ids when violated.';

CREATE TRIGGER trg_cl_company_guard BEFORE INSERT OR UPDATE OF item_id, warehouse_id, site_id ON document.commitment_line FOR EACH ROW EXECUTE FUNCTION document.trg_guard_commitment_line_company();

CREATE TRIGGER trg_cl_derive_ship_jurisdictions BEFORE INSERT OR UPDATE OF shipto_address_id, shipfrom_address_id ON document.commitment_line FOR EACH ROW EXECUTE FUNCTION document.trg_cl_derive_ship_jurisdictions();

CREATE TRIGGER trg_cl_updated_at BEFORE UPDATE ON document.commitment_line FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_commitment_line_default_schedule AFTER INSERT ON document.commitment_line FOR EACH ROW EXECUTE FUNCTION document.trg_commitment_line_default_schedule();

CREATE TRIGGER trg_commitment_line_refresh_default_schedule AFTER UPDATE OF quantity, unit_price, required_by_date, currency_code ON document.commitment_line FOR EACH ROW EXECUTE FUNCTION document.trg_commitment_line_refresh_default_schedule();

CREATE TRIGGER trg_compensation_assignment_company_check BEFORE INSERT OR UPDATE OF employment_id, pay_group_id ON document.compensation_assignment FOR EACH ROW EXECUTE FUNCTION document.trg_compensation_assignment_company_check();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.compensation_assignment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.compensation_change FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dn_immutability_guard BEFORE UPDATE ON document.delivery_note FOR EACH ROW WHEN ((old.status = ANY (ARRAY['fully_receipted'::text, 'returned'::text, 'cancelled'::text])) OR old.terminal_status IS NOT NULL) EXECUTE FUNCTION document.trg_dn_immutability_guard();

CREATE TRIGGER trg_dn_row_version BEFORE UPDATE ON document.delivery_note FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

CREATE TRIGGER trg_dn_status_changed BEFORE UPDATE ON document.delivery_note FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_dn_updated_at BEFORE UPDATE ON document.delivery_note FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dr_book_type_lookup BEFORE INSERT OR UPDATE OF book_type ON document.depreciation_run FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_book_type', 'book_type');

CREATE TRIGGER trg_dr_status_changed BEFORE UPDATE ON document.depreciation_run FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_dr_updated_at BEFORE UPDATE ON document.depreciation_run FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_drl_prevent_mutation BEFORE DELETE OR UPDATE ON document.depreciation_run_line FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

CREATE TRIGGER trg_ds_updated_at BEFORE UPDATE ON document.depreciation_schedule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.employee_tax_declaration FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.employee_tax_declaration_line FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.hr_case FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ice_status_changed BEFORE UPDATE ON document.ic_elimination FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ice_updated_at BEFORE UPDATE ON document.ic_elimination FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ica_status_changed BEFORE UPDATE ON document.intercompany_agreement FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ica_updated_at BEFORE UPDATE ON document.intercompany_agreement FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ict_status_changed BEFORE UPDATE ON document.intercompany_transaction FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ict_updated_at BEFORE UPDATE ON document.intercompany_transaction FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_itsnap_immutable BEFORE DELETE OR UPDATE ON document.invoice_tax_snapshot FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

CREATE TRIGGER trg_je_auto_identity BEFORE INSERT ON document.journal_entry FOR EACH ROW EXECUTE FUNCTION document.trg_je_before_insert();

CREATE TRIGGER trg_je_enqueue_cross_book AFTER UPDATE OF status ON document.journal_entry FOR EACH ROW WHEN (new.status = 'posted'::text AND old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION document.trg_je_enqueue_cross_book_fn();

COMMENT ON TRIGGER "trg_je_enqueue_cross_book" ON "document"."journal_entry" IS 'Publishes an idempotent fin outbox request for root-journal cross-book derivation.';

CREATE TRIGGER trg_je_field_audit_log AFTER INSERT OR DELETE OR UPDATE ON document.journal_entry FOR EACH ROW EXECUTE FUNCTION document.trg_je_field_audit_log();

CREATE TRIGGER trg_je_finance_readiness_gate BEFORE UPDATE OF status ON document.journal_entry FOR EACH ROW WHEN (new.status = 'posted'::text AND old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION document.trg_je_finance_readiness_gate_fn();

COMMENT ON TRIGGER "trg_je_finance_readiness_gate" ON "document"."journal_entry" IS 'Blocks production posting without FINANCE_POSTING_READY only for tenants enrolled by feature flag.';

CREATE TRIGGER trg_je_immutability_guard BEFORE UPDATE ON document.journal_entry FOR EACH ROW WHEN (old.status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'posted'::text, 'reversed'::text])) EXECUTE FUNCTION document.trg_je_immutability_guard();

CREATE TRIGGER trg_je_lifecycle_log AFTER UPDATE OF status ON document.journal_entry FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION document.trg_je_lifecycle_log();

CREATE TRIGGER trg_je_period_gate BEFORE INSERT OR UPDATE OF status, posting_date, fiscal_period_id, book_id, company_code_id ON document.journal_entry FOR EACH ROW EXECUTE FUNCTION document.trg_je_period_gate_fn();

COMMENT ON TRIGGER "trg_je_period_gate" ON "document"."journal_entry" IS 'Blocks forward posting unless fiscal and book periods are open/soft_close. Missing book-period rows are treated as future; posted->reversed is exempt.';

CREATE TRIGGER trg_je_source_doc_type_lookup BEFORE INSERT OR UPDATE OF source_doc_type ON document.journal_entry FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.je_source_doc_type', 'source_doc_type');

CREATE TRIGGER trg_je_status_changed BEFORE UPDATE ON document.journal_entry FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_je_status_insert_guard BEFORE INSERT ON document.journal_entry FOR EACH ROW EXECUTE FUNCTION document.trg_je_status_insert_guard();

CREATE TRIGGER trg_je_status_transition_guard BEFORE UPDATE ON document.journal_entry FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION document.trg_je_status_transition_guard();

CREATE TRIGGER trg_je_sync_base_currency BEFORE INSERT OR UPDATE OF company_code_id ON document.journal_entry FOR EACH ROW EXECUTE FUNCTION document.trg_je_sync_base_currency();

CREATE TRIGGER trg_je_sync_fiscal_period BEFORE INSERT OR UPDATE OF fiscal_period_id ON document.journal_entry FOR EACH ROW EXECUTE FUNCTION document.trg_je_sync_fiscal_period();

CREATE TRIGGER trg_je_updated_at BEFORE UPDATE ON document.journal_entry FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_je_workflow_gate BEFORE UPDATE OF status ON document.journal_entry FOR EACH ROW WHEN (new.status = 'posted'::text AND (old.status = ANY (ARRAY['created'::text, 'approved'::text]))) EXECUTE FUNCTION document.trg_je_workflow_gate_fn();

COMMENT ON TRIGGER "trg_je_workflow_gate" ON "document"."journal_entry" IS 'Blocks transition created→posted when a document.workflow_request for the JE has status ''pending'' or ''rejected''. Absence of a request = no workflow required = posting allowed. Depends on: 08_functions/004c_document_finance.sql.';

CREATE TRIGGER trg_jl_check_budget BEFORE INSERT OR UPDATE OF base_debit, gl_account_id, cost_center_id, profit_center_id, project_id ON document.journal_line FOR EACH ROW EXECUTE FUNCTION document.trg_jl_check_budget_fn();

COMMENT ON TRIGGER "trg_jl_check_budget" ON "document"."journal_line" IS 'Checks budget availability for debit journal_lines against the best-matching master.budget_allocation and ledger.budget_balance. Enforces overspend_policy: BLOCK/ESCALATE → hard exception; WARN → non-blocking warning; ALLOW → pass-through. Depends on: 08_functions/004c_document_finance.sql.';

CREATE TRIGGER trg_jl_field_audit_log AFTER INSERT OR DELETE OR UPDATE ON document.journal_line FOR EACH ROW EXECUTE FUNCTION document.trg_jl_field_audit_log();

CREATE TRIGGER trg_jl_immutability_guard BEFORE INSERT OR DELETE OR UPDATE ON document.journal_line FOR EACH ROW EXECUTE FUNCTION document.trg_jl_immutability_guard();

CREATE TRIGGER trg_jl_party_type_lookup BEFORE INSERT OR UPDATE OF party_type ON document.journal_line FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.jl_party_type', 'party_type');

CREATE TRIGGER trg_jl_subledger_type_lookup BEFORE INSERT OR UPDATE OF subledger_type ON document.journal_line FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.jl_subledger_type', 'subledger_type');

CREATE TRIGGER trg_jl_sync_cached_totals AFTER INSERT OR DELETE OR UPDATE ON document.journal_line FOR EACH ROW EXECUTE FUNCTION document.trg_je_sync_cached_totals();

CREATE TRIGGER trg_jl_sync_from_header BEFORE INSERT ON document.journal_line FOR EACH ROW EXECUTE FUNCTION document.trg_journal_line_sync_from_header();

CREATE TRIGGER trg_jl_updated_at BEFORE UPDATE ON document.journal_line FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_jl_validate_dimensions BEFORE INSERT OR UPDATE OF cost_center_id, profit_center_id, project_id, site_id ON document.journal_line FOR EACH ROW EXECUTE FUNCTION document.trg_jl_validate_dimensions_fn();

COMMENT ON TRIGGER "trg_jl_validate_dimensions" ON "document"."journal_line" IS 'Validates cost_center_id, profit_center_id, and project_id against their master tables: must be active (is_active=true) and within valid_from/valid_to window relative to the JL posting_date. Depends on: 08_functions/004c_document_finance.sql.';

CREATE TRIGGER trg_jl_validate_party BEFORE INSERT OR UPDATE OF party_type, party_id ON document.journal_line FOR EACH ROW WHEN (new.party_type IS NOT NULL) EXECUTE FUNCTION document.trg_jl_validate_party();

CREATE TRIGGER trg_jl_validate_posting_controls BEFORE INSERT OR UPDATE OF gl_account_id, company_code_id ON document.journal_line FOR EACH ROW EXECUTE FUNCTION document.trg_jl_validate_posting_controls_fn();

COMMENT ON TRIGGER "trg_jl_validate_posting_controls" ON "document"."journal_line" IS 'Validates posting_allowed, blocked_for_manual, blocked_for_auto against master.company_code_gl_account before accepting a journal line.';

CREATE TRIGGER trg_jlr_append_only_guard BEFORE DELETE OR UPDATE ON document.journal_line_reference FOR EACH ROW EXECUTE FUNCTION document.trg_jlr_append_only_guard();

CREATE TRIGGER trg_jlr_doc_type_lookup BEFORE INSERT OR UPDATE OF ref_doc_type ON document.journal_line_reference FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.jlr_ref_doc_type', 'ref_doc_type');

CREATE TRIGGER trg_jlr_ref_type_lookup BEFORE INSERT OR UPDATE OF ref_type ON document.journal_line_reference FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.jlr_ref_type', 'ref_type');

CREATE TRIGGER trg_people_leave_balance_append_only BEFORE DELETE OR UPDATE ON document.leave_balance_entry FOR EACH ROW EXECUTE FUNCTION document.trg_people_leave_balance_append_only();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.leave_balance_entry FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_leave_request_no_overlap BEFORE INSERT OR UPDATE OF employee_id, start_date, end_date, status ON document.leave_request FOR EACH ROW EXECUTE FUNCTION document.trg_people_leave_request_no_overlap();

CREATE TRIGGER trg_people_status_changed BEFORE UPDATE ON document.leave_request FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.leave_request FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_imc_rollup_exceptions AFTER INSERT OR DELETE OR UPDATE ON document.match_exception FOR EACH ROW EXECUTE FUNCTION document.fn_imc_rollup_exceptions();

CREATE TRIGGER trg_nb_status_changed BEFORE UPDATE ON document.netting_batch FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_nb_updated_at BEFORE UPDATE ON document.netting_batch FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_oh_status_changed BEFORE UPDATE ON document.obligation_horizon FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_oh_updated_at BEFORE UPDATE ON document.obligation_horizon FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.offboarding_case FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.onboarding_case FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_payment_amount_reconciliation AFTER UPDATE OF status ON document.payment_entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (document.fn_pe_cash_effective(new.status, new.is_voided) = true AND document.fn_pe_cash_effective(old.status, old.is_voided) = false) EXECUTE FUNCTION document.fn_payment_amount_reconciliation();

CREATE TRIGGER trg_pe_before_insert BEFORE INSERT ON document.payment_entry FOR EACH ROW EXECUTE FUNCTION document.trg_pe_before_insert();

CREATE TRIGGER trg_pe_status_changed BEFORE UPDATE ON document.payment_entry FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE CONSTRAINT TRIGGER trg_pe_status_overalloc_check AFTER UPDATE OF status ON document.payment_entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION document.fn_pe_status_transition_overalloc_check();

CREATE TRIGGER trg_pe_updated_at BEFORE UPDATE ON document.payment_entry FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pea_allocation_guard BEFORE INSERT OR UPDATE OF payment_entry_id, purchase_invoice_id, commitment_id, advance_recovery_amount, retention_amount ON document.payment_entry_allocation FOR EACH ROW EXECUTE FUNCTION document.trg_guard_payment_allocation();

CREATE TRIGGER trg_pea_immutable BEFORE DELETE OR UPDATE ON document.payment_entry_allocation FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

CREATE TRIGGER trg_pea_netting_count_guard_ins AFTER INSERT ON document.payment_entry_allocation REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION document.trg_guard_netting_allocation_count();

CREATE TRIGGER trg_pea_netting_count_guard_upd AFTER UPDATE ON document.payment_entry_allocation REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION document.trg_guard_netting_allocation_count();

CREATE CONSTRAINT TRIGGER trg_pea_no_over_allocation AFTER INSERT ON document.payment_entry_allocation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION document.fn_pea_no_over_allocation();

CREATE TRIGGER trg_pta_pc_term_clause_alignment BEFORE INSERT OR UPDATE OF pricing_component_id, clause_type ON document.payment_term_application FOR EACH ROW EXECUTE FUNCTION document.fn_pta_pc_term_clause_alignment();

COMMENT ON TRIGGER "trg_pta_pc_term_clause_alignment" ON "document"."payment_term_application" IS 'Ensures PTA.clause_type aligns with source PC.term_type. Allows retention → RETENTION/RETENTION_RELEASE only today. Withholding rejected pending PTA enum extension.';

CREATE TRIGGER trg_pta_updated_at BEFORE UPDATE ON document.payment_term_application FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ptdr_immutable BEFORE DELETE OR UPDATE ON document.payment_term_discount_result FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

CREATE TRIGGER trg_people_payroll_period_one_open BEFORE INSERT OR UPDATE OF pay_group_id, period_number, status ON document.payroll_period FOR EACH ROW EXECUTE FUNCTION document.trg_people_payroll_period_one_open();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.payroll_period FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_payroll_result_immutable BEFORE DELETE OR UPDATE ON document.payroll_result FOR EACH ROW EXECUTE FUNCTION document.trg_people_payroll_result_immutable();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.payroll_result FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_payroll_result_line_immutable BEFORE DELETE OR UPDATE ON document.payroll_result_line FOR EACH ROW EXECUTE FUNCTION document.trg_people_payroll_result_line_immutable();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.payroll_result_line FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.payroll_run FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.payroll_run_employee FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.people_request FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.policy_acknowledgment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pc_row_version BEFORE UPDATE ON document.pricing_component FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

COMMENT ON TRIGGER "trg_pc_row_version" ON "document"."pricing_component" IS 'Increments row_version on every UPDATE to pricing_component. Includes supersede writes (which only mutate the supersede tuple).';

CREATE TRIGGER trg_pc_supersede_only_update BEFORE UPDATE ON document.pricing_component FOR EACH ROW EXECUTE FUNCTION document.fn_pc_supersede_only_update();

COMMENT ON TRIGGER "trg_pc_supersede_only_update" ON "document"."pricing_component" IS 'In draft/rejected: free edits. In approval-stream states: only supersede tuple may mutate. In terminal states: all edits blocked.';

CREATE TRIGGER trg_pc_validate_polymorphic_source BEFORE INSERT OR UPDATE OF source_doc_type, source_doc_id, source_line_id ON document.pricing_component FOR EACH ROW EXECUTE FUNCTION document.fn_pc_validate_polymorphic_source();

COMMENT ON TRIGGER "trg_pc_validate_polymorphic_source" ON "document"."pricing_component" IS 'Validates polymorphic source resolves to an existing parent (PI or PIL) per source_doc_type / source_doc_id / source_line_id, with matching tenant_id.';

CREATE TRIGGER trg_pi_before_insert BEFORE INSERT ON document.purchase_invoice FOR EACH ROW EXECUTE FUNCTION document.trg_pi_before_insert();

CREATE TRIGGER trg_pi_default_requested_by BEFORE INSERT ON document.purchase_invoice FOR EACH ROW EXECUTE FUNCTION shared.trg_default_requested_by();

CREATE TRIGGER trg_pi_derive_dates BEFORE INSERT OR UPDATE OF supplier_invoice_date, baseline_date, posting_date, payment_term_id, company_code_id ON document.purchase_invoice FOR EACH ROW EXECUTE FUNCTION document.trg_pi_derive_dates();

CREATE TRIGGER trg_pi_immutability_guard BEFORE UPDATE ON document.purchase_invoice FOR EACH ROW WHEN (old.status = ANY (ARRAY['posted'::text, 'reversed'::text, 'cancelled'::text, 'fully_paid'::text, 'rejected'::text])) EXECUTE FUNCTION document.trg_pi_immutability_guard();

CREATE TRIGGER trg_pi_lifecycle_log AFTER UPDATE OF status ON document.purchase_invoice FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION document.trg_pi_lifecycle_log();

COMMENT ON TRIGGER "trg_pi_lifecycle_log" ON "document"."purchase_invoice" IS 'Appends a lifecycle checkpoint row to log.entity_lifecycle_log on every status change. Carries a compact header snapshot in payload.snapshot for the Versions tab UI. Increments revision_no each time status transitions to ''amending''.';

CREATE TRIGGER trg_pi_row_version BEFORE UPDATE ON document.purchase_invoice FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

COMMENT ON TRIGGER "trg_pi_row_version" ON "document"."purchase_invoice" IS 'Increments row_version on every UPDATE to purchase_invoice, including updates triggered by trg_pil_sync_header when lines change. This is intentional: any mutation to the invoice aggregate (header or lines) advances the version so a concurrently open header-save sees the conflict and returns 409.';

CREATE TRIGGER trg_pi_status_changed BEFORE UPDATE ON document.purchase_invoice FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_pi_status_guard BEFORE UPDATE OF status ON document.purchase_invoice FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION document.trg_pi_status_guard();

COMMENT ON TRIGGER "trg_pi_status_guard" ON "document"."purchase_invoice" IS 'Validates status transitions against snapshot.status_route compiled_json. Falls through to allow if no compiled snapshot exists (lifecycle not yet seeded).';

CREATE TRIGGER trg_pi_updated_at BEFORE UPDATE ON document.purchase_invoice FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pil_block_delete_with_active_pc AFTER DELETE ON document.purchase_invoice_line FOR EACH ROW EXECUTE FUNCTION document.fn_pil_block_delete_with_active_pc();

COMMENT ON TRIGGER "trg_pil_block_delete_with_active_pc" ON "document"."purchase_invoice_line" IS 'Belt-and-suspenders DB-side guard against orphaning PC rows on line delete. Raises PC005 with sample PC ids when violated.';

CREATE TRIGGER trg_pil_derive_ship_jurisdictions BEFORE INSERT OR UPDATE OF shipto_address_id, shipfrom_address_id ON document.purchase_invoice_line FOR EACH ROW EXECUTE FUNCTION document.trg_pil_derive_ship_jurisdictions();

COMMENT ON TRIGGER "trg_pil_derive_ship_jurisdictions" ON "document"."purchase_invoice_line" IS 'Stamps to_/from_tax_jurisdiction_id from the chosen shipto_/shipfrom_address_id. Address jurisdiction itself comes from country + region via trg_address_derive_jurisdiction (master/06_triggers.sql).';

CREATE TRIGGER trg_pil_freeze_jurisdiction_snapshot BEFORE UPDATE OF site_id, shipto_address_id, to_tax_jurisdiction_id, shipfrom_address_id, from_tax_jurisdiction_id, tax_group_id ON document.purchase_invoice_line FOR EACH ROW EXECUTE FUNCTION document.trg_pil_freeze_jurisdiction_snapshot();

CREATE TRIGGER trg_pil_immutability_guard BEFORE INSERT OR DELETE OR UPDATE ON document.purchase_invoice_line FOR EACH ROW EXECUTE FUNCTION document.trg_pil_immutability_guard();

CREATE TRIGGER trg_pil_row_version BEFORE UPDATE ON document.purchase_invoice_line FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

COMMENT ON TRIGGER "trg_pil_row_version" ON "document"."purchase_invoice_line" IS 'Increments row_version on every UPDATE to purchase_invoice_line. Pairs with bulk PATCH /api/finance/ap/invoices/:id/lines — each line carries expected_row_version; mismatch → 409 RESOURCE_VERSION_CONFLICT.';

CREATE TRIGGER trg_pil_sync_header AFTER INSERT OR DELETE OR UPDATE ON document.purchase_invoice_line FOR EACH ROW EXECUTE FUNCTION document.trg_pil_sync_header();

COMMENT ON TRIGGER "trg_pil_sync_header" ON "document"."purchase_invoice_line" IS 'Calls fn_refresh_purchase_invoice_totals after every line change. Keeps line_count, subtotal_amount, tax_amount, total_amount in sync on the header.';

CREATE TRIGGER trg_pil_updated_at BEFORE UPDATE ON document.purchase_invoice_line FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_purchase_order_view_delete INSTEAD OF DELETE ON document.purchase_order FOR EACH ROW EXECUTE FUNCTION document.purchase_order_view_delete();

CREATE TRIGGER trg_purchase_order_view_insert INSTEAD OF INSERT ON document.purchase_order FOR EACH ROW EXECUTE FUNCTION document.purchase_order_view_insert();

CREATE TRIGGER trg_purchase_order_view_update INSTEAD OF UPDATE ON document.purchase_order FOR EACH ROW EXECUTE FUNCTION document.purchase_order_view_update();

CREATE TRIGGER trg_poc_immutability_guard BEFORE UPDATE ON document.purchase_order_confirmation FOR EACH ROW WHEN ((old.status = ANY (ARRAY['rejected'::text, 'cancelled'::text, 'changes_rejected'::text])) OR old.terminal_status IS NOT NULL) EXECUTE FUNCTION document.trg_poc_immutability_guard();

CREATE TRIGGER trg_poc_row_version BEFORE UPDATE ON document.purchase_order_confirmation FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

CREATE TRIGGER trg_poc_status_changed BEFORE UPDATE ON document.purchase_order_confirmation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_poc_updated_at BEFORE UPDATE ON document.purchase_order_confirmation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_pocl_row_version BEFORE UPDATE ON document.purchase_order_confirmation_line FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

CREATE TRIGGER trg_pr_default_requested_by BEFORE INSERT ON document.purchase_requisition FOR EACH ROW EXECUTE FUNCTION shared.trg_default_requested_by();

CREATE TRIGGER trg_pr_immutability_guard BEFORE UPDATE ON document.purchase_requisition FOR EACH ROW WHEN ((old.status = ANY (ARRAY['rejected'::text, 'fully_converted'::text, 'closed'::text, 'cancelled'::text])) OR old.terminal_status IS NOT NULL) EXECUTE FUNCTION document.trg_pr_immutability_guard();

CREATE TRIGGER trg_pr_row_version BEFORE UPDATE ON document.purchase_requisition FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

CREATE TRIGGER trg_pr_line_default_schedule AFTER INSERT ON document.purchase_requisition_line FOR EACH ROW EXECUTE FUNCTION document.trg_pr_line_default_schedule();

CREATE TRIGGER trg_pr_line_refresh_default_schedule AFTER UPDATE OF quantity, required_by_date, currency_code ON document.purchase_requisition_line FOR EACH ROW EXECUTE FUNCTION document.trg_pr_line_refresh_default_schedule();

CREATE TRIGGER trg_rcp_default_requested_by BEFORE INSERT ON document.receipt FOR EACH ROW EXECUTE FUNCTION shared.trg_default_requested_by();

CREATE TRIGGER trg_rcp_immutability_guard BEFORE UPDATE ON document.receipt FOR EACH ROW WHEN ((old.status = ANY (ARRAY['posted'::text, 'reversed'::text, 'cancelled'::text])) OR old.terminal_status IS NOT NULL) EXECUTE FUNCTION document.trg_rcp_immutability_guard();

CREATE TRIGGER trg_rcp_row_version BEFORE UPDATE ON document.receipt FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

COMMENT ON TRIGGER "trg_rcp_row_version" ON "document"."receipt" IS 'Increments row_version on every UPDATE to receipt. Optimistic-lock saves pass expected_row_version in WHERE; mismatched version yields 0 rows -> 409.';

CREATE TRIGGER trg_rcp_status_changed BEFORE UPDATE ON document.receipt FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_rcp_updated_at BEFORE UPDATE ON document.receipt FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_rcpl_company_guard BEFORE INSERT OR UPDATE OF item_id, warehouse_id ON document.receipt_line FOR EACH ROW EXECUTE FUNCTION document.trg_guard_gr_line_company();

CREATE TRIGGER trg_schedule_line_fulfilled_from_rcpl AFTER INSERT OR DELETE OR UPDATE OF received_quantity, accepted_quantity, rejected_quantity, commitment_line_id ON document.receipt_line FOR EACH ROW EXECUTE FUNCTION document.trg_schedule_line_fulfilled_from_rcpl();

CREATE TRIGGER trg_render_job_updated_at BEFORE UPDATE ON document.render_job FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_render_output_updated_at BEFORE UPDATE ON document.render_output FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_render_output_validate_manifest BEFORE INSERT OR UPDATE OF manifest_json ON document.render_output FOR EACH ROW EXECUTE FUNCTION document.trg_validate_manifest_json();

CREATE TRIGGER trg_schl_updated_at BEFORE UPDATE ON document.schedule_line FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_seed_gift_athq_only BEFORE INSERT OR UPDATE OF tenant_id, company_code_id ON document.seed_gift FOR EACH ROW EXECUTE FUNCTION document.trg_seed_gift_athq_only();

CREATE TRIGGER trg_ssh_default_requested_by BEFORE INSERT ON document.service_sheet FOR EACH ROW EXECUTE FUNCTION shared.trg_default_requested_by();

CREATE TRIGGER trg_ssh_immutability_guard BEFORE UPDATE ON document.service_sheet FOR EACH ROW WHEN ((old.status = ANY (ARRAY['posted'::text, 'reversed'::text, 'cancelled'::text])) OR old.terminal_status IS NOT NULL) EXECUTE FUNCTION document.trg_ssh_immutability_guard();

CREATE TRIGGER trg_ssh_row_version BEFORE UPDATE ON document.service_sheet FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

COMMENT ON TRIGGER "trg_ssh_row_version" ON "document"."service_sheet" IS 'Increments row_version on every UPDATE to service_sheet.';

CREATE TRIGGER trg_ssh_status_changed BEFORE UPDATE ON document.service_sheet FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_ssh_updated_at BEFORE UPDATE ON document.service_sheet FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_schedule_line_fulfilled_from_sshl AFTER INSERT OR DELETE OR UPDATE OF quantity, commitment_line_id ON document.service_sheet_line FOR EACH ROW EXECUTE FUNCTION document.trg_schedule_line_fulfilled_from_sshl();

CREATE TRIGGER trg_sshl_company_guard BEFORE INSERT OR UPDATE OF item_id ON document.service_sheet_line FOR EACH ROW EXECUTE FUNCTION document.trg_guard_ses_line_company();

CREATE TRIGGER trg_sshl_derive_ship_jurisdictions BEFORE INSERT OR UPDATE OF shipto_address_id, shipfrom_address_id ON document.service_sheet_line FOR EACH ROW EXECUTE FUNCTION document.trg_sshl_derive_ship_jurisdictions();

CREATE TRIGGER trg_people_status_changed BEFORE UPDATE ON document.shift_assignment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.shift_assignment FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_st_status_changed BEFORE UPDATE OF status ON document.stocktake FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_st_updated_at BEFORE UPDATE ON document.stocktake FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_stl_denorm_counts AFTER INSERT OR DELETE OR UPDATE ON document.stocktake_line FOR EACH ROW EXECUTE FUNCTION document.trg_stocktake_line_denorm_counts();

CREATE TRIGGER trg_stl_updated_at BEFORE UPDATE ON document.stocktake_line FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_srq_immutable BEFORE DELETE OR UPDATE ON document.supplier_rebuild_orphan_quarantine FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

COMMENT ON TRIGGER "trg_srq_immutable" ON "document"."supplier_rebuild_orphan_quarantine" IS 'Append-only: the quarantine is an audit log of orphans seen at supplier rebuild. Rows are inserted only; UPDATE and DELETE are blocked via log.trg_prevent_mutation().';

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.time_punch FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_upupr_audit AFTER INSERT OR UPDATE ON document.user_profile_update_request FOR EACH ROW EXECUTE FUNCTION document.trg_upupr_audit();

CREATE TRIGGER trg_upupr_before_insert BEFORE INSERT ON document.user_profile_update_request FOR EACH ROW EXECUTE FUNCTION document.trg_upupr_before_insert();

CREATE TRIGGER trg_upupr_lifecycle_log AFTER UPDATE OF status ON document.user_profile_update_request FOR EACH ROW EXECUTE FUNCTION document.trg_upupr_lifecycle_log();

CREATE TRIGGER trg_upupr_status_change BEFORE UPDATE OF status ON document.user_profile_update_request FOR EACH ROW EXECUTE FUNCTION document.trg_upupr_status_change();

CREATE TRIGGER trg_whtc_updated_at BEFORE UPDATE ON document.wht_certificate FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
