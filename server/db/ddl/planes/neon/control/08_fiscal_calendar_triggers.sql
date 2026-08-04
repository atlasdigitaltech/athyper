CREATE TRIGGER trg_fiscal_calendar_config_00_created_by
BEFORE INSERT ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_fiscal_calendar_config_05_validate
BEFORE INSERT OR UPDATE ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_fiscal_calendar_config();

CREATE TRIGGER trg_fiscal_calendar_config_10_status
BEFORE UPDATE OF status ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_fiscal_calendar_config_20_guard
BEFORE UPDATE OR DELETE ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_fiscal_calendar_config();

CREATE TRIGGER trg_fiscal_calendar_config_90_updated
BEFORE UPDATE ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_fiscal_calendar_period_rule_00_created_by
BEFORE INSERT ON control.fiscal_calendar_period_rule
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_fiscal_calendar_period_rule_10_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.fiscal_calendar_period_rule
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_fiscal_calendar_period_rule();

CREATE TRIGGER trg_company_fiscal_calendar_assignment_00_created_by
BEFORE INSERT ON control.company_fiscal_calendar_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_company_fiscal_calendar_assignment_05_validate
BEFORE INSERT OR UPDATE ON control.company_fiscal_calendar_assignment
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_company_fiscal_calendar_assignment();

CREATE TRIGGER trg_company_fiscal_calendar_assignment_10_status
BEFORE UPDATE OF status ON control.company_fiscal_calendar_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_company_fiscal_calendar_assignment_20_guard
BEFORE UPDATE OR DELETE ON control.company_fiscal_calendar_assignment
FOR EACH ROW
EXECUTE FUNCTION control.trg_guard_company_fiscal_calendar_assignment();

CREATE TRIGGER trg_company_fiscal_calendar_assignment_90_updated
BEFORE UPDATE ON control.company_fiscal_calendar_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
