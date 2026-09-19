-- Generated from the extracted live Atlas AI contract.
-- Maintained as canonical foundation DDL; use additive migrations for installed databases.
-- Supported verification and maintenance: server/db/scripts/README.md (Atlas AI DDL).

CREATE OR REPLACE FUNCTION ai.trg_guard_ai_tool_invocation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai'
AS $function$
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
            'ai.ai_tool_invocation: scope, call identity, input hash, and creation fields are immutable'
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
            'ai.ai_tool_invocation: authorization resolution fields change at most once'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status IN ('completed', 'denied', 'failed', 'expired', 'cancelled') THEN
        RAISE EXCEPTION
            'ai.ai_tool_invocation: terminal invocations are immutable'
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
            'ai.ai_tool_invocation: invalid lifecycle transition from % to %',
            OLD.status, NEW.status
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.updated_by IS NULL THEN
        RAISE EXCEPTION
            'ai.ai_tool_invocation: lifecycle transitions require an audit actor'
            USING ERRCODE = 'not_null_violation';
    END IF;

    IF v_current_principal_id IS NOT NULL
       AND NEW.updated_by IS DISTINCT FROM v_current_principal_id
    THEN
        RAISE EXCEPTION
            'ai.ai_tool_invocation: audit actor must match the verified request principal'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF (
        OLD.confirmation_actor_id IS DISTINCT FROM NEW.confirmation_actor_id
        OR OLD.confirmation_at IS DISTINCT FROM NEW.confirmation_at
    )
    THEN
        IF OLD.status <> 'proposed' OR NEW.status <> 'confirmed' THEN
            RAISE EXCEPTION
                'ai.ai_tool_invocation: confirmation metadata changes only during proposed to confirmed'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        IF NEW.confirmation_actor_id IS DISTINCT FROM NEW.updated_by THEN
            RAISE EXCEPTION
                'ai.ai_tool_invocation: confirmation actor must match the transition audit actor'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.confirmation_policy = 'dual_control'
           AND NEW.confirmation_actor_id IS NOT DISTINCT FROM NEW.principal_id
        THEN
            RAISE EXCEPTION
                'ai.ai_tool_invocation: dual control requires a different confirmation actor'
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
            'ai.ai_tool_invocation: execution guard metadata changes only when entering executing'
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
            'ai.ai_tool_invocation: outcome metadata changes only on a terminal transition'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_guard_atlas_run_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai'
AS $function$
BEGIN
    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
       OR OLD.plane IS DISTINCT FROM NEW.plane
       OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
       OR OLD.client_request_id IS DISTINCT FROM NEW.client_request_id
       OR OLD.input_message_id IS DISTINCT FROM NEW.input_message_id
       OR OLD.output_message_id IS DISTINCT FROM NEW.output_message_id
       OR OLD.started_at IS DISTINCT FROM NEW.started_at
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'ai.atlas_run: scope, idempotency, messages, principal, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status IN ('completed', 'failed', 'cancelled') THEN
        IF OLD.metering_run_id IS NULL
           AND NEW.metering_run_id IS NOT NULL
           AND OLD.status IS NOT DISTINCT FROM NEW.status
           AND OLD.cancellation_requested_at IS NOT DISTINCT FROM NEW.cancellation_requested_at
           AND OLD.cancellation_requested_by IS NOT DISTINCT FROM NEW.cancellation_requested_by
           AND OLD.terminal_at IS NOT DISTINCT FROM NEW.terminal_at
           AND OLD.terminal_error_class IS NOT DISTINCT FROM NEW.terminal_error_class
        THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION
            'ai.atlas_run: terminal runs are immutable except one-time metering reconciliation'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.status NOT IN ('started', 'completed', 'failed', 'cancelled') THEN
        RAISE EXCEPTION
            'ai.atlas_run: invalid status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.cancellation_requested_at IS NOT NULL
       AND (
            OLD.cancellation_requested_at IS DISTINCT FROM NEW.cancellation_requested_at
            OR OLD.cancellation_requested_by IS DISTINCT FROM NEW.cancellation_requested_by
       )
    THEN
        RAISE EXCEPTION
            'ai.atlas_run: a cancellation request cannot be cleared or reassigned'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.status = 'started' -- INTENTIONALLY HARDCODED: no pre-terminal metering
        AND NEW.metering_run_id IS NOT NULL THEN
        RAISE EXCEPTION
            'ai.atlas_run: metering reconciliation requires a terminal run'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_validate_ai_tool_invocation_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai'
AS $function$
DECLARE
    v_run_principal_id uuid;
    v_run_status text;
BEGIN
    IF NEW.status <> 'proposed' THEN
        RAISE EXCEPTION
            'ai.ai_tool_invocation: every invocation must begin in proposed state'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.created_by IS DISTINCT FROM NEW.principal_id THEN
        RAISE EXCEPTION
            'ai.ai_tool_invocation: proposal actor must match the Atlas run principal'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT principal_id, status
      INTO v_run_principal_id, v_run_status
      FROM ai.atlas_run
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.thread_id
       AND plane = NEW.plane
       AND id = NEW.run_id;

    IF v_run_principal_id IS NULL THEN
        RAISE EXCEPTION
            'ai.ai_tool_invocation: Atlas run not found in requested scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_run_principal_id IS DISTINCT FROM NEW.principal_id THEN
        RAISE EXCEPTION
            'ai.ai_tool_invocation: proposal principal must own the Atlas run'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_run_status <> 'started' THEN
        RAISE EXCEPTION
            'ai.ai_tool_invocation: tool proposals require an active Atlas run'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_validate_atlas_run_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai', 'master'
AS $function$
DECLARE
    v_input ai.atlas_message%ROWTYPE;
    v_output ai.atlas_message%ROWTYPE;
    v_owner_principal_id uuid;
BEGIN
    SELECT owner_principal_id
      INTO v_owner_principal_id
      FROM ai.atlas_thread
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane;

    IF v_owner_principal_id IS NULL
       OR v_owner_principal_id IS DISTINCT FROM NEW.principal_id
    THEN
        RAISE EXCEPTION
            'ai.atlas_run: only the immutable thread owner may create a run'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT *
      INTO v_input
      FROM ai.atlas_message
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane
       AND id = NEW.input_message_id;

    SELECT *
      INTO v_output
      FROM ai.atlas_message
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane
       AND id = NEW.output_message_id;

    IF v_input.id IS NULL OR v_output.id IS NULL THEN
        RAISE EXCEPTION
            'ai.atlas_run: input and output messages must exist in the run scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_input.role <> 'user'
       OR v_input.status <> 'completed'
       OR v_input.run_id IS DISTINCT FROM NEW.id
       OR v_input.created_by IS DISTINCT FROM NEW.principal_id
    THEN
        RAISE EXCEPTION
            'ai.atlas_run: input must be the principal''s completed user message linked to this run'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_output.role <> 'assistant'
       OR v_output.run_id IS DISTINCT FROM NEW.id
       OR v_output.created_by IS DISTINCT FROM NEW.principal_id
       OR v_output.parent_message_id IS DISTINCT FROM v_input.id
       OR v_output.sequence <= v_input.sequence
    THEN
        RAISE EXCEPTION
            'ai.atlas_run: output must be a later assistant child linked to this run'
            USING ERRCODE = 'check_violation';
    END IF;

    IF (NEW.status = 'started' -- INTENTIONALLY HARDCODED: run/output coherence
        AND v_output.status <> 'pending')
       OR (
            NEW.status IN ('completed', 'failed', 'cancelled')
            AND v_output.status <> NEW.status
       )
    THEN
        RAISE EXCEPTION
            'ai.atlas_run: run status % does not match output message status %',
            NEW.status, v_output.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.fn_atlas_conversation_access(p_tenant_id uuid, p_conversation_id uuid, p_owner_only boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'ai'
 SET row_security TO 'off'
AS $function$
    SELECT
        nullif(current_setting('app.current_tenant_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.current_principal_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.current_atlas_plane', true), '') IS NOT NULL
        AND p_tenant_id =
            nullif(current_setting('app.current_tenant_id', true), '')::uuid
        AND EXISTS (
            SELECT 1
              FROM ai.atlas_thread AS t
             WHERE t.tenant_id = p_tenant_id
               AND t.conversation_id = p_conversation_id
               AND t.plane =
                   nullif(current_setting('app.current_atlas_plane', true), '')
               AND (
                    t.owner_principal_id =
                        nullif(current_setting('app.current_principal_id', true), '')::uuid
                    OR (
                        p_owner_only = false
                        AND EXISTS (
                            SELECT 1
                              FROM document.conversation_participant AS cp
                             WHERE cp.tenant_id = t.tenant_id
                               AND cp.conversation_id = t.conversation_id
                               AND cp.principal_id =
                                   nullif(
                                       current_setting('app.current_principal_id', true),
                                       ''
                                   )::uuid
                               AND cp.left_at IS NULL
                        )
                    )
               )
        );
$function$;

CREATE OR REPLACE FUNCTION ai.trg_allocate_atlas_message_sequence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'ai'
 SET row_security TO 'off'
AS $function$
DECLARE
    v_next bigint;
BEGIN
    IF NOT ai.fn_atlas_conversation_access(
        NEW.tenant_id,
        NEW.conversation_id,
        true
    ) THEN
        RAISE EXCEPTION
            'ai.atlas_message: unauthorized tenant, principal, or plane'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE ai.atlas_thread
       SET last_message_sequence = last_message_sequence + 1
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane
     RETURNING last_message_sequence INTO v_next;

    IF v_next IS NULL THEN
        RAISE EXCEPTION
            'ai.atlas_message: Atlas thread not found in requested scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.sequence = 0 THEN
        NEW.sequence := v_next;
    ELSIF NEW.sequence <> v_next THEN
        RAISE EXCEPTION
            'ai.atlas_message: expected next sequence %, received %',
            v_next, NEW.sequence
            USING ERRCODE = 'serialization_failure';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_guard_atlas_message_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai'
AS $function$
BEGIN
    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
       OR OLD.plane IS DISTINCT FROM NEW.plane
       OR OLD.sequence IS DISTINCT FROM NEW.sequence
       OR OLD.role IS DISTINCT FROM NEW.role
       OR OLD.run_id IS DISTINCT FROM NEW.run_id
       OR OLD.parent_message_id IS DISTINCT FROM NEW.parent_message_id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'ai.atlas_message: identity, scope, ordering, role, run, parent, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status IN ('completed', 'failed', 'cancelled') THEN
        RAISE EXCEPTION
            'ai.atlas_message: terminal messages are immutable; create a correction message'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status = 'pending' -- INTENTIONALLY HARDCODED: Atlas message lifecycle
       AND NEW.status NOT IN ('pending', 'completed', 'failed', 'cancelled')
    THEN
        RAISE EXCEPTION
            'ai.atlas_message: invalid status transition from pending to %',
            NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_guard_atlas_thread_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai'
AS $function$
BEGIN
    IF OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.plane IS DISTINCT FROM NEW.plane
       OR OLD.owner_principal_id IS DISTINCT FROM NEW.owner_principal_id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'ai.atlas_thread: conversation, tenant, plane, owner, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.summary_blocks IS DISTINCT FROM NEW.summary_blocks
       OR OLD.protected_summary_ref IS DISTINCT FROM NEW.protected_summary_ref
    THEN
        NEW.summary_version := OLD.summary_version + 1;
    ELSIF OLD.summary_version IS DISTINCT FROM NEW.summary_version THEN
        RAISE EXCEPTION
            'ai.atlas_thread: summary_version changes only with summary content'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_validate_atlas_participant_cursor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai'
AS $function$
BEGIN
    IF NEW.last_read_message_id IS NOT NULL
       AND ai.fn_is_atlas_conversation(NEW.tenant_id, NEW.conversation_id)
       AND NOT EXISTS (
            SELECT 1
              FROM ai.atlas_message AS m
             WHERE m.tenant_id = NEW.tenant_id
               AND m.conversation_id = NEW.conversation_id
               AND m.id = NEW.last_read_message_id
       )
    THEN
        RAISE EXCEPTION
            'document.conversation_participant: Atlas read cursor must reference a message in the same thread'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_validate_atlas_thread_envelope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai'
AS $function$
DECLARE
    v_type text;
    v_active_owner_count integer;
BEGIN
    SELECT c.type
      INTO v_type
      FROM document.conversation AS c
     WHERE c.tenant_id = NEW.tenant_id
       AND c.id = NEW.conversation_id;

    IF v_type IS DISTINCT FROM 'atlas_agent' THEN
        RAISE EXCEPTION
            'ai.atlas_thread: parent conversation must have type atlas_agent'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*)::integer
      INTO v_active_owner_count
      FROM document.conversation_participant AS cp
     WHERE cp.tenant_id = NEW.tenant_id
       AND cp.conversation_id = NEW.conversation_id
       AND cp.role = 'owner'
       AND cp.left_at IS NULL;

    IF v_active_owner_count <> 1 OR NOT EXISTS (
        SELECT 1
          FROM document.conversation_participant AS cp
         WHERE cp.tenant_id = NEW.tenant_id
           AND cp.conversation_id = NEW.conversation_id
           AND cp.principal_id = NEW.owner_principal_id
           AND cp.role = 'owner'
           AND cp.left_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'ai.atlas_thread: owner must be the one active owner participant'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_prevent_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'log', 'pg_catalog'
AS $function$
BEGIN
    RAISE EXCEPTION '% on %.% is not allowed — row is immutable',
        TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_validate_lookup_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control'
AS $function$
DECLARE
    v_domain  text := TG_ARGV[0];
    v_col     text := TG_ARGV[1];
    v_value   text;
    v_session uuid;
BEGIN
    EXECUTE format('SELECT ($1).%I::text', v_col) INTO v_value USING NEW;
    IF v_value IS NULL THEN RETURN NEW; END IF;

    -- 1. Try global (system) row first — always valid, session-free
    IF EXISTS (
        SELECT 1 FROM control.lookup_value
        WHERE domain_code = v_domain AND code = v_value
          AND status = 'active' AND tenant_id IS NULL
    ) THEN RETURN NEW; END IF;

    -- 2. Try tenant-scoped row if session is established and domain is extensible
    v_session := shared.current_tenant_id_soft();
    IF v_session IS NOT NULL AND EXISTS (
        SELECT 1
        FROM control.lookup_value lv
        JOIN control.lookup_domain ld ON ld.code = lv.domain_code
        WHERE lv.domain_code = v_domain AND lv.code = v_value
          AND lv.status = 'active' AND lv.tenant_id = v_session
          AND ld.is_extensible = true
    ) THEN RETURN NEW; END IF;

    RAISE EXCEPTION
        '%.%: invalid value "%" for lookup domain "%"',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, v_value, v_domain
        USING ERRCODE = 'check_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION ai.fn_is_atlas_conversation(p_tenant_id uuid, p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'ai'
 SET row_security TO 'off'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM document.conversation AS c
         WHERE c.tenant_id = p_tenant_id
           AND c.id = p_conversation_id
           AND c.type = 'atlas_agent'
    );
$function$;

CREATE OR REPLACE FUNCTION ai.trg_guard_atlas_conversation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai'
AS $function$
BEGIN
    IF OLD.type = 'atlas_agent' OR NEW.type = 'atlas_agent' THEN
        IF OLD.type IS DISTINCT FROM NEW.type
           OR OLD.id IS DISTINCT FROM NEW.id
           OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
           OR OLD.entity_type IS DISTINCT FROM NEW.entity_type
           OR OLD.entity_id IS DISTINCT FROM NEW.entity_id
           OR OLD.created_at IS DISTINCT FROM NEW.created_at
           OR OLD.created_by IS DISTINCT FROM NEW.created_by
        THEN
            RAISE EXCEPTION
                'document.conversation: Atlas type, identity, tenant, anchor, and creation fields are immutable'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_guard_atlas_participant_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai'
AS $function$
BEGIN
    IF NOT ai.fn_is_atlas_conversation(NEW.tenant_id, NEW.conversation_id) THEN
        RETURN NEW;
    END IF;

    IF NEW.role = 'owner' AND NEW.left_at IS NOT NULL THEN
        RAISE EXCEPTION
            'document.conversation_participant: an Atlas owner must be active'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.role = 'owner' AND EXISTS (
        SELECT 1
          FROM document.conversation_participant AS cp
         WHERE cp.tenant_id = NEW.tenant_id
           AND cp.conversation_id = NEW.conversation_id
           AND cp.role = 'owner'
           AND cp.left_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'document.conversation_participant: an Atlas thread has exactly one active owner'
            USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_guard_atlas_participant_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'ai'
AS $function$
DECLARE
    v_principal_id uuid :=
        nullif(current_setting('app.current_principal_id', true), '')::uuid;
BEGIN
    IF NOT ai.fn_is_atlas_conversation(OLD.tenant_id, OLD.conversation_id) THEN
        RETURN NEW;
    END IF;

    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
       OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
       OR OLD.role IS DISTINCT FROM NEW.role
       OR OLD.joined_at IS DISTINCT FROM NEW.joined_at
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'document.conversation_participant: Atlas identity, role, membership origin, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.left_at IS NOT NULL AND NEW.left_at IS DISTINCT FROM OLD.left_at THEN
        RAISE EXCEPTION
            'document.conversation_participant: revoked Atlas membership cannot be restored or rewritten'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (
        OLD.last_read_message_id IS DISTINCT FROM NEW.last_read_message_id
        OR OLD.last_read_at IS DISTINCT FROM NEW.last_read_at
    ) AND NEW.principal_id IS DISTINCT FROM v_principal_id THEN
        RAISE EXCEPTION
            'document.conversation_participant: only the participant may advance their Atlas read cursor'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF OLD.role = 'owner' AND OLD.left_at IS DISTINCT FROM NEW.left_at THEN
        RAISE EXCEPTION
            'document.conversation_participant: the Atlas owner cannot leave an owned thread'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION ai.trg_guard_atlas_generation_metadata()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.generation_config IS DISTINCT FROM NEW.generation_config
       OR OLD.request_digest IS DISTINCT FROM NEW.request_digest
       OR OLD.lease_expires_at IS DISTINCT FROM NEW.lease_expires_at
    THEN
        RAISE EXCEPTION 'Atlas generation identity is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$function$;
