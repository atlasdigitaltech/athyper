-- 09_triggers/008_governance.sql
-- Governance schema triggers.
-- Depends on: 04_tables/008_governance.sql, 08_functions/001_shared

-- =============================================================================
-- §  governance.book_period_status
-- =============================================================================

DROP TRIGGER IF EXISTS trg_bps_updated_at ON governance.book_period_status;
CREATE TRIGGER trg_bps_updated_at BEFORE UPDATE ON governance.book_period_status
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bps_status_changed ON governance.book_period_status;
CREATE TRIGGER trg_bps_status_changed BEFORE UPDATE ON governance.book_period_status
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_bps_status_lookup ON governance.book_period_status;
CREATE TRIGGER trg_bps_status_lookup
    BEFORE INSERT OR UPDATE OF status ON governance.book_period_status
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('governance.book_period_status_status', 'status');


-- =============================================================================
-- GOVERNANCE CYCLE MODEL — triggers
-- =============================================================================

-- ── governance.cycle_type ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ctyp_updated_at ON governance.cycle_type;
CREATE TRIGGER trg_ctyp_updated_at BEFORE UPDATE ON governance.cycle_type
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── governance.cycle_phase ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cph_updated_at ON governance.cycle_phase;
CREATE TRIGGER trg_cph_updated_at BEFORE UPDATE ON governance.cycle_phase
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── governance.cycle_task_template ──────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ctpl_updated_at ON governance.cycle_task_template;
CREATE TRIGGER trg_ctpl_updated_at BEFORE UPDATE ON governance.cycle_task_template
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── governance.cycle_task_dependency ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ctdep_updated_at ON governance.cycle_task_dependency;
CREATE TRIGGER trg_ctdep_updated_at BEFORE UPDATE ON governance.cycle_task_dependency
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ctdep_validate_refs ON governance.cycle_task_dependency;
CREATE TRIGGER trg_ctdep_validate_refs
    BEFORE INSERT OR UPDATE ON governance.cycle_task_dependency
    FOR EACH ROW EXECUTE FUNCTION governance.trg_validate_task_dep_refs();

DROP TRIGGER IF EXISTS trg_ctdep_check_cycle ON governance.cycle_task_dependency;
CREATE TRIGGER trg_ctdep_check_cycle
    BEFORE INSERT OR UPDATE ON governance.cycle_task_dependency
    FOR EACH ROW EXECUTE FUNCTION governance.trg_check_dep_cycle();

-- ── governance.cycle_run ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_crun_updated_at ON governance.cycle_run;
CREATE TRIGGER trg_crun_updated_at BEFORE UPDATE ON governance.cycle_run
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_crun_validate_domain ON governance.cycle_run;
CREATE TRIGGER trg_crun_validate_domain
    BEFORE INSERT OR UPDATE OF domain_data ON governance.cycle_run
    FOR EACH ROW EXECUTE FUNCTION governance.trg_validate_run_domain_data();

-- ── governance.cycle_task ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ctsk_updated_at ON governance.cycle_task;
CREATE TRIGGER trg_ctsk_updated_at BEFORE UPDATE ON governance.cycle_task
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ctsk_validate_refs ON governance.cycle_task;
CREATE TRIGGER trg_ctsk_validate_refs
    BEFORE INSERT OR UPDATE ON governance.cycle_task
    FOR EACH ROW EXECUTE FUNCTION governance.trg_validate_task_refs();

DROP TRIGGER IF EXISTS trg_ctsk_validate_domain ON governance.cycle_task;
CREATE TRIGGER trg_ctsk_validate_domain
    BEFORE INSERT OR UPDATE OF domain_data ON governance.cycle_task
    FOR EACH ROW EXECUTE FUNCTION governance.trg_validate_task_domain_data();

-- ── governance.cycle_deviation ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cdev_updated_at ON governance.cycle_deviation;
CREATE TRIGGER trg_cdev_updated_at BEFORE UPDATE ON governance.cycle_deviation
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cdev_validate_workflow_request ON governance.cycle_deviation;
CREATE TRIGGER trg_cdev_validate_workflow_request
    BEFORE INSERT OR UPDATE OF workflow_request_id ON governance.cycle_deviation
    FOR EACH ROW WHEN (NEW.workflow_request_id IS NOT NULL)
    EXECUTE FUNCTION governance.trg_validate_workflow_request_tenant();

-- ── governance.cycle_certification ──────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ccert_updated_at ON governance.cycle_certification;
CREATE TRIGGER trg_ccert_updated_at BEFORE UPDATE ON governance.cycle_certification
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ccert_validate_workflow_request ON governance.cycle_certification;
CREATE TRIGGER trg_ccert_validate_workflow_request
    BEFORE INSERT OR UPDATE OF workflow_request_id ON governance.cycle_certification
    FOR EACH ROW WHEN (NEW.workflow_request_id IS NOT NULL)
    EXECUTE FUNCTION governance.trg_validate_workflow_request_tenant();

-- ── governance.cycle_task_category ──────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ctcat_updated_at ON governance.cycle_task_category;
CREATE TRIGGER trg_ctcat_updated_at BEFORE UPDATE ON governance.cycle_task_category
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── governance.cycle_cross_dependency ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cxdep_updated_at ON governance.cycle_cross_dependency;
CREATE TRIGGER trg_cxdep_updated_at BEFORE UPDATE ON governance.cycle_cross_dependency
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── governance.cycle_carryforward_rule ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ccfr_updated_at ON governance.cycle_carryforward_rule;
CREATE TRIGGER trg_ccfr_updated_at BEFORE UPDATE ON governance.cycle_carryforward_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
