-- ============================================================================
-- document/03_constraints.sql
-- Concept: Document FKs — document → master and control FK graph
-- Depends on: 04_tables/004_document.sql and 004a–004j sub-tables
-- Merged from: (base) + 004a_document_journal.sql through 004i_document_p2p.sql
-- ============================================================================

-- ── Rebuild guard: NULL out orphaned master.supplier references ───────────────
-- master/01h_tables_business_partner.sql rebuilds master.supplier via DROP/CREATE,
-- wiping all rows. document/* tables use CREATE TABLE IF NOT EXISTS and survive
-- the rebuild with stale supplier_id values. This block must run before any
-- supplier FK is added so the constraint addition never sees an orphaned row.
DO $guard$ BEGIN
    UPDATE document.commitment_procurement     SET supplier_id = NULL WHERE supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = supplier_id);
    UPDATE document.purchase_invoice           SET supplier_id = NULL WHERE supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = supplier_id);
    UPDATE document.invoice_party_snapshot     SET supplier_id = NULL WHERE supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = supplier_id);
    UPDATE document.payment_entry              SET supplier_id = NULL WHERE supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = supplier_id);
    UPDATE document.payment_remittance_output  SET supplier_id = NULL WHERE supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = supplier_id);
    UPDATE document.purchase_order_confirmation SET supplier_id = NULL WHERE supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = supplier_id);
    UPDATE document.delivery_note              SET supplier_id = NULL WHERE supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = supplier_id);
    UPDATE document.goods_receipt              SET supplier_id = NULL WHERE supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = supplier_id);
    UPDATE document.service_entry_sheet        SET supplier_id = NULL WHERE supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = supplier_id);
    UPDATE document.party_advance_balance      SET supplier_id = NULL WHERE supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = supplier_id);
END $guard$;

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




-- ============================================================================
-- §MTC-PATCH  control.match_tolerance_config — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE control.match_tolerance_config ADD CONSTRAINT mtc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.match_tolerance_config ADD CONSTRAINT mtc_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §CMDL-PATCH  document.command_log — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.command_log ADD CONSTRAINT cmdl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §PAB-PATCH  document.party_advance_balance — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.party_advance_balance ADD CONSTRAINT pab_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.party_advance_balance ADD CONSTRAINT pab_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.party_advance_balance ADD CONSTRAINT pab_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.party_advance_balance ADD CONSTRAINT pab_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §BST-PATCH  document.bank_statement — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_bank_account_fk
    FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES master.bank_account (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_sign_off_je_fk
    FOREIGN KEY (sign_off_je_id)
    REFERENCES document.journal_entry (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_signed_off_by_fk
    FOREIGN KEY (signed_off_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §BSL-PATCH  document.bank_statement_line — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.bank_statement_line ADD CONSTRAINT bsl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_statement_line ADD CONSTRAINT bsl_statement_fk
    FOREIGN KEY (tenant_id, bank_statement_id)
    REFERENCES document.bank_statement (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Deferred: bsl_recon_case_fk added after bank_recon_case exists
DO $$ BEGIN ALTER TABLE document.bank_statement_line ADD CONSTRAINT bsl_recon_case_fk
    FOREIGN KEY (recon_case_id)
    REFERENCES document.bank_recon_case (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §BRC-PATCH  document.bank_recon_case — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_bank_account_fk
    FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES master.bank_account (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_sign_off_je_fk
    FOREIGN KEY (sign_off_je_id)
    REFERENCES document.journal_entry (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_signed_off_by_fk
    FOREIGN KEY (signed_off_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §BRCL-PATCH  document.bank_recon_case_line — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.bank_recon_case_line ADD CONSTRAINT brcl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case_line ADD CONSTRAINT brcl_case_fk
    FOREIGN KEY (tenant_id, bank_recon_case_id)
    REFERENCES document.bank_recon_case (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case_line ADD CONSTRAINT brcl_payment_fk
    FOREIGN KEY (tenant_id, payment_entry_id)
    REFERENCES document.payment_entry (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case_line ADD CONSTRAINT brcl_stmt_line_fk
    FOREIGN KEY (tenant_id, bank_statement_line_id)
    REFERENCES document.bank_statement_line (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case_line ADD CONSTRAINT brcl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §PE-BSLID-PATCH  document.payment_entry.bank_statement_line_id — FK
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_bank_stmt_line_fk
    FOREIGN KEY (bank_statement_line_id)
    REFERENCES document.bank_statement_line (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
