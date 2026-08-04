CREATE TABLE control.fiscal_calendar_config (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    calendar_type           control.fiscal_calendar_type_d
                                        NOT NULL DEFAULT 'monthly',
    version_no              integer     NOT NULL DEFAULT 1,
    fiscal_year_label_rule  control.fiscal_year_label_rule_d
                                        NOT NULL DEFAULT 'start_year',
    year_start_rule         control.fiscal_year_start_rule_d
                                        NOT NULL DEFAULT 'fixed_date',
    anchor_month            smallint    NOT NULL DEFAULT 1,
    anchor_day              smallint    NOT NULL DEFAULT 1,
    week_start_day          smallint    NOT NULL DEFAULT 1,
    periods_per_year        smallint    NOT NULL DEFAULT 12,
    leap_week_rule          control.fiscal_leap_week_rule_d
                                        NOT NULL DEFAULT 'none',
    supersedes_id           uuid,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  control.fiscal_calendar_status_d
                                        NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT fiscal_calendar_config_pkey PRIMARY KEY (id),
    CONSTRAINT fiscal_calendar_config_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fiscal_calendar_config_code_version_uq
        UNIQUE (tenant_id, code, version_no),
    CONSTRAINT fiscal_calendar_config_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT fiscal_calendar_config_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT fiscal_calendar_config_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT fiscal_calendar_config_version_chk CHECK (version_no > 0),
    CONSTRAINT fiscal_calendar_config_anchor_month_chk
        CHECK (anchor_month BETWEEN 1 AND 12),
    CONSTRAINT fiscal_calendar_config_anchor_day_chk
        CHECK (anchor_day BETWEEN 1 AND 31),
    CONSTRAINT fiscal_calendar_config_weekday_chk
        CHECK (week_start_day BETWEEN 1 AND 7),
    CONSTRAINT fiscal_calendar_config_period_count_chk
        CHECK (periods_per_year BETWEEN 1 AND 16),
    CONSTRAINT fiscal_calendar_config_not_self_superseding_chk
        CHECK (supersedes_id IS NULL OR supersedes_id <> id),
    CONSTRAINT fiscal_calendar_config_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT fiscal_calendar_config_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT fiscal_calendar_config_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.fiscal_calendar_config IS
  'Neon-only versioned fiscal-calendar definition. Fiscal-year applicability belongs to company_fiscal_calendar_assignment; activated versions are immutable.';

CREATE TABLE control.fiscal_calendar_period_rule (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    fiscal_calendar_config_id   uuid        NOT NULL,
    sequence_no                 smallint    NOT NULL,
    period_number               smallint    NOT NULL,
    period_type                 master.fiscal_period_type_d
                                            NOT NULL DEFAULT 'normal',
    name_template               text        NOT NULL DEFAULT 'Period {period}',
    duration_unit               control.fiscal_rule_duration_unit_d
                                            NOT NULL DEFAULT 'month',
    duration_value              smallint    NOT NULL DEFAULT 1,
    anchor                      control.fiscal_rule_anchor_d
                                            NOT NULL DEFAULT 'sequence',
    quarter_number              smallint,
    absorbs_leap_week           boolean     NOT NULL DEFAULT false,
    sort_order                  smallint    NOT NULL DEFAULT 0,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,

    CONSTRAINT fiscal_calendar_period_rule_pkey PRIMARY KEY (id),
    CONSTRAINT fiscal_calendar_period_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fiscal_calendar_period_rule_sequence_uq
        UNIQUE (tenant_id, fiscal_calendar_config_id, sequence_no),
    CONSTRAINT fiscal_calendar_period_rule_number_uq
        UNIQUE (tenant_id, fiscal_calendar_config_id, period_number),
    CONSTRAINT fiscal_calendar_period_rule_sequence_chk
        CHECK (sequence_no BETWEEN 0 AND 99),
    CONSTRAINT fiscal_calendar_period_rule_number_chk
        CHECK (period_number BETWEEN 0 AND 99),
    CONSTRAINT fiscal_calendar_period_rule_type_number_chk CHECK (
        (period_type = 'opening' AND period_number = 0)
        OR (period_type = 'normal' AND period_number BETWEEN 1 AND 16)
        OR (period_type IN ('adjustment', 'closing') AND period_number BETWEEN 1 AND 99)
    ),
    CONSTRAINT fiscal_calendar_period_rule_name_chk
        CHECK (btrim(name_template) <> ''),
    CONSTRAINT fiscal_calendar_period_rule_duration_chk
        CHECK (duration_value BETWEEN 1 AND 53),
    CONSTRAINT fiscal_calendar_period_rule_point_chk
        CHECK (duration_unit <> 'point' OR duration_value = 1),
    CONSTRAINT fiscal_calendar_period_rule_anchor_chk CHECK (
        (period_type = 'normal' AND anchor = 'sequence')
        OR (period_type = 'opening' AND anchor = 'year_start')
        OR (period_type IN ('adjustment', 'closing') AND anchor IN ('sequence', 'year_end'))
    ),
    CONSTRAINT fiscal_calendar_period_rule_quarter_chk
        CHECK (quarter_number IS NULL OR quarter_number BETWEEN 1 AND 4),
    CONSTRAINT fiscal_calendar_period_rule_leap_chk CHECK (
        NOT absorbs_leap_week
        OR (period_type = 'normal' AND duration_unit = 'week')
    ),
    CONSTRAINT fiscal_calendar_period_rule_sort_chk CHECK (sort_order >= 0),
    CONSTRAINT fiscal_calendar_period_rule_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE control.fiscal_calendar_period_rule IS
  'Composition child containing the ordered construction rules of one fiscal-calendar version. Membership is mutable only while the parent is draft.';

CREATE TABLE control.company_fiscal_calendar_assignment (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    company_code_id             uuid        NOT NULL,
    fiscal_calendar_config_id   uuid        NOT NULL,
    effective_fiscal_year_from  smallint    NOT NULL,
    effective_fiscal_year_to    smallint,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      control.fiscal_calendar_assignment_status_d
                                            NOT NULL DEFAULT 'active',
    is_active                   boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT company_fiscal_calendar_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT company_fiscal_calendar_assignment_tenant_id_uq
        UNIQUE (tenant_id, id),
    CONSTRAINT company_fiscal_calendar_assignment_year_chk
        CHECK (effective_fiscal_year_from BETWEEN 1900 AND 9999),
    CONSTRAINT company_fiscal_calendar_assignment_range_chk CHECK (
        effective_fiscal_year_to IS NULL
        OR (
            effective_fiscal_year_to BETWEEN 1900 AND 9999
            AND effective_fiscal_year_to >= effective_fiscal_year_from
        )
    ),
    CONSTRAINT company_fiscal_calendar_assignment_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT company_fiscal_calendar_assignment_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_fiscal_calendar_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.company_fiscal_calendar_assignment IS
  'Non-overlapping effective fiscal-year assignment of one active calendar version to a Neon company code.';
