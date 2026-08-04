-- ============================================================================
-- snapshot/05_functions.sql
-- Functions and procedures reconstructed from the live catalog; pre-constraint routines are excluded.
-- Generated from the live Neon database snapshot schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION snapshot.compile_lifecycle(p_lifecycle_id uuid, p_compiled_by uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'snapshot', 'control'
AS $function$
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
$function$;

COMMENT ON FUNCTION "snapshot".compile_lifecycle(p_lifecycle_id uuid, p_compiled_by uuid) IS 'Compiles a lifecycle definition into an immutable snapshot.lifecycle_version row. Builds denormalized JSON from all child tables, computes SHA-256 hash. Idempotent: returns existing version_id if definition unchanged. Updates control.lifecycle.definition_hash and version_no on success.';

CREATE OR REPLACE FUNCTION snapshot.compile_lifecycle_route(p_lifecycle_id uuid, p_compiled_by uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'snapshot', 'control'
AS $function$
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
$function$;

COMMENT ON FUNCTION "snapshot".compile_lifecycle_route(p_lifecycle_id uuid, p_compiled_by uuid) IS 'Compiles the full traversal graph for a lifecycle into snapshot.lifecycle_route. Builds reachable_from map, terminal_states, all_states, initial_state. UPSERT: replaces existing route on recompile.';

CREATE OR REPLACE FUNCTION snapshot.compile_status_route(p_tenant_id uuid, p_entity_name text, p_lifecycle_id uuid, p_compiled_by uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'snapshot', 'control'
AS $function$
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
$function$;

COMMENT ON FUNCTION "snapshot".compile_status_route(p_tenant_id uuid, p_entity_name text, p_lifecycle_id uuid, p_compiled_by uuid) IS 'Compiles the simplified O(1) status transition route for Pattern A/B entities. One row per (tenant, entity_name) in snapshot.status_route. Read by validate_status_transition(), guard_terminal_immutability(), guard_deletable_states() trigger functions.';

CREATE OR REPLACE FUNCTION snapshot.fn_capture_full(p_tenant_id uuid, p_entity_type text, p_entity_id uuid, p_document_code text, p_version_number integer, p_gate_event text, p_gate_event_kind text, p_activity_log_id uuid, p_header_json jsonb, p_lines_json jsonb, p_components_json jsonb, p_distributions_json jsonb, p_schedules_json jsonb, p_related_json jsonb, p_captured_by uuid, p_capture_source text DEFAULT 'transition_hook'::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_prev_id   uuid;
    v_prev_seq  int;
    v_payload   jsonb;
    v_hash      text;
    v_new_id    uuid;
BEGIN
    -- Find previous snapshot in this entity's chain (latest captured)
    SELECT id, chain_seq
      INTO v_prev_id, v_prev_seq
      FROM snapshot.document_snapshot
     WHERE tenant_id = p_tenant_id
       AND entity_type = p_entity_type
       AND entity_id = p_entity_id
     ORDER BY chain_seq DESC, captured_at DESC
     LIMIT 1;

    -- Canonical payload for hashing: ordered keys via jsonb_build_object
    v_payload := jsonb_build_object(
        'entity_type',        p_entity_type,
        'entity_id',          p_entity_id,
        'version_number',     COALESCE(p_version_number, 1),
        'gate_event',         p_gate_event,
        'gate_event_kind',    p_gate_event_kind,
        'header',             COALESCE(p_header_json,        '{}'::jsonb),
        'lines',              COALESCE(p_lines_json,         '[]'::jsonb),
        'components',         COALESCE(p_components_json,    '[]'::jsonb),
        'distributions',      COALESCE(p_distributions_json, '[]'::jsonb),
        'schedules',          COALESCE(p_schedules_json,     '[]'::jsonb),
        'related',            COALESCE(p_related_json,       '{}'::jsonb),
        'previous_snapshot_id', v_prev_id
    );

    v_hash := encode(digest(v_payload::text, 'sha256'), 'hex');

    INSERT INTO snapshot.document_snapshot (
        tenant_id, entity_type, entity_id, document_code, version_number,
        gate_event, gate_event_kind, activity_log_id,
        header_json, lines_json, components_json, distributions_json,
        schedules_json, related_json,
        payload_hash, previous_snapshot_id, chain_seq,
        captured_by, capture_source
    ) VALUES (
        p_tenant_id, p_entity_type, p_entity_id, p_document_code, COALESCE(p_version_number, 1),
        p_gate_event, p_gate_event_kind, p_activity_log_id,
        p_header_json, p_lines_json, p_components_json, p_distributions_json,
        p_schedules_json, p_related_json,
        v_hash, v_prev_id, COALESCE(v_prev_seq, 0) + 1,
        p_captured_by, p_capture_source
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$function$;

COMMENT ON FUNCTION "snapshot".fn_capture_full(p_tenant_id uuid, p_entity_type text, p_entity_id uuid, p_document_code text, p_version_number integer, p_gate_event text, p_gate_event_kind text, p_activity_log_id uuid, p_header_json jsonb, p_lines_json jsonb, p_components_json jsonb, p_distributions_json jsonb, p_schedules_json jsonb, p_related_json jsonb, p_captured_by uuid, p_capture_source text) IS 'Writes one snapshot.document_snapshot row. Looks up the previous snapshot for the entity to link the hash chain (previous_snapshot_id + chain_seq), stamps a SHA-256 payload_hash, and returns the new snapshot id. Caller supplies the serialised header / lines / components / distributions / schedules / related payloads — this function is entity-agnostic.';

CREATE OR REPLACE FUNCTION snapshot.fn_diff_snapshots(p_snapshot_a_id uuid, p_snapshot_b_id uuid)
 RETURNS TABLE(section text, path text, a_value jsonb, b_value jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_a snapshot.document_snapshot;
    v_b snapshot.document_snapshot;
BEGIN
    SELECT * INTO v_a FROM snapshot.document_snapshot WHERE id = p_snapshot_a_id LIMIT 1;
    SELECT * INTO v_b FROM snapshot.document_snapshot WHERE id = p_snapshot_b_id LIMIT 1;

    IF v_a.id IS NULL OR v_b.id IS NULL THEN
        RETURN;
    END IF;

    -- Top-level section diff: emit one row per section whose payload differs.
    -- Path-granular diff is deferred to the client (renderer has shape knowledge).
    RETURN QUERY
    SELECT s.section, s.section AS path, s.a_val, s.b_val
      FROM (VALUES
        ('header',        v_a.header_json,        v_b.header_json),
        ('lines',         v_a.lines_json,         v_b.lines_json),
        ('components',    v_a.components_json,    v_b.components_json),
        ('distributions', v_a.distributions_json, v_b.distributions_json),
        ('schedules',     v_a.schedules_json,     v_b.schedules_json),
        ('related',       v_a.related_json,       v_b.related_json)
      ) AS s(section, a_val, b_val)
     WHERE s.a_val IS DISTINCT FROM s.b_val;
END;
$function$;

COMMENT ON FUNCTION "snapshot".fn_diff_snapshots(p_snapshot_a_id uuid, p_snapshot_b_id uuid) IS 'Emits one row per top-level section (header / lines / components / distributions / schedules / related) whose payload differs between two snapshots. Path-granular diff is the renderer''s responsibility — it knows the entity-specific shape.';

CREATE OR REPLACE FUNCTION snapshot.fn_get_doc_at(p_tenant_id uuid, p_entity_type text, p_entity_id uuid, p_at timestamp with time zone)
 RETURNS snapshot.document_snapshot
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_row snapshot.document_snapshot;
BEGIN
    SELECT *
      INTO v_row
      FROM snapshot.document_snapshot
     WHERE tenant_id = p_tenant_id
       AND entity_type = p_entity_type
       AND entity_id = p_entity_id
       AND captured_at <= p_at
     ORDER BY captured_at DESC
     LIMIT 1;

    RETURN v_row;
END;
$function$;

COMMENT ON FUNCTION "snapshot".fn_get_doc_at(p_tenant_id uuid, p_entity_type text, p_entity_id uuid, p_at timestamp with time zone) IS 'Returns the document_snapshot row for (entity_type, entity_id) that was current at the supplied timestamp. If no snapshot existed before p_at, returns NULL row. STABLE so the planner can fold it into reporting queries.';

CREATE OR REPLACE FUNCTION snapshot.fn_verify_chain(p_tenant_id uuid, p_entity_type text, p_entity_id uuid)
 RETURNS TABLE(snapshot_id uuid, chain_seq integer, captured_at timestamp with time zone, expected_prev_id uuid, actual_prev_id uuid, chain_ok boolean)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    RETURN QUERY
    WITH chain AS (
        SELECT id, chain_seq, captured_at, previous_snapshot_id,
               LAG(id) OVER (ORDER BY chain_seq) AS prev_chain_id
          FROM snapshot.document_snapshot
         WHERE tenant_id = p_tenant_id
           AND entity_type = p_entity_type
           AND entity_id = p_entity_id
    )
    SELECT c.id,
           c.chain_seq,
           c.captured_at,
           c.prev_chain_id              AS expected_prev_id,
           c.previous_snapshot_id       AS actual_prev_id,
           (c.prev_chain_id IS NOT DISTINCT FROM c.previous_snapshot_id) AS chain_ok
      FROM chain c
     ORDER BY c.chain_seq;
END;
$function$;

COMMENT ON FUNCTION "snapshot".fn_verify_chain(p_tenant_id uuid, p_entity_type text, p_entity_id uuid) IS 'Walks the snapshot chain for (entity_type, entity_id) and yields one row per snapshot with chain_ok=false where previous_snapshot_id does not match the prior chain_seq''s id. Used by server/scripts/verify-snapshot-chain.ts.';

CREATE OR REPLACE FUNCTION snapshot.fn_verify_snapshot_hash(p_snapshot_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_row              snapshot.document_snapshot%ROWTYPE;
    v_payload          jsonb;
    v_recomputed_hash  text;
BEGIN
    SELECT * INTO v_row
      FROM snapshot.document_snapshot
     WHERE id = p_snapshot_id
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Mirror fn_capture_full §E key order and COALESCE defaults exactly.
    v_payload := jsonb_build_object(
        'entity_type',          v_row.entity_type,
        'entity_id',            v_row.entity_id,
        'version_number',       COALESCE(v_row.version_number, 1),
        'gate_event',           v_row.gate_event,
        'gate_event_kind',      v_row.gate_event_kind,
        'header',               COALESCE(v_row.header_json,        '{}'::jsonb),
        'lines',                COALESCE(v_row.lines_json,         '[]'::jsonb),
        'components',           COALESCE(v_row.components_json,    '[]'::jsonb),
        'distributions',        COALESCE(v_row.distributions_json, '[]'::jsonb),
        'schedules',            COALESCE(v_row.schedules_json,     '[]'::jsonb),
        'related',              COALESCE(v_row.related_json,       '{}'::jsonb),
        'previous_snapshot_id', v_row.previous_snapshot_id
    );

    v_recomputed_hash := encode(digest(v_payload::text, 'sha256'), 'hex');
    RETURN v_recomputed_hash = v_row.payload_hash;
END;
$function$;

COMMENT ON FUNCTION "snapshot".fn_verify_snapshot_hash(p_snapshot_id uuid) IS 'Returns TRUE when stored payload_hash matches a fresh recompute; FALSE on tamper/corruption; NULL when the snapshot id does not exist. Canonicalization MUST match fn_capture_full §E exactly. Called from snapshot-restore.service before applying a restore.';

CREATE OR REPLACE FUNCTION snapshot.trg_compiled_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'snapshot.% is append-only. Create a new compiled snapshot instead.',
        TG_TABLE_NAME USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$function$;

COMMENT ON FUNCTION "snapshot".trg_compiled_immutable() IS 'Blocks UPDATE/DELETE on snapshot.entity_compiled and snapshot.entity_compiled_overlay. These tables are append-only — new compiled snapshots are created, never modified.';

CREATE OR REPLACE FUNCTION snapshot.trg_content_item_version_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION
        'snapshot.content_item_version rows are immutable — UPDATE and DELETE are not allowed';
END;
$function$;

COMMENT ON FUNCTION "snapshot".trg_content_item_version_immutable() IS 'Blocks all UPDATE and DELETE on snapshot.content_item_version. Pattern mirrors snapshot.trg_template_version_immutable.';

CREATE OR REPLACE FUNCTION snapshot.trg_document_snapshot_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'snapshot.document_snapshot is append-only — capture a new snapshot instead.'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$function$;

COMMENT ON FUNCTION "snapshot".trg_document_snapshot_immutable() IS 'Blocks UPDATE/DELETE on snapshot.document_snapshot. Capture a new snapshot via snapshot.fn_capture_full() to record a state change.';

CREATE OR REPLACE FUNCTION snapshot.trg_template_version_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'snapshot', 'pg_catalog'
AS $function$
BEGIN
    RAISE EXCEPTION
        'snapshot.template_version is append-only. '
        'UPDATE and DELETE are not permitted. '
        'Publish a new version instead.'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$function$;

COMMENT ON FUNCTION "snapshot".trg_template_version_immutable() IS 'Immutability guard for snapshot.template_version. Fires BEFORE UPDATE OR DELETE — raises exception unconditionally. Follows pattern of snapshot.trg_lifecycle_version_immutable.';
