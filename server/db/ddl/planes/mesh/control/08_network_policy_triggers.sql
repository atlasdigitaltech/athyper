CREATE TRIGGER routing_rule_updated_at BEFORE UPDATE ON control.routing_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER routing_rule_status_changed BEFORE UPDATE OF status ON control.routing_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER retention_policy_updated_at BEFORE UPDATE ON control.retention_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER retention_policy_status_changed BEFORE UPDATE OF status ON control.retention_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER quota_policy_updated_at BEFORE UPDATE ON control.quota_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER quota_policy_status_changed BEFORE UPDATE OF status ON control.quota_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
