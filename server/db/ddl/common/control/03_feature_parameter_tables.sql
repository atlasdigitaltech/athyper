-- Release gates are temporary operational controls. Typed parameters are
-- stable configuration contracts. Neither is Meta Entity capability metadata.

CREATE TABLE control.feature_flag_catalog (
    id                uuid                NOT NULL DEFAULT shared.uuidv7(),
    code              text                NOT NULL,
    name              text                NOT NULL,
    description       text,
    flag_kind         text                NOT NULL DEFAULT 'release_gate',
    default_enabled   boolean             NOT NULL DEFAULT false,
    rollout_pct       smallint,
    effective_from    timestamptz         NOT NULL DEFAULT now(),
    effective_until   timestamptz,
    status            shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active         boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    metadata          jsonb               NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz         NOT NULL DEFAULT now(),
    created_by        uuid                NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT feature_flag_catalog_pkey PRIMARY KEY (id),
    CONSTRAINT feature_flag_catalog_code_uq UNIQUE (code),
    CONSTRAINT feature_flag_catalog_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT feature_flag_catalog_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT feature_flag_catalog_kind_chk
        CHECK (flag_kind IN ('release_gate', 'capability_toggle')),
    CONSTRAINT feature_flag_catalog_rollout_chk
        CHECK (rollout_pct IS NULL OR rollout_pct BETWEEN 0 AND 100),
    CONSTRAINT feature_flag_catalog_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT feature_flag_catalog_capability_expiry_chk
        CHECK (flag_kind <> 'capability_toggle' OR effective_until IS NULL),
    CONSTRAINT feature_flag_catalog_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT feature_flag_catalog_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT feature_flag_catalog_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.feature_flag_override (
    id                uuid                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid                NOT NULL,
    feature_flag_id   uuid                NOT NULL,
    is_enabled        boolean             NOT NULL,
    reason            text                NOT NULL,
    effective_from    timestamptz         NOT NULL DEFAULT now(),
    effective_until   timestamptz,
    status            shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active         boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz         NOT NULL DEFAULT now(),
    created_by        uuid                NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT feature_flag_override_pkey PRIMARY KEY (id),
    CONSTRAINT feature_flag_override_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT feature_flag_override_reason_chk CHECK (btrim(reason) <> ''),
    CONSTRAINT feature_flag_override_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT feature_flag_override_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT feature_flag_override_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.parameter_definition (
    id                  uuid                NOT NULL DEFAULT shared.uuidv7(),
    code                text                NOT NULL,
    name                text                NOT NULL,
    description         text,
    value_type          text                NOT NULL,
    unit_code           text,
    default_value       jsonb               NOT NULL,
    min_value           jsonb,
    max_value           jsonb,
    allowed_values      jsonb,
    tenant_can_override boolean             NOT NULL DEFAULT false,
    reload_mode         text                NOT NULL DEFAULT 'next_request',
    cache_ttl_seconds   integer             NOT NULL DEFAULT 300,
    is_sensitive        boolean             NOT NULL DEFAULT false,
    sort_order          integer             NOT NULL DEFAULT 0,
    status              shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active           boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    metadata            jsonb               NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz         NOT NULL DEFAULT now(),
    created_by          uuid                NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT parameter_definition_pkey PRIMARY KEY (id),
    CONSTRAINT parameter_definition_code_uq UNIQUE (code),
    CONSTRAINT parameter_definition_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT parameter_definition_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT parameter_definition_type_chk
        CHECK (value_type IN ('boolean', 'integer', 'number', 'string', 'enum', 'duration', 'json')),
    CONSTRAINT parameter_definition_unit_chk
        CHECK (unit_code IS NULL OR unit_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT parameter_definition_allowed_values_chk
        CHECK (allowed_values IS NULL OR jsonb_typeof(allowed_values) = 'array'),
    CONSTRAINT parameter_definition_bounds_chk
        CHECK (
            (min_value IS NULL AND max_value IS NULL)
            OR value_type IN ('integer', 'number')
        ),
    CONSTRAINT parameter_definition_reload_mode_chk
        CHECK (reload_mode IN ('immediate', 'next_request', 'next_login', 'restart', 'external_provider')),
    CONSTRAINT parameter_definition_cache_ttl_chk
        CHECK (cache_ttl_seconds BETWEEN 0 AND 86400),
    CONSTRAINT parameter_definition_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT parameter_definition_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT parameter_definition_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT parameter_definition_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.tenant_parameter_value (
    id                      uuid                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid                NOT NULL,
    parameter_definition_id uuid                NOT NULL,
    value                   jsonb               NOT NULL,
    reason                  text,
    effective_from          timestamptz         NOT NULL DEFAULT now(),
    effective_until         timestamptz,
    status                  shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active               boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz         NOT NULL DEFAULT now(),
    created_by              uuid                NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tenant_parameter_value_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_parameter_value_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tenant_parameter_value_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT tenant_parameter_value_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tenant_parameter_value_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.feature_flag_catalog IS
  'Platform-governed temporary release and rollout gate. It is not an entitlement, authorization decision, or permanent business setting.';
COMMENT ON TABLE control.feature_flag_override IS
  'Approved tenant-specific release-rollout exception. Admin authors and publishes it; tenant applications receive it read-only.';
COMMENT ON TABLE control.parameter_definition IS
  'Platform-governed typed configuration contract. It specifies the default, validation boundary, tenant override permission, and reload behaviour.';
COMMENT ON TABLE control.tenant_parameter_value IS
  'Tenant value for a tenant-configurable parameter. A row is an explicit override of parameter_definition.default_value.';
