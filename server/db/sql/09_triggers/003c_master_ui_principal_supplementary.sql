-- 09_triggers/003c_master_ui_principal_supplementary.sql
-- Depends on: 04_tables/003e_master_ui_principal.sql (tables),
--             08_functions/003b_master_ui_principal.sql (trg_enforce_created_by),
--             08_functions/003c_master_ui_principal_supplementary.sql
--                 (trg_guard_scope_owner_immutable, trg_sync_deleted_at_with_status),
--             08_functions/001_shared.sql (shared.trg_immutable_code),
--             08_functions/002_control.sql (control.trg_validate_lookup_columns)
-- Convention: DROP TRIGGER IF EXISTS before CREATE for idempotency.
--             BEFORE triggers fire in alphabetical name order per PostgreSQL spec.
--
-- Lookup domain prerequisites (must be seeded before these triggers fire at runtime):
--   ui.view_scope, ui.dashboard_scope, ui.surface_code, ui.preference_code,
--   ui.breakpoint, ui.widget_type, ui.density, ui.appearance_mode
-- (Seeded in 900_seed_data/010_system/000_lookups/LookupDomain/master/)


-- ════════════════════════════════════════════════════════════════════════════
-- master.principal_ui_profile — supplementary lookup validators
-- ════════════════════════════════════════════════════════════════════════════
-- locale_code / language_code / timezone_code validators are deferred —
-- those reference i18n lookup domains not yet seeded in this release.

DROP TRIGGER IF EXISTS trg_puip_appearance_mode ON master.principal_ui_profile;
CREATE TRIGGER trg_puip_appearance_mode
    BEFORE INSERT OR UPDATE ON master.principal_ui_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.appearance_mode', 'appearance_mode');

DROP TRIGGER IF EXISTS trg_puip_density ON master.principal_ui_profile;
CREATE TRIGGER trg_puip_density
    BEFORE INSERT OR UPDATE ON master.principal_ui_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.density', 'density_code');


-- ════════════════════════════════════════════════════════════════════════════
-- master.principal_ui_preference — supplementary lookup validators
-- ════════════════════════════════════════════════════════════════════════════
-- trg_validate_lookup_columns returns NEW when value IS NULL → safe for nullable surface_code.

DROP TRIGGER IF EXISTS trg_puipref_preference_code ON master.principal_ui_preference;
CREATE TRIGGER trg_puipref_preference_code
    BEFORE INSERT OR UPDATE ON master.principal_ui_preference
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.preference_code', 'preference_code');

DROP TRIGGER IF EXISTS trg_puipref_surface_code ON master.principal_ui_preference;
CREATE TRIGGER trg_puipref_surface_code
    BEFORE INSERT OR UPDATE ON master.principal_ui_preference
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.surface_code', 'surface_code');


-- ════════════════════════════════════════════════════════════════════════════
-- master.saved_view — supplementary
-- ════════════════════════════════════════════════════════════════════════════

-- Immutable code (machine-stable key used by front-end routing / deep links)
DROP TRIGGER IF EXISTS trg_sv_immutable_code ON master.saved_view;
CREATE TRIGGER trg_sv_immutable_code
    BEFORE UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

-- Scope/owner guard (immutable after INSERT — blocks escalation/transfer)
DROP TRIGGER IF EXISTS trg_sv_guard_scope_owner ON master.saved_view;
CREATE TRIGGER trg_sv_guard_scope_owner
    BEFORE UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_scope_owner_immutable();

-- Lookup validators
-- Column is 'scope', domain is 'ui.view_scope' (separate from dashboard scope)
DROP TRIGGER IF EXISTS trg_sv_scope ON master.saved_view;
CREATE TRIGGER trg_sv_scope
    BEFORE INSERT OR UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.view_scope', 'scope');

DROP TRIGGER IF EXISTS trg_sv_surface_code ON master.saved_view;
CREATE TRIGGER trg_sv_surface_code
    BEFORE INSERT OR UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.surface_code', 'surface_code');

-- deleted_at ↔ status sync
DROP TRIGGER IF EXISTS trg_sv_sync_deleted_at ON master.saved_view;
CREATE TRIGGER trg_sv_sync_deleted_at
    BEFORE UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION master.trg_sync_deleted_at_with_status();


-- ════════════════════════════════════════════════════════════════════════════
-- master.dashboard — supplementary
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_dash_immutable_code ON master.dashboard;
CREATE TRIGGER trg_dash_immutable_code
    BEFORE UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_dash_guard_scope_owner ON master.dashboard;
CREATE TRIGGER trg_dash_guard_scope_owner
    BEFORE UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_scope_owner_immutable();

-- Column is 'scope', domain is 'ui.dashboard_scope' (separate from saved_view scope)
DROP TRIGGER IF EXISTS trg_dash_scope ON master.dashboard;
CREATE TRIGGER trg_dash_scope
    BEFORE INSERT OR UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.dashboard_scope', 'scope');

DROP TRIGGER IF EXISTS trg_dash_surface_code ON master.dashboard;
CREATE TRIGGER trg_dash_surface_code
    BEFORE INSERT OR UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.surface_code', 'surface_code');

DROP TRIGGER IF EXISTS trg_dash_sync_deleted_at ON master.dashboard;
CREATE TRIGGER trg_dash_sync_deleted_at
    BEFORE UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION master.trg_sync_deleted_at_with_status();


-- ════════════════════════════════════════════════════════════════════════════
-- master.dashboard_widget — supplementary
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_dw_breakpoint ON master.dashboard_widget;
CREATE TRIGGER trg_dw_breakpoint
    BEFORE INSERT OR UPDATE ON master.dashboard_widget
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.breakpoint', 'breakpoint_code');

DROP TRIGGER IF EXISTS trg_dw_widget_type ON master.dashboard_widget;
CREATE TRIGGER trg_dw_widget_type
    BEFORE INSERT OR UPDATE ON master.dashboard_widget
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.widget_type', 'widget_type_code');


-- ════════════════════════════════════════════════════════════════════════════
-- §  COMPLETE TRIGGER EXECUTION ORDER (BEFORE triggers, alphabetical per table)
-- ════════════════════════════════════════════════════════════════════════════
-- Combines 003b (core) and 003c (supplementary) for a full picture.
--
-- master.principal_ui_profile — INSERT:
--   trg_puip_appearance_mode        validates appearance_mode → ui.appearance_mode
--   trg_puip_density                validates density_code    → ui.density
--   trg_puip_enforce_created_by     stamps created_by from session
--
-- master.principal_ui_profile — UPDATE:
--   trg_puip_appearance_mode        validates appearance_mode
--   trg_puip_density                validates density_code
--   trg_puip_enforce_created_by     blocks created_by mutation
--   trg_puip_updated_at             stamps updated_at / updated_by
--
-- master.principal_ui_preference — INSERT:
--   trg_puipref_enforce_created_by  stamps created_by from session
--   trg_puipref_preference_code     validates preference_code → ui.preference_code
--   trg_puipref_surface_code        validates surface_code    → ui.surface_code (nullable)
--
-- master.principal_ui_preference — UPDATE:
--   trg_puipref_enforce_created_by  blocks created_by mutation
--   trg_puipref_preference_code     validates preference_code
--   trg_puipref_surface_code        validates surface_code
--   trg_puipref_updated_at          stamps updated_at / updated_by
--
-- master.saved_view — INSERT:
--   trg_sv_enforce_created_by       stamps created_by from session
--   trg_sv_scope                    validates scope → ui.view_scope
--   trg_sv_surface_code             validates surface_code → ui.surface_code
--
-- master.saved_view — UPDATE:
--   trg_saved_view_status_changed   stamps status_changed_at / by
--   trg_sv_enforce_created_by       blocks created_by mutation
--   trg_sv_guard_scope_owner        blocks scope / owner_principal_id mutation
--   trg_sv_immutable_code           blocks code mutation
--   trg_sv_scope                    validates scope → ui.view_scope
--   trg_sv_surface_code             validates surface_code → ui.surface_code
--   trg_sv_sync_deleted_at          syncs deleted_at with status
--   trg_sv_updated_at               stamps updated_at / updated_by
--
-- master.dashboard — INSERT:
--   trg_dash_enforce_created_by     stamps created_by from session
--   trg_dash_scope                  validates scope → ui.dashboard_scope
--   trg_dash_surface_code           validates surface_code → ui.surface_code (nullable)
--
-- master.dashboard — UPDATE:
--   trg_dash_enforce_created_by     blocks created_by mutation
--   trg_dash_guard_scope_owner      blocks scope / owner_principal_id mutation
--   trg_dash_immutable_code         blocks code mutation
--   trg_dash_scope                  validates scope → ui.dashboard_scope
--   trg_dash_surface_code           validates surface_code → ui.surface_code
--   trg_dash_sync_deleted_at        syncs deleted_at with status
--   trg_dash_updated_at             stamps updated_at / updated_by
--   trg_dashboard_status_changed    stamps status_changed_at / by
--
-- master.dashboard_widget — INSERT:
--   trg_dw_breakpoint               validates breakpoint_code → ui.breakpoint (nullable)
--   trg_dw_enforce_created_by       stamps created_by from session
--   trg_dw_widget_type              validates widget_type_code → ui.widget_type
--
-- master.dashboard_widget — UPDATE:
--   trg_dashboard_widget_updated_at stamps updated_at / updated_by
--   trg_dw_breakpoint               validates breakpoint_code
--   trg_dw_enforce_created_by       blocks created_by mutation
--   trg_dw_widget_type              validates widget_type_code
--
-- No ordering conflicts. Guard/enforcement/validation triggers examine
-- independent columns with no cross-dependencies.
