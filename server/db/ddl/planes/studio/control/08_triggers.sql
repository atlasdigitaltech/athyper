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
