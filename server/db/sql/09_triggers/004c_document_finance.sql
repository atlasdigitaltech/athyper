-- 09_triggers/004c_document_finance.sql
-- Finance enforcement triggers.
-- Depends on: 08_functions/004c_document_finance.sql

-- =============================================================================
-- document.journal_entry — period gate
-- =============================================================================
-- Fires BEFORE INSERT to block posting into hard-closed or unopened periods.
-- Alphabetically 'trg_je_p...' fires before 'trg_je_s...' (status triggers),
-- which is correct: gate first, then validate status machine.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_je_period_gate ON document.journal_entry;
CREATE TRIGGER trg_je_period_gate
    BEFORE INSERT ON document.journal_entry
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_je_period_gate_fn();

COMMENT ON TRIGGER trg_je_period_gate ON document.journal_entry IS
    'Blocks INSERT into hard-closed or future (not yet opened) book-periods. '
    'Checks master.fiscal_period AND governance.book_period_status.';


-- =============================================================================
-- document.journal_line — posting controls validation
-- =============================================================================
-- Fires BEFORE INSERT to enforce master.company_code_gl_account controls.
-- Alphabetically 'trg_jl_v...' fires after the denorm trigger (trg_jl_sync_*)
-- and before the immutability guard fires on existing posted rows.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_jl_validate_posting_controls ON document.journal_line;
CREATE TRIGGER trg_jl_validate_posting_controls
    BEFORE INSERT ON document.journal_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_jl_validate_posting_controls_fn();

COMMENT ON TRIGGER trg_jl_validate_posting_controls ON document.journal_line IS
    'Validates posting_allowed, blocked_for_manual, blocked_for_auto '
    'against master.company_code_gl_account before accepting a journal line.';


-- =============================================================================
-- document.journal_line — dimension validation                       [GAP-3]
-- =============================================================================
-- Fires BEFORE INSERT to validate that cost_center_id, profit_center_id,
-- and project_id (when set) are active and date-valid.
-- Alphabetically 'trg_jl_validate_d...' fires after 'trg_jl_sync_from_header'
-- (which populates posting_date) and before 'trg_jl_validate_p...' (posting
-- controls), giving correct dependency ordering.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_jl_validate_dimensions ON document.journal_line;
CREATE TRIGGER trg_jl_validate_dimensions
    BEFORE INSERT ON document.journal_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_jl_validate_dimensions_fn();

COMMENT ON TRIGGER trg_jl_validate_dimensions ON document.journal_line IS
    'Validates cost_center_id, profit_center_id, and project_id against their '
    'master tables: must be active (is_active=true) and within valid_from/valid_to '
    'window relative to the JL posting_date. Depends on: 08_functions/004c_document_finance.sql.';


-- =============================================================================
-- document.journal_entry — workflow approval gate                    [GAP-4]
-- =============================================================================
-- Fires BEFORE UPDATE on status='posted' to block posting if any pending or
-- rejected workflow_request exists for the JE.
-- Alphabetically fires after trg_je_status_transition_guard ('s' < 'w').
-- =============================================================================

DROP TRIGGER IF EXISTS trg_je_workflow_gate ON document.journal_entry;
CREATE TRIGGER trg_je_workflow_gate
    BEFORE UPDATE OF status ON document.journal_entry
    FOR EACH ROW
    WHEN (NEW.status = 'posted' AND OLD.status = 'created')
    EXECUTE FUNCTION document.trg_je_workflow_gate_fn();

COMMENT ON TRIGGER trg_je_workflow_gate ON document.journal_entry IS
    'Blocks transition created→posted when a document.workflow_request for the JE '
    'has status ''pending'' or ''rejected''. Absence of a request = no workflow '
    'required = posting allowed. Depends on: 08_functions/004c_document_finance.sql.';


-- =============================================================================
-- document.journal_line — budget availability check                  [GAP-5]
-- =============================================================================
-- Fires BEFORE INSERT on every journal_line. Skips credit lines (base_debit=0).
-- Checks master.budget_allocation + ledger.budget_balance and applies
-- overspend_policy: BLOCK/ESCALATE raise exceptions; WARN is non-blocking;
-- ALLOW and no-allocation-found pass through.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_jl_check_budget ON document.journal_line;
CREATE TRIGGER trg_jl_check_budget
    BEFORE INSERT ON document.journal_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_jl_check_budget_fn();

COMMENT ON TRIGGER trg_jl_check_budget ON document.journal_line IS
    'Checks budget availability for debit journal_lines against the best-matching '
    'master.budget_allocation and ledger.budget_balance. Enforces overspend_policy: '
    'BLOCK/ESCALATE → hard exception; WARN → non-blocking warning; ALLOW → pass-through. '
    'Depends on: 08_functions/004c_document_finance.sql.';
