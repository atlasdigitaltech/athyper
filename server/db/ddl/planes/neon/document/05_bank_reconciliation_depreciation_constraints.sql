ALTER TABLE document.bank_statement
    ADD CONSTRAINT bank_statement_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_account_fk FOREIGN KEY (tenant_id, bank_account_id) REFERENCES master.bank_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_signed_by_fk FOREIGN KEY (tenant_id, signed_off_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.bank_statement_line
    ADD CONSTRAINT bank_statement_line_header_fk FOREIGN KEY (tenant_id, bank_statement_id) REFERENCES document.bank_statement (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT bank_statement_line_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_statement_line_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.bank_recon_case
    ADD CONSTRAINT bank_recon_case_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_account_fk FOREIGN KEY (tenant_id, bank_account_id) REFERENCES master.bank_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_journal_fk FOREIGN KEY (tenant_id, sign_off_journal_entry_id) REFERENCES document.journal_entry (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_signed_by_fk FOREIGN KEY (tenant_id, signed_off_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_voided_by_fk FOREIGN KEY (tenant_id, voided_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.bank_recon_case_line
    ADD CONSTRAINT bank_recon_case_line_case_fk FOREIGN KEY (tenant_id, bank_recon_case_id) REFERENCES document.bank_recon_case (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT bank_recon_case_line_payment_fk FOREIGN KEY (tenant_id, payment_entry_id) REFERENCES document.payment_entry (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_line_statement_fk FOREIGN KEY (tenant_id, bank_statement_line_id) REFERENCES document.bank_statement_line (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_recon_case_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.depreciation_run
    ADD CONSTRAINT depreciation_run_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_book_fk FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_reversal_fk FOREIGN KEY (tenant_id, reversal_of_run_id) REFERENCES document.depreciation_run (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_journal_fk FOREIGN KEY (tenant_id, reference_journal_entry_id) REFERENCES document.journal_entry (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_started_by_fk FOREIGN KEY (tenant_id, started_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_completed_by_fk FOREIGN KEY (tenant_id, completed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_posted_by_fk FOREIGN KEY (tenant_id, posted_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.depreciation_run_line
    ADD CONSTRAINT depreciation_run_line_run_fk FOREIGN KEY (tenant_id, run_id) REFERENCES document.depreciation_run (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT depreciation_run_line_asset_fk FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_book_fk FOREIGN KEY (tenant_id, asset_book_id) REFERENCES master.asset_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_schedule_fk FOREIGN KEY (tenant_id, depreciation_schedule_id) REFERENCES document.depreciation_schedule (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_reversal_fk FOREIGN KEY (tenant_id, reversal_of_line_id) REFERENCES document.depreciation_run_line (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_posted_by_fk FOREIGN KEY (tenant_id, posted_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_run_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.depreciation_schedule
    ADD CONSTRAINT depreciation_schedule_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_asset_fk FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_book_fk FOREIGN KEY (tenant_id, asset_book_id) REFERENCES master.asset_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_actual_line_fk FOREIGN KEY (tenant_id, actual_run_line_id) REFERENCES document.depreciation_run_line (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT depreciation_schedule_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
