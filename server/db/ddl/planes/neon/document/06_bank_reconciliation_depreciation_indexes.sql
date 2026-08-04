CREATE UNIQUE INDEX bank_statement_source_hash_uq
    ON document.bank_statement (tenant_id, bank_account_id, source_hash)
    WHERE source_hash IS NOT NULL;
CREATE INDEX bank_statement_account_period_idx
    ON document.bank_statement (tenant_id, bank_account_id, period_end_date DESC, status);
CREATE INDEX bank_statement_company_status_idx
    ON document.bank_statement (tenant_id, company_code_id, status, period_end_date DESC);
CREATE INDEX bank_statement_signed_by_idx
    ON document.bank_statement (tenant_id, signed_off_by) WHERE signed_off_by IS NOT NULL;
CREATE INDEX bank_statement_line_date_amount_idx
    ON document.bank_statement_line (tenant_id, bank_statement_id, transaction_date, amount);
CREATE INDEX bank_statement_line_unmatched_idx
    ON document.bank_statement_line (tenant_id, bank_statement_id, transaction_date)
    WHERE recon_status IN ('unmatched', 'partially_matched', 'exception');

CREATE INDEX bank_recon_case_account_status_idx
    ON document.bank_recon_case (tenant_id, bank_account_id, status, created_at DESC);
CREATE INDEX bank_recon_case_company_status_idx
    ON document.bank_recon_case (tenant_id, company_code_id, status, created_at DESC);
CREATE INDEX bank_recon_case_journal_idx
    ON document.bank_recon_case (tenant_id, sign_off_journal_entry_id)
    WHERE sign_off_journal_entry_id IS NOT NULL;
CREATE INDEX bank_recon_case_line_case_idx
    ON document.bank_recon_case_line (tenant_id, bank_recon_case_id, side);
CREATE INDEX bank_recon_case_line_payment_idx
    ON document.bank_recon_case_line (tenant_id, payment_entry_id)
    WHERE payment_entry_id IS NOT NULL;
CREATE INDEX bank_recon_case_line_statement_idx
    ON document.bank_recon_case_line (tenant_id, bank_statement_line_id)
    WHERE bank_statement_line_id IS NOT NULL;

CREATE INDEX depreciation_run_period_status_idx
    ON document.depreciation_run (tenant_id, company_code_id, ledger_book_id, fiscal_period_id, status);
CREATE INDEX depreciation_run_book_fk_idx
    ON document.depreciation_run (tenant_id, ledger_book_id);
CREATE INDEX depreciation_run_period_fk_idx
    ON document.depreciation_run (tenant_id, fiscal_period_id);
CREATE INDEX depreciation_run_reversal_idx
    ON document.depreciation_run (tenant_id, reversal_of_run_id)
    WHERE reversal_of_run_id IS NOT NULL;
CREATE INDEX depreciation_run_journal_idx
    ON document.depreciation_run (tenant_id, reference_journal_entry_id)
    WHERE reference_journal_entry_id IS NOT NULL;
CREATE INDEX depreciation_run_line_run_status_idx
    ON document.depreciation_run_line (tenant_id, run_id, status);
CREATE INDEX depreciation_run_line_asset_idx
    ON document.depreciation_run_line (tenant_id, asset_id, asset_book_id);
CREATE INDEX depreciation_run_line_book_fk_idx
    ON document.depreciation_run_line (tenant_id, asset_book_id);
CREATE INDEX depreciation_run_line_schedule_idx
    ON document.depreciation_run_line (tenant_id, depreciation_schedule_id)
    WHERE depreciation_schedule_id IS NOT NULL;
CREATE INDEX depreciation_run_line_reversal_idx
    ON document.depreciation_run_line (tenant_id, reversal_of_line_id)
    WHERE reversal_of_line_id IS NOT NULL;
CREATE INDEX depreciation_schedule_asset_period_idx
    ON document.depreciation_schedule (tenant_id, asset_id, fiscal_period_id);
CREATE INDEX depreciation_schedule_period_status_idx
    ON document.depreciation_schedule (tenant_id, fiscal_period_id, status);
CREATE INDEX depreciation_schedule_actual_line_idx
    ON document.depreciation_schedule (tenant_id, actual_run_line_id)
    WHERE actual_run_line_id IS NOT NULL;
