-- ============================================================================
-- Meta Entity Contract M3 immutable evidence and READY guards.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_ect_immutable ON control.entity_contract_transition;
CREATE TRIGGER trg_ect_immutable
    BEFORE UPDATE OR DELETE ON control.entity_contract_transition
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_contract_transition_immutable();

DROP TRIGGER IF EXISTS trg_eps_m3_ready_guard ON control.entity_publish_state;
CREATE TRIGGER trg_eps_m3_ready_guard
    BEFORE INSERT OR UPDATE ON control.entity_publish_state
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_ready_publish_state();

