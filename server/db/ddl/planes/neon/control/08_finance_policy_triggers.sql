CREATE TRIGGER trg_rounding_rule_00_created_by
BEFORE INSERT ON control.rounding_rule
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_rounding_rule_10_status
BEFORE UPDATE OF status ON control.rounding_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_rounding_rule_20_guard
BEFORE UPDATE OR DELETE ON control.rounding_rule
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_rounding_rule();

CREATE TRIGGER trg_rounding_rule_90_updated
BEFORE UPDATE ON control.rounding_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_procurement_match_policy_00_created_by
BEFORE INSERT ON control.procurement_match_tolerance_policy
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_procurement_match_policy_10_status
BEFORE UPDATE OF status ON control.procurement_match_tolerance_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_procurement_match_policy_20_guard
BEFORE UPDATE OR DELETE ON control.procurement_match_tolerance_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_procurement_match_tolerance_policy();

CREATE TRIGGER trg_procurement_match_policy_90_updated
BEFORE UPDATE ON control.procurement_match_tolerance_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fx_policy_00_created_by
BEFORE INSERT ON control.fx_policy
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_fx_policy_05_validate
BEFORE INSERT OR UPDATE ON control.fx_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_fx_policy();

CREATE TRIGGER trg_fx_policy_10_status
BEFORE UPDATE OF status ON control.fx_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_fx_policy_20_guard
BEFORE UPDATE OR DELETE ON control.fx_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_fx_policy();

CREATE TRIGGER trg_fx_policy_90_updated
BEFORE UPDATE ON control.fx_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dimension_policy_00_created_by
BEFORE INSERT ON control.dimension_policy
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_dimension_policy_05_validate
BEFORE INSERT OR UPDATE ON control.dimension_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_dimension_policy();

CREATE TRIGGER trg_dimension_policy_10_status
BEFORE UPDATE OF status ON control.dimension_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_dimension_policy_20_guard
BEFORE UPDATE OR DELETE ON control.dimension_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_dimension_policy();

CREATE TRIGGER trg_dimension_policy_90_updated
BEFORE UPDATE ON control.dimension_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_dimension_policy_allowed_value_00_created_by
BEFORE INSERT ON control.dimension_policy_allowed_value
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_dimension_policy_allowed_value_10_guard
BEFORE INSERT OR UPDATE OR DELETE
ON control.dimension_policy_allowed_value
FOR EACH ROW
EXECUTE FUNCTION control.trg_guard_dimension_policy_allowed_value();
