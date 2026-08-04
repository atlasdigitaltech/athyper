CREATE TRIGGER notification_provider_updated_at
BEFORE UPDATE ON control.notification_provider
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER notification_template_updated_at
BEFORE UPDATE ON control.notification_template
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER notification_routing_rule_updated_at
BEFORE UPDATE ON control.notification_routing_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
