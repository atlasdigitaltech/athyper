CREATE TRIGGER policy_rule_updated_at
    BEFORE UPDATE ON control.policy_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER policy_test_case_updated_at
    BEFORE UPDATE ON control.policy_test_case
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER policy_test_case_status_changed
    BEFORE UPDATE OF status ON control.policy_test_case
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
