CREATE TRIGGER trg_tax_rate_schedule_00_validate
BEFORE INSERT OR UPDATE ON control.tax_rate_schedule
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tax_rate_schedule();
CREATE TRIGGER trg_tax_rate_schedule_10_guard
BEFORE UPDATE OR DELETE ON control.tax_rate_schedule
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_tax_policy_row();
CREATE TRIGGER trg_tax_rate_schedule_20_status
BEFORE UPDATE OF status ON control.tax_rate_schedule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_tax_rate_schedule_90_updated
BEFORE UPDATE ON control.tax_rate_schedule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tax_group_00_validate
BEFORE INSERT OR UPDATE ON control.tax_group
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tax_group();
CREATE TRIGGER trg_tax_group_10_guard
BEFORE UPDATE OR DELETE ON control.tax_group
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_tax_policy_row();
CREATE TRIGGER trg_tax_group_20_status
BEFORE UPDATE OF status ON control.tax_group
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_tax_group_90_updated
BEFORE UPDATE ON control.tax_group
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_tax_group_component_00_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.tax_group_component
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tax_group_component();

CREATE TRIGGER trg_tax_resolution_rule_00_validate
BEFORE INSERT OR UPDATE ON control.tax_resolution_rule
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tax_resolution_rule();
CREATE TRIGGER trg_tax_resolution_rule_10_guard
BEFORE UPDATE OR DELETE ON control.tax_resolution_rule
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_tax_policy_row();
CREATE TRIGGER trg_tax_resolution_rule_20_status
BEFORE UPDATE OF status ON control.tax_resolution_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_tax_resolution_rule_90_updated
BEFORE UPDATE ON control.tax_resolution_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_wht_threshold_config_00_validate
BEFORE INSERT OR UPDATE ON control.wht_threshold_config
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_wht_threshold_config();
CREATE TRIGGER trg_wht_threshold_config_10_guard
BEFORE UPDATE OR DELETE ON control.wht_threshold_config
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_tax_policy_row();
CREATE TRIGGER trg_wht_threshold_config_20_status
BEFORE UPDATE OF status ON control.wht_threshold_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_wht_threshold_config_90_updated
BEFORE UPDATE ON control.wht_threshold_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
