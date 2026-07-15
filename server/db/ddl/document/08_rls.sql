-- ============================================================================
-- document/08_rls.sql
-- Concept: Document RLS — transactional document tenant isolation policies
-- Depends on: 04_tables/004_document.sql and sub-tables, 05_pre_constraint_functions/001_shared.sql
-- ============================================================================

-- =============================================================================
-- §8  document.user_profile_update_request
-- =============================================================================

ALTER TABLE document.user_profile_update_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.user_profile_update_request FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON document.user_profile_update_request;
DROP POLICY IF EXISTS tenant_insert ON document.user_profile_update_request;
DROP POLICY IF EXISTS tenant_update ON document.user_profile_update_request;
DROP POLICY IF EXISTS admin_read    ON document.user_profile_update_request;

-- Tenant principal: read own tenant rows
CREATE POLICY tenant_read ON document.user_profile_update_request
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id());

-- Tenant principal: insert own tenant rows
CREATE POLICY tenant_insert ON document.user_profile_update_request
    FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());

-- Tenant principal: update own tenant rows
CREATE POLICY tenant_update ON document.user_profile_update_request
    FOR UPDATE
    USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());

-- Platform admin: read all rows (for support, auditing)
CREATE POLICY admin_read ON document.user_profile_update_request
    FOR SELECT
    TO athyperadmin
    USING (true);


-- =============================================================================
-- §9  DOCUMENT · PRINT · BRANDING  —  document RLS policies
-- =============================================================================

-- ── document.render_output ─────────────────────────────────────────────────
ALTER TABLE document.render_output ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.render_output FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.render_output;
DROP POLICY IF EXISTS tenant_insert ON document.render_output;
DROP POLICY IF EXISTS tenant_update ON document.render_output;
DROP POLICY IF EXISTS admin_read    ON document.render_output;
DROP POLICY IF EXISTS admin_write   ON document.render_output;
CREATE POLICY tenant_read   ON document.render_output FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.render_output FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.render_output FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.render_output FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.render_output FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── document.render_job ────────────────────────────────────────────────────
ALTER TABLE document.render_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.render_job FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.render_job;
DROP POLICY IF EXISTS tenant_insert ON document.render_job;
DROP POLICY IF EXISTS tenant_update ON document.render_job;
DROP POLICY IF EXISTS admin_read    ON document.render_job;
DROP POLICY IF EXISTS admin_write   ON document.render_job;
CREATE POLICY tenant_read   ON document.render_job FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.render_job FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.render_job FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.render_job FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.render_job FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ============================================================================
-- LEDGER POSTING PATH — document tables
-- ============================================================================

-- ── document.journal_entry ───────────────────────────────────────────────────
ALTER TABLE document.journal_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.journal_entry FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.journal_entry;
DROP POLICY IF EXISTS tenant_insert ON document.journal_entry;
DROP POLICY IF EXISTS tenant_update ON document.journal_entry;
DROP POLICY IF EXISTS tenant_delete ON document.journal_entry;
DROP POLICY IF EXISTS admin_read    ON document.journal_entry;
DROP POLICY IF EXISTS admin_write   ON document.journal_entry;
CREATE POLICY tenant_read   ON document.journal_entry FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.journal_entry FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.journal_entry FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON document.journal_entry FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.journal_entry FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.journal_entry FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── document.journal_line ────────────────────────────────────────────────────
ALTER TABLE document.journal_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.journal_line FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.journal_line;
DROP POLICY IF EXISTS tenant_insert ON document.journal_line;
DROP POLICY IF EXISTS tenant_update ON document.journal_line;
DROP POLICY IF EXISTS tenant_delete ON document.journal_line;
DROP POLICY IF EXISTS admin_read    ON document.journal_line;
DROP POLICY IF EXISTS admin_write   ON document.journal_line;
CREATE POLICY tenant_read   ON document.journal_line FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.journal_line FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.journal_line FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON document.journal_line FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.journal_line FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.journal_line FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── document.journal_line_reference ──────────────────────────────────────────
ALTER TABLE document.journal_line_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.journal_line_reference FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.journal_line_reference;
DROP POLICY IF EXISTS tenant_insert ON document.journal_line_reference;
DROP POLICY IF EXISTS tenant_update ON document.journal_line_reference;
DROP POLICY IF EXISTS tenant_delete ON document.journal_line_reference;
DROP POLICY IF EXISTS admin_read    ON document.journal_line_reference;
DROP POLICY IF EXISTS admin_write   ON document.journal_line_reference;
CREATE POLICY tenant_read   ON document.journal_line_reference FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.journal_line_reference FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.journal_line_reference FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON document.journal_line_reference FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.journal_line_reference FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.journal_line_reference FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- ============================================================================
-- §13  document.obligation_horizon
-- Supports lifecycle tier promotions (PLANNED → COMMITTED → CONSUMED).
-- No tenant_delete — use status=cancelled.
-- ============================================================================
ALTER TABLE document.obligation_horizon ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.obligation_horizon FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.obligation_horizon;
DROP POLICY IF EXISTS tenant_insert ON document.obligation_horizon;
DROP POLICY IF EXISTS tenant_update ON document.obligation_horizon;
DROP POLICY IF EXISTS admin_read    ON document.obligation_horizon;
DROP POLICY IF EXISTS admin_write   ON document.obligation_horizon;
CREATE POLICY tenant_read   ON document.obligation_horizon FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.obligation_horizon FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.obligation_horizon FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.obligation_horizon FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.obligation_horizon FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ============================================================================
-- MODULE AM — Fixed Asset Transactions & Depreciation
-- ============================================================================

-- ── document.asset_transaction ───────────────────────────────────────────────
-- Financial lifecycle events (acquisition, revaluation, impairment, retirement).
-- Follows journal_entry pattern: full CRUD permitted; reversals are the
-- canonical correction mechanism (reversal_of_id / is_reversal).
ALTER TABLE document.asset_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.asset_transaction FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.asset_transaction;
DROP POLICY IF EXISTS tenant_insert ON document.asset_transaction;
DROP POLICY IF EXISTS tenant_update ON document.asset_transaction;
DROP POLICY IF EXISTS tenant_delete ON document.asset_transaction;
DROP POLICY IF EXISTS admin_read    ON document.asset_transaction;
DROP POLICY IF EXISTS admin_write   ON document.asset_transaction;
CREATE POLICY tenant_read   ON document.asset_transaction FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.asset_transaction FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.asset_transaction FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON document.asset_transaction FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.asset_transaction FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.asset_transaction FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── document.depreciation_run ────────────────────────────────────────────────
-- Batch depreciation run header. Status lifecycle: planned → running → completed.
-- Mutable (status updates, error_log, run metrics during execution).
ALTER TABLE document.depreciation_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.depreciation_run FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.depreciation_run;
DROP POLICY IF EXISTS tenant_insert ON document.depreciation_run;
DROP POLICY IF EXISTS tenant_update ON document.depreciation_run;
DROP POLICY IF EXISTS tenant_delete ON document.depreciation_run;
DROP POLICY IF EXISTS admin_read    ON document.depreciation_run;
DROP POLICY IF EXISTS admin_write   ON document.depreciation_run;
CREATE POLICY tenant_read   ON document.depreciation_run FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.depreciation_run FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.depreciation_run FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON document.depreciation_run FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.depreciation_run FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.depreciation_run FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── document.depreciation_run_line ───────────────────────────────────────────
-- Per-asset detail within a depreciation run.
-- Immutable after creation — log.trg_prevent_mutation blocks UPDATE/DELETE.
-- No tenant_update or tenant_delete policies (append-only invariant at RLS level).
ALTER TABLE document.depreciation_run_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.depreciation_run_line FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.depreciation_run_line;
DROP POLICY IF EXISTS tenant_insert ON document.depreciation_run_line;
DROP POLICY IF EXISTS admin_read    ON document.depreciation_run_line;
DROP POLICY IF EXISTS admin_write   ON document.depreciation_run_line;
CREATE POLICY tenant_read   ON document.depreciation_run_line FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.depreciation_run_line FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.depreciation_run_line FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.depreciation_run_line FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── document.depreciation_schedule ──────────────────────────────────────────
-- Planned month-by-month projection. Mutable: actual_amount is back-filled
-- after each depreciation run. No tenant_delete — schedules are regenerated,
-- not deleted row-by-row.
ALTER TABLE document.depreciation_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.depreciation_schedule FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.depreciation_schedule;
DROP POLICY IF EXISTS tenant_insert ON document.depreciation_schedule;
DROP POLICY IF EXISTS tenant_update ON document.depreciation_schedule;
DROP POLICY IF EXISTS admin_read    ON document.depreciation_schedule;
DROP POLICY IF EXISTS admin_write   ON document.depreciation_schedule;
CREATE POLICY tenant_read   ON document.depreciation_schedule FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.depreciation_schedule FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.depreciation_schedule FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.depreciation_schedule FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.depreciation_schedule FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── document.wht_certificate ─────────────────────────────────────────────────
-- R7-C: tenant-scoped. Read: own tenant. Write: own tenant (draft/issue/void).
ALTER TABLE document.wht_certificate ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.wht_certificate FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON document.wht_certificate;
DROP POLICY IF EXISTS tenant_insert ON document.wht_certificate;
DROP POLICY IF EXISTS tenant_update ON document.wht_certificate;
DROP POLICY IF EXISTS admin_write   ON document.wht_certificate;
CREATE POLICY tenant_read   ON document.wht_certificate FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.wht_certificate FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.wht_certificate FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_write   ON document.wht_certificate FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── document.party_advance_balance ───────────────────────────────────────────
-- Phase 2: per-supplier advance/retention balance. Tenant-isolated read+write.
-- No delete policy: rows are only zeroed by balance mutations, never deleted.
ALTER TABLE document.party_advance_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.party_advance_balance FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON document.party_advance_balance;
DROP POLICY IF EXISTS tenant_insert ON document.party_advance_balance;
DROP POLICY IF EXISTS tenant_update ON document.party_advance_balance;
DROP POLICY IF EXISTS admin_read    ON document.party_advance_balance;
DROP POLICY IF EXISTS admin_write   ON document.party_advance_balance;
CREATE POLICY tenant_read   ON document.party_advance_balance FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.party_advance_balance FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.party_advance_balance FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.party_advance_balance FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.party_advance_balance FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── document.invoice_tax_snapshot ────────────────────────────────────────────
-- Phase 3: frozen tax determination at posting time. Append-only — no UPDATE or DELETE.
ALTER TABLE document.invoice_tax_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.invoice_tax_snapshot FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.invoice_tax_snapshot;
DROP POLICY IF EXISTS tenant_insert ON document.invoice_tax_snapshot;
DROP POLICY IF EXISTS admin_read    ON document.invoice_tax_snapshot;
DROP POLICY IF EXISTS admin_write   ON document.invoice_tax_snapshot;
CREATE POLICY tenant_read   ON document.invoice_tax_snapshot FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.invoice_tax_snapshot FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.invoice_tax_snapshot FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.invoice_tax_snapshot FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- Phase 5: Bank Statement Import & Reconciliation — RLS
-- ============================================================================

-- ── document.bank_statement ──────────────────────────────────────────────────
-- Mutable: status transitions (imported→matching→signed_off→archived) require UPDATE.
ALTER TABLE document.bank_statement ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.bank_statement FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.bank_statement;
DROP POLICY IF EXISTS tenant_insert ON document.bank_statement;
DROP POLICY IF EXISTS tenant_update ON document.bank_statement;
DROP POLICY IF EXISTS admin_read    ON document.bank_statement;
DROP POLICY IF EXISTS admin_write   ON document.bank_statement;
CREATE POLICY tenant_read   ON document.bank_statement FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.bank_statement FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.bank_statement FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.bank_statement FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.bank_statement FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── document.bank_statement_line ─────────────────────────────────────────────
-- Mutable: recon_status and recon_case_id are updated by the matching engine.
ALTER TABLE document.bank_statement_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.bank_statement_line FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.bank_statement_line;
DROP POLICY IF EXISTS tenant_insert ON document.bank_statement_line;
DROP POLICY IF EXISTS tenant_update ON document.bank_statement_line;
DROP POLICY IF EXISTS admin_read    ON document.bank_statement_line;
DROP POLICY IF EXISTS admin_write   ON document.bank_statement_line;
CREATE POLICY tenant_read   ON document.bank_statement_line FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.bank_statement_line FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.bank_statement_line FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.bank_statement_line FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.bank_statement_line FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── document.bank_recon_case ─────────────────────────────────────────────────
-- Mutable: status transitions, sign_off_je_id, matched_at/signed_off_at updated throughout lifecycle.
ALTER TABLE document.bank_recon_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.bank_recon_case FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.bank_recon_case;
DROP POLICY IF EXISTS tenant_insert ON document.bank_recon_case;
DROP POLICY IF EXISTS tenant_update ON document.bank_recon_case;
DROP POLICY IF EXISTS admin_read    ON document.bank_recon_case;
DROP POLICY IF EXISTS admin_write   ON document.bank_recon_case;
CREATE POLICY tenant_read   ON document.bank_recon_case FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.bank_recon_case FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.bank_recon_case FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.bank_recon_case FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.bank_recon_case FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── document.bank_recon_case_line ────────────────────────────────────────────
-- Append-only: matching lines are never updated or deleted. Void the case to undo.
ALTER TABLE document.bank_recon_case_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.bank_recon_case_line FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.bank_recon_case_line;
DROP POLICY IF EXISTS tenant_insert ON document.bank_recon_case_line;
DROP POLICY IF EXISTS admin_read    ON document.bank_recon_case_line;
DROP POLICY IF EXISTS admin_write   ON document.bank_recon_case_line;
CREATE POLICY tenant_read   ON document.bank_recon_case_line FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.bank_recon_case_line FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.bank_recon_case_line FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.bank_recon_case_line FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- Entity-engine coverage hardening: commitment, matching, payment allocation
-- ============================================================================

-- document.commitment: mutable document header; correction via lifecycle/status.
ALTER TABLE document.commitment ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.commitment FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.commitment;
DROP POLICY IF EXISTS tenant_insert ON document.commitment;
DROP POLICY IF EXISTS tenant_update ON document.commitment;
DROP POLICY IF EXISTS admin_read    ON document.commitment;
DROP POLICY IF EXISTS admin_write   ON document.commitment;
CREATE POLICY tenant_read   ON document.commitment FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.commitment FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.commitment FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.commitment FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.commitment FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- document.commitment_line: mutable operational line while commitment is editable.
ALTER TABLE document.commitment_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.commitment_line FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.commitment_line;
DROP POLICY IF EXISTS tenant_insert ON document.commitment_line;
DROP POLICY IF EXISTS tenant_update ON document.commitment_line;
DROP POLICY IF EXISTS admin_read    ON document.commitment_line;
DROP POLICY IF EXISTS admin_write   ON document.commitment_line;
CREATE POLICY tenant_read   ON document.commitment_line FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.commitment_line FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.commitment_line FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.commitment_line FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.commitment_line FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- document.commitment_release_allocation: mutable status/correction record.
ALTER TABLE document.commitment_release_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.commitment_release_allocation FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.commitment_release_allocation;
DROP POLICY IF EXISTS tenant_insert ON document.commitment_release_allocation;
DROP POLICY IF EXISTS tenant_update ON document.commitment_release_allocation;
DROP POLICY IF EXISTS admin_read    ON document.commitment_release_allocation;
DROP POLICY IF EXISTS admin_write   ON document.commitment_release_allocation;
CREATE POLICY tenant_read   ON document.commitment_release_allocation FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.commitment_release_allocation FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.commitment_release_allocation FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.commitment_release_allocation FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.commitment_release_allocation FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- document.invoice_match_case: matching result envelope; status updates allowed.
ALTER TABLE document.invoice_match_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.invoice_match_case FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.invoice_match_case;
DROP POLICY IF EXISTS tenant_insert ON document.invoice_match_case;
DROP POLICY IF EXISTS tenant_update ON document.invoice_match_case;
DROP POLICY IF EXISTS admin_read    ON document.invoice_match_case;
DROP POLICY IF EXISTS admin_write   ON document.invoice_match_case;
CREATE POLICY tenant_read   ON document.invoice_match_case FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.invoice_match_case FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.invoice_match_case FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.invoice_match_case FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.invoice_match_case FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- document.match_exception: exception workflow state and resolution notes.
ALTER TABLE document.match_exception ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.match_exception FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.match_exception;
DROP POLICY IF EXISTS tenant_insert ON document.match_exception;
DROP POLICY IF EXISTS tenant_update ON document.match_exception;
DROP POLICY IF EXISTS admin_read    ON document.match_exception;
DROP POLICY IF EXISTS admin_write   ON document.match_exception;
CREATE POLICY tenant_read   ON document.match_exception FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.match_exception FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.match_exception FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.match_exception FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.match_exception FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- document.payment_entry_allocation: append-only allocation lines.
ALTER TABLE document.payment_entry_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.payment_entry_allocation FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.payment_entry_allocation;
DROP POLICY IF EXISTS tenant_insert ON document.payment_entry_allocation;
DROP POLICY IF EXISTS admin_read    ON document.payment_entry_allocation;
DROP POLICY IF EXISTS admin_write   ON document.payment_entry_allocation;
CREATE POLICY tenant_read   ON document.payment_entry_allocation FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.payment_entry_allocation FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.payment_entry_allocation FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.payment_entry_allocation FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- document.schedule_line: polymorphic P2P schedule carrier (delivery / billing / release).
ALTER TABLE document.schedule_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.schedule_line FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.schedule_line;
DROP POLICY IF EXISTS tenant_insert ON document.schedule_line;
DROP POLICY IF EXISTS tenant_update ON document.schedule_line;
DROP POLICY IF EXISTS admin_read    ON document.schedule_line;
DROP POLICY IF EXISTS admin_write   ON document.schedule_line;
CREATE POLICY tenant_read   ON document.schedule_line FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.schedule_line FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.schedule_line FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.schedule_line FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.schedule_line FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- document.seed_gift: ATHQ-only prototype gift seed records with import support.
ALTER TABLE document.seed_gift ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.seed_gift FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON document.seed_gift;
DROP POLICY IF EXISTS tenant_insert ON document.seed_gift;
DROP POLICY IF EXISTS tenant_update ON document.seed_gift;
DROP POLICY IF EXISTS tenant_delete ON document.seed_gift;
DROP POLICY IF EXISTS admin_read    ON document.seed_gift;
DROP POLICY IF EXISTS admin_write   ON document.seed_gift;
CREATE POLICY tenant_read   ON document.seed_gift FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.seed_gift FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.seed_gift FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON document.seed_gift FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON document.seed_gift FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON document.seed_gift FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);
