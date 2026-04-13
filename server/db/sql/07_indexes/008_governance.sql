-- 07_indexes/008_governance.sql

-- —— §11  governance.comment_moderation ——————————————————————————————————
-- Hidden comments sweep (render-time moderation check is via UNIQUE index)
CREATE INDEX IF NOT EXISTS gmod_hidden_pidx
    ON governance.comment_moderation (tenant_id, context_type, comment_id)
    WHERE is_hidden = true;
-- High flag count review queue
CREATE INDEX IF NOT EXISTS gmod_flag_count_pidx
    ON governance.comment_moderation (tenant_id, flag_count DESC, last_flagged_at DESC)
    WHERE flag_count >= 3 AND is_hidden = false;


-- ── governance.book_period_status ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS bps_company_book_idx ON governance.book_period_status (tenant_id, company_code_id, book_id);
CREATE INDEX IF NOT EXISTS bps_open_pidx        ON governance.book_period_status (tenant_id, company_code_id, book_id)
    WHERE status IN ('open', 'soft_close');


-- ============================================================================
-- GOVERNANCE CYCLE MODEL — indexes
-- ============================================================================

-- —— governance.cycle_type ——————————————————————————————————————————————————
CREATE INDEX IF NOT EXISTS ctyp_tenant_active_idx
    ON governance.cycle_type (tenant_id, is_active);

-- —— governance.cycle_task_template —————————————————————————————————————————
CREATE INDEX IF NOT EXISTS ctpl_type_active_idx
    ON governance.cycle_task_template (cycle_type_id, is_active);

-- —— governance.cycle_run ———————————————————————————————————————————————————
CREATE INDEX IF NOT EXISTS crun_status_idx
    ON governance.cycle_run (tenant_id, entity_code, status);
CREATE INDEX IF NOT EXISTS crun_period_idx
    ON governance.cycle_run (tenant_id, cycle_type_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS crun_domain_data_gin
    ON governance.cycle_run USING gin (domain_data);

-- —— governance.cycle_task ——————————————————————————————————————————————————
CREATE INDEX IF NOT EXISTS ctsk_run_status_idx
    ON governance.cycle_task (cycle_run_id, status);
CREATE INDEX IF NOT EXISTS ctsk_phase_idx
    ON governance.cycle_task (cycle_run_id, phase_id);

-- —— governance.cycle_deviation —————————————————————————————————————————————
CREATE INDEX IF NOT EXISTS cdev_run_type_idx
    ON governance.cycle_deviation (cycle_run_id, deviation_type);
CREATE INDEX IF NOT EXISTS cdev_active_pidx
    ON governance.cycle_deviation (status)
    WHERE status IN ('OPEN','PENDING_APPROVAL','APPROVED','APPLIED');
CREATE INDEX IF NOT EXISTS cdev_task_pidx
    ON governance.cycle_deviation (task_id)
    WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cdev_lineage_pidx
    ON governance.cycle_deviation (carried_from_id)
    WHERE carried_from_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cdev_tmpl_pidx
    ON governance.cycle_deviation (task_template_id)
    WHERE task_template_id IS NOT NULL;
