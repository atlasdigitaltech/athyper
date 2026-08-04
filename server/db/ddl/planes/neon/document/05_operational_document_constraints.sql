-- Tenant boundary and referential integrity for operational documents.

ALTER TABLE document.asset_transaction
    ADD CONSTRAINT asset_transaction_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_asset_fk FOREIGN KEY(tenant_id,asset_id) REFERENCES master.asset(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_asset_book_fk FOREIGN KEY(tenant_id,asset_book_id) REFERENCES master.asset_book(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_period_fk FOREIGN KEY(tenant_id,company_code_id,fiscal_year,period_number) REFERENCES master.fiscal_period(tenant_id,company_code_id,fiscal_year,period_number) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_journal_fk FOREIGN KEY(tenant_id,reference_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_run_fk FOREIGN KEY(tenant_id,depreciation_run_id) REFERENCES document.depreciation_run(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_run_line_fk FOREIGN KEY(tenant_id,depreciation_run_line_id) REFERENCES document.depreciation_run_line(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT asset_transaction_reversal_fk FOREIGN KEY(tenant_id,reversal_of_id) REFERENCES document.asset_transaction(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.fx_revaluation_run
    ADD CONSTRAINT fx_revaluation_run_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_book_fk FOREIGN KEY(tenant_id,book_id) REFERENCES master.ledger_book(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_period_fk FOREIGN KEY(tenant_id,company_code_id,fiscal_year,period_number) REFERENCES master.fiscal_period(tenant_id,company_code_id,fiscal_year,period_number) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_currency_fk FOREIGN KEY(functional_currency) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_journal_fk FOREIGN KEY(tenant_id,revaluation_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT fx_revaluation_run_reversal_journal_fk FOREIGN KEY(tenant_id,reversal_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.intercompany_agreement
    ADD CONSTRAINT intercompany_agreement_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_source_company_fk FOREIGN KEY(tenant_id,source_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_dest_company_fk FOREIGN KEY(tenant_id,dest_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_base_currency_fk FOREIGN KEY(base_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_supersedes_fk FOREIGN KEY(tenant_id,supersedes_id) REFERENCES document.intercompany_agreement(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_cost_center_fk FOREIGN KEY(tenant_id,cost_center_id) REFERENCES master.cost_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_profit_center_fk FOREIGN KEY(tenant_id,profit_center_id) REFERENCES master.profit_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_project_fk FOREIGN KEY(tenant_id,project_id) REFERENCES master.project(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_site_fk FOREIGN KEY(tenant_id,site_id) REFERENCES master.site(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_dimension_fk FOREIGN KEY(tenant_id,dimension_set_id) REFERENCES master.dimension_set(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_owner_fk FOREIGN KEY(tenant_id,agreement_owner_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_agreement_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.netting_batch
    ADD CONSTRAINT netting_batch_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_company_a_fk FOREIGN KEY(tenant_id,company_code_a_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_company_b_fk FOREIGN KEY(tenant_id,company_code_b_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_period_fk FOREIGN KEY(tenant_id,company_code_id,fiscal_year,period_number) REFERENCES master.fiscal_period(tenant_id,company_code_id,fiscal_year,period_number) ON DELETE RESTRICT,
    ADD CONSTRAINT netting_batch_journal_fk FOREIGN KEY(tenant_id,settlement_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.intercompany_transaction
    ADD CONSTRAINT intercompany_transaction_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_source_company_fk FOREIGN KEY(tenant_id,source_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_dest_company_fk FOREIGN KEY(tenant_id,dest_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_base_currency_fk FOREIGN KEY(base_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_agreement_fk FOREIGN KEY(tenant_id,agreement_id) REFERENCES document.intercompany_agreement(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_source_journal_fk FOREIGN KEY(tenant_id,source_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_dest_journal_fk FOREIGN KEY(tenant_id,dest_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_mirror_fk FOREIGN KEY(tenant_id,mirror_txn_id) REFERENCES document.intercompany_transaction(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_netting_fk FOREIGN KEY(tenant_id,netting_batch_id) REFERENCES document.netting_batch(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_period_fk FOREIGN KEY(tenant_id,company_code_id,fiscal_year,period_number) REFERENCES master.fiscal_period(tenant_id,company_code_id,fiscal_year,period_number) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_cost_center_fk FOREIGN KEY(tenant_id,cost_center_id) REFERENCES master.cost_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_profit_center_fk FOREIGN KEY(tenant_id,profit_center_id) REFERENCES master.profit_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_project_fk FOREIGN KEY(tenant_id,project_id) REFERENCES master.project(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_site_fk FOREIGN KEY(tenant_id,site_id) REFERENCES master.site(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_transaction_dimension_fk FOREIGN KEY(tenant_id,dimension_set_id) REFERENCES master.dimension_set(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.ic_elimination
    ADD CONSTRAINT ic_elimination_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_source_company_fk FOREIGN KEY(tenant_id,source_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_counterparty_company_fk FOREIGN KEY(tenant_id,counterparty_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_book_fk FOREIGN KEY(tenant_id,book_id) REFERENCES master.ledger_book(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_period_fk FOREIGN KEY(tenant_id,company_code_id,fiscal_year,period_number) REFERENCES master.fiscal_period(tenant_id,company_code_id,fiscal_year,period_number) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_functional_currency_fk FOREIGN KEY(functional_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_transaction_fk FOREIGN KEY(tenant_id,ic_transaction_id) REFERENCES document.intercompany_transaction(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_journal_fk FOREIGN KEY(tenant_id,je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT ic_elimination_reversal_journal_fk FOREIGN KEY(tenant_id,reversal_je_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.match_exception
    ADD CONSTRAINT match_exception_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT match_exception_case_fk FOREIGN KEY(tenant_id,invoice_match_case_id) REFERENCES document.invoice_match_case(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT match_exception_line_fk FOREIGN KEY(tenant_id,invoice_line_id) REFERENCES document.purchase_invoice_line(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT match_exception_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT match_exception_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.obligation_horizon
    ADD CONSTRAINT obligation_horizon_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_commitment_fk FOREIGN KEY(tenant_id,commitment_id) REFERENCES document.commitment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_schedule_fk FOREIGN KEY(tenant_id,schedule_id) REFERENCES document.schedule_line(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_intent_fk FOREIGN KEY(tenant_id,intent_id) REFERENCES master.business_intent(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT obligation_horizon_contract_currency_fk FOREIGN KEY(contract_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;

ALTER TABLE document.render_output
    ADD CONSTRAINT render_output_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT render_output_template_fk FOREIGN KEY(tenant_id,template_version_id) REFERENCES snapshot.template_version(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT render_output_letterhead_fk FOREIGN KEY(tenant_id,letterhead_id) REFERENCES master.letterhead(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT render_output_brand_fk FOREIGN KEY(tenant_id,brand_profile_id) REFERENCES master.brand_profile(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT render_output_replaces_fk FOREIGN KEY(tenant_id,replaces_output_id) REFERENCES document.render_output(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT render_output_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.import_request_chunk
    ADD CONSTRAINT import_request_chunk_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT import_request_chunk_request_fk FOREIGN KEY(tenant_id,import_request_id) REFERENCES document.import_request(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT import_request_chunk_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT import_request_chunk_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT import_request_chunk_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.payment_remittance_output
    ADD CONSTRAINT payment_remittance_output_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_remittance_output_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_remittance_output_payment_fk FOREIGN KEY(tenant_id,payment_entry_id) REFERENCES document.payment_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_remittance_output_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES master.supplier(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_remittance_output_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_remittance_output_render_fk FOREIGN KEY(tenant_id,render_output_id) REFERENCES document.render_output(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.payment_term_discount_result
    ADD CONSTRAINT payment_term_discount_result_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_payment_fk FOREIGN KEY(tenant_id,payment_id) REFERENCES document.payment_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_invoice_fk FOREIGN KEY(tenant_id,invoice_id) REFERENCES document.purchase_invoice(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_commitment_fk FOREIGN KEY(tenant_id,commitment_id) REFERENCES document.commitment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_term_fk FOREIGN KEY(tenant_id,payment_term_id) REFERENCES master.payment_term(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_tier_fk FOREIGN KEY(tenant_id,discount_tier_id) REFERENCES master.payment_term_discount_tier(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payment_term_discount_result_reverses_fk FOREIGN KEY(tenant_id,reverses_id) REFERENCES document.payment_term_discount_result(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.wht_certificate
    ADD CONSTRAINT wht_certificate_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT wht_certificate_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT wht_certificate_counterparty_fk FOREIGN KEY(tenant_id,counterparty_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT wht_certificate_tax_type_fk FOREIGN KEY(tenant_id,tax_type_id) REFERENCES master.tax_type(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT wht_certificate_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT wht_certificate_superseded_fk FOREIGN KEY(tenant_id,superseded_by_id) REFERENCES document.wht_certificate(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.import_request
    ADD CONSTRAINT import_request_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT user_profile_update_request_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT user_profile_update_request_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT;

-- Header/line ownership was intentionally deferred until these headers moved.
ALTER TABLE ledger.fx_revaluation_line
    ADD CONSTRAINT fx_revaluation_line_run_fk FOREIGN KEY(tenant_id,run_id) REFERENCES document.fx_revaluation_run(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE ledger.ic_elimination_line
    ADD CONSTRAINT ic_elimination_line_header_fk FOREIGN KEY(tenant_id,elimination_id) REFERENCES document.ic_elimination(tenant_id,id) ON DELETE RESTRICT;

-- Every actor reference is tenant-scoped; nullable actors are accepted by FK semantics.
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('asset_transaction','performed_by'),('asset_transaction','posted_by'),('asset_transaction','status_changed_by'),('asset_transaction','created_by'),('asset_transaction','updated_by'),
        ('fx_revaluation_run','status_changed_by'),('fx_revaluation_run','created_by'),('fx_revaluation_run','updated_by'),
        ('intercompany_agreement','approved_by'),('intercompany_agreement','status_changed_by'),('intercompany_agreement','created_by'),('intercompany_agreement','updated_by'),
        ('intercompany_transaction','posted_by'),('intercompany_transaction','status_changed_by'),('intercompany_transaction','created_by'),('intercompany_transaction','updated_by'),
        ('ic_elimination','approved_by'),('ic_elimination','posted_by'),('ic_elimination','status_changed_by'),('ic_elimination','created_by'),('ic_elimination','updated_by'),
        ('match_exception','resolved_by'),('match_exception','created_by'),('match_exception','updated_by'),
        ('netting_batch','settled_by'),('netting_batch','approved_by'),('netting_batch','status_changed_by'),('netting_batch','created_by'),('netting_batch','updated_by'),
        ('obligation_horizon','status_changed_by'),('obligation_horizon','created_by'),('obligation_horizon','updated_by'),
        ('payment_remittance_output','created_by'),('payment_remittance_output','updated_by'),
        ('payment_term_discount_result','created_by'),
        ('wht_certificate','issued_by'),('wht_certificate','voided_by'),('wht_certificate','created_by'),('wht_certificate','updated_by'),
        ('import_request','submitted_by'),('import_request','created_by'),('import_request','updated_by'),
        ('render_output','revoked_by'),('render_output','last_replayed_by'),('render_output','status_changed_by'),('render_output','created_by'),('render_output','updated_by'),
        ('user_profile_update_request','created_by'),('user_profile_update_request','requested_by'),('user_profile_update_request','principal_id'),('user_profile_update_request','status_changed_by'),('user_profile_update_request','updated_by')
    ) AS x(table_name,column_name)
    LOOP
        EXECUTE format(
            'ALTER TABLE document.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id,%I) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT',
            r.table_name, r.table_name || '_' || r.column_name || '_fk', r.column_name
        );
    END LOOP;
END $$;
