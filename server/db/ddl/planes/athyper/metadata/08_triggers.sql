CREATE TRIGGER trg_metadata_entity_10_guard
BEFORE UPDATE ON metadata.entity
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity();

CREATE TRIGGER trg_metadata_entity_80_status_changed
BEFORE UPDATE OF status ON metadata.entity
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_metadata_entity_90_updated_at
BEFORE UPDATE ON metadata.entity
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_change_set_10_guard
BEFORE INSERT OR UPDATE ON metadata.entity_change_set
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_change_set();

CREATE TRIGGER trg_entity_change_set_90_updated_at
BEFORE UPDATE ON metadata.entity_change_set
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_release_10_validate
BEFORE INSERT ON metadata.entity_release
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_release();

CREATE TRIGGER trg_entity_release_80_mark_change_set_published
AFTER INSERT ON metadata.entity_release
FOR EACH ROW EXECUTE FUNCTION metadata.trg_mark_change_set_published();

CREATE TRIGGER trg_entity_release_90_immutable
BEFORE UPDATE OR DELETE ON metadata.entity_release
FOR EACH ROW EXECUTE FUNCTION metadata.trg_reject_entity_release_mutation();

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

CREATE TRIGGER trg_entity_surface_operation_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_surface_operation FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_surface_id', 'placement_key');
CREATE TRIGGER trg_entity_surface_operation_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_surface_operation FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_phase4_binding();
CREATE TRIGGER trg_entity_operation_rule_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_operation_rule FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_operation_id', 'rule_key');
CREATE TRIGGER trg_entity_operation_rule_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_operation_rule FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_phase4_binding();
CREATE TRIGGER trg_entity_flow_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_flow FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('flow_key');
CREATE TRIGGER trg_entity_flow_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_flow FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_phase4_binding();
CREATE TRIGGER trg_entity_flow_step_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_flow_step FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_flow_id', 'step_key');
CREATE TRIGGER trg_entity_flow_step_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_flow_step FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_phase4_binding();
CREATE TRIGGER trg_entity_policy_binding_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_policy_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('binding_key');
CREATE TRIGGER trg_entity_policy_binding_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_policy_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_phase4_binding();
CREATE TRIGGER trg_entity_field_policy_binding_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_field_policy_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('binding_key');
CREATE TRIGGER trg_entity_field_policy_binding_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_field_policy_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_phase4_binding();
CREATE TRIGGER trg_entity_contract_test_case_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_contract_test_case FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('test_key');
CREATE TRIGGER trg_entity_contract_test_case_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_contract_test_case FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_phase4_binding();

CREATE TRIGGER trg_entity_surface_operation_90_updated_at BEFORE UPDATE ON metadata.entity_surface_operation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_entity_operation_rule_90_updated_at BEFORE UPDATE ON metadata.entity_operation_rule FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_entity_flow_90_updated_at BEFORE UPDATE ON metadata.entity_flow FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_entity_flow_step_90_updated_at BEFORE UPDATE ON metadata.entity_flow_step FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_entity_policy_binding_90_updated_at BEFORE UPDATE ON metadata.entity_policy_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_entity_field_policy_binding_90_updated_at BEFORE UPDATE ON metadata.entity_field_policy_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_entity_contract_test_case_90_updated_at BEFORE UPDATE ON metadata.entity_contract_test_case FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_entity_surface_operation_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_surface_operation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
CREATE CONSTRAINT TRIGGER trg_entity_operation_rule_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_operation_rule DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
CREATE CONSTRAINT TRIGGER trg_entity_flow_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_flow DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
CREATE CONSTRAINT TRIGGER trg_entity_flow_step_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_flow_step DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
CREATE CONSTRAINT TRIGGER trg_entity_policy_binding_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_policy_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
CREATE CONSTRAINT TRIGGER trg_entity_field_policy_binding_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_field_policy_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
CREATE CONSTRAINT TRIGGER trg_entity_contract_test_case_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_contract_test_case DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE TRIGGER trg_entity_lifecycle_binding_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_lifecycle_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('binding_key');
CREATE TRIGGER trg_entity_lifecycle_binding_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_lifecycle_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_lifecycle_binding();
CREATE TRIGGER trg_entity_lifecycle_binding_90_updated_at BEFORE UPDATE ON metadata.entity_lifecycle_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE CONSTRAINT TRIGGER trg_entity_lifecycle_binding_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_lifecycle_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE TRIGGER trg_entity_lifecycle_operation_binding_10_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_lifecycle_operation_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_lifecycle_binding_id','entity_operation_id','mapping_key');
CREATE TRIGGER trg_entity_lifecycle_operation_binding_20_binding BEFORE INSERT OR UPDATE ON metadata.entity_lifecycle_operation_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_lifecycle_binding();
CREATE TRIGGER trg_entity_lifecycle_operation_binding_90_updated_at BEFORE UPDATE ON metadata.entity_lifecycle_operation_binding FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE CONSTRAINT TRIGGER trg_entity_lifecycle_operation_binding_95_graph_validate AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_lifecycle_operation_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

CREATE TRIGGER trg_entity_numbering_binding_10_graph_guard
BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_numbering_binding
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_field_id','entity_operation_id','binding_key');
CREATE TRIGGER trg_entity_numbering_binding_20_binding
BEFORE INSERT OR UPDATE ON metadata.entity_numbering_binding
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_numbering_binding();
CREATE TRIGGER trg_entity_numbering_binding_90_updated_at
BEFORE UPDATE ON metadata.entity_numbering_binding
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE CONSTRAINT TRIGGER trg_entity_numbering_binding_95_graph_validate
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_numbering_binding
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();

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
