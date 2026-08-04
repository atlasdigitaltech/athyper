-- Platform-governed usage measurements and plane-local commercial limits.
-- Admin is the authoring authority; Neon and Mesh hold published read models
-- so enforcement never depends on a cross-database query.

CREATE TABLE control.usage_metric_catalog (
    id                  uuid                NOT NULL DEFAULT shared.uuidv7(),
    code                text                NOT NULL,
    name                text                NOT NULL,
    description         text,
    unit_code           text                NOT NULL,
    dimension_type_code text,
    status              shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active           boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz         NOT NULL DEFAULT now(),
    created_by          uuid                NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT usage_metric_catalog_pkey PRIMARY KEY (id),
    CONSTRAINT usage_metric_catalog_code_uq UNIQUE (code),
    CONSTRAINT usage_metric_catalog_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT usage_metric_catalog_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT usage_metric_catalog_unit_chk
        CHECK (unit_code IN ('count', 'bytes')),
    CONSTRAINT usage_metric_catalog_dimension_type_chk
        CHECK (
            dimension_type_code IS NULL
            OR dimension_type_code ~ '^[a-z][a-z0-9_]{1,62}$'
        ),
    CONSTRAINT usage_metric_catalog_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT usage_metric_catalog_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.subscription_plan_usage_limit (
    id                   uuid                NOT NULL DEFAULT shared.uuidv7(),
    subscription_plan_id uuid                NOT NULL,
    usage_metric_id      uuid                NOT NULL,
    dimension_code       text                NOT NULL DEFAULT '*',
    limit_value          bigint,
    warn_at_pct          smallint            NOT NULL DEFAULT 80,
    status               shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active            boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz         NOT NULL DEFAULT now(),
    created_by           uuid                NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT subscription_plan_usage_limit_pkey PRIMARY KEY (id),
    CONSTRAINT subscription_plan_usage_limit_plan_metric_dimension_uq
        UNIQUE (subscription_plan_id, usage_metric_id, dimension_code),
    CONSTRAINT subscription_plan_usage_limit_dimension_chk
        CHECK (dimension_code = '*' OR dimension_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT subscription_plan_usage_limit_value_chk
        CHECK (limit_value IS NULL OR limit_value > 0),
    CONSTRAINT subscription_plan_usage_limit_warn_chk
        CHECK (warn_at_pct BETWEEN 1 AND 100),
    CONSTRAINT subscription_plan_usage_limit_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT subscription_plan_usage_limit_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.tenant_usage_limit_override (
    id              uuid                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid                NOT NULL,
    usage_metric_id uuid                NOT NULL,
    dimension_code  text                NOT NULL DEFAULT '*',
    limit_value     bigint              NOT NULL,
    reason          text                NOT NULL,
    effective_from  timestamptz         NOT NULL DEFAULT now(),
    effective_until timestamptz,
    status          shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active       boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at      timestamptz         NOT NULL DEFAULT now(),
    created_by      uuid                NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT tenant_usage_limit_override_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_usage_limit_override_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tenant_usage_limit_override_dimension_chk
        CHECK (dimension_code = '*' OR dimension_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT tenant_usage_limit_override_value_chk CHECK (limit_value > 0),
    CONSTRAINT tenant_usage_limit_override_reason_chk CHECK (btrim(reason) <> ''),
    CONSTRAINT tenant_usage_limit_override_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT tenant_usage_limit_override_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tenant_usage_limit_override_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.usage_metric_catalog IS
  'Platform-controlled catalog of usage measurements. Admin authors the catalog and publishes it unchanged to Neon and Mesh.';
COMMENT ON TABLE control.subscription_plan_usage_limit IS
  'Plane-local subscription-plan entitlement. dimension_code = ''*'' is the fallback for a dimensioned metric; limit_value NULL means unlimited.';
COMMENT ON TABLE control.tenant_usage_limit_override IS
  'Approved, time-bounded commercial exception to a plan usage limit. It cannot express unlimited access; assign an appropriate subscription plan instead.';
