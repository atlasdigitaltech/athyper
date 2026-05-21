-- ============================================================================
-- control/05_functions.sql
-- Concept: Governance Logic — lookup validation, lifecycle engine, workflow, document sequences
-- Depends on: 04_tables/002_control.sql, 05_pre_constraint_functions/002_control.sql
-- All functions: CREATE OR REPLACE, SET search_path = control.
-- ============================================================================

-- control.fn_valid_lookup() and control.fn_valid_lookup_nullable() —
-- defined in 05_pre_constraint_functions/002_control.sql (must exist before Phase 04).

-- trg_validate_lookup_columns — trigger replacement for CHECK constraints
-- that called control.fn_valid_lookup().
--
-- Validation chain:
--   1. Global (system) lookup values: always checked, session-free.
--   2. Tenant extension values: checked only when a session tenant is set
--      AND the domain is marked is_extensible = true.
--   3. If no match in either: raise exception.
--
-- Uses current_tenant_id_soft() (returns NULL, never raises) so this trigger
-- is safe during pg_dump/restore, logical replication, VACUUM FULL, and
-- migration scripts — those paths will only validate against global values.
--
-- Usage: attach with TG_ARGV[0] = domain_code, TG_ARGV[1] = column name.
CREATE OR REPLACE FUNCTION control.trg_validate_lookup_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
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
$$;

COMMENT ON FUNCTION control.trg_validate_lookup_columns() IS
    'Trigger-based lookup validation. Replaces session-dependent CHECK constraints. '
    'Validates against global rows (session-free) first, then tenant extension rows '
    'when a session is established and the domain is extensible. '
    'Attach with TG_ARGV: domain_code, column_name.';


-- trg_enforce_extensibility — DB-layer guard that makes is_extensible meaningful.
-- Tenant rows can only be inserted into extensible domains.
-- Admin bypass for athyperadmin (seed/migration). Skips re-validation on non-structural UPDATE.
CREATE OR REPLACE FUNCTION control.trg_enforce_extensibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = control
AS $$
DECLARE
    v_extensible boolean;
BEGIN
    -- Global rows: always allowed
    IF NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Admin bypass: athyperadmin operates without tenant session context
    IF pg_has_role(current_user, 'athyperadmin', 'MEMBER') THEN
        RETURN NEW;
    END IF;

    -- Skip re-validation on UPDATE if structural columns unchanged
    IF TG_OP = 'UPDATE'
       AND NEW.domain_code = OLD.domain_code
       AND NEW.tenant_id   = OLD.tenant_id
    THEN
        RETURN NEW;
    END IF;

    SELECT is_extensible INTO v_extensible
    FROM control.lookup_domain
    WHERE code = NEW.domain_code;

    IF v_extensible IS NULL THEN
        RAISE EXCEPTION 'lookup_value references unknown domain_code: %', NEW.domain_code
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT v_extensible THEN
        RAISE EXCEPTION
            'Domain "%" does not permit tenant extensions (is_extensible = false).',
            NEW.domain_code
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.tenant_id <> shared.current_tenant_id() THEN
        RAISE EXCEPTION
            'tenant_id mismatch — cannot write lookup_value for tenant % from session %',
            NEW.tenant_id, shared.current_tenant_id()
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$;


-- Guard: mfa_config.contact_link_id must:
--   (1) exist for tenant
--   (2) be owned by a principal (owner_type = 'principal')
--   (3) belong to the same principal as mfa_config.principal_id
--   (4) have a channel_type compatible with method_type
CREATE OR REPLACE FUNCTION control.trg_guard_mfa_contact_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
DECLARE
    v_channel    text;
    v_owner_id   uuid;
    v_owner_type text;
    v_expected   text[];
BEGIN
    IF NEW.contact_link_id IS NULL THEN RETURN NEW; END IF;

    SELECT channel_type, owner_id, owner_type
      INTO v_channel, v_owner_id, v_owner_type
      FROM master.contact_link
     WHERE tenant_id = NEW.tenant_id AND id = NEW.contact_link_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'mfa_config: contact_link % not found for tenant %',
            NEW.contact_link_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Enforce: contact is owned by a principal entity
    IF v_owner_type <> 'principal' THEN
        RAISE EXCEPTION
            'mfa_config: contact_link % has owner_type "%" — must be "principal"',
            NEW.contact_link_id, v_owner_type
            USING ERRCODE = 'check_violation';
    END IF;

    -- Enforce: contact belongs to the same principal as mfa_config
    IF v_owner_id <> NEW.principal_id THEN
        RAISE EXCEPTION
            'mfa_config: contact_link % belongs to principal %, not %',
            NEW.contact_link_id, v_owner_id, NEW.principal_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Enforce: channel_type compatible with method_type
    v_expected := CASE NEW.method_type
        WHEN 'email' THEN ARRAY['email']
        WHEN 'sms'   THEN ARRAY['sms', 'phone', 'whatsapp']
        ELSE NULL
    END;

    IF v_expected IS NOT NULL AND v_channel <> ALL(v_expected) THEN
        RAISE EXCEPTION
            'mfa_config: method_type "%" requires channel in (%), got "%"',
            NEW.method_type, array_to_string(v_expected, ', '), v_channel
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_guard_mfa_contact_link() IS
    'Guards mfa_config.contact_link_id: '
    '(1) contact_link exists for tenant, '
    '(2) owner_type = ''principal'', '
    '(3) owner_id = mfa_config.principal_id, '
    '(4) channel_type compatible with method_type.';


-- ── LIFECYCLE ENGINE functions ─────────────────────────────────────────
-- =============================================================================
-- 08_functions/014_lifecycle.sql
-- Lifecycle Engine — runtime functions
-- Depends on: 04_tables/014_lifecycle.sql, 06_constraints/014_lifecycle.sql,
--             04_tables/006_log.sql (log.entity_lifecycle_log),
--             04_tables/007_event.sql (event.outbox)
-- =============================================================================
--
-- Functions:
--   §1  snapshot.compile_lifecycle()          — compile definition → lifecycle_version
--   §2  snapshot.compile_lifecycle_route()    — compile full traversal graph
--   §3  snapshot.compile_status_route()       — compile simplified O(1) route
--   §4  control.advance_workflow_state()      — main 10-step transition function
--   §5  control.validate_status_transition()  — trigger: validate status changes
--   §6  control.guard_terminal_immutability() — trigger: block edits in terminal states
--   §7  control.guard_deletable_states()      — trigger: block DELETE in non-deletable states


-- =============================================================================
-- §1  snapshot.compile_lifecycle()
-- =============================================================================
-- Compiles a lifecycle definition into an immutable snapshot (lifecycle_version).
-- Reads all child tables, builds denormalized JSON, computes SHA-256 hash.
-- Returns the new lifecycle_version.id (or existing if definition unchanged).
--
-- Usage:
--   SELECT snapshot.compile_lifecycle(
--       p_lifecycle_id := '<uuid>',
--       p_compiled_by  := '<actor_uuid>'
--   );

CREATE OR REPLACE FUNCTION snapshot.compile_lifecycle(
    p_lifecycle_id  uuid,
    p_compiled_by   uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = snapshot, control
AS $$
DECLARE
    v_lc            control.lifecycle%ROWTYPE;
    v_definition    jsonb;
    v_hash          text;
    v_version       integer;
    v_version_id    uuid;
    v_existing_id   uuid;
BEGIN
    -- 1. Load lifecycle
    SELECT * INTO v_lc FROM control.lifecycle WHERE id = p_lifecycle_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'snapshot.compile_lifecycle: lifecycle % not found', p_lifecycle_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 2. Build denormalized definition JSON
    SELECT jsonb_build_object(
        'lifecycle', jsonb_build_object(
            'id', v_lc.id, 'code', v_lc.code, 'name', v_lc.name,
            'tenant_id', v_lc.tenant_id, 'config', v_lc.config
        ),
        'states', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', s.id, 'code', s.code, 'name', s.name,
                'is_initial', s.is_initial, 'is_terminal', s.is_terminal,
                'sort_order', s.sort_order, 'config', s.config
            ) ORDER BY s.sort_order)
            FROM control.lifecycle_state s
            WHERE s.lifecycle_id = p_lifecycle_id
        ), '[]'::jsonb),
        'transitions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id,
                'from_state_id', t.from_state_id,
                'to_state_id', t.to_state_id,
                'operation_code', t.operation_code,
                'is_active', t.is_active,
                'config', t.config
            ))
            FROM control.lifecycle_transition t
            WHERE t.lifecycle_id = p_lifecycle_id
        ), '[]'::jsonb),
        'gates', COALESCE((
            SELECT jsonb_object_agg(g.transition_id::text, jsonb_build_object(
                'id', g.id,
                'required_operations', g.required_operations,
                'workflow_definition_id', g.workflow_definition_id,
                'conditions', g.conditions,
                'threshold_rules', g.threshold_rules
            ))
            FROM control.lifecycle_transition_gate g
            JOIN control.lifecycle_transition t ON t.id = g.transition_id
            WHERE t.lifecycle_id = p_lifecycle_id
        ), '{}'::jsonb),
        'hooks', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', h.id,
                'transition_id', h.transition_id,
                'timing', h.timing,
                'sort_order', h.sort_order,
                'action', h.action,
                'config', h.config,
                'origin', h.origin,
                'layer_rank', h.layer_rank,
                'contract_role', h.contract_role,
                'safety_level', h.safety_level,
                'is_active', h.is_active
            ) ORDER BY h.layer_rank, h.sort_order)
            FROM control.lifecycle_transition_hook h
            JOIN control.lifecycle_transition t ON t.id = h.transition_id
            WHERE t.lifecycle_id = p_lifecycle_id
        ), '[]'::jsonb),
        'timers', COALESCE((
            SELECT jsonb_object_agg(tp.code, jsonb_build_object(
                'id', tp.id, 'name', tp.name, 'rules', tp.rules
            ))
            FROM control.lifecycle_timer_policy tp
            WHERE tp.tenant_id IS NOT DISTINCT FROM v_lc.tenant_id
        ), '{}'::jsonb)
    ) INTO v_definition;

    -- 3. Compute SHA-256 hash
    v_hash := encode(sha256(convert_to(v_definition::text, 'UTF8')), 'hex');

    -- 4. Check if definition unchanged (idempotent recompile)
    SELECT id INTO v_existing_id
      FROM snapshot.lifecycle_version
     WHERE lifecycle_id = p_lifecycle_id AND compiled_hash = v_hash
     ORDER BY version DESC LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- Update parent lifecycle hash (may have been NULLed by child-change trigger)
        UPDATE control.lifecycle
           SET definition_hash = v_hash, updated_at = now()
         WHERE id = p_lifecycle_id AND definition_hash IS DISTINCT FROM v_hash;
        RETURN v_existing_id;
    END IF;

    -- 5. Compute next version number
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
      FROM snapshot.lifecycle_version
     WHERE lifecycle_id = p_lifecycle_id;

    -- 6. Insert new immutable version
    v_version_id := shared.uuidv7();
    INSERT INTO snapshot.lifecycle_version (
        id, tenant_id, lifecycle_id, version, definition,
        compiled_hash, created_at, created_by
    ) VALUES (
        v_version_id, v_lc.tenant_id, p_lifecycle_id, v_version,
        v_definition, v_hash, now(), p_compiled_by
    );

    -- 7. Update parent lifecycle
    UPDATE control.lifecycle
       SET definition_hash = v_hash,
           version_no      = v_version,
           updated_at      = now()
     WHERE id = p_lifecycle_id;

    RETURN v_version_id;
END;
$$;

COMMENT ON FUNCTION snapshot.compile_lifecycle(uuid, uuid) IS
    'Compiles a lifecycle definition into an immutable snapshot.lifecycle_version row. '
    'Builds denormalized JSON from all child tables, computes SHA-256 hash. '
    'Idempotent: returns existing version_id if definition unchanged. '
    'Updates control.lifecycle.definition_hash and version_no on success.';


-- =============================================================================
-- §2  snapshot.compile_lifecycle_route()
-- =============================================================================
-- Compiles the full traversal graph for a lifecycle.
-- Used by UI for "what can happen next" visualisation.
-- UPSERT into snapshot.lifecycle_route.

CREATE OR REPLACE FUNCTION snapshot.compile_lifecycle_route(
    p_lifecycle_id  uuid,
    p_compiled_by   uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = snapshot, control
AS $$
DECLARE
    v_lc            control.lifecycle%ROWTYPE;
    v_route         jsonb;
    v_hash          text;
    v_route_id      uuid;
    v_initial_code  text;
BEGIN
    SELECT * INTO v_lc FROM control.lifecycle WHERE id = p_lifecycle_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'snapshot.compile_lifecycle_route: lifecycle % not found', p_lifecycle_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Find initial state
    SELECT code INTO v_initial_code
      FROM control.lifecycle_state
     WHERE lifecycle_id = p_lifecycle_id AND is_initial = true;

    -- Build reachable_from map: {state_code: [{to_code, operation_code, transition_id}]}
    -- and terminal_states, all_states
    SELECT jsonb_build_object(
        'initial_state', v_initial_code,
        'all_states', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'code', s.code, 'name', s.name,
                'is_initial', s.is_initial, 'is_terminal', s.is_terminal,
                'sort_order', s.sort_order
            ) ORDER BY s.sort_order)
            FROM control.lifecycle_state s
            WHERE s.lifecycle_id = p_lifecycle_id
        ), '[]'::jsonb),
        'terminal_states', COALESCE((
            SELECT jsonb_agg(s.code)
            FROM control.lifecycle_state s
            WHERE s.lifecycle_id = p_lifecycle_id AND s.is_terminal = true
        ), '[]'::jsonb),
        'reachable_from', COALESCE((
            SELECT jsonb_object_agg(fs.code, transitions_out)
            FROM (
                SELECT t.from_state_id,
                       jsonb_agg(jsonb_build_object(
                           'to_state', ts.code,
                           'operation_code', t.operation_code,
                           'transition_id', t.id,
                           'is_active', t.is_active
                       )) AS transitions_out
                FROM control.lifecycle_transition t
                JOIN control.lifecycle_state ts ON ts.id = t.to_state_id
                WHERE t.lifecycle_id = p_lifecycle_id
                GROUP BY t.from_state_id
            ) sub
            JOIN control.lifecycle_state fs ON fs.id = sub.from_state_id
        ), '{}'::jsonb)
    ) INTO v_route;

    v_hash := encode(sha256(convert_to(v_route::text, 'UTF8')), 'hex');

    -- UPSERT
    v_route_id := shared.uuidv7();
    INSERT INTO snapshot.lifecycle_route (
        id, tenant_id, lifecycle_id, compiled_json, compiled_hash,
        created_at, created_by
    ) VALUES (
        v_route_id, v_lc.tenant_id, p_lifecycle_id, v_route, v_hash,
        now(), p_compiled_by
    )
    ON CONFLICT ON CONSTRAINT lr_lifecycle_uq DO UPDATE SET
        compiled_json = EXCLUDED.compiled_json,
        compiled_hash = EXCLUDED.compiled_hash,
        created_at    = EXCLUDED.created_at,
        created_by    = EXCLUDED.created_by;

    -- Return the ID (new or existing)
    SELECT id INTO v_route_id
      FROM snapshot.lifecycle_route
     WHERE lifecycle_id = p_lifecycle_id
       AND tenant_id IS NOT DISTINCT FROM v_lc.tenant_id;

    RETURN v_route_id;
END;
$$;

COMMENT ON FUNCTION snapshot.compile_lifecycle_route(uuid, uuid) IS
    'Compiles the full traversal graph for a lifecycle into snapshot.lifecycle_route. '
    'Builds reachable_from map, terminal_states, all_states, initial_state. '
    'UPSERT: replaces existing route on recompile.';


-- =============================================================================
-- §3  snapshot.compile_status_route()
-- =============================================================================
-- Compiles the simplified O(1) status route for Pattern A/B entities.
-- One row per (tenant, entity_name) in snapshot.status_route.
-- Used by validate_status_transition(), guard_terminal_immutability(),
-- guard_deletable_states() trigger functions.

CREATE OR REPLACE FUNCTION snapshot.compile_status_route(
    p_tenant_id     uuid,
    p_entity_name   text,
    p_lifecycle_id  uuid,
    p_compiled_by   uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = snapshot, control
AS $$
DECLARE
    v_route         jsonb;
    v_hash          text;
    v_route_id      uuid;
    v_initial_code  text;
BEGIN
    -- Find initial state
    SELECT code INTO v_initial_code
      FROM control.lifecycle_state
     WHERE lifecycle_id = p_lifecycle_id AND is_initial = true;

    -- Build simplified route
    SELECT jsonb_build_object(
        'lifecycle_id', p_lifecycle_id,
        'initial_state', v_initial_code,
        'all_states', COALESCE((
            SELECT jsonb_agg(s.code ORDER BY s.sort_order)
            FROM control.lifecycle_state s
            WHERE s.lifecycle_id = p_lifecycle_id
        ), '[]'::jsonb),
        'terminal_states', COALESCE((
            SELECT jsonb_agg(s.code)
            FROM control.lifecycle_state s
            WHERE s.lifecycle_id = p_lifecycle_id AND s.is_terminal = true
        ), '[]'::jsonb),
        'deletable_states', COALESCE((
            SELECT jsonb_agg(s.code)
            FROM control.lifecycle_state s
            WHERE s.lifecycle_id = p_lifecycle_id
              AND s.is_initial = true  -- by convention, only initial/draft states are deletable
        ), '[]'::jsonb),
        'allowed_transitions', COALESCE((
            SELECT jsonb_object_agg(fs.code, to_states)
            FROM (
                SELECT t.from_state_id,
                       jsonb_agg(DISTINCT ts.code) AS to_states
                FROM control.lifecycle_transition t
                JOIN control.lifecycle_state ts ON ts.id = t.to_state_id
                WHERE t.lifecycle_id = p_lifecycle_id AND t.is_active = true
                GROUP BY t.from_state_id
            ) sub
            JOIN control.lifecycle_state fs ON fs.id = sub.from_state_id
        ), '{}'::jsonb),
        'states', COALESCE((
            SELECT jsonb_object_agg(s.code, jsonb_build_object(
                'name',        s.name,
                'description', s.description,
                'is_initial',  s.is_initial,
                'is_terminal', s.is_terminal,
                'sort_order',  s.sort_order,
                'config',      s.config
            ))
            FROM control.lifecycle_state s
            WHERE s.lifecycle_id = p_lifecycle_id
        ), '{}'::jsonb)
    ) INTO v_route;

    v_hash := encode(sha256(convert_to(v_route::text, 'UTF8')), 'hex');

    -- UPSERT
    v_route_id := shared.uuidv7();
    INSERT INTO snapshot.status_route (
        id, tenant_id, entity_name, compiled_json, compiled_hash,
        created_at, created_by
    ) VALUES (
        v_route_id, p_tenant_id, p_entity_name, v_route, v_hash,
        now(), p_compiled_by
    )
    ON CONFLICT ON CONSTRAINT sr_entity_uq DO UPDATE SET
        compiled_json = EXCLUDED.compiled_json,
        compiled_hash = EXCLUDED.compiled_hash,
        updated_at    = now(),
        updated_by    = p_compiled_by;

    SELECT id INTO v_route_id
      FROM snapshot.status_route
     WHERE tenant_id = p_tenant_id AND entity_name = p_entity_name;

    RETURN v_route_id;
END;
$$;

COMMENT ON FUNCTION snapshot.compile_status_route(uuid, text, uuid, uuid) IS
    'Compiles the simplified O(1) status transition route for Pattern A/B entities. '
    'One row per (tenant, entity_name) in snapshot.status_route. '
    'Read by validate_status_transition(), guard_terminal_immutability(), '
    'guard_deletable_states() trigger functions.';


-- =============================================================================
-- §4  control.advance_workflow_state()
-- =============================================================================
-- Main transition function — the 10-step flow described in the design document.
-- Serializes concurrent transitions via SELECT FOR UPDATE on lifecycle_instance.
-- Validates transition, updates state, logs, emits outbox event, manages timers.
--
-- Usage:
--   SELECT control.advance_workflow_state(
--       p_tenant_id      := '<uuid>',
--       p_entity_name    := 'purchase_invoice',
--       p_entity_id      := '<entity-id-text>',
--       p_operation_code := 'submit',
--       p_actor_id       := '<actor-uuid>',
--       p_remarks        := 'Submitted for approval',
--       p_payload        := '{"amount": 50000}'::jsonb
--   );

CREATE OR REPLACE FUNCTION control.advance_workflow_state(
    p_tenant_id      uuid,
    p_entity_name    text,
    p_entity_id      text,
    p_operation_code text,
    p_actor_id       uuid        DEFAULT NULL,
    p_remarks        text        DEFAULT NULL,
    p_payload        jsonb       DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = control, master, snapshot, log, event
AS $$
DECLARE
    v_instance      master.lifecycle_instance%ROWTYPE;
    v_from_state    control.lifecycle_state%ROWTYPE;
    v_to_state      control.lifecycle_state%ROWTYPE;
    v_transition    control.lifecycle_transition%ROWTYPE;
    v_gate          control.lifecycle_transition_gate%ROWTYPE;
    v_actor         uuid;
    v_correlation   uuid;
BEGIN
    v_actor := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000'::uuid);
    v_correlation := shared.uuidv7();

    -- ── Step 1: Load and lock instance ──────────────────────────────────────
    SELECT * INTO v_instance
      FROM master.lifecycle_instance
     WHERE tenant_id = p_tenant_id
       AND entity_name = p_entity_name
       AND entity_id = p_entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('No lifecycle instance for %s/%s', p_entity_name, p_entity_id)
        );
    END IF;

    -- ── Step 2: Load current state ──────────────────────────────────────────
    SELECT * INTO v_from_state
      FROM control.lifecycle_state
     WHERE id = v_instance.state_id;

    IF v_from_state.is_terminal THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Entity is in terminal state ''%s'' — no transitions allowed', v_from_state.code)
        );
    END IF;

    -- ── Step 3: Find transition by operation_code ───────────────────────────
    SELECT * INTO v_transition
      FROM control.lifecycle_transition
     WHERE lifecycle_id = v_instance.lifecycle_id
       AND from_state_id = v_instance.state_id
       AND operation_code = p_operation_code
       AND is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('No active transition via ''%s'' from state ''%s''',
                           p_operation_code, v_from_state.code)
        );
    END IF;

    -- Load target state
    SELECT * INTO v_to_state
      FROM control.lifecycle_state
     WHERE id = v_transition.to_state_id;

    -- ── Step 4: Evaluate gate (basic DB-level checks) ───────────────────────
    -- Rich gate evaluation (JSONLogic, CEL, approval checks) runs in the
    -- TypeScript runtime. DB-level gates provide defense-in-depth.
    SELECT * INTO v_gate
      FROM control.lifecycle_transition_gate
     WHERE transition_id = v_transition.id;

    IF FOUND AND v_gate.required_operations IS NOT NULL THEN
        -- Check that all required operations have been logged
        DECLARE
            v_op       jsonb;
            v_op_code  text;
            v_op_found boolean;
        BEGIN
            FOR v_op IN SELECT jsonb_array_elements(v_gate.required_operations)
            LOOP
                v_op_code := v_op->>'code';
                SELECT EXISTS(
                    SELECT 1 FROM log.entity_lifecycle_log
                     WHERE tenant_id = p_tenant_id
                       AND entity_type = p_entity_name
                       AND entity_id = p_entity_id::uuid
                       AND operation_code = v_op_code
                ) INTO v_op_found;

                IF NOT v_op_found THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', format('Gate requires prior operation ''%s'' which has not been executed',
                                       v_op_code)
                    );
                END IF;
            END LOOP;
        END;
    END IF;

    -- ── Step 5: BEFORE hooks ────────────────────────────────────────────────
    -- BEFORE hooks that can veto are evaluated in the TypeScript runtime.
    -- The DB function does not fire hooks directly — it emits to the outbox
    -- for the runtime hook executor. For pure-DB transitions (no runtime),
    -- BEFORE hooks are skipped (defense-in-depth only).

    -- ── Step 6: UPDATE lifecycle_instance (atomic state change) ─────────────
    UPDATE master.lifecycle_instance
       SET state_id   = v_to_state.id,
           updated_at = now(),
           updated_by = v_actor
     WHERE id = v_instance.id;

    -- ── Step 7: INSERT tamper-evident log ───────────────────────────────────
    INSERT INTO log.entity_lifecycle_log (
        tenant_id, entity_type, entity_id, lifecycle_id,
        operation_code, from_status, to_status,
        from_state_id, to_state_id,
        actor_id, remarks, payload, correlation_id,
        created_at, created_by
    ) VALUES (
        p_tenant_id, p_entity_name, p_entity_id::uuid,
        v_instance.lifecycle_id,
        p_operation_code, v_from_state.code, v_to_state.code,
        v_from_state.id, v_to_state.id,
        v_actor, p_remarks, p_payload, v_correlation,
        now(), v_actor
    );

    -- ── Step 8: Emit outbox event for AFTER hooks ──────────────────────────
    INSERT INTO event.outbox (
        tenant_id, topic, event_type, event_key,
        entity_type, entity_id, actor_id,
        correlation_id, payload, created_by
    ) VALUES (
        p_tenant_id, 'lifecycle', 'state_transitioned',
        v_correlation::text,
        p_entity_name, p_entity_id::uuid, v_actor,
        v_correlation,
        jsonb_build_object(
            'instance_id', v_instance.id,
            'lifecycle_id', v_instance.lifecycle_id,
            'transition_id', v_transition.id,
            'from_state_code', v_from_state.code,
            'from_state_id', v_from_state.id,
            'to_state_code', v_to_state.code,
            'to_state_id', v_to_state.id,
            'operation_code', p_operation_code,
            'actor_id', v_actor,
            'remarks', p_remarks,
            'entity_payload', p_payload
        ),
        v_actor
    );

    -- ── Step 9: Cancel timers for departed state ───────────────────────────
    UPDATE event.lifecycle_timer_schedule
       SET status     = 'cancelled',
           updated_at = now(),
           updated_by = v_actor
     WHERE tenant_id = p_tenant_id
       AND entity_name = p_entity_name
       AND entity_id = p_entity_id
       AND state_id = v_from_state.id
       AND status = 'scheduled';

    -- ── Step 10: Schedule timers for entered state (if policy set) ──────────
    -- Timer scheduling is handled by the TypeScript runtime via the outbox
    -- event emitted in Step 8. The runtime reads the state config for
    -- timer_policy_code and creates timer_schedule rows as needed.

    -- ── Return success ─────────────────────────────────────────────────────
    RETURN jsonb_build_object(
        'success', true,
        'instance_id', v_instance.id,
        'lifecycle_id', v_instance.lifecycle_id,
        'from_state', jsonb_build_object('id', v_from_state.id, 'code', v_from_state.code),
        'to_state', jsonb_build_object('id', v_to_state.id, 'code', v_to_state.code),
        'transition_id', v_transition.id,
        'operation_code', p_operation_code,
        'correlation_id', v_correlation
    );
END;
$$;

COMMENT ON FUNCTION control.advance_workflow_state(uuid, text, text, text, uuid, text, jsonb) IS
    'Main lifecycle transition function. Implements the 10-step transition flow: '
    '1. Lock instance (FOR UPDATE) '
    '2. Load current state '
    '3. Find transition by operation_code '
    '4. Evaluate gate (required_operations check) '
    '5. BEFORE hooks (delegated to runtime via outbox) '
    '6. UPDATE lifecycle_instance state_id '
    '7. INSERT log.entity_lifecycle_log '
    '8. Emit event.outbox for AFTER hooks '
    '9. Cancel timers for departed state '
    '10. Schedule timers for entered state (delegated to runtime) '
    'Returns jsonb with success/error and transition details.';


-- =============================================================================
-- §5  control.validate_status_transition()
-- =============================================================================
-- Trigger function for entity tables. Reads snapshot.status_route.compiled_json
-- to validate that a status change is allowed.
--
-- Attach to any entity table via:
--   CREATE TRIGGER trg_validate_status
--       BEFORE UPDATE OF status ON <schema>.<table>
--       FOR EACH ROW EXECUTE FUNCTION control.validate_status_transition('<entity_name>');
-- Optional second arg for custom status column name (default: 'status').

CREATE OR REPLACE FUNCTION control.validate_status_transition()
RETURNS trigger LANGUAGE plpgsql STABLE
SET search_path = control, snapshot AS $$
DECLARE
    v_entity_name  text := TG_ARGV[0];
    v_status_col   text := COALESCE(TG_ARGV[1], 'status');
    v_old_status   text;
    v_new_status   text;
    v_route        jsonb;
BEGIN
    -- Read old and new status values dynamically
    EXECUTE format('SELECT ($1).%I', v_status_col) INTO v_old_status USING OLD;
    EXECUTE format('SELECT ($1).%I', v_status_col) INTO v_new_status USING NEW;

    -- Fast path: no status change
    IF v_old_status IS NOT DISTINCT FROM v_new_status THEN
        RETURN NEW;
    END IF;

    -- Load compiled route
    SELECT compiled_json INTO v_route
      FROM snapshot.status_route
     WHERE entity_name = v_entity_name
       AND tenant_id = NEW.tenant_id;

    -- No lifecycle bound: allow (entity not lifecycle-managed at DB level)
    IF v_route IS NULL THEN
        RETURN NEW;
    END IF;

    -- Validate: new status is a known state
    IF NOT (v_route->'all_states' ? v_new_status) THEN
        RAISE EXCEPTION '%.%: unknown status ''%'' for entity ''%''. Valid states: %',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, v_new_status, v_entity_name,
            v_route->>'all_states'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Validate: transition is allowed
    IF NOT (v_route->'allowed_transitions'->v_old_status ? v_new_status) THEN
        RAISE EXCEPTION '%.%: invalid transition ''%'' -> ''%'' for entity ''%''. Allowed from ''%'': %',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, v_old_status, v_new_status, v_entity_name,
            v_old_status,
            COALESCE(v_route->'allowed_transitions'->>v_old_status, '(none)')
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.validate_status_transition() IS
    'Trigger function: validates entity status transitions against '
    'snapshot.status_route.compiled_json. O(1) lookup. '
    'Attach via: CREATE TRIGGER ... BEFORE UPDATE OF status ON <table> '
    'FOR EACH ROW EXECUTE FUNCTION control.validate_status_transition(''entity_name'');';


-- =============================================================================
-- §6  control.guard_terminal_immutability()
-- =============================================================================
-- Trigger function: blocks UPDATE on entities in terminal states.
-- Only status column changes are allowed (to handle edge cases).
--
-- Attach to any entity table via:
--   CREATE TRIGGER trg_terminal_guard
--       BEFORE UPDATE ON <schema>.<table>
--       FOR EACH ROW EXECUTE FUNCTION control.guard_terminal_immutability('<entity_name>');

CREATE OR REPLACE FUNCTION control.guard_terminal_immutability()
RETURNS trigger LANGUAGE plpgsql STABLE
SET search_path = control, snapshot AS $$
DECLARE
    v_entity_name  text := TG_ARGV[0];
    v_status_col   text := COALESCE(TG_ARGV[1], 'status');
    v_status       text;
    v_route        jsonb;
BEGIN
    EXECUTE format('SELECT ($1).%I', v_status_col) INTO v_status USING OLD;

    SELECT compiled_json INTO v_route
      FROM snapshot.status_route
     WHERE entity_name = v_entity_name
       AND tenant_id = OLD.tenant_id;

    -- No lifecycle bound: allow
    IF v_route IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if current status is terminal
    IF v_route->'terminal_states' ? v_status THEN
        RAISE EXCEPTION '%.%: record is in terminal state ''%'' — updates are blocked. '
            'Entity: ''%''.',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, v_status, v_entity_name
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.guard_terminal_immutability() IS
    'Trigger function: blocks UPDATE on entities in terminal lifecycle states. '
    'Reads snapshot.status_route.compiled_json.terminal_states. '
    'Attach via: CREATE TRIGGER ... BEFORE UPDATE ON <table> '
    'FOR EACH ROW EXECUTE FUNCTION control.guard_terminal_immutability(''entity_name'');';


-- =============================================================================
-- §7  control.guard_deletable_states()
-- =============================================================================
-- Trigger function: blocks DELETE on entities not in deletable states.
-- By convention, only initial/draft states are deletable.
--
-- Attach to any entity table via:
--   CREATE TRIGGER trg_deletable_guard
--       BEFORE DELETE ON <schema>.<table>
--       FOR EACH ROW EXECUTE FUNCTION control.guard_deletable_states('<entity_name>');

CREATE OR REPLACE FUNCTION control.guard_deletable_states()
RETURNS trigger LANGUAGE plpgsql STABLE
SET search_path = control, snapshot AS $$
DECLARE
    v_entity_name  text := TG_ARGV[0];
    v_status_col   text := COALESCE(TG_ARGV[1], 'status');
    v_status       text;
    v_route        jsonb;
BEGIN
    EXECUTE format('SELECT ($1).%I', v_status_col) INTO v_status USING OLD;

    SELECT compiled_json INTO v_route
      FROM snapshot.status_route
     WHERE entity_name = v_entity_name
       AND tenant_id = OLD.tenant_id;

    -- No lifecycle bound: allow delete
    IF v_route IS NULL THEN
        RETURN OLD;
    END IF;

    -- Check if current status is deletable
    IF NOT (v_route->'deletable_states' ? v_status) THEN
        RAISE EXCEPTION '%.%: DELETE only allowed in states %. Current state: ''%''. '
            'Entity: ''%''.',
            TG_TABLE_SCHEMA, TG_TABLE_NAME,
            v_route->>'deletable_states', v_status, v_entity_name
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION control.guard_deletable_states() IS
    'Trigger function: blocks DELETE on entities not in deletable lifecycle states. '
    'Reads snapshot.status_route.compiled_json.deletable_states. '
    'By convention, only initial/draft states are deletable. '
    'Attach via: CREATE TRIGGER ... BEFORE DELETE ON <table> '
    'FOR EACH ROW EXECUTE FUNCTION control.guard_deletable_states(''entity_name'');';


-- ── WORKFLOW ENGINE functions ──────────────────────────────────────────
-- =============================================================================
-- 08_functions/015_workflow.sql
-- Workflow Engine — runtime functions
-- Depends on: 04_tables/015_workflow.sql, 06_constraints/015_workflow.sql
-- =============================================================================
--
-- Functions:
--   §1  document.evaluate_stage_quorum()    — quorum evaluation for a workflow stage
--   §2  control.compile_workflow_template() — compile template into snapshot JSON
--   §3  control.resolve_workflow_definition() — match entity to workflow definition


-- =============================================================================
-- §1  document.evaluate_stage_quorum()
-- =============================================================================
-- Evaluates quorum for a workflow_stage.
-- Returns is_met (quorum achieved) and is_rejected (quorum mathematically impossible).
-- Supports count, percent, and unanimous strategies.
-- Excludes watcher task_types and skipped work_items from evaluation.
-- is_rejected enables early termination without waiting for all items.
--
-- Usage:
--   SELECT * FROM document.evaluate_stage_quorum('<stage_uuid>');

CREATE OR REPLACE FUNCTION document.evaluate_stage_quorum(
    p_stage_id uuid
) RETURNS TABLE (
    is_met          boolean,
    is_rejected     boolean,
    approved_count  integer,
    rejected_count  integer,
    total_count     integer,
    pending_count   integer,
    quorum_detail   jsonb
)
LANGUAGE plpgsql SET search_path = document, event AS $$
DECLARE
    v_stage     document.workflow_stage;
    v_approved  integer;
    v_rejected  integer;
    v_total     integer;
    v_required  integer;
    v_strategy  text;
BEGIN
    SELECT * INTO v_stage FROM document.workflow_stage WHERE id = p_stage_id;
    IF v_stage IS NULL THEN
        RAISE EXCEPTION 'workflow_stage % not found', p_stage_id;
    END IF;

    -- Count work_item outcomes for this stage (exclude watchers and skipped)
    SELECT
        count(*) FILTER (WHERE wi.decision IN ('approve', 'acknowledge') AND wi.status = 'completed'),
        count(*) FILTER (WHERE wi.decision IN ('reject') AND wi.status = 'completed'),
        count(*) FILTER (WHERE wi.status NOT IN ('skipped') AND wi.task_type <> 'watcher')
    INTO v_approved, v_rejected, v_total
    FROM event.work_item wi
    WHERE wi.workflow_stage_id = p_stage_id
      AND wi.tenant_id         = v_stage.tenant_id;

    -- Parse quorum rule (NULL = unanimous)
    IF v_stage.quorum IS NULL
       OR (v_stage.quorum->>'strategy') = 'unanimous'
    THEN
        v_required := v_total;
        v_strategy := 'unanimous';
    ELSIF (v_stage.quorum->>'strategy') = 'percent' THEN
        v_required := ceil(v_total * (v_stage.quorum->>'required')::numeric / 100.0);
        v_strategy := 'percent';
    ELSE
        v_required := (v_stage.quorum->>'required')::integer;
        v_strategy := 'count';
    END IF;

    approved_count := v_approved;
    rejected_count := v_rejected;
    total_count    := v_total;
    pending_count  := v_total - v_approved - v_rejected;
    -- Quorum met when approved >= required
    is_met         := v_approved >= v_required;
    -- Early rejection: remaining possible approvals < required
    is_rejected    := (v_total - v_rejected) < v_required;
    quorum_detail  := jsonb_build_object(
        'strategy',   v_strategy,
        'required',   v_required,
        'approved',   v_approved,
        'rejected',   v_rejected,
        'pending',    v_total - v_approved - v_rejected,
        'is_met',     v_approved >= v_required,
        'is_rejected', (v_total - v_rejected) < v_required
    );
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION document.evaluate_stage_quorum(uuid) IS
    'Evaluates quorum for a workflow_stage. '
    'Returns is_met (quorum achieved) and is_rejected (quorum mathematically impossible). '
    'Supports count, percent, and unanimous strategies. '
    'Excludes watcher task_types and skipped work_items from evaluation. '
    'is_rejected enables early termination without waiting for all items.';


-- =============================================================================
-- §2  control.compile_workflow_template()
-- =============================================================================
-- Compiles a workflow template into a denormalized JSON snapshot.
-- Called when creating a workflow_request — the compiled_json is captured
-- as template_snapshot (version-pinned).
--
-- Usage:
--   SELECT control.compile_workflow_template('<template_uuid>');
--   -- Returns jsonb with full denormalized template definition.

CREATE OR REPLACE FUNCTION control.compile_workflow_template(
    p_template_id  uuid,
    p_compiled_by  uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = control
AS $$
DECLARE
    v_tpl           control.workflow_template%ROWTYPE;
    v_compiled      jsonb;
    v_hash          text;
BEGIN
    -- 1. Load template
    SELECT * INTO v_tpl FROM control.workflow_template WHERE id = p_template_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'control.compile_workflow_template: template % not found', p_template_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 2. Build denormalized JSON
    SELECT jsonb_build_object(
        'template', jsonb_build_object(
            'id', v_tpl.id, 'code', v_tpl.code, 'name', v_tpl.name,
            'tenant_id', v_tpl.tenant_id, 'behaviors', v_tpl.behaviors,
            'sla_policy_id', v_tpl.sla_policy_id, 'version_no', v_tpl.version_no
        ),
        'stages', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', s.id,
                'stage_no', s.stage_no,
                'name', s.name,
                'mode', s.mode,
                'quorum', s.quorum,
                'sla_policy_id', s.sla_policy_id,
                'rules', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', r.id,
                        'priority', r.priority,
                        'conditions', r.conditions,
                        'assign_to', r.assign_to
                    ) ORDER BY r.priority)
                    FROM control.workflow_template_rule r
                    WHERE r.workflow_template_id = p_template_id
                      AND (r.stage_no = s.stage_no OR r.stage_no IS NULL)
                ), '[]'::jsonb)
            ) ORDER BY s.stage_no)
            FROM control.workflow_template_stage s
            WHERE s.workflow_template_id = p_template_id
        ), '[]'::jsonb)
    ) INTO v_compiled;

    -- 3. Compute hash + update template
    v_hash := encode(sha256(convert_to(v_compiled::text, 'UTF8')), 'hex');

    UPDATE control.workflow_template
       SET compiled_json = v_compiled,
           compiled_hash = v_hash,
           version_no    = version_no + 1,
           updated_at    = now()
     WHERE id = p_template_id
       AND compiled_hash IS DISTINCT FROM v_hash;

    RETURN v_compiled;
END;
$$;

COMMENT ON FUNCTION control.compile_workflow_template(uuid, uuid) IS
    'Compiles a workflow template into denormalized JSON. '
    'Includes all stages with their rules, ordered by stage_no and priority. '
    'Updates workflow_template.compiled_json and compiled_hash. '
    'Called before workflow_request creation to version-pin the template.';


-- =============================================================================
-- §3  control.resolve_workflow_definition()
-- =============================================================================
-- Given an entity_type and tenant, finds the active workflow_definition
-- and evaluates its rules against the entity payload.
-- Returns the matched template_code and workflow_type, or NULL if no workflow required.
--
-- Usage:
--   SELECT * FROM control.resolve_workflow_definition(
--       p_tenant_id   := '<uuid>',
--       p_entity_type := 'purchase_invoice',
--       p_payload     := '{"amount": 50000}'::jsonb
--   );

CREATE OR REPLACE FUNCTION control.resolve_workflow_definition(
    p_tenant_id    uuid,
    p_entity_type  text,
    p_payload      jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
    definition_id   uuid,
    template_code   text,
    workflow_type   text,
    matched_rule    jsonb
)
LANGUAGE plpgsql STABLE
SET search_path = control
AS $$
DECLARE
    v_def       control.workflow_definition%ROWTYPE;
    v_rule      jsonb;
    v_condition jsonb;
BEGIN
    -- Find the active, currently-effective definition for this entity_type
    SELECT * INTO v_def
      FROM control.workflow_definition
     WHERE tenant_id = p_tenant_id
       AND entity_type = p_entity_type
       AND is_active = true
       AND effective_from <= now()
       AND (effective_to IS NULL OR effective_to > now())
     ORDER BY effective_from DESC
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN;  -- No workflow required
    END IF;

    -- Evaluate rules in array order — first match wins
    FOR v_rule IN SELECT jsonb_array_elements(v_def.rules)
    LOOP
        v_condition := v_rule->'condition';

        -- NULL condition = always matches
        IF v_condition IS NULL OR v_condition = 'null'::jsonb THEN
            definition_id := v_def.id;
            template_code := v_rule->>'template_code';
            workflow_type := v_rule->>'workflow_type';
            matched_rule  := v_rule;
            RETURN NEXT;
            RETURN;
        END IF;

        -- JSONLogic evaluation is done in the TypeScript runtime.
        -- At DB level, we return the first rule with a non-null condition
        -- and let the caller evaluate it. For rules with NULL conditions
        -- (unconditional), we match immediately above.
        -- This function is primarily used as a fallback / defense-in-depth.
    END LOOP;

    -- If all rules have conditions (no unconditional fallback),
    -- return the definition info with the first rule for the caller to evaluate
    IF v_def.rules != '[]'::jsonb THEN
        v_rule := v_def.rules->0;
        definition_id := v_def.id;
        template_code := v_rule->>'template_code';
        workflow_type := v_rule->>'workflow_type';
        matched_rule  := v_rule;
        RETURN NEXT;
    END IF;
END;
$$;

COMMENT ON FUNCTION control.resolve_workflow_definition(uuid, text, jsonb) IS
    'Resolves which workflow_definition and template apply to an entity. '
    'Finds the active, currently-effective definition for the entity_type. '
    'Evaluates rules in order — first match wins (NULL condition = always). '
    'Complex JSONLogic conditions are deferred to the TypeScript runtime. '
    'Returns NULL (no rows) if no workflow is required.';


-- ─── A. Auto-create entity_publish_state on entity INSERT ────────────────────

CREATE OR REPLACE FUNCTION control.trg_ensure_entity_publish_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
BEGIN
    INSERT INTO control.entity_publish_state (entity_id, tenant_id)
    VALUES (NEW.id, NEW.tenant_id)
    ON CONFLICT (entity_id) DO NOTHING;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_ensure_entity_publish_state() IS
    'AFTER INSERT on control.entity. Auto-creates the 1:1 entity_publish_state row. '
    'ON CONFLICT DO NOTHING prevents duplicates on re-runs.';


-- ─── A2. Bump latest_version_no in entity_publish_state on entity_version INSERT ─

CREATE OR REPLACE FUNCTION control.trg_ev_bump_latest_version_no()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
BEGIN
    UPDATE control.entity_publish_state
       SET latest_version_no = GREATEST(latest_version_no, NEW.version_no),
           updated_at         = now()
     WHERE entity_id = NEW.entity_id;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_ev_bump_latest_version_no() IS
    'AFTER INSERT on control.entity_version. Keeps entity_publish_state.latest_version_no '
    'at the highest version_no seen for each entity.';


-- ─── B. Field flag defaults from entity_class_profile ────────────────────────

CREATE OR REPLACE FUNCTION control.trg_field_flag_defaults()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
DECLARE
    v_class     text;
    v_rules     jsonb;
    v_rule      jsonb;
    v_matched   boolean;
BEGIN
    -- Canonical fields (no version) skip auto-flagging
    IF NEW.entity_version_id IS NULL THEN RETURN NEW; END IF;

    -- Resolve entity_class
    SELECT e.entity_class INTO v_class
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ev.id = NEW.entity_version_id;

    IF v_class IS NULL THEN RETURN NEW; END IF;

    -- Get rules: class-specific first, then wildcard '*'
    SELECT jsonb_agg(r ORDER BY
        CASE WHEN (r->>'class_key') = '*' THEN 1 ELSE 0 END,
        (r->>'priority')::int, r->>'match_mode')
      INTO v_rules
      FROM (
        SELECT jsonb_array_elements(ecp.field_flag_rules) || jsonb_build_object('class_key', ecp.class_key) AS r
          FROM control.entity_class_profile ecp
         WHERE ecp.class_key IN (v_class, '*')
      ) sub;

    IF v_rules IS NULL THEN RETURN NEW; END IF;

    FOR v_rule IN SELECT * FROM jsonb_array_elements(v_rules) LOOP
        v_matched := false;
        CASE v_rule->>'match_mode'
            WHEN 'name' THEN
                v_matched := NEW.name LIKE (v_rule->>'pattern');
            WHEN 'data_type' THEN
                v_matched := NEW.data_type = (v_rule->>'pattern');
            WHEN 'origin' THEN
                v_matched := NEW.origin = (v_rule->>'pattern');
            WHEN 'format' THEN
                v_matched := NEW.format = (v_rule->>'pattern');
            ELSE v_matched := false;
        END CASE;

        IF v_matched THEN
            IF (v_rule->>'is_searchable')    IS NOT NULL AND NEW.is_searchable = false THEN
                NEW.is_searchable    := (v_rule->>'is_searchable')::boolean; END IF;
            IF (v_rule->>'is_filterable')    IS NOT NULL AND NEW.is_filterable = false THEN
                NEW.is_filterable    := (v_rule->>'is_filterable')::boolean; END IF;
            IF (v_rule->>'is_sortable')      IS NOT NULL AND NEW.is_sortable = false THEN
                NEW.is_sortable      := (v_rule->>'is_sortable')::boolean; END IF;
            IF (v_rule->>'is_groupable')     IS NOT NULL AND NEW.is_groupable = false THEN
                NEW.is_groupable     := (v_rule->>'is_groupable')::boolean; END IF;
            IF (v_rule->>'is_aggregatable')  IS NOT NULL AND NEW.is_aggregatable = false THEN
                NEW.is_aggregatable  := (v_rule->>'is_aggregatable')::boolean; END IF;
            IF (v_rule->>'cardinality')      IS NOT NULL AND NEW.cardinality = 'one' THEN
                NEW.cardinality      := v_rule->>'cardinality'; END IF;
        END IF;
    END LOOP;

    -- Auto-infer cardinality for optional FK
    IF NEW.cardinality = 'one' AND NEW.data_type IN ('reference','uuid')
       AND NEW.reference_config IS NOT NULL AND NEW.is_required = false THEN
        NEW.cardinality := 'zero_or_one';
    END IF;

    -- Auto-set ui_type for array types
    IF NEW.ui_type IS NULL THEN
        CASE NEW.data_type
            WHEN 'text[]' THEN
                NEW.ui_type := CASE WHEN NEW.enum_config IS NOT NULL
                                    OR NEW.enum_domain_code IS NOT NULL
                               THEN 'multi_select' ELSE 'tag_list' END;
            WHEN 'uuid[]'  THEN NEW.ui_type := 'lookup_multi';
            WHEN 'int[]'   THEN NEW.ui_type := 'tag_list';
            WHEN 'jsonb[]' THEN NEW.ui_type := 'json_editor';
            ELSE NULL;
        END CASE;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_field_flag_defaults() IS
    'BEFORE INSERT on entity_field. Reads entity_class_profile.field_flag_rules '
    'and auto-sets behaviour flags on newly inserted version fields. '
    'Replaces entity_field_flag_standard table (eliminated).';

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================


-- ============================================================================
-- §F1  control.resolve_business_intent
-- Maps classification (commodity category / product / etc.) to a business intent
-- using prioritised rule evaluation. All 16 condition types implemented inline.
-- Returns JSONB:  intent_id, domain, rule_id, confidence, explanation, method,
--                direction, flow_code, rules_checked.
-- method: RULE_MATCH | CLASSIFICATION_DEFAULT | FAILED
-- ============================================================================
-- Drop old signature that used p_ou_id (parameter rename requires DROP + CREATE)
DROP FUNCTION IF EXISTS control.resolve_business_intent(uuid,text,uuid,text,text,uuid,text,numeric,text,boolean,boolean,uuid,uuid,text,text,text,text,text,date);
CREATE OR REPLACE FUNCTION control.resolve_business_intent(
    p_tenant_id             uuid,
    p_classification_source text,
    p_classification_id     uuid,
    p_direction             text         DEFAULT 'INBOUND',
    p_flow_code             text         DEFAULT 'NON_PO',
    p_company_code_id       uuid         DEFAULT NULL,
    p_doc_type              text         DEFAULT NULL,
    p_amount                numeric      DEFAULT NULL,
    p_currency_code         text         DEFAULT NULL,
    p_is_cross_border       boolean      DEFAULT false,
    p_is_recurring          boolean      DEFAULT false,
    p_supplier_id           uuid         DEFAULT NULL,
    p_customer_id           uuid         DEFAULT NULL,
    p_counterparty_tier     text         DEFAULT NULL,
    p_commodity_domain      text         DEFAULT NULL,
    p_procurement_method    text         DEFAULT NULL,
    p_contract_type         text         DEFAULT NULL,
    p_channel               text         DEFAULT NULL,
    p_as_of_date            date         DEFAULT CURRENT_DATE
) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_rule   RECORD;
    v_match  boolean;
    v_n      smallint := 0;
    v_default uuid;
BEGIN
    -- Input validation
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('intent_id', NULL, 'method', 'FAILED',
            'explanation', 'p_tenant_id is required', 'rules_checked', 0);
    END IF;
    IF p_classification_id IS NULL THEN
        RETURN jsonb_build_object('intent_id', NULL, 'method', 'FAILED',
            'explanation', 'p_classification_id is required', 'rules_checked', 0);
    END IF;

    FOR v_rule IN
        SELECT *
        FROM control.commodity_classification_to_intent_rule
        WHERE tenant_id        = p_tenant_id
          AND classification_source = p_classification_source
          AND classification_id     = p_classification_id
          AND is_active         = true
          AND effective_from   <= p_as_of_date
          AND (effective_to IS NULL OR effective_to >= p_as_of_date)
          AND (direction IS NULL OR direction = p_direction)
          AND (applies_to_flows IS NULL
               OR applies_to_flows = '{}'
               OR p_flow_code = ANY(applies_to_flows))
        ORDER BY priority ASC, created_at ASC
    LOOP
        v_n := v_n + 1;
        v_match := CASE v_rule.condition_type
            WHEN 'FALLBACK'            THEN true
            WHEN 'AMOUNT_ABOVE'        THEN p_amount IS NOT NULL
                AND p_amount > (v_rule.condition_config->>'threshold')::numeric
            WHEN 'AMOUNT_BELOW'        THEN p_amount IS NOT NULL
                AND p_amount < (v_rule.condition_config->>'threshold')::numeric
            WHEN 'IS_RECURRING'        THEN p_is_recurring = true
            WHEN 'IS_ONE_TIME'         THEN p_is_recurring = false
            WHEN 'CROSS_BORDER'        THEN p_is_cross_border = true
            WHEN 'COMPANY_MATCH'       THEN p_company_code_id IS NOT NULL
                AND p_company_code_id::text = ANY(
                    ARRAY(SELECT jsonb_array_elements_text(v_rule.condition_config->'company_code_ids')))
            WHEN 'DOC_TYPE_MATCH'      THEN p_doc_type IS NOT NULL
                AND p_doc_type = v_rule.condition_config->>'doc_type'
            WHEN 'FLOW_MATCH'          THEN p_flow_code = v_rule.condition_config->>'flow'
            WHEN 'PROCUREMENT_METHOD'  THEN p_procurement_method IS NOT NULL
                AND p_procurement_method = v_rule.condition_config->>'method'
            WHEN 'COMMODITY_MATCH'     THEN p_commodity_domain IS NOT NULL
                AND p_commodity_domain = v_rule.condition_config->>'domain'
            WHEN 'SUPPLIER_MATCH'      THEN p_supplier_id IS NOT NULL
                AND p_supplier_id::text = ANY(
                    ARRAY(SELECT jsonb_array_elements_text(v_rule.condition_config->'supplier_ids')))
            WHEN 'CUSTOMER_MATCH'      THEN p_customer_id IS NOT NULL
                AND p_customer_id::text = ANY(
                    ARRAY(SELECT jsonb_array_elements_text(v_rule.condition_config->'customer_ids')))
            WHEN 'CUSTOMER_TIER'       THEN p_counterparty_tier IS NOT NULL
                AND p_counterparty_tier = v_rule.condition_config->>'tier'
            WHEN 'CONTRACT_TYPE_MATCH' THEN p_contract_type IS NOT NULL
                AND p_contract_type = v_rule.condition_config->>'contract_type'
            WHEN 'CHANNEL_MATCH'       THEN p_channel IS NOT NULL
                AND p_channel = v_rule.condition_config->>'channel'
            ELSE false
        END;

        IF v_match THEN
            RETURN jsonb_build_object(
                'intent_id',     v_rule.resolved_intent_id,
                'domain',        v_rule.resolved_domain,
                'rule_id',       v_rule.id,
                'confidence',    v_rule.confidence,
                'explanation',   v_rule.explanation_template,
                'method',        'RULE_MATCH',
                'direction',     p_direction,
                'flow_code',     p_flow_code,
                'rules_checked', v_n);
        END IF;
    END LOOP;

    -- Fallback: classification default intent.
    IF p_classification_source = 'COMMODITY_CATEGORY' THEN
        BEGIN
            SELECT p.business_intent_id INTO v_default
            FROM control.commodity_category_buy_policy p
            WHERE p.tenant_id = p_tenant_id
              AND p.commodity_category_id = p_classification_id
              AND p.scope_type = 'TENANT'
              AND p.scope_id IS NULL
              AND p.mapping_mode = 'ALLOW'
              AND p.is_default = true
              AND p.is_active = true
              AND p.effective_from <= p_as_of_date
              AND (p.effective_to IS NULL OR p.effective_to >= p_as_of_date)
            ORDER BY p.effective_from DESC, p.created_at DESC
            LIMIT 1;
        EXCEPTION WHEN undefined_table THEN
            v_default := NULL;
        END;
    END IF;

    IF v_default IS NOT NULL THEN
        RETURN jsonb_build_object(
            'intent_id',     v_default,
            'domain',        NULL,
            'confidence',    0.70,
            'explanation',   'Classification default intent',
            'method',        'CLASSIFICATION_DEFAULT',
            'direction',     p_direction,
            'rules_checked', v_n);
    END IF;

    RETURN jsonb_build_object(
        'intent_id',     NULL,
        'method',        'FAILED',
        'explanation',   'No intent resolved: no matching rule and no classification default',
        'rules_checked', v_n);
END;
$$;

COMMENT ON FUNCTION control.resolve_business_intent IS
    'Engine 4.13 §F1: classification → business intent. '
    'Evaluates all 16 condition types in priority order. '
    'Fallback: classification default from COMMODITY_CATEGORY policy. '
    'Returns JSONB with method=RULE_MATCH|CLASSIFICATION_DEFAULT|FAILED.';


-- ============================================================================
-- §F2  control.resolve_accounting_profile
-- Resolves a profile config for a given intent + transaction context.
-- Override check (governance) → rule matching (priority) → FAILED.
-- Effective-date filtering applied on both rule and resolved config.
-- CORR-1: both override and rule-match branches validate resolved config
--         against applicable_flow_codes + applicable_doc_types.
--         NULL flow/doc params are permissive (do not cause rejection).
-- Returns JSONB: profile_config_id, profile_id, confidence, explanation,
--               method, subledger_type, profile_version, rules_checked.
-- method: OVERRIDE | RULE_MATCH | FAILED
-- ============================================================================
-- Drop old overload that had p_entity_code text + p_ou_id uuid (removed in company_code migration)
DROP FUNCTION IF EXISTS control.resolve_accounting_profile(uuid, uuid, text, text, text, uuid, text, numeric, text, boolean, boolean, text, text, text, numeric, text, date);
CREATE OR REPLACE FUNCTION control.resolve_accounting_profile(
    p_tenant_id         uuid,
    p_intent_id         uuid,
    p_direction         text         DEFAULT 'INBOUND',
    p_flow_code         text         DEFAULT 'NON_PO',
    p_company_code_id   uuid         DEFAULT NULL,
    p_doc_type          text         DEFAULT NULL,
    p_amount            numeric      DEFAULT NULL,
    p_currency_code     text         DEFAULT NULL,
    p_is_cross_border   boolean      DEFAULT false,
    p_is_intercompany   boolean      DEFAULT false,
    p_commodity_domain  text         DEFAULT NULL,
    p_commitment_type   text         DEFAULT NULL,
    p_counterparty_tier text         DEFAULT NULL,
    p_contract_value    numeric      DEFAULT NULL,
    p_revenue_type      text         DEFAULT NULL,
    p_as_of_date        date         DEFAULT CURRENT_DATE
) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_intent_domain text;
    v_ovr           RECORD;
    v_rule          RECORD;
    v_cfg           RECORD;
    v_match         boolean;
    v_n             smallint := 0;
    v_applicability_skips smallint := 0;
BEGIN
    IF p_tenant_id IS NULL OR p_intent_id IS NULL THEN
        RETURN jsonb_build_object(
            'profile_config_id', NULL,
            'method',            'FAILED',
            'explanation',       'p_tenant_id and p_intent_id are required',
            'rules_checked',     0);
    END IF;

    -- Resolve intent domain from master.business_intent (soft: table may not exist yet)
    BEGIN
        SELECT domain INTO v_intent_domain
        FROM master.business_intent
        WHERE id = p_intent_id AND tenant_id = p_tenant_id AND is_active = true;
    EXCEPTION WHEN undefined_table THEN
        v_intent_domain := NULL;
    END;

    -- ── Override check (governance-gated; specificity-ranked) ──────────────
    SELECT * INTO v_ovr
    FROM control.intent_profile_override
    WHERE tenant_id    = p_tenant_id
      AND intent_id    = p_intent_id
      AND is_active    = true
      AND effective_from <= p_as_of_date
      AND (effective_to IS NULL OR effective_to >= p_as_of_date)
      AND (company_code_id IS NULL OR company_code_id = p_company_code_id)
      AND (direction       IS NULL OR direction       = p_direction)
      AND (flow_code       IS NULL OR flow_code       = p_flow_code)
    ORDER BY
        (company_code_id IS NOT NULL)::int +
        (direction       IS NOT NULL)::int +
        (flow_code       IS NOT NULL)::int DESC
    LIMIT 1;

    IF v_ovr IS NOT NULL THEN
        -- CORR-1: added flow_code + NULL-safe doc_type filtering
        SELECT * INTO v_cfg
        FROM control.acct_profile_config
        WHERE id        = v_ovr.override_profile_config_id
          AND tenant_id = p_tenant_id
          AND is_active = true
          AND effective_from <= p_as_of_date
          AND (effective_to IS NULL OR effective_to >= p_as_of_date)
          AND (applicable_flow_codes IS NULL
               OR applicable_flow_codes = '{}'
               OR p_flow_code IS NULL
               OR p_flow_code = ANY(applicable_flow_codes))
          AND (applicable_doc_types IS NULL
               OR applicable_doc_types = '{}'
               OR p_doc_type IS NULL
               OR p_doc_type = ANY(applicable_doc_types));

        IF v_cfg IS NOT NULL THEN
            RETURN jsonb_build_object(
                'profile_config_id', v_cfg.id,
                'profile_id',        v_cfg.accounting_profile_id,
                'override_id',       v_ovr.id,
                'confidence',        1.00,
                'explanation',       format('Regulatory override: %s', v_ovr.reason),
                'method',            'OVERRIDE',
                'direction',         p_direction,
                'subledger_type',    v_cfg.subledger_type,
                'profile_version',   v_cfg.version,
                'rules_checked',     0,
                'applicability_skips', 0);
        ELSE
            -- Override matched but config failed applicability check
            v_applicability_skips := v_applicability_skips + 1;
        END IF;
    END IF;

    -- ── Rule matching ───────────────────────────────────────────────────────
    FOR v_rule IN
        SELECT *
        FROM control.intent_to_accounting_profile_rule
        WHERE tenant_id    = p_tenant_id
          AND is_active    = true
          AND effective_from <= p_as_of_date
          AND (effective_to IS NULL OR effective_to >= p_as_of_date)
          AND (direction   IS NULL OR direction = p_direction)
        ORDER BY priority ASC, created_at ASC
    LOOP
        v_n := v_n + 1;
        v_match :=
            (v_rule.intent_id        IS NULL OR v_rule.intent_id        = p_intent_id)
        AND (v_rule.intent_domain    IS NULL OR v_rule.intent_domain    = v_intent_domain)
        AND (v_rule.flow_code        IS NULL OR v_rule.flow_code        = p_flow_code)
        AND (v_rule.company_code_id  IS NULL OR v_rule.company_code_id  = p_company_code_id)
        AND (v_rule.doc_type         IS NULL OR v_rule.doc_type         = p_doc_type)
        AND (v_rule.currency_code    IS NULL OR v_rule.currency_code    = p_currency_code)
        AND (v_rule.is_cross_border  IS NULL OR v_rule.is_cross_border  = p_is_cross_border)
        AND (v_rule.is_intercompany  IS NULL OR v_rule.is_intercompany  = p_is_intercompany)
        AND (v_rule.commodity_domain IS NULL OR v_rule.commodity_domain  = p_commodity_domain)
        AND (v_rule.commitment_type  IS NULL OR v_rule.commitment_type   = p_commitment_type)
        AND (v_rule.counterparty_tier IS NULL OR v_rule.counterparty_tier = p_counterparty_tier)
        AND (v_rule.revenue_type     IS NULL OR v_rule.revenue_type     = p_revenue_type)
        AND (v_rule.min_amount       IS NULL OR p_amount >= v_rule.min_amount)
        AND (v_rule.max_amount       IS NULL OR p_amount <= v_rule.max_amount)
        AND (v_rule.contract_value_min IS NULL OR p_contract_value >= v_rule.contract_value_min)
        AND (v_rule.contract_value_max IS NULL OR p_contract_value <= v_rule.contract_value_max);

        IF v_match THEN
            -- CORR-1: validate resolved config against flow/doc-type applicability
            SELECT * INTO v_cfg
            FROM control.acct_profile_config
            WHERE id        = v_rule.resolved_profile_config_id
              AND tenant_id = p_tenant_id
              AND is_active = true
              AND effective_from <= p_as_of_date
              AND (effective_to IS NULL OR effective_to >= p_as_of_date)
              AND (applicable_flow_codes IS NULL
                   OR applicable_flow_codes = '{}'
                   OR p_flow_code IS NULL
                   OR p_flow_code = ANY(applicable_flow_codes))
              AND (applicable_doc_types IS NULL
                   OR applicable_doc_types = '{}'
                   OR p_doc_type IS NULL
                   OR p_doc_type = ANY(applicable_doc_types));

            IF v_cfg IS NOT NULL THEN
                RETURN jsonb_build_object(
                    'profile_config_id', v_cfg.id,
                    'profile_id',        v_cfg.accounting_profile_id,
                    'rule_id',           v_rule.id,
                    'confidence',        v_rule.confidence,
                    'explanation',       v_rule.explanation_template,
                    'method',            'RULE_MATCH',
                    'direction',         p_direction,
                    'subledger_type',    v_cfg.subledger_type,
                    'profile_version',   v_cfg.version,
                    'rules_checked',     v_n,
                    'applicability_skips', v_applicability_skips);
            ELSE
                -- Config failed flow/doc applicability check; continue to next rule
                v_applicability_skips := v_applicability_skips + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'profile_config_id', NULL,
        'method',            'FAILED',
        'explanation',       format('No profile resolved: %s rules evaluated, %s matched but failed applicability filtering',
                                    v_n, v_applicability_skips),
        'rules_checked',     v_n,
        'applicability_skips', v_applicability_skips);
END;
$$;

COMMENT ON FUNCTION control.resolve_accounting_profile IS
    'Engine 4.13 §F2: intent + context → accounting profile. '
    'Override check (governance) → rule matching (priority) → FAILED. '
    'CORR-1: both override and rule-match branches validate resolved config '
    'against applicable_flow_codes + applicable_doc_types. NULL flow/doc params '
    'are permissive (do not cause rejection). '
    'applicability_skips: count of condition-matched rules/overrides whose config '
    'failed flow_code or doc_type applicability filters (observability). '
    'Returns JSONB with method=OVERRIDE|RULE_MATCH|FAILED.';


-- ============================================================================
-- §F2b  control.resolve_entry_account
-- Per-line GL account resolution building block.
-- Handles all 4 account_source modes:
--   POSTING_ROLE → resolve_posting_role_account() → account_fallback
--   FIXED        → gl_account by code in the company operating COA
--   FROM_INTENT  → company-aware intent default GL
--   FROM_CATEGORY→ company buy policy → intent default GL
-- Called by the JE generation orchestrator for each entry template line.
-- Returns JSONB: gl_account_id, method, fallback_used, resolved.
-- ============================================================================
DROP FUNCTION IF EXISTS control.resolve_entry_account(
    uuid, text, text, text, text, text, uuid, text, uuid, uuid, date
);

CREATE OR REPLACE FUNCTION control.resolve_entry_account(
    p_tenant_id          uuid,
    p_account_source     text,
    p_posting_role_code  text,
    p_account_code       text,
    p_account_lookup_key text,
    p_account_fallback   text,
    p_company_code_id    uuid,
    p_book_code          text    DEFAULT 'statutory',
    p_intent_id          uuid    DEFAULT NULL,
    p_commodity_category_id uuid DEFAULT NULL,
    p_as_of_date         date    DEFAULT CURRENT_DATE
) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_gl_account_id uuid;
    v_method        text;
    v_fallback_used boolean := false;
BEGIN
    CASE p_account_source

        WHEN 'POSTING_ROLE' THEN
            v_gl_account_id := control.resolve_posting_role_account(
                p_tenant_id, p_posting_role_code, p_company_code_id,
                p_book_code, p_as_of_date
            );
            v_method := 'POSTING_ROLE';

            IF v_gl_account_id IS NULL AND p_account_fallback IS NOT NULL THEN
                BEGIN
                    SELECT ga.id INTO v_gl_account_id
                    FROM master.gl_account ga
                    JOIN master.company_code_chart_assignment cca
                      ON cca.tenant_id = ga.tenant_id
                     AND cca.chart_of_account_id = ga.chart_of_account_id
                     AND cca.company_code_id = p_company_code_id
                     AND cca.assignment_type = 'operating'
                     AND cca.status = 'active'
                     AND cca.effective_from <= p_as_of_date
                     AND (cca.effective_to IS NULL OR cca.effective_to >= p_as_of_date)
                    WHERE ga.tenant_id = p_tenant_id
                      AND ga.code      = p_account_fallback
                      AND ga.is_active = true
                      AND ga.node_type = 'posting'
                      AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true;
                EXCEPTION WHEN undefined_table THEN NULL;
                END;
                IF v_gl_account_id IS NOT NULL THEN
                    v_fallback_used := true;
                    v_method := 'POSTING_ROLE_FALLBACK';
                END IF;
            END IF;

        WHEN 'FIXED' THEN
            BEGIN
                SELECT ga.id INTO v_gl_account_id
                FROM master.gl_account ga
                JOIN master.company_code_chart_assignment cca
                  ON cca.tenant_id = ga.tenant_id
                 AND cca.chart_of_account_id = ga.chart_of_account_id
                 AND cca.company_code_id = p_company_code_id
                 AND cca.assignment_type = 'operating'
                 AND cca.status = 'active'
                 AND cca.effective_from <= p_as_of_date
                 AND (cca.effective_to IS NULL OR cca.effective_to >= p_as_of_date)
                WHERE ga.tenant_id = p_tenant_id
                  AND ga.code      = p_account_code
                  AND ga.is_active = true
                  AND ga.node_type = 'posting'
                  AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true;
            EXCEPTION WHEN undefined_table THEN NULL;
            END;
            v_method := 'FIXED';

        WHEN 'FROM_INTENT' THEN
            IF p_intent_id IS NOT NULL THEN
                BEGIN
                    SELECT master.fn_resolve_intent_default_gl_account(
                        p_tenant_id,
                        p_intent_id,
                        p_company_code_id
                    ) INTO v_gl_account_id;
                EXCEPTION WHEN undefined_table THEN NULL;
                END;
            END IF;
            v_method := 'FROM_INTENT';

        WHEN 'FROM_CATEGORY' THEN
            IF p_commodity_category_id IS NOT NULL THEN
                BEGIN
                    SELECT resolved_gl_account_id INTO v_gl_account_id
                    FROM master.fn_resolve_commodity_category_defaults(
                        p_tenant_id,
                        p_commodity_category_id,
                        p_company_code_id
                    );
                EXCEPTION WHEN undefined_table THEN NULL;
                END;
            END IF;
            v_method := 'FROM_CATEGORY';

        ELSE
            v_method := 'UNKNOWN';
    END CASE;

    IF v_gl_account_id IS NULL AND p_account_fallback IS NOT NULL AND NOT v_fallback_used THEN
        BEGIN
            SELECT ga.id INTO v_gl_account_id
            FROM master.gl_account ga
            JOIN master.company_code_chart_assignment cca
              ON cca.tenant_id = ga.tenant_id
             AND cca.chart_of_account_id = ga.chart_of_account_id
             AND cca.company_code_id = p_company_code_id
             AND cca.assignment_type = 'operating'
             AND cca.status = 'active'
             AND cca.effective_from <= p_as_of_date
             AND (cca.effective_to IS NULL OR cca.effective_to >= p_as_of_date)
            WHERE ga.tenant_id = p_tenant_id
              AND ga.code      = p_account_fallback
              AND ga.is_active = true
              AND ga.node_type = 'posting'
              AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true;
        EXCEPTION WHEN undefined_table THEN NULL;
        END;
        IF v_gl_account_id IS NOT NULL THEN
            v_method := v_method || '_FALLBACK';
            v_fallback_used := true;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'gl_account_id',  v_gl_account_id,
        'method',         v_method,
        'fallback_used',  v_fallback_used,
        'resolved',       v_gl_account_id IS NOT NULL);
END;
$$;

COMMENT ON FUNCTION control.resolve_entry_account IS
    'Per-line GL account resolution building block. Handles all 4 account_source modes: '
    'POSTING_ROLE → resolve_posting_role_account() → account_fallback, '
    'FIXED → company operating COA gl_account by code, '
    'FROM_INTENT → company-aware business_intent default GL, '
    'FROM_CATEGORY → company buy policy / intent default GL. '
    'Called by the JE generation orchestrator for each entry template line. '
    'Returns JSONB: gl_account_id, method, fallback_used, resolved.';


-- ============================================================================
-- §F3  control.generate_event_entries
-- Expands a profile_config + event_code into Dr/Cr journal entry lines.
-- Stateless: all inputs explicit. Tenant ownership verified on first lookup.
-- Paired COGS path: symmetric with main (doc_type filter + book EXCLUDE/REMAP).
-- REMAINDER line: balances split entries; raises if result is negative.
-- ============================================================================
CREATE OR REPLACE FUNCTION control.generate_event_entries(
    p_tenant_id             uuid,
    p_profile_config_id     uuid,
    p_event_code            text,
    p_doc_type              text            DEFAULT NULL,
    p_document_total        numeric(18,4)   DEFAULT 0,
    p_tax_amount            numeric(18,4)   DEFAULT 0,
    p_line_amount           numeric(18,4)   DEFAULT NULL,
    p_commitment_amount     numeric(18,4)   DEFAULT NULL,
    p_milestone_amount      numeric(18,4)   DEFAULT NULL,
    p_cogs_amount           numeric(18,4)   DEFAULT NULL,
    p_revenue_amount        numeric(18,4)   DEFAULT NULL,
    p_advance_amount        numeric(18,4)   DEFAULT NULL,
    p_advance_recovery      numeric(18,4)   DEFAULT NULL,
    p_retention_amount      numeric(18,4)   DEFAULT NULL,
    p_penalty_amount        numeric(18,4)   DEFAULT NULL,
    p_rebate_amount         numeric(18,4)   DEFAULT NULL,
    p_discount_amount       numeric(18,4)   DEFAULT NULL,
    p_net_payable           numeric(18,4)   DEFAULT NULL,
    p_intent_gl_account     text            DEFAULT NULL,
    p_classification_gl     text            DEFAULT NULL,
    p_book_code             text            DEFAULT 'STAT',
    p_include_paired        boolean         DEFAULT true,
    p_as_of_date            date            DEFAULT CURRENT_DATE
) RETURNS TABLE (
    line_seq                 smallint,
    description              text,
    posting_side             text,
    account_code             text,
    amount                   numeric(18,4),
    cost_center              text,
    profit_center            text,
    dimension_set_id         uuid,
    is_balancing             boolean,
    event_code               text,
    commitment_action        text,
    source_profile_config_id uuid,
    is_paired_entry          boolean
)
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = control, pg_temp
AS $$
DECLARE
    v_cfg           RECORD;
    v_ev            RECORD;
    v_t             RECORD;
    v_acct          text;
    v_amt           numeric(18,4);
    v_bk            RECORD;
    v_remap         text;
    v_rev_cfg       RECORD;
    v_paired_cfg    RECORD;
    v_paired_bk     RECORD;
    v_debit_total   numeric(18,4) := 0;
    v_credit_total  numeric(18,4) := 0;
    v_remainder_seq smallint      := NULL;
    v_remainder_side text         := NULL;
BEGIN
    -- Tenant ownership verification
    SELECT * INTO v_cfg
    FROM control.acct_profile_config
    WHERE id = p_profile_config_id AND tenant_id = p_tenant_id AND is_active = true;
    IF NOT FOUND THEN RETURN; END IF;

    -- Tenant-filtered event lookup
    SELECT * INTO v_ev
    FROM control.acct_profile_event
    WHERE profile_config_id = p_profile_config_id
      AND tenant_id         = p_tenant_id
      AND event_code        = p_event_code
      AND is_active         = true;
    IF NOT FOUND THEN RETURN; END IF;

    IF v_ev.creates_je THEN
        -- Book rule lookup (tenant-filtered)
        SELECT * INTO v_bk
        FROM control.acct_profile_book_rule
        WHERE profile_config_id = p_profile_config_id
          AND tenant_id         = p_tenant_id
          AND book_code         = p_book_code
          AND is_active         = true
          AND (applies_to_events IS NULL
               OR applies_to_events = '{}'
               OR p_event_code = ANY(applies_to_events));

        IF v_bk IS NULL OR v_bk.posting_method <> 'EXCLUDE' THEN
            -- First pass: all lines except REMAINDER
            FOR v_t IN
                SELECT *
                FROM control.acct_profile_entry_template
                WHERE profile_event_id = v_ev.id
                  AND tenant_id        = p_tenant_id
                  AND is_active        = true
                  AND (applies_to_doc_types IS NULL
                       OR applies_to_doc_types = '{}'
                       OR p_doc_type = ANY(applies_to_doc_types))
                ORDER BY line_seq ASC
            LOOP
                IF v_t.amount_source = 'REMAINDER' THEN
                    v_remainder_seq  := v_t.line_seq;
                    v_remainder_side := v_t.posting_side;
                    CONTINUE;
                END IF;

                v_acct := CASE v_t.account_source
                    WHEN 'FIXED'         THEN v_t.account_code
                    WHEN 'FROM_INTENT'   THEN COALESCE(p_intent_gl_account, v_t.account_fallback)
                    WHEN 'FROM_CATEGORY' THEN COALESCE(p_classification_gl,  v_t.account_fallback)
                    ELSE                      v_t.account_fallback
                END;

                IF v_bk IS NOT NULL AND v_bk.posting_method = 'REMAP' THEN
                    v_remap := v_bk.account_mapping->>v_acct;
                    IF v_remap IS NOT NULL THEN v_acct := v_remap; END IF;
                END IF;

                v_amt := CASE v_t.amount_source
                    WHEN 'DOCUMENT_TOTAL'       THEN COALESCE(p_document_total, 0)
                    WHEN 'LINE_AMOUNT'          THEN COALESCE(p_line_amount, p_document_total, 0)
                    WHEN 'TAX_AMOUNT'           THEN COALESCE(p_tax_amount, 0)
                    WHEN 'COMMITMENT_AMOUNT'    THEN COALESCE(p_commitment_amount, p_document_total, 0)
                    WHEN 'MILESTONE_AMOUNT'     THEN COALESCE(p_milestone_amount, 0)
                    WHEN 'FULFILLED_AMOUNT'     THEN COALESCE(p_line_amount, p_document_total, 0)
                    WHEN 'REVENUE_AMOUNT'       THEN COALESCE(p_revenue_amount, p_document_total, 0)
                    WHEN 'COGS_AMOUNT'          THEN COALESCE(p_cogs_amount, 0)
                    WHEN 'ADVANCE_AMOUNT'       THEN COALESCE(p_advance_amount, 0)
                    WHEN 'ADVANCE_RECOVERY'     THEN COALESCE(p_advance_recovery, 0)
                    WHEN 'RETENTION_AMOUNT'     THEN COALESCE(p_retention_amount, 0)
                    WHEN 'RETENTION_BALANCE'    THEN COALESCE(p_retention_amount, 0)
                    WHEN 'PENALTY_AMOUNT'       THEN COALESCE(p_penalty_amount, 0)
                    WHEN 'REBATE_AMOUNT'        THEN COALESCE(p_rebate_amount, 0)
                    WHEN 'DISCOUNT_EARNED'      THEN COALESCE(p_discount_amount, 0)
                    WHEN 'DISCOUNT_AMOUNT'      THEN COALESCE(p_discount_amount, 0)
                    WHEN 'NET_PAYABLE'          THEN COALESCE(p_net_payable, p_document_total, 0)
                    WHEN 'NET_AFTER_DISCOUNT'   THEN COALESCE(p_net_payable, p_document_total, 0)
                    WHEN 'SCF_FINANCIER_AMOUNT' THEN COALESCE(p_net_payable, 0)
                    WHEN 'CALCULATED'           THEN
                        CASE WHEN v_t.amount_percentage IS NOT NULL
                             THEN round(COALESCE(p_document_total, 0) * v_t.amount_percentage / 100, 4)
                             ELSE 0
                        END
                    ELSE 0
                END;

                IF v_t.posting_side = 'DEBIT'
                    THEN v_debit_total  := v_debit_total  + v_amt;
                    ELSE v_credit_total := v_credit_total + v_amt;
                END IF;

                line_seq                 := v_t.line_seq;
                description              := v_t.description;
                posting_side             := v_t.posting_side;
                account_code             := v_acct;
                amount                   := v_amt;
                cost_center              := v_t.override_cost_center;
                profit_center            := v_t.override_profit_center;
                dimension_set_id         := v_t.override_dimension_set_id;
                is_balancing             := v_t.is_balancing_line;
                event_code               := p_event_code;
                commitment_action        := v_ev.commitment_action;
                source_profile_config_id := p_profile_config_id;
                is_paired_entry          := false;
                RETURN NEXT;
            END LOOP;

            -- REMAINDER line (balances split accounting lines)
            IF v_remainder_seq IS NOT NULL THEN
                SELECT * INTO v_t
                FROM control.acct_profile_entry_template
                WHERE profile_event_id = v_ev.id
                  AND tenant_id        = p_tenant_id
                  AND line_seq         = v_remainder_seq
                  AND is_active        = true;

                IF FOUND THEN
                    v_acct := COALESCE(v_t.account_code, v_t.account_fallback);
                    v_amt  := CASE v_remainder_side
                        WHEN 'DEBIT'  THEN v_credit_total - v_debit_total
                        WHEN 'CREDIT' THEN v_debit_total  - v_credit_total
                        ELSE 0
                    END;
                    IF v_amt < 0 THEN
                        RAISE EXCEPTION
                            'Negative REMAINDER (%) for profile=%, event=%, line=%. '
                            'Entry templates are unbalanced — review Dr/Cr definitions.',
                            v_amt, p_profile_config_id, p_event_code, v_remainder_seq
                        USING ERRCODE = 'integrity_constraint_violation';
                    END IF;
                    line_seq                 := v_t.line_seq;
                    description              := v_t.description;
                    posting_side             := v_t.posting_side;
                    account_code             := v_acct;
                    amount                   := v_amt;
                    cost_center              := v_t.override_cost_center;
                    profit_center            := v_t.override_profit_center;
                    dimension_set_id         := v_t.override_dimension_set_id;
                    is_balancing             := v_t.is_balancing_line;
                    event_code               := p_event_code;
                    commitment_action        := 'NONE';
                    source_profile_config_id := p_profile_config_id;
                    is_paired_entry          := false;
                    RETURN NEXT;
                END IF;
            END IF;
        END IF; -- not EXCLUDE
    END IF; -- creates_je

    -- ── Paired COGS profile (symmetric with main path) ────────────────────
    IF p_include_paired AND v_ev.fires_paired_profile THEN
        SELECT * INTO v_rev_cfg
        FROM control.acct_profile_revenue_config
        WHERE profile_config_id = p_profile_config_id AND tenant_id = p_tenant_id;

        IF FOUND
           AND v_rev_cfg.paired_profile_id IS NOT NULL
           AND v_rev_cfg.fires_paired_on_event = p_event_code
        THEN
            -- Effective-date filter on paired config
            SELECT c.* INTO v_paired_cfg
            FROM control.acct_profile_config c
            WHERE c.accounting_profile_id = v_rev_cfg.paired_profile_id
              AND c.tenant_id = p_tenant_id
              AND c.is_active = true
              AND c.effective_from <= p_as_of_date
              AND (c.effective_to IS NULL OR c.effective_to >= p_as_of_date)
            ORDER BY c.version DESC
            LIMIT 1;

            IF FOUND THEN
                -- Book rule: symmetric with main path
                SELECT * INTO v_paired_bk
                FROM control.acct_profile_book_rule
                WHERE profile_config_id = v_paired_cfg.id
                  AND tenant_id         = p_tenant_id
                  AND book_code         = p_book_code
                  AND is_active         = true
                  AND (applies_to_events IS NULL
                       OR applies_to_events = '{}'
                       OR p_event_code = ANY(applies_to_events));

                IF v_paired_bk IS NULL OR v_paired_bk.posting_method <> 'EXCLUDE' THEN
                    FOR v_t IN
                        SELECT t.*
                        FROM control.acct_profile_entry_template t
                        JOIN control.acct_profile_event e ON e.id = t.profile_event_id
                        WHERE e.profile_config_id = v_paired_cfg.id
                          AND e.tenant_id         = p_tenant_id
                          AND e.event_code        = p_event_code
                          AND e.is_active         = true
                          AND t.is_active         = true
                          AND t.tenant_id         = p_tenant_id
                          AND (t.applies_to_doc_types IS NULL
                               OR t.applies_to_doc_types = '{}'
                               OR p_doc_type = ANY(t.applies_to_doc_types))
                        ORDER BY t.line_seq ASC
                    LOOP
                        v_acct := COALESCE(v_t.account_code, v_t.account_fallback);
                        IF v_paired_bk IS NOT NULL AND v_paired_bk.posting_method = 'REMAP' THEN
                            v_remap := v_paired_bk.account_mapping->>v_acct;
                            IF v_remap IS NOT NULL THEN v_acct := v_remap; END IF;
                        END IF;
                        v_amt := CASE v_t.amount_source
                            WHEN 'COGS_AMOUNT' THEN COALESCE(p_cogs_amount, 0)
                            ELSE COALESCE(p_cogs_amount, p_document_total, 0)
                        END;
                        line_seq                 := v_t.line_seq + 100;
                        description              := v_t.description;
                        posting_side             := v_t.posting_side;
                        account_code             := v_acct;
                        amount                   := v_amt;
                        cost_center              := v_t.override_cost_center;
                        profit_center            := v_t.override_profit_center;
                        dimension_set_id         := v_t.override_dimension_set_id;
                        is_balancing             := false;
                        event_code               := p_event_code;
                        commitment_action        := 'NONE';
                        source_profile_config_id := v_paired_cfg.id;
                        is_paired_entry          := true;
                        RETURN NEXT;
                    END LOOP;
                END IF;
            END IF;
        END IF;
    END IF;
END;
$$;

COMMENT ON FUNCTION control.generate_event_entries IS
    'Engine 4.13 §F3: profile_config + event → JE lines (set-returning). '
    'Stateless — all inputs are explicit parameters. '
    'Tenant-verified on every table lookup. Effective-date on paired config. '
    'Paired COGS path symmetric with main (doc_type filter + book EXCLUDE/REMAP). '
    '21 amount_source values. REMAINDER raises on negative balance.';


-- ============================================================================
-- §F4  control.rebuild_intent_paths
-- Recomputes path and depth on master.business_intent using recursive CTE.
-- Soft: returns 0 rows updated if table does not exist.
-- ============================================================================
CREATE OR REPLACE FUNCTION control.rebuild_intent_paths(
    p_tenant_id uuid
) RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = master, pg_temp
AS $$
DECLARE
    v_updated integer := 0;
BEGIN
    BEGIN
        WITH RECURSIVE tree AS (
            SELECT id, code, code::text AS computed_path, 0 AS computed_depth
            FROM master.business_intent
            WHERE tenant_id = p_tenant_id AND parent_id IS NULL
          UNION ALL
            SELECT bi.id, bi.code,
                   (tree.computed_path || '/' || bi.code)::text,
                   tree.computed_depth + 1
            FROM master.business_intent bi
            JOIN tree ON tree.id = bi.parent_id
            WHERE bi.tenant_id = p_tenant_id
        )
        UPDATE master.business_intent bi
        SET    path  = tree.computed_path,
               depth = tree.computed_depth
        FROM   tree
        WHERE  bi.id        = tree.id
          AND  bi.tenant_id = p_tenant_id
          AND  (bi.path  IS DISTINCT FROM tree.computed_path
             OR bi.depth IS DISTINCT FROM tree.computed_depth);
        GET DIAGNOSTICS v_updated = ROW_COUNT;
    EXCEPTION WHEN undefined_table THEN
        -- master.business_intent not yet created; return 0
        RETURN 0;
    END;
    RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION control.rebuild_intent_paths IS
    'Engine 4.13 §F4: recomputes path + depth on master.business_intent tree. '
    'Recursive CTE. Soft: returns 0 if table does not exist. '
    'Call after bulk-loading intent hierarchy.';


-- ============================================================================
-- §F5  control.validate_profile_completeness
-- Validates that a profile config has events, templates, and mandatory
-- flow-template coverage. Returns JSONB: is_valid, errors[], warnings[], stats{}.
-- ============================================================================
CREATE OR REPLACE FUNCTION control.validate_profile_completeness(
    p_profile_config_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = control, pg_temp
AS $$
DECLARE
    v_cfg         RECORD;
    v_errs        jsonb := '[]';
    v_warns       jsonb := '[]';
    v_ec          int;
    v_tc          int;
    v_bc          int;
    v_miss        RECORD;
    v_has_rev     boolean;
    v_has_commit  boolean;
    v_has_settle  boolean;
BEGIN
    SELECT * INTO v_cfg
    FROM control.acct_profile_config
    WHERE id = p_profile_config_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_valid', false,
            'errors',   '["Profile config not found"]'::jsonb,
            'warnings', '[]'::jsonb,
            'stats',    '{}'::jsonb);
    END IF;

    -- Error: no events
    SELECT count(*) INTO v_ec
    FROM control.acct_profile_event
    WHERE profile_config_id = p_profile_config_id
      AND tenant_id         = v_cfg.tenant_id
      AND is_active         = true;
    IF v_ec = 0 THEN
        v_errs := v_errs || '"No active events defined"'::jsonb;
    END IF;

    -- Error: events with creates_je=true but no active templates
    FOR v_miss IN
        SELECT e.event_code
        FROM control.acct_profile_event e
        LEFT JOIN control.acct_profile_entry_template t
            ON t.profile_event_id = e.id
           AND t.is_active        = true
           AND t.tenant_id        = v_cfg.tenant_id
        WHERE e.profile_config_id = p_profile_config_id
          AND e.tenant_id         = v_cfg.tenant_id
          AND e.is_active         = true
          AND e.creates_je        = true
        GROUP BY e.id, e.event_code
        HAVING count(t.id) = 0
    LOOP
        v_errs := v_errs ||
            format('"Event %s has creates_je=true but no active templates"', v_miss.event_code)::jsonb;
    END LOOP;

    -- Warning: mandatory flow-template events not covered by profile
    -- Tenant-specific templates take precedence over global (tenant_id IS NULL)
    FOR v_miss IN
        SELECT resolved.flow_code, resolved.event_code
        FROM (
            SELECT DISTINCT ON (tft.flow_code, tft.event_code)
                   tft.flow_code, tft.event_code, tft.is_mandatory, tft.creates_je
            FROM control.transaction_flow_template tft
            WHERE (tft.tenant_id = v_cfg.tenant_id OR tft.tenant_id IS NULL)
              AND tft.flow_code  = ANY(v_cfg.applicable_flow_codes)
              AND tft.direction  = v_cfg.direction
              AND tft.is_active  = true
            ORDER BY tft.flow_code, tft.event_code,
                     (tft.tenant_id IS NOT NULL) DESC  -- tenant row wins
        ) resolved
        WHERE resolved.is_mandatory = true
          AND resolved.creates_je   = true
          AND NOT EXISTS (
              SELECT 1
              FROM control.acct_profile_event e
              WHERE e.profile_config_id = p_profile_config_id
                AND e.event_code        = resolved.event_code
                AND e.tenant_id         = v_cfg.tenant_id
                AND e.is_active         = true)
    LOOP
        v_warns := v_warns ||
            format('"Missing mandatory event %s for flow %s"',
                   v_miss.event_code, v_miss.flow_code)::jsonb;
    END LOOP;

    -- Stats: optional extension configs
    v_has_rev    := EXISTS (SELECT 1 FROM control.acct_profile_revenue_config
                            WHERE profile_config_id = p_profile_config_id AND tenant_id = v_cfg.tenant_id);
    v_has_commit := EXISTS (SELECT 1 FROM control.acct_profile_commitment_config
                            WHERE profile_config_id = p_profile_config_id AND tenant_id = v_cfg.tenant_id);
    v_has_settle := EXISTS (SELECT 1 FROM control.acct_profile_settlement_config
                            WHERE profile_config_id = p_profile_config_id AND tenant_id = v_cfg.tenant_id);

    -- Warning: revenue config without paired COGS profile
    IF v_has_rev THEN
        IF NOT EXISTS (SELECT 1 FROM control.acct_profile_revenue_config
                       WHERE profile_config_id = p_profile_config_id
                         AND paired_profile_id IS NOT NULL) THEN
            v_warns := v_warns || '"Revenue config present but no paired COGS profile"'::jsonb;
        END IF;
    END IF;

    SELECT count(*) INTO v_tc
    FROM control.acct_profile_entry_template t
    JOIN control.acct_profile_event e ON e.id = t.profile_event_id
    WHERE e.profile_config_id = p_profile_config_id
      AND t.tenant_id         = v_cfg.tenant_id
      AND t.is_active         = true;

    SELECT count(*) INTO v_bc
    FROM control.acct_profile_book_rule
    WHERE profile_config_id = p_profile_config_id
      AND tenant_id         = v_cfg.tenant_id
      AND is_active         = true;

    RETURN jsonb_build_object(
        'is_valid',  jsonb_array_length(v_errs) = 0,
        'errors',    v_errs,
        'warnings',  v_warns,
        'stats',     jsonb_build_object(
            'direction',             v_cfg.direction,
            'subledger',             v_cfg.subledger_type,
            'profile_type',          v_cfg.profile_type,
            'events',                v_ec,
            'templates',             v_tc,
            'book_rules',            v_bc,
            'has_revenue_config',    v_has_rev,
            'has_commitment_config', v_has_commit,
            'has_settlement_config', v_has_settle,
            'flows',                 v_cfg.applicable_flow_codes));
END;
$$;

COMMENT ON FUNCTION control.validate_profile_completeness IS
    'Engine 4.13 §F5: profile config completeness check. '
    'Errors: no events; events with creates_je=true but no templates. '
    'Warnings: mandatory flow-template events not covered; revenue without COGS pair. '
    'Stats: event/template/book_rule counts + extension config flags.';


-- ============================================================================
-- §F6  control.promote_obligation_tier
-- Bulk-promotes obligation_horizon rows: PLANNED→FORECAST or FORECAST→RESERVED.
-- Returns JSONB: promoted count, from_tier, to_tier, fiscal_year.
-- ============================================================================
-- Drop old overload that had p_entity_code text (pre-company_code migration)
DROP FUNCTION IF EXISTS control.promote_obligation_tier(uuid, smallint, text, text);
CREATE OR REPLACE FUNCTION control.promote_obligation_tier(
    p_tenant_id          uuid,
    p_fiscal_year        smallint,
    p_target_tier        text,
    p_company_code_id    uuid DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = document, pg_temp
AS $$
DECLARE
    v_source text;
    v_count  int := 0;
BEGIN
    IF p_tenant_id IS NULL OR p_fiscal_year IS NULL OR p_target_tier IS NULL THEN
        RETURN jsonb_build_object('error', 'p_tenant_id, p_fiscal_year, and p_target_tier are required');
    END IF;

    v_source := CASE p_target_tier
        WHEN 'FORECAST' THEN 'PLANNED'
        WHEN 'RESERVED' THEN 'FORECAST'
        ELSE NULL
    END;
    IF v_source IS NULL THEN
        RETURN jsonb_build_object(
            'error', format('Invalid target_tier: %s. Expected FORECAST or RESERVED.', p_target_tier));
    END IF;

    UPDATE document.obligation_horizon
    SET obligation_tier  = p_target_tier,
        promoted_at      = CASE WHEN p_target_tier = 'FORECAST' THEN now() ELSE promoted_at END,
        reserved_at      = CASE WHEN p_target_tier = 'RESERVED' THEN now() ELSE reserved_at END,
        updated_at       = now()
    WHERE tenant_id      = p_tenant_id
      AND fiscal_year    = p_fiscal_year
      AND obligation_tier = v_source
      AND is_active       = true
      AND (p_company_code_id IS NULL OR company_code_id = p_company_code_id);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object(
        'promoted',          v_count,
        'from_tier',         v_source,
        'to_tier',           p_target_tier,
        'fiscal_year',       p_fiscal_year,
        'company_code_id',   p_company_code_id);
END;
$$;

COMMENT ON FUNCTION control.promote_obligation_tier IS
    'Engine 4.13 §F6: bulk obligation tier promotion. '
    'PLANNED → FORECAST (sets promoted_at) or FORECAST → RESERVED (sets reserved_at). '
    'Returns JSONB with promoted row count. Scoped by tenant + fiscal_year + company_code_id.';


-- =============================================================================
-- DOCUMENT SEQUENCE — atomic number generator
-- =============================================================================

-- ── control.next_entity_number ──────────────────────────────────────────────
-- Canonical entity-number generator. Reads control.entity_numbering_config,
-- increments control.entity_numbering_counter, and renders configured segments.
CREATE OR REPLACE FUNCTION control.next_entity_number(
    p_tenant_id          uuid,
    p_entity_code        text,
    p_number_field       text      DEFAULT NULL,
    p_company_code_id    uuid      DEFAULT NULL,
    p_fiscal_year        smallint  DEFAULT NULL,
    p_period_number      smallint  DEFAULT NULL,
    p_branch_code        text      DEFAULT NULL,
    p_effective_date     date      DEFAULT CURRENT_DATE
) RETURNS text
LANGUAGE plpgsql
SET search_path = control, master, shared, pg_catalog
AS $$
DECLARE
    v_config             record;
    v_counter_tenant_id  uuid;
    v_scope_key          text;
    v_year               smallint;
    v_period             smallint;
    v_quarter            smallint;
    v_bucket_year        smallint := 0;
    v_bucket_period      smallint := 0;
    v_bucket_quarter     smallint := 0;
    v_next_val           bigint;
    v_effective_date     date := COALESCE(p_effective_date, CURRENT_DATE);
    v_fp_year            smallint;
    v_fp_period          smallint;
    v_tenant_code        text;
    v_company_code       text;
    v_sep                text;
    v_parts              text[] := ARRAY[]::text[];
    v_segment            jsonb;
    v_type               text;
    v_format             text;
    v_part               text;
    v_padding            integer;
    v_optional           boolean;
    v_doc_no             text;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id is required for entity numbering'
            USING ERRCODE = 'not_null_violation';
    END IF;
    IF p_entity_code IS NULL OR btrim(p_entity_code) = '' THEN
        RAISE EXCEPTION 'entity_code is required for entity numbering'
            USING ERRCODE = 'not_null_violation';
    END IF;

    SELECT c.*
      INTO v_config
      FROM control.entity_numbering_config c
      JOIN control.entity e ON e.id = c.entity_id
     WHERE e.entity_code = p_entity_code
       AND c.is_active = true
       AND (c.tenant_id IS NULL OR c.tenant_id = p_tenant_id)
       AND (p_number_field IS NULL OR c.number_field = p_number_field)
       AND (c.company_code_id IS NULL OR c.company_code_id = p_company_code_id)
     ORDER BY
       CASE WHEN c.tenant_id = p_tenant_id THEN 2 ELSE 1 END DESC,
       CASE WHEN c.company_code_id = p_company_code_id THEN 2
            WHEN c.company_code_id IS NULL THEN 1 ELSE 0 END DESC,
       c.created_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'No active entity_numbering_config for tenant=%, entity=%, number_field=%.',
            p_tenant_id, p_entity_code, COALESCE(p_number_field, '<default>')
            USING ERRCODE = 'no_data_found';
    END IF;

    SELECT regexp_replace(upper(t.code), '[^A-Z0-9]+', '-', 'g')
      INTO v_tenant_code
      FROM master.tenant t
     WHERE t.id = p_tenant_id;

    IF p_company_code_id IS NOT NULL THEN
        SELECT regexp_replace(upper(c.code), '[^A-Z0-9]+', '-', 'g')
          INTO v_company_code
          FROM master.company_code c
         WHERE c.id = p_company_code_id
           AND c.tenant_id = p_tenant_id;
    END IF;

    v_year := COALESCE(p_fiscal_year, EXTRACT(YEAR FROM v_effective_date)::smallint);
    v_period := COALESCE(p_period_number, EXTRACT(MONTH FROM v_effective_date)::smallint);

    IF (p_fiscal_year IS NULL OR p_period_number IS NULL)
       AND p_company_code_id IS NOT NULL
       AND (
           v_config.reset_strategy IN ('fiscal_yearly','monthly','quarterly')
           OR v_config.segments @> '[{"type":"fiscal_year"}]'::jsonb
           OR v_config.segments @> '[{"type":"period"}]'::jsonb
           OR v_config.segments @> '[{"type":"quarter"}]'::jsonb
       ) THEN
        SELECT fp.fiscal_year, fp.period_number
          INTO v_fp_year, v_fp_period
          FROM master.fiscal_period fp
         WHERE fp.tenant_id = p_tenant_id
           AND fp.company_code_id = p_company_code_id
           AND fp.period_number BETWEEN 1 AND 16
           AND fp.start_date <= v_effective_date
           AND fp.end_date >= v_effective_date
         ORDER BY fp.period_number ASC
         LIMIT 1;

        IF FOUND THEN
            v_year := COALESCE(p_fiscal_year, v_fp_year);
            v_period := COALESCE(p_period_number, v_fp_period);
        END IF;
    END IF;

    IF v_config.reset_strategy = 'fiscal_yearly'
       AND p_fiscal_year IS NULL
       AND v_fp_year IS NULL THEN
        RAISE EXCEPTION
            'p_fiscal_year is required for fiscal_yearly numbering when no fiscal_period covers tenant=%, company=%, date=%.',
            p_tenant_id, COALESCE(p_company_code_id::text, '<none>'), v_effective_date
            USING ERRCODE = 'no_data_found';
    END IF;

    v_quarter := CASE
        WHEN v_period BETWEEN 1 AND 12 THEN (((v_period - 1) / 3) + 1)::smallint
        WHEN v_period = 0 THEN 0
        ELSE 4
    END;

    CASE v_config.reset_strategy
        WHEN 'never' THEN
            v_bucket_year := 0;
            v_bucket_period := 0;
            v_bucket_quarter := 0;
        WHEN 'monthly' THEN
            v_bucket_year := v_year;
            v_bucket_period := v_period;
            v_bucket_quarter := 0;
        WHEN 'quarterly' THEN
            v_bucket_year := v_year;
            v_bucket_period := 0;
            v_bucket_quarter := v_quarter;
        ELSE
            v_bucket_year := v_year;
            v_bucket_period := 0;
            v_bucket_quarter := 0;
    END CASE;

    v_counter_tenant_id := CASE
        WHEN v_config.uniqueness_scope = 'global' THEN NULL
        ELSE p_tenant_id
    END;

    v_scope_key := CASE v_config.uniqueness_scope
        WHEN 'global' THEN 'global'
        WHEN 'company' THEN 'company:' || COALESCE(p_company_code_id::text, 'none')
        ELSE 'tenant:' || p_tenant_id::text
    END;

    UPDATE control.entity_numbering_counter
       SET last_value = last_value + 1,
           updated_at = now(),
           updated_by = COALESCE(
               nullif(current_setting('app.current_principal_id', true), '')::uuid,
               '00000000-0000-0000-0000-000000000000'::uuid)
     WHERE tenant_id IS NOT DISTINCT FROM v_counter_tenant_id
       AND config_id = v_config.id
       AND scope_key = v_scope_key
       AND fiscal_year = v_bucket_year
       AND period_number = v_bucket_period
       AND quarter_number = v_bucket_quarter
     RETURNING last_value INTO v_next_val;

    IF v_next_val IS NULL THEN
        INSERT INTO control.entity_numbering_counter (
            tenant_id, config_id, company_code_id, scope_key,
            fiscal_year, period_number, quarter_number, last_value, updated_by)
        VALUES (
            v_counter_tenant_id, v_config.id,
            CASE WHEN v_config.uniqueness_scope = 'company' THEN p_company_code_id ELSE NULL END,
            v_scope_key, v_bucket_year, v_bucket_period, v_bucket_quarter, 1,
            COALESCE(
                nullif(current_setting('app.current_principal_id', true), '')::uuid,
                '00000000-0000-0000-0000-000000000000'::uuid))
        ON CONFLICT ON CONSTRAINT enctr_bucket_uq
        DO UPDATE SET
            last_value = control.entity_numbering_counter.last_value + 1,
            updated_at = now(),
            updated_by = EXCLUDED.updated_by
        RETURNING last_value INTO v_next_val;
    END IF;

    v_sep := COALESCE(v_config.separator, '-');
    IF COALESCE(v_config.prefix, '') <> '' THEN
        v_parts := array_append(v_parts, upper(v_config.prefix));
    END IF;

    FOR v_segment IN SELECT value FROM jsonb_array_elements(v_config.segments)
    LOOP
        v_type := v_segment ->> 'type';
        v_format := COALESCE(v_segment ->> 'format', '');
        v_optional := COALESCE((v_segment ->> 'optional')::boolean, false);
        v_part := NULL;

        IF v_type = 'tenant_code' THEN
            v_part := v_tenant_code;
        ELSIF v_type = 'company_code' THEN
            v_part := v_company_code;
        ELSIF v_type = 'branch_code' THEN
            v_part := upper(NULLIF(p_branch_code, ''));
        ELSIF v_type IN ('year', 'fiscal_year') THEN
            v_part := CASE WHEN v_format = 'YY' THEN right(v_year::text, 2) ELSE v_year::text END;
        ELSIF v_type = 'period' THEN
            v_part := CASE WHEN v_format = 'MM' THEN lpad(v_period::text, 2, '0') ELSE v_period::text END;
        ELSIF v_type = 'quarter' THEN
            v_part := CASE WHEN v_format = 'Q' THEN 'Q' || v_quarter::text ELSE v_quarter::text END;
        ELSIF v_type = 'sequence' THEN
            v_padding := COALESCE(NULLIF((v_segment ->> 'padding')::integer, 0), 5);
            v_part := lpad(v_next_val::text, GREATEST(v_padding, 1), '0');
        ELSIF v_type IN ('static', 'literal') THEN
            v_part := v_segment ->> 'value';
        END IF;

        IF v_part IS NULL OR btrim(v_part) = '' THEN
            IF NOT v_optional THEN
                RAISE EXCEPTION 'Required numbering segment % resolved empty for entity %.', v_type, p_entity_code
                    USING ERRCODE = 'check_violation';
            END IF;
        ELSE
            v_parts := array_append(v_parts, v_part);
        END IF;
    END LOOP;

    SELECT string_agg(part, v_sep)
      INTO v_doc_no
      FROM unnest(v_parts) AS p(part)
     WHERE part IS NOT NULL AND btrim(part) <> '';

    IF v_doc_no IS NULL OR btrim(v_doc_no) = '' THEN
        RAISE EXCEPTION 'Entity numbering produced an empty value for %.', p_entity_code
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_config.max_length IS NOT NULL AND length(v_doc_no) > v_config.max_length THEN
        RAISE EXCEPTION 'Generated number % exceeds max_length % for entity %.',
            v_doc_no, v_config.max_length, p_entity_code
            USING ERRCODE = 'string_data_right_truncation';
    END IF;

    IF v_config.allowed_chars = 'upper_alnum_dash' AND v_doc_no !~ '^[A-Z0-9-]+$' THEN
        RAISE EXCEPTION 'Generated number % violates allowed_chars upper_alnum_dash.', v_doc_no
            USING ERRCODE = 'check_violation';
    ELSIF v_config.allowed_chars = 'alnum_dash' AND v_doc_no !~ '^[A-Za-z0-9-]+$' THEN
        RAISE EXCEPTION 'Generated number % violates allowed_chars alnum_dash.', v_doc_no
            USING ERRCODE = 'check_violation';
    ELSIF v_config.allowed_chars NOT IN ('upper_alnum_dash','alnum_dash','any')
       AND v_doc_no !~ v_config.allowed_chars THEN
        RAISE EXCEPTION 'Generated number % violates allowed_chars regex %.', v_doc_no, v_config.allowed_chars
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN v_doc_no;
END;
$$;

COMMENT ON FUNCTION control.next_entity_number(uuid, text, text, uuid, smallint, smallint, text, date) IS
    'Canonical entity-number generator. Reads control.entity_numbering_config, increments '
    'control.entity_numbering_counter, and renders configured segments.';


-- ============================================================================
-- BANK ENGINE — resolve_bank_format_rule
-- ============================================================================

CREATE OR REPLACE FUNCTION control.resolve_bank_format_rule(
    p_tenant_id         uuid,
    p_country_code      character(2),
    p_payment_network   text,
    p_direction         text            DEFAULT 'OUTBOUND',
    p_currency_code     character(3)    DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_rule RECORD;
BEGIN
    IF p_tenant_id IS NULL OR p_country_code IS NULL OR p_payment_network IS NULL THEN
        RETURN jsonb_build_object(
            'found', false,
            'explanation', 'p_tenant_id, p_country_code, and p_payment_network are required'
        );
    END IF;

    PERFORM master.fn_require_tenant_session(p_tenant_id);

    SELECT * INTO v_rule
    FROM control.bank_format_rule
    WHERE status = 'active'
      AND country_code = p_country_code
      AND payment_network = p_payment_network
      AND direction IN (p_direction, 'BOTH')
      AND (currency_code IS NULL OR currency_code = p_currency_code)
      AND (tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY
        CASE WHEN tenant_id = p_tenant_id THEN 0 ELSE 1 END,
        CASE WHEN currency_code IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN direction = p_direction THEN 0 ELSE 1 END,
        priority DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'found', false,
            'explanation', format('No rule for country=%s, network=%s, direction=%s',
                p_country_code, p_payment_network, p_direction)
        );
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'rule_id', v_rule.id, 'code', v_rule.code,
        'account_id_type', v_rule.account_id_type,
        'bank_id_type', v_rule.bank_id_type,
        'is_account_id_required', v_rule.is_account_id_required,
        'is_bank_id_required', v_rule.is_bank_id_required,
        'is_bic_allowed', v_rule.is_bic_allowed,
        'is_bic_required', v_rule.is_bic_required,
        'is_branch_code_required', v_rule.is_branch_code_required,
        'is_national_bank_code_required', v_rule.is_national_bank_code_required,
        'account_pattern', v_rule.account_pattern,
        'bank_id_pattern', v_rule.bank_id_pattern,
        'is_checksum_validated', v_rule.is_checksum_validated,
        'tenant_override', (v_rule.tenant_id IS NOT NULL)
    );
END;
$$;

COMMENT ON FUNCTION control.resolve_bank_format_rule IS
    'Resolves bank format rule for country + payment network + direction. '
    'Requires active tenant session. Ranking: tenant > global, '
    'currency-specific > agnostic, direction-specific > BOTH, priority DESC.';


-- ============================================================================
-- PAYMENT METHOD ENGINE — Guard Functions + Resolver
-- ============================================================================

-- Guard: company policy bank_account_link must belong to the same company
CREATE OR REPLACE FUNCTION control.trg_pmcp_validate_bank_link_company()
RETURNS trigger LANGUAGE plpgsql SET search_path = control, master AS $$
DECLARE
    v_link_owner_type text;
    v_link_owner_id   uuid;
BEGIN
    IF NEW.bank_account_link_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT owner_type, owner_id
    INTO v_link_owner_type, v_link_owner_id
    FROM master.bank_account_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.bank_account_link_id;

    IF v_link_owner_type IS NULL THEN
        RAISE EXCEPTION
            'payment_method_company_policy: bank_account_link_id (%) not found',
            NEW.bank_account_link_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_link_owner_type <> 'company_code' THEN
        RAISE EXCEPTION
            'payment_method_company_policy: bank_account_link_id (%) has owner_type "%" '
            '— must be "company_code" for company policy',
            NEW.bank_account_link_id, v_link_owner_type
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_link_owner_id <> NEW.company_code_id THEN
        RAISE EXCEPTION
            'payment_method_company_policy: bank_account_link belongs to company (%) '
            'but policy is for company (%). Must match.',
            v_link_owner_id, NEW.company_code_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_pmcp_validate_bank_link_company IS
    'Validates that the preferred bank_account_link on a company policy belongs '
    'to the same company_code and is a company_code-owned link.';


-- Resolver: resolve_bank_interface
CREATE OR REPLACE FUNCTION control.resolve_bank_interface(
    p_tenant_id                 uuid,
    p_payment_method_id         uuid,
    p_direction                 text            DEFAULT 'OUTBOUND',
    p_company_code_id           uuid            DEFAULT NULL,
    p_bank_account_link_id      uuid            DEFAULT NULL,
    p_currency_code             character(3)    DEFAULT NULL,
    p_counterparty_country_code character(2)    DEFAULT NULL,
    p_payment_network           text            DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_binding RECORD;
BEGIN
    IF p_tenant_id IS NULL OR p_payment_method_id IS NULL THEN
        RETURN jsonb_build_object(
            'found', false,
            'explanation', 'p_tenant_id and p_payment_method_id are required'
        );
    END IF;

    PERFORM master.fn_require_tenant_session(p_tenant_id);

    SELECT b.*, ip.code AS profile_code, ip.name AS profile_name,
           ip.interface_type, ip.file_format_code, ip.provider_code
    INTO v_binding
    FROM control.payment_method_interface_binding b
    JOIN control.bank_interface_profile ip
        ON ip.tenant_id = b.tenant_id AND ip.id = b.bank_interface_profile_id
        AND ip.status = 'active'
    WHERE b.tenant_id = p_tenant_id
      AND b.payment_method_id = p_payment_method_id
      AND b.status = 'active'
      AND b.direction IN (p_direction, 'BOTH')
      AND b.effective_from <= CURRENT_DATE
      AND (b.effective_until IS NULL OR b.effective_until > CURRENT_DATE)
      AND (b.company_code_id IS NULL OR b.company_code_id = p_company_code_id)
      AND (b.bank_account_link_id IS NULL OR b.bank_account_link_id = p_bank_account_link_id)
      AND (b.currency_code IS NULL OR b.currency_code = p_currency_code)
      AND (b.counterparty_country_code IS NULL OR b.counterparty_country_code = p_counterparty_country_code)
      AND (b.payment_network IS NULL OR b.payment_network = p_payment_network)
    ORDER BY
        CASE WHEN b.company_code_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN b.bank_account_link_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN b.currency_code IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN b.counterparty_country_code IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN b.payment_network IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN b.direction = p_direction THEN 0 ELSE 1 END,
        b.priority DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'found', false,
            'explanation', format('No interface binding for method=%s, direction=%s',
                p_payment_method_id, p_direction)
        );
    END IF;

    RETURN jsonb_build_object(
        'found',                    true,
        'binding_id',               v_binding.id,
        'bank_interface_profile_id', v_binding.bank_interface_profile_id,
        'profile_code',             v_binding.profile_code,
        'profile_name',             v_binding.profile_name,
        'interface_type',           v_binding.interface_type,
        'file_format_code',         v_binding.file_format_code,
        'provider_code',            v_binding.provider_code
    );
END;
$$;

COMMENT ON FUNCTION control.resolve_bank_interface IS
    'Resolves the best-matching bank interface profile for a payment execution '
    'context. Priority/specificity ranking: company > bank > currency > country '
    '> network > direction > explicit priority. Requires tenant session.';


-- ══════════════════════════════════════════════════════════════════════════════
-- ASSET ENGINE — Functions
-- ══════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- control.trg_acbp_validate_book_code()
-- Validates book_code is assigned to the policy's company_code_id via
-- master.company_code_book_assignment. Checking only ledger_book existence
-- would allow a company to reference another company's statutory book.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION control.trg_acbp_validate_book_code()
RETURNS trigger LANGUAGE plpgsql STABLE
SET search_path = control, master, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM master.ledger_book
        WHERE tenant_id = NEW.tenant_id AND code = NEW.book_code
    ) THEN
        RAISE EXCEPTION
            'asset_class_book_policy: book_code "%" not found in master.ledger_book for tenant %',
            NEW.book_code, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM master.company_code_book_assignment ba
        JOIN master.ledger_book lb
          ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
        WHERE ba.tenant_id       = NEW.tenant_id
          AND ba.company_code_id = NEW.company_code_id
          AND lb.code            = NEW.book_code
          AND ba.status          = 'active'
    ) THEN
        RAISE EXCEPTION
            'asset_class_book_policy: book "%" is not assigned to company_code_id % — '
            'check master.company_code_book_assignment',
            NEW.book_code, NEW.company_code_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- control.trg_acbp_class_consistency()
-- Enforces: land/cwip class → policy is_depreciable = false
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION control.trg_acbp_class_consistency()
RETURNS trigger LANGUAGE plpgsql STABLE
SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_nature text;
BEGIN
    SELECT asset_nature INTO v_nature
    FROM master.asset_class
    WHERE id = NEW.asset_class_id AND tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'asset_class % not found for tenant %',
            NEW.asset_class_id, NEW.tenant_id;
    END IF;

    IF v_nature IN ('land', 'cwip') AND NEW.is_depreciable = true THEN
        RAISE EXCEPTION
            'asset_class_book_policy: class nature "%" requires is_depreciable = false',
            v_nature
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- control.trg_acbp_validate_posting_roles()
-- Validates posting role code format: lowercase alphanumeric + underscore.
-- Mapping resolution (role → GL account) deferred to runtime because the
-- role-account map may not be populated at DDL/seed time.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION control.trg_acbp_validate_posting_roles()
RETURNS trigger LANGUAGE plpgsql STABLE
SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_roles text[];
    v_role  text;
BEGIN
    v_roles := ARRAY[
        NEW.acquisition_posting_role_code,
        NEW.accum_depr_posting_role_code,
        NEW.depr_expense_posting_role_code,
        NEW.gain_loss_posting_role_code,
        NEW.impairment_expense_posting_role_code,
        NEW.impairment_reserve_posting_role_code,
        NEW.revaluation_surplus_posting_role_code,
        NEW.revaluation_loss_posting_role_code,
        NEW.cwip_posting_role_code
    ];

    FOREACH v_role IN ARRAY v_roles LOOP
        IF v_role IS NOT NULL THEN
            IF v_role !~ '^[a-z][a-z0-9_]{2,63}$' THEN
                RAISE EXCEPTION
                    'asset_class_book_policy: posting role code "%" does not match '
                    'naming convention (lowercase, 3-64 chars, [a-z0-9_])',
                    v_role
                    USING ERRCODE = 'check_violation';
            END IF;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_acbp_validate_posting_roles IS
    'Validates posting role code format on asset_class_book_policy. '
    'Mapping resolution check (role → GL account) is deferred to seed assertions '
    'and runtime because the role-account map may not be populated at DDL time.';


-- ────────────────────────────────────────────────────────────────────────────
-- control.resolve_asset_class_book_policy()
-- Picks the winning policy row for a given (class, book, date).
-- Resolution: active + effective_from <= date + effective_to covers date
--   → order by effective_from DESC (latest applicable version wins)
--   → then by priority DESC (tiebreaker)
-- Returns JSONB with full policy snapshot. Hard failure if no match.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION control.resolve_asset_class_book_policy(
    p_tenant_id       uuid,
    p_company_code_id uuid,
    p_asset_class_id  uuid,
    p_book_code       text,
    p_as_of_date      date DEFAULT CURRENT_DATE
) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_policy control.asset_class_book_policy%ROWTYPE;
BEGIN
    SELECT * INTO v_policy
    FROM control.asset_class_book_policy
    WHERE tenant_id       = p_tenant_id
      AND company_code_id = p_company_code_id
      AND asset_class_id  = p_asset_class_id
      AND book_code       = p_book_code
      AND is_active       = true
      AND effective_from  <= p_as_of_date
      AND (effective_to IS NULL OR effective_to >= p_as_of_date)
    ORDER BY effective_from DESC, priority DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'No active asset_class_book_policy found for class=%, book=%, company=%, date=%',
            p_asset_class_id, p_book_code, p_company_code_id, p_as_of_date
            USING ERRCODE = 'no_data_found';
    END IF;

    RETURN jsonb_build_object(
        'policy_id',                    v_policy.id,
        'effective_from',               v_policy.effective_from,
        'is_depreciable',               v_policy.is_depreciable,
        'depreciation_method',          v_policy.depreciation_method,
        'useful_life_months',           v_policy.useful_life_months,
        'residual_value_mode',          v_policy.residual_value_mode,
        'residual_value_amount',        v_policy.residual_value_amount,
        'residual_value_pct',           v_policy.residual_value_pct,
        'convention',                   v_policy.convention,
        'prorate_basis',                v_policy.prorate_basis,
        'depreciation_start_rule',      v_policy.depreciation_start_rule,
        'method_params',                v_policy.method_params,
        'allow_manual_life_override',   v_policy.allow_manual_life_override,
        'allow_manual_residual_override', v_policy.allow_manual_residual_override,
        'allow_manual_method_override', v_policy.allow_manual_method_override,
        'acquisition_posting_role_code',      v_policy.acquisition_posting_role_code,
        'accum_depr_posting_role_code',       v_policy.accum_depr_posting_role_code,
        'depr_expense_posting_role_code',     v_policy.depr_expense_posting_role_code,
        'gain_loss_posting_role_code',        v_policy.gain_loss_posting_role_code,
        'impairment_expense_posting_role_code', v_policy.impairment_expense_posting_role_code,
        'impairment_reserve_posting_role_code', v_policy.impairment_reserve_posting_role_code,
        'revaluation_surplus_posting_role_code', v_policy.revaluation_surplus_posting_role_code,
        'revaluation_loss_posting_role_code', v_policy.revaluation_loss_posting_role_code,
        'cwip_posting_role_code',             v_policy.cwip_posting_role_code,
        'resolved',                     true);
END;
$$;

COMMENT ON FUNCTION control.resolve_asset_class_book_policy IS
    'Resolves the winning book policy for asset_book creation. '
    'Filters: active + effective_from <= date + effective_to covers date. '
    'Order: latest effective_from DESC, then highest priority DESC. '
    'Raises no_data_found if no policy matches — hard failure by design.';


-- ────────────────────────────────────────────────────────────────────────────
-- ────────────────────────────────────────────────────────────────────────────

-- ---------------------------------------------------------------------------
-- control.provision_asset_policies()
-- Stamps platform/tenant asset policy templates into concrete
-- control.asset_class_book_policy rows for one company or all active companies.
-- Template rows use book_category; provisioning resolves that to the company's
-- assigned ledger_book.code at the requested effective date.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION control.provision_asset_policies(
    p_tenant_id          uuid,
    p_company_code_id    uuid DEFAULT NULL,
    p_template_code      text DEFAULT 'IFRS_DEFAULT',
    p_effective_from     date DEFAULT CURRENT_DATE,
    p_created_by         uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    p_overwrite_existing boolean DEFAULT false
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_template_count int;
    v_company_count  int;
    v_rows_written   int;
    v_missing        text;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'provision_asset_policies: p_tenant_id is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_template_code IS NULL OR btrim(p_template_code) = '' THEN
        RAISE EXCEPTION 'provision_asset_policies: p_template_code is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_effective_from IS NULL THEN
        RAISE EXCEPTION 'provision_asset_policies: p_effective_from is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    WITH selected_templates AS (
        SELECT *
        FROM (
            SELECT t.*,
                   row_number() OVER (
                       PARTITION BY t.asset_class_code, t.book_category
                       ORDER BY
                           CASE WHEN t.tenant_id = p_tenant_id THEN 0 ELSE 1 END,
                           t.effective_from DESC,
                           t.priority DESC
                   ) AS rn
            FROM control.asset_class_book_policy_template t
            WHERE (t.tenant_id = p_tenant_id OR t.tenant_id IS NULL)
              AND t.template_code = p_template_code
              AND t.is_active = true
              AND t.effective_from <= p_effective_from
              AND (t.effective_to IS NULL OR t.effective_to >= p_effective_from)
        ) ranked
        WHERE rn = 1
    )
    SELECT count(*) INTO v_template_count
    FROM selected_templates;

    IF v_template_count = 0 THEN
        RAISE EXCEPTION
            'provision_asset_policies: no active template rows found for template_code=%, tenant=%, effective_from=%',
            p_template_code, p_tenant_id, p_effective_from
            USING ERRCODE = 'no_data_found';
    END IF;

    SELECT count(*) INTO v_company_count
    FROM master.company_code cc
    WHERE cc.tenant_id = p_tenant_id
      AND cc.status = 'active'
      AND (p_company_code_id IS NULL OR cc.id = p_company_code_id);

    IF v_company_count = 0 THEN
        RAISE EXCEPTION
            'provision_asset_policies: no active company_code found for tenant=%, company_code_id=%',
            p_tenant_id, p_company_code_id
            USING ERRCODE = 'no_data_found';
    END IF;

    WITH selected_templates AS (
        SELECT *
        FROM (
            SELECT t.*,
                   row_number() OVER (
                       PARTITION BY t.asset_class_code, t.book_category
                       ORDER BY
                           CASE WHEN t.tenant_id = p_tenant_id THEN 0 ELSE 1 END,
                           t.effective_from DESC,
                           t.priority DESC
                   ) AS rn
            FROM control.asset_class_book_policy_template t
            WHERE (t.tenant_id = p_tenant_id OR t.tenant_id IS NULL)
              AND t.template_code = p_template_code
              AND t.is_active = true
              AND t.effective_from <= p_effective_from
              AND (t.effective_to IS NULL OR t.effective_to >= p_effective_from)
        ) ranked
        WHERE rn = 1
    )
    SELECT string_agg(DISTINCT t.asset_class_code, ', ' ORDER BY t.asset_class_code)
    INTO v_missing
    FROM selected_templates t
    LEFT JOIN master.asset_class ac
      ON ac.tenant_id = p_tenant_id
     AND ac.code = t.asset_class_code
     AND ac.is_active = true
    WHERE ac.id IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION
            'provision_asset_policies: template references missing asset_class codes for tenant %: %',
            p_tenant_id, v_missing
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    WITH selected_templates AS (
        SELECT *
        FROM (
            SELECT t.*,
                   row_number() OVER (
                       PARTITION BY t.asset_class_code, t.book_category
                       ORDER BY
                           CASE WHEN t.tenant_id = p_tenant_id THEN 0 ELSE 1 END,
                           t.effective_from DESC,
                           t.priority DESC
                   ) AS rn
            FROM control.asset_class_book_policy_template t
            WHERE (t.tenant_id = p_tenant_id OR t.tenant_id IS NULL)
              AND t.template_code = p_template_code
              AND t.is_active = true
              AND t.effective_from <= p_effective_from
              AND (t.effective_to IS NULL OR t.effective_to >= p_effective_from)
        ) ranked
        WHERE rn = 1
    ),
    selected_categories AS (
        SELECT DISTINCT book_category FROM selected_templates
    ),
    selected_companies AS (
        SELECT cc.id, cc.code
        FROM master.company_code cc
        WHERE cc.tenant_id = p_tenant_id
          AND cc.status = 'active'
          AND (p_company_code_id IS NULL OR cc.id = p_company_code_id)
    )
    SELECT string_agg(cc.code || ':' || sc.book_category, ', ' ORDER BY cc.code, sc.book_category)
    INTO v_missing
    FROM selected_companies cc
    CROSS JOIN selected_categories sc
    WHERE NOT EXISTS (
        SELECT 1
        FROM master.company_code_book_assignment ba
        JOIN master.ledger_book lb
          ON lb.id = ba.book_id
         AND lb.tenant_id = ba.tenant_id
        WHERE ba.tenant_id = p_tenant_id
          AND ba.company_code_id = cc.id
          AND ba.status = 'active'
          AND ba.effective_from <= p_effective_from
          AND (ba.effective_to IS NULL OR ba.effective_to >= p_effective_from)
          AND lb.status = 'active'
          AND lb.category = sc.book_category
    );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION
            'provision_asset_policies: missing active company book assignment(s) for %',
            v_missing
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    WITH selected_templates AS (
        SELECT *
        FROM (
            SELECT t.*,
                   row_number() OVER (
                       PARTITION BY t.asset_class_code, t.book_category
                       ORDER BY
                           CASE WHEN t.tenant_id = p_tenant_id THEN 0 ELSE 1 END,
                           t.effective_from DESC,
                           t.priority DESC
                   ) AS rn
            FROM control.asset_class_book_policy_template t
            WHERE (t.tenant_id = p_tenant_id OR t.tenant_id IS NULL)
              AND t.template_code = p_template_code
              AND t.is_active = true
              AND t.effective_from <= p_effective_from
              AND (t.effective_to IS NULL OR t.effective_to >= p_effective_from)
        ) ranked
        WHERE rn = 1
    ),
    selected_companies AS (
        SELECT cc.id, cc.code, cc.functional_currency
        FROM master.company_code cc
        WHERE cc.tenant_id = p_tenant_id
          AND cc.status = 'active'
          AND (p_company_code_id IS NULL OR cc.id = p_company_code_id)
    ),
    selected_categories AS (
        SELECT DISTINCT book_category FROM selected_templates
    ),
    resolved_books AS (
        SELECT DISTINCT ON (cc.id, sc.book_category)
            cc.id AS company_code_id,
            sc.book_category,
            lb.code AS book_code
        FROM selected_companies cc
        CROSS JOIN selected_categories sc
        JOIN master.company_code_book_assignment ba
          ON ba.tenant_id = p_tenant_id
         AND ba.company_code_id = cc.id
         AND ba.status = 'active'
         AND ba.effective_from <= p_effective_from
         AND (ba.effective_to IS NULL OR ba.effective_to >= p_effective_from)
        JOIN master.ledger_book lb
          ON lb.id = ba.book_id
         AND lb.tenant_id = ba.tenant_id
         AND lb.status = 'active'
         AND lb.category = sc.book_category
        ORDER BY cc.id, sc.book_category, ba.priority DESC, lb.is_primary DESC, lb.sort_order ASC, lb.code ASC
    ),
    currency_thresholds(currency_code, base_threshold) AS (
        VALUES
            ('MYR'::character(3), 5000::numeric(18,4)),
            ('QAR'::character(3), 5000::numeric(18,4)),
            ('SAR'::character(3), 5000::numeric(18,4)),
            ('AED'::character(3), 5000::numeric(18,4)),
            ('USD'::character(3), 1000::numeric(18,4)),
            ('SGD'::character(3), 1500::numeric(18,4)),
            ('INR'::character(3), 50000::numeric(18,4)),
            ('CAD'::character(3), 1000::numeric(18,4)),
            ('EUR'::character(3), 1000::numeric(18,4)),
            ('TWD'::character(3), 30000::numeric(18,4)),
            ('ZAR'::character(3), 10000::numeric(18,4)),
            ('GBP'::character(3), 1000::numeric(18,4)),
            ('JPY'::character(3), 100000::numeric(18,4)),
            ('PHP'::character(3), 50000::numeric(18,4))
    )
    INSERT INTO control.asset_class_book_policy (
        tenant_id, company_code_id, asset_class_id,
        book_code,
        capitalization_threshold, capitalization_currency,
        priority, effective_from,
        is_depreciable, depreciation_method, useful_life_months,
        residual_value_mode, residual_value_amount, residual_value_pct,
        convention, prorate_basis, depreciation_start_rule, method_params,
        allow_manual_life_override, allow_manual_residual_override, allow_manual_method_override,
        acquisition_posting_role_code, accum_depr_posting_role_code,
        depr_expense_posting_role_code, gain_loss_posting_role_code,
        impairment_expense_posting_role_code, impairment_reserve_posting_role_code,
        revaluation_surplus_posting_role_code, revaluation_loss_posting_role_code,
        cwip_posting_role_code,
        capitalization_event_code, disposal_event_code, depreciation_event_code,
        impairment_event_code, revaluation_event_code,
        metadata, status, created_by
    )
    SELECT
        p_tenant_id,
        cc.id,
        ac.id,
        rb.book_code,
        COALESCE(ct.base_threshold, 1000::numeric(18,4)) * t.capitalization_threshold_multiplier,
        cc.functional_currency,
        t.priority,
        p_effective_from,
        t.is_depreciable,
        t.depreciation_method,
        t.useful_life_months,
        t.residual_value_mode,
        t.residual_value_amount,
        t.residual_value_pct,
        t.convention,
        t.prorate_basis,
        t.depreciation_start_rule,
        t.method_params,
        t.allow_manual_life_override,
        t.allow_manual_residual_override,
        t.allow_manual_method_override,
        t.acquisition_posting_role_code,
        t.accum_depr_posting_role_code,
        t.depr_expense_posting_role_code,
        t.gain_loss_posting_role_code,
        t.impairment_expense_posting_role_code,
        t.impairment_reserve_posting_role_code,
        t.revaluation_surplus_posting_role_code,
        t.revaluation_loss_posting_role_code,
        t.cwip_posting_role_code,
        t.capitalization_event_code,
        t.disposal_event_code,
        t.depreciation_event_code,
        t.impairment_event_code,
        t.revaluation_event_code,
        t.metadata || jsonb_build_object(
            '_provision', jsonb_build_object(
                'function', 'control.provision_asset_policies',
                'template_id', t.id,
                'template_code', t.template_code,
                'framework', t.framework,
                'asset_class_code', t.asset_class_code,
                'book_category', t.book_category,
                'source_note', t.source_note,
                'useful_life_min_months', t.useful_life_min_months,
                'useful_life_max_months', t.useful_life_max_months,
                'provisioned_at', now()::text
            )
        ),
        'active',
        p_created_by
    FROM selected_templates t
    JOIN master.asset_class ac
      ON ac.tenant_id = p_tenant_id
     AND ac.code = t.asset_class_code
     AND ac.is_active = true
    JOIN selected_companies cc ON true
    JOIN resolved_books rb
      ON rb.company_code_id = cc.id
     AND rb.book_category = t.book_category
    LEFT JOIN currency_thresholds ct
      ON ct.currency_code = cc.functional_currency
    ON CONFLICT (tenant_id, company_code_id, asset_class_id, book_code, effective_from)
    DO UPDATE SET
        capitalization_threshold          = EXCLUDED.capitalization_threshold,
        capitalization_currency           = EXCLUDED.capitalization_currency,
        priority                          = EXCLUDED.priority,
        is_depreciable                    = EXCLUDED.is_depreciable,
        depreciation_method               = EXCLUDED.depreciation_method,
        useful_life_months                = EXCLUDED.useful_life_months,
        residual_value_mode               = EXCLUDED.residual_value_mode,
        residual_value_amount             = EXCLUDED.residual_value_amount,
        residual_value_pct                = EXCLUDED.residual_value_pct,
        convention                        = EXCLUDED.convention,
        prorate_basis                     = EXCLUDED.prorate_basis,
        depreciation_start_rule           = EXCLUDED.depreciation_start_rule,
        method_params                     = EXCLUDED.method_params,
        allow_manual_life_override        = EXCLUDED.allow_manual_life_override,
        allow_manual_residual_override    = EXCLUDED.allow_manual_residual_override,
        allow_manual_method_override      = EXCLUDED.allow_manual_method_override,
        acquisition_posting_role_code     = EXCLUDED.acquisition_posting_role_code,
        accum_depr_posting_role_code      = EXCLUDED.accum_depr_posting_role_code,
        depr_expense_posting_role_code    = EXCLUDED.depr_expense_posting_role_code,
        gain_loss_posting_role_code       = EXCLUDED.gain_loss_posting_role_code,
        impairment_expense_posting_role_code  = EXCLUDED.impairment_expense_posting_role_code,
        impairment_reserve_posting_role_code  = EXCLUDED.impairment_reserve_posting_role_code,
        revaluation_surplus_posting_role_code = EXCLUDED.revaluation_surplus_posting_role_code,
        revaluation_loss_posting_role_code    = EXCLUDED.revaluation_loss_posting_role_code,
        cwip_posting_role_code            = EXCLUDED.cwip_posting_role_code,
        capitalization_event_code         = EXCLUDED.capitalization_event_code,
        disposal_event_code               = EXCLUDED.disposal_event_code,
        depreciation_event_code           = EXCLUDED.depreciation_event_code,
        impairment_event_code             = EXCLUDED.impairment_event_code,
        revaluation_event_code            = EXCLUDED.revaluation_event_code,
        metadata                          = EXCLUDED.metadata,
        updated_at                        = now(),
        updated_by                        = p_created_by
    WHERE p_overwrite_existing
       OR control.asset_class_book_policy.metadata->'_provision'->>'template_code' = p_template_code;

    GET DIAGNOSTICS v_rows_written = ROW_COUNT;

    RETURN jsonb_build_object(
        'template_code', p_template_code,
        'tenant_id', p_tenant_id,
        'company_code_id', p_company_code_id,
        'effective_from', p_effective_from,
        'template_rows', v_template_count,
        'company_count', v_company_count,
        'rows_written', v_rows_written,
        'overwrite_existing', p_overwrite_existing
    );
END;
$$;

COMMENT ON FUNCTION control.provision_asset_policies(uuid, uuid, text, date, uuid, boolean) IS
    'Provisions concrete asset_class_book_policy rows from asset_class_book_policy_template. '
    'Resolves template book_category to the active assigned ledger_book.code per company. '
    'By default updates only rows previously provisioned from the same template; '
    'p_overwrite_existing=true refreshes matching policy rows unconditionally.';


-- ---------------------------------------------------------------------------
-- control.resolve_posting_role_account()
-- Generic resolver: maps a posting_role_code to a GL account UUID for a
-- given company + book + date. Called by control.resolve_entry_account().
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION control.resolve_posting_role_account(
    p_tenant_id       uuid,
    p_role_code       text,
    p_company_code_id uuid,
    p_book_code       text,
    p_as_of_date      date DEFAULT CURRENT_DATE
) RETURNS uuid
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = control, master, pg_temp
AS $$
DECLARE
    v_gl_account_id uuid;
BEGIN
    -- Phase 1: Look up from posting_role_account_map if it exists
    BEGIN
        SELECT gl_account_id INTO v_gl_account_id
        FROM control.posting_role_account_map
        WHERE tenant_id       = p_tenant_id
          AND role_code       = p_role_code
          AND company_code_id = p_company_code_id
          AND book_code       = p_book_code
          AND is_active       = true
          AND effective_from  <= p_as_of_date
          AND (effective_to IS NULL OR effective_to >= p_as_of_date)
        ORDER BY effective_from DESC
        LIMIT 1;
    EXCEPTION
        WHEN undefined_table THEN
            -- posting_role_account_map not yet created — return NULL
            v_gl_account_id := NULL;
    END;

    RETURN v_gl_account_id;
END;
$$;

COMMENT ON FUNCTION control.resolve_posting_role_account IS
    'Resolves a posting role code to a GL account UUID for a given company/book/date. '
    'Called by resolve_entry_account(). Returns NULL if no mapping found — '
    'caller is responsible for fallback handling. Phase 1 stub: looks up '
    'control.posting_role_account_map if it exists, otherwise returns NULL.';


-- ============================================================================
-- §  Entity binding validators (P1 — entity_name / target_entity integrity)
-- ============================================================================

-- control.trg_fn_validate_entity_binding()
-- Validates that entity_name on entity_lifecycle and entity_operation matches
-- a registered entity_code in control.entity.
--
-- Scope resolution:
--   1. Platform rows (NEW.tenant_id IS NULL) match any entity regardless of tenant.
--   2. Tenant-scoped rows match platform entities (entity.tenant_id IS NULL) OR
--      entities belonging to the same tenant.
-- Session-safe: no RLS or GUC dependency — safe during seeding and migrations.
CREATE OR REPLACE FUNCTION control.trg_fn_validate_entity_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path = control, pg_catalog AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM control.entity e
        WHERE e.entity_code = NEW.entity_name
          AND (
              NEW.tenant_id IS NULL
              OR e.tenant_id IS NULL
              OR e.tenant_id = NEW.tenant_id
          )
    ) THEN
        RAISE EXCEPTION
            '%.%: entity_name "%" does not match any registered entity_code',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.entity_name
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_fn_validate_entity_binding() IS
    'Validates entity_name against control.entity.entity_code. '
    'Resolves platform rows (entity_code with tenant_id IS NULL) always; '
    'tenant-scoped rows also resolve against their own tenant entities. '
    'Attached to entity_lifecycle and entity_operation BEFORE INSERT OR UPDATE.';


-- control.trg_fn_validate_target_entity()
-- Validates that entity_relation.target_entity matches a registered entity_code.
-- Platform-global: any entity (any tenant or platform-global) may be a relation target.
CREATE OR REPLACE FUNCTION control.trg_fn_validate_target_entity()
RETURNS trigger LANGUAGE plpgsql SET search_path = control, pg_catalog AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM control.entity WHERE entity_code = NEW.target_entity
    ) THEN
        RAISE EXCEPTION
            'control.entity_relation: target_entity "%" does not match any registered entity_code',
            NEW.target_entity
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_fn_validate_target_entity() IS
    'Validates entity_relation.target_entity against control.entity.entity_code. '
    'Platform-global: any registered entity (including tenant-owned) may be targeted. '
    'Attached to entity_relation BEFORE INSERT OR UPDATE OF target_entity.';

-- ============================================================================
-- §RES  Procurement Line Intent Resolution Engine (Phase 1 — Intake Pipeline)
--
-- Three functions implement the 3-step resolution chain called by
-- IntentResolutionService.ts:
--
--   Step 2 → control.resolve_commodity_category_policy()
--            Merges master.commodity_category base attributes with
--            control.commodity_category_buy_policy defaults.
--
--   Step 3 → control.resolve_classification_to_intent()
--            Walks commodity_classification_to_intent_rule rows in priority order,
--            evaluating condition_type against the transaction context.
--            Returns first match or FAILED.
--
--   Step 4 → control.resolve_intent_to_profile()
--            Checks intent_profile_override first (regulatory gate), then
--            walks intent_to_accounting_profile_rule with NULL-wildcard
--            predicate matching. Returns first match or FAILED.
--
-- All three functions return jsonb so a single SQL round-trip is sufficient.
-- CREATE OR REPLACE — safe to re-run.
-- ============================================================================

-- ── Step 2: commodity category policy ────────────────────────────────────────

DROP FUNCTION IF EXISTS control.resolve_spend_category_policy(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION control.resolve_commodity_category_policy(
    p_tenant_id             uuid,
    p_commodity_category_id uuid,
    p_company_code_id       uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = control, master
AS $$
DECLARE
    v_category record;
    v_policy record;
BEGIN
    SELECT cc.id, cc.code, cc.name,
           cc.is_classification_required, cc.is_hs_required,
           cc.is_regulated
    INTO   v_category
    FROM   master.commodity_category cc
    WHERE  cc.id        = p_commodity_category_id
      AND  cc.tenant_id = p_tenant_id
      AND  cc.is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'CATEGORY_NOT_FOUND');
    END IF;

    SELECT csp.mapping_mode,
           csp.business_intent_id,
           csp.capex_screening_threshold,
           csp.default_asset_class_id,
           csp.override_visibility,
           csp.override_is_classification_required,
           csp.override_is_hs_required,
           csp.override_is_regulated
    INTO   v_policy
    FROM   control.commodity_category_buy_policy csp
    WHERE  csp.tenant_id        = p_tenant_id
      AND  csp.commodity_category_id = p_commodity_category_id
      AND  csp.mapping_mode     = 'ALLOW'
      AND  csp.is_default       = true
      AND  csp.is_active        = true
      AND  csp.effective_from  <= CURRENT_DATE
      AND  (csp.effective_to IS NULL OR csp.effective_to >= CURRENT_DATE)
      AND  (
             (csp.scope_type = 'COMPANY'
              AND csp.company_code_id = p_company_code_id
              AND csp.scope_id = p_company_code_id)
             OR csp.scope_type = 'TENANT'
           )
    ORDER BY CASE WHEN csp.scope_type = 'COMPANY' THEN 0 ELSE 1 END,
             csp.effective_from DESC,
             csp.sort_order,
             csp.created_at DESC
    LIMIT  1;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'category_id',             p_commodity_category_id,
        'category_code',           v_category.code,
        'category_name',           v_category.name,
        'resolved_mapping_mode',   COALESCE(v_policy.mapping_mode, 'ALLOW'),
        'default_intent_id',       v_policy.business_intent_id,
        'capex_screening_threshold', v_policy.capex_screening_threshold,
        'asset_class_id',          v_policy.default_asset_class_id,
        'classification_required', COALESCE(v_policy.override_is_classification_required,
                                            v_category.is_classification_required),
        'hs_required',             COALESCE(v_policy.override_is_hs_required,
                                            v_category.is_hs_required),
        'is_regulated',            COALESCE(v_policy.override_is_regulated,
                                            v_category.is_regulated),
        'visibility',              v_policy.override_visibility
    ));
END;
$$;

COMMENT ON FUNCTION control.resolve_commodity_category_policy(uuid, uuid, uuid) IS
    'Step 2 of the procurement intake pipeline. Merges commodity_category base attributes '
    'with commodity_category_buy_policy overrides. Returns ALLOW/DENY mapping_mode, '
    'effective intent, capex threshold, and classification/HS requirement flags. '
    'Called by IntentResolutionService.ts.';

-- ── Step 3: classification → business intent ──────────────────────────────────

CREATE OR REPLACE FUNCTION control.resolve_classification_to_intent(
    p_tenant_id             uuid,
    p_classification_source text,
    p_classification_id     uuid,
    p_direction             text,
    p_flow_code             text,
    p_amount                numeric,
    p_currency_code         text,
    p_is_recurring          boolean,
    p_is_cross_border       boolean,
    p_is_intercompany       boolean,
    p_company_code_id       uuid,
    p_doc_type              text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = control
AS $$
DECLARE
    v_rule      record;
    v_count     smallint := 0;
    v_matched   boolean;
    v_threshold numeric;
    v_expl      text;
BEGIN
    FOR v_rule IN
        SELECT r.id, r.condition_type, r.condition_config,
               r.resolved_intent_id, r.resolved_domain,
               r.explanation_template, r.confidence, r.priority
        FROM   control.commodity_classification_to_intent_rule r
        WHERE  r.tenant_id              = p_tenant_id
          AND  r.classification_source  = p_classification_source
          AND  r.classification_id      = p_classification_id
          AND  r.is_active              = true
          AND  (r.effective_from IS NULL OR r.effective_from <= CURRENT_DATE)
          AND  (r.effective_to   IS NULL OR r.effective_to   >= CURRENT_DATE)
          AND  (r.direction IS NULL OR r.direction = p_direction)
          AND  (r.applies_to_flows IS NULL OR p_flow_code = ANY(r.applies_to_flows))
        ORDER  BY r.priority ASC
    LOOP
        v_count   := v_count + 1;
        v_matched := false;

        CASE v_rule.condition_type
        WHEN 'IS_RECURRING' THEN
            v_matched := (p_is_recurring = true);

        WHEN 'IS_ONE_TIME' THEN
            v_matched := (p_is_recurring IS NULL OR p_is_recurring = false);

        WHEN 'AMOUNT_ABOVE' THEN
            v_threshold := (v_rule.condition_config->>'threshold')::numeric;
            v_matched   := (p_amount IS NOT NULL AND p_amount > v_threshold);

        WHEN 'AMOUNT_BELOW' THEN
            v_threshold := (v_rule.condition_config->>'threshold')::numeric;
            v_matched   := (p_amount IS NOT NULL AND p_amount < v_threshold);

        WHEN 'CROSS_BORDER' THEN
            v_matched := (p_is_cross_border = true);

        WHEN 'COMPANY_MATCH' THEN
            v_matched := (p_company_code_id::text = v_rule.condition_config->>'company_code_id');

        WHEN 'DOC_TYPE_MATCH' THEN
            v_matched := (p_doc_type = v_rule.condition_config->>'doc_type');

        WHEN 'FLOW_MATCH' THEN
            v_matched := (p_flow_code = v_rule.condition_config->>'flow_code');

        WHEN 'FALLBACK' THEN
            v_matched := true;

        ELSE
            v_matched := false;
        END CASE;

        CONTINUE WHEN NOT v_matched;

        -- Build explanation, substituting template variables
        v_expl := COALESCE(v_rule.explanation_template, 'Matched rule ' || v_rule.id);
        v_expl := replace(v_expl, '{amount}',    COALESCE(p_amount::text, '0'));
        v_expl := replace(v_expl, '{threshold}', COALESCE(v_rule.condition_config->>'threshold', ''));
        v_expl := replace(v_expl, '{currency}',  COALESCE(p_currency_code, ''));

        RETURN jsonb_build_object(
            'matched',          true,
            'intent_id',        v_rule.resolved_intent_id,
            'domain',           v_rule.resolved_domain,
            'method',           'RULE_MATCH',
            'rule_id',          v_rule.id,
            'confidence',       v_rule.confidence,
            'explanation',      v_expl,
            'rules_evaluated',  v_count
        );
    END LOOP;

    RETURN jsonb_build_object(
        'matched',         false,
        'method',          'FAILED',
        'confidence',      0,
        'rules_evaluated', v_count
    );
END;
$$;

COMMENT ON FUNCTION control.resolve_classification_to_intent(
    uuid, text, uuid, text, text, numeric, text, boolean, boolean, boolean, uuid, text
) IS
    'Step 3 of the procurement intake pipeline. Evaluates commodity_classification_to_intent_rule '
    'rows for the given classification in priority order. Supports 16 condition types. '
    'Returns first match with explanation, or FAILED. Called by IntentResolutionService.ts.';

-- ── Step 4: business intent → accounting profile ──────────────────────────────

CREATE OR REPLACE FUNCTION control.resolve_intent_to_profile(
    p_tenant_id         uuid,
    p_intent_id         uuid,
    p_intent_domain     text,
    p_direction         text,
    p_flow_code         text,
    p_company_code_id   uuid,
    p_doc_type          text,
    p_currency_code     text,
    p_amount            numeric,
    p_is_cross_border   boolean,
    p_is_intercompany   boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = control
AS $$
DECLARE
    v_override record;
    v_rule     record;
BEGIN
    -- Regulatory overrides take precedence (approved governance gate)
    SELECT o.resolved_profile_config_id, o.reason
    INTO   v_override
    FROM   control.intent_profile_override o
    WHERE  o.tenant_id  = p_tenant_id
      AND  o.intent_id  = p_intent_id
      AND  o.status     = 'active'
      AND  (o.company_code_id IS NULL OR o.company_code_id = p_company_code_id)
      AND  (o.direction       IS NULL OR o.direction       = p_direction)
      AND  (o.flow_code       IS NULL OR o.flow_code       = p_flow_code)
    LIMIT  1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'matched',           true,
            'profile_config_id', v_override.resolved_profile_config_id,
            'method',            'OVERRIDE',
            'confidence',        1.0,
            'explanation',       COALESCE(v_override.reason, 'Regulatory override active')
        );
    END IF;

    -- Walk rule table; NULL predicate = wildcard (matches any value)
    SELECT r.resolved_profile_config_id, r.explanation_template,
           r.confidence, r.id
    INTO   v_rule
    FROM   control.intent_to_accounting_profile_rule r
    WHERE  r.tenant_id    = p_tenant_id
      AND  r.is_active    = true
      AND  (r.intent_id     IS NULL OR r.intent_id     = p_intent_id)
      AND  (r.intent_domain IS NULL OR r.intent_domain = p_intent_domain)
      AND  (r.direction     IS NULL OR r.direction     = p_direction)
      AND  (r.flow_code     IS NULL OR r.flow_code     = p_flow_code)
      AND  (r.company_code_id IS NULL OR r.company_code_id = p_company_code_id)
      AND  (r.doc_type      IS NULL OR r.doc_type      = p_doc_type)
      AND  (r.currency_code IS NULL OR r.currency_code = p_currency_code)
      AND  (r.is_cross_border IS NULL OR r.is_cross_border = p_is_cross_border)
      AND  (r.is_intercompany IS NULL OR r.is_intercompany = p_is_intercompany)
      AND  (r.min_amount IS NULL OR p_amount IS NULL OR p_amount >= r.min_amount)
      AND  (r.max_amount IS NULL OR p_amount IS NULL OR p_amount <= r.max_amount)
      AND  (r.effective_from IS NULL OR r.effective_from <= CURRENT_DATE)
      AND  (r.effective_to   IS NULL OR r.effective_to   >= CURRENT_DATE)
    ORDER  BY r.priority ASC
    LIMIT  1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'matched',           true,
            'profile_config_id', v_rule.resolved_profile_config_id,
            'method',            'RULE_MATCH',
            'rule_id',           v_rule.id,
            'confidence',        v_rule.confidence,
            'explanation',       v_rule.explanation_template
        );
    END IF;

    RETURN jsonb_build_object('matched', false, 'method', 'FAILED', 'confidence', 0);
END;
$$;

COMMENT ON FUNCTION control.resolve_intent_to_profile(
    uuid, uuid, text, text, text, uuid, text, text, numeric, boolean, boolean
) IS
    'Step 4 of the procurement intake pipeline. Checks regulatory intent_profile_override '
    'first, then walks intent_to_accounting_profile_rule with NULL-wildcard predicate '
    'matching. Returns first match or FAILED. Called by IntentResolutionService.ts.';
