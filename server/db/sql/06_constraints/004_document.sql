-- 06_constraints/004_document.sql
DO $$ BEGIN ALTER TABLE document.workflow_request ADD CONSTRAINT wreq_requested_by_fk
    FOREIGN KEY (requested_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.workflow_request ADD CONSTRAINT wreq_decided_by_fk
    FOREIGN KEY (decided_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.workflow_request ADD CONSTRAINT wreq_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- lifecycle_transition_gate.workflow_definition_id FK (deferred)
-- The gate table exists but the workflow_definition_id column has not yet been added.
-- Pending: ADD COLUMN workflow_definition_id uuid to control.lifecycle_transition_gate,
-- then activate the constraint below (tracked in 06_constraints/015_workflow.sql).
-- DO $$ BEGIN ALTER TABLE control.lifecycle_transition_gate ADD CONSTRAINT ltg_wdef_fk
--     FOREIGN KEY (workflow_definition_id) REFERENCES control.workflow_definition (id) ON DELETE SET NULL;
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §7  document.workflow_stage ──────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE document.workflow_stage ADD CONSTRAINT wstg_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.workflow_stage ADD CONSTRAINT wstg_request_fk
    FOREIGN KEY (tenant_id, workflow_request_id)
    REFERENCES document.workflow_request (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.workflow_stage ADD CONSTRAINT wstg_template_stage_fk
    FOREIGN KEY (template_stage_id)
    REFERENCES control.workflow_template_stage (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.workflow_stage ADD CONSTRAINT wstg_sla_fk
    FOREIGN KEY (sla_policy_id) REFERENCES control.workflow_sla_policy (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.workflow_stage ADD CONSTRAINT wstg_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §8  document.user_profile_update_request ───────────────────────────────
DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES master.tenant(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_principal_fk FOREIGN KEY (principal_id)
    REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_requested_by_fk FOREIGN KEY (requested_by)
    REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_workflow_fk FOREIGN KEY (workflow_request_id)
    REFERENCES document.workflow_request(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_scby_fk FOREIGN KEY (status_changed_by)
    REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_updated_by_fk FOREIGN KEY (updated_by)
    REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- §9  DOCUMENT · PRINT · BRANDING  —  document FK constraints
-- =============================================================================

-- ── document.render_output ─────────────────────────────────────────────────
ALTER TABLE document.render_output DROP CONSTRAINT IF EXISTS render_output_tenant_fk;
DO $$ BEGIN ALTER TABLE document.render_output ADD CONSTRAINT render_output_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.render_output ADD CONSTRAINT render_output_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.render_output ADD CONSTRAINT render_output_letterhead_fk
    FOREIGN KEY (letterhead_id)
    REFERENCES master.letterhead (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.render_output ADD CONSTRAINT render_output_brand_profile_fk
    FOREIGN KEY (brand_profile_id)
    REFERENCES master.brand_profile (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.render_output ADD CONSTRAINT render_output_template_version_fk
    FOREIGN KEY (template_version_id)
    REFERENCES snapshot.template_version (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document.render_job ────────────────────────────────────────────────────
ALTER TABLE document.render_job DROP CONSTRAINT IF EXISTS render_job_tenant_fk;
DO $$ BEGIN ALTER TABLE document.render_job ADD CONSTRAINT render_job_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.render_job ADD CONSTRAINT render_job_output_fk
    FOREIGN KEY (tenant_id, output_id)
    REFERENCES document.render_output (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.render_job ADD CONSTRAINT render_job_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document.journal_entry ───────────────────────────────────────────────────
ALTER TABLE document.journal_entry DROP CONSTRAINT IF EXISTS je_tenant_fk;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_book_fk
    FOREIGN KEY (tenant_id, book_id) REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_period_fk
    FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_reversal_of_fk
    FOREIGN KEY (reversal_of_id) REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_reversed_by_fk
    FOREIGN KEY (reversed_by_id) REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_derived_from_fk
    FOREIGN KEY (derived_from_je_id) REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_posting_rule_fk
    FOREIGN KEY (tenant_id, posting_rule_id) REFERENCES control.book_posting_rule (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_txn_currency_fk
    FOREIGN KEY (transaction_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_base_currency_fk
    FOREIGN KEY (base_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document.journal_line ────────────────────────────────────────────────────
ALTER TABLE document.journal_line DROP CONSTRAINT IF EXISTS jl_tenant_fk;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_je_fk
    FOREIGN KEY (journal_entry_id) REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_book_fk
    FOREIGN KEY (tenant_id, book_id) REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_period_fk
    FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_account_fk
    FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_cc_fk
    FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_pc_fk
    FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_project_fk
    FOREIGN KEY (tenant_id, project_id) REFERENCES master.project (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_site_fk
    FOREIGN KEY (tenant_id, site_id) REFERENCES master.site (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_dimset_fk
    FOREIGN KEY (tenant_id, dimension_set_id) REFERENCES master.dimension_set (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_txn_currency_fk
    FOREIGN KEY (transaction_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_base_currency_fk
    FOREIGN KEY (base_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line ADD CONSTRAINT jl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document.journal_line_reference ──────────────────────────────────────────
ALTER TABLE document.journal_line_reference DROP CONSTRAINT IF EXISTS jlr_tenant_fk;
DO $$ BEGIN ALTER TABLE document.journal_line_reference ADD CONSTRAINT jlr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line_reference ADD CONSTRAINT jlr_line_fk
    FOREIGN KEY (journal_line_id) REFERENCES document.journal_line (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line_reference ADD CONSTRAINT jlr_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.journal_line_reference ADD CONSTRAINT jlr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- ASSET MANAGEMENT MODULE — Foreign Key Constraints
-- ══════════════════════════════════════════════════════════════════════════════

-- ── document.asset_transaction ──────────────────────────────────────────────
ALTER TABLE document.asset_transaction DROP CONSTRAINT IF EXISTS atx_tenant_fk;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT atx_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT atx_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT atx_asset_fk
    FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT atx_book_fk
    FOREIGN KEY (tenant_id, asset_book_id) REFERENCES master.asset_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT atx_je_fk
    FOREIGN KEY (tenant_id, reference_je_id) REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT atx_reversal_fk
    FOREIGN KEY (tenant_id, reversal_of_id) REFERENCES document.asset_transaction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT atx_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT atx_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document.depreciation_run ───────────────────────────────────────────────
ALTER TABLE document.depreciation_run DROP CONSTRAINT IF EXISTS dr_tenant_fk;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT dr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT dr_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT dr_book_fk
    FOREIGN KEY (tenant_id, book_id) REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT dr_je_fk
    FOREIGN KEY (tenant_id, reference_je_id) REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT dr_reversal_fk
    FOREIGN KEY (tenant_id, reversal_of_id) REFERENCES document.depreciation_run (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT dr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document.depreciation_run_line ──────────────────────────────────────────
ALTER TABLE document.depreciation_run_line DROP CONSTRAINT IF EXISTS drl_tenant_fk;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT drl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT drl_run_fk
    FOREIGN KEY (tenant_id, run_id) REFERENCES document.depreciation_run (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT drl_asset_fk
    FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT drl_book_asset_fk
    FOREIGN KEY (tenant_id, asset_book_id, asset_id)
    REFERENCES master.asset_book (tenant_id, id, asset_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT drl_txn_fk
    FOREIGN KEY (tenant_id, asset_transaction_id)
    REFERENCES document.asset_transaction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT drl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document.depreciation_schedule ──────────────────────────────────────────
ALTER TABLE document.depreciation_schedule DROP CONSTRAINT IF EXISTS ds_tenant_fk;
DO $$ BEGIN ALTER TABLE document.depreciation_schedule ADD CONSTRAINT ds_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_schedule ADD CONSTRAINT ds_book_fk
    FOREIGN KEY (tenant_id, asset_book_id) REFERENCES master.asset_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_schedule ADD CONSTRAINT ds_run_line_fk
    FOREIGN KEY (tenant_id, actual_run_line_id)
    REFERENCES document.depreciation_run_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_schedule ADD CONSTRAINT ds_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document.asset_transaction → document.depreciation_run (cross-table) ────
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT atx_depr_run_fk
    FOREIGN KEY (tenant_id, depreciation_run_id)
    REFERENCES document.depreciation_run (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT atx_depr_run_line_fk
    FOREIGN KEY (tenant_id, depreciation_run_line_id)
    REFERENCES document.depreciation_run_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.asset_book → document.depreciation_run (cross-schema) ────────────
DO $$ BEGIN ALTER TABLE master.asset_book ADD CONSTRAINT ab_last_run_fk
    FOREIGN KEY (tenant_id, last_run_id)
    REFERENCES document.depreciation_run (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

ALTER TABLE document.obligation_horizon DROP CONSTRAINT IF EXISTS oh_tenant_fk;
DO $$ BEGIN
    ALTER TABLE document.obligation_horizon
        ADD CONSTRAINT oh_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE document.obligation_horizon
        ADD CONSTRAINT oh_cc_fk
        FOREIGN KEY (company_code_id) REFERENCES master.company_code (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- obligation_horizon → document.commitment
DO $$ BEGIN
    ALTER TABLE document.obligation_horizon
        ADD CONSTRAINT oh_commitment_fk
        FOREIGN KEY (commitment_id) REFERENCES document.commitment (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- obligation_horizon → ledger.commitment_schedule
DO $$ BEGIN
    ALTER TABLE document.obligation_horizon
        ADD CONSTRAINT oh_schedule_fk
        FOREIGN KEY (schedule_id) REFERENCES ledger.commitment_schedule (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- obligation_horizon → master.funding_profile
DO $$ BEGIN
    ALTER TABLE document.obligation_horizon
        ADD CONSTRAINT oh_fp_fk
        FOREIGN KEY (fp_id) REFERENCES master.funding_profile (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- obligation_horizon → master.business_intent
DO $$ BEGIN
    ALTER TABLE document.obligation_horizon
        ADD CONSTRAINT oh_intent_fk
        FOREIGN KEY (intent_id) REFERENCES master.business_intent (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;


-- ── document.fx_revaluation_run ──────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE document.fx_revaluation_run ADD CONSTRAINT fxrr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.fx_revaluation_run ADD CONSTRAINT fxrr_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.fx_revaluation_run ADD CONSTRAINT fxrr_book_fk
    FOREIGN KEY (tenant_id, book_id)
    REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.fx_revaluation_run ADD CONSTRAINT fxrr_currency_fk
    FOREIGN KEY (functional_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.fx_revaluation_run ADD CONSTRAINT fxrr_reval_je_fk
    FOREIGN KEY (tenant_id, revaluation_je_id)
    REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.fx_revaluation_run ADD CONSTRAINT fxrr_reversal_je_fk
    FOREIGN KEY (tenant_id, reversal_je_id)
    REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.fx_revaluation_run ADD CONSTRAINT fxrr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Document FK constraints
-- ══════════════════════════════════════════════════════════════════════════════

-- ── document.commitment ───────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.commitment
        ADD CONSTRAINT fk_cmt_tenant
            FOREIGN KEY (tenant_id) REFERENCES master.tenant (id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment
        ADD CONSTRAINT fk_cmt_allocation
            FOREIGN KEY (tenant_id, budget_allocation_id)
                REFERENCES master.budget_allocation (tenant_id, id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document.forecast_scenario ───────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.forecast_scenario
        ADD CONSTRAINT fk_fs_tenant
            FOREIGN KEY (tenant_id) REFERENCES master.tenant (id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.forecast_scenario
        ADD CONSTRAINT fk_fs_planning_model
            FOREIGN KEY (tenant_id, planning_model_id)
                REFERENCES master.planning_model (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTORY MANAGEMENT ENGINE — Document FK constraints
-- ══════════════════════════════════════════════════════════════════════════════

-- ── document.stocktake ───────────────────────────────────────────────────────
ALTER TABLE document.stocktake DROP CONSTRAINT IF EXISTS st_tenant_fk;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_warehouse_fk
    FOREIGN KEY (tenant_id, warehouse_id) REFERENCES master.warehouse (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_completed_by_fk
    FOREIGN KEY (completed_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_status_changed_by_fk
    FOREIGN KEY (status_changed_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_variance_je_fk
    FOREIGN KEY (variance_je_id) REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document.stocktake_line ──────────────────────────────────────────────────
ALTER TABLE document.stocktake_line DROP CONSTRAINT IF EXISTS stl_tenant_fk;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_stocktake_fk
    FOREIGN KEY (tenant_id, stocktake_id) REFERENCES document.stocktake (tenant_id, id)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_item_fk
    FOREIGN KEY (tenant_id, item_id) REFERENCES master.item (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_warehouse_fk
    FOREIGN KEY (tenant_id, warehouse_id) REFERENCES master.warehouse (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_posted_by_fk
    FOREIGN KEY (posted_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
