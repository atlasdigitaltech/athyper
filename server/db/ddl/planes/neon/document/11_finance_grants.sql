DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            document.workflow_request,
            document.workflow_stage,
            document.commitment,
            document.commitment_line,
            document.purchase_invoice,
            document.purchase_invoice_line,
            document.invoice_match_case,
            document.accounting_distribution,
            document.payment_term_application,
            document.payment_entry,
            document.journal_entry,
            document.journal_line
        TO athyperapp;

        GRANT SELECT, INSERT ON
            document.commitment_release_allocation,
            document.payment_entry_allocation,
            document.journal_line_reference
        TO athyperapp;

        GRANT EXECUTE ON FUNCTION document.trg_increment_row_version() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_company_period() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_commitment_terminal() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_invoice_terminal() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_journal_posted() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_payment_posted() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_commitment_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_sync_commitment_total() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_release_allocation() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_purchase_invoice_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_sync_purchase_invoice_total() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_invoice_match_case() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_distribution_posted() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_term_application() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_payment_allocation() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_journal_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_sync_journal_total() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_journal_posting() TO athyperapp;
        GRANT SELECT ON document.v_party_advance_balance TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.workflow_request,
            document.workflow_stage,
            document.commitment,
            document.commitment_line,
            document.commitment_release_allocation,
            document.purchase_invoice,
            document.purchase_invoice_line,
            document.invoice_match_case,
            document.accounting_distribution,
            document.payment_term_application,
            document.payment_entry,
            document.payment_entry_allocation,
            document.journal_entry,
            document.journal_line,
            document.journal_line_reference
        TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA document TO athyperadmin;
    END IF;
END $$;
