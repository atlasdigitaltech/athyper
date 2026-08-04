CREATE TRIGGER trg_entity_operation_scope_binding_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row(
    'entity_operation_id', 'binding_key'
);

CREATE TRIGGER trg_entity_operation_scope_binding_20_binding
BEFORE INSERT OR UPDATE ON metadata.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_operation_scope_binding();

CREATE TRIGGER trg_entity_operation_scope_binding_90_updated_at
BEFORE UPDATE ON metadata.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_entity_operation_scope_binding_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_operation_scope_binding
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
