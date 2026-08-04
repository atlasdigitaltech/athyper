CREATE TRIGGER commodity_code_classification_policy_identity_guard
BEFORE UPDATE ON control.commodity_code_classification_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_control_identity();

CREATE TRIGGER commodity_code_classification_policy_status_changed
BEFORE UPDATE OF status ON control.commodity_code_classification_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER commodity_code_classification_policy_updated_at
BEFORE UPDATE ON control.commodity_code_classification_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER commodity_code_classification_policy_validate
BEFORE INSERT OR UPDATE OF
    primary_commodity_domain_code,
    trade_commodity_domain_code,
    status
ON control.commodity_code_classification_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_commodity_code_classification_policy();
