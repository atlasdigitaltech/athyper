-- ============================================================================
-- master/01p_tables_people.sql
-- Concept: Reuse-first People Management master data
-- Depends on: master identity/finance tables, control formula tables
-- ============================================================================

ALTER TABLE master.employee ADD COLUMN IF NOT EXISTS person_id uuid;
ALTER TABLE master.employee ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE master.employee ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE master.employee ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE master.employee ADD COLUMN IF NOT EXISTS employee_number text;
ALTER TABLE master.employee ADD COLUMN IF NOT EXISTS hire_date date;
ALTER TABLE master.employee ADD COLUMN IF NOT EXISTS termination_date date;
ALTER TABLE master.employee ADD COLUMN IF NOT EXISTS company_code_id uuid;
ALTER TABLE master.employee ADD COLUMN IF NOT EXISTS manager_id uuid;

CREATE TABLE IF NOT EXISTS master.person (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    person_number       text,
    first_name          text        NOT NULL,
    middle_name         text,
    last_name           text        NOT NULL,
    display_name        text,
    preferred_name      text,
    primary_email       text,
    primary_phone       text,
    country_code        char(2),
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    tags                jsonb       NOT NULL DEFAULT '[]'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT person_pkey PRIMARY KEY (id),
    CONSTRAINT person_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT person_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT person_number_uq UNIQUE (tenant_id, person_number),
    CONSTRAINT person_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT person_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT person_first_name_nonempty CHECK (btrim(first_name) <> ''),
    CONSTRAINT person_last_name_nonempty CHECK (btrim(last_name) <> ''),
    CONSTRAINT person_email_norm_chk CHECK (primary_email IS NULL OR primary_email = lower(trim(primary_email))),
    CONSTRAINT person_country_fmt_chk CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT person_status_chk CHECK (status IN ('active', 'inactive', 'merged', 'archived'))
);

COMMENT ON TABLE master.person IS
    'ARCHETYPE=B;SCOPE=T. Controlled PII root for a natural person. master.employee remains the platform worker/party record.';

CREATE TABLE IF NOT EXISTS master.person_sensitive_profile (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    person_id                   uuid        NOT NULL,
    date_of_birth               date,
    gender                      text,
    marital_status              text,
    nationality_country_code    char(2),
    national_id_type            text,
    national_id_token           text,
    tax_identifier_token        text,
    passport_number_token       text,
    emergency_contact           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    protected_attributes        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT person_sensitive_profile_pkey PRIMARY KEY (id),
    CONSTRAINT person_sensitive_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT person_sensitive_profile_person_uq UNIQUE (tenant_id, person_id),
    CONSTRAINT person_sensitive_profile_country_fmt_chk CHECK (
        nationality_country_code IS NULL OR nationality_country_code ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT person_sensitive_profile_json_chk CHECK (
        jsonb_typeof(emergency_contact) = 'object'
        AND jsonb_typeof(protected_attributes) = 'object'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT person_sensitive_profile_person_fk FOREIGN KEY (tenant_id, person_id)
        REFERENCES master.person (tenant_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE master.person_sensitive_profile IS
    'ARCHETYPE=C;SCOPE=T. Sensitive person attributes isolated from the worker record for stricter field-level policy.';

CREATE TABLE IF NOT EXISTS master.external_reference (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    owner_entity        text        NOT NULL,
    owner_id            uuid        NOT NULL,
    source_system       text        NOT NULL,
    external_id         text        NOT NULL,
    external_code       text,
    payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    valid_from          date,
    valid_until         date,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT external_reference_pkey PRIMARY KEY (id),
    CONSTRAINT external_reference_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_reference_source_uq UNIQUE (tenant_id, source_system, external_id),
    CONSTRAINT external_reference_owner_nonempty CHECK (btrim(owner_entity) <> ''),
    CONSTRAINT external_reference_source_nonempty CHECK (btrim(source_system) <> ''),
    CONSTRAINT external_reference_external_nonempty CHECK (btrim(external_id) <> ''),
    CONSTRAINT external_reference_valid_chk CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT external_reference_payload_chk CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT external_reference_status_chk CHECK (status IN ('active', 'inactive', 'archived'))
);

CREATE TABLE IF NOT EXISTS master.org_unit (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    unit_type           text        NOT NULL,
    parent_id           uuid,
    legal_entity_id     uuid,
    company_code_id     uuid,
    cost_center_id      uuid,
    manager_employee_id uuid,
    level_no            smallint    NOT NULL DEFAULT 1,
    path                text,
    sort_order          smallint    NOT NULL DEFAULT 0,
    valid_from          date,
    valid_to            date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'draft',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT org_unit_pkey PRIMARY KEY (id),
    CONSTRAINT org_unit_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT org_unit_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT org_unit_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT org_unit_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT org_unit_no_self_ref CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT org_unit_valid_chk CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CONSTRAINT org_unit_type_chk CHECK (unit_type IN ('business_unit', 'division', 'department', 'section', 'team', 'other')),
    CONSTRAINT org_unit_status_chk CHECK (status IN ('draft', 'active', 'inactive', 'archived'))
);

CREATE TABLE IF NOT EXISTS master.job_family (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT job_family_pkey PRIMARY KEY (id),
    CONSTRAINT job_family_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_family_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT job_family_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT job_family_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT job_family_status_chk CHECK (status IN ('active', 'inactive', 'archived'))
);

CREATE TABLE IF NOT EXISTS master.job_function (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    job_family_id uuid,
    description text,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT job_function_pkey PRIMARY KEY (id),
    CONSTRAINT job_function_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_function_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT job_function_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT job_function_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT job_function_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT job_function_family_fk FOREIGN KEY (tenant_id, job_family_id)
        REFERENCES master.job_family (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.career_band (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    sort_order smallint NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT career_band_pkey PRIMARY KEY (id),
    CONSTRAINT career_band_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT career_band_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT career_band_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT career_band_name_nonempty CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS master.career_level (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    career_band_id uuid,
    level_no smallint NOT NULL DEFAULT 1,
    sort_order smallint NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT career_level_pkey PRIMARY KEY (id),
    CONSTRAINT career_level_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT career_level_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT career_level_no_chk CHECK (level_no >= 1),
    CONSTRAINT career_level_band_fk FOREIGN KEY (tenant_id, career_band_id)
        REFERENCES master.career_band (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.pay_grade (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    grade_set text,
    min_amount numeric(18,4),
    midpoint_amount numeric(18,4),
    max_amount numeric(18,4),
    currency_code char(3),
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT pay_grade_pkey PRIMARY KEY (id),
    CONSTRAINT pay_grade_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_grade_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_grade_amount_chk CHECK (
        (min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount)
        AND (midpoint_amount IS NULL OR min_amount IS NULL OR midpoint_amount >= min_amount)
        AND (midpoint_amount IS NULL OR max_amount IS NULL OR midpoint_amount <= max_amount)
    ),
    CONSTRAINT pay_grade_currency_chk CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS master.designation (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT designation_pkey PRIMARY KEY (id),
    CONSTRAINT designation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT designation_code_uq UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS master.job (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    job_family_id uuid,
    job_function_id uuid,
    career_band_id uuid,
    career_level_id uuid,
    pay_grade_id uuid,
    designation_id uuid,
    description text,
    status text NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT job_pkey PRIMARY KEY (id),
    CONSTRAINT job_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT job_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT job_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT job_status_chk CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    CONSTRAINT job_family_fk FOREIGN KEY (tenant_id, job_family_id) REFERENCES master.job_family (tenant_id, id),
    CONSTRAINT job_function_fk FOREIGN KEY (tenant_id, job_function_id) REFERENCES master.job_function (tenant_id, id),
    CONSTRAINT job_band_fk FOREIGN KEY (tenant_id, career_band_id) REFERENCES master.career_band (tenant_id, id),
    CONSTRAINT job_level_fk FOREIGN KEY (tenant_id, career_level_id) REFERENCES master.career_level (tenant_id, id),
    CONSTRAINT job_grade_fk FOREIGN KEY (tenant_id, pay_grade_id) REFERENCES master.pay_grade (tenant_id, id),
    CONSTRAINT job_designation_fk FOREIGN KEY (tenant_id, designation_id) REFERENCES master.designation (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.position (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    legal_entity_id uuid,
    company_code_id uuid NOT NULL,
    org_unit_id uuid,
    job_id uuid,
    reports_to_position_id uuid,
    cost_center_id uuid,
    profit_center_id uuid,
    site_id uuid,
    position_type text NOT NULL DEFAULT 'regular',
    headcount_capacity numeric(10,2) NOT NULL DEFAULT 1,
    valid_from date,
    valid_to date,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT position_pkey PRIMARY KEY (id),
    CONSTRAINT position_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT position_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT position_no_self_ref CHECK (reports_to_position_id IS DISTINCT FROM id),
    CONSTRAINT position_type_chk CHECK (position_type IN ('regular', 'contract', 'temporary', 'internship', 'vacant', 'other')),
    CONSTRAINT position_capacity_chk CHECK (headcount_capacity > 0),
    CONSTRAINT position_valid_chk CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CONSTRAINT position_status_chk CHECK (status IN ('draft', 'active', 'frozen', 'inactive', 'archived')),
    CONSTRAINT position_org_unit_fk FOREIGN KEY (tenant_id, org_unit_id) REFERENCES master.org_unit (tenant_id, id),
    CONSTRAINT position_job_fk FOREIGN KEY (tenant_id, job_id) REFERENCES master.job (tenant_id, id),
    CONSTRAINT position_reports_to_fk FOREIGN KEY (tenant_id, reports_to_position_id) REFERENCES master.position (tenant_id, id),
    CONSTRAINT position_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id),
    CONSTRAINT position_legal_entity_fk FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity (tenant_id, id),
    CONSTRAINT position_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center (tenant_id, id),
    CONSTRAINT position_profit_center_fk FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center (tenant_id, id),
    CONSTRAINT position_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.employment (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    person_id uuid NOT NULL,
    employee_id uuid,
    legal_entity_id uuid NOT NULL,
    company_code_id uuid NOT NULL,
    employment_number text NOT NULL,
    employment_type text NOT NULL DEFAULT 'full_time',
    employment_status text NOT NULL DEFAULT 'active',
    hire_date date NOT NULL,
    service_date date,
    probation_end_date date,
    termination_date date,
    termination_reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT employment_pkey PRIMARY KEY (id),
    CONSTRAINT employment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employment_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT employment_number_uq UNIQUE (tenant_id, employment_number),
    CONSTRAINT employment_dates_chk CHECK (termination_date IS NULL OR termination_date >= hire_date),
    CONSTRAINT employment_type_chk CHECK (employment_type IN ('full_time','part_time','contract','casual','intern','volunteer')),
    CONSTRAINT employment_status_consistency_chk CHECK (employment_status = status),
    CONSTRAINT employment_status_date_chk CHECK (
        (status = 'terminated' AND termination_date IS NOT NULL)
        OR (status <> 'terminated')
    ),
    CONSTRAINT employment_status_chk CHECK (status IN ('draft', 'active', 'suspended', 'terminated', 'archived')),
    CONSTRAINT employment_person_fk FOREIGN KEY (tenant_id, person_id) REFERENCES master.person (tenant_id, id),
    CONSTRAINT employment_employee_fk FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee (tenant_id, id),
    CONSTRAINT employment_legal_entity_fk FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity (tenant_id, id),
    CONSTRAINT employment_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.work_assignment (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    employee_id uuid NOT NULL,
    employment_id uuid,
    position_id uuid,
    org_unit_id uuid,
    job_id uuid,
    manager_employee_id uuid,
    company_code_id uuid NOT NULL,
    cost_center_id uuid,
    profit_center_id uuid,
    site_id uuid,
    assignment_type text NOT NULL DEFAULT 'primary',
    fte numeric(5,4) NOT NULL DEFAULT 1,
    effective_from date NOT NULL,
    effective_until date,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT work_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT work_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT work_assignment_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT work_assignment_dates_chk CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT work_assignment_fte_chk CHECK (fte > 0 AND fte <= 1.5),
    CONSTRAINT work_assignment_type_chk CHECK (assignment_type IN ('primary', 'secondary', 'temporary', 'acting')),
    CONSTRAINT work_assignment_status_chk CHECK (status IN ('draft', 'active', 'ended', 'archived')),
    CONSTRAINT work_assignment_employee_fk FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee (tenant_id, id),
    CONSTRAINT work_assignment_employment_fk FOREIGN KEY (tenant_id, employment_id) REFERENCES master.employment (tenant_id, id),
    CONSTRAINT work_assignment_position_fk FOREIGN KEY (tenant_id, position_id) REFERENCES master.position (tenant_id, id),
    CONSTRAINT work_assignment_org_unit_fk FOREIGN KEY (tenant_id, org_unit_id) REFERENCES master.org_unit (tenant_id, id),
    CONSTRAINT work_assignment_job_fk FOREIGN KEY (tenant_id, job_id) REFERENCES master.job (tenant_id, id),
    CONSTRAINT work_assignment_manager_fk FOREIGN KEY (tenant_id, manager_employee_id) REFERENCES master.employee (tenant_id, id),
    CONSTRAINT work_assignment_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id),
    CONSTRAINT work_assignment_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center (tenant_id, id),
    CONSTRAINT work_assignment_profit_center_fk FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center (tenant_id, id),
    CONSTRAINT work_assignment_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS work_assignment_one_primary_active_uq
    ON master.work_assignment (tenant_id, employee_id)
    WHERE assignment_type = 'primary' AND status = 'active';

CREATE TABLE IF NOT EXISTS master.work_pattern (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    pattern_type text NOT NULL DEFAULT 'weekly',
    cycle_length_days smallint NOT NULL DEFAULT 7,
    weekly_hours numeric(8,2),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT work_pattern_pkey PRIMARY KEY (id),
    CONSTRAINT work_pattern_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT work_pattern_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT work_pattern_type_chk CHECK (pattern_type IN ('weekly','bi_weekly','monthly','rotating','fixed','flexible')),
    CONSTRAINT work_pattern_cycle_chk CHECK (cycle_length_days BETWEEN 1 AND 31),
    CONSTRAINT work_pattern_hours_chk CHECK (weekly_hours IS NULL OR weekly_hours >= 0)
);

CREATE TABLE IF NOT EXISTS master.work_pattern_day (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    work_pattern_id uuid NOT NULL,
    day_no smallint NOT NULL,
    is_working_day boolean NOT NULL DEFAULT true,
    start_time time,
    end_time time,
    break_minutes smallint NOT NULL DEFAULT 0,
    planned_minutes smallint NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT work_pattern_day_pkey PRIMARY KEY (id),
    CONSTRAINT work_pattern_day_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT work_pattern_day_no_uq UNIQUE (tenant_id, work_pattern_id, day_no),
    CONSTRAINT work_pattern_day_no_chk CHECK (day_no BETWEEN 1 AND 31),
    CONSTRAINT work_pattern_day_minutes_chk CHECK (break_minutes >= 0 AND planned_minutes >= 0),
    CONSTRAINT work_pattern_day_time_chk CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time),
    CONSTRAINT work_pattern_day_planned_chk CHECK (
        start_time IS NULL OR end_time IS NULL
        OR planned_minutes = ((EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::int - break_minutes)
    ),
    CONSTRAINT work_pattern_day_pattern_fk FOREIGN KEY (tenant_id, work_pattern_id)
        REFERENCES master.work_pattern (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS master.shift_type (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    break_minutes smallint NOT NULL DEFAULT 0,
    paid_minutes smallint,
    is_overnight boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT shift_type_pkey PRIMARY KEY (id),
    CONSTRAINT shift_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT shift_type_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT shift_type_time_order_chk CHECK (is_overnight OR end_time > start_time),
    CONSTRAINT shift_type_minutes_chk CHECK (break_minutes >= 0 AND (paid_minutes IS NULL OR paid_minutes >= 0))
);

CREATE TABLE IF NOT EXISTS master.leave_type (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    leave_category text NOT NULL DEFAULT 'annual',
    unit text NOT NULL DEFAULT 'day',
    is_paid boolean NOT NULL DEFAULT true,
    requires_attachment boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT leave_type_pkey PRIMARY KEY (id),
    CONSTRAINT leave_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT leave_type_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT leave_type_category_chk CHECK (
        leave_category IN ('annual','sick','maternity','paternity','bereavement','unpaid','compensatory','study','other')
    ),
    CONSTRAINT leave_type_unit_chk CHECK (unit IN ('hour', 'day'))
);

CREATE TABLE IF NOT EXISTS master.leave_plan (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    leave_type_id uuid NOT NULL,
    country_code char(2),
    legal_entity_id uuid,
    company_code_id uuid,
    accrual_frequency text NOT NULL DEFAULT 'monthly',
    carry_forward_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT leave_plan_pkey PRIMARY KEY (id),
    CONSTRAINT leave_plan_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT leave_plan_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT leave_plan_country_chk CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT leave_plan_frequency_chk CHECK (
        accrual_frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual', 'on_hire', 'manual')
    ),
    CONSTRAINT leave_plan_json_chk CHECK (jsonb_typeof(carry_forward_policy) = 'object'),
    CONSTRAINT leave_plan_type_fk FOREIGN KEY (tenant_id, leave_type_id) REFERENCES master.leave_type (tenant_id, id),
    CONSTRAINT leave_plan_legal_fk FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity (tenant_id, id),
    CONSTRAINT leave_plan_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.leave_plan_rule (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    leave_plan_id uuid NOT NULL,
    rule_code text NOT NULL,
    priority smallint NOT NULL DEFAULT 100,
    eligibility_condition jsonb,
    entitlement_quantity numeric(12,4),
    accrual_formula_version_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT leave_plan_rule_pkey PRIMARY KEY (id),
    CONSTRAINT leave_plan_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT leave_plan_rule_code_uq UNIQUE (tenant_id, leave_plan_id, rule_code),
    CONSTRAINT leave_plan_rule_priority_chk CHECK (priority >= 1),
    CONSTRAINT leave_plan_rule_quantity_chk CHECK (entitlement_quantity IS NULL OR entitlement_quantity >= 0),
    CONSTRAINT leave_plan_rule_plan_fk FOREIGN KEY (tenant_id, leave_plan_id)
        REFERENCES master.leave_plan (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS master.employee_leave_enrollment (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    leave_plan_id uuid NOT NULL,
    effective_from date NOT NULL,
    effective_until date,
    opening_balance numeric(12,4) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT employee_leave_enrollment_pkey PRIMARY KEY (id),
    CONSTRAINT employee_leave_enrollment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employee_leave_enrollment_uq UNIQUE (tenant_id, employee_id, leave_plan_id, effective_from),
    CONSTRAINT employee_leave_enrollment_dates_chk CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT employee_leave_enrollment_employee_fk FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee (tenant_id, id),
    CONSTRAINT employee_leave_enrollment_plan_fk FOREIGN KEY (tenant_id, leave_plan_id) REFERENCES master.leave_plan (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.pay_group (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    legal_entity_id uuid,
    company_code_id uuid NOT NULL,
    pay_frequency text NOT NULL DEFAULT 'monthly',
    currency_code char(3) NOT NULL,
    country_code char(2),
    calendar_id uuid,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT pay_group_pkey PRIMARY KEY (id),
    CONSTRAINT pay_group_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_group_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_group_frequency_chk CHECK (
        pay_frequency IN ('weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'quarterly')
    ),
    CONSTRAINT pay_group_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$'),
    CONSTRAINT pay_group_country_chk CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT pay_group_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id),
    CONSTRAINT pay_group_legal_fk FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity (tenant_id, id),
    CONSTRAINT pay_group_calendar_fk FOREIGN KEY (tenant_id, calendar_id) REFERENCES master.holiday_calendar (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.pay_component (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    component_type text NOT NULL,
    value_type text NOT NULL DEFAULT 'amount',
    taxable_behavior text NOT NULL DEFAULT 'taxable',
    is_recurring boolean NOT NULL DEFAULT true,
    is_employer_cost boolean NOT NULL DEFAULT false,
    formula_expression_id uuid,
    default_gl_role text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT pay_component_pkey PRIMARY KEY (id),
    CONSTRAINT pay_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_component_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_component_type_chk CHECK (component_type IN ('earning', 'deduction', 'employer_contribution', 'statutory', 'memo')),
    CONSTRAINT pay_component_value_type_chk CHECK (value_type IN ('amount', 'rate', 'formula', 'quantity'))
);

CREATE TABLE IF NOT EXISTS master.pay_structure (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    pay_group_id uuid,
    currency_code char(3) NOT NULL,
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_until date,
    status text NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT pay_structure_pkey PRIMARY KEY (id),
    CONSTRAINT pay_structure_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_structure_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_structure_dates_chk CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT pay_structure_group_fk FOREIGN KEY (tenant_id, pay_group_id) REFERENCES master.pay_group (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.pay_structure_line (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    pay_structure_id uuid NOT NULL,
    pay_component_id uuid NOT NULL,
    line_no smallint NOT NULL,
    default_amount numeric(18,4),
    default_rate numeric(18,8),
    formula_expression_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT pay_structure_line_pkey PRIMARY KEY (id),
    CONSTRAINT pay_structure_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_structure_line_no_uq UNIQUE (tenant_id, pay_structure_id, line_no),
    CONSTRAINT pay_structure_line_component_uq UNIQUE (tenant_id, pay_structure_id, pay_component_id),
    CONSTRAINT pay_structure_line_no_chk CHECK (line_no > 0),
    CONSTRAINT pay_structure_line_structure_fk FOREIGN KEY (tenant_id, pay_structure_id)
        REFERENCES master.pay_structure (tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT pay_structure_line_component_fk FOREIGN KEY (tenant_id, pay_component_id)
        REFERENCES master.pay_component (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.statutory_scheme (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    country_code char(2) NOT NULL,
    scheme_type text NOT NULL,
    employee_component_id uuid,
    employer_component_id uuid,
    rate_table_id uuid,
    formula_expression_id uuid,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT statutory_scheme_pkey PRIMARY KEY (id),
    CONSTRAINT statutory_scheme_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT statutory_scheme_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT statutory_scheme_country_chk CHECK (country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT statutory_scheme_type_chk CHECK (
        scheme_type IN ('pension', 'social_security', 'income_tax', 'healthcare', 'workers_comp', 'other')
    ),
    CONSTRAINT statutory_scheme_employee_component_fk FOREIGN KEY (tenant_id, employee_component_id) REFERENCES master.pay_component (tenant_id, id),
    CONSTRAINT statutory_scheme_employer_component_fk FOREIGN KEY (tenant_id, employer_component_id) REFERENCES master.pay_component (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS master.employee_statutory_enrollment (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    statutory_scheme_id uuid NOT NULL,
    member_number text,
    effective_from date NOT NULL,
    effective_until date,
    contribution_category text,
    status text NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT employee_statutory_enrollment_pkey PRIMARY KEY (id),
    CONSTRAINT employee_statutory_enrollment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employee_statutory_enrollment_uq UNIQUE (tenant_id, employee_id, statutory_scheme_id, effective_from),
    CONSTRAINT employee_statutory_enrollment_dates_chk CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT employee_statutory_enrollment_employee_fk FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee (tenant_id, id),
    CONSTRAINT employee_statutory_enrollment_scheme_fk FOREIGN KEY (tenant_id, statutory_scheme_id) REFERENCES master.statutory_scheme (tenant_id, id)
);

DO $$
BEGIN
    ALTER TABLE master.employee
        ADD CONSTRAINT employee_person_fk
        FOREIGN KEY (tenant_id, person_id)
        REFERENCES master.person (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;
