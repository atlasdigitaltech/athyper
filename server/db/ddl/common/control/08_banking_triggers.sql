CREATE TRIGGER bank_account_validation_rule_updated_at
BEFORE UPDATE ON control.bank_account_validation_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER connector_instance_reject_secret_json
BEFORE INSERT OR UPDATE OF config ON control.connector_instance
FOR EACH ROW EXECUTE FUNCTION control.trg_reject_secret_shaped_json();

CREATE TRIGGER integration_endpoint_reject_secret_headers
BEFORE INSERT OR UPDATE OF headers ON control.integration_endpoint
FOR EACH ROW EXECUTE FUNCTION control.trg_reject_secret_shaped_json();
