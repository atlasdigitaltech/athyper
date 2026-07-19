DROP TRIGGER IF EXISTS trg_fcc_updated_at ON control.fiscal_calendar_config;
CREATE TRIGGER trg_fcc_updated_at BEFORE UPDATE ON control.fiscal_calendar_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
DROP TRIGGER IF EXISTS trg_fcc_status_changed ON control.fiscal_calendar_config;
CREATE TRIGGER trg_fcc_status_changed BEFORE UPDATE ON control.fiscal_calendar_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_fcpr_updated_at ON control.fiscal_calendar_period_rule;
CREATE TRIGGER trg_fcpr_updated_at BEFORE UPDATE ON control.fiscal_calendar_period_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
DROP TRIGGER IF EXISTS trg_fcpr_status_changed ON control.fiscal_calendar_period_rule;
CREATE TRIGGER trg_fcpr_status_changed BEFORE UPDATE ON control.fiscal_calendar_period_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_cfca_updated_at ON control.company_fiscal_calendar_assignment;
CREATE TRIGGER trg_cfca_updated_at BEFORE UPDATE ON control.company_fiscal_calendar_assignment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
DROP TRIGGER IF EXISTS trg_cfca_status_changed ON control.company_fiscal_calendar_assignment;
CREATE TRIGGER trg_cfca_status_changed BEFORE UPDATE ON control.company_fiscal_calendar_assignment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
