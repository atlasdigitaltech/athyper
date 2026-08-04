CREATE TRIGGER trg_entity_class_profile_90_immutable
BEFORE UPDATE OR DELETE ON metadata.entity_class_profile
FOR EACH ROW EXECUTE FUNCTION metadata.trg_reject_entity_class_profile_mutation();

CREATE TRIGGER trg_entity_runtime_profile_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_runtime_profile
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('profile_key');

CREATE TRIGGER trg_entity_field_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_field
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('field_key');

CREATE TRIGGER trg_entity_field_30_contract
BEFORE INSERT OR UPDATE ON metadata.entity_field
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_field_contract();

CREATE TRIGGER trg_entity_key_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_key
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('key_key');

CREATE TRIGGER trg_entity_key_field_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_key_field
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_key_id', 'entity_field_id');

CREATE TRIGGER trg_entity_key_field_20_binding
BEFORE INSERT OR UPDATE ON metadata.entity_key_field
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_binding();

CREATE TRIGGER trg_entity_search_profile_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_search_profile
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('search_key');

CREATE TRIGGER trg_entity_search_field_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_search_field
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_search_profile_id', 'entity_field_id');

CREATE TRIGGER trg_entity_search_field_20_binding
BEFORE INSERT OR UPDATE ON metadata.entity_search_field
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_binding();

CREATE TRIGGER trg_entity_relation_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_relation
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('relation_key');

CREATE TRIGGER trg_entity_relation_target_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_relation_target
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_relation_id', 'relation_target_key');

CREATE TRIGGER trg_entity_relation_target_20_binding
BEFORE INSERT OR UPDATE ON metadata.entity_relation_target
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_binding();

CREATE TRIGGER trg_entity_relation_field_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_relation_field
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_relation_target_id', 'source_field_id', 'target_field_key');

CREATE TRIGGER trg_entity_relation_field_20_binding
BEFORE INSERT OR UPDATE ON metadata.entity_relation_field
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_binding();

CREATE TRIGGER trg_entity_runtime_profile_90_updated_at
BEFORE UPDATE ON metadata.entity_runtime_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_field_90_updated_at
BEFORE UPDATE ON metadata.entity_field
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_key_90_updated_at
BEFORE UPDATE ON metadata.entity_key
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_key_field_90_updated_at
BEFORE UPDATE ON metadata.entity_key_field
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_search_profile_90_updated_at
BEFORE UPDATE ON metadata.entity_search_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_search_field_90_updated_at
BEFORE UPDATE ON metadata.entity_search_field
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_relation_90_updated_at
BEFORE UPDATE ON metadata.entity_relation
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_relation_target_90_updated_at
BEFORE UPDATE ON metadata.entity_relation_target
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_relation_field_90_updated_at
BEFORE UPDATE ON metadata.entity_relation_field
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_entity_runtime_profile_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_runtime_profile
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE CONSTRAINT TRIGGER trg_entity_field_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_field
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE CONSTRAINT TRIGGER trg_entity_key_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_key
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE CONSTRAINT TRIGGER trg_entity_key_field_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_key_field
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE CONSTRAINT TRIGGER trg_entity_search_profile_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_search_profile
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE CONSTRAINT TRIGGER trg_entity_search_field_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_search_field
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE CONSTRAINT TRIGGER trg_entity_relation_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_relation
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE CONSTRAINT TRIGGER trg_entity_relation_target_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_relation_target
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE CONSTRAINT TRIGGER trg_entity_relation_field_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_relation_field
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
