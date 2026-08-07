CREATE TRIGGER trg_subscription_plan_updated_at
BEFORE UPDATE ON control.subscription_plan
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_subscription_plan_guard
BEFORE UPDATE ON control.subscription_plan
FOR EACH ROW EXECUTE FUNCTION control.trg_subscription_plan_guard();

CREATE TRIGGER trg_subscription_plan_status_changed
BEFORE UPDATE ON control.subscription_plan
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_owner_type_guard
BEFORE UPDATE OR DELETE ON control.owner_type
FOR EACH ROW EXECUTE FUNCTION control.trg_owner_type_guard();

CREATE TRIGGER trg_owner_type_validate_target
BEFORE INSERT OR UPDATE OF
    source_type, target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column
ON control.owner_type
FOR EACH ROW EXECUTE FUNCTION control.trg_owner_type_validate_target();

CREATE TRIGGER trg_owner_type_updated_at
BEFORE UPDATE ON control.owner_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_owner_type_status_changed
BEFORE UPDATE OF status ON control.owner_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_owner_type_purpose_validate
BEFORE INSERT OR UPDATE OF owner_type_id, capability, purpose_code
ON control.owner_type_purpose
FOR EACH ROW EXECUTE FUNCTION control.trg_owner_type_purpose_validate();

CREATE TRIGGER trg_owner_type_purpose_guard
BEFORE UPDATE OR DELETE ON control.owner_type_purpose
FOR EACH ROW EXECUTE FUNCTION control.trg_owner_type_purpose_guard();

CREATE TRIGGER trg_network_document_type_10_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.network_document_type
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_network_document_type();

CREATE TRIGGER trg_network_document_type_20_status_changed
BEFORE UPDATE OF status ON control.network_document_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_network_document_type_90_updated_at
BEFORE UPDATE ON control.network_document_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER delivery_policy_updated_at
BEFORE UPDATE ON control.delivery_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

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
