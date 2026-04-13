-- 09_triggers/004_document.sql
-- Document schema triggers.
-- Depends on: 08_functions/004_document.sql

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
-- §  document.journal_entry
-- =============================================================================
-- Trigger ordering (PostgreSQL fires BEFORE triggers alphabetically):
--   trg_je_immutability_guard      ← fires first (guards posted JEs)
--   trg_je_source_doc_type_lookup  ← lookup validation
--   trg_je_status_changed          ← sets status_changed_at/by
--   trg_je_status_lookup           ← lookup validation
--   trg_je_status_transition_guard ← validates transitions + caches totals
--   trg_je_sync_base_currency      ← denormalize
--   trg_je_sync_fiscal_period      ← denormalize
--   trg_je_updated_at              ← audit timestamp
-- =============================================================================

-- G1: Immutability guard — blocks mutations on posted/reversed JEs
DROP TRIGGER IF EXISTS trg_je_immutability_guard ON document.journal_entry;
CREATE TRIGGER trg_je_immutability_guard
    BEFORE UPDATE ON document.journal_entry
    FOR EACH ROW
    WHEN (OLD.status IN ('posted', 'reversed'))
    EXECUTE FUNCTION document.trg_je_immutability_guard();

DROP TRIGGER IF EXISTS trg_je_updated_at ON document.journal_entry;
CREATE TRIGGER trg_je_updated_at BEFORE UPDATE ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_je_status_changed ON document.journal_entry;
CREATE TRIGGER trg_je_status_changed BEFORE UPDATE ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_je_status_lookup ON document.journal_entry;
CREATE TRIGGER trg_je_status_lookup
    BEFORE INSERT OR UPDATE OF status ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.journal_entry_status', 'status');

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

DROP TRIGGER IF EXISTS trg_je_sync_fiscal_period ON document.journal_entry;
CREATE TRIGGER trg_je_sync_fiscal_period
    BEFORE INSERT OR UPDATE OF fiscal_period_id ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION document.trg_je_sync_fiscal_period();

DROP TRIGGER IF EXISTS trg_je_sync_base_currency ON document.journal_entry;
CREATE TRIGGER trg_je_sync_base_currency
    BEFORE INSERT OR UPDATE OF company_code_id ON document.journal_entry
    FOR EACH ROW EXECUTE FUNCTION document.trg_je_sync_base_currency();


-- =============================================================================
-- §  document.journal_line
-- =============================================================================
-- Trigger ordering:
--   trg_jl_immutability_guard  ← fires first (blocks changes to posted JE lines)
--   trg_jl_party_type_lookup   ← lookup validation
--   trg_jl_subledger_type_lookup ← lookup validation
--   trg_jl_sync_from_header    ← denormalize header fields
--   trg_jl_updated_at          ← audit timestamp
--   trg_jl_validate_party      ← polymorphic FK validation
-- + AFTER trigger:
--   trg_jl_sync_cached_totals  ← recomputes header totals
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

-- G2a: Cached totals sync — AFTER trigger recomputes header totals from lines
DROP TRIGGER IF EXISTS trg_jl_sync_cached_totals ON document.journal_line;
CREATE TRIGGER trg_jl_sync_cached_totals
    AFTER INSERT OR UPDATE OR DELETE ON document.journal_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_je_sync_cached_totals();


-- =============================================================================
-- §  document.journal_line_reference
-- =============================================================================

DROP TRIGGER IF EXISTS trg_jlr_ref_type_lookup ON document.journal_line_reference;
CREATE TRIGGER trg_jlr_ref_type_lookup
    BEFORE INSERT OR UPDATE OF ref_type ON document.journal_line_reference
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.jlr_ref_type', 'ref_type');

DROP TRIGGER IF EXISTS trg_jlr_doc_type_lookup ON document.journal_line_reference;
CREATE TRIGGER trg_jlr_doc_type_lookup
    BEFORE INSERT OR UPDATE OF ref_doc_type ON document.journal_line_reference
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.jlr_ref_doc_type', 'ref_doc_type');


-- =============================================================================
-- =============================================================================
-- ASSET MANAGEMENT MODULE — Triggers
-- =============================================================================
-- =============================================================================


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

DROP TRIGGER IF EXISTS trg_atx_status_lookup ON document.asset_transaction;
CREATE TRIGGER trg_atx_status_lookup
    BEFORE INSERT OR UPDATE OF status ON document.asset_transaction
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.asset_transaction_status', 'status');

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

DROP TRIGGER IF EXISTS trg_dr_status_lookup ON document.depreciation_run;
CREATE TRIGGER trg_dr_status_lookup
    BEFORE INSERT OR UPDATE OF status ON document.depreciation_run
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.depreciation_run_status', 'status');

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

DROP TRIGGER IF EXISTS trg_drl_line_status_lookup ON document.depreciation_run_line;
CREATE TRIGGER trg_drl_line_status_lookup
    BEFORE INSERT OR UPDATE OF line_status ON document.depreciation_run_line
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.depreciation_run_line_status', 'line_status');


-- =============================================================================
-- §AT4  document.depreciation_schedule
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ds_updated_at ON document.depreciation_schedule;
CREATE TRIGGER trg_ds_updated_at BEFORE UPDATE ON document.depreciation_schedule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- ============================================================================
-- document.obligation_horizon
-- ============================================================================

DROP TRIGGER IF EXISTS trg_oh_updated_at ON document.obligation_horizon;
CREATE TRIGGER trg_oh_updated_at
    BEFORE UPDATE ON document.obligation_horizon
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_oh_status_changed ON document.obligation_horizon;
CREATE TRIGGER trg_oh_status_changed
    BEFORE UPDATE ON document.obligation_horizon
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTORY MANAGEMENT ENGINE — Document triggers
-- ══════════════════════════════════════════════════════════════════════════════

-- ── document.stocktake ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_st_updated_at ON document.stocktake;
CREATE TRIGGER trg_st_updated_at
    BEFORE UPDATE ON document.stocktake
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_st_status_changed ON document.stocktake;
CREATE TRIGGER trg_st_status_changed
    BEFORE UPDATE OF status ON document.stocktake
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- ── document.stocktake_line ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_stl_updated_at ON document.stocktake_line;
CREATE TRIGGER trg_stl_updated_at
    BEFORE UPDATE ON document.stocktake_line
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_stl_denorm_counts ON document.stocktake_line;
CREATE TRIGGER trg_stl_denorm_counts
    AFTER INSERT OR UPDATE OR DELETE ON document.stocktake_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_stocktake_line_denorm_counts();
