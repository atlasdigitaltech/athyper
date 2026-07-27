-- ============================================================================
-- Atlas conversation lifecycle, ordering, and immutability guards.
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_guard_atlas_thread_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.plane IS DISTINCT FROM NEW.plane
       OR OLD.owner_principal_id IS DISTINCT FROM NEW.owner_principal_id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'master.atlas_thread: conversation, tenant, plane, owner, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.summary_blocks IS DISTINCT FROM NEW.summary_blocks
       OR OLD.protected_summary_ref IS DISTINCT FROM NEW.protected_summary_ref
    THEN
        NEW.summary_version := OLD.summary_version + 1;
    ELSIF OLD.summary_version IS DISTINCT FROM NEW.summary_version THEN
        RAISE EXCEPTION
            'master.atlas_thread: summary_version changes only with summary content'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atlas_thread_mutation_guard
    ON master.atlas_thread;
CREATE TRIGGER trg_atlas_thread_mutation_guard
    BEFORE UPDATE ON master.atlas_thread
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_atlas_thread_mutation();

DROP TRIGGER IF EXISTS trg_atlas_thread_updated_at
    ON master.atlas_thread;
CREATE TRIGGER trg_atlas_thread_updated_at
    BEFORE UPDATE ON master.atlas_thread
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


CREATE OR REPLACE FUNCTION master.trg_validate_atlas_thread_envelope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_type text;
    v_active_owner_count integer;
BEGIN
    SELECT c.type
      INTO v_type
      FROM master.conversation AS c
     WHERE c.tenant_id = NEW.tenant_id
       AND c.id = NEW.conversation_id;

    IF v_type IS DISTINCT FROM 'atlas_agent' THEN
        RAISE EXCEPTION
            'master.atlas_thread: parent conversation must have type atlas_agent'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*)::integer
      INTO v_active_owner_count
      FROM master.conversation_participant AS cp
     WHERE cp.tenant_id = NEW.tenant_id
       AND cp.conversation_id = NEW.conversation_id
       AND cp.role = 'owner'
       AND cp.left_at IS NULL;

    IF v_active_owner_count <> 1 OR NOT EXISTS (
        SELECT 1
          FROM master.conversation_participant AS cp
         WHERE cp.tenant_id = NEW.tenant_id
           AND cp.conversation_id = NEW.conversation_id
           AND cp.principal_id = NEW.owner_principal_id
           AND cp.role = 'owner'
           AND cp.left_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'master.atlas_thread: owner must be the one active owner participant'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_atlas_thread_envelope_check
    ON master.atlas_thread;
-- Creation order under tenant RLS is conversation -> atlas_thread -> owner
-- participant. Deferral permits that order while still requiring the owner
-- membership before the transaction commits.
CREATE CONSTRAINT TRIGGER trg_atlas_thread_envelope_check
    AFTER INSERT OR UPDATE ON master.atlas_thread
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_atlas_thread_envelope();


CREATE OR REPLACE FUNCTION master.trg_allocate_atlas_message_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, master
SET row_security = off
AS $$
DECLARE
    v_next bigint;
BEGIN
    IF NOT master.fn_atlas_conversation_access(
        NEW.tenant_id,
        NEW.conversation_id,
        true
    ) THEN
        RAISE EXCEPTION
            'master.atlas_message: unauthorized tenant, principal, or plane'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE master.atlas_thread
       SET last_message_sequence = last_message_sequence + 1
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane
     RETURNING last_message_sequence INTO v_next;

    IF v_next IS NULL THEN
        RAISE EXCEPTION
            'master.atlas_message: Atlas thread not found in requested scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.sequence = 0 THEN
        NEW.sequence := v_next;
    ELSIF NEW.sequence <> v_next THEN
        RAISE EXCEPTION
            'master.atlas_message: expected next sequence %, received %',
            v_next, NEW.sequence
            USING ERRCODE = 'serialization_failure';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atlas_message_allocate_sequence
    ON master.atlas_message;
CREATE TRIGGER trg_atlas_message_allocate_sequence
    BEFORE INSERT ON master.atlas_message
    FOR EACH ROW EXECUTE FUNCTION master.trg_allocate_atlas_message_sequence();


CREATE OR REPLACE FUNCTION master.trg_guard_atlas_message_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
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
            'master.atlas_message: identity, scope, ordering, role, run, parent, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status IN ('completed', 'failed', 'cancelled') THEN
        RAISE EXCEPTION
            'master.atlas_message: terminal messages are immutable; create a correction message'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status = 'pending' -- INTENTIONALLY HARDCODED: Atlas message lifecycle
       AND NEW.status NOT IN ('pending', 'completed', 'failed', 'cancelled')
    THEN
        RAISE EXCEPTION
            'master.atlas_message: invalid status transition from pending to %',
            NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atlas_message_mutation_guard
    ON master.atlas_message;
CREATE TRIGGER trg_atlas_message_mutation_guard
    BEFORE UPDATE ON master.atlas_message
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_atlas_message_mutation();

DROP TRIGGER IF EXISTS trg_atlas_message_updated_at
    ON master.atlas_message;
CREATE TRIGGER trg_atlas_message_updated_at
    BEFORE UPDATE ON master.atlas_message
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


CREATE OR REPLACE FUNCTION event.trg_guard_atlas_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, event
AS $$
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
            'event.atlas_run: scope, idempotency, messages, principal, and creation fields are immutable'
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
            'event.atlas_run: terminal runs are immutable except one-time metering reconciliation'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.status NOT IN ('started', 'completed', 'failed', 'cancelled') THEN
        RAISE EXCEPTION
            'event.atlas_run: invalid status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.cancellation_requested_at IS NOT NULL
       AND (
            OLD.cancellation_requested_at IS DISTINCT FROM NEW.cancellation_requested_at
            OR OLD.cancellation_requested_by IS DISTINCT FROM NEW.cancellation_requested_by
       )
    THEN
        RAISE EXCEPTION
            'event.atlas_run: a cancellation request cannot be cleared or reassigned'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.status = 'started' -- INTENTIONALLY HARDCODED: no pre-terminal metering
        AND NEW.metering_run_id IS NOT NULL THEN
        RAISE EXCEPTION
            'event.atlas_run: metering reconciliation requires a terminal run'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atlas_run_mutation_guard
    ON event.atlas_run;
CREATE TRIGGER trg_atlas_run_mutation_guard
    BEFORE UPDATE ON event.atlas_run
    FOR EACH ROW EXECUTE FUNCTION event.trg_guard_atlas_run_mutation();

DROP TRIGGER IF EXISTS trg_atlas_run_updated_at
    ON event.atlas_run;
CREATE TRIGGER trg_atlas_run_updated_at
    BEFORE UPDATE ON event.atlas_run
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


CREATE OR REPLACE FUNCTION event.trg_validate_atlas_run_messages()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, event, master
AS $$
DECLARE
    v_input master.atlas_message%ROWTYPE;
    v_output master.atlas_message%ROWTYPE;
    v_owner_principal_id uuid;
BEGIN
    SELECT owner_principal_id
      INTO v_owner_principal_id
      FROM master.atlas_thread
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane;

    IF v_owner_principal_id IS NULL
       OR v_owner_principal_id IS DISTINCT FROM NEW.principal_id
    THEN
        RAISE EXCEPTION
            'event.atlas_run: only the immutable thread owner may create a run'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT *
      INTO v_input
      FROM master.atlas_message
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane
       AND id = NEW.input_message_id;

    SELECT *
      INTO v_output
      FROM master.atlas_message
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane
       AND id = NEW.output_message_id;

    IF v_input.id IS NULL OR v_output.id IS NULL THEN
        RAISE EXCEPTION
            'event.atlas_run: input and output messages must exist in the run scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_input.role <> 'user'
       OR v_input.status <> 'completed'
       OR v_input.run_id IS DISTINCT FROM NEW.id
       OR v_input.created_by IS DISTINCT FROM NEW.principal_id
    THEN
        RAISE EXCEPTION
            'event.atlas_run: input must be the principal''s completed user message linked to this run'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_output.role <> 'assistant'
       OR v_output.run_id IS DISTINCT FROM NEW.id
       OR v_output.created_by IS DISTINCT FROM NEW.principal_id
       OR v_output.parent_message_id IS DISTINCT FROM v_input.id
       OR v_output.sequence <= v_input.sequence
    THEN
        RAISE EXCEPTION
            'event.atlas_run: output must be a later assistant child linked to this run'
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
            'event.atlas_run: run status % does not match output message status %',
            NEW.status, v_output.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_atlas_run_message_check
    ON event.atlas_run;
CREATE CONSTRAINT TRIGGER trg_atlas_run_message_check
    AFTER INSERT OR UPDATE ON event.atlas_run
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION event.trg_validate_atlas_run_messages();


CREATE OR REPLACE FUNCTION master.trg_guard_atlas_conversation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
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
                'master.conversation: Atlas type, identity, tenant, anchor, and creation fields are immutable'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_atlas_mutation_guard
    ON master.conversation;
CREATE TRIGGER trg_conversation_atlas_mutation_guard
    BEFORE UPDATE ON master.conversation
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_atlas_conversation_mutation();


CREATE OR REPLACE FUNCTION master.trg_guard_atlas_participant_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NOT master.fn_is_atlas_conversation(NEW.tenant_id, NEW.conversation_id) THEN
        RETURN NEW;
    END IF;

    IF NEW.role = 'owner' AND NEW.left_at IS NOT NULL THEN
        RAISE EXCEPTION
            'master.conversation_participant: an Atlas owner must be active'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.role = 'owner' AND EXISTS (
        SELECT 1
          FROM master.conversation_participant AS cp
         WHERE cp.tenant_id = NEW.tenant_id
           AND cp.conversation_id = NEW.conversation_id
           AND cp.role = 'owner'
           AND cp.left_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'master.conversation_participant: an Atlas thread has exactly one active owner'
            USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_participant_atlas_insert_guard
    ON master.conversation_participant;
CREATE TRIGGER trg_conversation_participant_atlas_insert_guard
    BEFORE INSERT ON master.conversation_participant
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_atlas_participant_insert();


CREATE OR REPLACE FUNCTION master.trg_guard_atlas_participant_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_principal_id uuid :=
        nullif(current_setting('app.current_principal_id', true), '')::uuid;
BEGIN
    IF NOT master.fn_is_atlas_conversation(OLD.tenant_id, OLD.conversation_id) THEN
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
            'master.conversation_participant: Atlas identity, role, membership origin, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.left_at IS NOT NULL AND NEW.left_at IS DISTINCT FROM OLD.left_at THEN
        RAISE EXCEPTION
            'master.conversation_participant: revoked Atlas membership cannot be restored or rewritten'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (
        OLD.last_read_message_id IS DISTINCT FROM NEW.last_read_message_id
        OR OLD.last_read_at IS DISTINCT FROM NEW.last_read_at
    ) AND NEW.principal_id IS DISTINCT FROM v_principal_id THEN
        RAISE EXCEPTION
            'master.conversation_participant: only the participant may advance their Atlas read cursor'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF OLD.role = 'owner' AND OLD.left_at IS DISTINCT FROM NEW.left_at THEN
        RAISE EXCEPTION
            'master.conversation_participant: the Atlas owner cannot leave an owned thread'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_participant_atlas_mutation_guard
    ON master.conversation_participant;
CREATE TRIGGER trg_conversation_participant_atlas_mutation_guard
    BEFORE UPDATE ON master.conversation_participant
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_atlas_participant_mutation();


CREATE OR REPLACE FUNCTION master.trg_validate_atlas_participant_cursor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.last_read_message_id IS NOT NULL
       AND master.fn_is_atlas_conversation(NEW.tenant_id, NEW.conversation_id)
       AND NOT EXISTS (
            SELECT 1
              FROM master.atlas_message AS m
             WHERE m.tenant_id = NEW.tenant_id
               AND m.conversation_id = NEW.conversation_id
               AND m.id = NEW.last_read_message_id
       )
    THEN
        RAISE EXCEPTION
            'master.conversation_participant: Atlas read cursor must reference a message in the same thread'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_participant_atlas_cursor_check
    ON master.conversation_participant;
CREATE CONSTRAINT TRIGGER trg_conversation_participant_atlas_cursor_check
    AFTER INSERT OR UPDATE ON master.conversation_participant
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_atlas_participant_cursor();
