-- 09_triggers/003b_master_ui_principal.sql
-- Depends on: 04_tables/003e_master_ui_principal.sql (tables),
--             08_functions/003b_master_ui_principal.sql (trg_enforce_created_by),
--             08_functions/001_shared.sql (shared.trg_set_updated_at,
--                                          shared.trg_set_status_changed,
--                                          shared.trg_immutable_code),
--             ui_principal_supplementary.sql (trg_guard_scope_owner_immutable,
--                                             trg_sync_deleted_at_with_status,
--                                             trg_validate_lookup_columns)
-- Convention: DROP TRIGGER IF EXISTS before CREATE for idempotency.
--             BEFORE triggers fire in alphabetical name order per PostgreSQL spec.

-- ════════════════════════════════════════════════════════════════════════════
-- master.principal_ui_profile
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_puip_enforce_created_by ON master.principal_ui_profile;
CREATE TRIGGER trg_puip_enforce_created_by
    BEFORE INSERT OR UPDATE ON master.principal_ui_profile
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

-- updated_at / updated_by — shared stamp trigger (defined in supplementary)
DROP TRIGGER IF EXISTS trg_puip_updated_at ON master.principal_ui_profile;
CREATE TRIGGER trg_puip_updated_at
    BEFORE UPDATE ON master.principal_ui_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- master.principal_ui_preference
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_puipref_enforce_created_by ON master.principal_ui_preference;
CREATE TRIGGER trg_puipref_enforce_created_by
    BEFORE INSERT OR UPDATE ON master.principal_ui_preference
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

DROP TRIGGER IF EXISTS trg_puipref_updated_at ON master.principal_ui_preference;
CREATE TRIGGER trg_puipref_updated_at
    BEFORE UPDATE ON master.principal_ui_preference
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- master.saved_view
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_sv_enforce_created_by ON master.saved_view;
CREATE TRIGGER trg_sv_enforce_created_by
    BEFORE INSERT OR UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

DROP TRIGGER IF EXISTS trg_sv_updated_at ON master.saved_view;
CREATE TRIGGER trg_sv_updated_at
    BEFORE UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_saved_view_status_changed ON master.saved_view;
CREATE TRIGGER trg_saved_view_status_changed
    BEFORE UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ════════════════════════════════════════════════════════════════════════════
-- master.dashboard
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_dash_enforce_created_by ON master.dashboard;
CREATE TRIGGER trg_dash_enforce_created_by
    BEFORE INSERT OR UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

DROP TRIGGER IF EXISTS trg_dash_updated_at ON master.dashboard;
CREATE TRIGGER trg_dash_updated_at
    BEFORE UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_dashboard_status_changed ON master.dashboard;
CREATE TRIGGER trg_dashboard_status_changed
    BEFORE UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ════════════════════════════════════════════════════════════════════════════
-- master.dashboard_widget
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_dw_enforce_created_by ON master.dashboard_widget;
CREATE TRIGGER trg_dw_enforce_created_by
    BEFORE INSERT OR UPDATE ON master.dashboard_widget
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

DROP TRIGGER IF EXISTS trg_dashboard_widget_updated_at ON master.dashboard_widget;
CREATE TRIGGER trg_dashboard_widget_updated_at
    BEFORE UPDATE ON master.dashboard_widget
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- §  TRIGGER EXECUTION ORDER (BEFORE triggers, alphabetical per table)
-- ════════════════════════════════════════════════════════════════════════════
--
-- master.principal_ui_profile — INSERT:
--   trg_puip_enforce_created_by     stamps created_by from session
--   [supplementary lookup triggers] validate locale_code etc.
--
-- master.principal_ui_profile — UPDATE:
--   trg_puip_enforce_created_by     blocks created_by mutation
--   trg_puip_updated_at             stamps updated_at / updated_by
--   [supplementary lookup triggers] validate locale_code etc.
--
-- master.principal_ui_preference — INSERT:
--   trg_puipref_enforce_created_by  stamps created_by from session
--   [supplementary lookup triggers] validate preference_code / surface_code
--
-- master.principal_ui_preference — UPDATE:
--   trg_puipref_enforce_created_by  blocks created_by mutation
--   trg_puipref_updated_at          stamps updated_at / updated_by
--   [supplementary lookup triggers] validate preference_code / surface_code
--
-- master.saved_view — INSERT:
--   trg_sv_enforce_created_by       stamps created_by from session
--   [supplementary: trg_sv_scope, trg_sv_surface_code]
--
-- master.saved_view — UPDATE:
--   trg_saved_view_status_changed   stamps status_changed_at / by
--   trg_sv_enforce_created_by       blocks created_by mutation
--   trg_sv_updated_at               stamps updated_at / updated_by
--   [supplementary: trg_sv_guard_scope_owner, trg_sv_immutable_code,
--                   trg_sv_scope, trg_sv_surface_code,
--                   trg_sv_sync_deleted_at]
--
-- master.dashboard — INSERT:
--   trg_dash_enforce_created_by     stamps created_by from session
--   [supplementary: trg_dash_scope, trg_dash_surface_code]
--
-- master.dashboard — UPDATE:
--   trg_dash_enforce_created_by     blocks created_by mutation
--   trg_dash_updated_at             stamps updated_at / updated_by
--   trg_dashboard_status_changed    stamps status_changed_at / by
--   [supplementary: trg_dash_guard_scope_owner, trg_dash_immutable_code,
--                   trg_dash_scope, trg_dash_surface_code,
--                   trg_dash_sync_deleted_at]
--
-- master.dashboard_widget — INSERT:
--   [supplementary: trg_dw_breakpoint]
--   trg_dw_enforce_created_by       stamps created_by from session
--   [supplementary: trg_dw_widget_type]
--
-- master.dashboard_widget — UPDATE:
--   trg_dashboard_widget_updated_at stamps updated_at / updated_by
--   [supplementary: trg_dw_breakpoint]
--   trg_dw_enforce_created_by       blocks created_by mutation
--   [supplementary: trg_dw_widget_type]
--
-- No ordering conflicts. Guard/enforcement triggers examine independent columns.
