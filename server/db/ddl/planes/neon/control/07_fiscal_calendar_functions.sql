CREATE OR REPLACE FUNCTION control.trg_validate_fiscal_calendar_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_superseded control.fiscal_calendar_config%ROWTYPE;
    v_rule_count integer;
    v_normal_count integer;
    v_leap_count integer;
BEGIN
    NEW.code := lower(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');

    IF NEW.supersedes_id IS NULL THEN
        IF NEW.version_no <> 1 THEN
            RAISE EXCEPTION 'A root fiscal-calendar lineage must start at version 1'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_superseded
          FROM control.fiscal_calendar_config
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.supersedes_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Superseded fiscal calendar does not exist in tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_superseded.code IS DISTINCT FROM NEW.code
           OR NEW.version_no <> v_superseded.version_no + 1 THEN
            RAISE EXCEPTION
                'Fiscal-calendar replacement must retain code and increment version by one'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.calendar_type IN (
        'monthly', 'four_four_five', 'four_five_four', 'five_four_four'
    ) AND NEW.periods_per_year <> 12 THEN
        RAISE EXCEPTION '% calendars require 12 normal periods', NEW.calendar_type
            USING ERRCODE = 'check_violation';
    ELSIF NEW.calendar_type = 'thirteen_period'
          AND NEW.periods_per_year <> 13 THEN
        RAISE EXCEPTION 'thirteen_period calendars require 13 normal periods'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
        SELECT count(*)::integer,
               count(*) FILTER (WHERE period_type = 'normal')::integer,
               count(*) FILTER (WHERE absorbs_leap_week)::integer
          INTO v_rule_count, v_normal_count, v_leap_count
          FROM control.fiscal_calendar_period_rule
         WHERE tenant_id = NEW.tenant_id
           AND fiscal_calendar_config_id = NEW.id;

        IF v_rule_count = 0 OR v_normal_count <> NEW.periods_per_year THEN
            RAISE EXCEPTION
                'Fiscal calendar requires % normal rules before activation; found %',
                NEW.periods_per_year, v_normal_count
                USING ERRCODE = 'check_violation';
        END IF;

        IF (NEW.leap_week_rule = 'none' AND v_leap_count <> 0)
           OR (NEW.leap_week_rule = 'last_period' AND v_leap_count <> 1) THEN
            RAISE EXCEPTION
                'Leap-week absorber count does not match leap_week_rule %',
                NEW.leap_week_rule
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_fiscal_calendar_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated fiscal calendars cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Fiscal-calendar identity, lineage, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.code IS DISTINCT FROM OLD.code
        OR NEW.name IS DISTINCT FROM OLD.name
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.calendar_type IS DISTINCT FROM OLD.calendar_type
        OR NEW.fiscal_year_label_rule IS DISTINCT FROM OLD.fiscal_year_label_rule
        OR NEW.year_start_rule IS DISTINCT FROM OLD.year_start_rule
        OR NEW.anchor_month IS DISTINCT FROM OLD.anchor_month
        OR NEW.anchor_day IS DISTINCT FROM OLD.anchor_day
        OR NEW.week_start_day IS DISTINCT FROM OLD.week_start_day
        OR NEW.periods_per_year IS DISTINCT FROM OLD.periods_per_year
        OR NEW.leap_week_rule IS DISTINCT FROM OLD.leap_week_rule
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION
            'Activated fiscal-calendar semantics are immutable; create a versioned replacement'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'retired' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'A retired fiscal calendar is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        OLD.status = 'draft' AND NEW.status IN ('active', 'retired')
        OR OLD.status = 'active' AND NEW.status = 'retired'
    ) THEN
        RAISE EXCEPTION 'Invalid fiscal-calendar status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_fiscal_calendar_period_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_status control.fiscal_calendar_status_d;
BEGIN
    SELECT status INTO v_status
      FROM control.fiscal_calendar_config
     WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
       AND id = COALESCE(
            NEW.fiscal_calendar_config_id,
            OLD.fiscal_calendar_config_id
       );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fiscal-calendar parent does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'Period rules may change only while the calendar is draft'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.fiscal_calendar_config_id
            IS DISTINCT FROM OLD.fiscal_calendar_config_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Period-rule identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_company_fiscal_calendar_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.status = 'active' AND NOT EXISTS (
        SELECT 1
          FROM control.fiscal_calendar_config AS config
         WHERE config.tenant_id = NEW.tenant_id
           AND config.id = NEW.fiscal_calendar_config_id
           AND config.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Company assignment requires an active fiscal calendar'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_company_fiscal_calendar_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Fiscal-calendar assignments are retained as history'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.fiscal_calendar_config_id
            IS DISTINCT FROM OLD.fiscal_calendar_config_id
       OR NEW.effective_fiscal_year_from
            IS DISTINCT FROM OLD.effective_fiscal_year_from
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Fiscal-calendar assignment identity and historical semantics are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'inactive' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'An inactive fiscal-calendar assignment is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.effective_fiscal_year_to
          IS DISTINCT FROM OLD.effective_fiscal_year_to
       AND (
            NEW.effective_fiscal_year_to IS NULL
            OR (
                OLD.effective_fiscal_year_to IS NOT NULL
                AND NEW.effective_fiscal_year_to > OLD.effective_fiscal_year_to
            )
       ) THEN
        RAISE EXCEPTION 'Assignment coverage may be shortened but never extended'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'active' AND NEW.status = 'inactive') THEN
        RAISE EXCEPTION 'Invalid fiscal-calendar assignment status transition'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.fiscal_calendar_year_start(
    p_tenant_id uuid,
    p_calendar_config_id uuid,
    p_fiscal_year integer
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_config control.fiscal_calendar_config%ROWTYPE;
    v_base_year integer;
    v_month_end integer;
    v_anchor date;
    v_iso_day integer;
    v_delta integer;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Fiscal-calendar tenant does not match active session'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_config
      FROM control.fiscal_calendar_config
     WHERE tenant_id = p_tenant_id AND id = p_calendar_config_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fiscal calendar was not found for tenant'
            USING ERRCODE = 'no_data_found';
    END IF;

    v_base_year := CASE v_config.fiscal_year_label_rule
        WHEN 'end_year' THEN p_fiscal_year - 1 ELSE p_fiscal_year END;
    v_month_end := EXTRACT(DAY FROM (
        make_date(v_base_year, v_config.anchor_month, 1)
        + INTERVAL '1 month - 1 day'
    ))::integer;
    v_anchor := make_date(
        v_base_year, v_config.anchor_month,
        LEAST(v_config.anchor_day::integer, v_month_end)
    );

    IF v_config.year_start_rule = 'fixed_date' THEN RETURN v_anchor; END IF;
    v_iso_day := EXTRACT(ISODOW FROM v_anchor)::integer;
    IF v_config.year_start_rule = 'first_on_or_after' THEN
        RETURN v_anchor + ((v_config.week_start_day - v_iso_day + 7) % 7);
    ELSIF v_config.year_start_rule = 'last_on_or_before' THEN
        RETURN v_anchor - ((v_iso_day - v_config.week_start_day + 7) % 7);
    END IF;
    v_delta := (v_config.week_start_day - v_iso_day + 7) % 7;
    RETURN CASE WHEN v_delta <= 3
        THEN v_anchor + v_delta ELSE v_anchor - (7 - v_delta) END;
END;
$$;

CREATE OR REPLACE FUNCTION control.preview_fiscal_calendar(
    p_tenant_id uuid,
    p_calendar_config_id uuid,
    p_fiscal_year integer
)
RETURNS TABLE (
    sequence_no smallint, period_number smallint, period_type text,
    period_name text, start_date date, end_date date,
    quarter_number smallint, is_adjustment boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_config control.fiscal_calendar_config%ROWTYPE;
    v_rule control.fiscal_calendar_period_rule%ROWTYPE;
    v_year_start date;
    v_next_year_start date;
    v_cursor date;
    v_start date;
    v_end date;
    v_last_normal_sequence smallint;
    v_normal_count integer;
    v_gap integer;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Fiscal-calendar tenant does not match active session'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_config
      FROM control.fiscal_calendar_config
     WHERE tenant_id = p_tenant_id
       AND id = p_calendar_config_id
       AND status <> 'retired';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active or draft fiscal calendar was not found'
            USING ERRCODE = 'no_data_found';
    END IF;

    SELECT count(*) FILTER (WHERE rule.period_type = 'normal')::integer,
           max(rule.sequence_no) FILTER (WHERE rule.period_type = 'normal')
      INTO v_normal_count, v_last_normal_sequence
      FROM control.fiscal_calendar_period_rule AS rule
     WHERE rule.tenant_id = p_tenant_id
       AND rule.fiscal_calendar_config_id = p_calendar_config_id;
    IF v_normal_count <> v_config.periods_per_year THEN
        RAISE EXCEPTION 'Calendar normal-rule count does not match periods_per_year'
            USING ERRCODE = 'check_violation';
    END IF;

    v_year_start := control.fiscal_calendar_year_start(
        p_tenant_id, p_calendar_config_id, p_fiscal_year
    );
    v_next_year_start := control.fiscal_calendar_year_start(
        p_tenant_id, p_calendar_config_id, p_fiscal_year + 1
    );
    v_cursor := v_year_start;

    FOR v_rule IN
        SELECT rule.*
          FROM control.fiscal_calendar_period_rule AS rule
         WHERE rule.tenant_id = p_tenant_id
           AND rule.fiscal_calendar_config_id = p_calendar_config_id
         ORDER BY rule.sequence_no
    LOOP
        v_start := CASE v_rule.anchor
            WHEN 'year_start' THEN v_year_start
            WHEN 'year_end' THEN v_next_year_start - 1
            ELSE v_cursor END;
        v_end := CASE v_rule.duration_unit
            WHEN 'point' THEN v_start
            WHEN 'day' THEN v_start + (v_rule.duration_value - 1)
            WHEN 'week' THEN v_start + (v_rule.duration_value * 7 - 1)
            ELSE (v_start + make_interval(months => v_rule.duration_value)
                  - INTERVAL '1 day')::date END;

        IF v_rule.period_type = 'normal' THEN
            IF v_rule.sequence_no = v_last_normal_sequence THEN
                v_gap := v_next_year_start - (v_end + 1);
                IF v_gap <> 0 THEN
                    IF v_rule.absorbs_leap_week
                       AND v_config.leap_week_rule = 'last_period'
                       AND v_gap = 7 THEN
                        v_end := v_next_year_start - 1;
                    ELSE
                        RAISE EXCEPTION
                            'Calendar normal periods do not cover fiscal year; gap % days',
                            v_gap USING ERRCODE = 'check_violation';
                    END IF;
                END IF;
            END IF;
            IF v_start < v_year_start OR v_end >= v_next_year_start THEN
                RAISE EXCEPTION 'Normal period lies outside fiscal-year bounds'
                    USING ERRCODE = 'check_violation';
            END IF;
            v_cursor := v_end + 1;
        END IF;

        sequence_no := v_rule.sequence_no;
        period_number := v_rule.period_number;
        period_type := v_rule.period_type::text;
        period_name := replace(replace(
            v_rule.name_template, '{period}',
            lpad(v_rule.period_number::text, 2, '0')
        ), '{year}', p_fiscal_year::text);
        start_date := v_start;
        end_date := v_end;
        quarter_number := v_rule.quarter_number;
        is_adjustment := v_rule.period_type = 'adjustment';
        RETURN NEXT;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_company_fiscal_calendar(
    p_tenant_id uuid,
    p_company_code_id uuid,
    p_fiscal_year integer
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, control
AS $$
    SELECT assignment.fiscal_calendar_config_id
      FROM control.company_fiscal_calendar_assignment AS assignment
      JOIN control.fiscal_calendar_config AS config
        ON config.tenant_id = assignment.tenant_id
       AND config.id = assignment.fiscal_calendar_config_id
       AND config.status = 'active'
     WHERE p_tenant_id = shared.current_tenant_id()
       AND assignment.tenant_id = p_tenant_id
       AND assignment.company_code_id = p_company_code_id
       AND assignment.status = 'active'
       AND assignment.effective_fiscal_year_from <= p_fiscal_year
       AND (
            assignment.effective_fiscal_year_to IS NULL
            OR assignment.effective_fiscal_year_to >= p_fiscal_year
       )
     ORDER BY assignment.effective_fiscal_year_from DESC
     LIMIT 1
$$;

CREATE OR REPLACE FUNCTION master.resolve_fiscal_period(
    p_tenant_id uuid,
    p_company_code_id uuid,
    p_posting_date date,
    p_include_special boolean DEFAULT false
)
RETURNS TABLE (
    fiscal_period_id uuid, fiscal_year smallint, period_number smallint,
    period_type text, status text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, master
AS $$
    SELECT period.id, period.fiscal_year, period.period_number,
           period.period_type::text, period.status::text
      FROM master.fiscal_period AS period
     WHERE p_tenant_id = shared.current_tenant_id()
       AND period.tenant_id = p_tenant_id
       AND period.company_code_id = p_company_code_id
       AND p_posting_date BETWEEN period.start_date AND period.end_date
       AND (p_include_special OR period.period_type = 'normal')
     ORDER BY CASE period.period_type::text
                  WHEN 'normal' THEN 0 WHEN 'closing' THEN 1
                  WHEN 'adjustment' THEN 2 ELSE 3 END,
              period.period_number
     LIMIT 1
$$;

CREATE OR REPLACE FUNCTION control.generate_fiscal_periods(
    p_tenant_id uuid,
    p_company_code_id uuid,
    p_fiscal_year integer,
    p_actor_id uuid,
    p_calendar_config_id uuid DEFAULT NULL,
    p_replace_future boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, control, master, ledger
AS $$
DECLARE
    v_config_id uuid;
    v_assigned_config_id uuid;
    v_config control.fiscal_calendar_config%ROWTYPE;
    v_period record;
    v_generation_key text;
    v_generated integer := 0;
    v_book_rows integer := 0;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Fiscal-calendar tenant does not match active session'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.principal
         WHERE tenant_id = p_tenant_id AND id = p_actor_id
    ) THEN
        RAISE EXCEPTION 'Fiscal-period actor does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    PERFORM 1 FROM master.company_code
     WHERE tenant_id = p_tenant_id AND id = p_company_code_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company was not found for tenant'
            USING ERRCODE = 'no_data_found';
    END IF;

    v_assigned_config_id := control.resolve_company_fiscal_calendar(
        p_tenant_id, p_company_code_id, p_fiscal_year
    );
    IF p_calendar_config_id IS NOT NULL
       AND p_calendar_config_id IS DISTINCT FROM v_assigned_config_id THEN
        RAISE EXCEPTION 'Requested calendar is not assigned for fiscal year'
            USING ERRCODE = 'check_violation';
    END IF;
    v_config_id := COALESCE(p_calendar_config_id, v_assigned_config_id);
    IF v_config_id IS NULL THEN
        RAISE EXCEPTION 'No active fiscal-calendar assignment covers fiscal year'
            USING ERRCODE = 'no_data_found';
    END IF;

    SELECT * INTO v_config FROM control.fiscal_calendar_config
     WHERE tenant_id = p_tenant_id AND id = v_config_id AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assigned fiscal calendar is not active'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM master.fiscal_period AS existing
         WHERE existing.tenant_id = p_tenant_id
           AND existing.company_code_id = p_company_code_id
           AND existing.fiscal_year = p_fiscal_year
           AND existing.status <> 'future'
           AND NOT EXISTS (
                SELECT 1
                  FROM control.preview_fiscal_calendar(
                      p_tenant_id, v_config_id, p_fiscal_year
                  ) AS expected
                 WHERE expected.period_number = existing.period_number
                   AND expected.period_type = existing.period_type::text
                   AND expected.start_date = existing.start_date
                   AND expected.end_date = existing.end_date
           )
    ) THEN
        RAISE EXCEPTION 'Opened or closed periods differ from assigned calendar'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF p_replace_future THEN
        DELETE FROM ledger.book_period_status AS gate
         USING master.fiscal_period AS period
         WHERE gate.tenant_id = p_tenant_id
           AND gate.fiscal_period_id = period.id
           AND gate.status = 'future'
           AND period.tenant_id = p_tenant_id
           AND period.company_code_id = p_company_code_id
           AND period.fiscal_year = p_fiscal_year
           AND period.status = 'future'
           AND period.fiscal_calendar_config_id IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM control.preview_fiscal_calendar(
                    p_tenant_id, v_config_id, p_fiscal_year
                ) AS expected
                 WHERE expected.period_number = period.period_number
                   AND expected.period_type = period.period_type::text
                   AND expected.start_date = period.start_date
                   AND expected.end_date = period.end_date
           );

        DELETE FROM master.fiscal_period AS period
         WHERE period.tenant_id = p_tenant_id
           AND period.company_code_id = p_company_code_id
           AND period.fiscal_year = p_fiscal_year
           AND period.status = 'future'
           AND period.fiscal_calendar_config_id IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM control.preview_fiscal_calendar(
                    p_tenant_id, v_config_id, p_fiscal_year
                ) AS expected
                 WHERE expected.period_number = period.period_number
                   AND expected.period_type = period.period_type::text
                   AND expected.start_date = period.start_date
                   AND expected.end_date = period.end_date
           );
    END IF;

    FOR v_period IN
        SELECT * FROM control.preview_fiscal_calendar(
            p_tenant_id, v_config_id, p_fiscal_year
        )
    LOOP
        v_generation_key := concat_ws(
            ':', p_company_code_id, p_fiscal_year,
            v_config_id, v_config.version_no, v_period.period_number
        );
        INSERT INTO master.fiscal_period (
            tenant_id, code, name, company_code_id, fiscal_year,
            period_number, period_type, start_date, end_date,
            fiscal_calendar_config_id, calendar_version_no,
            generation_key, generated_at, sort_order, status, created_by
        ) VALUES (
            p_tenant_id,
            concat(p_fiscal_year, '-P', lpad(v_period.period_number::text, 2, '0')),
            v_period.period_name, p_company_code_id, p_fiscal_year,
            v_period.period_number, v_period.period_type,
            v_period.start_date, v_period.end_date, v_config_id,
            v_config.version_no, v_generation_key, now(),
            v_period.sequence_no, 'future', p_actor_id
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

    WITH period_bounds AS (
        SELECT min(start_date) AS fiscal_start, max(end_date) AS fiscal_end
          FROM master.fiscal_period
         WHERE tenant_id = p_tenant_id
           AND company_code_id = p_company_code_id
           AND fiscal_year = p_fiscal_year
    )
    INSERT INTO ledger.book_period_status (
        tenant_id, ledger_book_id, fiscal_period_id,
        status, created_by
    )
    SELECT p_tenant_id, assignment.book_id, period.id, 'future', p_actor_id
      FROM master.company_code_book_assignment AS assignment
      JOIN master.fiscal_period AS period
        ON period.tenant_id = assignment.tenant_id
       AND period.company_code_id = assignment.company_code_id
       AND period.fiscal_year = p_fiscal_year
     CROSS JOIN period_bounds AS bounds
     WHERE assignment.tenant_id = p_tenant_id
       AND assignment.company_code_id = p_company_code_id
       AND assignment.status = 'active'
       AND assignment.effective_from <= bounds.fiscal_end
       AND (
            assignment.effective_to IS NULL
            OR assignment.effective_to >= bounds.fiscal_start
       )
    ON CONFLICT (tenant_id, ledger_book_id, fiscal_period_id) DO NOTHING;
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
$$;

COMMENT ON FUNCTION control.generate_fiscal_periods(
    uuid, uuid, integer, uuid, uuid, boolean
) IS
  'Tenant-session-bound idempotent generator for master fiscal periods and ledger book-period gates.';
