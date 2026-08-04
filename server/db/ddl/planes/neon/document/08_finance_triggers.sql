CREATE TRIGGER workflow_request_identity_guard BEFORE UPDATE ON document.workflow_request
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER workflow_request_status_stamp BEFORE UPDATE OF status ON document.workflow_request
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER workflow_request_updated_at BEFORE UPDATE ON document.workflow_request
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER workflow_stage_identity_guard BEFORE UPDATE ON document.workflow_stage
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER workflow_stage_status_stamp BEFORE UPDATE OF status ON document.workflow_stage
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER workflow_stage_updated_at BEFORE UPDATE ON document.workflow_stage
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER commitment_identity_guard BEFORE UPDATE ON document.commitment
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER commitment_terminal_guard BEFORE UPDATE OR DELETE ON document.commitment
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_commitment_terminal();
CREATE TRIGGER commitment_period_guard BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.commitment
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER commitment_status_stamp BEFORE UPDATE OF status ON document.commitment
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER commitment_row_version BEFORE UPDATE ON document.commitment
FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER commitment_updated_at BEFORE UPDATE ON document.commitment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER commitment_line_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON document.commitment_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_commitment_line();
CREATE TRIGGER commitment_line_identity_guard BEFORE UPDATE ON document.commitment_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER commitment_line_status_stamp BEFORE UPDATE OF status ON document.commitment_line
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER commitment_line_updated_at BEFORE UPDATE ON document.commitment_line
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER commitment_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.commitment_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_commitment_total();

CREATE TRIGGER commitment_release_validate BEFORE INSERT ON document.commitment_release_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_release_allocation();
CREATE TRIGGER commitment_release_immutable BEFORE UPDATE OR DELETE ON document.commitment_release_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER purchase_invoice_identity_guard BEFORE UPDATE ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER purchase_invoice_terminal_guard BEFORE UPDATE OR DELETE ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_invoice_terminal();
CREATE TRIGGER purchase_invoice_period_guard BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER purchase_invoice_status_stamp BEFORE UPDATE OF status ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER purchase_invoice_row_version BEFORE UPDATE ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER purchase_invoice_updated_at BEFORE UPDATE ON document.purchase_invoice
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER purchase_invoice_line_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON document.purchase_invoice_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_purchase_invoice_line();
CREATE TRIGGER purchase_invoice_line_identity_guard BEFORE UPDATE ON document.purchase_invoice_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER purchase_invoice_line_row_version BEFORE UPDATE ON document.purchase_invoice_line
FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER purchase_invoice_line_updated_at BEFORE UPDATE ON document.purchase_invoice_line
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER purchase_invoice_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.purchase_invoice_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_purchase_invoice_total();

CREATE TRIGGER invoice_match_case_validate BEFORE INSERT OR UPDATE ON document.invoice_match_case
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_invoice_match_case();
CREATE TRIGGER invoice_match_case_identity_guard BEFORE UPDATE ON document.invoice_match_case
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER invoice_match_case_status_stamp BEFORE UPDATE OF status ON document.invoice_match_case
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER invoice_match_case_updated_at BEFORE UPDATE ON document.invoice_match_case
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER accounting_distribution_identity_guard BEFORE UPDATE ON document.accounting_distribution
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER accounting_distribution_posted_guard BEFORE UPDATE OR DELETE ON document.accounting_distribution
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_distribution_posted();
CREATE TRIGGER accounting_distribution_updated_at BEFORE UPDATE ON document.accounting_distribution
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER payment_term_application_validate BEFORE INSERT OR UPDATE ON document.payment_term_application
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_term_application();
CREATE TRIGGER payment_term_application_identity_guard BEFORE UPDATE ON document.payment_term_application
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER payment_term_application_updated_at BEFORE UPDATE ON document.payment_term_application
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER payment_entry_identity_guard BEFORE UPDATE ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER payment_entry_financial_guard BEFORE UPDATE ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_payment_posted();
CREATE TRIGGER payment_entry_period_guard BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER payment_entry_status_stamp BEFORE UPDATE OF status ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER payment_entry_row_version BEFORE UPDATE ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER payment_entry_updated_at BEFORE UPDATE ON document.payment_entry
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER payment_entry_allocation_validate BEFORE INSERT ON document.payment_entry_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_payment_allocation();
CREATE TRIGGER payment_entry_allocation_immutable BEFORE UPDATE OR DELETE ON document.payment_entry_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER journal_entry_identity_guard BEFORE UPDATE ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER journal_entry_posted_guard BEFORE UPDATE OR DELETE ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_journal_posted();
CREATE TRIGGER journal_entry_period_guard BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER journal_entry_posting_validate BEFORE UPDATE OF status ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_journal_posting();
CREATE TRIGGER journal_entry_status_stamp BEFORE UPDATE OF status ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER journal_entry_updated_at BEFORE UPDATE ON document.journal_entry
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER journal_line_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON document.journal_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_journal_line();
CREATE TRIGGER journal_line_immutable_evidence BEFORE UPDATE ON document.journal_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER journal_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.journal_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_journal_total();

CREATE TRIGGER journal_line_reference_immutable BEFORE UPDATE OR DELETE ON document.journal_line_reference
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

