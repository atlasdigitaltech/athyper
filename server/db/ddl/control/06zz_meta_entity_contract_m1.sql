-- ============================================================================
-- Meta Entity Contract M1: workflow and projection integrity triggers.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_ev_contract_guard ON control.entity_version;
CREATE TRIGGER trg_ev_contract_guard
    BEFORE INSERT OR UPDATE ON control.entity_version
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_entity_version_contract_guard();

DROP TRIGGER IF EXISTS trg_eps_validate_version_pointers ON control.entity_publish_state;
CREATE TRIGGER trg_eps_validate_version_pointers
    BEFORE INSERT OR UPDATE OF tenant_id, published_version_id, current_draft_version_id
    ON control.entity_publish_state
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_entity_publish_state();

DROP TRIGGER IF EXISTS trg_ev_maintain_publish_state ON control.entity_version;
CREATE TRIGGER trg_ev_maintain_publish_state
    AFTER INSERT OR UPDATE OF status, version_no ON control.entity_version
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_maintain_entity_publish_state();

DROP TRIGGER IF EXISTS trg_efsurf_contract_scope ON control.entity_field_surface;
CREATE TRIGGER trg_efsurf_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, entity_surface_id, entity_field_id
    ON control.entity_field_surface
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_es_contract_scope ON control.entity_surface;
CREATE TRIGGER trg_es_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, entity_id, entity_version_id
    ON control.entity_surface
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_eo_contract_scope ON control.entity_operation;
CREATE TRIGGER trg_eo_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, entity_name, entity_version_id
    ON control.entity_operation
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_ep_contract_scope ON control.entity_policy;
CREATE TRIGGER trg_ep_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, entity_id, entity_version_id
    ON control.entity_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_er_contract_scope ON control.entity_relation;
CREATE TRIGGER trg_er_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, entity_version_id, source_field, fk_field, target_entity, target_entity_code
    ON control.entity_relation
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_encfg_contract_scope ON control.entity_numbering_config;
CREATE TRIGGER trg_encfg_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, entity_id, entity_version_id
    ON control.entity_numbering_config
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_el_contract_scope ON control.entity_lifecycle;
CREATE TRIGGER trg_el_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, entity_name, entity_version_id
    ON control.entity_lifecycle
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_elsm_contract_scope ON control.entity_lifecycle_state_mask;
CREATE TRIGGER trg_elsm_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, entity_name, entity_version_id, lifecycle_state_id
    ON control.entity_lifecycle_state_mask
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_ear_contract_scope ON control.entity_action_rule;
CREATE TRIGGER trg_ear_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, entity_code, entity_version_id, required_permission
    ON control.entity_action_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_efs_contract_scope ON control.entity_flow_step;
CREATE TRIGGER trg_efs_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, flow_id
    ON control.entity_flow_step
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_eflow_contract_scope ON control.entity_flow;
CREATE TRIGGER trg_eflow_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, entity_version_id
    ON control.entity_flow
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_efsec_contract_scope ON control.entity_flow_section;
CREATE TRIGGER trg_efsec_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, flow_step_id
    ON control.entity_flow_section
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();

DROP TRIGGER IF EXISTS trg_eff_contract_scope ON control.entity_flow_field;
CREATE TRIGGER trg_eff_contract_scope
    BEFORE INSERT OR UPDATE OF tenant_id, flow_step_id, entity_field_id
    ON control.entity_flow_field
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_contract_projection_scope();
