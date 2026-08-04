CREATE DOMAIN document.bank_statement_status_d AS text
    CHECK (VALUE IN ('imported', 'matching', 'reconciled', 'signed_off', 'archived', 'rejected'));

CREATE DOMAIN document.bank_statement_source_format_d AS text
    CHECK (VALUE IN ('csv', 'ofx', 'mt940', 'bai2', 'camt053', 'camt054', 'api', 'manual'));

CREATE DOMAIN document.bank_transaction_type_d AS text
    CHECK (VALUE IN ('payment', 'receipt', 'fee', 'interest', 'fx', 'transfer', 'reversal', 'other'));

CREATE DOMAIN document.bank_reconciliation_status_d AS text
    CHECK (VALUE IN ('unmatched', 'partially_matched', 'matched', 'exception', 'excluded'));

CREATE DOMAIN document.bank_recon_case_type_d AS text
    CHECK (VALUE IN ('exact_match', 'amount_match', 'near_match', 'manual', 'exception', 'bank_charge', 'fx_difference'));

CREATE DOMAIN document.bank_recon_case_status_d AS text
    CHECK (VALUE IN ('open', 'matched', 'signed_off', 'voided'));

CREATE DOMAIN document.bank_recon_side_d AS text
    CHECK (VALUE IN ('payment', 'statement'));

CREATE DOMAIN document.depreciation_run_status_d AS text
    CHECK (VALUE IN ('planned', 'running', 'calculated', 'posted', 'failed', 'cancelled'));

CREATE DOMAIN document.depreciation_line_status_d AS text
    CHECK (VALUE IN ('calculated', 'posted', 'error'));

CREATE DOMAIN document.depreciation_schedule_status_d AS text
    CHECK (VALUE IN ('planned', 'posted', 'cancelled'));
