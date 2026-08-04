CREATE TRIGGER trg_entity_surface_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_surface FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('surface_key');
CREATE TRIGGER trg_entity_surface_section_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_surface_section FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_surface_id', 'section_key');
CREATE TRIGGER trg_entity_surface_section_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_surface_section FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_surface_binding();
CREATE TRIGGER trg_entity_surface_field_binding_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_surface_field_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_surface_id', 'binding_key');
CREATE TRIGGER trg_entity_surface_field_binding_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_surface_field_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_surface_binding();
CREATE TRIGGER trg_entity_operation_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_operation FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('operation_key');
CREATE TRIGGER trg_entity_operation_20_references BEFORE INSERT OR UPDATE ON metadata.entity_operation FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_operation_references();

CREATE TRIGGER trg_entity_surface_90_updated_at BEFORE UPDATE ON metadata.entity_surface FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_entity_surface_section_90_updated_at BEFORE UPDATE ON metadata.entity_surface_section FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_entity_surface_field_binding_90_updated_at BEFORE UPDATE ON metadata.entity_surface_field_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_entity_operation_90_updated_at BEFORE UPDATE ON metadata.entity_operation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_entity_surface_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_surface DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
CREATE CONSTRAINT TRIGGER trg_entity_surface_section_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_surface_section DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
CREATE CONSTRAINT TRIGGER trg_entity_surface_field_binding_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_surface_field_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
CREATE CONSTRAINT TRIGGER trg_entity_operation_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_operation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
