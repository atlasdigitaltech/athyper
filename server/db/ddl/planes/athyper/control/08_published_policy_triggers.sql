CREATE TRIGGER workflow_sla_policy_updated_at
    BEFORE UPDATE ON control.workflow_sla_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER workflow_sla_policy_status_changed
    BEFORE UPDATE OF status ON control.workflow_sla_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER bank_format_rule_updated_at
    BEFORE UPDATE ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER bank_format_rule_status_changed
    BEFORE UPDATE OF status ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
