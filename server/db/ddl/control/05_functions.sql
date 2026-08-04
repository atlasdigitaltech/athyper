-- ============================================================================
-- control/05_functions.sql
-- Functions and procedures reconstructed from the live catalog; pre-constraint routines are excluded.
-- Generated from the live Neon control schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION control.advance_workflow_state(p_tenant_id uuid, p_entity_name text, p_entity_id text, p_operation_code text, p_actor_id uuid DEFAULT NULL::uuid, p_remarks text DEFAULT NULL::text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'control', 'master', 'snapshot', 'log', 'event'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".advance_workflow_state(p_tenant_id uuid, p_entity_name text, p_entity_id text, p_operation_code text, p_actor_id uuid, p_remarks text, p_payload jsonb) IS 'Main lifecycle transition function. Implements the 10-step transition flow: 1. Lock instance (FOR UPDATE) 2. Load current state 3. Find transition by operation_code 4. Evaluate gate (required_operations check) 5. BEFORE hooks (delegated to runtime via outbox) 6. UPDATE lifecycle_instance state_id 7. INSERT log.entity_lifecycle_log 8. Emit event.outbox for AFTER hooks 9. Cancel timers for departed state 10. Schedule timers for entered state (delegated to runtime) Returns jsonb with success/error and transition details.';

CREATE OR REPLACE FUNCTION control.authorization_v2_is_effective(p_from timestamp with time zone, p_until timestamp with time zone, p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    SELECT p_from <= p_at AND (p_until IS NULL OR p_at < p_until);
$function$;

CREATE OR REPLACE FUNCTION control.canonical_posting_role_code(p_tenant_id uuid, p_role_code text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'shared', 'pg_temp'
AS $function$
DECLARE
    v_input text := lower(btrim(COALESCE(p_role_code, '')));
    v_code text;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Posting-role tenant does not match the active tenant session'
            USING ERRCODE = '42501';
    END IF;
    IF v_input = '' THEN RETURN NULL; END IF;

    SELECT lv.code INTO v_code
      FROM control.lookup_value lv
     WHERE lv.domain_code = 'finance.posting_role'
       AND lv.code = v_input
       AND lv.status = 'active'
       AND (lv.tenant_id = p_tenant_id OR lv.tenant_id IS NULL)
     ORDER BY (lv.tenant_id IS NOT NULL) DESC
     LIMIT 1;
    IF v_code IS NOT NULL THEN RETURN v_code; END IF;

    SELECT a.canonical_role_code INTO v_code
      FROM control.posting_role_alias a
     WHERE a.alias_code = v_input
       AND a.status = 'active'
       AND (a.tenant_id = p_tenant_id OR a.tenant_id IS NULL)
     ORDER BY (a.tenant_id IS NOT NULL) DESC,
              (a.source_domain_code IS NULL) DESC
     LIMIT 1;
    RETURN v_code;
END;
$function$;

COMMENT ON FUNCTION "control".canonical_posting_role_code(p_tenant_id uuid, p_role_code text) IS 'Normalizes a role code and resolves tenant/global compatibility aliases into finance.posting_role.';

CREATE OR REPLACE FUNCTION control.compile_workflow_template(p_template_id uuid, p_compiled_by uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'control'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".compile_workflow_template(p_template_id uuid, p_compiled_by uuid) IS 'Compiles a workflow template into denormalized JSON. Includes all stages with their rules, ordered by stage_no and priority. Updates workflow_template.compiled_json and compiled_hash. Called before workflow_request creation to version-pin the template.';

CREATE OR REPLACE FUNCTION control.fiscal_calendar_year_start(p_tenant_id uuid, p_calendar_config_id uuid, p_fiscal_year integer)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control', 'master', 'shared', 'pg_temp'
AS $function$
DECLARE
    v_config control.fiscal_calendar_config%ROWTYPE;
    v_base_year integer;
    v_month_end integer;
    v_anchor date;
    v_iso_day integer;
    v_delta integer;
BEGIN
    SELECT * INTO v_config
      FROM control.fiscal_calendar_config
     WHERE tenant_id = p_tenant_id
       AND id = p_calendar_config_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fiscal calendar % was not found for tenant %', p_calendar_config_id, p_tenant_id
            USING ERRCODE = 'P0002';
    END IF;

    v_base_year := CASE v_config.fiscal_year_label_rule
        WHEN 'end_year' THEN p_fiscal_year - 1
        ELSE p_fiscal_year
    END;
    v_month_end := EXTRACT(DAY FROM
        (make_date(v_base_year, v_config.anchor_month, 1) + INTERVAL '1 month - 1 day'))::integer;
    v_anchor := make_date(v_base_year, v_config.anchor_month,
                          LEAST(v_config.anchor_day::integer, v_month_end));

    IF v_config.year_start_rule = 'fixed_date' THEN
        RETURN v_anchor;
    END IF;

    v_iso_day := EXTRACT(ISODOW FROM v_anchor)::integer;
    IF v_config.year_start_rule = 'first_on_or_after' THEN
        RETURN v_anchor + ((v_config.week_start_day::integer - v_iso_day + 7) % 7);
    ELSIF v_config.year_start_rule = 'last_on_or_before' THEN
        RETURN v_anchor - ((v_iso_day - v_config.week_start_day::integer + 7) % 7);
    END IF;

    -- nearest_weekday: ties resolve forward for deterministic behavior.
    v_delta := (v_config.week_start_day::integer - v_iso_day + 7) % 7;
    IF v_delta <= 3 THEN
        RETURN v_anchor + v_delta;
    END IF;
    RETURN v_anchor - (7 - v_delta);
END;
$function$;

CREATE OR REPLACE FUNCTION control.fn_block_effective_version_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_entity_code text;
    v_actor       uuid;
BEGIN
    -- Bypass during provisioning: the seed runner SETs
    -- app.bypass_version_lock = 'true' at session start so version_hash
    -- precompute and label normalization passes can update EFFECTIVE rows.
    -- Runtime sessions never set this GUC, so the lock remains in force.
    IF current_setting('app.bypass_version_lock', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Allow non-EFFECTIVE rows through unconditionally
    IF OLD.status <> 'EFFECTIVE' OR OLD.locked_after_effective = false THEN
        RETURN NEW;
    END IF;

    -- Allow normal lifecycle transitions away from EFFECTIVE without payload changes
    IF TG_OP = 'UPDATE'
       AND NEW.status IN ('SUPERSEDED','ARCHIVED')
       AND NEW.version_hash    IS NOT DISTINCT FROM OLD.version_hash
       AND NEW.change_summary  IS NOT DISTINCT FROM OLD.change_summary
       AND NEW.label           IS NOT DISTINCT FROM OLD.label
    THEN
        RETURN NEW;
    END IF;

    -- Allow emergency override: caller must populate all four override fields
    IF TG_OP = 'UPDATE'
       AND NEW.emergency_override_at     IS NOT NULL
       AND NEW.emergency_override_by     IS NOT NULL
       AND NEW.emergency_override_ticket IS NOT NULL
       AND NEW.emergency_override_reason IS NOT NULL
       AND (OLD.emergency_override_at IS NULL
            OR OLD.emergency_override_at IS DISTINCT FROM NEW.emergency_override_at)
    THEN
        SELECT entity_code INTO v_entity_code FROM control.entity WHERE id = NEW.entity_id;
        v_actor := NEW.emergency_override_by;

        INSERT INTO log.descriptor_cache_invalidation
            (tenant_id, entity_code, reason, triggered_by_table, triggered_by_id, created_by)
        VALUES
            (NEW.tenant_id, v_entity_code, 'emergency_override',
             'entity_version', NEW.id, v_actor);

        PERFORM pg_notify(
            'desc_invalidate',
            json_build_object(
                'tenant_id',   NEW.tenant_id,
                'entity_code', v_entity_code,
                'reason',      'emergency_override',
                'ticket',      NEW.emergency_override_ticket,
                'at',          extract(epoch FROM now())
            )::text
        );

        RETURN NEW;
    END IF;

    -- Otherwise block
    RAISE EXCEPTION
        'control.entity_version % is EFFECTIVE and locked. Create a new version or use the emergency override path.',
        OLD.id
        USING ERRCODE = 'P0001',
              HINT    = 'Set emergency_override_at, _by, _ticket, _reason in the same UPDATE statement.';
END;
$function$;

COMMENT ON FUNCTION "control".fn_block_effective_version_mutation() IS 'D14. EFFECTIVE versions are immutable except: (a) status -> SUPERSEDED/ARCHIVED without payload change, (b) emergency override with CAB ticket + reason + actor. Override path also fires cache invalidation.';

CREATE OR REPLACE FUNCTION control.fn_invalidate_all_execution_descriptors()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_actor uuid;
BEGIN
    IF current_setting('app.bypass_version_lock', true) = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
    v_actor := COALESCE(NEW.created_by, OLD.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
    INSERT INTO log.descriptor_cache_invalidation
        (tenant_id, entity_code, reason, triggered_by_table, triggered_by_id, created_by)
    VALUES (NULL, NULL, 'satellite_write', TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_actor);
    PERFORM pg_notify('desc_invalidate', json_build_object(
        'reason', 'satellite_write', 'source', TG_TABLE_NAME,
        'at', extract(epoch FROM now()))::text);
    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION control.fn_invalidate_by_entity_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_tenant uuid;
    v_entity text;
    v_actor  uuid;
BEGIN
    IF current_setting('app.bypass_version_lock', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);

    SELECT e.entity_code
      INTO v_entity
      FROM control.entity e
     WHERE e.id = COALESCE(NEW.entity_id, OLD.entity_id);

    v_actor := COALESCE(NEW.created_by, OLD.created_by,
                        '00000000-0000-0000-0000-000000000000'::uuid);

    INSERT INTO log.descriptor_cache_invalidation
        (tenant_id, entity_code, reason, triggered_by_table, triggered_by_id, created_by)
    VALUES
        (v_tenant, v_entity, 'satellite_write',
         TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_actor);

    PERFORM pg_notify(
        'desc_invalidate',
        json_build_object(
            'tenant_id',   v_tenant,
            'entity_code', v_entity,
            'reason',      'satellite_write',
            'source',      TG_TABLE_NAME,
            'at',          extract(epoch FROM now())
        )::text
    );

    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION control.fn_invalidate_by_entity_name()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_tenant uuid;
    v_entity text;
    v_actor  uuid;
BEGIN
    -- During provisioning the seed touches every satellite row; we don't need
    -- to flood log.descriptor_cache_invalidation or pg_notify with that noise.
    -- Runtime sessions don't set this GUC, so invalidations still fire.
    IF current_setting('app.bypass_version_lock', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_entity := COALESCE(NEW.entity_name, OLD.entity_name);
    v_actor  := COALESCE(NEW.created_by, OLD.created_by,
                         '00000000-0000-0000-0000-000000000000'::uuid);

    INSERT INTO log.descriptor_cache_invalidation
        (tenant_id, entity_code, reason, triggered_by_table, triggered_by_id, created_by)
    VALUES
        (v_tenant, v_entity, 'satellite_write',
         TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_actor);

    PERFORM pg_notify(
        'desc_invalidate',
        json_build_object(
            'tenant_id',   v_tenant,
            'entity_code', v_entity,
            'reason',      'satellite_write',
            'source',      TG_TABLE_NAME,
            'at',          extract(epoch FROM now())
        )::text
    );

    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION control.fn_invalidate_by_entity_version_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_tenant uuid; v_entity text; v_actor uuid;
BEGIN
    IF current_setting('app.bypass_version_lock', true) = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
    SELECT COALESCE(NEW.tenant_id, OLD.tenant_id, e.tenant_id), e.entity_code
      INTO v_tenant, v_entity
      FROM control.entity_version ev JOIN control.entity e ON e.id = ev.entity_id
     WHERE ev.id = COALESCE(NEW.entity_version_id, OLD.entity_version_id);
    v_actor := COALESCE(NEW.created_by, OLD.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
    INSERT INTO log.descriptor_cache_invalidation
        (tenant_id, entity_code, reason, triggered_by_table, triggered_by_id, created_by)
    VALUES (v_tenant, v_entity, 'satellite_write', TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_actor);
    PERFORM pg_notify('desc_invalidate', json_build_object(
        'tenant_id', v_tenant, 'entity_code', v_entity, 'reason', 'satellite_write',
        'source', TG_TABLE_NAME, 'at', extract(epoch FROM now()))::text);
    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION control.fn_invalidate_by_overlay_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_tenant uuid; v_entity text; v_actor uuid; v_overlay uuid;
BEGIN
    IF current_setting('app.bypass_version_lock', true) = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
    v_overlay := COALESCE(NEW.overlay_id, OLD.overlay_id);
    SELECT ov.tenant_id, e.entity_code INTO v_tenant, v_entity
      FROM control.overlay ov JOIN control.entity e ON e.id = ov.base_entity_id
     WHERE ov.id = v_overlay;
    v_actor := COALESCE(NEW.created_by, OLD.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
    INSERT INTO log.descriptor_cache_invalidation
        (tenant_id, entity_code, reason, triggered_by_table, triggered_by_id, created_by)
    VALUES (v_tenant, v_entity, 'tenant_overlay_write', TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_actor);
    PERFORM pg_notify('desc_invalidate', json_build_object(
        'tenant_id', v_tenant, 'entity_code', v_entity, 'reason', 'tenant_overlay_write',
        'source', TG_TABLE_NAME, 'at', extract(epoch FROM now()))::text);
    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION control.fn_invalidate_by_overlay_row()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_tenant uuid; v_entity text; v_actor uuid;
BEGIN
    IF current_setting('app.bypass_version_lock', true) = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
    v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    SELECT e.entity_code INTO v_entity FROM control.entity e
     WHERE e.id = COALESCE(NEW.base_entity_id, OLD.base_entity_id);
    v_actor := COALESCE(NEW.created_by, OLD.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
    INSERT INTO log.descriptor_cache_invalidation
        (tenant_id, entity_code, reason, triggered_by_table, triggered_by_id, created_by)
    VALUES (v_tenant, v_entity, 'tenant_overlay_write', TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_actor);
    PERFORM pg_notify('desc_invalidate', json_build_object(
        'tenant_id', v_tenant, 'entity_code', v_entity, 'reason', 'tenant_overlay_write',
        'source', TG_TABLE_NAME, 'at', extract(epoch FROM now()))::text);
    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION control.fn_invalidate_on_satellite_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION
        'control.fn_invalidate_on_satellite_write is a router stub; bind triggers to fn_invalidate_by_entity_name or fn_invalidate_by_entity_id directly';
END;
$function$;

COMMENT ON FUNCTION "control".fn_invalidate_on_satellite_write() IS 'D10. Trigger function: writes log.descriptor_cache_invalidation and pg_notify on satellite writes. Listener subscribes to channel ''desc_invalidate''; poller scans WHERE processed_at IS NULL as fallback.';

CREATE OR REPLACE FUNCTION control.generate_event_entries(p_tenant_id uuid, p_profile_config_id uuid, p_event_code text, p_doc_type text DEFAULT NULL::text, p_document_total numeric DEFAULT 0, p_tax_amount numeric DEFAULT 0, p_line_amount numeric DEFAULT NULL::numeric, p_commitment_amount numeric DEFAULT NULL::numeric, p_milestone_amount numeric DEFAULT NULL::numeric, p_cogs_amount numeric DEFAULT NULL::numeric, p_revenue_amount numeric DEFAULT NULL::numeric, p_advance_amount numeric DEFAULT NULL::numeric, p_advance_recovery numeric DEFAULT NULL::numeric, p_retention_amount numeric DEFAULT NULL::numeric, p_penalty_amount numeric DEFAULT NULL::numeric, p_rebate_amount numeric DEFAULT NULL::numeric, p_discount_amount numeric DEFAULT NULL::numeric, p_net_payable numeric DEFAULT NULL::numeric, p_intent_gl_account text DEFAULT NULL::text, p_classification_gl text DEFAULT NULL::text, p_book_code text DEFAULT 'STAT'::text, p_include_paired boolean DEFAULT true, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(line_seq smallint, description text, posting_side text, account_code text, amount numeric, cost_center text, profit_center text, dimension_set_id uuid, is_balancing boolean, event_code text, commitment_action text, source_profile_config_id uuid, is_paired_entry boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".generate_event_entries(p_tenant_id uuid, p_profile_config_id uuid, p_event_code text, p_doc_type text, p_document_total numeric, p_tax_amount numeric, p_line_amount numeric, p_commitment_amount numeric, p_milestone_amount numeric, p_cogs_amount numeric, p_revenue_amount numeric, p_advance_amount numeric, p_advance_recovery numeric, p_retention_amount numeric, p_penalty_amount numeric, p_rebate_amount numeric, p_discount_amount numeric, p_net_payable numeric, p_intent_gl_account text, p_classification_gl text, p_book_code text, p_include_paired boolean, p_as_of_date date) IS 'Engine 4.13 §F3: profile_config + event → JE lines (set-returning). Stateless — all inputs are explicit parameters. Tenant-verified on every table lookup. Effective-date on paired config. Paired COGS path symmetric with main (doc_type filter + book EXCLUDE/REMAP). 21 amount_source values. REMAINDER raises on negative balance.';

CREATE OR REPLACE FUNCTION control.generate_fiscal_periods(p_tenant_id uuid, p_company_code_id uuid, p_fiscal_year integer, p_actor_id uuid, p_calendar_config_id uuid DEFAULT NULL::uuid, p_replace_future boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'control', 'master', 'governance', 'document', 'shared', 'pg_temp'
AS $function$
DECLARE
    v_config_id uuid;
    v_assigned_config_id uuid;
    v_config control.fiscal_calendar_config%ROWTYPE;
    v_period record;
    v_existing record;
    v_generated integer := 0;
    v_book_rows integer := 0;
    v_generation_key text;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Fiscal calendar generation tenant does not match the active tenant session'
            USING ERRCODE = '42501';
    END IF;
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'Actor is required to generate fiscal periods' USING ERRCODE = '23502';
    END IF;

    PERFORM 1 FROM master.company_code
     WHERE tenant_id = p_tenant_id AND id = p_company_code_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company % was not found for tenant %', p_company_code_id, p_tenant_id
            USING ERRCODE = 'P0002';
    END IF;

    v_assigned_config_id := control.resolve_company_fiscal_calendar(
        p_tenant_id, p_company_code_id, p_fiscal_year);
    IF p_calendar_config_id IS NOT NULL
       AND p_calendar_config_id IS DISTINCT FROM v_assigned_config_id THEN
        RAISE EXCEPTION 'Calendar % is not assigned to company % for FY %',
            p_calendar_config_id, p_company_code_id, p_fiscal_year
            USING ERRCODE = '23514';
    END IF;
    v_config_id := COALESCE(p_calendar_config_id, v_assigned_config_id);
    IF v_config_id IS NULL THEN
        RAISE EXCEPTION 'No active fiscal calendar assignment covers FY %', p_fiscal_year
            USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_config
      FROM control.fiscal_calendar_config
     WHERE tenant_id = p_tenant_id AND id = v_config_id AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fiscal calendar % is not active', v_config_id USING ERRCODE = '23514';
    END IF;

    -- Protect opened/closed periods from calendar drift. Regeneration is still
    -- idempotent when their dates, types, and source version are unchanged.
    FOR v_existing IN
        SELECT fp.*
          FROM master.fiscal_period fp
         WHERE fp.tenant_id = p_tenant_id
           AND fp.company_code_id = p_company_code_id
           AND fp.fiscal_year = p_fiscal_year
           AND fp.status <> 'future'
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM control.preview_fiscal_calendar(p_tenant_id, v_config_id, p_fiscal_year) p
             WHERE p.period_number = v_existing.period_number
               AND p.period_type = v_existing.period_type
               AND p.start_date = v_existing.start_date
               AND p.end_date = v_existing.end_date
        ) THEN
            RAISE EXCEPTION 'FY % contains opened/closed period % that differs from calendar % v%',
                p_fiscal_year, v_existing.period_number, v_config.code, v_config.version_no
                USING ERRCODE = '55000';
        END IF;
    END LOOP;

    IF p_replace_future THEN
        DELETE FROM master.fiscal_period fp
         WHERE fp.tenant_id = p_tenant_id
           AND fp.company_code_id = p_company_code_id
           AND fp.fiscal_year = p_fiscal_year
           AND fp.status = 'future'
           AND fp.fiscal_calendar_config_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM document.journal_entry je
                WHERE je.tenant_id = p_tenant_id AND je.fiscal_period_id = fp.id
           );
    END IF;

    FOR v_period IN
        SELECT * FROM control.preview_fiscal_calendar(p_tenant_id, v_config_id, p_fiscal_year)
    LOOP
        v_generation_key := concat_ws(':', p_company_code_id::text, p_fiscal_year::text,
            v_config_id::text, v_config.version_no::text, v_period.period_number::text);

        INSERT INTO master.fiscal_period (
            tenant_id, code, name, company_code_id, fiscal_year, period_number,
            period_type, start_date, end_date, fiscal_calendar_config_id,
            calendar_version_no, generation_key, generated_at, sort_order,
            status, created_by
        ) VALUES (
            p_tenant_id,
            concat(p_fiscal_year, '-P', lpad(v_period.period_number::text, 2, '0')),
            v_period.period_name,
            p_company_code_id, p_fiscal_year, v_period.period_number,
            v_period.period_type, v_period.start_date, v_period.end_date, v_config_id,
            v_config.version_no, v_generation_key, now(), v_period.sequence_no,
            'future', p_actor_id
        )
        ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
        DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            period_type = EXCLUDED.period_type,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            fiscal_calendar_config_id = EXCLUDED.fiscal_calendar_config_id,
            calendar_version_no = EXCLUDED.calendar_version_no,
            generation_key = EXCLUDED.generation_key,
            generated_at = EXCLUDED.generated_at,
            sort_order = EXCLUDED.sort_order,
            updated_by = p_actor_id
        WHERE master.fiscal_period.status = 'future';
        v_generated := v_generated + 1;
    END LOOP;

    INSERT INTO governance.book_period_status (
        tenant_id, company_code_id, book_id, fiscal_year, period_number,
        status, created_by, metadata
    )
    SELECT p_tenant_id, p_company_code_id, ba.book_id, p_fiscal_year, p.period_number,
           'future', p_actor_id,
           jsonb_build_object('source', 'fiscal_calendar_generation',
                              'calendar_config_id', v_config_id,
                              'calendar_version_no', v_config.version_no)
      FROM master.company_code_book_assignment ba
      CROSS JOIN control.preview_fiscal_calendar(p_tenant_id, v_config_id, p_fiscal_year) p
     WHERE ba.tenant_id = p_tenant_id
       AND ba.company_code_id = p_company_code_id
       AND ba.status = 'active'
       AND ba.effective_from <= control.fiscal_calendar_year_start(p_tenant_id, v_config_id, p_fiscal_year + 1) - 1
       AND (ba.effective_to IS NULL OR ba.effective_to >= control.fiscal_calendar_year_start(p_tenant_id, v_config_id, p_fiscal_year))
    ON CONFLICT (tenant_id, company_code_id, book_id, fiscal_year, period_number)
    DO NOTHING;
    GET DIAGNOSTICS v_book_rows = ROW_COUNT;

    RETURN jsonb_build_object(
        'companyCodeId', p_company_code_id,
        'fiscalYear', p_fiscal_year,
        'calendarConfigId', v_config_id,
        'calendarCode', v_config.code,
        'calendarVersion', v_config.version_no,
        'periodCount', v_generated,
        'bookPeriodRowsCreated', v_book_rows
    );
END;
$function$;

COMMENT ON FUNCTION "control".generate_fiscal_periods(p_tenant_id uuid, p_company_code_id uuid, p_fiscal_year integer, p_actor_id uuid, p_calendar_config_id uuid, p_replace_future boolean) IS 'Tenant-session-bound generator. Runs with admin table privileges after verifying p_tenant_id equals app.current_tenant_id.';

CREATE OR REPLACE FUNCTION control.guard_bank_interface_nonsecret_config()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
    IF control.jsonb_contains_secret_key(NEW.config) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'bank interface config may not contain credentials or secret-shaped keys',
            HINT = 'Store credentials in the platform secret provider and set only credential_reference through a governed command.';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.guard_deletable_states()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control', 'snapshot'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".guard_deletable_states() IS 'Trigger function: blocks DELETE on entities not in deletable lifecycle states. Reads snapshot.status_route.compiled_json.deletable_states. By convention, only initial/draft states are deletable. Attach via: CREATE TRIGGER ... BEFORE DELETE ON <table> FOR EACH ROW EXECUTE FUNCTION control.guard_deletable_states(''entity_name'');';

CREATE OR REPLACE FUNCTION control.guard_fx_policy_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'FX policies are append-only and cannot be deleted',
            HINT = 'Use the governed policy replacement command.';
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.ledger_book_id IS DISTINCT FROM OLD.ledger_book_id
       OR NEW.transaction_context IS DISTINCT FROM OLD.transaction_context
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.default_rate_type IS DISTINCT FROM OLD.default_rate_type
       OR NEW.revaluation_rate_type IS DISTINCT FROM OLD.revaluation_rate_type
       OR NEW.pivot_currency_code IS DISTINCT FROM OLD.pivot_currency_code
       OR NEW.allow_inverse IS DISTINCT FROM OLD.allow_inverse
       OR NEW.allow_triangulation IS DISTINCT FROM OLD.allow_triangulation
       OR NEW.preferred_sources IS DISTINCT FROM OLD.preferred_sources
       OR NEW.maximum_rate_age_days IS DISTINCT FROM OLD.maximum_rate_age_days
       OR NEW.missing_rate_behavior IS DISTINCT FROM OLD.missing_rate_behavior
       OR NEW.manual_override_allowed IS DISTINCT FROM OLD.manual_override_allowed
       OR NEW.manual_override_approval_required IS DISTINCT FROM OLD.manual_override_approval_required
       OR NEW.auto_reverse_revaluation IS DISTINCT FROM OLD.auto_reverse_revaluation
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'FX policy decisions and lineage are immutable',
            HINT = 'Use the governed policy replacement command.';
    END IF;

    IF OLD.status = 'superseded' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'A superseded FX policy is immutable';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status <> 'superseded'
           OR NEW.status_changed_at IS NULL
           OR NEW.status_changed_by IS NULL THEN
            RAISE EXCEPTION USING
                ERRCODE = '55000',
                MESSAGE = 'The only permitted FX policy status transition is to superseded';
        END IF;
    ELSIF NEW.effective_to IS NOT DISTINCT FROM OLD.effective_to THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'FX policy updates must close an effective period or supersede the row';
    END IF;

    IF NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND (
         NEW.effective_to IS NULL
         OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'An FX policy effective period may be shortened but never extended';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "control".guard_fx_policy_immutable() IS 'Database boundary for append-only FX policy decisions; only period closure and supersession are mutable.';

CREATE OR REPLACE FUNCTION control.guard_fx_policy_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control', 'master', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
    IF NEW.company_code_id IS NOT NULL AND NEW.ledger_book_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM master.company_code_book_assignment assignment
         WHERE assignment.tenant_id = NEW.tenant_id
           AND assignment.company_code_id = NEW.company_code_id
           AND assignment.book_id = NEW.ledger_book_id
           AND assignment.status = 'active'
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'FX policy Book must be actively assigned to the policy Company';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.guard_payment_interface_binding_conflict()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.status='active' AND EXISTS (
        SELECT 1 FROM control.payment_method_interface_binding existing
         WHERE existing.tenant_id=NEW.tenant_id AND existing.id<>NEW.id
           AND existing.payment_method_id=NEW.payment_method_id AND existing.status='active'
           AND existing.priority=NEW.priority
           AND (existing.company_code_id IS NULL)=(NEW.company_code_id IS NULL)
           AND (existing.bank_account_link_id IS NULL)=(NEW.bank_account_link_id IS NULL)
           AND (existing.currency_code IS NULL)=(NEW.currency_code IS NULL)
           AND (existing.counterparty_country_code IS NULL)=(NEW.counterparty_country_code IS NULL)
           AND (existing.payment_network IS NULL)=(NEW.payment_network IS NULL)
           AND existing.direction=NEW.direction
           AND (existing.company_code_id IS NULL OR existing.company_code_id=NEW.company_code_id)
           AND (existing.bank_account_link_id IS NULL OR existing.bank_account_link_id=NEW.bank_account_link_id)
           AND (existing.currency_code IS NULL OR existing.currency_code=NEW.currency_code)
           AND (existing.counterparty_country_code IS NULL OR existing.counterparty_country_code=NEW.counterparty_country_code)
           AND (existing.payment_network IS NULL OR existing.payment_network=NEW.payment_network)
           AND daterange(existing.effective_from,COALESCE(existing.effective_until,'9999-12-31'::date),'[)')
               && daterange(NEW.effective_from,COALESCE(NEW.effective_until,'9999-12-31'::date),'[)')
    ) THEN
        RAISE EXCEPTION 'Ambiguous interface binding: equal specificity and priority overlap for the same payment context'
            USING ERRCODE='23505';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION control.guard_payment_interface_house_bank()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_owner uuid;
BEGIN
    IF NEW.bank_account_link_id IS NULL THEN RETURN NEW; END IF;
    SELECT owner_id INTO v_owner FROM master.bank_account_link
     WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_account_link_id AND owner_type='company_code';
    IF v_owner IS NULL OR (NEW.company_code_id IS NOT NULL AND v_owner<>NEW.company_code_id) THEN
        RAISE EXCEPTION 'Interface binding House Bank must be Company-owned and match the binding Company'
            USING ERRCODE='23503';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION control.guard_payment_settlement_book()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.status<>'active' THEN RETURN NEW; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.company_code_book_assignment assignment
        JOIN master.ledger_book book ON book.tenant_id=assignment.tenant_id AND book.id=assignment.book_id
         WHERE assignment.tenant_id=NEW.tenant_id AND assignment.company_code_id=NEW.company_code_id
           AND book.code=NEW.book_code AND assignment.status='active' AND book.status='active'
           AND assignment.effective_from<=NEW.effective_from
           AND (assignment.effective_to IS NULL OR assignment.effective_to>=NEW.effective_from)
    ) THEN
        RAISE EXCEPTION 'Settlement book % is not active and assigned to the Company at the rule start date',NEW.book_code
            USING ERRCODE='23503';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION control.guard_tax_group_component_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.tax_group_version_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control.tax_group_version version
         WHERE version.tenant_id=NEW.tenant_id AND version.id=NEW.tax_group_version_id
           AND version.tax_group_id=NEW.tax_group_id
    ) THEN
        RAISE EXCEPTION 'Tax Group component version must belong to the same Tenant and Tax Group'
            USING ERRCODE='23503';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION control.guard_tax_group_version_activation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.status='active' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND NOT EXISTS (
        SELECT 1 FROM control.tax_group_component component
         WHERE component.tenant_id=NEW.tenant_id AND component.tax_group_id=NEW.tax_group_id
           AND component.tax_group_version_id=NEW.id AND component.status='active'
    ) THEN
        RAISE EXCEPTION 'An active Tax Group Version requires at least one active component'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION control.guard_tax_resolution_rule_ambiguity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.status='active' AND EXISTS (
        SELECT 1 FROM control.tax_resolution_rule existing
         WHERE existing.tenant_id=NEW.tenant_id AND existing.id<>NEW.id AND existing.status='active'
           AND existing.priority=NEW.priority
           AND daterange(existing.effective_from,COALESCE(existing.effective_to,'9999-12-31'::date),'[]')
               && daterange(NEW.effective_from,COALESCE(NEW.effective_to,'9999-12-31'::date),'[]')
           AND (existing.scope_billto_jurisdiction_id IS NULL OR NEW.scope_billto_jurisdiction_id IS NULL OR existing.scope_billto_jurisdiction_id=NEW.scope_billto_jurisdiction_id)
           AND (existing.scope_shipto_jurisdiction_id IS NULL OR NEW.scope_shipto_jurisdiction_id IS NULL OR existing.scope_shipto_jurisdiction_id=NEW.scope_shipto_jurisdiction_id)
           AND (existing.scope_billfrom_jurisdiction_id IS NULL OR NEW.scope_billfrom_jurisdiction_id IS NULL OR existing.scope_billfrom_jurisdiction_id=NEW.scope_billfrom_jurisdiction_id)
           AND (existing.scope_shipfrom_jurisdiction_id IS NULL OR NEW.scope_shipfrom_jurisdiction_id IS NULL OR existing.scope_shipfrom_jurisdiction_id=NEW.scope_shipfrom_jurisdiction_id)
           AND (existing.scope_counterparty_tax_status IS NULL OR NEW.scope_counterparty_tax_status IS NULL OR existing.scope_counterparty_tax_status=NEW.scope_counterparty_tax_status)
           AND (existing.scope_commodity_category_id IS NULL OR NEW.scope_commodity_category_id IS NULL OR existing.scope_commodity_category_id=NEW.scope_commodity_category_id)
           AND (existing.scope_supplier_industry_code IS NULL OR NEW.scope_supplier_industry_code IS NULL OR existing.scope_supplier_industry_code=NEW.scope_supplier_industry_code)
           AND (existing.scope_doc_entity_codes IS NULL OR NEW.scope_doc_entity_codes IS NULL OR existing.scope_doc_entity_codes && NEW.scope_doc_entity_codes)
           AND NOT (existing.requires_shipto_shipfrom_match AND NEW.requires_shipto_shipfrom_mismatch)
           AND NOT (existing.requires_shipto_shipfrom_mismatch AND NEW.requires_shipto_shipfrom_match)
    ) THEN
        RAISE EXCEPTION 'Ambiguous active Tax Resolution Rule at priority % for an overlapping context and effective period',NEW.priority
            USING ERRCODE='23505';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION control.guard_terminal_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control', 'snapshot'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".guard_terminal_immutability() IS 'Trigger function: blocks UPDATE on entities in terminal lifecycle states. Reads snapshot.status_route.compiled_json.terminal_states. Attach via: CREATE TRIGGER ... BEFORE UPDATE ON <table> FOR EACH ROW EXECUTE FUNCTION control.guard_terminal_immutability(''entity_name'');';

CREATE OR REPLACE FUNCTION control.jsonb_contains_secret_key(p_value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_key text;
    v_child jsonb;
BEGIN
    IF p_value IS NULL THEN
        RETURN false;
    END IF;

    IF jsonb_typeof(p_value) = 'object' THEN
        FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
        LOOP
            IF lower(regexp_replace(v_key, '[^a-zA-Z0-9]+', '_', 'g')) ~
               '(^|_)(password|passwd|secret|client_secret|clientsecret|api_key|apikey|access_token|accesstoken|refresh_token|refreshtoken|private_key|privatekey|credential|credentials)($|_)'
               OR control.jsonb_contains_secret_key(v_child) THEN
                RETURN true;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(p_value) = 'array' THEN
        FOR v_child IN SELECT value FROM jsonb_array_elements(p_value)
        LOOP
            IF control.jsonb_contains_secret_key(v_child) THEN
                RETURN true;
            END IF;
        END LOOP;
    END IF;

    RETURN false;
END;
$function$;

COMMENT ON FUNCTION "control".jsonb_contains_secret_key(p_value jsonb) IS 'Rejects secret-shaped keys at any depth before bank-interface configuration reaches ordinary JSON storage.';

CREATE OR REPLACE FUNCTION control.next_entity_number(p_tenant_id uuid, p_entity_code text, p_number_field text DEFAULT NULL::text, p_company_code_id uuid DEFAULT NULL::uuid, p_fiscal_year smallint DEFAULT NULL::smallint, p_period_number smallint DEFAULT NULL::smallint, p_branch_code text DEFAULT NULL::text, p_effective_date date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'control', 'master', 'shared', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".next_entity_number(p_tenant_id uuid, p_entity_code text, p_number_field text, p_company_code_id uuid, p_fiscal_year smallint, p_period_number smallint, p_branch_code text, p_effective_date date) IS 'Canonical entity-number generator. Reads control.entity_numbering_config, increments control.entity_numbering_counter, and renders configured segments.';

CREATE OR REPLACE FUNCTION control.preview_fiscal_calendar(p_tenant_id uuid, p_calendar_config_id uuid, p_fiscal_year integer)
 RETURNS TABLE(sequence_no smallint, period_number smallint, period_type text, period_name text, start_date date, end_date date, quarter_number smallint, is_adjustment boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control', 'master', 'shared', 'pg_temp'
AS $function$
DECLARE
    v_config control.fiscal_calendar_config%ROWTYPE;
    v_rule control.fiscal_calendar_period_rule%ROWTYPE;
    v_year_start date;
    v_next_year_start date;
    v_cursor date;
    v_start date;
    v_end date;
    v_nominal_end date;
    v_last_normal_sequence smallint;
    v_normal_count integer;
    v_gap integer;
BEGIN
    SELECT * INTO v_config
      FROM control.fiscal_calendar_config
     WHERE tenant_id = p_tenant_id
       AND id = p_calendar_config_id
       AND status <> 'retired';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active or draft fiscal calendar % was not found', p_calendar_config_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*)::integer, max(r.sequence_no)
      INTO v_normal_count, v_last_normal_sequence
      FROM control.fiscal_calendar_period_rule r
     WHERE r.tenant_id = p_tenant_id
       AND r.fiscal_calendar_config_id = p_calendar_config_id
       AND r.status = 'active'
       AND r.period_type = 'normal';

    IF v_normal_count <> v_config.periods_per_year THEN
        RAISE EXCEPTION 'Calendar % expects % normal periods but has % active normal rules',
            v_config.code, v_config.periods_per_year, v_normal_count
            USING ERRCODE = '23514';
    END IF;

    v_year_start := control.fiscal_calendar_year_start(p_tenant_id, p_calendar_config_id, p_fiscal_year);
    v_next_year_start := control.fiscal_calendar_year_start(p_tenant_id, p_calendar_config_id, p_fiscal_year + 1);
    v_cursor := v_year_start;

    FOR v_rule IN
        SELECT r.*
          FROM control.fiscal_calendar_period_rule r
         WHERE r.tenant_id = p_tenant_id
           AND r.fiscal_calendar_config_id = p_calendar_config_id
           AND r.status = 'active'
         ORDER BY r.sequence_no
    LOOP
        IF v_rule.anchor = 'year_start' THEN
            v_start := v_year_start;
        ELSIF v_rule.anchor = 'year_end' THEN
            v_start := v_next_year_start - 1;
        ELSE
            v_start := v_cursor;
        END IF;

        IF v_rule.duration_unit = 'point' THEN
            v_end := v_start;
        ELSIF v_rule.duration_unit = 'day' THEN
            v_end := v_start + (v_rule.duration_value::integer - 1);
        ELSIF v_rule.duration_unit = 'week' THEN
            v_end := v_start + (v_rule.duration_value::integer * 7 - 1);
        ELSE
            v_end := (v_start + make_interval(months => v_rule.duration_value::integer) - INTERVAL '1 day')::date;
        END IF;

        IF v_rule.period_type = 'normal' THEN
            v_nominal_end := v_end;
            IF v_rule.sequence_no = v_last_normal_sequence THEN
                v_gap := v_next_year_start - (v_nominal_end + 1);
                IF v_gap <> 0 THEN
                    IF v_rule.absorbs_leap_week
                       AND v_config.leap_week_rule = 'last_period'
                       AND v_gap = 7 THEN
                        v_end := v_next_year_start - 1;
                    ELSE
                        RAISE EXCEPTION 'Calendar % FY % normal rules end %, expected % (gap % days)',
                            v_config.code, p_fiscal_year, v_nominal_end, v_next_year_start - 1, v_gap
                            USING ERRCODE = '23514';
                    END IF;
                END IF;
            END IF;
            v_cursor := v_end + 1;
        END IF;

        IF v_rule.period_type = 'normal'
           AND (v_start < v_year_start OR v_end >= v_next_year_start) THEN
            RAISE EXCEPTION 'Normal period % is outside fiscal year bounds % through %',
                v_rule.period_number, v_year_start, v_next_year_start - 1
                USING ERRCODE = '23514';
        END IF;

        sequence_no := v_rule.sequence_no;
        period_number := v_rule.period_number;
        period_type := v_rule.period_type;
        period_name := replace(replace(v_rule.name_template,
            '{period}', lpad(v_rule.period_number::text, 2, '0')),
            '{year}', p_fiscal_year::text);
        start_date := v_start;
        end_date := v_end;
        quarter_number := v_rule.quarter_number;
        is_adjustment := v_rule.period_type = 'adjustment';
        RETURN NEXT;
    END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION control.promote_obligation_tier(p_tenant_id uuid, p_fiscal_year smallint, p_target_tier text, p_company_code_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'document', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".promote_obligation_tier(p_tenant_id uuid, p_fiscal_year smallint, p_target_tier text, p_company_code_id uuid) IS 'Engine 4.13 §F6: bulk obligation tier promotion. PLANNED → FORECAST (sets promoted_at) or FORECAST → RESERVED (sets reserved_at). Returns JSONB with promoted row count. Scoped by tenant + fiscal_year + company_code_id.';

CREATE OR REPLACE FUNCTION control.provision_asset_policies(p_tenant_id uuid, p_company_code_id uuid DEFAULT NULL::uuid, p_template_code text DEFAULT 'IFRS_DEFAULT'::text, p_effective_from date DEFAULT CURRENT_DATE, p_created_by uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid, p_overwrite_existing boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".provision_asset_policies(p_tenant_id uuid, p_company_code_id uuid, p_template_code text, p_effective_from date, p_created_by uuid, p_overwrite_existing boolean) IS 'Provisions concrete asset_class_book_policy rows from asset_class_book_policy_template. Resolves template book_category to the active assigned ledger_book.code per company. By default updates only rows previously provisioned from the same template; p_overwrite_existing=true refreshes matching policy rows unconditionally.';

CREATE OR REPLACE FUNCTION control.rebuild_intent_paths(p_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".rebuild_intent_paths(p_tenant_id uuid) IS 'Engine 4.13 §F4: recomputes path + depth on master.business_intent tree. Recursive CTE. Soft: returns 0 if table does not exist. Call after bulk-loading intent hierarchy.';

CREATE OR REPLACE FUNCTION control.resolve_accounting_profile(p_tenant_id uuid, p_intent_id uuid, p_direction text DEFAULT 'INBOUND'::text, p_flow_code text DEFAULT 'NON_PO'::text, p_company_code_id uuid DEFAULT NULL::uuid, p_doc_type text DEFAULT NULL::text, p_amount numeric DEFAULT NULL::numeric, p_currency_code text DEFAULT NULL::text, p_is_cross_border boolean DEFAULT false, p_is_intercompany boolean DEFAULT false, p_commodity_domain text DEFAULT NULL::text, p_commitment_type text DEFAULT NULL::text, p_counterparty_tier text DEFAULT NULL::text, p_contract_value numeric DEFAULT NULL::numeric, p_revenue_type text DEFAULT NULL::text, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".resolve_accounting_profile(p_tenant_id uuid, p_intent_id uuid, p_direction text, p_flow_code text, p_company_code_id uuid, p_doc_type text, p_amount numeric, p_currency_code text, p_is_cross_border boolean, p_is_intercompany boolean, p_commodity_domain text, p_commitment_type text, p_counterparty_tier text, p_contract_value numeric, p_revenue_type text, p_as_of_date date) IS 'Engine 4.13 §F2: intent + context → accounting profile. Override check (governance) → rule matching (priority) → FAILED. CORR-1: both override and rule-match branches validate resolved config against applicable_flow_codes + applicable_doc_types. NULL flow/doc params are permissive (do not cause rejection). applicability_skips: count of condition-matched rules/overrides whose config failed flow_code or doc_type applicability filters (observability). Returns JSONB with method=OVERRIDE|RULE_MATCH|FAILED.';

CREATE OR REPLACE FUNCTION control.resolve_admin_permission_entitlement(p_permission_id uuid, p_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(available boolean, evidence_id text, reason_code text, next_authority_change_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM control.auth_permission p
        WHERE p.id = p_permission_id
          AND p.plane_code IN ('admin', 'all')
          AND p.status = 'published'
          AND p.effective_from <= p_at
          AND (p.effective_until IS NULL OR p.effective_until > p_at)
    ),
    concat('admin:permission-plane:', p_permission_id::text),
    'platform_managed',
    NULL::timestamptz;
$function$;

CREATE OR REPLACE FUNCTION control.resolve_asset_class_book_policy(p_tenant_id uuid, p_company_code_id uuid, p_asset_class_id uuid, p_book_code text, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".resolve_asset_class_book_policy(p_tenant_id uuid, p_company_code_id uuid, p_asset_class_id uuid, p_book_code text, p_as_of_date date) IS 'Resolves the winning book policy for asset_book creation. Filters: active + effective_from <= date + effective_to covers date. Order: latest effective_from DESC, then highest priority DESC. Raises no_data_found if no policy matches — hard failure by design.';

CREATE OR REPLACE FUNCTION control.resolve_bank_format_rule(p_tenant_id uuid, p_country_code character, p_payment_network text, p_direction text DEFAULT 'OUTBOUND'::text, p_currency_code character DEFAULT NULL::bpchar)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".resolve_bank_format_rule(p_tenant_id uuid, p_country_code character, p_payment_network text, p_direction text, p_currency_code character) IS 'Resolves bank format rule for country + payment network + direction. Requires active tenant session. Ranking: tenant > global, currency-specific > agnostic, direction-specific > BOTH, priority DESC.';

CREATE OR REPLACE FUNCTION control.resolve_bank_interface(p_tenant_id uuid, p_payment_method_id uuid, p_direction text DEFAULT 'OUTBOUND'::text, p_company_code_id uuid DEFAULT NULL::uuid, p_bank_account_link_id uuid DEFAULT NULL::uuid, p_currency_code character DEFAULT NULL::bpchar, p_counterparty_country_code character DEFAULT NULL::bpchar, p_payment_network text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".resolve_bank_interface(p_tenant_id uuid, p_payment_method_id uuid, p_direction text, p_company_code_id uuid, p_bank_account_link_id uuid, p_currency_code character, p_counterparty_country_code character, p_payment_network text) IS 'Resolves the best-matching bank interface profile for a payment execution context. Priority/specificity ranking: company > bank > currency > country > network > direction > explicit priority. Requires tenant session.';

CREATE OR REPLACE FUNCTION control.resolve_bank_interface_trace(p_tenant_id uuid, p_payment_method_id uuid, p_as_of_date date, p_direction text DEFAULT 'OUTBOUND'::text, p_company_code_id uuid DEFAULT NULL::uuid, p_bank_account_link_id uuid DEFAULT NULL::uuid, p_currency_code character DEFAULT NULL::bpchar, p_counterparty_country_code character DEFAULT NULL::bpchar, p_payment_network text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
DECLARE v_candidates jsonb; v_winner jsonb; v_top_count integer;
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);
    WITH evaluated AS (
      SELECT b.id,b.bank_interface_profile_id,ip.code AS profile_code,ip.name AS profile_name,
             ip.interface_type,ip.file_format_code,ip.provider_code,b.priority,
             ARRAY[
               (b.company_code_id IS NOT NULL)::int,(b.bank_account_link_id IS NOT NULL)::int,
               (b.currency_code IS NOT NULL)::int,(b.counterparty_country_code IS NOT NULL)::int,
               (b.payment_network IS NOT NULL)::int,(b.direction=p_direction)::int
             ] AS specificity,
             CASE WHEN b.direction NOT IN (p_direction,'BOTH') THEN 'direction_mismatch'
                  WHEN b.company_code_id IS NOT NULL AND b.company_code_id IS DISTINCT FROM p_company_code_id THEN 'company_mismatch'
                  WHEN b.bank_account_link_id IS NOT NULL AND b.bank_account_link_id IS DISTINCT FROM p_bank_account_link_id THEN 'house_bank_mismatch'
                  WHEN b.currency_code IS NOT NULL AND b.currency_code IS DISTINCT FROM p_currency_code THEN 'currency_mismatch'
                  WHEN b.counterparty_country_code IS NOT NULL AND b.counterparty_country_code IS DISTINCT FROM p_counterparty_country_code THEN 'country_mismatch'
                  WHEN b.payment_network IS NOT NULL AND b.payment_network IS DISTINCT FROM p_payment_network THEN 'network_mismatch'
                  ELSE NULL END AS rejection_reason
        FROM control.payment_method_interface_binding b
        JOIN control.bank_interface_profile ip ON ip.tenant_id=b.tenant_id AND ip.id=b.bank_interface_profile_id AND ip.status='active'
       WHERE b.tenant_id=p_tenant_id AND b.payment_method_id=p_payment_method_id AND b.status='active'
         AND b.effective_from<=p_as_of_date AND (b.effective_until IS NULL OR b.effective_until>p_as_of_date)
    ), ranked AS (
      SELECT *,dense_rank() OVER(ORDER BY specificity DESC,priority DESC) AS resolution_rank
        FROM evaluated WHERE rejection_reason IS NULL
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'bindingId',e.id,'profileId',e.bank_interface_profile_id,'profileCode',e.profile_code,
             'interfaceType',e.interface_type,'specificity',e.specificity,'priority',e.priority,
             'matched',e.rejection_reason IS NULL,'reason',e.rejection_reason)
             ORDER BY e.specificity DESC,e.priority DESC,e.id),'[]'::jsonb),
           (SELECT to_jsonb(r) FROM ranked r WHERE r.resolution_rank=1 ORDER BY r.id LIMIT 1),
           (SELECT count(*) FROM ranked r WHERE r.resolution_rank=1)
      INTO v_candidates,v_winner,v_top_count FROM evaluated e;

    RETURN jsonb_build_object('found',v_top_count=1,'ambiguous',v_top_count>1,
      'asOfDate',p_as_of_date,'winner',CASE WHEN v_top_count=1 THEN v_winner ELSE NULL END,
      'candidates',v_candidates,'explanation',CASE WHEN v_top_count>1 THEN 'Equal-specificity and equal-priority bindings matched' WHEN v_top_count=0 THEN 'No active binding matched' ELSE 'Resolved deterministically by specificity then priority' END);
END $function$;

COMMENT ON FUNCTION "control".resolve_bank_interface_trace(p_tenant_id uuid, p_payment_method_id uuid, p_as_of_date date, p_direction text, p_company_code_id uuid, p_bank_account_link_id uuid, p_currency_code character, p_counterparty_country_code character, p_payment_network text) IS 'Stage D deterministic, as-of interface resolver. Returns all candidates, rejection reasons, ambiguity, and the unique winner.';

CREATE OR REPLACE FUNCTION control.resolve_business_intent(p_tenant_id uuid, p_classification_source text, p_classification_id uuid, p_direction text DEFAULT 'INBOUND'::text, p_flow_code text DEFAULT 'NON_PO'::text, p_company_code_id uuid DEFAULT NULL::uuid, p_doc_type text DEFAULT NULL::text, p_amount numeric DEFAULT NULL::numeric, p_currency_code text DEFAULT NULL::text, p_is_cross_border boolean DEFAULT false, p_is_recurring boolean DEFAULT false, p_supplier_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_counterparty_tier text DEFAULT NULL::text, p_commodity_domain text DEFAULT NULL::text, p_procurement_method text DEFAULT NULL::text, p_contract_type text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".resolve_business_intent(p_tenant_id uuid, p_classification_source text, p_classification_id uuid, p_direction text, p_flow_code text, p_company_code_id uuid, p_doc_type text, p_amount numeric, p_currency_code text, p_is_cross_border boolean, p_is_recurring boolean, p_supplier_id uuid, p_customer_id uuid, p_counterparty_tier text, p_commodity_domain text, p_procurement_method text, p_contract_type text, p_channel text, p_as_of_date date) IS 'Engine 4.13 §F1: classification → business intent. Evaluates all 16 condition types in priority order. Fallback: classification default from COMMODITY_CATEGORY policy. Returns JSONB with method=RULE_MATCH|CLASSIFICATION_DEFAULT|FAILED.';

CREATE OR REPLACE FUNCTION control.resolve_classification_to_intent(p_tenant_id uuid, p_classification_source text, p_classification_id uuid, p_direction text, p_flow_code text, p_amount numeric, p_currency_code text, p_is_recurring boolean, p_is_cross_border boolean, p_is_intercompany boolean, p_company_code_id uuid, p_doc_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".resolve_classification_to_intent(p_tenant_id uuid, p_classification_source text, p_classification_id uuid, p_direction text, p_flow_code text, p_amount numeric, p_currency_code text, p_is_recurring boolean, p_is_cross_border boolean, p_is_intercompany boolean, p_company_code_id uuid, p_doc_type text) IS 'Step 3 of the procurement intake pipeline. Evaluates commodity_classification_to_intent_rule rows for the given classification in priority order. Supports 16 condition types. Returns first match with explanation, or FAILED. Called by IntentResolutionService.ts.';

CREATE OR REPLACE FUNCTION control.resolve_commodity_category_policy(p_tenant_id uuid, p_commodity_category_id uuid, p_company_code_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control', 'master'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".resolve_commodity_category_policy(p_tenant_id uuid, p_commodity_category_id uuid, p_company_code_id uuid) IS 'Step 2 of the procurement intake pipeline. Merges commodity_category base attributes with commodity_category_buy_policy overrides. Returns ALLOW/DENY mapping_mode, effective intent, capex threshold, and classification/HS requirement flags. Called by IntentResolutionService.ts.';

CREATE OR REPLACE FUNCTION control.resolve_company_fiscal_calendar(p_tenant_id uuid, p_company_code_id uuid, p_fiscal_year integer)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'control', 'pg_temp'
AS $function$
    SELECT a.fiscal_calendar_config_id
      FROM control.company_fiscal_calendar_assignment a
      JOIN control.fiscal_calendar_config c
        ON c.tenant_id = a.tenant_id
       AND c.id = a.fiscal_calendar_config_id
       AND c.status = 'active'
     WHERE a.tenant_id = p_tenant_id
       AND a.company_code_id = p_company_code_id
       AND a.status = 'active'
       AND a.effective_fiscal_year_from <= p_fiscal_year
       AND (a.effective_fiscal_year_to IS NULL OR a.effective_fiscal_year_to >= p_fiscal_year)
     ORDER BY a.priority DESC, a.effective_fiscal_year_from DESC
     LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION control.resolve_effective_lifecycle_hooks(p_tenant_id uuid, p_transition_id uuid)
 RETURNS TABLE(effective_hook_id uuid, source_hook_id uuid, override_id uuid, scope_tenant_id uuid, transition_id uuid, timing text, sort_order integer, action text, config jsonb, safety_level text, contract_role text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'control', 'pg_catalog'
AS $function$
    WITH platform_hooks AS (
        SELECT h.*
          FROM control.lifecycle_transition_hook h
         WHERE h.transition_id = p_transition_id
           AND h.tenant_id IS NULL
           AND h.is_active
    ), applicable_overrides AS (
        SELECT o.*, h.sort_order AS target_sort_order
          FROM platform_hooks h
          JOIN control.lifecycle_hook_override o
            ON p_tenant_id IS NOT NULL
           AND o.tenant_id = p_tenant_id
           AND o.target_hook_id = h.id
           AND o.is_active
           AND (
                (o.override_kind IN ('suppress', 'replace')
                 AND h.safety_level = 'replaceable')
                OR
                (o.override_kind IN ('add_before', 'add_after')
                 AND h.safety_level <> 'required')
           )
    ), effective_hooks AS (
        -- Platform base. add_before/add_after retain the original hook;
        -- suppress/replace remove it from the effective set.
        SELECT h.id AS effective_hook_id,
               h.id AS source_hook_id,
               NULL::uuid AS override_id,
               p_tenant_id AS scope_tenant_id,
               h.transition_id,
               h.timing,
               (h.sort_order::integer * 10) AS sort_order,
               h.action,
               h.config,
               h.safety_level,
               h.contract_role
          FROM platform_hooks h
          LEFT JOIN applicable_overrides o ON o.target_hook_id = h.id
         WHERE coalesce(o.override_kind, '') NOT IN ('suppress', 'replace')

        UNION ALL

        -- Replacement/injected hook. A non-zero override sort_order is an
        -- explicit slot; otherwise additions are placed around the target.
        SELECT o.id AS effective_hook_id,
               h.id AS source_hook_id,
               o.id AS override_id,
               p_tenant_id AS scope_tenant_id,
               h.transition_id,
               h.timing,
               CASE
                   WHEN o.sort_order <> 0 THEN o.sort_order::integer * 10
                   WHEN o.override_kind = 'add_before' THEN h.sort_order::integer * 10 - 1
                   WHEN o.override_kind = 'add_after'  THEN h.sort_order::integer * 10 + 1
                   ELSE h.sort_order::integer * 10
               END AS sort_order,
               o.replacement_action AS action,
               coalesce(o.replacement_config, h.config) AS config,
               h.safety_level,
               h.contract_role
          FROM platform_hooks h
          JOIN applicable_overrides o ON o.target_hook_id = h.id
         WHERE o.override_kind IN ('replace', 'add_before', 'add_after')

        UNION ALL

        -- Tenant-native hooks are independent additions and retain their
        -- tenant-layer sort slots.
        SELECT h.id AS effective_hook_id,
               h.id AS source_hook_id,
               NULL::uuid AS override_id,
               p_tenant_id AS scope_tenant_id,
               h.transition_id,
               h.timing,
               (h.sort_order::integer * 10) AS sort_order,
               h.action,
               h.config,
               h.safety_level,
               h.contract_role
          FROM control.lifecycle_transition_hook h
         WHERE p_tenant_id IS NOT NULL
           AND h.transition_id = p_transition_id
           AND h.tenant_id = p_tenant_id
           AND h.is_active
    )
    SELECT eh.effective_hook_id,
           eh.source_hook_id,
           eh.override_id,
           eh.scope_tenant_id,
           eh.transition_id,
           eh.timing,
           eh.sort_order,
           eh.action,
           eh.config,
           eh.safety_level,
           eh.contract_role
      FROM effective_hooks eh
     ORDER BY eh.sort_order, eh.effective_hook_id;
$function$;

COMMENT ON FUNCTION "control".resolve_effective_lifecycle_hooks(p_tenant_id uuid, p_transition_id uuid) IS 'Returns the canonical tenant-effective lifecycle hook set. Applies suppress, replace, add_before, and add_after overrides according to hook safety level, includes tenant-native hooks, and orders deterministically.';

CREATE OR REPLACE FUNCTION control.resolve_entry_account(p_tenant_id uuid, p_account_source text, p_posting_role_code text, p_account_code text, p_account_lookup_key text, p_account_fallback text, p_company_code_id uuid, p_book_code text DEFAULT 'statutory'::text, p_intent_id uuid DEFAULT NULL::uuid, p_commodity_category_id uuid DEFAULT NULL::uuid, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".resolve_entry_account(p_tenant_id uuid, p_account_source text, p_posting_role_code text, p_account_code text, p_account_lookup_key text, p_account_fallback text, p_company_code_id uuid, p_book_code text, p_intent_id uuid, p_commodity_category_id uuid, p_as_of_date date) IS 'Per-line GL account resolution building block. Handles all 4 account_source modes: POSTING_ROLE → resolve_posting_role_account() → account_fallback, FIXED → company operating COA gl_account by code, FROM_INTENT → company-aware business_intent default GL, FROM_CATEGORY → company buy policy / intent default GL. Called by the JE generation orchestrator for each entry template line. Returns JSONB: gl_account_id, method, fallback_used, resolved.';

CREATE OR REPLACE FUNCTION control.resolve_finance_posting_rollout_mode(p_tenant_id uuid, p_company_code_id uuid, p_as_of date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'control', 'pg_catalog'
AS $function$
  SELECT COALESCE((
    SELECT policy.rollout_mode
      FROM control.finance_posting_rollout_policy policy
     WHERE policy.tenant_id=p_tenant_id AND policy.status='active' AND policy.effective_from<=p_as_of
       AND (policy.company_code_id IS NULL OR policy.company_code_id=p_company_code_id)
     ORDER BY (policy.company_code_id IS NOT NULL) DESC,policy.effective_from DESC
     LIMIT 1
  ),'observe')
$function$;

COMMENT ON FUNCTION "control".resolve_finance_posting_rollout_mode(p_tenant_id uuid, p_company_code_id uuid, p_as_of date) IS 'Resolves Company override before tenant default. Missing policy is fail-safe observation mode.';

CREATE OR REPLACE FUNCTION control.resolve_intent_to_profile(p_tenant_id uuid, p_intent_id uuid, p_intent_domain text, p_direction text, p_flow_code text, p_company_code_id uuid, p_doc_type text, p_currency_code text, p_amount numeric, p_is_cross_border boolean, p_is_intercompany boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".resolve_intent_to_profile(p_tenant_id uuid, p_intent_id uuid, p_intent_domain text, p_direction text, p_flow_code text, p_company_code_id uuid, p_doc_type text, p_currency_code text, p_amount numeric, p_is_cross_border boolean, p_is_intercompany boolean) IS 'Step 4 of the procurement intake pipeline. Checks regulatory intent_profile_override first, then walks intent_to_accounting_profile_rule with NULL-wildcard predicate matching. Returns first match or FAILED. Called by IntentResolutionService.ts.';

CREATE OR REPLACE FUNCTION control.resolve_posting_role_account(p_tenant_id uuid, p_role_code text, p_company_code_id uuid, p_book_code text, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'master', 'shared', 'pg_temp'
AS $function$
DECLARE
    v_trace jsonb;
BEGIN
    v_trace := control.resolve_posting_role_account_trace(
        p_tenant_id, p_role_code, p_company_code_id, p_book_code, p_as_of_date
    );
    IF v_trace->>'status' <> 'resolved' THEN RETURN NULL; END IF;
    RETURN (v_trace->>'glAccountId')::uuid;
END;
$function$;

COMMENT ON FUNCTION "control".resolve_posting_role_account(p_tenant_id uuid, p_role_code text, p_company_code_id uuid, p_book_code text, p_as_of_date date) IS 'Resolves a posting role code to a GL account UUID for a given company/book/date. Called by resolve_entry_account(). Returns NULL if no mapping found — caller is responsible for fallback handling. Phase 1 stub: looks up control.posting_role_account_map if it exists, otherwise returns NULL.';

CREATE OR REPLACE FUNCTION control.resolve_posting_role_account_trace(p_tenant_id uuid, p_role_code text, p_company_code_id uuid, p_book_code text, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'master', 'shared', 'pg_temp'
AS $function$
DECLARE
    v_normalized text := lower(btrim(COALESCE(p_role_code, '')));
    v_canonical text;
    v_book master.ledger_book%ROWTYPE;
    v_map control.posting_role_account_map%ROWTYPE;
    v_account record;
    v_candidate_count integer := 0;
    v_steps jsonb := '[]'::jsonb;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Posting-role resolution tenant does not match the active tenant session'
            USING ERRCODE = '42501';
    END IF;

    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step', 'normalize_role', 'input', p_role_code, 'normalized', v_normalized,
        'matched', v_normalized <> ''
    ));
    v_canonical := control.canonical_posting_role_code(p_tenant_id, v_normalized);
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step', 'canonical_role', 'input', v_normalized, 'canonicalRoleCode', v_canonical,
        'matched', v_canonical IS NOT NULL
    ));
    IF v_canonical IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'unknown_role', 'reasonCode', 'posting_role_unknown',
            'inputRoleCode', p_role_code, 'canonicalRoleCode', NULL, 'steps', v_steps
        );
    END IF;

    SELECT lb.* INTO v_book
      FROM master.ledger_book lb
      JOIN master.company_code_book_assignment ba
        ON ba.tenant_id = lb.tenant_id AND ba.book_id = lb.id
     WHERE lb.tenant_id = p_tenant_id
       AND ba.company_code_id = p_company_code_id
       AND lower(lb.code) = lower(btrim(p_book_code))
       AND lb.status = 'active'
       AND ba.status = 'active'
       AND ba.effective_from <= p_as_of_date
       AND (ba.effective_to IS NULL OR ba.effective_to >= p_as_of_date)
     ORDER BY ba.priority DESC
     LIMIT 1;
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step', 'resolve_book', 'bookCode', p_book_code, 'ledgerBookId', v_book.id,
        'matched', v_book.id IS NOT NULL
    ));
    IF v_book.id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'book_not_assigned', 'reasonCode', 'posting_role_book_not_assigned',
            'inputRoleCode', p_role_code, 'canonicalRoleCode', v_canonical,
            'bookCode', p_book_code, 'asOfDate', p_as_of_date, 'steps', v_steps
        );
    END IF;

    SELECT count(*)::integer INTO v_candidate_count
      FROM control.posting_role_account_map m
     WHERE m.tenant_id = p_tenant_id
       AND m.company_code_id = p_company_code_id
       AND m.ledger_book_id = v_book.id
       AND m.posting_role_code = v_canonical
       AND m.status = 'active'
       AND m.effective_from <= p_as_of_date
       AND (m.effective_to IS NULL OR m.effective_to >= p_as_of_date);

    SELECT m.* INTO v_map
      FROM control.posting_role_account_map m
     WHERE m.tenant_id = p_tenant_id
       AND m.company_code_id = p_company_code_id
       AND m.ledger_book_id = v_book.id
       AND m.posting_role_code = v_canonical
       AND m.status = 'active'
       AND m.effective_from <= p_as_of_date
       AND (m.effective_to IS NULL OR m.effective_to >= p_as_of_date)
     ORDER BY m.priority DESC, m.effective_from DESC, m.id
     LIMIT 1;
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step', 'select_mapping', 'candidateCount', v_candidate_count,
        'mappingId', v_map.id, 'priority', v_map.priority, 'matched', v_map.id IS NOT NULL
    ));
    IF v_map.id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'missing_mapping', 'reasonCode', 'posting_role_mapping_missing',
            'inputRoleCode', p_role_code, 'canonicalRoleCode', v_canonical,
            'ledgerBookId', v_book.id, 'bookCode', v_book.code,
            'asOfDate', p_as_of_date, 'candidateCount', 0, 'steps', v_steps
        );
    END IF;

    SELECT ga.id, ga.code, ga.name, ga.status, ga.node_type, ga.normal_balance,
           COALESCE(ccga.posting_allowed, true) AS posting_allowed,
           COALESCE(ccga.blocked_for_auto, false) AS blocked_for_auto
      INTO v_account
      FROM master.gl_account ga
      LEFT JOIN master.company_code_gl_account ccga
        ON ccga.tenant_id = ga.tenant_id
       AND ccga.company_code_id = p_company_code_id
       AND ccga.gl_account_id = ga.id
     WHERE ga.tenant_id = p_tenant_id AND ga.id = v_map.gl_account_id;
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step', 'validate_account', 'glAccountId', v_account.id,
        'accountCode', v_account.code,
        'activePostingAccount', v_account.status = 'active' AND v_account.node_type = 'posting',
        'postingAllowed', v_account.posting_allowed,
        'blockedForAuto', v_account.blocked_for_auto
    ));
    IF v_account.id IS NULL OR v_account.status <> 'active' OR v_account.node_type <> 'posting'
       OR NOT v_account.posting_allowed OR v_account.blocked_for_auto THEN
        RETURN jsonb_build_object(
            'status', 'invalid_account', 'reasonCode', 'posting_role_account_not_postable',
            'inputRoleCode', p_role_code, 'canonicalRoleCode', v_canonical,
            'mappingId', v_map.id, 'ledgerBookId', v_book.id, 'bookCode', v_book.code,
            'asOfDate', p_as_of_date, 'steps', v_steps
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'resolved', 'reasonCode', 'posting_role_resolved',
        'inputRoleCode', p_role_code, 'canonicalRoleCode', v_canonical,
        'mappingId', v_map.id, 'ledgerBookId', v_book.id, 'bookCode', v_book.code,
        'glAccountId', v_account.id, 'glAccountCode', v_account.code,
        'glAccountName', v_account.name, 'normalBalance', v_account.normal_balance,
        'priority', v_map.priority, 'effectiveFrom', v_map.effective_from,
        'effectiveTo', v_map.effective_to, 'asOfDate', p_as_of_date,
        'candidateCount', v_candidate_count, 'steps', v_steps
    );
END;
$function$;

CREATE OR REPLACE FUNCTION control.resolve_workflow_definition(p_tenant_id uuid, p_entity_type text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(definition_id uuid, template_code text, workflow_type text, matched_rule jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".resolve_workflow_definition(p_tenant_id uuid, p_entity_type text, p_payload jsonb) IS 'Resolves which workflow_definition and template apply to an entity. Finds the active, currently-effective definition for the entity_type. Evaluates rules in order — first match wins (NULL condition = always). Complex JSONLogic conditions are deferred to the TypeScript runtime. Returns NULL (no rows) if no workflow is required.';

CREATE OR REPLACE FUNCTION control.trg_acbp_class_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION control.trg_acbp_validate_book_code()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION control.trg_acbp_validate_posting_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control', 'master', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".trg_acbp_validate_posting_roles() IS 'Validates posting role code format on asset_class_book_policy. Mapping resolution check (role → GL account) is deferred to seed assertions and runtime because the role-account map may not be populated at DDL time.';

CREATE OR REPLACE FUNCTION control.trg_authorization_v2_guard_entity_operation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control', 'pg_catalog'
AS $function$
BEGIN
    IF NEW.v2_publication_status = 'published' AND NOT EXISTS (
        SELECT 1 FROM control.auth_permission p
        WHERE p.id = NEW.permission_id_v2
          AND p.entity_id = NEW.entity_id_v2
          AND p.operation_code = NEW.operation_code_v2
          AND p.status = 'published'
    ) THEN
        RAISE EXCEPTION 'published operation requires one exact published permission' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION control.trg_authorization_v2_guard_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control', 'shared', 'pg_catalog'
AS $function$
BEGIN
    IF NEW.status = 'published' AND NOT EXISTS (
        SELECT 1 FROM shared.auth_permission_category c
        WHERE c.id = NEW.category_id AND c.status = 'active'
    ) THEN
        RAISE EXCEPTION 'published permission requires an active category' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION control.trg_authorization_v2_guard_scope_binding()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control', 'pg_catalog'
AS $function$
BEGIN
    IF NEW.status = 'published' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM control.entity_operation operation
            JOIN control.auth_permission permission
              ON permission.id = operation.permission_id_v2
            WHERE operation.id = NEW.entity_operation_id
              AND operation.permission_id_v2 = NEW.permission_id
              AND operation.v2_publication_status = 'published'
              AND permission.status = 'published'
              AND (
                  permission.plane_code::text = NEW.plane_code
                  OR permission.plane_code = 'all'
              )
        ) THEN
            RAISE EXCEPTION
                'published scope binding requires an exact plane-eligible operation permission'
                USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM control.auth_permission_scope_policy policy
            WHERE policy.id = NEW.scope_policy_id
              AND policy.permission_id = NEW.permission_id
              AND policy.scope_kind = NEW.scope_kind
              AND policy.status = 'published'
        ) THEN
            RAISE EXCEPTION
                'published scope binding requires the exact scope policy'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION control.trg_authorization_v2_guard_scope_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control', 'pg_catalog'
AS $function$
BEGIN
    IF NEW.status = 'published' AND NOT EXISTS (
        SELECT 1 FROM control.auth_permission p
        WHERE p.id = NEW.permission_id AND p.status = 'published'
          AND control.authorization_v2_is_effective(p.effective_from, p.effective_until, statement_timestamp())
    ) THEN
        RAISE EXCEPTION 'published scope policy requires an active exact permission' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION control.trg_enforce_extensibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION control.trg_ensure_entity_publish_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control'
AS $function$
BEGIN
    INSERT INTO control.entity_publish_state (entity_id, tenant_id)
    VALUES (NEW.id, NEW.tenant_id)
    ON CONFLICT (entity_id) DO NOTHING;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "control".trg_ensure_entity_publish_state() IS 'AFTER INSERT on control.entity. Auto-creates the 1:1 entity_publish_state row. ON CONFLICT DO NOTHING prevents duplicates on re-runs.';

CREATE OR REPLACE FUNCTION control.trg_ev_bump_latest_version_no()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control'
AS $function$
BEGIN
    UPDATE control.entity_publish_state
       SET latest_version_no = GREATEST(latest_version_no, NEW.version_no),
           updated_at         = now()
     WHERE entity_id = NEW.entity_id;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "control".trg_ev_bump_latest_version_no() IS 'AFTER INSERT on control.entity_version. Keeps entity_publish_state.latest_version_no at the highest version_no seen for each entity.';

CREATE OR REPLACE FUNCTION control.trg_field_flag_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".trg_field_flag_defaults() IS 'BEFORE INSERT on entity_field. Reads entity_class_profile.field_flag_rules and auto-sets behaviour flags on newly inserted version fields. Replaces entity_field_flag_standard table (eliminated).';

CREATE OR REPLACE FUNCTION control.trg_fn_contract_transition_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'Contract transition evidence is immutable'
        USING ERRCODE = '55000';
END;
$function$;

CREATE OR REPLACE FUNCTION control.trg_fn_entity_version_contract_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.is_working_copy := NEW.status IN ('DRAFT','IN_REVIEW');

    IF TG_OP = 'UPDATE'
       AND OLD.status IN ('IN_REVIEW','EFFECTIVE','SUPERSEDED')
       AND (
           NEW.contract_schema_version IS DISTINCT FROM OLD.contract_schema_version
           OR NEW.contract_document IS DISTINCT FROM OLD.contract_document
           OR NEW.contract_hash IS DISTINCT FROM OLD.contract_hash
       )
    THEN
        RAISE EXCEPTION
            'Canonical contract document is immutable while entity version % is %',
            OLD.id, OLD.status
            USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status = 'DRAFT'
       AND (
           NEW.contract_schema_version IS DISTINCT FROM OLD.contract_schema_version
           OR NEW.contract_document IS DISTINCT FROM OLD.contract_document
           OR NEW.contract_hash IS DISTINCT FROM OLD.contract_hash
       )
       AND NEW.lock_version <> OLD.lock_version + 1
    THEN
        RAISE EXCEPTION
            'Contract update for entity version % must increment lock_version exactly once',
            OLD.id
            USING ERRCODE = '40001';
    END IF;

    -- Legacy seeds may still create versions before seed 101 has converted
    -- their generic behaviors payload. Once a row participates in canonical
    -- storage, however, it cannot advance without a complete valid document.
    IF NEW.status IN ('IN_REVIEW','APPROVED','EFFECTIVE')
       AND (
           NEW.contract_schema_version IS NOT NULL
           OR NEW.contract_document IS NOT NULL
           OR NEW.contract_hash IS NOT NULL
       )
       AND (
           NEW.contract_document IS NULL
           OR NEW.contract_schema_version IS NULL
           OR NEW.contract_hash IS NULL
           OR NEW.validation_status <> 'VALID'
       )
    THEN
        RAISE EXCEPTION
            'Entity version % cannot enter % without a valid canonical contract',
            NEW.id, NEW.status
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.trg_fn_flow_field_one_writer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_flow_id      uuid;
  v_writer_count bigint;
BEGIN
  IF NEW.mode NOT IN ('required', 'editable') THEN
    RETURN NEW;
  END IF;

  SELECT efs.flow_id INTO v_flow_id
    FROM control.entity_flow_step efs
   WHERE efs.id = NEW.flow_step_id;

  PERFORM 1
    FROM control.entity_flow ef
   WHERE ef.id = v_flow_id
   FOR UPDATE;

  SELECT count(*) INTO v_writer_count
    FROM control.entity_flow_field  eff
    JOIN control.entity_flow_step   efs ON efs.id = eff.flow_step_id
   WHERE efs.flow_id          = v_flow_id
     AND eff.entity_field_id  = NEW.entity_field_id
     AND eff.mode             IN ('required', 'editable')
     AND COALESCE(eff.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_writer_count > 1 THEN
    RAISE EXCEPTION
      'entity_flow_field: at most one write-capable binding (required/editable) per flow and field; found % bindings for entity_field_id=%',
      v_writer_count, NEW.entity_field_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.trg_fn_flow_field_validate_perm()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.override_permission IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM control.auth_permission
       WHERE canonical_code = NEW.override_permission
         AND status = 'published'
    ) THEN
      RAISE EXCEPTION
        'entity_flow_field: override_permission "%" not found in the published canonical catalog',
        NEW.override_permission;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.trg_fn_flow_field_validate_section()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.section_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM control.entity_flow_section efsec
     WHERE efsec.flow_step_id = NEW.flow_step_id
       AND efsec.section_key  = NEW.section_key
       AND COALESCE(efsec.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(NEW.tenant_id,   '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION
      'entity_flow_field: section_key "%" not found in entity_flow_section for flow_step_id=%',
      NEW.section_key, NEW.flow_step_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.trg_fn_flow_section_validate_entity_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.entity_code IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM control.entity e
     WHERE e.entity_code = NEW.entity_code
       AND e.is_active = true
       AND (
         e.tenant_id IS NULL
         OR e.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
       )
  ) THEN
    RAISE EXCEPTION
      'entity_flow_section: entity_code "%" does not reference an active control.entity for tenant_id=%',
      NEW.entity_code, COALESCE(NEW.tenant_id::text, '<platform>');
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.trg_fn_maintain_entity_publish_state()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO control.entity_publish_state (
        entity_id, tenant_id, published_version_id, current_draft_version_id,
        latest_version_no, updated_at, updated_by
    )
    VALUES (
        NEW.entity_id,
        NEW.tenant_id,
        CASE WHEN NEW.status = 'EFFECTIVE' THEN NEW.id ELSE NULL END,
        CASE WHEN NEW.status IN ('DRAFT','IN_REVIEW') THEN NEW.id ELSE NULL END,
        NEW.version_no,
        now(),
        COALESCE(NEW.updated_by, NEW.created_by)
    )
    ON CONFLICT (entity_id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        published_version_id = CASE
            WHEN NEW.status = 'EFFECTIVE' THEN NEW.id
            ELSE control.entity_publish_state.published_version_id
        END,
        current_draft_version_id = CASE
            WHEN NEW.status IN ('DRAFT','IN_REVIEW') THEN NEW.id
            WHEN control.entity_publish_state.current_draft_version_id = NEW.id THEN NULL
            ELSE control.entity_publish_state.current_draft_version_id
        END,
        latest_version_no = GREATEST(
            control.entity_publish_state.latest_version_no,
            NEW.version_no
        ),
        updated_at = now(),
        updated_by = COALESCE(NEW.updated_by, NEW.created_by);

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.trg_fn_validate_contract_projection_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_version_id uuid;
    v_version_tenant uuid;
    v_version_entity_id uuid;
    v_entity_code text;
    v_parent_tenant uuid;
    v_parent_version uuid;
    v_field_version uuid;
    v_field_tenant uuid;
    v_parent_entity_code text;
    v_field_entity_code text;
    v_section_entity_code text;
    v_relation_field_version uuid;
    v_relation_field_owner text;
BEGIN
    IF TG_TABLE_NAME = 'entity_field_surface' THEN
        SELECT s.entity_version_id, s.tenant_id, f.entity_version_id, f.tenant_id
          INTO v_parent_version, v_parent_tenant, v_field_version, v_field_tenant
          FROM control.entity_surface s
          JOIN control.entity_field f ON f.id = NEW.entity_field_id
         WHERE s.id = NEW.entity_surface_id;

        IF NOT FOUND
           OR NEW.tenant_id IS DISTINCT FROM v_parent_tenant
           OR NEW.tenant_id IS DISTINCT FROM v_field_tenant
        THEN
            RAISE EXCEPTION
                'Surface binding, surface, and field must belong to the same entity version and tenant'
                USING ERRCODE = '23514';
        END IF;
        -- Legacy seed bindings are entity-scoped until seed 101 backfills the
        -- surface version. Version equality becomes mandatory immediately
        -- once the surface is version-owned.
        IF v_parent_version IS NOT NULL
           AND v_parent_version IS DISTINCT FROM v_field_version
        THEN
            RAISE EXCEPTION
                'Version-owned surface and field must belong to the same entity version'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'entity_flow_step' THEN
        SELECT entity_version_id, tenant_id
          INTO v_parent_version, v_parent_tenant
          FROM control.entity_flow WHERE id = NEW.flow_id;
        IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM v_parent_tenant THEN
            RAISE EXCEPTION 'Flow step tenant must match its flow' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'entity_flow_section' THEN
        SELECT f.entity_version_id, s.tenant_id
          INTO v_parent_version, v_parent_tenant
          FROM control.entity_flow_step s
          JOIN control.entity_flow f ON f.id = s.flow_id
         WHERE s.id = NEW.flow_step_id;
        IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM v_parent_tenant THEN
            RAISE EXCEPTION 'Flow section tenant must match its flow' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'entity_flow_field' THEN
        SELECT fl.entity_version_id, st.tenant_id, ef.entity_version_id, ef.tenant_id,
               flow_entity.entity_code, field_entity.entity_code
          INTO v_parent_version, v_parent_tenant, v_field_version, v_field_tenant,
               v_parent_entity_code, v_field_entity_code
          FROM control.entity_flow_step st
          JOIN control.entity_flow fl ON fl.id = st.flow_id
          JOIN control.entity_version flow_version ON flow_version.id = fl.entity_version_id
          JOIN control.entity flow_entity ON flow_entity.id = flow_version.entity_id
          JOIN control.entity_field ef ON ef.id = NEW.entity_field_id
          JOIN control.entity_version field_version ON field_version.id = ef.entity_version_id
         JOIN control.entity field_entity ON field_entity.id = field_version.entity_id
         WHERE st.id = NEW.flow_step_id;

        v_section_entity_code := NULL;
        IF NEW.section_key IS NOT NULL THEN
            SELECT section.entity_code
              INTO v_section_entity_code
              FROM control.entity_flow_section section
             WHERE section.flow_step_id = NEW.flow_step_id
               AND section.section_key = NEW.section_key
               AND section.tenant_id IS NOT DISTINCT FROM NEW.tenant_id;
        END IF;

        IF NOT FOUND
           OR NEW.tenant_id IS DISTINCT FROM v_parent_tenant
           OR NEW.tenant_id IS DISTINCT FROM v_field_tenant
           OR (
                (
                    v_section_entity_code IS NULL
                    OR v_section_entity_code = v_parent_entity_code
                )
                AND v_parent_version IS DISTINCT FROM v_field_version
           )
           OR (
                v_section_entity_code IS NOT NULL
                AND v_section_entity_code <> v_parent_entity_code
                AND v_field_entity_code IS DISTINCT FROM v_section_entity_code
           )
        THEN
            RAISE EXCEPTION
                'Flow field % (% version %), step %, flow % version %, binding tenant %, flow tenant %, field tenant % must share version and tenant',
                NEW.entity_field_id,
                v_field_entity_code,
                v_field_version,
                NEW.flow_step_id,
                v_parent_entity_code,
                v_parent_version,
                NEW.tenant_id,
                v_parent_tenant,
                v_field_tenant
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'entity_relation' AND NEW.entity_version_id IS NOT NULL THEN
        SELECT ev.tenant_id, ev.entity_id
          INTO v_version_tenant, v_version_entity_id
          FROM control.entity_version ev
         WHERE ev.id = NEW.entity_version_id;
        IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM v_version_tenant THEN
            RAISE EXCEPTION 'Relation tenant must match its entity version' USING ERRCODE = '23514';
        END IF;
        -- A belongs_to or array_fk field is stored on this entity version. A
        -- normal has_many FK is stored on the target/child entity version.
        -- Keep this aligned with metadata-graph-validator; otherwise valid
        -- parent collections such as purchase_order.lines
        -- (commitment_line.commitment_id) are rejected.
        v_relation_field_version := NEW.entity_version_id;
        v_relation_field_owner := 'source';
        IF NEW.relation_kind = 'has_many'
           AND NEW.resolution_kind IS DISTINCT FROM 'array_fk'
           AND COALESCE(NEW.fk_field, NEW.source_field) IS NOT NULL
        THEN
            SELECT target_version.id
              INTO v_relation_field_version
              FROM control.entity target
              JOIN control.entity_version target_version
                ON target_version.entity_id = target.id
               AND target_version.status = 'EFFECTIVE'
             WHERE (
                    target.entity_code = COALESCE(NEW.target_entity_code, NEW.target_entity)
                 OR target.name = COALESCE(NEW.target_entity_code, NEW.target_entity)
                 OR target.table_name = COALESCE(NEW.target_entity_code, NEW.target_entity)
             )
               AND (
                    target.tenant_id IS NULL
                 OR target.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               )
             ORDER BY
               (target.tenant_id IS NOT DISTINCT FROM NEW.tenant_id) DESC,
               target_version.version_no DESC
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION
                    'Relation target entity % has no EFFECTIVE version',
                    COALESCE(NEW.target_entity_code, NEW.target_entity)
                    USING ERRCODE = '23503';
            END IF;
            v_relation_field_owner := 'target';
        END IF;

        -- During legacy conversion some registered physical columns have not
        -- yet been projected into entity_field. Accept that bounded physical
        -- backing as compatibility evidence; a field absent from both the
        -- selected version and its registered table still fails closed.
        -- Legacy repair seeds update fk_field. Prefer it over a source_field
        -- value backfilled by an earlier v2 conversion; the projector writes
        -- both columns identically for canonical rows.
        IF COALESCE(NEW.fk_field, NEW.source_field) IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM control.entity_field f
                WHERE f.entity_version_id = v_relation_field_version
                  AND f.name = COALESCE(NEW.fk_field, NEW.source_field)
           )
           AND NOT EXISTS (
               SELECT 1
                 FROM control.entity_version physical_version
                 JOIN control.entity physical_entity
                   ON physical_entity.id = physical_version.entity_id
                 JOIN information_schema.columns physical_column
                  ON physical_column.table_schema = physical_entity.table_schema
                  AND physical_column.table_name = physical_entity.table_name
                  AND physical_column.column_name =
                      COALESCE(NEW.fk_field, NEW.source_field)
                WHERE physical_version.id = v_relation_field_version
           )
        THEN
            RAISE EXCEPTION
                'Relation % field % does not belong to entity version %',
                v_relation_field_owner,
                COALESCE(NEW.fk_field, NEW.source_field),
                v_relation_field_version
                USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM control.entity target
             WHERE target.entity_code = COALESCE(NEW.target_entity_code, NEW.target_entity)
                OR target.name = COALESCE(NEW.target_entity_code, NEW.target_entity)
                OR target.table_name = COALESCE(NEW.target_entity_code, NEW.target_entity)
        ) THEN
            RAISE EXCEPTION
                'Relation target entity % is not registered',
                COALESCE(NEW.target_entity_code, NEW.target_entity)
                USING ERRCODE = '23503';
        END IF;
        RETURN NEW;
    END IF;

    v_version_id := CASE TG_TABLE_NAME
        WHEN 'entity_surface' THEN NEW.entity_version_id
        WHEN 'entity_operation' THEN NEW.entity_version_id
        WHEN 'entity_policy' THEN NEW.entity_version_id
        WHEN 'entity_numbering_config' THEN NEW.entity_version_id
        WHEN 'entity_lifecycle' THEN NEW.entity_version_id
        WHEN 'entity_lifecycle_state_mask' THEN NEW.entity_version_id
        WHEN 'entity_action_rule' THEN NEW.entity_version_id
        WHEN 'entity_flow' THEN NEW.entity_version_id
        ELSE NULL
    END;

    IF v_version_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT ev.tenant_id, ev.entity_id, e.entity_code
      INTO v_version_tenant, v_version_entity_id, v_entity_code
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ev.id = v_version_id;

    IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM v_version_tenant THEN
        RAISE EXCEPTION
            '% must use the tenant of its entity version', TG_TABLE_NAME
            USING ERRCODE = '23514';
    END IF;

    -- NEW is a polymorphic trigger record. Never reference a table-specific
    -- member in the same SQL expression that checks TG_TABLE_NAME: PostgreSQL
    -- may resolve the missing member before boolean short-circuiting.
    IF TG_TABLE_NAME IN ('entity_surface','entity_policy','entity_numbering_config') THEN
        IF NEW.entity_id IS DISTINCT FROM v_version_entity_id THEN
            RAISE EXCEPTION
                '% entity_id must match its entity version', TG_TABLE_NAME
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF TG_TABLE_NAME IN ('entity_operation','entity_lifecycle') THEN
        IF NEW.entity_name IS DISTINCT FROM v_entity_code THEN
            RAISE EXCEPTION
                '% entity_name must match its entity version', TG_TABLE_NAME
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'entity_lifecycle_state_mask' THEN
        IF NEW.entity_name IS DISTINCT FROM v_entity_code THEN
            RAISE EXCEPTION
                'Lifecycle state mask entity_name must match its entity version'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.lifecycle_state_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
                 FROM control.lifecycle_state state
                 JOIN control.entity_lifecycle binding
                   ON binding.lifecycle_id = state.lifecycle_id
                  AND binding.entity_version_id = NEW.entity_version_id
                  AND binding.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
                WHERE state.id = NEW.lifecycle_state_id
                  AND state.code = NEW.record_status
           )
        THEN
            RAISE EXCEPTION
                'Lifecycle state mask must reference a state bound to the same entity version and status'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'entity_action_rule' THEN
        IF NEW.entity_code IS DISTINCT FROM v_entity_code THEN
            RAISE EXCEPTION
                'Action rule entity_code must match its entity version'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.trg_fn_validate_entity_binding()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".trg_fn_validate_entity_binding() IS 'Validates entity_name against control.entity.entity_code. Resolves platform rows (entity_code with tenant_id IS NULL) always; tenant-scoped rows also resolve against their own tenant entities. Attached to entity_lifecycle and entity_operation BEFORE INSERT OR UPDATE.';

CREATE OR REPLACE FUNCTION control.trg_fn_validate_entity_publish_state()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_entity_id uuid;
    v_tenant_id uuid;
    v_status text;
BEGIN
    IF NEW.published_version_id IS NOT NULL THEN
        SELECT entity_id, tenant_id, status
          INTO v_entity_id, v_tenant_id, v_status
          FROM control.entity_version
         WHERE id = NEW.published_version_id;

        IF NOT FOUND
           OR v_entity_id IS DISTINCT FROM NEW.entity_id
           OR v_tenant_id IS DISTINCT FROM NEW.tenant_id
           OR v_status <> 'EFFECTIVE'
        THEN
            RAISE EXCEPTION
                'published_version_id must reference an EFFECTIVE version of the same entity and tenant'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.current_draft_version_id IS NOT NULL THEN
        SELECT entity_id, tenant_id, status
          INTO v_entity_id, v_tenant_id, v_status
          FROM control.entity_version
         WHERE id = NEW.current_draft_version_id;

        IF NOT FOUND
           OR v_entity_id IS DISTINCT FROM NEW.entity_id
           OR v_tenant_id IS DISTINCT FROM NEW.tenant_id
           OR v_status NOT IN ('DRAFT','IN_REVIEW')
        THEN
            RAISE EXCEPTION
                'current_draft_version_id must reference an open version of the same entity and tenant'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.trg_fn_validate_ready_publish_state()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_status text;
    v_contract_hash text;
    v_projection_hash text;
BEGIN
    IF NEW.readiness_status <> 'READY' THEN
        RETURN NEW;
    END IF;
    IF NEW.published_version_id IS NULL
       OR NEW.contract_hash IS NULL
       OR NEW.materialized_hash IS NULL
       OR NEW.admin_compiled_hash IS NULL
       OR NEW.neon_compiled_hash IS NULL
       OR NEW.mesh_compiled_hash IS NULL
       OR NEW.ready_at IS NULL
    THEN
        RAISE EXCEPTION 'READY publication requires pointer and all materialized/compiled hashes'
            USING ERRCODE = '23514';
    END IF;

    SELECT status, contract_hash, projection_hash
      INTO v_status, v_contract_hash, v_projection_hash
      FROM control.entity_version
     WHERE id=NEW.published_version_id
       AND entity_id=NEW.entity_id
       AND tenant_id IS NOT DISTINCT FROM NEW.tenant_id;
    IF NOT FOUND
       OR v_status <> 'EFFECTIVE'
       OR v_contract_hash IS DISTINCT FROM NEW.contract_hash
       OR v_projection_hash IS DISTINCT FROM NEW.materialized_hash
    THEN
        RAISE EXCEPTION 'READY hashes and pointer must match the EFFECTIVE entity version'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.trg_fn_validate_target_entity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".trg_fn_validate_target_entity() IS 'Validates entity_relation.target_entity against control.entity.entity_code. Platform-global: any registered entity (including tenant-owned) may be targeted. Attached to entity_relation BEFORE INSERT OR UPDATE OF target_entity.';

CREATE OR REPLACE FUNCTION control.trg_fn_version_policy_rule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_next_version integer;
  v_principal_id uuid;
BEGIN
  SELECT COALESCE(MAX(version_no), 0) + 1
    INTO v_next_version
    FROM control.policy_rule_version
   WHERE policy_rule_id = OLD.id;

  BEGIN
    v_principal_id := current_setting('app.principal_id', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_principal_id := NULL;
  END;

  UPDATE control.policy_rule_version
     SET effective_until = now(),
         updated_at      = now()
   WHERE policy_rule_id = OLD.id
     AND effective_until IS NULL;

  INSERT INTO control.policy_rule_version (
    tenant_id,
    policy_rule_id,
    policy_id,
    version_no,
    rule_snapshot,
    effective_from,
    effective_until,
    published_by,
    published_at
  ) VALUES (
    OLD.tenant_id,
    OLD.id,
    OLD.policy_id,
    v_next_version,
    to_jsonb(OLD),
    COALESCE(OLD.updated_at, OLD.created_at, now()),
    now(),
    v_principal_id,
    now()
  );

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "control".trg_fn_version_policy_rule() IS 'BEFORE UPDATE trigger on control.policy_rule. Closes the previous policy_rule_version row (sets effective_until) and inserts a snapshot of the OLD row as a new version. Enables full rule change audit trail.';

CREATE OR REPLACE FUNCTION control.trg_guard_mfa_contact_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".trg_guard_mfa_contact_link() IS 'Guards mfa_config.contact_link_id: (1) contact_link exists for tenant, (2) owner_type = ''principal'', (3) owner_id = mfa_config.principal_id, (4) channel_type compatible with method_type.';

CREATE OR REPLACE FUNCTION control.trg_pmcp_validate_bank_link_company()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'control', 'master'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".trg_pmcp_validate_bank_link_company() IS 'Validates that the preferred bank_account_link on a company policy belongs to the same company_code and is a company_code-owned link.';

CREATE OR REPLACE FUNCTION control.trg_validate_lookup_columns()
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

COMMENT ON FUNCTION "control".trg_validate_lookup_columns() IS 'Trigger-based lookup validation. Replaces session-dependent CHECK constraints. Validates against global rows (session-free) first, then tenant extension rows when a session is established and the domain is extensible. Attach with TG_ARGV: domain_code, column_name.';

CREATE OR REPLACE FUNCTION control.trg_validate_posting_role_account_map()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'control', 'master', 'shared', 'pg_temp'
AS $function$
DECLARE
    v_canonical text;
    v_expected_normal text;
    v_account_normal text;
BEGIN
    IF NEW.tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Posting-role map tenant does not match the active tenant session'
            USING ERRCODE = '42501';
    END IF;

    v_canonical := control.canonical_posting_role_code(NEW.tenant_id, NEW.posting_role_code);
    IF v_canonical IS NULL THEN
        RAISE EXCEPTION 'Unknown or inactive posting role: %', NEW.posting_role_code
            USING ERRCODE = '23514';
    END IF;
    NEW.posting_role_code := v_canonical;

    SELECT lower(COALESCE(lv.metadata->>'normal_balance', 'either'))
      INTO v_expected_normal
      FROM control.lookup_value lv
     WHERE lv.domain_code = 'finance.posting_role' AND lv.code = v_canonical
       AND lv.status = 'active' AND (lv.tenant_id = NEW.tenant_id OR lv.tenant_id IS NULL)
     ORDER BY (lv.tenant_id IS NOT NULL) DESC LIMIT 1;

    IF NOT EXISTS (
        SELECT 1
          FROM master.company_code_book_assignment ba
         WHERE ba.tenant_id = NEW.tenant_id
           AND ba.company_code_id = NEW.company_code_id
           AND ba.book_id = NEW.ledger_book_id
           AND ba.status = 'active'
           AND ba.effective_from <= COALESCE(NEW.effective_to, NEW.effective_from)
           AND (ba.effective_to IS NULL OR ba.effective_to >= NEW.effective_from)
    ) THEN
        RAISE EXCEPTION 'Ledger book is not actively assigned to the company for the mapping range'
            USING ERRCODE = '23514';
    END IF;

    SELECT lower(ga.normal_balance) INTO v_account_normal
      FROM master.gl_account ga
     WHERE ga.tenant_id = NEW.tenant_id AND ga.id = NEW.gl_account_id;
    IF COALESCE(v_expected_normal, 'either') IN ('debit','credit')
       AND v_account_normal IS DISTINCT FROM v_expected_normal THEN
        RAISE EXCEPTION 'GL account normal balance % is incompatible with posting role % (%)',
            v_account_normal, v_canonical, v_expected_normal
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM master.gl_account ga
          JOIN master.company_code_chart_assignment ca
            ON ca.tenant_id = ga.tenant_id
           AND ca.chart_of_account_id = ga.chart_of_account_id
           AND ca.company_code_id = NEW.company_code_id
           AND ca.status = 'active'
         WHERE ga.tenant_id = NEW.tenant_id
           AND ga.id = NEW.gl_account_id
           AND ga.status = 'active'
           AND ga.node_type = 'posting'
           AND (ca.effective_from IS NULL OR ca.effective_from <= COALESCE(NEW.effective_to, NEW.effective_from))
           AND (ca.effective_to IS NULL OR ca.effective_to >= NEW.effective_from)
    ) THEN
        RAISE EXCEPTION 'GL account is not an active posting account in a company-assigned chart'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.company_code_gl_account ccga
         WHERE ccga.tenant_id = NEW.tenant_id
           AND ccga.company_code_id = NEW.company_code_id
           AND ccga.gl_account_id = NEW.gl_account_id
           AND (ccga.status <> 'active' OR ccga.posting_allowed = false OR ccga.blocked_for_auto = true)
    ) THEN
        RAISE EXCEPTION 'GL account is blocked for automatic posting in this company'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION control.validate_profile_completeness(p_profile_config_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'control', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".validate_profile_completeness(p_profile_config_id uuid) IS 'Engine 4.13 §F5: profile config completeness check. Errors: no events; events with creates_je=true but no templates. Warnings: mandatory flow-template events not covered; revenue without COGS pair. Stats: event/template/book_rule counts + extension config flags.';

CREATE OR REPLACE FUNCTION control.validate_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'control', 'snapshot'
AS $function$
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
$function$;

COMMENT ON FUNCTION "control".validate_status_transition() IS 'Trigger function: validates entity status transitions against snapshot.status_route.compiled_json. O(1) lookup. Attach via: CREATE TRIGGER ... BEFORE UPDATE OF status ON <table> FOR EACH ROW EXECUTE FUNCTION control.validate_status_transition(''entity_name'');';
