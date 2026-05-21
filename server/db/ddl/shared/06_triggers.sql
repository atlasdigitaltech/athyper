-- ============================================================================
-- shared/06_triggers.sql
-- Concept: Reference Triggers — audit and status-change triggers for shared tables
-- Depends on: 04_tables/001_shared.sql, 08_functions/001_shared.sql
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.
-- ============================================================================

-- [A] updated_at (shared.trg_set_updated_at)

DROP TRIGGER IF EXISTS trg_country_updated_at ON shared.country;
CREATE TRIGGER trg_country_updated_at BEFORE UPDATE ON shared.country FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_currency_updated_at ON shared.currency;
CREATE TRIGGER trg_currency_updated_at BEFORE UPDATE ON shared.currency FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_language_updated_at ON shared.language;
CREATE TRIGGER trg_language_updated_at BEFORE UPDATE ON shared.language FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_locale_updated_at ON shared.locale;
CREATE TRIGGER trg_locale_updated_at BEFORE UPDATE ON shared.locale FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_timezone_updated_at ON shared.timezone;
CREATE TRIGGER trg_timezone_updated_at BEFORE UPDATE ON shared.timezone FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_uom_updated_at ON shared.uom;
CREATE TRIGGER trg_uom_updated_at BEFORE UPDATE ON shared.uom FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_state_region_updated_at ON shared.state_region;
CREATE TRIGGER trg_state_region_updated_at BEFORE UPDATE ON shared.state_region FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_commodity_code_updated_at ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_updated_at BEFORE UPDATE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_industry_code_updated_at ON shared.industry_code;
CREATE TRIGGER trg_industry_code_updated_at BEFORE UPDATE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_workspace_updated_at ON shared.workspace;
CREATE TRIGGER trg_workspace_updated_at BEFORE UPDATE ON shared.workspace FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_module_updated_at ON shared.module;
CREATE TRIGGER trg_module_updated_at BEFORE UPDATE ON shared.module FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_persona_updated_at ON shared.persona;
CREATE TRIGGER trg_persona_updated_at BEFORE UPDATE ON shared.persona FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- [B] status_changed_at (shared.trg_set_status_changed)

DROP TRIGGER IF EXISTS trg_country_status_changed ON shared.country;
CREATE TRIGGER trg_country_status_changed BEFORE UPDATE ON shared.country FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_currency_status_changed ON shared.currency;
CREATE TRIGGER trg_currency_status_changed BEFORE UPDATE ON shared.currency FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_language_status_changed ON shared.language;
CREATE TRIGGER trg_language_status_changed BEFORE UPDATE ON shared.language FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_locale_status_changed ON shared.locale;
CREATE TRIGGER trg_locale_status_changed BEFORE UPDATE ON shared.locale FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_timezone_status_changed ON shared.timezone;
CREATE TRIGGER trg_timezone_status_changed BEFORE UPDATE ON shared.timezone FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_uom_status_changed ON shared.uom;
CREATE TRIGGER trg_uom_status_changed BEFORE UPDATE ON shared.uom FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_state_region_status_changed ON shared.state_region;
CREATE TRIGGER trg_state_region_status_changed BEFORE UPDATE ON shared.state_region FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_commodity_code_status_changed ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_status_changed BEFORE UPDATE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_industry_code_status_changed ON shared.industry_code;
CREATE TRIGGER trg_industry_code_status_changed BEFORE UPDATE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_workspace_status_changed ON shared.workspace;
CREATE TRIGGER trg_workspace_status_changed BEFORE UPDATE ON shared.workspace FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_module_status_changed ON shared.module;
CREATE TRIGGER trg_module_status_changed BEFORE UPDATE ON shared.module FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_persona_status_changed ON shared.persona;
CREATE TRIGGER trg_persona_status_changed BEFORE UPDATE ON shared.persona FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- [C] Immutability guards (shared.trg_immutable_code)

DROP TRIGGER IF EXISTS trg_country_immutable_code ON shared.country;
CREATE TRIGGER trg_country_immutable_code BEFORE UPDATE ON shared.country FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_currency_immutable_code ON shared.currency;
CREATE TRIGGER trg_currency_immutable_code BEFORE UPDATE ON shared.currency FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_language_immutable_code ON shared.language;
CREATE TRIGGER trg_language_immutable_code BEFORE UPDATE ON shared.language FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_locale_immutable_code ON shared.locale;
CREATE TRIGGER trg_locale_immutable_code BEFORE UPDATE ON shared.locale FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_timezone_immutable_code ON shared.timezone;
CREATE TRIGGER trg_timezone_immutable_code BEFORE UPDATE ON shared.timezone FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_uom_immutable_code ON shared.uom;
CREATE TRIGGER trg_uom_immutable_code BEFORE UPDATE ON shared.uom FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_state_region_immutable_code ON shared.state_region;
CREATE TRIGGER trg_state_region_immutable_code BEFORE UPDATE ON shared.state_region FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_commodity_code_immutable_code ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_immutable_code BEFORE UPDATE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_industry_code_immutable_code ON shared.industry_code;
CREATE TRIGGER trg_industry_code_immutable_code BEFORE UPDATE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

-- [D] Hierarchy management (commodity_code & industry_code)

DROP TRIGGER IF EXISTS trg_commodity_code_hierarchy ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_hierarchy BEFORE INSERT OR UPDATE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_code_validate();

DROP TRIGGER IF EXISTS trg_industry_code_hierarchy ON shared.industry_code;
CREATE TRIGGER trg_industry_code_hierarchy BEFORE INSERT OR UPDATE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_code_validate();

DROP TRIGGER IF EXISTS trg_commodity_code_cycle ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_cycle BEFORE INSERT OR UPDATE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_cycle_detect();

DROP TRIGGER IF EXISTS trg_industry_code_cycle ON shared.industry_code;
CREATE TRIGGER trg_industry_code_cycle BEFORE INSERT OR UPDATE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_cycle_detect();

-- Deferred cycle triggers removed: the BEFORE trigger's recursive CTE walks
-- the full parent chain in one query — no bulk-reparenting bypass window exists.

DROP TRIGGER IF EXISTS trg_commodity_code_leaf_maintain ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_leaf_maintain AFTER INSERT OR UPDATE OF parent_code, status OR DELETE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_recompute_parent_leaf();

DROP TRIGGER IF EXISTS trg_industry_code_leaf_maintain ON shared.industry_code;
CREATE TRIGGER trg_industry_code_leaf_maintain AFTER INSERT OR UPDATE OF parent_code, status OR DELETE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_recompute_parent_leaf();

DROP TRIGGER IF EXISTS trg_commodity_code_leaf_guard ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_leaf_guard BEFORE UPDATE OF is_leaf ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_guard_is_leaf();

DROP TRIGGER IF EXISTS trg_industry_code_leaf_guard ON shared.industry_code;
CREATE TRIGGER trg_industry_code_leaf_guard BEFORE UPDATE OF is_leaf ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_guard_is_leaf();

-- [E] Locale / Region consistency

DROP TRIGGER IF EXISTS trg_locale_consistency ON shared.locale;
CREATE TRIGGER trg_locale_consistency BEFORE INSERT OR UPDATE ON shared.locale FOR EACH ROW EXECUTE FUNCTION shared.trg_locale_consistency_validate();

DROP TRIGGER IF EXISTS trg_state_region_code_check ON shared.state_region;
CREATE TRIGGER trg_state_region_code_check BEFORE INSERT OR UPDATE ON shared.state_region FOR EACH ROW EXECUTE FUNCTION shared.trg_state_region_code_consistency();

-- [F] Persona protection

DROP TRIGGER IF EXISTS trg_persona_protect_system ON shared.persona;
CREATE TRIGGER trg_persona_protect_system BEFORE DELETE OR UPDATE ON shared.persona FOR EACH ROW EXECUTE FUNCTION shared.trg_protect_system_persona();

-- [G] Lookup domain validation (replaces session-dependent CHECK constraints)
-- Uses control.trg_validate_lookup_columns(domain_code, column_name).

-- uom.quantity_type
DROP TRIGGER IF EXISTS trg_uom_quantity_type_lookup ON shared.uom;
CREATE TRIGGER trg_uom_quantity_type_lookup
    BEFORE INSERT OR UPDATE OF quantity_type ON shared.uom
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('shared.uom_quantity_type', 'quantity_type');

-- persona.scope_mode
DROP TRIGGER IF EXISTS trg_persona_scope_mode_lookup ON shared.persona;
CREATE TRIGGER trg_persona_scope_mode_lookup
    BEFORE INSERT OR UPDATE OF scope_mode ON shared.persona
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('shared.persona_scope_mode', 'scope_mode');

-- [H] Plan version gate (subscription_plan_version)
-- Closes the prior active version when a new version is inserted.

CREATE OR REPLACE FUNCTION shared.fn_close_prior_plan_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE shared.subscription_plan_version
    SET    valid_to = NEW.valid_from
    WHERE  plan_id  = NEW.plan_id
      AND  valid_to IS NULL
      AND  status   = 'active'
      AND  id       <> NEW.id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_plan_version_gate ON shared.subscription_plan_version;
CREATE TRIGGER trg_subscription_plan_version_gate
AFTER INSERT ON shared.subscription_plan_version
FOR EACH ROW EXECUTE FUNCTION shared.fn_close_prior_plan_version();
