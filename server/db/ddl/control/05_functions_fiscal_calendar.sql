-- ============================================================================
-- Fiscal calendar preview, generation, assignment resolution, and posting-date
-- period resolution. These functions are the single calendar math contract for
-- API previews, generated posting gates, and document derivation triggers.
-- ============================================================================

CREATE OR REPLACE FUNCTION control.fiscal_calendar_year_start(
    p_tenant_id uuid,
    p_calendar_config_id uuid,
    p_fiscal_year integer
) RETURNS date
LANGUAGE plpgsql STABLE
SET search_path = control, master, shared, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION control.preview_fiscal_calendar(
    p_tenant_id uuid,
    p_calendar_config_id uuid,
    p_fiscal_year integer
) RETURNS TABLE (
    sequence_no smallint,
    period_number smallint,
    period_type text,
    period_name text,
    start_date date,
    end_date date,
    quarter_number smallint,
    is_adjustment boolean
)
LANGUAGE plpgsql STABLE
SET search_path = control, master, shared, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION control.resolve_company_fiscal_calendar(
    p_tenant_id uuid,
    p_company_code_id uuid,
    p_fiscal_year integer
) RETURNS uuid
LANGUAGE sql STABLE
SET search_path = control, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION master.resolve_fiscal_period(
    p_tenant_id uuid,
    p_company_code_id uuid,
    p_posting_date date,
    p_include_special boolean DEFAULT false
) RETURNS TABLE (
    fiscal_period_id uuid,
    fiscal_year smallint,
    period_number smallint,
    period_type text,
    status text
)
LANGUAGE sql STABLE
SET search_path = master, pg_temp
AS $$
    SELECT fp.id, fp.fiscal_year, fp.period_number, fp.period_type, fp.status
      FROM master.fiscal_period fp
     WHERE fp.tenant_id = p_tenant_id
       AND fp.company_code_id = p_company_code_id
       AND p_posting_date BETWEEN fp.start_date AND fp.end_date
       AND (p_include_special OR fp.period_type = 'normal')
     ORDER BY CASE fp.period_type WHEN 'normal' THEN 0 WHEN 'closing' THEN 1
                                  WHEN 'adjustment' THEN 2 ELSE 3 END,
              fp.period_number
     LIMIT 1
$$;

CREATE OR REPLACE FUNCTION control.generate_fiscal_periods(
    p_tenant_id uuid,
    p_company_code_id uuid,
    p_fiscal_year integer,
    p_actor_id uuid,
    p_calendar_config_id uuid DEFAULT NULL,
    p_replace_future boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = control, master, governance, document, shared, pg_temp
AS $$
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
$$;

COMMENT ON FUNCTION master.resolve_fiscal_period(uuid, uuid, date, boolean) IS
    'Canonical posting-date resolver over generated fiscal periods. Special periods are excluded by default to avoid adjustment/date overlap.';
