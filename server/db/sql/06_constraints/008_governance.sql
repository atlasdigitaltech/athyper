-- 06_constraints/008_governance.sql

-- —— §11  governance.comment_moderation ——————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.comment_moderation ADD CONSTRAINT gmod_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE governance.comment_moderation ADD CONSTRAINT gmod_hidden_by_fk
    FOREIGN KEY (hidden_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE governance.comment_moderation ADD CONSTRAINT gmod_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── governance.book_period_status ────────────────────────────────────────────
ALTER TABLE governance.book_period_status DROP CONSTRAINT IF EXISTS bps_tenant_fk;
DO $$ BEGIN ALTER TABLE governance.book_period_status ADD CONSTRAINT bps_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.book_period_status ADD CONSTRAINT bps_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.book_period_status ADD CONSTRAINT bps_book_fk
    FOREIGN KEY (tenant_id, book_id) REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.book_period_status ADD CONSTRAINT bps_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- GOVERNANCE CYCLE MODEL — cross-schema foreign keys
-- ============================================================================

-- —— governance.cycle_type ——————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_type ADD CONSTRAINT ctyp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_type ADD CONSTRAINT ctyp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_type ADD CONSTRAINT ctyp_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— governance.cycle_phase —————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_phase ADD CONSTRAINT cph_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_phase ADD CONSTRAINT cph_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_phase ADD CONSTRAINT cph_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— governance.cycle_task_category —————————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_task_category ADD CONSTRAINT ctcat_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_task_category ADD CONSTRAINT ctcat_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— governance.cycle_task_template —————————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_task_template ADD CONSTRAINT ctpl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_task_template ADD CONSTRAINT ctpl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_task_template ADD CONSTRAINT ctpl_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_task_template ADD CONSTRAINT ctpl_default_owner_fk
    FOREIGN KEY (default_owner_user_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— governance.cycle_task_dependency ———————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_task_dependency ADD CONSTRAINT ctdep_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_task_dependency ADD CONSTRAINT ctdep_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— governance.cycle_run ———————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_run ADD CONSTRAINT crun_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_run ADD CONSTRAINT crun_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_run ADD CONSTRAINT crun_started_by_fk
    FOREIGN KEY (started_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_run ADD CONSTRAINT crun_completed_by_fk
    FOREIGN KEY (completed_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_run ADD CONSTRAINT crun_certified_by_fk
    FOREIGN KEY (certified_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_run ADD CONSTRAINT crun_cancelled_by_fk
    FOREIGN KEY (cancelled_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_run ADD CONSTRAINT crun_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— governance.cycle_task ——————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_task ADD CONSTRAINT ctsk_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_task ADD CONSTRAINT ctsk_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_task ADD CONSTRAINT ctsk_assigned_to_fk
    FOREIGN KEY (assigned_to) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_task ADD CONSTRAINT ctsk_completed_by_fk
    FOREIGN KEY (completed_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_task ADD CONSTRAINT ctsk_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— governance.cycle_deviation —————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_deviation ADD CONSTRAINT cdev_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_deviation ADD CONSTRAINT cdev_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_deviation ADD CONSTRAINT cdev_requested_by_fk
    FOREIGN KEY (requested_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_deviation ADD CONSTRAINT cdev_assigned_to_fk
    FOREIGN KEY (assigned_to) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_deviation ADD CONSTRAINT cdev_resolved_by_fk
    FOREIGN KEY (resolved_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_deviation ADD CONSTRAINT cdev_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Wire workflow_request FK if table exists
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'document' AND c.relname = 'workflow_request'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cdev_workflow_request_fk') THEN
            ALTER TABLE governance.cycle_deviation ADD CONSTRAINT cdev_workflow_request_fk
                FOREIGN KEY (workflow_request_id) REFERENCES document.workflow_request(id) ON DELETE SET NULL;
        END IF;
    ELSE
        RAISE NOTICE 'DEFERRED: cdev_workflow_request_fk — document.workflow_request not found';
    END IF;
END $$;

-- —— governance.cycle_certification —————————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_certification ADD CONSTRAINT ccert_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_certification ADD CONSTRAINT ccert_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_certification ADD CONSTRAINT ccert_certified_by_fk
    FOREIGN KEY (certified_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_certification ADD CONSTRAINT ccert_attested_by_fk
    FOREIGN KEY (attested_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_certification ADD CONSTRAINT ccert_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Wire workflow_request FK if table exists
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'document' AND c.relname = 'workflow_request'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ccert_workflow_request_fk') THEN
            ALTER TABLE governance.cycle_certification ADD CONSTRAINT ccert_workflow_request_fk
                FOREIGN KEY (workflow_request_id) REFERENCES document.workflow_request(id) ON DELETE SET NULL;
        END IF;
    ELSE
        RAISE NOTICE 'DEFERRED: ccert_workflow_request_fk — document.workflow_request not found';
    END IF;
END $$;

-- —— governance.cycle_cross_dependency ——————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_cross_dependency ADD CONSTRAINT cxdep_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_cross_dependency ADD CONSTRAINT cxdep_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— governance.cycle_carryforward_rule —————————————————————————————————————
DO $$ BEGIN ALTER TABLE governance.cycle_carryforward_rule ADD CONSTRAINT ccfr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE governance.cycle_carryforward_rule ADD CONSTRAINT ccfr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
