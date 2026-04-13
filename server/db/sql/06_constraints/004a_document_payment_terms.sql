-- ============================================================================
-- 06_constraints/004a_document_payment_terms.sql
-- PAYMENT TERMS - document schema foreign-key constraints
-- Covers:   document.payment_term_application (PT4)
--           document.payment_term_discount_result (PT5)
--           document.commitment payment_term_id FK (CMT)
-- Depends:  06_constraints/003d_master_payment_terms.sql
--           06_constraints/004_document.sql
-- ============================================================================

-- ============================================================================
-- Â§PT4  document.payment_term_application
-- ============================================================================

-- pta.tenant_id â†’ master.tenant
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pta.commitment_id â†’ document.commitment (tenant-scoped)
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id)
    REFERENCES document.commitment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pta.payment_term_id â†’ master.payment_term (tenant-scoped)
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pta.clause_id â†’ master.payment_term_clause (tenant-scoped)
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_clause_fk
    FOREIGN KEY (tenant_id, clause_id)
    REFERENCES master.payment_term_clause (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pta.schedule_id â†’ ledger.commitment_schedule (tenant-scoped)
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_schedule_fk
    FOREIGN KEY (tenant_id, schedule_id)
    REFERENCES ledger.commitment_schedule (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pta.workflow_request_id â†’ document.workflow_request (tenant-scoped)
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_workflow_fk
    FOREIGN KEY (tenant_id, workflow_request_id)
    REFERENCES document.workflow_request (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pta.created_by â†’ master.principal
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pta.reversed_by_application_id â†’ self (tenant-scoped, deferrable for bulk operations)
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_reversed_by_fk
    FOREIGN KEY (tenant_id, reversed_by_application_id)
    REFERENCES document.payment_term_application (tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pta.superseded_by_application_id â†’ self (tenant-scoped, deferrable for bulk operations)
DO $$ BEGIN ALTER TABLE document.payment_term_application ADD CONSTRAINT pta_superseded_by_fk
    FOREIGN KEY (tenant_id, superseded_by_application_id)
    REFERENCES document.payment_term_application (tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- Â§PT5  document.payment_term_discount_result
-- ============================================================================

-- ptdr.tenant_id â†’ master.tenant
DO $$ BEGIN ALTER TABLE document.payment_term_discount_result ADD CONSTRAINT ptdr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptdr.payment_term_id â†’ master.payment_term (tenant-scoped)
DO $$ BEGIN ALTER TABLE document.payment_term_discount_result ADD CONSTRAINT ptdr_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptdr.discount_tier_id â†’ master.payment_term_discount_tier (tenant-scoped)
DO $$ BEGIN ALTER TABLE document.payment_term_discount_result ADD CONSTRAINT ptdr_tier_fk
    FOREIGN KEY (tenant_id, discount_tier_id)
    REFERENCES master.payment_term_discount_tier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptdr.created_by â†’ master.principal
DO $$ BEGIN ALTER TABLE document.payment_term_discount_result ADD CONSTRAINT ptdr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptdr.reverses_id â†’ self (tenant-scoped)
DO $$ BEGIN ALTER TABLE document.payment_term_discount_result ADD CONSTRAINT ptdr_reverses_fk
    FOREIGN KEY (tenant_id, reverses_id)
    REFERENCES document.payment_term_discount_result (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- Â§CMT  document.commitment â†’ payment_term (added columns from Part D)
-- ============================================================================

-- commitment.payment_term_id â†’ master.payment_term (tenant-scoped)
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

