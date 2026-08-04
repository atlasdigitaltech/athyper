CREATE TRIGGER entity_operation_scope_binding_10_normalize
BEFORE INSERT OR UPDATE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_entity_operation_scope_binding();

CREATE TRIGGER entity_operation_scope_binding_20_guard
BEFORE UPDATE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_entity_operation_scope_binding();

CREATE TRIGGER entity_operation_scope_binding_30_validate
BEFORE INSERT OR UPDATE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_entity_operation_scope_binding();

CREATE TRIGGER entity_operation_scope_binding_60_updated_at
BEFORE UPDATE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER entity_operation_scope_binding_90_delete_guard
BEFORE DELETE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_entity_operation_scope_binding_delete();

