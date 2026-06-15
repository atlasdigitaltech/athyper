-- ============================================================================
-- document/03_constraints.sql
-- Concept: Document FKs — document → master and control FK graph
-- Depends on: 04_tables/004_document.sql and 004a–004j sub-tables
-- Merged from: (base) + 004a_document_journal.sql through 004i_document_p2p.sql
-- ============================================================================

-- ── Rebuild guard: handle orphaned master.supplier references safely ───────────
-- HF-1 (Hardening Sprint H-Fix): the original guard blindly UPDATE...SET supplier_id=NULL
-- on tables where supplier_id is NOT NULL, which would raise a constraint violation
-- and abort the rebuild.
--
-- Verified state of supplier_id column per target:
--     NULLABLE                     | NOT NULL
--     ─────────────────────────────|───────────────────────────────────
--     invoice_party_snapshot       | commitment_procurement
--     payment_entry                | delivery_note
--     purchase_invoice             | goods_receipt
--                                  | party_advance_balance  (also: no metadata col)
--                                  | payment_remittance_output
--                                  | purchase_order_confirmation
--                                  | service_entry_sheet
--
-- Strategy:
--   • Nullable columns      → UPDATE...SET supplier_id=NULL and tag in metadata
--   • NOT NULL columns      → INSERT into document.supplier_rebuild_orphan_quarantine,
--                             then RAISE EXCEPTION unless app.rebuild_force=true
--   • PAB has no metadata   → quarantine, do not touch
--
-- The quarantine table is provisioned in 01q_supplier_orphan_quarantine.sql.
-- Operator workflow: review the quarantine table → resurrect the missing supplier
-- OR delete the orphan row OR `SET LOCAL app.rebuild_force = 'true'` and re-run.
DO $guard$
DECLARE
    v_orphan_count integer := 0;
    v_force        boolean := COALESCE(NULLIF(current_setting('app.rebuild_force', true), ''), 'false') = 'true';
    v_run_started  timestamptz := now();
BEGIN
    -- ── Phase 1: nullable supplier_id targets (3 tables) ─────────────────────
    -- Safe: NULL the FK column and tag the row's metadata with the stale id.

    UPDATE document.purchase_invoice pi
       SET supplier_id = NULL,
           metadata    = COALESCE(metadata,'{}'::jsonb)
                         || jsonb_build_object('_rebuild_orphan_supplier_id', pi.supplier_id::text,
                                               '_rebuild_orphan_at',          v_run_started::text)
     WHERE pi.supplier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = pi.supplier_id);

    UPDATE document.invoice_party_snapshot ips
       SET supplier_id = NULL,
           metadata    = COALESCE(metadata,'{}'::jsonb)
                         || jsonb_build_object('_rebuild_orphan_supplier_id', ips.supplier_id::text,
                                               '_rebuild_orphan_at',          v_run_started::text)
     WHERE ips.supplier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = ips.supplier_id);

    UPDATE document.payment_entry pe
       SET supplier_id = NULL,
           metadata    = COALESCE(metadata,'{}'::jsonb)
                         || jsonb_build_object('_rebuild_orphan_supplier_id', pe.supplier_id::text,
                                               '_rebuild_orphan_at',          v_run_started::text)
     WHERE pe.supplier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = pe.supplier_id);

    -- ── Phase 2: NOT NULL supplier_id targets (7 tables) ─────────────────────
    -- Quarantine + raise. Do NOT attempt to NULL.

    INSERT INTO document.supplier_rebuild_orphan_quarantine
        (source_schema, source_table, source_id, tenant_id, stale_supplier_id, action_taken)
    SELECT 'document','commitment_procurement', cp.id, cp.tenant_id, cp.supplier_id,
           CASE WHEN v_force THEN 'force_skipped' ELSE 'detected_blocking' END
      FROM document.commitment_procurement cp
     WHERE cp.supplier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = cp.supplier_id);

    INSERT INTO document.supplier_rebuild_orphan_quarantine
        (source_schema, source_table, source_id, tenant_id, stale_supplier_id, action_taken)
    SELECT 'document','delivery_note', dn.id, dn.tenant_id, dn.supplier_id,
           CASE WHEN v_force THEN 'force_skipped' ELSE 'detected_blocking' END
      FROM document.delivery_note dn
     WHERE dn.supplier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = dn.supplier_id);

    INSERT INTO document.supplier_rebuild_orphan_quarantine
        (source_schema, source_table, source_id, tenant_id, stale_supplier_id, action_taken)
    SELECT 'document','goods_receipt', gr.id, gr.tenant_id, gr.supplier_id,
           CASE WHEN v_force THEN 'force_skipped' ELSE 'detected_blocking' END
      FROM document.goods_receipt gr
     WHERE gr.supplier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = gr.supplier_id);

    INSERT INTO document.supplier_rebuild_orphan_quarantine
        (source_schema, source_table, source_id, tenant_id, stale_supplier_id, action_taken)
    SELECT 'document','party_advance_balance', pab.id, pab.tenant_id, pab.supplier_id,
           CASE WHEN v_force THEN 'force_skipped' ELSE 'detected_blocking' END
      FROM document.party_advance_balance pab
     WHERE pab.supplier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = pab.supplier_id);

    INSERT INTO document.supplier_rebuild_orphan_quarantine
        (source_schema, source_table, source_id, tenant_id, stale_supplier_id, action_taken)
    SELECT 'document','payment_remittance_output', prm.id, prm.tenant_id, prm.supplier_id,
           CASE WHEN v_force THEN 'force_skipped' ELSE 'detected_blocking' END
      FROM document.payment_remittance_output prm
     WHERE prm.supplier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = prm.supplier_id);

    INSERT INTO document.supplier_rebuild_orphan_quarantine
        (source_schema, source_table, source_id, tenant_id, stale_supplier_id, action_taken)
    SELECT 'document','purchase_order_confirmation', poc.id, poc.tenant_id, poc.supplier_id,
           CASE WHEN v_force THEN 'force_skipped' ELSE 'detected_blocking' END
      FROM document.purchase_order_confirmation poc
     WHERE poc.supplier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = poc.supplier_id);

    INSERT INTO document.supplier_rebuild_orphan_quarantine
        (source_schema, source_table, source_id, tenant_id, stale_supplier_id, action_taken)
    SELECT 'document','service_entry_sheet', ses.id, ses.tenant_id, ses.supplier_id,
           CASE WHEN v_force THEN 'force_skipped' ELSE 'detected_blocking' END
      FROM document.service_entry_sheet ses
     WHERE ses.supplier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = ses.supplier_id);

    -- ── Phase 3: count detected_blocking from THIS run; raise unless forced ──
    SELECT COUNT(*) INTO v_orphan_count
      FROM document.supplier_rebuild_orphan_quarantine
     WHERE action_taken = 'detected_blocking'
       AND detected_at >= v_run_started;

    IF v_orphan_count > 0 AND NOT v_force THEN
        RAISE EXCEPTION
          'SUPPLIER_REBUILD_BLOCKED: % orphan row(s) in NOT NULL tables — review document.supplier_rebuild_orphan_quarantine then SET LOCAL app.rebuild_force = ''true'' and re-run to proceed',
          v_orphan_count
          USING ERRCODE = 'SP001';
    END IF;
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
