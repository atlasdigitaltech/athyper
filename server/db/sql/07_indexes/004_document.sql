-- 07_indexes/004_document.sql

-- All stages for a template ordered
CREATE INDEX IF NOT EXISTS wts_template_ordered_idx
    ON control.workflow_template_stage (workflow_template_id, stage_no ASC);

-- ── control.workflow_template_rule ───────────────────────────────────────────
-- Rules for a template stage ordered by priority
CREATE INDEX IF NOT EXISTS wtr_template_stage_idx
    ON control.workflow_template_rule (workflow_template_id, stage_no, priority ASC);

-- ── document.workflow_request ────────────────────────────────────────────────
-- Tenant active requests
CREATE INDEX IF NOT EXISTS wreq_tenant_pending_idx
    ON document.workflow_request (tenant_id, created_at DESC)
    WHERE status = 'pending';
-- Entity's workflow history
CREATE INDEX IF NOT EXISTS wreq_entity_idx
    ON document.workflow_request (entity_type, entity_id, created_at DESC);
-- Idempotency: one pending workflow per entity at a time.
-- createRequest() inserts with ON CONFLICT DO NOTHING and re-fetches on violation.
CREATE UNIQUE INDEX IF NOT EXISTS wreq_one_pending_per_entity_uix
    ON document.workflow_request (tenant_id, entity_type, entity_id)
    WHERE status = 'pending';

-- ── document.user_profile_update_request ───────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_upupr_tenant_status   ON document.user_profile_update_request (tenant_id, status);
CREATE INDEX IF NOT EXISTS ix_upupr_requested_by    ON document.user_profile_update_request (tenant_id, requested_by);
CREATE INDEX IF NOT EXISTS ix_upupr_created_by      ON document.user_profile_update_request (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS ix_upupr_principal       ON document.user_profile_update_request (tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS ix_upupr_workflow        ON document.user_profile_update_request (workflow_request_id);
CREATE INDEX IF NOT EXISTS ix_upupr_created         ON document.user_profile_update_request (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_upupr_active          ON document.user_profile_update_request (tenant_id, requested_by)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS ix_upupr_scope           ON document.user_profile_update_request USING GIN (request_scope);

-- OQ-01: One active UPUPR per principal per tenant
CREATE UNIQUE INDEX IF NOT EXISTS ix_upupr_one_active_per_principal
    ON document.user_profile_update_request (tenant_id, principal_id)
    WHERE is_active = true;


-- =============================================================================
-- §9  DOCUMENT · PRINT · BRANDING  —  document indexes
-- =============================================================================

-- ── document.render_output ─────────────────────────────────────────────────
-- Idempotency: prevents same render being queued twice concurrently
CREATE UNIQUE INDEX IF NOT EXISTS render_output_inflight_uq
    ON document.render_output
    (tenant_id, template_version_id, entity_name, entity_id, operation, variant, locale)
    WHERE status IN ('QUEUED', 'RENDERING');
CREATE INDEX IF NOT EXISTS render_output_entity_idx
    ON document.render_output (tenant_id, entity_name, entity_id);
CREATE INDEX IF NOT EXISTS render_output_status_idx
    ON document.render_output (tenant_id, status)
    WHERE status NOT IN ('ARCHIVED', 'REVOKED');

-- ── document.render_job ────────────────────────────────────────────────────
-- Worker pickup queue: pending + retrying jobs ordered by creation time
CREATE INDEX IF NOT EXISTS render_job_pending_idx
    ON document.render_job (tenant_id, created_at)
    WHERE status IN ('PENDING', 'RETRYING');
CREATE INDEX IF NOT EXISTS render_job_output_idx
    ON document.render_job (tenant_id, output_id);


-- =============================================================================
-- JOURNAL ENTRY / JOURNAL LINE — document indexes
-- =============================================================================

-- ── document.journal_entry ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS je_company_idx      ON document.journal_entry (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS je_book_idx         ON document.journal_entry (tenant_id, book_id);
CREATE INDEX IF NOT EXISTS je_period_idx       ON document.journal_entry (tenant_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS je_posting_date_idx ON document.journal_entry (tenant_id, company_code_id, posting_date);
CREATE INDEX IF NOT EXISTS je_source_doc_idx   ON document.journal_entry (tenant_id, source_doc_type, source_doc_id)
    WHERE source_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS je_reversal_idx     ON document.journal_entry (tenant_id, reversal_of_id)
    WHERE reversal_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS je_override_idx     ON document.journal_entry (tenant_id, close_override_id)
    WHERE close_override_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS je_status_idx       ON document.journal_entry (tenant_id, company_code_id, status);
CREATE INDEX IF NOT EXISTS je_auto_reverse_pidx ON document.journal_entry (tenant_id, auto_reverse_date)
    WHERE is_auto_reverse = true AND status = 'posted';

-- ── document.journal_line ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS jl_je_idx              ON document.journal_line (tenant_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS jl_company_idx         ON document.journal_line (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS jl_account_idx         ON document.journal_line (tenant_id, gl_account_id);
CREATE INDEX IF NOT EXISTS jl_cc_idx              ON document.journal_line (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_pc_idx              ON document.journal_line (tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_project_idx         ON document.journal_line (tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_site_idx            ON document.journal_line (tenant_id, site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_party_idx           ON document.journal_line (tenant_id, party_type, party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_subledger_idx       ON document.journal_line (tenant_id, subledger_type, party_id) WHERE subledger_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS jl_period_account_idx  ON document.journal_line (tenant_id, company_code_id, fiscal_year, period_number, gl_account_id);

-- ── document.journal_line_reference ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS jlr_line_idx      ON document.journal_line_reference (tenant_id, journal_line_id);
CREATE INDEX IF NOT EXISTS jlr_ref_doc_idx   ON document.journal_line_reference (tenant_id, ref_doc_type, ref_doc_id);
CREATE INDEX IF NOT EXISTS jlr_ref_line_idx  ON document.journal_line_reference (tenant_id, ref_doc_line_id) WHERE ref_doc_line_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- ASSET MANAGEMENT MODULE — Indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── document.asset_transaction ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS atx_company_idx       ON document.asset_transaction (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS atx_asset_book_idx    ON document.asset_transaction (tenant_id, asset_id, asset_book_id);
CREATE INDEX IF NOT EXISTS atx_period_idx        ON document.asset_transaction (tenant_id, company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS atx_type_idx          ON document.asset_transaction (tenant_id, company_code_id, txn_type);
CREATE INDEX IF NOT EXISTS atx_run_idx           ON document.asset_transaction (depreciation_run_id)
    WHERE depreciation_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS atx_je_idx            ON document.asset_transaction (reference_je_id)
    WHERE reference_je_id IS NOT NULL;

-- ── document.depreciation_run ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS dr_company_idx        ON document.depreciation_run (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS dr_period_idx         ON document.depreciation_run (tenant_id, company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS dr_status_idx         ON document.depreciation_run (tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS dr_idempotency_uq
    ON document.depreciation_run (tenant_id, company_code_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ── document.depreciation_run_line ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS drl_run_idx           ON document.depreciation_run_line (tenant_id, run_id);
CREATE INDEX IF NOT EXISTS drl_asset_idx         ON document.depreciation_run_line (tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS drl_book_idx          ON document.depreciation_run_line (tenant_id, asset_book_id);

-- ── document.depreciation_schedule ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ds_book_ver_idx       ON document.depreciation_schedule (tenant_id, asset_book_id, schedule_version);
CREATE INDEX IF NOT EXISTS ds_period_idx         ON document.depreciation_schedule (fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS ds_unactual_pidx      ON document.depreciation_schedule (asset_book_id, schedule_version)
    WHERE actual_amount IS NULL;

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- ============================================================================
-- document.obligation_horizon
-- ============================================================================

-- Unique: one obligation row per (tenant, commitment, schedule?, fiscal_year)
-- COALESCE handles nullable schedule_id without NULLS NOT DISTINCT.
CREATE UNIQUE INDEX IF NOT EXISTS oh_commitment_sched_year_uq
    ON document.obligation_horizon (
        tenant_id, commitment_id,
        COALESCE(schedule_id, '00000000-0000-0000-0000-000000000000'::uuid),
        fiscal_year);

CREATE INDEX IF NOT EXISTS oh_tenant_fy_idx
    ON document.obligation_horizon (tenant_id, company_code_id, fiscal_year);

CREATE INDEX IF NOT EXISTS oh_commitment_idx
    ON document.obligation_horizon (commitment_id);

-- Tier-based filtering for promotion queries
CREATE INDEX IF NOT EXISTS oh_tier_active_pidx
    ON document.obligation_horizon (obligation_tier, tenant_id, fiscal_year)
    WHERE is_active = true;


-- ── document.fx_revaluation_run ──────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS fxrr_idempotency_uq
    ON document.fx_revaluation_run (tenant_id, company_code_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS fxrr_period_idx
    ON document.fx_revaluation_run (tenant_id, company_code_id, fiscal_year, period_number);

-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Document indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── document.commitment ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cmt_tenant         ON document.commitment (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cmt_company        ON document.commitment (company_code_id);
CREATE INDEX IF NOT EXISTS idx_cmt_allocation     ON document.commitment (budget_allocation_id)
    WHERE budget_allocation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmt_status         ON document.commitment (tenant_id, status)
    WHERE status NOT IN ('fully_fulfilled','closed','cancelled','expired');
CREATE INDEX IF NOT EXISTS idx_cmt_expiry         ON document.commitment (expiry_date)
    WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmt_fiscal         ON document.commitment (tenant_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_cmt_party          ON document.commitment (party_id)
    WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmt_workflow       ON document.commitment (workflow_request_id)
    WHERE workflow_request_id IS NOT NULL;

-- ── document.forecast_scenario ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fs_tenant          ON document.forecast_scenario (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fs_company         ON document.forecast_scenario (company_code_id);
CREATE INDEX IF NOT EXISTS idx_fs_fiscal          ON document.forecast_scenario (tenant_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fs_status          ON document.forecast_scenario (tenant_id, status)
    WHERE status NOT IN ('archived','cancelled');
CREATE INDEX IF NOT EXISTS idx_fs_baseline        ON document.forecast_scenario (tenant_id, is_baseline)
    WHERE is_baseline = true;
CREATE INDEX IF NOT EXISTS idx_fs_model           ON document.forecast_scenario (planning_model_id)
    WHERE planning_model_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTORY MANAGEMENT ENGINE — Document indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── document.stocktake ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS st_warehouse_idx
    ON document.stocktake (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS st_open_pidx
    ON document.stocktake (tenant_id, company_code_id, status)
    WHERE status IN ('planned', 'in_progress');
CREATE INDEX IF NOT EXISTS st_date_idx
    ON document.stocktake (tenant_id, company_code_id, stocktake_date DESC);
CREATE INDEX IF NOT EXISTS st_variance_je_idx
    ON document.stocktake (tenant_id, variance_je_id)
    WHERE variance_je_id IS NOT NULL;

-- ── document.stocktake_line ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS stl_stocktake_idx
    ON document.stocktake_line (tenant_id, stocktake_id);
CREATE INDEX IF NOT EXISTS stl_item_idx
    ON document.stocktake_line (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS stl_warehouse_idx
    ON document.stocktake_line (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS stl_variance_pidx
    ON document.stocktake_line (tenant_id, stocktake_id)
    WHERE (counted_qty - system_qty) <> 0;

-- ══════════════════════════════════════════════════════════════════════════════
-- IC ENGINE — Document indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── document.intercompany_agreement ──────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ica_natural_uq ON document.intercompany_agreement (
    tenant_id, source_company_code_id, dest_company_code_id,
    agreement_type, effective_from,
    COALESCE(effective_to, '9999-12-31'::date)
) WHERE status IN ('draft', 'active');
CREATE INDEX IF NOT EXISTS ica_pair_idx
    ON document.intercompany_agreement (tenant_id, source_company_code_id, dest_company_code_id, agreement_type)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ica_supersedes_idx
    ON document.intercompany_agreement (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ica_company_idx
    ON document.intercompany_agreement (tenant_id, company_code_id);

-- ── document.intercompany_transaction ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ict_pair_period_idx
    ON document.intercompany_transaction (
        tenant_id, source_company_code_id, dest_company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS ict_agreement_idx
    ON document.intercompany_transaction (tenant_id, agreement_id)
    WHERE agreement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ict_mirror_idx
    ON document.intercompany_transaction (tenant_id, mirror_txn_id)
    WHERE mirror_txn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ict_netting_idx
    ON document.intercompany_transaction (tenant_id, netting_batch_id)
    WHERE netting_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ict_match_status_idx
    ON document.intercompany_transaction (tenant_id, match_status)
    WHERE match_status IN ('UNMATCHED','DISPUTED');

-- ── document.netting_batch ───────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS nb_idempotency_uq
    ON document.netting_batch (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS nb_pair_period_idx
    ON document.netting_batch (tenant_id, company_code_a_id, company_code_b_id, fiscal_year, period_number);

-- ── document.ic_elimination ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ice_pair_period_idx
    ON document.ic_elimination (tenant_id, source_company_code_id, counterparty_company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS ice_consol_group_idx
    ON document.ic_elimination (tenant_id, consolidation_group, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS ice_ic_txn_idx
    ON document.ic_elimination (tenant_id, ic_transaction_id)
    WHERE ic_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ice_approval_queue_idx
    ON document.ic_elimination (tenant_id, approval_route, status)
    WHERE status = 'calculated' AND approval_route IN ('ENHANCED','MANUAL');
