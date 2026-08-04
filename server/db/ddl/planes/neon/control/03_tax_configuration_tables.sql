-- Neon tax determination policy. Tax groups are effective-dated revisions;
-- there is deliberately no control.tax_group_version table.

CREATE TABLE control.tax_rate_schedule (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    jurisdiction_id         uuid        NOT NULL,
    tax_type_id             uuid        NOT NULL,
    tax_direction           control.tax_direction_d NOT NULL,
    component_code          text        NOT NULL,
    rate_kind               control.tax_rate_kind_d NOT NULL DEFAULT 'PERCENT',
    rate_value              numeric(18,6) NOT NULL,
    rate_currency           character(3),
    rate_uom_code           text,
    recoverability_mode     control.tax_recoverability_d NOT NULL DEFAULT 'NONE',
    recoverability_percent  numeric(5,2),
    reverse_charge_mode     control.tax_reverse_charge_d NOT NULL DEFAULT 'NONE',
    calculation_basis       control.tax_calculation_basis_d NOT NULL DEFAULT 'LINE_NET',
    wht_basis               control.tax_wht_basis_d,
    description             text,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  control.tax_policy_status_d NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tax_rate_schedule_pkey PRIMARY KEY (id),
    CONSTRAINT tax_rate_schedule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_rate_schedule_component_code_chk
        CHECK (component_code ~ '^[A-Z][A-Z0-9_.-]{0,62}$'),
    CONSTRAINT tax_rate_schedule_rate_chk CHECK (
        (rate_kind = 'PERCENT' AND rate_value BETWEEN 0 AND 100)
        OR (rate_kind IN ('FIXED', 'PER_UNIT') AND rate_value >= 0)
    ),
    CONSTRAINT tax_rate_schedule_unit_chk CHECK (
        (rate_kind = 'PERCENT' AND rate_currency IS NULL AND rate_uom_code IS NULL)
        OR (rate_kind = 'FIXED' AND rate_currency IS NOT NULL AND rate_uom_code IS NULL)
        OR (rate_kind = 'PER_UNIT' AND rate_currency IS NOT NULL AND rate_uom_code IS NOT NULL)
    ),
    CONSTRAINT tax_rate_schedule_recoverability_chk CHECK (
        (recoverability_mode = 'PARTIAL' AND recoverability_percent BETWEEN 0 AND 100)
        OR (recoverability_mode <> 'PARTIAL' AND recoverability_percent IS NULL)
    ),
    CONSTRAINT tax_rate_schedule_period_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT tax_rate_schedule_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT tax_rate_schedule_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tax_rate_schedule_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tax_rate_schedule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.tax_group (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    group_kind              control.tax_group_kind_d NOT NULL,
    jurisdiction_id         uuid        NOT NULL,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    is_compound             boolean     NOT NULL DEFAULT false,
    rounding_rule_id        uuid        NOT NULL,
    supersedes_tax_group_id uuid,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  control.tax_policy_status_d NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tax_group_pkey PRIMARY KEY (id),
    CONSTRAINT tax_group_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_group_revision_uq UNIQUE (tenant_id, code, effective_from),
    CONSTRAINT tax_group_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{0,62}$'),
    CONSTRAINT tax_group_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT tax_group_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT tax_group_period_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT tax_group_not_self_superseding_chk
        CHECK (supersedes_tax_group_id IS NULL OR supersedes_tax_group_id <> id),
    CONSTRAINT tax_group_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tax_group_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tax_group_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.tax_group IS
  'One effective-dated tax-group revision. Revisions share tenant/code and link through supersedes_tax_group_id; no separate version table exists.';

CREATE TABLE control.tax_group_component (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    tax_group_id            uuid        NOT NULL,
    tax_rate_schedule_id    uuid        NOT NULL,
    calculation_seq         smallint    NOT NULL,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,

    CONSTRAINT tax_group_component_pkey PRIMARY KEY (id),
    CONSTRAINT tax_group_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_group_component_sequence_uq UNIQUE (tenant_id, tax_group_id, calculation_seq),
    CONSTRAINT tax_group_component_schedule_uq UNIQUE (tenant_id, tax_group_id, tax_rate_schedule_id),
    CONSTRAINT tax_group_component_seq_chk CHECK (calculation_seq > 0),
    CONSTRAINT tax_group_component_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE control.tax_resolution_rule (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    code                                text        NOT NULL,
    name                                text        NOT NULL,
    description                         text,
    scope_company_code_id               uuid,
    scope_transaction_direction         control.tax_transaction_direction_d,
    scope_billto_jurisdiction_id        uuid,
    scope_shipto_jurisdiction_id        uuid,
    scope_billfrom_jurisdiction_id      uuid,
    scope_shipfrom_jurisdiction_id      uuid,
    scope_counterparty_tax_status       control.tax_counterparty_status_d,
    scope_commodity_category_id         uuid,
    scope_supplier_industry_code        text,
    scope_doc_entity_codes              text[]      NOT NULL DEFAULT ARRAY[]::text[],
    requires_shipto_shipfrom_match      boolean     NOT NULL DEFAULT false,
    requires_shipto_shipfrom_mismatch   boolean     NOT NULL DEFAULT false,
    resolved_tax_group_id               uuid        NOT NULL,
    priority                            smallint    NOT NULL DEFAULT 100,
    effective_from                      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                        date,
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              control.tax_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT tax_resolution_rule_pkey PRIMARY KEY (id),
    CONSTRAINT tax_resolution_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_resolution_rule_revision_uq UNIQUE (tenant_id, code, effective_from),
    CONSTRAINT tax_resolution_rule_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{0,62}$'),
    CONSTRAINT tax_resolution_rule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT tax_resolution_rule_priority_chk CHECK (priority BETWEEN 0 AND 1000),
    CONSTRAINT tax_resolution_rule_match_chk
        CHECK (NOT (requires_shipto_shipfrom_match AND requires_shipto_shipfrom_mismatch)),
    CONSTRAINT tax_resolution_rule_period_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT tax_resolution_rule_entity_codes_chk CHECK (
        COALESCE(array_ndims(scope_doc_entity_codes), 1) = 1
        AND array_position(scope_doc_entity_codes, NULL) IS NULL
    ),
    CONSTRAINT tax_resolution_rule_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tax_resolution_rule_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tax_resolution_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.wht_threshold_config (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    company_code_id     uuid,
    jurisdiction_id     uuid        NOT NULL,
    tax_type_id         uuid        NOT NULL,
    section_code        text,
    threshold_amount    numeric(18,4) NOT NULL,
    threshold_currency  character(3) NOT NULL,
    threshold_mode      control.wht_threshold_mode_d NOT NULL DEFAULT 'cumulative',
    reset_period        control.wht_reset_period_d NOT NULL DEFAULT 'fiscal_year',
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to        date,
    description         text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              control.tax_policy_status_d NOT NULL DEFAULT 'draft',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT wht_threshold_config_pkey PRIMARY KEY (id),
    CONSTRAINT wht_threshold_config_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT wht_threshold_config_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, company_code_id, jurisdiction_id, tax_type_id,
        section_code, threshold_mode, effective_from
    ),
    CONSTRAINT wht_threshold_config_amount_chk CHECK (threshold_amount > 0),
    CONSTRAINT wht_threshold_config_section_chk
        CHECK (section_code IS NULL OR btrim(section_code) <> ''),
    CONSTRAINT wht_threshold_config_period_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT wht_threshold_config_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT wht_threshold_config_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT wht_threshold_config_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT wht_threshold_config_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);
