-- ============================================================================
-- Atlas governed-tool lifecycle integrity.
-- ============================================================================

CREATE OR REPLACE FUNCTION event.trg_validate_ai_tool_invocation_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, event
AS $$
DECLARE
    v_run_principal_id uuid;
    v_run_status text;
BEGIN
    IF NEW.status <> 'proposed' THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: every invocation must begin in proposed state'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.created_by IS DISTINCT FROM NEW.principal_id THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: proposal actor must match the Atlas run principal'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT principal_id, status
      INTO v_run_principal_id, v_run_status
      FROM event.atlas_run
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.thread_id
       AND plane = NEW.plane
       AND id = NEW.run_id;

    IF v_run_principal_id IS NULL THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: Atlas run not found in requested scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_run_principal_id IS DISTINCT FROM NEW.principal_id THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: proposal principal must own the Atlas run'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_run_status <> 'started' THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: tool proposals require an active Atlas run'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_tool_invocation_insert_guard
    ON event.ai_tool_invocation;
CREATE TRIGGER trg_ai_tool_invocation_insert_guard
    BEFORE INSERT ON event.ai_tool_invocation
    FOR EACH ROW EXECUTE FUNCTION event.trg_validate_ai_tool_invocation_insert();


CREATE OR REPLACE FUNCTION event.trg_guard_ai_tool_invocation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, event
AS $$
DECLARE
    v_current_principal_id uuid :=
        nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_is_resolution boolean;
BEGIN
    v_is_resolution :=
        OLD.status = 'proposed'
        AND OLD.autonomy_decision = 'not_evaluated'
        AND NEW.autonomy_decision <> 'not_evaluated';

    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.thread_id IS DISTINCT FROM NEW.thread_id
       OR OLD.run_id IS DISTINCT FROM NEW.run_id
       OR OLD.plane IS DISTINCT FROM NEW.plane
       OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
       OR OLD.tool_call_id IS DISTINCT FROM NEW.tool_call_id
       OR OLD.tool_code IS DISTINCT FROM NEW.tool_code
       OR OLD.input_hash IS DISTINCT FROM NEW.input_hash
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: scope, call identity, input hash, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (
        OLD.tool_version IS DISTINCT FROM NEW.tool_version
        OR OLD.action_code IS DISTINCT FROM NEW.action_code
        OR OLD.operation_class IS DISTINCT FROM NEW.operation_class
        OR OLD.risk_class IS DISTINCT FROM NEW.risk_class
        OR OLD.autonomy_decision IS DISTINCT FROM NEW.autonomy_decision
        OR OLD.permission_snapshot IS DISTINCT FROM NEW.permission_snapshot
        OR OLD.policy_snapshot IS DISTINCT FROM NEW.policy_snapshot
        OR OLD.profile_snapshot IS DISTINCT FROM NEW.profile_snapshot
        OR OLD.authorization_epoch IS DISTINCT FROM NEW.authorization_epoch
        OR OLD.policy_revision IS DISTINCT FROM NEW.policy_revision
        OR OLD.profile_revision IS DISTINCT FROM NEW.profile_revision
        OR OLD.proposal_summary IS DISTINCT FROM NEW.proposal_summary
        OR OLD.affected_entity_type IS DISTINCT FROM NEW.affected_entity_type
        OR OLD.affected_entity_id IS DISTINCT FROM NEW.affected_entity_id
        OR OLD.expected_record_row_version IS DISTINCT FROM NEW.expected_record_row_version
        OR OLD.confirmation_required IS DISTINCT FROM NEW.confirmation_required
        OR OLD.confirmation_policy IS DISTINCT FROM NEW.confirmation_policy
        OR OLD.confirmation_token_hash IS DISTINCT FROM NEW.confirmation_token_hash
        OR OLD.confirmation_expires_at IS DISTINCT FROM NEW.confirmation_expires_at
    )
       AND NOT v_is_resolution
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: authorization resolution fields change at most once'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status IN ('completed', 'denied', 'failed', 'expired', 'cancelled') THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: terminal invocations are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (
        OLD.status = NEW.status
        AND NOT (
            OLD.status = 'proposed'
            AND v_is_resolution
        )
       )
       OR NOT (
            (OLD.status = 'proposed'
             AND NEW.status = 'proposed'
             AND v_is_resolution)
            OR
            (OLD.status = 'proposed'
             AND NEW.status IN ('confirmed', 'executing', 'denied', 'failed', 'expired', 'cancelled'))
            OR (OLD.status = 'confirmed'
                AND NEW.status IN ('executing', 'denied', 'failed', 'expired', 'cancelled'))
            OR (OLD.status = 'executing'
                AND NEW.status IN ('completed', 'failed', 'cancelled'))
       )
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: invalid lifecycle transition from % to %',
            OLD.status, NEW.status
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.updated_by IS NULL THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: lifecycle transitions require an audit actor'
            USING ERRCODE = 'not_null_violation';
    END IF;

    IF v_current_principal_id IS NOT NULL
       AND NEW.updated_by IS DISTINCT FROM v_current_principal_id
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: audit actor must match the verified request principal'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF (
        OLD.confirmation_actor_id IS DISTINCT FROM NEW.confirmation_actor_id
        OR OLD.confirmation_at IS DISTINCT FROM NEW.confirmation_at
    )
    THEN
        IF OLD.status <> 'proposed' OR NEW.status <> 'confirmed' THEN
            RAISE EXCEPTION
                'event.ai_tool_invocation: confirmation metadata changes only during proposed to confirmed'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        IF NEW.confirmation_actor_id IS DISTINCT FROM NEW.updated_by THEN
            RAISE EXCEPTION
                'event.ai_tool_invocation: confirmation actor must match the transition audit actor'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.confirmation_policy = 'dual_control'
           AND NEW.confirmation_actor_id IS NOT DISTINCT FROM NEW.principal_id
        THEN
            RAISE EXCEPTION
                'event.ai_tool_invocation: dual control requires a different confirmation actor'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF (
        OLD.execution_guard_snapshot IS DISTINCT FROM NEW.execution_guard_snapshot
        OR OLD.execution_auth_epoch IS DISTINCT FROM NEW.execution_auth_epoch
        OR OLD.execution_policy_revision IS DISTINCT FROM NEW.execution_policy_revision
        OR OLD.executing_at IS DISTINCT FROM NEW.executing_at
        OR OLD.downstream_command_idempotency_key IS DISTINCT FROM
            NEW.downstream_command_idempotency_key
    )
       AND NEW.status <> 'executing'
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: execution guard metadata changes only when entering executing'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (
        OLD.business_transaction_type IS DISTINCT FROM NEW.business_transaction_type
        OR OLD.business_transaction_id IS DISTINCT FROM NEW.business_transaction_id
        OR OLD.result_hash IS DISTINCT FROM NEW.result_hash
        OR OLD.evidence_refs IS DISTINCT FROM NEW.evidence_refs
        OR OLD.terminal_error_class IS DISTINCT FROM NEW.terminal_error_class
        OR OLD.terminal_at IS DISTINCT FROM NEW.terminal_at
        OR OLD.duration_ms IS DISTINCT FROM NEW.duration_ms
    )
       AND NEW.status NOT IN ('completed', 'denied', 'failed', 'expired', 'cancelled')
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: outcome metadata changes only on a terminal transition'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_tool_invocation_mutation_guard
    ON event.ai_tool_invocation;
CREATE TRIGGER trg_ai_tool_invocation_mutation_guard
    BEFORE UPDATE ON event.ai_tool_invocation
    FOR EACH ROW EXECUTE FUNCTION event.trg_guard_ai_tool_invocation_mutation();

DROP TRIGGER IF EXISTS trg_ai_tool_invocation_updated_at
    ON event.ai_tool_invocation;
CREATE TRIGGER trg_ai_tool_invocation_updated_at
    BEFORE UPDATE ON event.ai_tool_invocation
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
