-- ============================================================================
-- document/03_constraints.sql
-- Concept: Document FKs — document → master and control FK graph
-- Depends on: 04_tables/004_document.sql and 004a–004j sub-tables
-- Merged from: (base) + 004a_document_journal.sql through 004i_document_p2p.sql
-- ============================================================================

-- ── §6  document.workflow_request ────────────────────────────────────────────
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
-- 06_constraints/004a_document_journal.sql
-- Scope: Journal / GL / FX + accounting_distribution FK constraints
-- Tables: journal_entry, journal_line, journal_line_reference,
--         fx_revaluation_run, accounting_distribution
-- Depends on: 06_constraints/003_master.sql, 06_constraints/004_document.sql,
--             04_tables/004a_document_journal.sql

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


-- ── document.accounting_distribution ─────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_gl_account_fk
        FOREIGN KEY (tenant_id, gl_account_id)
        REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id)
        REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_spend_category_fk
        FOREIGN KEY (tenant_id, spend_category_id)
        REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_encumbrance_je_fk
        FOREIGN KEY (encumbrance_je_id)
        REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 06_constraints/004b_document_commitment.sql
-- Scope: Commitment Engine foreign-key constraints
-- Tables: commitment, commitment_procurement, commitment_line,
--         commitment_release_allocation, commitment_party_snapshot,
--         commitment_address_snapshot, obligation_horizon, forecast_scenario
-- Depends on: 06_constraints/003_master.sql,
--             06_constraints/004_document.sql,
--             06_constraints/004a_document_journal.sql,
--             04_tables/004b_document_commitment.sql

-- ── document.commitment ──────────────────────────────────────────────────────
ALTER TABLE document.commitment DROP CONSTRAINT IF EXISTS cmt_tenant_fk;
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_encumbrance_je_fk
    FOREIGN KEY (encumbrance_je_id) REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_workflow_fk
    FOREIGN KEY (workflow_request_id) REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_renewed_from_fk
    FOREIGN KEY (tenant_id, renewed_from_id) REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.commitment_procurement ─────────────────────────────────────────
ALTER TABLE document.commitment_procurement DROP CONSTRAINT IF EXISTS cp_tenant_fk;
DO $$ BEGIN ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_parent_contract_fk
    FOREIGN KEY (tenant_id, parent_contract_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_payment_method_fk
    FOREIGN KEY (tenant_id, payment_method_id)
    REFERENCES master.payment_method (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_procurement ADD CONSTRAINT cp_requisition_fk
    FOREIGN KEY (tenant_id, requisition_id)
    REFERENCES document.purchase_requisition (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.commitment_line ─────────────────────────────────────────────────
ALTER TABLE document.commitment_line DROP CONSTRAINT IF EXISTS cl_tenant_fk;
DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_requisition_line_fk
    FOREIGN KEY (tenant_id, requisition_line_id)
    REFERENCES document.purchase_requisition_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_parent_line_fk
    FOREIGN KEY (tenant_id, parent_contract_line_id)
    REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_spend_category_fk
    FOREIGN KEY (tenant_id, spend_category_id)
    REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_business_intent_fk
    FOREIGN KEY (tenant_id, business_intent_id)
    REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.commitment_release_allocation ───────────────────────────────────
ALTER TABLE document.commitment_release_allocation DROP CONSTRAINT IF EXISTS cra_tenant_fk;
DO $$ BEGIN ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_parent_commitment_fk
    FOREIGN KEY (tenant_id, parent_commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_parent_line_fk
    FOREIGN KEY (tenant_id, parent_line_id)
    REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_release_commitment_fk
    FOREIGN KEY (tenant_id, release_commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_release_line_fk
    FOREIGN KEY (tenant_id, release_line_id)
    REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_release_allocation ADD CONSTRAINT cra_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.commitment_party_snapshot ──────────────────────────────────────
ALTER TABLE document.commitment_party_snapshot DROP CONSTRAINT IF EXISTS cps_tenant_fk;
DO $$ BEGIN ALTER TABLE document.commitment_party_snapshot ADD CONSTRAINT cps_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_party_snapshot ADD CONSTRAINT cps_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.commitment_address_snapshot ────────────────────────────────────
ALTER TABLE document.commitment_address_snapshot DROP CONSTRAINT IF EXISTS cas_tenant_fk;
DO $$ BEGIN ALTER TABLE document.commitment_address_snapshot ADD CONSTRAINT cas_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment_address_snapshot ADD CONSTRAINT cas_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.obligation_horizon ──────────────────────────────────────────────
ALTER TABLE document.obligation_horizon DROP CONSTRAINT IF EXISTS oh_tenant_fk;
DO $$ BEGIN ALTER TABLE document.obligation_horizon ADD CONSTRAINT oh_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.obligation_horizon ADD CONSTRAINT oh_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.obligation_horizon ADD CONSTRAINT oh_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.obligation_horizon ADD CONSTRAINT oh_fp_fk
    FOREIGN KEY (tenant_id, fp_id)
    REFERENCES master.fiscal_period (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.obligation_horizon ADD CONSTRAINT oh_intent_fk
    FOREIGN KEY (tenant_id, intent_id)
    REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.obligation_horizon ADD CONSTRAINT oh_schedule_fk
    FOREIGN KEY (tenant_id, schedule_id)
    REFERENCES ledger.commitment_schedule (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.obligation_horizon ADD CONSTRAINT oh_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.forecast_scenario ───────────────────────────────────────────────
ALTER TABLE document.forecast_scenario DROP CONSTRAINT IF EXISTS fs_tenant_fk;
DO $$ BEGIN ALTER TABLE document.forecast_scenario ADD CONSTRAINT fs_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.forecast_scenario ADD CONSTRAINT fs_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.forecast_scenario ADD CONSTRAINT fs_planning_model_fk
    FOREIGN KEY (tenant_id, planning_model_id)
    REFERENCES master.planning_model (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.forecast_scenario ADD CONSTRAINT fs_based_on_fk
    FOREIGN KEY (tenant_id, based_on_scenario_id)
    REFERENCES document.forecast_scenario (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.forecast_scenario ADD CONSTRAINT fs_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 06_constraints/004c_document_attachments.sql
-- FK constraints and live-DB fixups for document.doc_attachment.
-- Idempotent: EXCEPTION WHEN duplicate_object / column_already_exists guards.
-- Depends on: 04_tables/004c_document_attachments.sql

-- ── Live-DB column fixups (table already exists in dev; re-run safe) ─────────

-- Add missing audit columns (no-op if already present)
ALTER TABLE document.doc_attachment
    ADD COLUMN IF NOT EXISTS updated_at  timestamptz,
    ADD COLUMN IF NOT EXISTS updated_by  uuid;

-- Harden created_by to NOT NULL (safe: table has no data at time of migration)
ALTER TABLE document.doc_attachment
    ALTER COLUMN created_by SET NOT NULL;

-- Add UNIQUE (tenant_id, id) if not already present
-- duplicate_table (42P07) is raised on fresh DBs where the constraint is already
-- defined inline in the CREATE TABLE; duplicate_object (42710) is raised on old
-- DBs that had the constraint added via ALTER TABLE previously.
DO $$ BEGIN
    ALTER TABLE document.doc_attachment
        ADD CONSTRAINT doc_attachment_tenant_id_uq UNIQUE (tenant_id, id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── FK constraints ────────────────────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE document.doc_attachment
        ADD CONSTRAINT da_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.doc_attachment
        ADD CONSTRAINT da_uploaded_by_fk
        FOREIGN KEY (uploaded_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.doc_attachment
        ADD CONSTRAINT da_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.doc_attachment
        ADD CONSTRAINT da_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 06_constraints/004d_document_invoice.sql
-- Scope: Invoice domain foreign-key constraints
-- Tables: purchase_invoice, purchase_invoice_line,
--         invoice_party_snapshot, invoice_address_snapshot,
--         invoice_bank_snapshot, invoice_tax_snapshot,
--         invoice_match_case, match_exception,
--         payment_term_application
-- Depends on: 06_constraints/003_master.sql,
--             06_constraints/004_document.sql,
--             06_constraints/004a_document_journal.sql,
--             06_constraints/004b_document_commitment.sql,
--             06_constraints/004c_document_p2p.sql,
--             04_tables/004d_document_invoice.sql

-- ── document.purchase_invoice ─────────────────────────────────────────────────
ALTER TABLE document.purchase_invoice DROP CONSTRAINT IF EXISTS pi_tenant_fk;
DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_payment_method_fk
    FOREIGN KEY (tenant_id, payment_method_id)
    REFERENCES master.payment_method (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_workflow_fk
    FOREIGN KEY (workflow_request_id)
    REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_ap_je_fk
    FOREIGN KEY (ap_je_id)
    REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_reversal_of_fk
    FOREIGN KEY (tenant_id, reversal_of_id)
    REFERENCES document.purchase_invoice (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.purchase_invoice_line ───────────────────────────────────────────
ALTER TABLE document.purchase_invoice_line DROP CONSTRAINT IF EXISTS pil_tenant_fk;
DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_invoice_fk
    FOREIGN KEY (tenant_id, purchase_invoice_id)
    REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_commitment_line_fk
    FOREIGN KEY (tenant_id, commitment_line_id)
    REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_gr_line_fk
    FOREIGN KEY (tenant_id, goods_receipt_line_id)
    REFERENCES document.goods_receipt_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_ses_line_fk
    FOREIGN KEY (tenant_id, ses_line_id)
    REFERENCES document.service_entry_sheet_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_spend_category_fk
    FOREIGN KEY (tenant_id, spend_category_id)
    REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_business_intent_fk
    FOREIGN KEY (tenant_id, business_intent_id)
    REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.invoice_party_snapshot ──────────────────────────────────────────
ALTER TABLE document.invoice_party_snapshot DROP CONSTRAINT IF EXISTS ips_tenant_fk;
DO $$ BEGIN ALTER TABLE document.invoice_party_snapshot ADD CONSTRAINT ips_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.invoice_party_snapshot ADD CONSTRAINT ips_invoice_fk
    FOREIGN KEY (tenant_id, purchase_invoice_id)
    REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.invoice_party_snapshot ADD CONSTRAINT ips_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.invoice_address_snapshot ────────────────────────────────────────
ALTER TABLE document.invoice_address_snapshot DROP CONSTRAINT IF EXISTS ias_tenant_fk;
DO $$ BEGIN ALTER TABLE document.invoice_address_snapshot ADD CONSTRAINT ias_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.invoice_address_snapshot ADD CONSTRAINT ias_invoice_fk
    FOREIGN KEY (tenant_id, purchase_invoice_id)
    REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.invoice_bank_snapshot ───────────────────────────────────────────
ALTER TABLE document.invoice_bank_snapshot DROP CONSTRAINT IF EXISTS ibs_tenant_fk;
DO $$ BEGIN ALTER TABLE document.invoice_bank_snapshot ADD CONSTRAINT ibs_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.invoice_bank_snapshot ADD CONSTRAINT ibs_invoice_fk
    FOREIGN KEY (tenant_id, purchase_invoice_id)
    REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.invoice_tax_snapshot ────────────────────────────────────────────
ALTER TABLE document.invoice_tax_snapshot DROP CONSTRAINT IF EXISTS its_tenant_fk;
DO $$ BEGIN ALTER TABLE document.invoice_tax_snapshot ADD CONSTRAINT its_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.invoice_tax_snapshot ADD CONSTRAINT its_invoice_fk
    FOREIGN KEY (tenant_id, purchase_invoice_id)
    REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.invoice_tax_snapshot ADD CONSTRAINT its_invoice_line_fk
    FOREIGN KEY (tenant_id, invoice_line_id)
    REFERENCES document.purchase_invoice_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.invoice_match_case ──────────────────────────────────────────────
ALTER TABLE document.invoice_match_case DROP CONSTRAINT IF EXISTS imc_tenant_fk;
DO $$ BEGIN ALTER TABLE document.invoice_match_case ADD CONSTRAINT imc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.invoice_match_case ADD CONSTRAINT imc_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.invoice_match_case ADD CONSTRAINT imc_invoice_fk
    FOREIGN KEY (tenant_id, purchase_invoice_id)
    REFERENCES document.purchase_invoice (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.invoice_match_case ADD CONSTRAINT imc_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.match_exception ──────────────────────────────────────────────────
ALTER TABLE document.match_exception DROP CONSTRAINT IF EXISTS me_tenant_fk;
DO $$ BEGIN ALTER TABLE document.match_exception ADD CONSTRAINT me_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.match_exception ADD CONSTRAINT me_match_case_fk
    FOREIGN KEY (tenant_id, invoice_match_case_id)
    REFERENCES document.invoice_match_case (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.match_exception ADD CONSTRAINT me_invoice_line_fk
    FOREIGN KEY (tenant_id, invoice_line_id)
    REFERENCES document.purchase_invoice_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.match_exception ADD CONSTRAINT me_workflow_fk
    FOREIGN KEY (workflow_request_id)
    REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.payment_term_application ────────────────────────────────────────
ALTER TABLE document.payment_term_application DROP CONSTRAINT IF EXISTS pta_tenant_fk;
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_clause_fk
    FOREIGN KEY (tenant_id, clause_id)
    REFERENCES master.payment_term_clause (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_schedule_fk
    FOREIGN KEY (tenant_id, schedule_id)
    REFERENCES ledger.commitment_schedule (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_workflow_fk
    FOREIGN KEY (tenant_id, workflow_request_id)
    REFERENCES document.workflow_request (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_reversed_by_fk
    FOREIGN KEY (tenant_id, reversed_by_application_id)
    REFERENCES document.payment_term_application (tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_superseded_by_fk
    FOREIGN KEY (tenant_id, superseded_by_application_id)
    REFERENCES document.payment_term_application (tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 06_constraints/004e_document_payment.sql
-- Scope: Payment domain foreign-key constraints
-- Tables: payment_entry, payment_entry_allocation,
--         payment_remittance_output, payment_term_discount_result
-- Depends on: 06_constraints/003_master.sql,
--             06_constraints/004_document.sql,
--             06_constraints/004a_document_journal.sql,
--             06_constraints/004b_document_commitment.sql,
--             06_constraints/004d_document_invoice.sql,
--             04_tables/004e_document_payment.sql

-- ── document.payment_entry ────────────────────────────────────────────────────
ALTER TABLE document.payment_entry DROP CONSTRAINT IF EXISTS pe_tenant_fk;
DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_payment_method_fk
    FOREIGN KEY (tenant_id, payment_method_id)
    REFERENCES master.payment_method (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_bank_account_fk
    FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES master.bank_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_supplier_bank_link_fk
    FOREIGN KEY (tenant_id, supplier_bank_link_id)
    REFERENCES master.bank_account_link (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_workflow_fk
    FOREIGN KEY (workflow_request_id)
    REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_payment_je_fk
    FOREIGN KEY (payment_je_id)
    REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_reversal_of_fk
    FOREIGN KEY (tenant_id, reversal_of_id)
    REFERENCES document.payment_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.payment_entry_allocation ────────────────────────────────────────
ALTER TABLE document.payment_entry_allocation DROP CONSTRAINT IF EXISTS pea_tenant_fk;
DO $$ BEGIN ALTER TABLE document.payment_entry_allocation ADD CONSTRAINT pea_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry_allocation ADD CONSTRAINT pea_payment_fk
    FOREIGN KEY (tenant_id, payment_entry_id)
    REFERENCES document.payment_entry (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry_allocation ADD CONSTRAINT pea_invoice_fk
    FOREIGN KEY (tenant_id, purchase_invoice_id)
    REFERENCES document.purchase_invoice (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry_allocation ADD CONSTRAINT pea_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_entry_allocation ADD CONSTRAINT pea_pta_fk
    FOREIGN KEY (tenant_id, payment_term_application_id)
    REFERENCES document.payment_term_application (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.payment_remittance_output ───────────────────────────────────────
ALTER TABLE document.payment_remittance_output DROP CONSTRAINT IF EXISTS pro_tenant_fk;
DO $$ BEGIN ALTER TABLE document.payment_remittance_output ADD CONSTRAINT pro_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_remittance_output ADD CONSTRAINT pro_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_remittance_output ADD CONSTRAINT pro_payment_fk
    FOREIGN KEY (tenant_id, payment_entry_id)
    REFERENCES document.payment_entry (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_remittance_output ADD CONSTRAINT pro_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_remittance_output ADD CONSTRAINT pro_render_output_fk
    FOREIGN KEY (render_output_id)
    REFERENCES document.render_output (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.payment_term_discount_result ────────────────────────────────────
ALTER TABLE document.payment_term_discount_result DROP CONSTRAINT IF EXISTS ptdr_tenant_fk;
DO $$ BEGIN ALTER TABLE document.payment_term_discount_result ADD CONSTRAINT ptdr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_discount_result ADD CONSTRAINT ptdr_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_discount_result ADD CONSTRAINT ptdr_tier_fk
    FOREIGN KEY (tenant_id, discount_tier_id)
    REFERENCES master.payment_term_discount_tier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_discount_result ADD CONSTRAINT ptdr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.payment_term_discount_result ADD CONSTRAINT ptdr_reverses_fk
    FOREIGN KEY (tenant_id, reverses_id)
    REFERENCES document.payment_term_discount_result (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 06_constraints/004f_document_assets.sql
-- Scope: Fixed Asset Transaction foreign-key constraints
-- Tables: asset_transaction, depreciation_run, depreciation_run_line,
--         depreciation_schedule
-- Depends on: 06_constraints/003_master.sql,
--             06_constraints/004a_document_journal.sql,
--             04_tables/004f_document_assets.sql

-- ── document.asset_transaction ───────────────────────────────────────────────
ALTER TABLE document.asset_transaction DROP CONSTRAINT IF EXISTS asset_txn_tenant_fk;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT asset_txn_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT asset_txn_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT asset_txn_asset_fk
    FOREIGN KEY (tenant_id, asset_id)
    REFERENCES master.asset (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT asset_txn_asset_book_fk
    FOREIGN KEY (tenant_id, asset_book_id)
    REFERENCES master.asset_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT asset_txn_je_fk
    FOREIGN KEY (reference_je_id)
    REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT asset_txn_depr_run_fk
    FOREIGN KEY (tenant_id, depreciation_run_id)
    REFERENCES document.depreciation_run (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT asset_txn_depr_run_line_fk
    FOREIGN KEY (tenant_id, depreciation_run_line_id)
    REFERENCES document.depreciation_run_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT asset_txn_reversal_of_fk
    FOREIGN KEY (tenant_id, reversal_of_id)
    REFERENCES document.asset_transaction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT asset_txn_performed_by_fk
    FOREIGN KEY (performed_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.asset_transaction ADD CONSTRAINT asset_txn_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.depreciation_run ────────────────────────────────────────────────
ALTER TABLE document.depreciation_run DROP CONSTRAINT IF EXISTS depreciation_run_tenant_fk;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT depreciation_run_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT depreciation_run_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT depreciation_run_book_fk
    FOREIGN KEY (tenant_id, book_id)
    REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT depreciation_run_je_fk
    FOREIGN KEY (reference_je_id)
    REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT depreciation_run_reversal_of_fk
    FOREIGN KEY (tenant_id, reversal_of_id)
    REFERENCES document.depreciation_run (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT depreciation_run_run_by_fk
    FOREIGN KEY (run_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run ADD CONSTRAINT depreciation_run_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.depreciation_run_line ───────────────────────────────────────────
ALTER TABLE document.depreciation_run_line DROP CONSTRAINT IF EXISTS depreciation_run_line_tenant_fk;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT depreciation_run_line_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT depreciation_run_line_run_fk
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES document.depreciation_run (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT depreciation_run_line_asset_book_fk
    FOREIGN KEY (tenant_id, asset_book_id, asset_id)
    REFERENCES master.asset_book (tenant_id, id, asset_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT depreciation_run_line_asset_txn_fk
    FOREIGN KEY (tenant_id, asset_transaction_id)
    REFERENCES document.asset_transaction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_run_line ADD CONSTRAINT depreciation_run_line_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.depreciation_schedule ──────────────────────────────────────────
ALTER TABLE document.depreciation_schedule DROP CONSTRAINT IF EXISTS depreciation_schedule_tenant_fk;
DO $$ BEGIN ALTER TABLE document.depreciation_schedule ADD CONSTRAINT depreciation_schedule_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_schedule ADD CONSTRAINT depreciation_schedule_asset_book_fk
    FOREIGN KEY (tenant_id, asset_book_id)
    REFERENCES master.asset_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_schedule ADD CONSTRAINT depreciation_schedule_run_line_fk
    FOREIGN KEY (tenant_id, actual_run_line_id)
    REFERENCES document.depreciation_run_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.depreciation_schedule ADD CONSTRAINT depreciation_schedule_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 06_constraints/004g_document_ic.sql
-- Scope: Intercompany Engine foreign-key constraints
-- Tables: intercompany_agreement, intercompany_transaction,
--         netting_batch, ic_elimination
-- Depends on: 06_constraints/003_master.sql,
--             06_constraints/004_document.sql,
--             06_constraints/004a_document_journal.sql,
--             04_tables/004g_document_ic.sql

-- ── document.intercompany_agreement ──────────────────────────────────────────
ALTER TABLE document.intercompany_agreement DROP CONSTRAINT IF EXISTS ica_tenant_fk;
DO $$ BEGIN ALTER TABLE document.intercompany_agreement ADD CONSTRAINT ica_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_agreement ADD CONSTRAINT ica_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_agreement ADD CONSTRAINT ica_source_company_fk
    FOREIGN KEY (tenant_id, source_company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_agreement ADD CONSTRAINT ica_dest_company_fk
    FOREIGN KEY (tenant_id, dest_company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_agreement ADD CONSTRAINT ica_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_agreement ADD CONSTRAINT ica_supersedes_fk
    FOREIGN KEY (tenant_id, supersedes_id)
    REFERENCES document.intercompany_agreement (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_agreement ADD CONSTRAINT ica_workflow_fk
    FOREIGN KEY (workflow_request_id)
    REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_agreement ADD CONSTRAINT ica_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.intercompany_transaction ────────────────────────────────────────
ALTER TABLE document.intercompany_transaction DROP CONSTRAINT IF EXISTS ict_tenant_fk;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_source_company_fk
    FOREIGN KEY (tenant_id, source_company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_dest_company_fk
    FOREIGN KEY (tenant_id, dest_company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_agreement_fk
    FOREIGN KEY (tenant_id, agreement_id)
    REFERENCES document.intercompany_agreement (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_source_je_fk
    FOREIGN KEY (tenant_id, source_je_id)
    REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_dest_je_fk
    FOREIGN KEY (tenant_id, dest_je_id)
    REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_mirror_fk
    FOREIGN KEY (tenant_id, mirror_txn_id)
    REFERENCES document.intercompany_transaction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_netting_batch_fk
    FOREIGN KEY (tenant_id, netting_batch_id)
    REFERENCES document.netting_batch (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.intercompany_transaction ADD CONSTRAINT ict_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.netting_batch ────────────────────────────────────────────────────
ALTER TABLE document.netting_batch DROP CONSTRAINT IF EXISTS nb_tenant_fk;
DO $$ BEGIN ALTER TABLE document.netting_batch ADD CONSTRAINT nb_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.netting_batch ADD CONSTRAINT nb_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.netting_batch ADD CONSTRAINT nb_company_a_fk
    FOREIGN KEY (tenant_id, company_code_a_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.netting_batch ADD CONSTRAINT nb_company_b_fk
    FOREIGN KEY (tenant_id, company_code_b_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.netting_batch ADD CONSTRAINT nb_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.netting_batch ADD CONSTRAINT nb_settlement_je_fk
    FOREIGN KEY (tenant_id, settlement_je_id)
    REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.netting_batch ADD CONSTRAINT nb_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.ic_elimination ──────────────────────────────────────────────────
ALTER TABLE document.ic_elimination DROP CONSTRAINT IF EXISTS ice_tenant_fk;
DO $$ BEGIN ALTER TABLE document.ic_elimination ADD CONSTRAINT ice_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.ic_elimination ADD CONSTRAINT ice_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.ic_elimination ADD CONSTRAINT ice_source_company_fk
    FOREIGN KEY (tenant_id, source_company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.ic_elimination ADD CONSTRAINT ice_counterparty_company_fk
    FOREIGN KEY (tenant_id, counterparty_company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.ic_elimination ADD CONSTRAINT ice_book_fk
    FOREIGN KEY (tenant_id, book_id)
    REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.ic_elimination ADD CONSTRAINT ice_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.ic_elimination ADD CONSTRAINT ice_ic_txn_fk
    FOREIGN KEY (tenant_id, ic_transaction_id)
    REFERENCES document.intercompany_transaction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.ic_elimination ADD CONSTRAINT ice_je_fk
    FOREIGN KEY (tenant_id, je_id)
    REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.ic_elimination ADD CONSTRAINT ice_reversal_je_fk
    FOREIGN KEY (tenant_id, reversal_je_id)
    REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.ic_elimination ADD CONSTRAINT ice_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 06_constraints/004h_document_inventory.sql
-- Scope: Inventory Management foreign-key constraints
-- Tables: stocktake, stocktake_line
-- Depends on: 06_constraints/003_master.sql,
--             06_constraints/004a_document_journal.sql,
--             04_tables/004h_document_inventory.sql

-- ── document.stocktake ───────────────────────────────────────────────────────
ALTER TABLE document.stocktake DROP CONSTRAINT IF EXISTS st_tenant_fk;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_warehouse_fk
    FOREIGN KEY (tenant_id, warehouse_id)
    REFERENCES master.warehouse (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_variance_je_fk
    FOREIGN KEY (tenant_id, variance_je_id)
    REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_completed_by_fk
    FOREIGN KEY (completed_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake ADD CONSTRAINT st_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.stocktake_line ──────────────────────────────────────────────────
ALTER TABLE document.stocktake_line DROP CONSTRAINT IF EXISTS stl_tenant_fk;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_stocktake_fk
    FOREIGN KEY (tenant_id, stocktake_id)
    REFERENCES document.stocktake (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_warehouse_fk
    FOREIGN KEY (tenant_id, warehouse_id)
    REFERENCES master.warehouse (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.stocktake_line ADD CONSTRAINT stl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 06_constraints/004i_document_p2p.sql
-- Scope: P2P document foreign-key constraints
-- Tables: purchase_requisition, purchase_requisition_line,
--         purchase_order_confirmation, purchase_order_confirmation_line,
--         delivery_note, delivery_note_line,
--         goods_receipt, goods_receipt_line,
--         service_entry_sheet, service_entry_sheet_line
-- Depends on: 06_constraints/003_master.sql,
--             06_constraints/004_document.sql,
--             06_constraints/004a_document_journal.sql,
--             06_constraints/004b_document_commitment.sql,
--             04_tables/004i_document_p2p.sql

-- ── document.purchase_requisition ────────────────────────────────────────────
ALTER TABLE document.purchase_requisition DROP CONSTRAINT IF EXISTS pr_tenant_fk;
DO $$ BEGIN ALTER TABLE document.purchase_requisition ADD CONSTRAINT pr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_requisition ADD CONSTRAINT pr_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_requisition ADD CONSTRAINT pr_workflow_fk
    FOREIGN KEY (workflow_request_id)
    REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_requisition ADD CONSTRAINT pr_encumbrance_je_fk
    FOREIGN KEY (encumbrance_je_id)
    REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.purchase_requisition_line ───────────────────────────────────────
ALTER TABLE document.purchase_requisition_line DROP CONSTRAINT IF EXISTS prl_tenant_fk;
DO $$ BEGIN ALTER TABLE document.purchase_requisition_line ADD CONSTRAINT prl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_requisition_line ADD CONSTRAINT prl_pr_fk
    FOREIGN KEY (tenant_id, purchase_requisition_id)
    REFERENCES document.purchase_requisition (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_requisition_line ADD CONSTRAINT prl_spend_category_fk
    FOREIGN KEY (tenant_id, spend_category_id)
    REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_requisition_line ADD CONSTRAINT prl_business_intent_fk
    FOREIGN KEY (tenant_id, business_intent_id)
    REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.purchase_order_confirmation ─────────────────────────────────────
ALTER TABLE document.purchase_order_confirmation DROP CONSTRAINT IF EXISTS poc_tenant_fk;
DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_amendment_fk
    FOREIGN KEY (tenant_id, amendment_commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.purchase_order_confirmation_line ────────────────────────────────
ALTER TABLE document.purchase_order_confirmation_line DROP CONSTRAINT IF EXISTS pocl_tenant_fk;
DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation_line ADD CONSTRAINT pocl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation_line ADD CONSTRAINT pocl_confirmation_fk
    FOREIGN KEY (tenant_id, confirmation_id)
    REFERENCES document.purchase_order_confirmation (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation_line ADD CONSTRAINT pocl_commitment_line_fk
    FOREIGN KEY (tenant_id, commitment_line_id)
    REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.delivery_note ───────────────────────────────────────────────────
ALTER TABLE document.delivery_note DROP CONSTRAINT IF EXISTS dn_tenant_fk;
DO $$ BEGIN ALTER TABLE document.delivery_note ADD CONSTRAINT dn_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.delivery_note ADD CONSTRAINT dn_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.delivery_note ADD CONSTRAINT dn_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.delivery_note ADD CONSTRAINT dn_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.delivery_note ADD CONSTRAINT dn_site_fk
    FOREIGN KEY (tenant_id, delivery_site_id)
    REFERENCES master.site (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.delivery_note_line ──────────────────────────────────────────────
ALTER TABLE document.delivery_note_line DROP CONSTRAINT IF EXISTS dnl_tenant_fk;
DO $$ BEGIN ALTER TABLE document.delivery_note_line ADD CONSTRAINT dnl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.delivery_note_line ADD CONSTRAINT dnl_delivery_note_fk
    FOREIGN KEY (tenant_id, delivery_note_id)
    REFERENCES document.delivery_note (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.delivery_note_line ADD CONSTRAINT dnl_commitment_line_fk
    FOREIGN KEY (tenant_id, commitment_line_id)
    REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.goods_receipt ───────────────────────────────────────────────────
ALTER TABLE document.goods_receipt DROP CONSTRAINT IF EXISTS gr_tenant_fk;
DO $$ BEGIN ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_delivery_note_fk
    FOREIGN KEY (tenant_id, delivery_note_id)
    REFERENCES document.delivery_note (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_accrual_je_fk
    FOREIGN KEY (accrual_je_id)
    REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_reversal_of_fk
    FOREIGN KEY (tenant_id, reversal_of_id)
    REFERENCES document.goods_receipt (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt ADD CONSTRAINT gr_workflow_fk
    FOREIGN KEY (workflow_request_id)
    REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.goods_receipt_line ──────────────────────────────────────────────
ALTER TABLE document.goods_receipt_line DROP CONSTRAINT IF EXISTS grl_tenant_fk;
DO $$ BEGIN ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_gr_fk
    FOREIGN KEY (tenant_id, goods_receipt_id)
    REFERENCES document.goods_receipt (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_commitment_line_fk
    FOREIGN KEY (tenant_id, commitment_line_id)
    REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_delivery_note_line_fk
    FOREIGN KEY (tenant_id, delivery_note_line_id)
    REFERENCES document.delivery_note_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_inventory_movement_fk
    FOREIGN KEY (tenant_id, inventory_movement_id)
    REFERENCES ledger.inventory_movement (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.goods_receipt_line ADD CONSTRAINT grl_fulfillment_fk
    FOREIGN KEY (tenant_id, fulfillment_id)
    REFERENCES ledger.commitment_fulfillment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.service_entry_sheet ─────────────────────────────────────────────
ALTER TABLE document.service_entry_sheet DROP CONSTRAINT IF EXISTS ses_tenant_fk;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_accrual_je_fk
    FOREIGN KEY (accrual_je_id)
    REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_reversal_of_fk
    FOREIGN KEY (tenant_id, reversal_of_id)
    REFERENCES document.service_entry_sheet (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet ADD CONSTRAINT ses_workflow_fk
    FOREIGN KEY (workflow_request_id)
    REFERENCES document.workflow_request (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── document.service_entry_sheet_line ────────────────────────────────────────
ALTER TABLE document.service_entry_sheet_line DROP CONSTRAINT IF EXISTS sesl_tenant_fk;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_ses_fk
    FOREIGN KEY (tenant_id, service_entry_sheet_id)
    REFERENCES document.service_entry_sheet (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_commitment_line_fk
    FOREIGN KEY (tenant_id, commitment_line_id)
    REFERENCES document.commitment_line (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_fulfillment_fk
    FOREIGN KEY (tenant_id, fulfillment_id)
    REFERENCES ledger.commitment_fulfillment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_spend_category_fk
    FOREIGN KEY (tenant_id, spend_category_id)
    REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_business_intent_fk
    FOREIGN KEY (tenant_id, business_intent_id)
    REFERENCES master.business_intent (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
