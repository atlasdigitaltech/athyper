-- Neon-only formula and rate-table authority for HR, leave, and payroll.

CREATE TABLE control.formula_expression (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    code              text        NOT NULL,
    name              text        NOT NULL,
    module_code       text        NOT NULL DEFAULT 'PAYROLL',
    formula_kind      text        NOT NULL DEFAULT 'payroll',
    description       text,
    input_schema      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    output_schema     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    default_rounding  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status            text        NOT NULL DEFAULT 'draft',
    is_active         boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT formula_expression_pkey PRIMARY KEY (id),
    CONSTRAINT formula_expression_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT formula_expression_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT formula_expression_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT formula_expression_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT formula_expression_module_nonempty_chk CHECK (btrim(module_code) <> ''),
    CONSTRAINT formula_expression_kind_chk
        CHECK (
            formula_kind IN (
                'payroll', 'tax', 'accrual', 'leave',
                'benefit', 'statutory', 'workforce'
            )
        ),
    CONSTRAINT formula_expression_json_chk CHECK (
        jsonb_typeof(input_schema) = 'object'
        AND jsonb_typeof(output_schema) = 'object'
        AND jsonb_typeof(default_rounding) = 'object'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT formula_expression_status_chk
        CHECK (status IN ('draft', 'active', 'retired', 'archived')),
    CONSTRAINT formula_expression_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT formula_expression_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.formula_expression IS
  'Neon versioned formula header for payroll, leave, statutory, benefit, and workforce calculations.';

CREATE TABLE control.formula_expression_version (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    formula_expression_id uuid        NOT NULL,
    version_no            integer     NOT NULL,
    expression_language   text        NOT NULL DEFAULT 'jsonlogic',
    expression_body       jsonb       NOT NULL,
    input_defaults        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    output_mapping        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    rounding_config       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    effective_from        date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until       date,
    status                text        NOT NULL DEFAULT 'draft',
    is_effective          boolean     GENERATED ALWAYS AS (status = 'effective') STORED,
    published_at          timestamptz,
    published_by          uuid,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT formula_expression_version_pkey PRIMARY KEY (id),
    CONSTRAINT formula_expression_version_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT formula_expression_version_no_uq
        UNIQUE (tenant_id, formula_expression_id, version_no),
    CONSTRAINT formula_expression_version_number_chk CHECK (version_no >= 1),
    CONSTRAINT formula_expression_version_language_chk
        CHECK (expression_language IN ('jsonlogic', 'cel', 'mathjs')),
    CONSTRAINT formula_expression_version_body_chk
        CHECK (jsonb_typeof(expression_body) IN ('object', 'array')),
    CONSTRAINT formula_expression_version_json_chk CHECK (
        jsonb_typeof(input_defaults) = 'object'
        AND jsonb_typeof(output_mapping) = 'object'
        AND jsonb_typeof(rounding_config) = 'object'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT formula_expression_version_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT formula_expression_version_status_chk
        CHECK (status IN ('draft', 'effective', 'retired', 'archived')),
    CONSTRAINT formula_expression_version_publication_chk CHECK (
        (status = 'draft' AND published_at IS NULL AND published_by IS NULL)
        OR (status <> 'draft' AND published_at IS NOT NULL AND published_by IS NOT NULL)
    ),
    CONSTRAINT formula_expression_version_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.formula_expression_version IS
  'Immutable-on-publication Neon formula version. Payroll and leave results must snapshot the exact version id used.';

CREATE TABLE control.rate_table (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    code              text        NOT NULL,
    name              text        NOT NULL,
    rate_table_kind   text        NOT NULL DEFAULT 'statutory',
    country_code      character(2),
    currency_code     character(3),
    description       text,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status            text        NOT NULL DEFAULT 'draft',
    is_active         boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT rate_table_pkey PRIMARY KEY (id),
    CONSTRAINT rate_table_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT rate_table_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT rate_table_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT rate_table_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT rate_table_kind_chk
        CHECK (
            rate_table_kind IN (
                'statutory', 'bracket', 'lookup', 'allowance',
                'contribution', 'constant', 'custom'
            )
        ),
    CONSTRAINT rate_table_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT rate_table_status_chk
        CHECK (status IN ('draft', 'active', 'retired', 'archived')),
    CONSTRAINT rate_table_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT rate_table_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.rate_table IS
  'Neon effective-dated rate-table header for statutory bands, allowances, contributions, and payroll constants.';

CREATE TABLE control.rate_table_row (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    rate_table_id   uuid        NOT NULL,
    row_key         text,
    effective_from  date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until date,
    sequence_no     integer     NOT NULL DEFAULT 1,
    range_from      numeric(18,4),
    range_until     numeric(18,4),
    key_values      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    rate_value      numeric(18,8),
    amount_value    numeric(18,4),
    cap_amount      numeric(18,4),
    floor_amount    numeric(18,4),
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT rate_table_row_pkey PRIMARY KEY (id),
    CONSTRAINT rate_table_row_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT rate_table_row_key_uq
        UNIQUE (tenant_id, rate_table_id, effective_from, sequence_no),
    CONSTRAINT rate_table_row_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT rate_table_row_sequence_chk CHECK (sequence_no >= 1),
    CONSTRAINT rate_table_row_range_chk
        CHECK (range_until IS NULL OR range_from IS NULL OR range_until >= range_from),
    CONSTRAINT rate_table_row_value_chk
        CHECK (rate_value IS NOT NULL OR amount_value IS NOT NULL),
    CONSTRAINT rate_table_row_cap_floor_chk
        CHECK (cap_amount IS NULL OR floor_amount IS NULL OR cap_amount >= floor_amount),
    CONSTRAINT rate_table_row_json_chk
        CHECK (jsonb_typeof(key_values) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT rate_table_row_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.rate_table_row IS
  'Neon effective-dated rate or band row. Parent deletion cascades only while the owning rate table is deliberately removed.';
