CREATE TRIGGER trg_entity_lifecycle_binding_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_lifecycle_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('binding_key');
CREATE TRIGGER trg_entity_lifecycle_binding_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_lifecycle_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_lifecycle_binding();
CREATE TRIGGER trg_entity_lifecycle_binding_90_updated_at BEFORE UPDATE ON metadata.entity_lifecycle_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE CONSTRAINT TRIGGER trg_entity_lifecycle_binding_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_lifecycle_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE TRIGGER trg_entity_lifecycle_operation_binding_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_lifecycle_operation_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_lifecycle_binding_id','entity_operation_id','mapping_key');
CREATE TRIGGER trg_entity_lifecycle_operation_binding_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_lifecycle_operation_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_lifecycle_binding();
CREATE TRIGGER trg_entity_lifecycle_operation_binding_90_updated_at BEFORE UPDATE ON metadata.entity_lifecycle_operation_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE CONSTRAINT TRIGGER trg_entity_lifecycle_operation_binding_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_lifecycle_operation_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
