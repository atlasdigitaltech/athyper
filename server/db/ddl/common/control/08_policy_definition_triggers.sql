CREATE TRIGGER policy_definition_updated_at
    BEFORE UPDATE ON control.policy_definition
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
