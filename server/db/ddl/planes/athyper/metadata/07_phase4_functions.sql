CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_phase4_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata, control
AS $$
BEGIN
    IF TG_TABLE_NAME = 'entity_surface_operation' THEN
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_surface s JOIN metadata.entity_operation o ON o.id = NEW.entity_operation_id WHERE s.id = NEW.entity_surface_id AND s.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND o.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND s.entity_id = NEW.entity_id AND o.entity_id = NEW.entity_id AND s.change_set_id = NEW.change_set_id AND o.change_set_id = NEW.change_set_id) THEN
            RAISE EXCEPTION 'Surface operation members must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NEW.entity_surface_section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_surface_section x WHERE x.id = NEW.entity_surface_section_id AND x.entity_surface_id = NEW.entity_surface_id AND x.change_set_id = NEW.change_set_id) THEN
            RAISE EXCEPTION 'Surface operation section must belong to its surface' USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NEW.confirmation_surface_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_surface x WHERE x.id = NEW.confirmation_surface_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN
            RAISE EXCEPTION 'Confirmation surface must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_operation_rule' THEN
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.entity_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN
            RAISE EXCEPTION 'Operation rule must belong to its scoped operation' USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_flow' THEN
        IF NEW.entry_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.entry_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Flow entry operation must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
        IF NEW.completion_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.completion_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Flow completion operation must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
    ELSIF TG_TABLE_NAME = 'entity_flow_step' THEN
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_flow f JOIN metadata.entity_surface s ON s.id = NEW.entity_surface_id WHERE f.id = NEW.entity_flow_id AND f.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND s.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND f.entity_id = NEW.entity_id AND s.entity_id = NEW.entity_id AND f.change_set_id = NEW.change_set_id AND s.change_set_id = NEW.change_set_id) THEN
            RAISE EXCEPTION 'Flow step must reference a flow and surface in the same Entity graph' USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_policy_binding' THEN
        IF NOT EXISTS (SELECT 1 FROM control.policy_definition p WHERE p.id = NEW.policy_definition_id AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM NEW.tenant_id)) THEN
            RAISE EXCEPTION 'Policy binding must reference a global or same-tenant policy definition' USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NEW.entity_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.entity_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Policy operation must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
    ELSIF TG_TABLE_NAME = 'entity_field_policy_binding' THEN
        IF NOT EXISTS (SELECT 1 FROM control.policy_definition p WHERE p.id = NEW.policy_definition_id AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM NEW.tenant_id)) THEN RAISE EXCEPTION 'Field policy binding must reference a global or same-tenant policy definition' USING ERRCODE = 'foreign_key_violation'; END IF;
        IF NEW.entity_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.entity_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Field policy operation must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_field x WHERE x.id = NEW.entity_field_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Field policy must reference a field in the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
    ELSIF TG_TABLE_NAME = 'entity_contract_test_case' THEN
        IF NEW.entity_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.entity_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Test operation must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
        IF NEW.entity_flow_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_flow x WHERE x.id = NEW.entity_flow_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Test flow must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
    END IF;
    RETURN NEW;
END;
$$;
