CREATE TRIGGER payment_execution_profile_identity_guard
BEFORE UPDATE ON control.payment_execution_profile
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_control_identity();

CREATE TRIGGER payment_execution_profile_status_changed
BEFORE UPDATE OF status ON control.payment_execution_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER payment_execution_profile_updated_at
BEFORE UPDATE ON control.payment_execution_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER payment_execution_profile_validate
BEFORE INSERT OR UPDATE ON control.payment_execution_profile
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_payment_execution_profile();
