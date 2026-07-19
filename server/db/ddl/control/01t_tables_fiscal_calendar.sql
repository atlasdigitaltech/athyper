-- ============================================================================
-- Reusable fiscal calendar definitions and company assignments.
-- Definitions are tenant-scoped, versioned, and kept separate from generated
-- master.fiscal_period rows, which remain the operational posting gate.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.fiscal_calendar_config (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    code                  text        NOT NULL,
    name                  text        NOT NULL,
    description           text,
    calendar_type         text        NOT NULL DEFAULT 'monthly',
    version_no            integer     NOT NULL DEFAULT 1,
    fiscal_year_label_rule text       NOT NULL DEFAULT 'start_year',
    year_start_rule       text        NOT NULL DEFAULT 'fixed_date',
    anchor_month          smallint    NOT NULL DEFAULT 1,
    anchor_day            smallint    NOT NULL DEFAULT 1,
    week_start_day        smallint    NOT NULL DEFAULT 1,
    periods_per_year      smallint    NOT NULL DEFAULT 12,
    leap_week_rule        text        NOT NULL DEFAULT 'none',
    effective_from        date,
    effective_to          date,
    supersedes_id         uuid,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'draft',
    is_active             boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT fiscal_calendar_config_pkey PRIMARY KEY (id),
    CONSTRAINT fiscal_calendar_config_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fiscal_calendar_config_code_version_uq UNIQUE (tenant_id, code, version_no),
    CONSTRAINT fiscal_calendar_config_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT fiscal_calendar_config_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT fiscal_calendar_config_type_chk CHECK (calendar_type IN
        ('monthly', 'four_four_five', 'four_five_four', 'five_four_four', 'thirteen_period', 'custom')),
    CONSTRAINT fiscal_calendar_config_label_chk CHECK (fiscal_year_label_rule IN ('start_year', 'end_year')),
    CONSTRAINT fiscal_calendar_config_start_rule_chk CHECK (year_start_rule IN
        ('fixed_date', 'first_on_or_after', 'last_on_or_before', 'nearest_weekday')),
    CONSTRAINT fiscal_calendar_config_anchor_month_chk CHECK (anchor_month BETWEEN 1 AND 12),
    CONSTRAINT fiscal_calendar_config_anchor_day_chk CHECK (anchor_day BETWEEN 1 AND 31),
    CONSTRAINT fiscal_calendar_config_weekday_chk CHECK (week_start_day BETWEEN 1 AND 7),
    CONSTRAINT fiscal_calendar_config_period_count_chk CHECK (periods_per_year BETWEEN 1 AND 16),
    CONSTRAINT fiscal_calendar_config_leap_rule_chk CHECK (leap_week_rule IN ('none', 'last_period')),
    CONSTRAINT fiscal_calendar_config_dates_chk CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_from <= effective_to),
    CONSTRAINT fiscal_calendar_config_status_chk CHECK (status IN ('draft', 'active', 'retired'))
);

CREATE TABLE IF NOT EXISTS control.fiscal_calendar_period_rule (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    fiscal_calendar_config_id uuid    NOT NULL,
    sequence_no           smallint    NOT NULL,
    period_number         smallint    NOT NULL,
    period_type           text        NOT NULL DEFAULT 'normal',
    name_template         text        NOT NULL DEFAULT 'Period {period}',
    duration_unit         text        NOT NULL DEFAULT 'month',
    duration_value        smallint    NOT NULL DEFAULT 1,
    anchor                text        NOT NULL DEFAULT 'sequence',
    quarter_number        smallint,
    absorbs_leap_week     boolean     NOT NULL DEFAULT false,
    sort_order            smallint    NOT NULL DEFAULT 0,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'active',
    is_active             boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT fiscal_calendar_period_rule_pkey PRIMARY KEY (id),
    CONSTRAINT fiscal_calendar_period_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fiscal_calendar_period_rule_sequence_uq UNIQUE (tenant_id, fiscal_calendar_config_id, sequence_no),
    CONSTRAINT fiscal_calendar_period_rule_number_uq UNIQUE (tenant_id, fiscal_calendar_config_id, period_number),
    CONSTRAINT fiscal_calendar_period_rule_sequence_chk CHECK (sequence_no BETWEEN 0 AND 32),
    CONSTRAINT fiscal_calendar_period_rule_number_chk CHECK (period_number BETWEEN 0 AND 16),
    CONSTRAINT fiscal_calendar_period_rule_type_chk CHECK (period_type IN ('opening', 'normal', 'adjustment', 'closing')),
    CONSTRAINT fiscal_calendar_period_rule_duration_unit_chk CHECK (duration_unit IN ('point', 'day', 'week', 'month')),
    CONSTRAINT fiscal_calendar_period_rule_duration_value_chk CHECK (duration_value BETWEEN 1 AND 53),
    CONSTRAINT fiscal_calendar_period_rule_anchor_chk CHECK (anchor IN ('sequence', 'year_start', 'year_end')),
    CONSTRAINT fiscal_calendar_period_rule_quarter_chk CHECK (quarter_number IS NULL OR quarter_number BETWEEN 1 AND 4),
    CONSTRAINT fiscal_calendar_period_rule_name_chk CHECK (btrim(name_template) <> ''),
    CONSTRAINT fiscal_calendar_period_rule_status_chk CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS control.company_fiscal_calendar_assignment (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    company_code_id       uuid        NOT NULL,
    fiscal_calendar_config_id uuid    NOT NULL,
    effective_fiscal_year_from smallint NOT NULL,
    effective_fiscal_year_to smallint,
    priority              smallint    NOT NULL DEFAULT 0,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'active',
    is_active             boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT company_fiscal_calendar_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT company_fiscal_calendar_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT company_fiscal_calendar_assignment_dates_chk CHECK
        (effective_fiscal_year_to IS NULL OR effective_fiscal_year_from <= effective_fiscal_year_to),
    CONSTRAINT company_fiscal_calendar_assignment_status_chk CHECK (status IN ('active', 'inactive'))
);

COMMENT ON TABLE control.fiscal_calendar_config IS
    'ARCHETYPE=C;SCOPE=T. Versioned reusable fiscal calendar header. Rules define monthly, week-based, 13-period, or irregular calendars.';
COMMENT ON TABLE control.fiscal_calendar_period_rule IS
    'ARCHETYPE=C;SCOPE=T. Ordered period construction rules for one fiscal calendar version. Adjustment semantics come from period_type, not period number.';
COMMENT ON TABLE control.company_fiscal_calendar_assignment IS
    'ARCHETYPE=B;SCOPE=T. Effective fiscal-year assignment of a reusable calendar version to a company code.';
