CREATE TRIGGER delivery_policy_updated_at
BEFORE UPDATE ON control.delivery_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
