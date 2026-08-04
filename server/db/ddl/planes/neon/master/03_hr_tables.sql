-- Neon-only people, workforce, leave, payroll, and business-calendar masters.
-- These tables are tenant ERP authority and must not be added to Athyper or Mesh.

CREATE TABLE master.person (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    person_number   text,
    first_name      text        NOT NULL,
    middle_name     text,
    last_name       text        NOT NULL,
    display_name    text,
    preferred_name  text,
    primary_email   text,
    primary_phone   text,
    country_code    character(2),
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT person_pkey PRIMARY KEY (id),
    CONSTRAINT person_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT person_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT person_number_uq UNIQUE NULLS NOT DISTINCT (tenant_id, person_number),
    CONSTRAINT person_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT person_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT person_first_name_nonempty_chk CHECK (btrim(first_name) <> ''),
    CONSTRAINT person_last_name_nonempty_chk CHECK (btrim(last_name) <> ''),
    CONSTRAINT person_email_chk
        CHECK (primary_email IS NULL OR primary_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT person_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT person_status_chk CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    CONSTRAINT person_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT person_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.person IS
  'Neon controlled PII root for a natural person. Employee is the workforce identity; employment and work_assignment own contractual and organizational facts.';

CREATE TABLE master.person_sensitive_profile (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    person_id               uuid        NOT NULL,
    date_of_birth           date,
    gender                  text,
    marital_status          text,
    nationality_country_code character(2),
    national_id_type        text,
    national_id_token       text,
    tax_identifier_token    text,
    passport_number_token   text,
    emergency_contact       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    protected_attributes    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT person_sensitive_profile_pkey PRIMARY KEY (id),
    CONSTRAINT person_sensitive_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT person_sensitive_profile_person_uq UNIQUE (tenant_id, person_id),
    CONSTRAINT person_sensitive_profile_dob_chk
        CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE),
    CONSTRAINT person_sensitive_profile_emergency_object_chk
        CHECK (jsonb_typeof(emergency_contact) = 'object'),
    CONSTRAINT person_sensitive_profile_attributes_object_chk
        CHECK (jsonb_typeof(protected_attributes) = 'object'),
    CONSTRAINT person_sensitive_profile_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT person_sensitive_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.person_sensitive_profile IS
  'Neon sensitive person extension. Runtime exposure requires a purpose-specific HR/payroll service path and must not be projected to Mesh.';

CREATE TABLE master.site (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    company_code_id uuid        NOT NULL,
    description     text,
    site_type       text        NOT NULL,
    parent_site_id  uuid,
    level_no        smallint    NOT NULL DEFAULT 1,
    sort_order      smallint    NOT NULL DEFAULT 0,
    country_code    character(2) NOT NULL,
    timezone_code   text,
    manager_id      uuid,
    capacity_uom    text,
    capacity_value  numeric(12,2),
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status          text        NOT NULL DEFAULT 'draft',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT site_pkey PRIMARY KEY (id),
    CONSTRAINT site_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT site_company_identity_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT site_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT site_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT site_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT site_type_nonempty_chk CHECK (btrim(site_type) <> ''),
    CONSTRAINT site_parent_not_self_chk CHECK (parent_site_id IS DISTINCT FROM id),
    CONSTRAINT site_level_chk CHECK (level_no >= 1),
    CONSTRAINT site_capacity_chk CHECK (capacity_value IS NULL OR capacity_value >= 0),
    CONSTRAINT site_capacity_pair_chk
        CHECK ((capacity_value IS NULL) = (capacity_uom IS NULL)),
    CONSTRAINT site_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT site_status_chk CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    CONSTRAINT site_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT site_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.site IS
  'Neon physical operating location. Address values remain in master.address/address_link.';

CREATE TABLE master.career_band (
    id          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id   uuid        NOT NULL,
    code        text        NOT NULL,
    name        text        NOT NULL,
    sort_order  smallint    NOT NULL DEFAULT 0,
    status      text        NOT NULL DEFAULT 'active',
    is_active   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid        NOT NULL,
    updated_at  timestamptz,
    updated_by  uuid,
    CONSTRAINT career_band_pkey PRIMARY KEY (id),
    CONSTRAINT career_band_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT career_band_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT career_band_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT career_band_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT career_band_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.career_level (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    career_band_id  uuid,
    level_no        smallint    NOT NULL DEFAULT 1,
    sort_order      smallint    NOT NULL DEFAULT 0,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT career_level_pkey PRIMARY KEY (id),
    CONSTRAINT career_level_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT career_level_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT career_level_number_chk CHECK (level_no >= 1),
    CONSTRAINT career_level_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT career_level_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT career_level_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.designation (
    id          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id   uuid        NOT NULL,
    code        text        NOT NULL,
    name        text        NOT NULL,
    description text,
    status      text        NOT NULL DEFAULT 'active',
    is_active   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid        NOT NULL,
    updated_at  timestamptz,
    updated_by  uuid,
    CONSTRAINT designation_pkey PRIMARY KEY (id),
    CONSTRAINT designation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT designation_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT designation_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT designation_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT designation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.job_family (
    id          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id   uuid        NOT NULL,
    code        text        NOT NULL,
    name        text        NOT NULL,
    description text,
    status      text        NOT NULL DEFAULT 'active',
    is_active   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid        NOT NULL,
    updated_at  timestamptz,
    updated_by  uuid,
    CONSTRAINT job_family_pkey PRIMARY KEY (id),
    CONSTRAINT job_family_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_family_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT job_family_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT job_family_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT job_family_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.job_function (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    job_family_id   uuid,
    description     text,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT job_function_pkey PRIMARY KEY (id),
    CONSTRAINT job_function_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_function_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT job_function_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT job_function_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT job_function_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.pay_grade (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    grade_set       text,
    min_amount      numeric(18,4),
    midpoint_amount numeric(18,4),
    max_amount      numeric(18,4),
    currency_code   character(3),
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT pay_grade_pkey PRIMARY KEY (id),
    CONSTRAINT pay_grade_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_grade_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_grade_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT pay_grade_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT pay_grade_amounts_chk CHECK (
        (min_amount IS NULL OR min_amount >= 0)
        AND (midpoint_amount IS NULL OR midpoint_amount >= 0)
        AND (max_amount IS NULL OR max_amount >= 0)
        AND (min_amount IS NULL OR midpoint_amount IS NULL OR min_amount <= midpoint_amount)
        AND (midpoint_amount IS NULL OR max_amount IS NULL OR midpoint_amount <= max_amount)
        AND (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount)
    ),
    CONSTRAINT pay_grade_currency_required_chk CHECK (
        currency_code IS NOT NULL
        OR (min_amount IS NULL AND midpoint_amount IS NULL AND max_amount IS NULL)
    ),
    CONSTRAINT pay_grade_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.job (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    job_family_id   uuid,
    job_function_id uuid,
    career_band_id  uuid,
    career_level_id uuid,
    pay_grade_id    uuid,
    designation_id  uuid,
    description     text,
    status          text        NOT NULL DEFAULT 'draft',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT job_pkey PRIMARY KEY (id),
    CONSTRAINT job_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT job_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT job_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT job_status_chk CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    CONSTRAINT job_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.holiday_calendar (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    country_code    character(2),
    company_code_id uuid,
    legal_entity_id uuid,
    site_id         uuid,
    weekend_pattern text        NOT NULL DEFAULT 'SAT_SUN',
    weekend_days    smallint[],
    description     text,
    is_default      boolean     NOT NULL DEFAULT false,
    sort_order      smallint    NOT NULL DEFAULT 0,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT holiday_calendar_pkey PRIMARY KEY (id),
    CONSTRAINT holiday_calendar_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT holiday_calendar_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT holiday_calendar_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT holiday_calendar_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT holiday_calendar_weekend_days_chk CHECK (
        weekend_days IS NULL
        OR (
            cardinality(weekend_days) BETWEEN 1 AND 7
            AND weekend_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
        )
    ),
    CONSTRAINT holiday_calendar_custom_weekend_chk
        CHECK (weekend_pattern <> 'CUSTOM' OR weekend_days IS NOT NULL),
    CONSTRAINT holiday_calendar_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT holiday_calendar_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT holiday_calendar_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.holiday_calendar_day (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    holiday_calendar_id uuid        NOT NULL,
    calendar_year       smallint    NOT NULL,
    holiday_date        date        NOT NULL,
    name                text        NOT NULL,
    day_type            text        NOT NULL DEFAULT 'HOLIDAY',
    observance_type     text        NOT NULL DEFAULT 'MANDATORY',
    is_half_day         boolean     NOT NULL DEFAULT false,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT holiday_calendar_day_pkey PRIMARY KEY (id),
    CONSTRAINT holiday_calendar_day_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT holiday_calendar_day_date_uq UNIQUE (tenant_id, holiday_calendar_id, holiday_date),
    CONSTRAINT holiday_calendar_day_year_chk
        CHECK (calendar_year = EXTRACT(YEAR FROM holiday_date)::smallint),
    CONSTRAINT holiday_calendar_day_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT holiday_calendar_day_type_chk
        CHECK (day_type IN ('HOLIDAY', 'WORKING_OVERRIDE', 'BLACKOUT')),
    CONSTRAINT holiday_calendar_day_observance_chk
        CHECK (observance_type IN ('MANDATORY', 'OPTIONAL', 'INFORMATIONAL')),
    CONSTRAINT holiday_calendar_day_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT holiday_calendar_day_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.shift_type (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    start_time      time        NOT NULL,
    end_time        time        NOT NULL,
    break_minutes   smallint    NOT NULL DEFAULT 0,
    paid_minutes    smallint,
    is_overnight    boolean     NOT NULL DEFAULT false,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT shift_type_pkey PRIMARY KEY (id),
    CONSTRAINT shift_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT shift_type_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT shift_type_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT shift_type_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT shift_type_break_chk CHECK (break_minutes BETWEEN 0 AND 1440),
    CONSTRAINT shift_type_paid_chk CHECK (paid_minutes IS NULL OR paid_minutes BETWEEN 0 AND 1440),
    CONSTRAINT shift_type_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.work_pattern (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    pattern_type        text        NOT NULL DEFAULT 'weekly',
    cycle_length_days   smallint    NOT NULL DEFAULT 7,
    weekly_hours        numeric(8,2),
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT work_pattern_pkey PRIMARY KEY (id),
    CONSTRAINT work_pattern_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT work_pattern_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT work_pattern_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT work_pattern_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT work_pattern_type_chk
        CHECK (pattern_type IN ('weekly', 'bi_weekly', 'rotating', 'flexible', 'custom')),
    CONSTRAINT work_pattern_cycle_chk CHECK (cycle_length_days BETWEEN 1 AND 366),
    CONSTRAINT work_pattern_hours_chk CHECK (weekly_hours IS NULL OR weekly_hours BETWEEN 0 AND 168),
    CONSTRAINT work_pattern_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT work_pattern_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.work_pattern_day (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    work_pattern_id     uuid        NOT NULL,
    day_no              smallint    NOT NULL,
    is_working_day      boolean     NOT NULL DEFAULT true,
    start_time          time,
    end_time            time,
    break_minutes       smallint    NOT NULL DEFAULT 0,
    planned_minutes     smallint    NOT NULL DEFAULT 0,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT work_pattern_day_pkey PRIMARY KEY (id),
    CONSTRAINT work_pattern_day_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT work_pattern_day_no_uq UNIQUE (tenant_id, work_pattern_id, day_no),
    CONSTRAINT work_pattern_day_number_chk CHECK (day_no BETWEEN 1 AND 366),
    CONSTRAINT work_pattern_day_break_chk CHECK (break_minutes BETWEEN 0 AND 1440),
    CONSTRAINT work_pattern_day_planned_chk CHECK (planned_minutes BETWEEN 0 AND 1440),
    CONSTRAINT work_pattern_day_times_chk CHECK (
        (
            is_working_day
            AND (
                (start_time IS NOT NULL AND end_time IS NOT NULL)
                OR (start_time IS NULL AND end_time IS NULL AND planned_minutes > 0)
            )
        )
        OR (NOT is_working_day AND start_time IS NULL AND end_time IS NULL AND planned_minutes = 0)
    ),
    CONSTRAINT work_pattern_day_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT work_pattern_day_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.pay_component (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    component_type          text        NOT NULL,
    value_type              text        NOT NULL DEFAULT 'amount',
    taxable_behavior        text        NOT NULL DEFAULT 'taxable',
    is_recurring            boolean     NOT NULL DEFAULT true,
    is_employer_cost        boolean     NOT NULL DEFAULT false,
    formula_expression_id   uuid,
    default_gl_role         text,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'draft',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT pay_component_pkey PRIMARY KEY (id),
    CONSTRAINT pay_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_component_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_component_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT pay_component_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT pay_component_type_nonempty_chk CHECK (btrim(component_type) <> ''),
    CONSTRAINT pay_component_value_type_chk
        CHECK (value_type IN ('amount', 'rate', 'quantity', 'formula')),
    CONSTRAINT pay_component_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT pay_component_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.pay_group (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    legal_entity_id uuid,
    company_code_id uuid        NOT NULL,
    pay_frequency   text        NOT NULL DEFAULT 'monthly',
    currency_code   character(3) NOT NULL,
    country_code    character(2),
    calendar_id     uuid,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT pay_group_pkey PRIMARY KEY (id),
    CONSTRAINT pay_group_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_group_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_group_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT pay_group_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT pay_group_frequency_chk
        CHECK (pay_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly')),
    CONSTRAINT pay_group_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.pay_structure (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    pay_group_id    uuid,
    currency_code   character(3) NOT NULL,
    effective_from  date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until date,
    status          text        NOT NULL DEFAULT 'draft',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT pay_structure_pkey PRIMARY KEY (id),
    CONSTRAINT pay_structure_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_structure_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_structure_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT pay_structure_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT pay_structure_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT pay_structure_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.pay_structure_line (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    pay_structure_id      uuid        NOT NULL,
    pay_component_id      uuid        NOT NULL,
    line_no               smallint    NOT NULL,
    default_amount        numeric(18,4),
    default_rate          numeric(18,8),
    formula_expression_id uuid,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT pay_structure_line_pkey PRIMARY KEY (id),
    CONSTRAINT pay_structure_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_structure_line_no_uq UNIQUE (tenant_id, pay_structure_id, line_no),
    CONSTRAINT pay_structure_line_component_uq UNIQUE (tenant_id, pay_structure_id, pay_component_id),
    CONSTRAINT pay_structure_line_number_chk CHECK (line_no >= 1),
    CONSTRAINT pay_structure_line_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT pay_structure_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.statutory_scheme (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    country_code            character(2) NOT NULL,
    scheme_type             text        NOT NULL,
    employee_component_id   uuid,
    employer_component_id   uuid,
    rate_table_id           uuid,
    formula_expression_id   uuid,
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT statutory_scheme_pkey PRIMARY KEY (id),
    CONSTRAINT statutory_scheme_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT statutory_scheme_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT statutory_scheme_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT statutory_scheme_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT statutory_scheme_type_nonempty_chk CHECK (btrim(scheme_type) <> ''),
    CONSTRAINT statutory_scheme_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.leave_type (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    leave_category      text        NOT NULL DEFAULT 'annual',
    unit                text        NOT NULL DEFAULT 'day',
    is_paid             boolean     NOT NULL DEFAULT true,
    requires_attachment boolean     NOT NULL DEFAULT false,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT leave_type_pkey PRIMARY KEY (id),
    CONSTRAINT leave_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT leave_type_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT leave_type_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT leave_type_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT leave_type_unit_chk CHECK (unit IN ('day', 'hour')),
    CONSTRAINT leave_type_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.leave_plan (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    leave_type_id           uuid        NOT NULL,
    country_code            character(2),
    legal_entity_id         uuid,
    company_code_id         uuid,
    accrual_frequency       text        NOT NULL DEFAULT 'monthly',
    carry_forward_policy    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'draft',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT leave_plan_pkey PRIMARY KEY (id),
    CONSTRAINT leave_plan_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT leave_plan_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT leave_plan_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT leave_plan_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT leave_plan_frequency_chk
        CHECK (
            accrual_frequency IN (
                'none', 'daily', 'weekly', 'monthly', 'quarterly',
                'annual', 'manual', 'on_hire'
            )
        ),
    CONSTRAINT leave_plan_carry_policy_object_chk CHECK (jsonb_typeof(carry_forward_policy) = 'object'),
    CONSTRAINT leave_plan_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.leave_plan_rule (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    leave_plan_id               uuid        NOT NULL,
    rule_code                   text        NOT NULL,
    priority                    smallint    NOT NULL DEFAULT 100,
    eligibility_condition       jsonb,
    entitlement_quantity        numeric(12,4),
    accrual_formula_version_id  uuid,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      text        NOT NULL DEFAULT 'active',
    is_active                   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,
    CONSTRAINT leave_plan_rule_pkey PRIMARY KEY (id),
    CONSTRAINT leave_plan_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT leave_plan_rule_code_uq UNIQUE (tenant_id, leave_plan_id, rule_code),
    CONSTRAINT leave_plan_rule_code_nonempty_chk CHECK (btrim(rule_code) <> ''),
    CONSTRAINT leave_plan_rule_priority_chk CHECK (priority >= 0),
    CONSTRAINT leave_plan_rule_entitlement_chk
        CHECK (entitlement_quantity IS NULL OR entitlement_quantity >= 0),
    CONSTRAINT leave_plan_rule_eligibility_object_chk
        CHECK (eligibility_condition IS NULL OR jsonb_typeof(eligibility_condition) = 'object'),
    CONSTRAINT leave_plan_rule_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT leave_plan_rule_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.position (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    legal_entity_id         uuid,
    company_code_id         uuid        NOT NULL,
    org_unit_id             uuid,
    job_id                  uuid,
    reports_to_position_id  uuid,
    cost_center_id          uuid,
    profit_center_id        uuid,
    site_id                 uuid,
    position_type           text        NOT NULL DEFAULT 'regular',
    headcount_capacity      numeric(10,2) NOT NULL DEFAULT 1,
    valid_from              date,
    valid_to                date,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'draft',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT position_pkey PRIMARY KEY (id),
    CONSTRAINT position_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT position_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT position_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT position_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT position_parent_not_self_chk CHECK (reports_to_position_id IS DISTINCT FROM id),
    CONSTRAINT position_capacity_chk CHECK (headcount_capacity > 0),
    CONSTRAINT position_validity_chk CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CONSTRAINT position_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT position_status_chk CHECK (status IN ('draft', 'active', 'frozen', 'closed', 'archived')),
    CONSTRAINT position_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.employee (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    principal_id        uuid,
    person_id           uuid        NOT NULL,
    employee_number     text        NOT NULL,
    first_name          text        NOT NULL,
    last_name           text        NOT NULL,
    display_name        text,
    email               text,
    phone               text,
    employment_type     text        NOT NULL DEFAULT 'full_time',
    department          text,
    title               text,
    manager_id          uuid,
    company_code_id     uuid,
    hire_date           date,
    termination_date    date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT employee_pkey PRIMARY KEY (id),
    CONSTRAINT employee_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employee_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT employee_number_uq UNIQUE (tenant_id, employee_number),
    CONSTRAINT employee_person_uq UNIQUE (tenant_id, person_id),
    CONSTRAINT employee_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT employee_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT employee_number_nonempty_chk CHECK (btrim(employee_number) <> ''),
    CONSTRAINT employee_manager_not_self_chk CHECK (manager_id IS DISTINCT FROM id),
    CONSTRAINT employee_dates_chk
        CHECK (termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date),
    CONSTRAINT employee_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT employee_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT employee_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.employee IS
  'Neon workforce identity. Legacy flattened employment/organization columns are compatibility fields; employment and work_assignment are canonical for new writes.';

CREATE TABLE master.employment (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    person_id           uuid        NOT NULL,
    employee_id         uuid,
    legal_entity_id     uuid        NOT NULL,
    company_code_id     uuid        NOT NULL,
    employment_number   text        NOT NULL,
    employment_type     text        NOT NULL DEFAULT 'full_time',
    employment_status   text        NOT NULL DEFAULT 'active',
    hire_date           date        NOT NULL,
    service_date        date,
    probation_end_date  date,
    termination_date    date,
    termination_reason  text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT employment_pkey PRIMARY KEY (id),
    CONSTRAINT employment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employment_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT employment_number_uq UNIQUE (tenant_id, company_code_id, employment_number),
    CONSTRAINT employment_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT employment_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT employment_number_nonempty_chk CHECK (btrim(employment_number) <> ''),
    CONSTRAINT employment_type_chk
        CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'casual', 'intern', 'volunteer')),
    CONSTRAINT employment_status_chk
        CHECK (employment_status IN ('pending', 'active', 'suspended', 'terminated')),
    CONSTRAINT employment_lifecycle_alignment_chk CHECK (
        (employment_status = 'terminated' AND status IN ('inactive', 'archived'))
        OR (employment_status <> 'terminated' AND status <> 'archived')
    ),
    CONSTRAINT employment_dates_chk CHECK (
        (service_date IS NULL OR service_date <= hire_date)
        AND (probation_end_date IS NULL OR probation_end_date >= hire_date)
        AND (termination_date IS NULL OR termination_date >= hire_date)
    ),
    CONSTRAINT employment_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT employment_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.work_assignment (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    employee_id         uuid        NOT NULL,
    employment_id       uuid,
    position_id         uuid,
    org_unit_id         uuid,
    job_id              uuid,
    manager_employee_id uuid,
    company_code_id     uuid        NOT NULL,
    cost_center_id      uuid,
    profit_center_id    uuid,
    site_id             uuid,
    assignment_type     text        NOT NULL DEFAULT 'primary',
    fte                 numeric(5,4) NOT NULL DEFAULT 1,
    effective_from      date        NOT NULL,
    effective_until     date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT work_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT work_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT work_assignment_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT work_assignment_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT work_assignment_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT work_assignment_manager_not_self_chk CHECK (manager_employee_id IS DISTINCT FROM employee_id),
    CONSTRAINT work_assignment_type_chk
        CHECK (assignment_type IN ('primary', 'secondary', 'temporary', 'acting')),
    CONSTRAINT work_assignment_fte_chk CHECK (fte > 0 AND fte <= 1),
    CONSTRAINT work_assignment_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT work_assignment_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT work_assignment_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.employee_leave_enrollment (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    employee_id         uuid        NOT NULL,
    leave_plan_id       uuid        NOT NULL,
    effective_from      date        NOT NULL,
    effective_until     date,
    opening_balance     numeric(12,4) NOT NULL DEFAULT 0,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT employee_leave_enrollment_pkey PRIMARY KEY (id),
    CONSTRAINT employee_leave_enrollment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employee_leave_enrollment_uq
        UNIQUE (tenant_id, employee_id, leave_plan_id, effective_from),
    CONSTRAINT employee_leave_enrollment_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT employee_leave_enrollment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.employee_statutory_enrollment (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    employee_id             uuid        NOT NULL,
    statutory_scheme_id     uuid        NOT NULL,
    member_number           text,
    effective_from          date        NOT NULL,
    effective_until         date,
    contribution_category   text,
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT employee_statutory_enrollment_pkey PRIMARY KEY (id),
    CONSTRAINT employee_statutory_enrollment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employee_statutory_enrollment_uq
        UNIQUE (tenant_id, employee_id, statutory_scheme_id, effective_from),
    CONSTRAINT employee_statutory_enrollment_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT employee_statutory_enrollment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);
