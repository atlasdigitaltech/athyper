-- ============================================================================
-- governance/06_triggers.sql
-- Non-internal triggers reconstructed from the live catalog.
-- Generated from the live Neon database governance schema. Do not hand-edit.
-- ============================================================================

CREATE TRIGGER trg_bps_status_changed BEFORE UPDATE ON governance.book_period_status FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_bps_updated_at BEFORE UPDATE ON governance.book_period_status FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fin_ready_book_period AFTER INSERT OR DELETE OR UPDATE ON governance.book_period_status FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Book period posting gate changed');

CREATE TRIGGER trg_gmod_context_type_lookup BEFORE INSERT OR UPDATE OF context_type ON governance.comment_moderation FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.comment_type', 'context_type');

CREATE TRIGGER trg_gmod_updated_at BEFORE UPDATE ON governance.comment_moderation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ccfr_updated_at BEFORE UPDATE ON governance.cycle_carryforward_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ccert_snapshot_immutable BEFORE UPDATE ON governance.cycle_certification FOR EACH ROW EXECUTE FUNCTION governance.trg_certification_snapshot_immutable();

CREATE TRIGGER trg_ccert_updated_at BEFORE UPDATE ON governance.cycle_certification FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ccert_validate_workflow_request BEFORE INSERT OR UPDATE OF workflow_request_id ON governance.cycle_certification FOR EACH ROW WHEN (new.workflow_request_id IS NOT NULL) EXECUTE FUNCTION governance.trg_validate_workflow_request_tenant();

CREATE TRIGGER trg_cxdep_updated_at BEFORE UPDATE ON governance.cycle_cross_dependency FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cdev_updated_at BEFORE UPDATE ON governance.cycle_deviation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cdev_validate_workflow_request BEFORE INSERT OR UPDATE OF workflow_request_id ON governance.cycle_deviation FOR EACH ROW WHEN (new.workflow_request_id IS NOT NULL) EXECUTE FUNCTION governance.trg_validate_workflow_request_tenant();

CREATE TRIGGER trg_cph_updated_at BEFORE UPDATE ON governance.cycle_phase FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_crun_updated_at BEFORE UPDATE ON governance.cycle_run FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_crun_validate_domain BEFORE INSERT OR UPDATE OF domain_data ON governance.cycle_run FOR EACH ROW EXECUTE FUNCTION governance.trg_validate_run_domain_data();

CREATE TRIGGER trg_ctsk_updated_at BEFORE UPDATE ON governance.cycle_task FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ctsk_validate_domain BEFORE INSERT OR UPDATE OF domain_data ON governance.cycle_task FOR EACH ROW EXECUTE FUNCTION governance.trg_validate_task_domain_data();

CREATE TRIGGER trg_ctsk_validate_refs BEFORE INSERT OR UPDATE ON governance.cycle_task FOR EACH ROW EXECUTE FUNCTION governance.trg_validate_task_refs();

CREATE TRIGGER trg_ctcat_updated_at BEFORE UPDATE ON governance.cycle_task_category FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ctdep_check_cycle BEFORE INSERT OR UPDATE ON governance.cycle_task_dependency FOR EACH ROW EXECUTE FUNCTION governance.trg_check_dep_cycle();

CREATE TRIGGER trg_ctdep_updated_at BEFORE UPDATE ON governance.cycle_task_dependency FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ctdep_validate_refs BEFORE INSERT OR UPDATE ON governance.cycle_task_dependency FOR EACH ROW EXECUTE FUNCTION governance.trg_validate_task_dep_refs();

CREATE TRIGGER trg_ctpl_updated_at BEFORE UPDATE ON governance.cycle_task_template FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ctyp_updated_at BEFORE UPDATE ON governance.cycle_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_preserved_identity_receipt_immutable_v2 BEFORE DELETE OR UPDATE ON governance.preserved_identity_migration_receipt_v2 FOR EACH ROW EXECUTE FUNCTION governance.trg_preserved_identity_receipt_immutable_v2();
