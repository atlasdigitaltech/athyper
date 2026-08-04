CREATE TABLE control.planning_model (
    id                       uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                            NOT NULL,
    company_code_id          uuid                            NOT NULL,
    ledger_book_id           uuid                            NOT NULL,
    code                     text                            NOT NULL,
    name                     text                            NOT NULL,
    description              text,
    model_type               control.planning_model_type_d   NOT NULL,
    granularity              control.planning_granularity_d  NOT NULL,
    base_currency_code       character(3)                    NOT NULL,
    fiscal_year_from         smallint                        NOT NULL,
    fiscal_year_to           smallint                        NOT NULL,
    version_number           integer                         NOT NULL DEFAULT 1,
    based_on_model_id        uuid,
    responsible_principal_id uuid,
    auto_recalculate         boolean                         NOT NULL DEFAULT false,
    lock_on_approval         boolean                         NOT NULL DEFAULT true,
    allows_overrides         boolean                         NOT NULL DEFAULT false,
    metadata                 jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    status                   control.planning_record_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                     NOT NULL DEFAULT now(),
    created_by               uuid                            NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT planning_model_pkey PRIMARY KEY (id),
    CONSTRAINT planning_model_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_model_company_id_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT planning_model_code_version_uq
        UNIQUE (tenant_id, company_code_id, code, version_number),
    CONSTRAINT planning_model_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT planning_model_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT planning_model_fiscal_range_chk CHECK (
        fiscal_year_from BETWEEN 1900 AND 9999
        AND fiscal_year_to BETWEEN fiscal_year_from AND 9999
    ),
    CONSTRAINT planning_model_version_chk CHECK (version_number >= 1),
    CONSTRAINT planning_model_no_self_base_chk
        CHECK (based_on_model_id IS NULL OR based_on_model_id <> id),
    CONSTRAINT planning_model_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT planning_model_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT planning_model_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.planning_driver (
    id                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                              NOT NULL,
    planning_model_id     uuid                              NOT NULL,
    code                  text                              NOT NULL,
    name                  text                              NOT NULL,
    description           text,
    driver_type           control.planning_driver_type_d    NOT NULL,
    aggregation_method    control.planning_aggregation_d    NOT NULL DEFAULT 'sum',
    uom_code              text,
    formula_expression_id uuid,
    is_input              boolean                           NOT NULL DEFAULT true,
    is_derived            boolean                           NOT NULL DEFAULT false,
    default_value         numeric(18,6),
    minimum_value         numeric(18,6),
    maximum_value         numeric(18,6),
    sort_order            integer                           NOT NULL DEFAULT 0,
    metadata              jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                control.planning_record_status_d  NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                       NOT NULL DEFAULT now(),
    created_by            uuid                              NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT planning_driver_pkey PRIMARY KEY (id),
    CONSTRAINT planning_driver_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_driver_model_id_uq UNIQUE (tenant_id, planning_model_id, id),
    CONSTRAINT planning_driver_code_uq UNIQUE (tenant_id, planning_model_id, code),
    CONSTRAINT planning_driver_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT planning_driver_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT planning_driver_source_chk CHECK (
        (is_input AND NOT is_derived AND formula_expression_id IS NULL)
        OR (NOT is_input AND is_derived AND formula_expression_id IS NOT NULL)
    ),
    CONSTRAINT planning_driver_range_chk CHECK (
        minimum_value IS NULL OR maximum_value IS NULL OR maximum_value >= minimum_value
    ),
    CONSTRAINT planning_driver_default_range_chk CHECK (
        default_value IS NULL
        OR (
            (minimum_value IS NULL OR default_value >= minimum_value)
            AND (maximum_value IS NULL OR default_value <= maximum_value)
        )
    ),
    CONSTRAINT planning_driver_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT planning_driver_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT planning_driver_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.planning_driver_dependency (
    id                   uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                                  NOT NULL,
    planning_model_id    uuid                                  NOT NULL,
    planning_driver_id   uuid                                  NOT NULL,
    depends_on_driver_id uuid                                  NOT NULL,
    dependency_type      control.planning_dependency_type_d     NOT NULL DEFAULT 'formula',
    sort_order           integer                               NOT NULL DEFAULT 0,
    metadata             jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz                           NOT NULL DEFAULT now(),
    created_by           uuid                                  NOT NULL,

    CONSTRAINT planning_driver_dependency_pkey PRIMARY KEY (id),
    CONSTRAINT planning_driver_dependency_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_driver_dependency_coordinate_uq
        UNIQUE (tenant_id, planning_model_id, planning_driver_id, depends_on_driver_id),
    CONSTRAINT planning_driver_dependency_no_self_chk
        CHECK (planning_driver_id <> depends_on_driver_id),
    CONSTRAINT planning_driver_dependency_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE control.planning_driver_dependency IS
  'Normalized driver dependency graph. Replaces the legacy unverifiable depends_on_drivers UUID array.';
