-- ============================================================================
-- document/06_triggers.sql
-- Concept: Document Triggers — header/line computation and single-default enforcement
-- Depends on: 04_tables/004_document.sql and sub-tables, 08_functions/004_document.sql
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.
-- ============================================================================


-- =============================================================================
-- §8  document.user_profile_update_request
-- =============================================================================

-- BEFORE INSERT: code generation, requestor defaults
DROP TRIGGER IF EXISTS trg_upupr_before_insert ON document.user_profile_update_request;
CREATE TRIGGER trg_upupr_before_insert
    BEFORE INSERT ON document.user_profile_update_request
    FOR EACH ROW EXECUTE FUNCTION document.trg_upupr_before_insert();

-- BEFORE UPDATE: status transition + principal_snapshot capture
DROP TRIGGER IF EXISTS trg_upupr_status_change ON document.user_profile_update_request;
CREATE TRIGGER trg_upupr_status_change
    BEFORE UPDATE OF status ON document.user_profile_update_request
    FOR EACH ROW EXECUTE FUNCTION document.trg_upupr_status_change();

-- AFTER INSERT/UPDATE: audit_log
DROP TRIGGER IF EXISTS trg_upupr_audit ON document.user_profile_update_request;
CREATE TRIGGER trg_upupr_audit
    AFTER INSERT OR UPDATE ON document.user_profile_update_request
    FOR EACH ROW EXECUTE FUNCTION document.trg_upupr_audit();

-- AFTER UPDATE: entity_lifecycle_log
DROP TRIGGER IF EXISTS trg_upupr_lifecycle_log ON document.user_profile_update_request;
CREATE TRIGGER trg_upupr_lifecycle_log
    AFTER UPDATE OF status ON document.user_profile_update_request
    FOR EACH ROW EXECUTE FUNCTION document.trg_upupr_lifecycle_log();


-- =============================================================================
-- §9  DOCUMENT · PRINT · BRANDING  —  document triggers
-- =============================================================================

-- ── document.render_output ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_render_output_updated_at ON document.render_output;
CREATE TRIGGER trg_render_output_updated_at
    BEFORE UPDATE ON document.render_output
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_render_output_validate_manifest ON document.render_output;
CREATE TRIGGER trg_render_output_validate_manifest
    BEFORE INSERT OR UPDATE OF manifest_json
    ON document.render_output
    FOR EACH ROW EXECUTE FUNCTION document.trg_validate_manifest_json();

-- ── document.render_job ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_render_job_updated_at ON document.render_job;
CREATE TRIGGER trg_render_job_updated_at
    BEFORE UPDATE ON document.render_job
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §JE  document.journal_entry
-- =============================================================================
-- Trigger ordering (PostgreSQL fires BEFORE triggers alphabetically):
--   trg_je_immutability_guard      ← fires first (guards posted JEs)
--   trg_je_p*                      ← period gate (before status triggers)
--   trg_je_source_doc_type_lookup  ← lookup validation
--   trg_je_status_changed          ← sets status_changed_at/by
--   trg_je_status_transition_guard ← validates transitions + caches totals
--   trg_je_sync_base_currency      ← denormalize
--   trg_je_sync_fiscal_period      ← denormalize
--   trg_je_updated_at              ← audit timestamp
--   trg_je_workflow_gate           ← workflow approval gate (after status transition)
-- =============================================================================

-- A1: Auto-populate code + name on INSERT (fires before all other JE triggers)
DROP TRIGGER IF EXISTS trg_je_auto_identity ON document.journal_entry;
CREATE TRIGGER trg_je_auto_identity
    BEFORE INSERT ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION document.trg_je_before_insert();

-- G1: Immutability guard — blocks mutations on posted/reversed JEs
DROP TRIGGER IF EXISTS trg_je_immutability_guard ON document.journal_entry;
CREATE TRIGGER trg_je_immutability_guard
    BEFORE UPDATE ON document.journal_entry
    FOR EACH ROW
    WHEN (OLD.status IN ('pending_approval', 'approved', 'posted', 'reversed'))
    EXECUTE FUNCTION document.trg_je_immutability_guard();

DROP TRIGGER IF EXISTS trg_je_status_insert_guard ON document.journal_entry;
CREATE TRIGGER trg_je_status_insert_guard
    BEFORE INSERT ON document.journal_entry
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_je_status_insert_guard();

DROP TRIGGER IF EXISTS trg_je_updated_at ON document.journal_entry;
CREATE TRIGGER trg_je_updated_at BEFORE UPDATE ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_je_status_changed ON document.journal_entry;
CREATE TRIGGER trg_je_status_changed BEFORE UPDATE ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_je_source_doc_type_lookup ON document.journal_entry;
CREATE TRIGGER trg_je_source_doc_type_lookup
    BEFORE INSERT OR UPDATE OF source_doc_type ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.je_source_doc_type', 'source_doc_type');

-- G2b: Status transition guard — state machine + balance validation
DROP TRIGGER IF EXISTS trg_je_status_transition_guard ON document.journal_entry;
CREATE TRIGGER trg_je_status_transition_guard
    BEFORE UPDATE ON document.journal_entry
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION document.trg_je_status_transition_guard();

DROP TRIGGER IF EXISTS trg_je_lifecycle_log ON document.journal_entry;
CREATE TRIGGER trg_je_lifecycle_log
    AFTER UPDATE OF status ON document.journal_entry
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION document.trg_je_lifecycle_log();

DROP TRIGGER IF EXISTS trg_je_field_audit_log ON document.journal_entry;
CREATE TRIGGER trg_je_field_audit_log
    AFTER INSERT OR UPDATE OR DELETE ON document.journal_entry
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_je_field_audit_log();

DROP TRIGGER IF EXISTS trg_je_sync_fiscal_period ON document.journal_entry;
CREATE TRIGGER trg_je_sync_fiscal_period
    BEFORE INSERT OR UPDATE OF fiscal_period_id ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION document.trg_je_sync_fiscal_period();

DROP TRIGGER IF EXISTS trg_je_sync_base_currency ON document.journal_entry;
CREATE TRIGGER trg_je_sync_base_currency
    BEFORE INSERT OR UPDATE OF company_code_id ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION document.trg_je_sync_base_currency();

-- Period gate — blocks INSERT into hard-closed or unopened periods.
-- Alphabetically 'trg_je_p...' fires before 'trg_je_s...' (status triggers):
-- gate first, then validate state machine.
DROP TRIGGER IF EXISTS trg_je_period_gate ON document.journal_entry;
CREATE TRIGGER trg_je_period_gate
    BEFORE INSERT OR UPDATE OF status, posting_date, fiscal_period_id, book_id, company_code_id
    ON document.journal_entry
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_je_period_gate_fn();

COMMENT ON TRIGGER trg_je_period_gate ON document.journal_entry IS
    'Blocks INSERT into hard-closed or future (not yet opened) book-periods. '
    'Checks master.fiscal_period AND governance.book_period_status.';

-- Workflow approval gate — blocks created→posted when a pending/rejected request exists.
-- Alphabetically fires after trg_je_status_transition_guard ('s' < 'w').
DROP TRIGGER IF EXISTS trg_je_workflow_gate ON document.journal_entry;
CREATE TRIGGER trg_je_workflow_gate
    BEFORE UPDATE OF status ON document.journal_entry
    FOR EACH ROW
    WHEN (NEW.status = 'posted' AND OLD.status IN ('created', 'approved'))
    EXECUTE FUNCTION document.trg_je_workflow_gate_fn();

COMMENT ON TRIGGER trg_je_workflow_gate ON document.journal_entry IS
    'Blocks transition created→posted when a document.workflow_request for the JE '
    'has status ''pending'' or ''rejected''. Absence of a request = no workflow '
    'required = posting allowed. Depends on: 08_functions/004c_document_finance.sql.';


-- =============================================================================
-- §JL  document.journal_line
-- =============================================================================
-- Trigger ordering:
--   trg_jl_immutability_guard       ← fires first (blocks changes to posted JE lines)
--   trg_jl_party_type_lookup        ← lookup validation
--   trg_jl_subledger_type_lookup    ← lookup validation
--   trg_jl_sync_from_header         ← denormalize header fields
--   trg_jl_updated_at               ← audit timestamp
--   trg_jl_validate_d*              ← dimension validation (before posting controls)
--   trg_jl_validate_party           ← polymorphic FK validation
--   trg_jl_validate_posting_controls ← posting controls enforcement
-- + AFTER trigger:
--   trg_jl_check_budget             ← budget availability check
--   trg_jl_sync_cached_totals       ← recomputes header totals
-- =============================================================================

-- G1: JL immutability — block all changes to lines of posted/reversed JEs
DROP TRIGGER IF EXISTS trg_jl_immutability_guard ON document.journal_line;
CREATE TRIGGER trg_jl_immutability_guard
    BEFORE INSERT OR UPDATE OR DELETE ON document.journal_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_jl_immutability_guard();

DROP TRIGGER IF EXISTS trg_jl_updated_at ON document.journal_line;
CREATE TRIGGER trg_jl_updated_at BEFORE UPDATE ON document.journal_line
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_jl_party_type_lookup ON document.journal_line;
CREATE TRIGGER trg_jl_party_type_lookup
    BEFORE INSERT OR UPDATE OF party_type ON document.journal_line
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.jl_party_type', 'party_type');

DROP TRIGGER IF EXISTS trg_jl_subledger_type_lookup ON document.journal_line;
CREATE TRIGGER trg_jl_subledger_type_lookup
    BEFORE INSERT OR UPDATE OF subledger_type ON document.journal_line
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.jl_subledger_type', 'subledger_type');

DROP TRIGGER IF EXISTS trg_jl_sync_from_header ON document.journal_line;
CREATE TRIGGER trg_jl_sync_from_header
    BEFORE INSERT ON document.journal_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_journal_line_sync_from_header();

-- G4: Party polymorphic validation — validates party_id against correct master table
DROP TRIGGER IF EXISTS trg_jl_validate_party ON document.journal_line;
CREATE TRIGGER trg_jl_validate_party
    BEFORE INSERT OR UPDATE OF party_type, party_id ON document.journal_line
    FOR EACH ROW
    WHEN (NEW.party_type IS NOT NULL)
    EXECUTE FUNCTION document.trg_jl_validate_party();

-- Dimension validation — cost_center_id, profit_center_id, project_id must be
-- active and date-valid. Fires after trg_jl_sync_from_header (populates posting_date)
-- and before trg_jl_validate_p* (posting controls).
DROP TRIGGER IF EXISTS trg_jl_validate_dimensions ON document.journal_line;
CREATE TRIGGER trg_jl_validate_dimensions
    BEFORE INSERT OR UPDATE OF cost_center_id, profit_center_id, project_id, site_id
    ON document.journal_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_jl_validate_dimensions_fn();

COMMENT ON TRIGGER trg_jl_validate_dimensions ON document.journal_line IS
    'Validates cost_center_id, profit_center_id, and project_id against their '
    'master tables: must be active (is_active=true) and within valid_from/valid_to '
    'window relative to the JL posting_date. Depends on: 08_functions/004c_document_finance.sql.';

-- Posting controls validation — enforces master.company_code_gl_account controls.
-- Alphabetically fires after denorm trigger (trg_jl_sync_*).
DROP TRIGGER IF EXISTS trg_jl_validate_posting_controls ON document.journal_line;
CREATE TRIGGER trg_jl_validate_posting_controls
    BEFORE INSERT OR UPDATE OF gl_account_id, company_code_id
    ON document.journal_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_jl_validate_posting_controls_fn();

COMMENT ON TRIGGER trg_jl_validate_posting_controls ON document.journal_line IS
    'Validates posting_allowed, blocked_for_manual, blocked_for_auto '
    'against master.company_code_gl_account before accepting a journal line.';

-- Budget availability check — skips credit lines (base_debit=0); enforces
-- overspend_policy BLOCK/ESCALATE/WARN/ALLOW.
DROP TRIGGER IF EXISTS trg_jl_check_budget ON document.journal_line;
CREATE TRIGGER trg_jl_check_budget
    BEFORE INSERT OR UPDATE OF base_debit, gl_account_id, cost_center_id, profit_center_id, project_id
    ON document.journal_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_jl_check_budget_fn();

COMMENT ON TRIGGER trg_jl_check_budget ON document.journal_line IS
    'Checks budget availability for debit journal_lines against the best-matching '
    'master.budget_allocation and ledger.budget_balance. Enforces overspend_policy: '
    'BLOCK/ESCALATE → hard exception; WARN → non-blocking warning; ALLOW → pass-through. '
    'Depends on: 08_functions/004c_document_finance.sql.';

DROP TRIGGER IF EXISTS trg_jl_field_audit_log ON document.journal_line;
CREATE TRIGGER trg_jl_field_audit_log
    AFTER INSERT OR UPDATE OR DELETE ON document.journal_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_jl_field_audit_log();

-- G2a: Cached totals sync — AFTER trigger recomputes header totals from lines
DROP TRIGGER IF EXISTS trg_jl_sync_cached_totals ON document.journal_line;
CREATE TRIGGER trg_jl_sync_cached_totals
    AFTER INSERT OR UPDATE OR DELETE ON document.journal_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_je_sync_cached_totals();


-- =============================================================================
-- §JLR  document.journal_line_reference
-- =============================================================================

DROP TRIGGER IF EXISTS trg_jlr_ref_type_lookup ON document.journal_line_reference;
CREATE TRIGGER trg_jlr_ref_type_lookup
    BEFORE INSERT OR UPDATE OF ref_type ON document.journal_line_reference
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.jlr_ref_type', 'ref_type');

DROP TRIGGER IF EXISTS trg_jlr_doc_type_lookup ON document.journal_line_reference;
CREATE TRIGGER trg_jlr_doc_type_lookup
    BEFORE INSERT OR UPDATE OF ref_doc_type ON document.journal_line_reference
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.jlr_ref_doc_type', 'ref_doc_type');

DROP TRIGGER IF EXISTS trg_jlr_append_only_guard ON document.journal_line_reference;
CREATE TRIGGER trg_jlr_append_only_guard
    BEFORE UPDATE OR DELETE ON document.journal_line_reference
    FOR EACH ROW EXECUTE FUNCTION document.trg_jlr_append_only_guard();


-- =============================================================================
-- §CMT  document.commitment
-- =============================================================================

DROP TRIGGER IF EXISTS trg_cmt_updated_at ON document.commitment;
CREATE TRIGGER trg_cmt_updated_at BEFORE UPDATE ON document.commitment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cmt_status_changed ON document.commitment;
CREATE TRIGGER trg_cmt_status_changed BEFORE UPDATE ON document.commitment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §CL  document.commitment_line
-- =============================================================================

DROP TRIGGER IF EXISTS trg_cl_updated_at ON document.commitment_line;
CREATE TRIGGER trg_cl_updated_at BEFORE UPDATE ON document.commitment_line
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- §15.3  Commitment line company consistency (item + delivery warehouse/site)
DROP TRIGGER IF EXISTS trg_cl_company_guard ON document.commitment_line;
CREATE TRIGGER trg_cl_company_guard
    BEFORE INSERT OR UPDATE OF item_id, delivery_warehouse_id, delivery_site_id
    ON document.commitment_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_guard_commitment_line_company();


-- =============================================================================
-- §OH  document.obligation_horizon
-- =============================================================================

DROP TRIGGER IF EXISTS trg_oh_updated_at ON document.obligation_horizon;
CREATE TRIGGER trg_oh_updated_at
    BEFORE UPDATE ON document.obligation_horizon
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_oh_status_changed ON document.obligation_horizon;
CREATE TRIGGER trg_oh_status_changed
    BEFORE UPDATE ON document.obligation_horizon
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §PI  document.purchase_invoice
-- Trigger ordering (alphabetical — PostgreSQL fires BEFORE triggers by name):
--   trg_pi_before_insert       ← number generation + created_by (INSERT only)
--   trg_pi_immutability_guard  ← blocks edits on terminal/posted invoices
--   trg_pi_status_changed      ← sets status_changed_at/by
--   trg_pi_status_guard        ← validates state-machine transitions
--   trg_pi_updated_at          ← sets updated_at
-- =============================================================================

-- B1: Invoice number auto-generation + code sync
DROP TRIGGER IF EXISTS trg_pi_before_insert ON document.purchase_invoice;
CREATE TRIGGER trg_pi_before_insert
    BEFORE INSERT ON document.purchase_invoice
    FOR EACH ROW EXECUTE FUNCTION document.trg_pi_before_insert();

-- G1: Immutability guard — blocks direct field edits on posted/terminal invoices
DROP TRIGGER IF EXISTS trg_pi_immutability_guard ON document.purchase_invoice;
CREATE TRIGGER trg_pi_immutability_guard
    BEFORE UPDATE ON document.purchase_invoice
    FOR EACH ROW
    WHEN (OLD.status IN ('posted','reversed','cancelled','fully_paid','rejected'))
    EXECUTE FUNCTION document.trg_pi_immutability_guard();

DROP TRIGGER IF EXISTS trg_pi_updated_at ON document.purchase_invoice;
CREATE TRIGGER trg_pi_updated_at BEFORE UPDATE ON document.purchase_invoice
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pi_status_changed ON document.purchase_invoice;
CREATE TRIGGER trg_pi_status_changed BEFORE UPDATE ON document.purchase_invoice
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- G2: Status transition guard — validates state machine via snapshot.status_route
DROP TRIGGER IF EXISTS trg_pi_status_guard ON document.purchase_invoice;
CREATE TRIGGER trg_pi_status_guard
    BEFORE UPDATE OF status ON document.purchase_invoice
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION document.trg_pi_status_guard();

COMMENT ON TRIGGER trg_pi_status_guard ON document.purchase_invoice IS
    'Validates status transitions against snapshot.status_route compiled_json. '
    'Falls through to allow if no compiled snapshot exists (lifecycle not yet seeded).';


-- =============================================================================
-- §PIL  document.purchase_invoice_line
-- Trigger ordering:
--   trg_pil_immutability_guard ← blocks line mutations on non-draft invoices
--   trg_pil_updated_at         ← sets updated_at
-- + AFTER trigger:
--   trg_pil_sync_header        ← recomputes invoice header totals
-- =============================================================================

-- G1: Line immutability — block mutations when invoice is not draft/proforma
DROP TRIGGER IF EXISTS trg_pil_immutability_guard ON document.purchase_invoice_line;
CREATE TRIGGER trg_pil_immutability_guard
    BEFORE INSERT OR UPDATE OR DELETE ON document.purchase_invoice_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_pil_immutability_guard();

DROP TRIGGER IF EXISTS trg_pil_updated_at ON document.purchase_invoice_line;
CREATE TRIGGER trg_pil_updated_at BEFORE UPDATE ON document.purchase_invoice_line
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- G2: Header totals sync — AFTER trigger keeps line_count + amounts in sync
DROP TRIGGER IF EXISTS trg_pil_sync_header ON document.purchase_invoice_line;
CREATE TRIGGER trg_pil_sync_header
    AFTER INSERT OR UPDATE OR DELETE ON document.purchase_invoice_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_pil_sync_header();

COMMENT ON TRIGGER trg_pil_sync_header ON document.purchase_invoice_line IS
    'Calls fn_refresh_purchase_invoice_totals after every line change. '
    'Keeps line_count, subtotal_amount, tax_amount, total_amount in sync on the header.';


-- =============================================================================
-- §PE  document.payment_entry
-- =============================================================================

DROP TRIGGER IF EXISTS trg_pe_updated_at ON document.payment_entry;
CREATE TRIGGER trg_pe_updated_at BEFORE UPDATE ON document.payment_entry
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pe_status_changed ON document.payment_entry;
CREATE TRIGGER trg_pe_status_changed BEFORE UPDATE ON document.payment_entry
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §PEA  document.payment_entry_allocation
-- =============================================================================

-- §16  Payment allocation business-rule guard (per-row)
DROP TRIGGER IF EXISTS trg_pea_allocation_guard ON document.payment_entry_allocation;
CREATE TRIGGER trg_pea_allocation_guard
    BEFORE INSERT OR UPDATE OF payment_entry_id, purchase_invoice_id, commitment_id,
                               advance_recovery_amount, retention_amount
    ON document.payment_entry_allocation
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_guard_payment_allocation();

-- §16b  NETTING minimum allocation count guard (after statement)
-- Runs after the full INSERT/UPDATE so it sees the complete sibling set.
DROP TRIGGER IF EXISTS trg_pea_netting_count_guard_ins ON document.payment_entry_allocation;
CREATE TRIGGER trg_pea_netting_count_guard_ins
    AFTER INSERT
    ON document.payment_entry_allocation
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT
    EXECUTE FUNCTION document.trg_guard_netting_allocation_count();

DROP TRIGGER IF EXISTS trg_pea_netting_count_guard_upd ON document.payment_entry_allocation;
CREATE TRIGGER trg_pea_netting_count_guard_upd
    AFTER UPDATE
    ON document.payment_entry_allocation
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT
    EXECUTE FUNCTION document.trg_guard_netting_allocation_count();


-- =============================================================================
-- §PTA  document.payment_term_application
-- =============================================================================

DROP TRIGGER IF EXISTS trg_pta_updated_at ON document.payment_term_application;
CREATE TRIGGER trg_pta_updated_at BEFORE UPDATE ON document.payment_term_application
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §AT1  document.asset_transaction
-- =============================================================================

DROP TRIGGER IF EXISTS trg_atx_updated_at ON document.asset_transaction;
CREATE TRIGGER trg_atx_updated_at BEFORE UPDATE ON document.asset_transaction
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_atx_status_changed ON document.asset_transaction;
CREATE TRIGGER trg_atx_status_changed BEFORE UPDATE ON document.asset_transaction
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_atx_book_guard ON document.asset_transaction;
CREATE TRIGGER trg_atx_book_guard
    BEFORE INSERT OR UPDATE OF asset_book_id, asset_id, book_type ON document.asset_transaction
    FOR EACH ROW EXECUTE FUNCTION document.trg_asset_txn_book_guard();

DROP TRIGGER IF EXISTS trg_atx_txn_type_lookup ON document.asset_transaction;
CREATE TRIGGER trg_atx_txn_type_lookup
    BEFORE INSERT OR UPDATE OF txn_type ON document.asset_transaction
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.asset_txn_type', 'txn_type');

DROP TRIGGER IF EXISTS trg_atx_book_type_lookup ON document.asset_transaction;
CREATE TRIGGER trg_atx_book_type_lookup
    BEFORE INSERT OR UPDATE OF book_type ON document.asset_transaction
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_book_type', 'book_type');


-- =============================================================================
-- §AT2  document.depreciation_run
-- =============================================================================

DROP TRIGGER IF EXISTS trg_dr_updated_at ON document.depreciation_run;
CREATE TRIGGER trg_dr_updated_at BEFORE UPDATE ON document.depreciation_run
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_dr_status_changed ON document.depreciation_run;
CREATE TRIGGER trg_dr_status_changed BEFORE UPDATE ON document.depreciation_run
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_dr_book_type_lookup ON document.depreciation_run;
CREATE TRIGGER trg_dr_book_type_lookup
    BEFORE INSERT OR UPDATE OF book_type ON document.depreciation_run
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_book_type', 'book_type');


-- =============================================================================
-- §AT3  document.depreciation_run_line (immutable)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_drl_prevent_mutation ON document.depreciation_run_line;
CREATE TRIGGER trg_drl_prevent_mutation
    BEFORE UPDATE OR DELETE ON document.depreciation_run_line
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();


-- =============================================================================
-- §AT4  document.depreciation_schedule
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ds_updated_at ON document.depreciation_schedule;
CREATE TRIGGER trg_ds_updated_at BEFORE UPDATE ON document.depreciation_schedule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §IC1  document.intercompany_agreement
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ica_updated_at ON document.intercompany_agreement;
CREATE TRIGGER trg_ica_updated_at BEFORE UPDATE ON document.intercompany_agreement
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ica_status_changed ON document.intercompany_agreement;
CREATE TRIGGER trg_ica_status_changed BEFORE UPDATE ON document.intercompany_agreement
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §IC2  document.intercompany_transaction
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ict_updated_at ON document.intercompany_transaction;
CREATE TRIGGER trg_ict_updated_at BEFORE UPDATE ON document.intercompany_transaction
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ict_status_changed ON document.intercompany_transaction;
CREATE TRIGGER trg_ict_status_changed BEFORE UPDATE ON document.intercompany_transaction
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §IC3  document.netting_batch
-- =============================================================================

DROP TRIGGER IF EXISTS trg_nb_updated_at ON document.netting_batch;
CREATE TRIGGER trg_nb_updated_at BEFORE UPDATE ON document.netting_batch
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_nb_status_changed ON document.netting_batch;
CREATE TRIGGER trg_nb_status_changed BEFORE UPDATE ON document.netting_batch
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §IC4  document.ic_elimination
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ice_updated_at ON document.ic_elimination;
CREATE TRIGGER trg_ice_updated_at BEFORE UPDATE ON document.ic_elimination
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ice_status_changed ON document.ic_elimination;
CREATE TRIGGER trg_ice_status_changed BEFORE UPDATE ON document.ic_elimination
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §INV1  document.stocktake
-- =============================================================================

DROP TRIGGER IF EXISTS trg_st_updated_at ON document.stocktake;
CREATE TRIGGER trg_st_updated_at
    BEFORE UPDATE ON document.stocktake
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_st_status_changed ON document.stocktake;
CREATE TRIGGER trg_st_status_changed
    BEFORE UPDATE OF status ON document.stocktake
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §INV2  document.stocktake_line
-- =============================================================================

DROP TRIGGER IF EXISTS trg_stl_updated_at ON document.stocktake_line;
CREATE TRIGGER trg_stl_updated_at
    BEFORE UPDATE ON document.stocktake_line
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_stl_denorm_counts ON document.stocktake_line;
CREATE TRIGGER trg_stl_denorm_counts
    AFTER INSERT OR UPDATE OR DELETE ON document.stocktake_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_stocktake_line_denorm_counts();


-- =============================================================================
-- §P2P0  document.purchase_order_confirmation
-- =============================================================================

DROP TRIGGER IF EXISTS trg_poc_updated_at ON document.purchase_order_confirmation;
CREATE TRIGGER trg_poc_updated_at BEFORE UPDATE ON document.purchase_order_confirmation
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_poc_status_changed ON document.purchase_order_confirmation;
CREATE TRIGGER trg_poc_status_changed BEFORE UPDATE ON document.purchase_order_confirmation
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §P2P0b  document.delivery_note
-- =============================================================================

DROP TRIGGER IF EXISTS trg_dn_updated_at ON document.delivery_note;
CREATE TRIGGER trg_dn_updated_at BEFORE UPDATE ON document.delivery_note
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_dn_status_changed ON document.delivery_note;
CREATE TRIGGER trg_dn_status_changed BEFORE UPDATE ON document.delivery_note
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §P2P1  document.goods_receipt  — §15.1 GR header company consistency
-- =============================================================================

DROP TRIGGER IF EXISTS trg_gr_updated_at ON document.goods_receipt;
CREATE TRIGGER trg_gr_updated_at BEFORE UPDATE ON document.goods_receipt
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_gr_status_changed ON document.goods_receipt;
CREATE TRIGGER trg_gr_status_changed BEFORE UPDATE ON document.goods_receipt
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_gr_company_guard ON document.goods_receipt;
CREATE TRIGGER trg_gr_company_guard
    BEFORE INSERT OR UPDATE OF company_code_id, receiving_warehouse_id, receiving_site_id
    ON document.goods_receipt
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_guard_gr_header_company();


-- =============================================================================
-- §P2P2  document.goods_receipt_line  — §15.2 GR line company consistency
-- =============================================================================

DROP TRIGGER IF EXISTS trg_grl_company_guard ON document.goods_receipt_line;
CREATE TRIGGER trg_grl_company_guard
    BEFORE INSERT OR UPDATE OF item_id, warehouse_id
    ON document.goods_receipt_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_guard_gr_line_company();


-- =============================================================================
-- §P2P3a  document.service_entry_sheet
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ses_updated_at ON document.service_entry_sheet;
CREATE TRIGGER trg_ses_updated_at BEFORE UPDATE ON document.service_entry_sheet
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ses_status_changed ON document.service_entry_sheet;
CREATE TRIGGER trg_ses_status_changed BEFORE UPDATE ON document.service_entry_sheet
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §P2P3  document.service_entry_sheet_line  — §15.4 SES line company consistency
-- =============================================================================

DROP TRIGGER IF EXISTS trg_sesl_company_guard ON document.service_entry_sheet_line;
CREATE TRIGGER trg_sesl_company_guard
    BEFORE INSERT OR UPDATE OF item_id
    ON document.service_entry_sheet_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_guard_ses_line_company();

-- ── document.wht_certificate updated_at ─────────────────────────────────────
-- R7-C
DROP TRIGGER IF EXISTS trg_whtc_updated_at ON document.wht_certificate;
CREATE TRIGGER trg_whtc_updated_at
    BEFORE UPDATE ON document.wht_certificate
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §ROW_VERSION  Generic row_version increment trigger
-- =============================================================================
-- Shared function — attached to every aggregate-root table that carries
-- a row_version column. Increments the version on every UPDATE so callers
-- can use optimistic concurrency (WHERE row_version = :expected → 0 rows → 409).
--
-- Trigger firing order on purchase_invoice (alphabetical BEFORE triggers):
--   trg_pi_immutability_guard  ← blocks edits on terminal/posted invoices
--   trg_pi_row_version         ← increments row_version  ← NEW
--   trg_pi_status_changed      ← sets status_changed_at/by
--   trg_pi_status_guard        ← validates state-machine transitions
--   trg_pi_updated_at          ← sets updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION shared.trg_increment_row_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION shared.trg_increment_row_version() IS
    'Generic BEFORE UPDATE trigger: increments row_version by 1 on every update. '
    'Attach to aggregate-root tables that carry a row_version column. '
    'Pairs with optimistic-lock saves: caller passes expected_row_version in WHERE; '
    '0 rows updated → 409 Conflict. Side-effect: trg_pil_sync_header updates to the '
    'invoice header also increment row_version, making line mutations visible to the '
    'header-save conflict check.';

-- §PI  Purchase Invoice row_version
DROP TRIGGER IF EXISTS trg_pi_row_version ON document.purchase_invoice;
CREATE TRIGGER trg_pi_row_version
    BEFORE UPDATE ON document.purchase_invoice
    FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

COMMENT ON TRIGGER trg_pi_row_version ON document.purchase_invoice IS
    'Increments row_version on every UPDATE to purchase_invoice, including updates '
    'triggered by trg_pil_sync_header when lines change. This is intentional: any '
    'mutation to the invoice aggregate (header or lines) advances the version so a '
    'concurrently open header-save sees the conflict and returns 409. '
    'Phase 2: attach the same trigger to purchase_order, journal_entry, payment_entry '
    'once those tables have row_version added in 01z_row_version.sql.';
