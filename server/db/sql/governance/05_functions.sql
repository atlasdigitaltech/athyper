-- ============================================================================
-- governance/05_functions.sql
-- Concept: Governance Logic — period close cycle materialization and certification
-- Depends on: 04_tables/008_governance.sql, 03_bootstrap_functions/008_governance.sql
-- ============================================================================


-- ============================================================================
-- governance.materialize_cycle_tasks(uuid, varchar)
-- ============================================================================
-- Copies active task templates into cycle_task instances for a given run.
-- due_at computed relative to cycle_start_date + sla_hours.
-- SECURITY DEFINER: bulk-inserts tasks bypassing RLS for atomicity.

CREATE OR REPLACE FUNCTION governance.materialize_cycle_tasks(
    p_cycle_run_id uuid,
    p_blueprint    varchar DEFAULT NULL
) RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = governance, pg_catalog
AS $$
DECLARE
    v_run   governance.cycle_run;
    v_count integer := 0;
BEGIN
    SELECT * INTO v_run FROM governance.cycle_run WHERE id = p_cycle_run_id FOR UPDATE;
    IF v_run IS NULL THEN
        RAISE EXCEPTION 'Cycle run % not found', p_cycle_run_id;
    END IF;

    INSERT INTO governance.cycle_task (
        tenant_id, entity_code, cycle_run_id, template_id, phase_id, category_id,
        task_code, is_mandatory, assigned_role, assigned_to, due_at, created_by)
    SELECT
        v_run.tenant_id, v_run.entity_code, p_cycle_run_id,
        t.id, t.phase_id, t.category_id, t.task_code, t.is_mandatory,
        t.default_owner_role, t.default_owner_user_id,
        CASE WHEN t.sla_hours IS NOT NULL
             THEN v_run.cycle_start_date::timestamptz + (t.sla_hours || ' hours')::interval
             ELSE NULL END,
        v_run.created_by
    FROM governance.cycle_task_template t
    WHERE t.tenant_id = v_run.tenant_id
      AND t.entity_code = v_run.entity_code
      AND t.cycle_type_id = v_run.cycle_type_id
      AND t.is_active = true
      AND (t.blueprint_filter IS NULL OR p_blueprint = ANY(t.blueprint_filter))
    ON CONFLICT (tenant_id, cycle_run_id, task_code) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ============================================================================
-- governance.check_phase_gate(uuid, uuid)
-- ============================================================================
-- Phase-scoped readiness check. Returns whether the gate is passed, blocker
-- details, and readiness percentage. Approved deviations count as resolved.

CREATE OR REPLACE FUNCTION governance.check_phase_gate(
    p_cycle_run_id    uuid,
    p_target_phase_id uuid
) RETURNS TABLE(
    gate_passed       boolean,
    blockers_cleared  boolean,
    readiness_passed  boolean,
    pending_count     integer,
    pending_tasks     text[],
    phase_readiness   numeric,
    required_readiness numeric
)
    LANGUAGE plpgsql STABLE
    SET search_path = governance, pg_catalog
AS $$
DECLARE
    v_target_order  smallint;
    v_gate_enforced boolean;
    v_min_readiness numeric(5,2);
    v_blocking_cnt  integer;
    v_blocking_tasks text[];
    v_phase_total   integer;
    v_phase_done    integer;
    v_phase_pct     numeric(5,2);
    v_blockers_ok   boolean;
    v_readiness_ok  boolean;
BEGIN
    SELECT sort_order, is_gate_enforced, min_readiness_pct
    INTO v_target_order, v_gate_enforced, v_min_readiness
    FROM governance.cycle_phase WHERE id = p_target_phase_id;

    IF NOT v_gate_enforced THEN
        RETURN QUERY SELECT true, true, true, 0, '{}'::text[], 100.0::numeric, v_min_readiness;
        RETURN;
    END IF;

    -- Blockers: mandatory tasks in phases <= target, not completed,
    -- DEVIATED only counts if deviation is approved/applied
    SELECT count(*)::integer, coalesce(array_agg(ct.task_code), '{}')
    INTO v_blocking_cnt, v_blocking_tasks
    FROM governance.cycle_task ct
    JOIN governance.cycle_phase ph ON ph.id = ct.phase_id
    WHERE ct.cycle_run_id = p_cycle_run_id
      AND ct.is_mandatory = true
      AND ph.sort_order <= v_target_order
      AND ct.status NOT IN ('COMPLETED')
      AND NOT (ct.status = 'DEVIATED' AND EXISTS (
          SELECT 1 FROM governance.cycle_deviation d
          WHERE d.task_id = ct.id AND d.cycle_run_id = p_cycle_run_id
            AND d.status IN ('APPROVED','APPLIED','RESOLVED','ACCEPTED')));

    v_blockers_ok := (v_blocking_cnt = 0);

    -- Phase-scoped readiness
    SELECT count(*),
        count(*) FILTER (WHERE ct.status = 'COMPLETED'
            OR (ct.status = 'DEVIATED' AND EXISTS (
                SELECT 1 FROM governance.cycle_deviation d
                WHERE d.task_id = ct.id AND d.cycle_run_id = p_cycle_run_id
                  AND d.status IN ('APPROVED','APPLIED','RESOLVED','ACCEPTED'))))
    INTO v_phase_total, v_phase_done
    FROM governance.cycle_task ct
    JOIN governance.cycle_phase ph ON ph.id = ct.phase_id
    WHERE ct.cycle_run_id = p_cycle_run_id AND ph.sort_order <= v_target_order;

    v_phase_pct := CASE WHEN v_phase_total = 0 THEN 100.0
                        ELSE round(v_phase_done::numeric / v_phase_total::numeric * 100, 2) END;
    v_readiness_ok := CASE WHEN v_min_readiness IS NULL THEN true
                           ELSE v_phase_pct >= v_min_readiness END;

    RETURN QUERY SELECT
        v_blockers_ok AND v_readiness_ok, v_blockers_ok, v_readiness_ok,
        v_blocking_cnt, v_blocking_tasks, v_phase_pct, v_min_readiness;
END;
$$;


-- ============================================================================
-- governance.check_cross_cycle_gate(uuid, uuid)
-- ============================================================================
-- Checks whether upstream cycle dependencies are satisfied for a target phase.

CREATE OR REPLACE FUNCTION governance.check_cross_cycle_gate(
    p_cycle_run_id    uuid,
    p_target_phase_id uuid
) RETURNS TABLE(gate_passed boolean, blocking_count integer, blocking_cycles jsonb)
    LANGUAGE plpgsql STABLE
    SET search_path = governance, pg_catalog
AS $$
DECLARE
    v_run       governance.cycle_run;
    v_blockers  jsonb := '[]'::jsonb;
    v_dep       record;
    v_pred_run  governance.cycle_run;
    v_pred_order smallint;
BEGIN
    SELECT * INTO v_run FROM governance.cycle_run WHERE id = p_cycle_run_id;

    FOR v_dep IN
        SELECT cd.*, pt.type_code AS ptc, pp.phase_code AS ppc, pp.sort_order AS req_order
        FROM governance.cycle_cross_dependency cd
        JOIN governance.cycle_type pt ON pt.id = cd.predecessor_type_id
        JOIN governance.cycle_phase pp ON pp.id = cd.predecessor_phase_id
        WHERE cd.successor_type_id = v_run.cycle_type_id
          AND cd.successor_phase_id = p_target_phase_id
          AND cd.tenant_id = v_run.tenant_id
          AND cd.is_active AND cd.is_hard
    LOOP
        SELECT * INTO v_pred_run FROM governance.cycle_run
        WHERE tenant_id = v_run.tenant_id AND entity_code = v_run.entity_code
          AND cycle_type_id = v_dep.predecessor_type_id
          AND fiscal_year = v_run.fiscal_year AND period_number = v_run.period_number
          AND status NOT IN ('CANCELLED')
        ORDER BY run_number DESC LIMIT 1;

        IF v_pred_run IS NULL THEN
            v_blockers := v_blockers || jsonb_build_object(
                'cycle_type', v_dep.ptc, 'required_phase', v_dep.ppc,
                'reason', 'No active run found');
            CONTINUE;
        END IF;
        IF v_pred_run.status IN ('CERTIFIED','CLOSED') THEN CONTINUE; END IF;

        v_pred_order := 0;
        IF v_pred_run.current_phase_id IS NOT NULL THEN
            SELECT sort_order INTO v_pred_order
            FROM governance.cycle_phase WHERE id = v_pred_run.current_phase_id;
        END IF;
        IF v_pred_order < v_dep.req_order THEN
            v_blockers := v_blockers || jsonb_build_object(
                'cycle_type', v_dep.ptc, 'required_phase', v_dep.ppc,
                'current_status', v_pred_run.status,
                'reason', 'Has not reached required phase');
        END IF;
    END LOOP;

    RETURN QUERY SELECT
        jsonb_array_length(v_blockers) = 0,
        jsonb_array_length(v_blockers)::integer,
        v_blockers;
END;
$$;


-- ============================================================================
-- governance.check_task_dependencies(uuid, uuid)
-- ============================================================================
-- Checks intra-cycle DAG: whether all hard predecessors of a task are
-- completed (or have approved deviations).

CREATE OR REPLACE FUNCTION governance.check_task_dependencies(
    p_cycle_run_id uuid,
    p_task_id      uuid
) RETURNS TABLE(can_start boolean, blocking_count integer, blocking_tasks text[])
    LANGUAGE sql STABLE
    SET search_path = governance, pg_catalog
AS $$
    WITH blocking AS (
        SELECT pt.task_code
        FROM governance.cycle_task_dependency dep
        JOIN governance.cycle_task ct ON ct.id = p_task_id
        JOIN governance.cycle_task pt ON pt.cycle_run_id = p_cycle_run_id
            AND pt.template_id = dep.predecessor_template_id
        WHERE dep.successor_template_id = ct.template_id
          AND dep.is_active AND dep.is_hard
          AND pt.status NOT IN ('COMPLETED')
          AND NOT (pt.status = 'DEVIATED' AND EXISTS (
              SELECT 1 FROM governance.cycle_deviation d
              WHERE d.task_id = pt.id AND d.cycle_run_id = p_cycle_run_id
                AND d.status IN ('APPROVED','APPLIED','RESOLVED','ACCEPTED')))
    )
    SELECT
        (SELECT count(*) = 0 FROM blocking),
        (SELECT count(*)::int FROM blocking),
        (SELECT coalesce(array_agg(task_code), '{}') FROM blocking);
$$;


-- ============================================================================
-- governance.get_cycle_progress(uuid)
-- ============================================================================
-- Aggregate task statistics for a cycle run.

CREATE OR REPLACE FUNCTION governance.get_cycle_progress(p_cycle_run_id uuid)
RETURNS TABLE(
    total_tasks      int,
    completed_count  int,
    deviated_count   int,
    failed_count     int,
    blocked_count    int,
    in_progress_count int,
    pending_count    int,
    completion_pct   numeric
)
    LANGUAGE sql STABLE
    SET search_path = governance, pg_catalog
AS $$
    SELECT
        count(*)::int,
        count(*) FILTER (WHERE status = 'COMPLETED')::int,
        count(*) FILTER (WHERE status = 'DEVIATED')::int,
        count(*) FILTER (WHERE status = 'FAILED')::int,
        count(*) FILTER (WHERE status = 'BLOCKED')::int,
        count(*) FILTER (WHERE status = 'IN_PROGRESS')::int,
        count(*) FILTER (WHERE status = 'PENDING')::int,
        CASE WHEN count(*) = 0 THEN 0
             ELSE round(count(*) FILTER (WHERE status IN ('COMPLETED','DEVIATED'))::numeric
                        / count(*)::numeric * 100, 2) END
    FROM governance.cycle_task WHERE cycle_run_id = p_cycle_run_id;
$$;


-- ============================================================================
-- governance.evaluate_clean_cycle(uuid)
-- ============================================================================
-- Policy-driven assessment of whether a cycle qualifies as "clean".

CREATE OR REPLACE FUNCTION governance.evaluate_clean_cycle(p_cycle_run_id uuid)
RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path = governance, pg_catalog
AS $$
DECLARE
    v_run    governance.cycle_run;
    v_type   governance.cycle_type;
    v_policy jsonb;
    v_c      record;
    v_clean  boolean := true;
    v_r      text[] := '{}';
BEGIN
    SELECT * INTO v_run FROM governance.cycle_run WHERE id = p_cycle_run_id;
    IF v_run IS NULL THEN RETURN '{"error":"Run not found"}'::jsonb; END IF;

    SELECT * INTO v_type FROM governance.cycle_type WHERE id = v_run.cycle_type_id;
    v_policy := v_type.clean_cycle_policy;

    SELECT
        count(*) FILTER (WHERE deviation_type = 'OVERRIDE' AND status = 'APPROVED'
            AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())) AS overrides,
        coalesce(sum(impact_amount) FILTER (WHERE deviation_type = 'OVERRIDE' AND status = 'APPROVED'), 0) AS impact,
        count(*) FILTER (WHERE deviation_type = 'WAIVER' AND status IN ('APPROVED','APPLIED')) AS waivers,
        count(*) FILTER (WHERE deviation_type = 'EXCEPTION' AND status IN ('OPEN','PENDING_APPROVAL')) AS exceptions
    INTO v_c
    FROM governance.cycle_deviation WHERE cycle_run_id = p_cycle_run_id;

    IF coalesce(v_c.overrides, 0) > coalesce((v_policy->>'max_overrides')::int, 0) THEN
        v_clean := false;
        v_r := array_append(v_r, format('Overrides %s > %s', v_c.overrides, v_policy->>'max_overrides'));
    END IF;
    IF v_policy->>'max_impact' IS NOT NULL AND coalesce(v_c.impact, 0) > (v_policy->>'max_impact')::numeric THEN
        v_clean := false;
        v_r := array_append(v_r, format('Impact %s > %s', v_c.impact, v_policy->>'max_impact'));
    END IF;
    IF coalesce(v_c.waivers, 0) > 0 THEN
        v_clean := false;
        v_r := array_append(v_r, format('%s waivers', v_c.waivers));
    END IF;
    IF coalesce(v_c.exceptions, 0) > 0 THEN
        v_clean := false;
        v_r := array_append(v_r, format('%s open exceptions', v_c.exceptions));
    END IF;

    RETURN jsonb_build_object(
        'is_clean', v_clean,
        'cycle_type', v_type.type_code,
        'override_count', coalesce(v_c.overrides, 0),
        'override_impact', coalesce(v_c.impact, 0),
        'waiver_count', coalesce(v_c.waivers, 0),
        'open_exceptions', coalesce(v_c.exceptions, 0),
        'policy', v_policy,
        'disqualification_reasons', to_jsonb(v_r));
END;
$$;


-- ============================================================================
-- governance.get_certification_metrics(uuid)
-- ============================================================================
-- Compiles all certification-relevant metrics for a cycle run.

CREATE OR REPLACE FUNCTION governance.get_certification_metrics(p_cycle_run_id uuid)
RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path = governance, pg_catalog
AS $$
DECLARE
    v_p  record;
    v_cl jsonb;
    v_d  record;
BEGIN
    SELECT * INTO v_p FROM governance.get_cycle_progress(p_cycle_run_id);
    v_cl := governance.evaluate_clean_cycle(p_cycle_run_id);

    SELECT
        count(*) AS total,
        count(*) FILTER (WHERE deviation_type = 'OVERRIDE') AS overrides,
        count(*) FILTER (WHERE deviation_type = 'WAIVER') AS waivers,
        count(*) FILTER (WHERE deviation_type = 'EXCEPTION') AS exceptions,
        count(*) FILTER (WHERE status IN ('OPEN','PENDING_APPROVAL')) AS open_count,
        coalesce(sum(impact_amount) FILTER (WHERE deviation_type = 'OVERRIDE' AND status = 'APPROVED'), 0) AS impact
    INTO v_d
    FROM governance.cycle_deviation WHERE cycle_run_id = p_cycle_run_id;

    RETURN jsonb_build_object(
        'computed_at', now(),
        'cycle_run_id', p_cycle_run_id,
        'tasks', jsonb_build_object(
            'total', v_p.total_tasks, 'completed', v_p.completed_count,
            'deviated', v_p.deviated_count, 'failed', v_p.failed_count,
            'blocked', v_p.blocked_count, 'in_progress', v_p.in_progress_count,
            'pending', v_p.pending_count, 'completion_pct', v_p.completion_pct),
        'deviations', jsonb_build_object(
            'total', v_d.total, 'overrides', v_d.overrides,
            'waivers', v_d.waivers, 'exceptions', v_d.exceptions,
            'open', v_d.open_count, 'override_impact', v_d.impact),
        'clean_cycle', v_cl);
END;
$$;


-- ============================================================================
-- governance.has_active_deviation(uuid, uuid, varchar)
-- ============================================================================
-- Checks for an active (approved/applied, non-expired) deviation.

CREATE OR REPLACE FUNCTION governance.has_active_deviation(
    p_cycle_run_id   uuid,
    p_task_id        uuid    DEFAULT NULL,
    p_deviation_type varchar DEFAULT NULL
) RETURNS TABLE(
    found          boolean,
    deviation_id   uuid,
    deviation_type varchar,
    reason_code    varchar,
    status         varchar,
    effective_to   date
)
    LANGUAGE sql STABLE
    SET search_path = governance, pg_catalog
AS $$
    SELECT true, d.id, d.deviation_type, d.reason_code, d.status, d.effective_to
    FROM governance.cycle_deviation d
    WHERE d.cycle_run_id = p_cycle_run_id
      AND d.status IN ('APPROVED','APPLIED')
      AND d.effective_from <= CURRENT_DATE
      AND (d.effective_to IS NULL OR d.effective_to > CURRENT_DATE)
      AND (p_task_id IS NULL OR d.task_id = p_task_id)
      AND (p_deviation_type IS NULL OR d.deviation_type = p_deviation_type)
    LIMIT 1;
$$;


-- ============================================================================
-- governance.execute_carryforward(uuid, uuid)
-- ============================================================================
-- Processes open deviations at cycle boundary: force-close, auto-carry,
-- or expire based on carryforward rules. Returns summary JSON.
-- SECURITY DEFINER: cross-run deviation copy requires admin context.

CREATE OR REPLACE FUNCTION governance.execute_carryforward(
    p_closing_run_id uuid,
    p_next_run_id    uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = governance, pg_catalog
AS $$
DECLARE
    v_closing    governance.cycle_run;
    v_rule       governance.cycle_carryforward_rule;
    v_dev        governance.cycle_deviation;
    v_new_task_id uuid;
    v_forced     int := 0;
    v_carried    int := 0;
    v_expired    int := 0;
    v_escalated  int := 0;
    v_no_target  int := 0;
    v_blockers   text[] := '{}';
BEGIN
    SELECT * INTO v_closing FROM governance.cycle_run WHERE id = p_closing_run_id;
    IF v_closing IS NULL THEN
        RAISE EXCEPTION 'Closing run % not found', p_closing_run_id;
    END IF;

    FOR v_dev IN
        SELECT * FROM governance.cycle_deviation
        WHERE cycle_run_id = p_closing_run_id
          AND status IN ('OPEN','PENDING_APPROVAL','APPROVED','APPLIED','DEFERRED')
    LOOP
        SELECT * INTO v_rule FROM governance.cycle_carryforward_rule
        WHERE tenant_id = v_closing.tenant_id
          AND cycle_type_id = v_closing.cycle_type_id
          AND deviation_type = v_dev.deviation_type
          AND is_active;

        IF v_rule IS NULL OR v_rule.action = 'FORCE_CLOSE' THEN
            v_forced := v_forced + 1;
            v_blockers := array_append(v_blockers, format('%s #%s: %s (force-close)',
                v_dev.deviation_type, coalesce(v_dev.deviation_code, '?'), v_dev.title));
            CONTINUE;
        END IF;

        IF v_rule.action = 'EXPIRE' THEN
            UPDATE governance.cycle_deviation SET status = 'EXPIRED' WHERE id = v_dev.id;
            v_expired := v_expired + 1;
            CONTINUE;
        END IF;

        -- AUTO_CARRY: max carry check
        IF v_rule.max_carry_count IS NOT NULL AND v_dev.carry_count >= v_rule.max_carry_count THEN
            v_forced := v_forced + 1;
            v_escalated := v_escalated + 1;
            v_blockers := array_append(v_blockers, format('%s #%s: carried %s/%s (escalated)',
                v_dev.deviation_type, coalesce(v_dev.deviation_code, '?'),
                v_dev.carry_count, v_rule.max_carry_count));
            CONTINUE;
        END IF;

        -- AUTO_CARRY: no next run = blocker
        IF p_next_run_id IS NULL THEN
            v_forced := v_forced + 1;
            v_no_target := v_no_target + 1;
            v_blockers := array_append(v_blockers, format('%s #%s: AUTO_CARRY but no next run',
                v_dev.deviation_type, coalesce(v_dev.deviation_code, '?')));
            CONTINUE;
        END IF;

        -- Remap task via template
        v_new_task_id := NULL;
        IF v_dev.task_template_id IS NOT NULL THEN
            SELECT id INTO v_new_task_id FROM governance.cycle_task
            WHERE cycle_run_id = p_next_run_id AND template_id = v_dev.task_template_id
            LIMIT 1;
        END IF;

        INSERT INTO governance.cycle_deviation (
            tenant_id, entity_code, cycle_run_id, deviation_type, scope,
            task_id, task_template_id, task_code, task_category,
            deviation_code, title, description, reason_code, reason_subcode, reason_detail,
            severity, impact_type, impact_amount, impact_currency,
            status, applies_to_phase_id, requested_by, requested_at,
            evidence_payload, effective_from, carried_from_id, carry_count, created_by
        ) VALUES (
            v_dev.tenant_id, v_dev.entity_code, p_next_run_id, v_dev.deviation_type, v_dev.scope,
            v_new_task_id, v_dev.task_template_id, v_dev.task_code, v_dev.task_category,
            v_dev.deviation_code, v_dev.title, v_dev.description,
            v_dev.reason_code, v_dev.reason_subcode, v_dev.reason_detail,
            v_dev.severity, v_dev.impact_type, v_dev.impact_amount, v_dev.impact_currency,
            'OPEN', v_dev.applies_to_phase_id, v_dev.requested_by, now(),
            v_dev.evidence_payload, CURRENT_DATE, v_dev.id, v_dev.carry_count + 1,
            v_dev.created_by);

        UPDATE governance.cycle_deviation SET status = 'CARRIED_FORWARD' WHERE id = v_dev.id;
        v_carried := v_carried + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'closing_run_id', p_closing_run_id,
        'next_run_id', p_next_run_id,
        'force_close_count', v_forced,
        'carried_count', v_carried,
        'expired_count', v_expired,
        'escalated_to_force', v_escalated,
        'no_target_run_count', v_no_target,
        'certification_blocked', v_forced > 0,
        'blockers', to_jsonb(v_blockers));
END;
$$;
