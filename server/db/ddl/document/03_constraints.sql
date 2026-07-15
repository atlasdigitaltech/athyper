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
--     payment_entry                | commitment_procurement
--     purchase_invoice             | delivery_note
--                                  | receipt
--                                  | party_advance_balance  (also: no metadata col)
--                                  | payment_remittance_output
--                                  | purchase_order_confirmation
--                                  | service_sheet
--
-- Phase D.4 — invoice_party_snapshot was dropped; supplier identity now
-- flows through document.purchase_invoice.supplier_id and live master joins.
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
-- Phase 1 canonical full reset: supplier orphan recovery guard is intentionally
-- omitted from the reset DDL. Fresh schemas start empty and FK constraints below
-- enforce supplier integrity from creation time.

-- ── §6  document.workflow_request ────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE document.workflow_request ADD CONSTRAINT wreq_requested_by_fk
    FOREIGN KEY (requested_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE document.workflow_request ADD CONSTRAINT wreq_decided_by_fk
    FOREIGN KEY (decided_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE document.workflow_request ADD CONSTRAINT wreq_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
-- lifecycle_transition_gate.workflow_definition_id FK (deferred)
-- The gate table exists but the workflow_definition_id column has not yet been added.
-- Pending: ADD COLUMN workflow_definition_id uuid to control.lifecycle_transition_gate,
-- then activate the constraint below (tracked in 06_constraints/015_workflow.sql).
-- DO $$ BEGIN ALTER TABLE control.lifecycle_transition_gate ADD CONSTRAINT ltg_wdef_fk
--     FOREIGN KEY (workflow_definition_id) REFERENCES control.workflow_definition (id) ON DELETE SET NULL;
-- EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ── §7  document.workflow_stage ──────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE document.workflow_stage ADD CONSTRAINT wstg_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE document.workflow_stage ADD CONSTRAINT wstg_request_fk
    FOREIGN KEY (tenant_id, workflow_request_id)
    REFERENCES document.workflow_request (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE document.workflow_stage ADD CONSTRAINT wstg_template_stage_fk
    FOREIGN KEY (template_stage_id)
    REFERENCES control.workflow_template_stage (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE document.workflow_stage ADD CONSTRAINT wstg_sla_fk
    FOREIGN KEY (sla_policy_id) REFERENCES control.workflow_sla_policy (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE document.workflow_stage ADD CONSTRAINT wstg_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ── §8  document.user_profile_update_request ───────────────────────────────
DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES master.tenant(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_principal_fk FOREIGN KEY (principal_id)
    REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_requested_by_fk FOREIGN KEY (requested_by)
    REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_workflow_fk FOREIGN KEY (workflow_request_id)
    REFERENCES document.workflow_request(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_scby_fk FOREIGN KEY (status_changed_by)
    REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.user_profile_update_request
    ADD CONSTRAINT upupr_updated_by_fk FOREIGN KEY (updated_by)
    REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;




-- ============================================================================
-- §MTC-PATCH  control.match_tolerance_config — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE control.match_tolerance_config ADD CONSTRAINT mtc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE control.match_tolerance_config ADD CONSTRAINT mtc_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ============================================================================
-- §CMDL-PATCH  document.command_log — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.command_log ADD CONSTRAINT cmdl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ============================================================================
-- §PAB-PATCH  document.party_advance_balance — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.party_advance_balance ADD CONSTRAINT pab_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.party_advance_balance ADD CONSTRAINT pab_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.party_advance_balance ADD CONSTRAINT pab_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.party_advance_balance ADD CONSTRAINT pab_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ============================================================================
-- §BST-PATCH  document.bank_statement — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_bank_account_fk
    FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES master.bank_account (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_sign_off_je_fk
    FOREIGN KEY (sign_off_je_id)
    REFERENCES document.journal_entry (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_signed_off_by_fk
    FOREIGN KEY (signed_off_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_statement ADD CONSTRAINT bst_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ============================================================================
-- §BSL-PATCH  document.bank_statement_line — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.bank_statement_line ADD CONSTRAINT bsl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_statement_line ADD CONSTRAINT bsl_statement_fk
    FOREIGN KEY (tenant_id, bank_statement_id)
    REFERENCES document.bank_statement (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- Deferred: bsl_recon_case_fk added after bank_recon_case exists
DO $$ BEGIN ALTER TABLE document.bank_statement_line ADD CONSTRAINT bsl_recon_case_fk
    FOREIGN KEY (recon_case_id)
    REFERENCES document.bank_recon_case (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ============================================================================
-- §BRC-PATCH  document.bank_recon_case — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_bank_account_fk
    FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES master.bank_account (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_sign_off_je_fk
    FOREIGN KEY (sign_off_je_id)
    REFERENCES document.journal_entry (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_signed_off_by_fk
    FOREIGN KEY (signed_off_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case ADD CONSTRAINT brc_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ============================================================================
-- §BRCL-PATCH  document.bank_recon_case_line — FKs
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.bank_recon_case_line ADD CONSTRAINT brcl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case_line ADD CONSTRAINT brcl_case_fk
    FOREIGN KEY (tenant_id, bank_recon_case_id)
    REFERENCES document.bank_recon_case (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case_line ADD CONSTRAINT brcl_payment_fk
    FOREIGN KEY (tenant_id, payment_entry_id)
    REFERENCES document.payment_entry (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case_line ADD CONSTRAINT brcl_stmt_line_fk
    FOREIGN KEY (tenant_id, bank_statement_line_id)
    REFERENCES document.bank_statement_line (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.bank_recon_case_line ADD CONSTRAINT brcl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ============================================================================
-- §PE-BSLID-PATCH  document.payment_entry.bank_statement_line_id — FK
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.payment_entry ADD CONSTRAINT pe_bank_stmt_line_fk
    FOREIGN KEY (bank_statement_line_id)
    REFERENCES document.bank_statement_line (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ============================================================================
-- Address-model FKs (tenant-composite). Header carries bill-side legal
-- addresses; line carries ship-side + tax jurisdiction snapshots.
-- ============================================================================

-- ── purchase_invoice (header) ───────────────────────────────────────────────
-- Phase 1 reset moves billto/billfrom/remitto/site ownership to invoice lines.
-- Header-level purchase_invoice address/site FKs are intentionally absent.

-- ── purchase_invoice_line ───────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_shipto_address_fk
    FOREIGN KEY (tenant_id, shipto_address_id)
    REFERENCES master.address (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_shipfrom_address_fk
    FOREIGN KEY (tenant_id, shipfrom_address_id)
    REFERENCES master.address (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_to_jur_fk
    FOREIGN KEY (tenant_id, to_tax_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_from_jur_fk
    FOREIGN KEY (tenant_id, from_tax_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES master.site (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_asset_class_fk
    FOREIGN KEY (tenant_id, asset_class_id)
    REFERENCES master.asset_class (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ── commitment_line ─────────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_shipto_address_fk
    FOREIGN KEY (tenant_id, shipto_address_id)
    REFERENCES master.address (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_shipfrom_address_fk
    FOREIGN KEY (tenant_id, shipfrom_address_id)
    REFERENCES master.address (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_to_jur_fk
    FOREIGN KEY (tenant_id, to_tax_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_from_jur_fk
    FOREIGN KEY (tenant_id, from_tax_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_asset_class_fk
    FOREIGN KEY (tenant_id, asset_class_id)
    REFERENCES master.asset_class (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ── service_sheet_line ──────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE document.service_sheet_line ADD CONSTRAINT sshl_shipto_address_fk
    FOREIGN KEY (tenant_id, shipto_address_id)
    REFERENCES master.address (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.service_sheet_line ADD CONSTRAINT sshl_shipfrom_address_fk
    FOREIGN KEY (tenant_id, shipfrom_address_id)
    REFERENCES master.address (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.service_sheet_line ADD CONSTRAINT sshl_to_jur_fk
    FOREIGN KEY (tenant_id, to_tax_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.service_sheet_line ADD CONSTRAINT sshl_from_jur_fk
    FOREIGN KEY (tenant_id, from_tax_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.service_sheet_line ADD CONSTRAINT sshl_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES master.site (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END; $$;

-- ============================================================================
-- §6. P2P FK coverage — POC slice (Plan 1 §A/§B subset)
-- Status: in rollout (one entity-pair per PR). This block covers Receipt +
--         Service Sheet header→line + upstream commitment_id links so the
--         Receipt POC slice can land independently. Remaining entries from
--         the full FK matrix (PR / POC / DN / PI line→upstream-line, version
--         chain self-FKs) land in subsequent batches per the plan.
-- Preflight gate: server/scripts/p2p-fk-preflight.ts must report 0 orphans
--                 before this file is loaded into a tenant DB.
-- ============================================================================

-- ── §6.A  Parent header → line (CASCADE) ────────────────────────────────────
-- Operational drafts: lines have no meaning outside their owning header.
-- Deleting a draft header cascades the lines.

DO $$ BEGIN ALTER TABLE document.receipt_line ADD CONSTRAINT rcpl_receipt_fk
    FOREIGN KEY (tenant_id, receipt_id)
    REFERENCES document.receipt (tenant_id, id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.receipt_line ADD CONSTRAINT rcpl_asset_class_fk
    FOREIGN KEY (tenant_id, asset_class_id)
    REFERENCES master.asset_class (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_asset_fk
    FOREIGN KEY (tenant_id, asset_id)
    REFERENCES master.asset (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.service_sheet_line ADD CONSTRAINT sshl_ssh_fk
    FOREIGN KEY (tenant_id, service_sheet_id)
    REFERENCES document.service_sheet (tenant_id, id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ── §6.A  Parent header → line (CASCADE) — full coverage ───────────────────
-- The remaining 5 header→line ownership FKs across the P2P chain. POC line
-- uses confirmation_id (NOT purchase_order_confirmation_id); verified
-- against live schema 2026-06-20.

DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE document.purchase_requisition_line ADD CONSTRAINT prl_pr_fk
    FOREIGN KEY (tenant_id, purchase_requisition_id)
    REFERENCES document.purchase_requisition (tenant_id, id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation_line ADD CONSTRAINT pocl_poc_fk
    FOREIGN KEY (tenant_id, confirmation_id)
    REFERENCES document.purchase_order_confirmation (tenant_id, id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.delivery_note_line ADD CONSTRAINT dnl_dn_fk
    FOREIGN KEY (tenant_id, delivery_note_id)
    REFERENCES document.delivery_note (tenant_id, id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ── §6.B  Upstream chain (RESTRICT) ─────────────────────────────────────────
-- Receipt + Service Sheet always cite a commitment. RESTRICT blocks deletion
-- of a referenced commitment so the upstream→downstream paper trail stays
-- intact. Cleanup must walk the chain bottom-up.

DO $$ BEGIN ALTER TABLE document.receipt ADD CONSTRAINT rcp_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.service_sheet ADD CONSTRAINT ssh_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- Remaining upstream chain — full coverage across the P2P documents.
-- All RESTRICT to keep paper trail intact (commitment delete must walk
-- bottom-up through receipts → service sheets → invoices).
DO $$ BEGIN ALTER TABLE document.commitment_line ADD CONSTRAINT cl_requisition_line_fk
    FOREIGN KEY (tenant_id, requisition_line_id)
    REFERENCES document.purchase_requisition_line (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation_line ADD CONSTRAINT pocl_commitment_line_fk
    FOREIGN KEY (tenant_id, commitment_line_id)
    REFERENCES document.commitment_line (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.delivery_note ADD CONSTRAINT dn_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.delivery_note_line ADD CONSTRAINT dnl_commitment_line_fk
    FOREIGN KEY (tenant_id, commitment_line_id)
    REFERENCES document.commitment_line (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.receipt ADD CONSTRAINT rcp_delivery_note_fk
    FOREIGN KEY (tenant_id, delivery_note_id)
    REFERENCES document.delivery_note (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.receipt_line ADD CONSTRAINT rcpl_commitment_line_fk
    FOREIGN KEY (tenant_id, commitment_line_id)
    REFERENCES document.commitment_line (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.receipt_line ADD CONSTRAINT rcpl_delivery_note_line_fk
    FOREIGN KEY (tenant_id, delivery_note_line_id)
    REFERENCES document.delivery_note_line (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.service_sheet_line ADD CONSTRAINT sshl_commitment_line_fk
    FOREIGN KEY (tenant_id, commitment_line_id)
    REFERENCES document.commitment_line (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_commitment_line_fk
    FOREIGN KEY (tenant_id, commitment_line_id)
    REFERENCES document.commitment_line (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_receipt_line_fk
    FOREIGN KEY (tenant_id, receipt_line_id)
    REFERENCES document.receipt_line (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_service_sheet_line_fk
    FOREIGN KEY (tenant_id, service_sheet_line_id)
    REFERENCES document.service_sheet_line (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ── §6.C  Version + reversal self-FKs (SET NULL for version, RESTRICT for reversal) ──
-- Universal versioning columns: previous_version_id and renewed_from_id point
-- to an earlier version of the same entity; SET NULL on delete drops the
-- pointer without cascading. reversal_of_id points to the document being
-- reversed; RESTRICT blocks deletion of the original while the reversal
-- exists (protects audit chains).

DO $$ BEGIN ALTER TABLE document.purchase_requisition ADD CONSTRAINT pr_previous_version_fk
    FOREIGN KEY (tenant_id, previous_version_id)
    REFERENCES document.purchase_requisition (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_previous_version_fk
    FOREIGN KEY (tenant_id, previous_version_id)
    REFERENCES document.commitment (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_order_confirmation ADD CONSTRAINT poc_previous_version_fk
    FOREIGN KEY (tenant_id, previous_version_id)
    REFERENCES document.purchase_order_confirmation (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.delivery_note ADD CONSTRAINT dn_previous_version_fk
    FOREIGN KEY (tenant_id, previous_version_id)
    REFERENCES document.delivery_note (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.receipt ADD CONSTRAINT rcp_previous_version_fk
    FOREIGN KEY (tenant_id, previous_version_id)
    REFERENCES document.receipt (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.service_sheet ADD CONSTRAINT ssh_previous_version_fk
    FOREIGN KEY (tenant_id, previous_version_id)
    REFERENCES document.service_sheet (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_previous_version_fk
    FOREIGN KEY (tenant_id, previous_version_id)
    REFERENCES document.purchase_invoice (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_renewed_from_fk
    FOREIGN KEY (tenant_id, renewed_from_id)
    REFERENCES document.commitment (tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_reversal_of_fk
    FOREIGN KEY (tenant_id, reversal_of_id)
    REFERENCES document.journal_entry (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.journal_entry ADD CONSTRAINT je_reversed_by_fk
    FOREIGN KEY (tenant_id, reversed_by_id)
    REFERENCES document.journal_entry (tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ============================================================================
-- Seed Gift Prototype (ATHQ-only) FKs + scope guard
-- ============================================================================

DO $$ BEGIN ALTER TABLE document.seed_gift ADD CONSTRAINT seed_gift_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.seed_gift ADD CONSTRAINT seed_gift_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.seed_gift ADD CONSTRAINT seed_gift_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.seed_gift ADD CONSTRAINT seed_gift_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN ALTER TABLE document.seed_gift ADD CONSTRAINT seed_gift_status_changed_by_fk
    FOREIGN KEY (status_changed_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE OR REPLACE FUNCTION document.trg_seed_gift_athq_only()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_company_code text;
    v_company_code_id uuid;
BEGIN
    IF NEW.company_code_id IS NULL THEN
        SELECT cc.id INTO v_company_code_id
          FROM master.company_code cc
         WHERE cc.tenant_id = NEW.tenant_id
           AND cc.code = 'ATHQ';

        IF v_company_code_id IS NULL THEN
            RAISE EXCEPTION 'SEED_GIFT_SCOPE: company_code ATHQ was not found for tenant %', NEW.tenant_id
                USING ERRCODE = 'SG001';
        END IF;

        NEW.company_code_id := v_company_code_id;
    END IF;

    SELECT cc.code INTO v_company_code
      FROM master.company_code cc
     WHERE cc.tenant_id = NEW.tenant_id
       AND cc.id = NEW.company_code_id;

    IF v_company_code IS DISTINCT FROM 'ATHQ' THEN
        RAISE EXCEPTION 'SEED_GIFT_SCOPE: prototype rows are restricted to company_code ATHQ'
            USING ERRCODE = 'SG001';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_seed_gift_athq_only() IS
    'Prototype guard: document.seed_gift accepts rows only for company_code ATHQ.';

DROP TRIGGER IF EXISTS trg_seed_gift_athq_only ON document.seed_gift;
CREATE TRIGGER trg_seed_gift_athq_only
    BEFORE INSERT OR UPDATE OF tenant_id, company_code_id
    ON document.seed_gift
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_seed_gift_athq_only();
