CREATE TRIGGER risk_source_config_identity_guard
BEFORE UPDATE ON control.risk_source_config
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_risk_source_config_identity();
CREATE TRIGGER risk_source_config_status_changed
BEFORE UPDATE OF status ON control.risk_source_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER risk_source_config_updated_at
BEFORE UPDATE ON control.risk_source_config
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
