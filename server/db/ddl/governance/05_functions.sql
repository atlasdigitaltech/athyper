-- ============================================================================
-- governance/05_functions.sql
-- Functions and procedures reconstructed from the live catalog; pre-constraint routines are excluded.
-- Generated from the live Neon database governance schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION governance.check_cross_cycle_gate(p_cycle_run_id uuid, p_target_phase_id uuid)
 RETURNS TABLE(gate_passed boolean, blocking_count integer, blocking_cycles jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION governance.check_phase_gate(p_cycle_run_id uuid, p_target_phase_id uuid)
 RETURNS TABLE(gate_passed boolean, blockers_cleared boolean, readiness_passed boolean, pending_count integer, pending_tasks text[], phase_readiness numeric, required_readiness numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION governance.check_task_dependencies(p_cycle_run_id uuid, p_task_id uuid)
 RETURNS TABLE(can_start boolean, blocking_count integer, blocking_tasks text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION governance.evaluate_clean_cycle(p_cycle_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION governance.execute_carryforward(p_closing_run_id uuid, p_next_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION governance.get_certification_metrics(p_cycle_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION governance.get_cycle_progress(p_cycle_run_id uuid)
 RETURNS TABLE(total_tasks integer, completed_count integer, deviated_count integer, failed_count integer, blocked_count integer, in_progress_count integer, pending_count integer, completion_pct numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION governance.has_active_deviation(p_cycle_run_id uuid, p_task_id uuid DEFAULT NULL::uuid, p_deviation_type character varying DEFAULT NULL::character varying)
 RETURNS TABLE(found boolean, deviation_id uuid, deviation_type character varying, reason_code character varying, status character varying, effective_to date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
    SELECT true, d.id, d.deviation_type, d.reason_code, d.status, d.effective_to
    FROM governance.cycle_deviation d
    WHERE d.cycle_run_id = p_cycle_run_id
      AND d.status IN ('APPROVED','APPLIED')
      AND d.effective_from <= CURRENT_DATE
      AND (d.effective_to IS NULL OR d.effective_to > CURRENT_DATE)
      AND (p_task_id IS NULL OR d.task_id = p_task_id)
      AND (p_deviation_type IS NULL OR d.deviation_type = p_deviation_type)
    LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION governance.invalidate_finance_setup_certification(p_tenant_id uuid, p_company_code_id uuid, p_actor_id uuid, p_reason text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'governance', 'master', 'pg_temp'
AS $function$
    UPDATE governance.cycle_certification cert
       SET status = 'SUPERSEDED',
           supersession_reason = p_reason,
           updated_at = now(),
           updated_by = COALESCE(p_actor_id, cert.updated_by, cert.created_by)
      FROM governance.cycle_run run
      JOIN governance.cycle_type type
        ON type.tenant_id = run.tenant_id AND type.id = run.cycle_type_id
      JOIN master.company_code company
        ON company.tenant_id = run.tenant_id AND company.code = run.entity_code
     WHERE cert.tenant_id = p_tenant_id
       AND cert.cycle_run_id = run.id
       AND company.id = p_company_code_id
       AND type.type_code = 'FIN_SETUP_READINESS'
       AND cert.cert_code = 'FINANCE_POSTING_READY'
       AND cert.status IN ('CERTIFIED', 'ATTESTED')
$function$;

CREATE OR REPLACE FUNCTION governance.materialize_cycle_tasks(p_cycle_run_id uuid, p_blueprint character varying DEFAULT NULL::character varying)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION governance.trg_certification_snapshot_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.status IN ('CERTIFIED', 'ATTESTED', 'SUPERSEDED') THEN
        IF OLD.snapshot_payload IS DISTINCT FROM NEW.snapshot_payload THEN
            RAISE EXCEPTION
                'governance.cycle_certification.snapshot_payload is immutable once '
                'status = %. Create a superseding certification instead.',
                OLD.status
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        IF OLD.content_hash IS DISTINCT FROM NEW.content_hash THEN
            RAISE EXCEPTION
                'governance.cycle_certification.content_hash is immutable once '
                'status = %.',
                OLD.status
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "governance".trg_certification_snapshot_immutable() IS 'Prevents modification of snapshot_payload and content_hash once a cycle_certification has reached CERTIFIED, ATTESTED, or SUPERSEDED. Evidence integrity: once signed off the audit evidence is frozen in place.';

CREATE OR REPLACE FUNCTION governance.trg_invalidate_finance_setup_certification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'governance', 'master', 'control', 'pg_temp'
AS $function$
DECLARE
  v_row jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_tenant_id uuid:=(v_row->>'tenant_id')::uuid;
  v_actor_id uuid:=COALESCE(NULLIF(v_row->>'updated_by','')::uuid,NULLIF(v_row->>'status_changed_by','')::uuid,NULLIF(v_row->>'created_by','')::uuid);
  v_company_id uuid;v_definition_id uuid;
BEGIN
  CASE TG_ARGV[0]
    WHEN 'tenant' THEN
      FOR v_company_id IN SELECT id FROM master.company_code WHERE tenant_id=v_tenant_id LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'company' THEN
      PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,(v_row->>'id')::uuid,v_actor_id,TG_ARGV[1]);
    WHEN 'company_direct' THEN
      PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,(v_row->>'company_code_id')::uuid,v_actor_id,TG_ARGV[1]);
    WHEN 'company_optional' THEN
      IF NULLIF(v_row->>'company_code_id','') IS NULL THEN
        FOR v_company_id IN SELECT id FROM master.company_code WHERE tenant_id=v_tenant_id LOOP
          PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
        END LOOP;
      ELSE
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,(v_row->>'company_code_id')::uuid,v_actor_id,TG_ARGV[1]);
      END IF;
    WHEN 'legal_entity' THEN
      FOR v_company_id IN SELECT id FROM master.company_code WHERE tenant_id=v_tenant_id AND legal_entity_id=(v_row->>'id')::uuid LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'chart' THEN
      FOR v_company_id IN SELECT company_code_id FROM master.company_code_chart_assignment WHERE tenant_id=v_tenant_id AND chart_of_account_id=(v_row->>'id')::uuid LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'gl_account' THEN
      FOR v_company_id IN SELECT company_code_id FROM master.company_code_chart_assignment WHERE tenant_id=v_tenant_id AND chart_of_account_id=(v_row->>'chart_of_account_id')::uuid LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'book' THEN
      FOR v_company_id IN SELECT company_code_id FROM master.company_code_book_assignment WHERE tenant_id=v_tenant_id AND book_id=(v_row->>'id')::uuid LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'calendar' THEN
      FOR v_company_id IN SELECT company_code_id FROM control.company_fiscal_calendar_assignment WHERE tenant_id=v_tenant_id AND fiscal_calendar_config_id=(v_row->>'id')::uuid LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'calendar_rule' THEN
      v_definition_id:=(v_row->>'fiscal_calendar_config_id')::uuid;
      FOR v_company_id IN SELECT company_code_id FROM control.company_fiscal_calendar_assignment WHERE tenant_id=v_tenant_id AND fiscal_calendar_config_id=v_definition_id LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    ELSE RAISE EXCEPTION 'Unknown finance certification invalidation scope: %',TG_ARGV[0];
  END CASE;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION governance.trg_preserved_identity_receipt_immutable_v2()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'preserved identity migration receipts are immutable';
END
$function$;
