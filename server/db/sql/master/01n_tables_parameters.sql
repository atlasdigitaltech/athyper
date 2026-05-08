-- ============================================================================
-- master/01n_tables_parameters.sql
-- Concept: Tenant parameter overrides and tenant-owned parameter definitions
-- Depends on: master.tenant, control.parameter_definition
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.tenant_parameter_definition (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    code                  text        NOT NULL,
    namespace             text        NOT NULL,
    display_name          text        NOT NULL,
    description           text,

    data_type             text        NOT NULL,
    unit                  text,
    default_value         jsonb       NOT NULL,
    min_value             jsonb,
    max_value             jsonb,
    allowed_values        jsonb,

    runtime_reload        text        NOT NULL DEFAULT 'next_request',
    cache_ttl_seconds     integer     NOT NULL DEFAULT 300,
    is_security_sensitive boolean     NOT NULL DEFAULT false,
    is_runtime_reloadable boolean     NOT NULL DEFAULT true,
    is_enabled            boolean     NOT NULL DEFAULT true,
    sort_order            integer     NOT NULL DEFAULT 0,

    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'active',
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT tenant_parameter_definition_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_parameter_definition_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT tenant_parameter_definition_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tenant_parameter_definition_code_fmt CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT tenant_parameter_definition_namespace_fmt CHECK (namespace ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
    CONSTRAINT tenant_parameter_definition_name_chk CHECK (btrim(display_name) <> ''),
    CONSTRAINT tenant_parameter_definition_type_chk CHECK (data_type IN ('boolean', 'integer', 'number', 'string', 'enum', 'duration', 'json')),
    CONSTRAINT tenant_parameter_definition_reload_chk CHECK (runtime_reload IN ('immediate', 'next_request', 'next_login', 'restart', 'external_provider')),
    CONSTRAINT tenant_parameter_definition_cache_ttl_chk CHECK (cache_ttl_seconds BETWEEN 0 AND 86400),
    CONSTRAINT tenant_parameter_definition_status_chk CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT tenant_parameter_definition_allowed_values_chk CHECK (allowed_values IS NULL OR jsonb_typeof(allowed_values) = 'array'),
    CONSTRAINT tenant_parameter_definition_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS tenant_parameter_definition_lookup_idx
    ON master.tenant_parameter_definition (tenant_id, namespace, sort_order, code)
    WHERE status = 'active';

COMMENT ON TABLE master.tenant_parameter_definition IS
    'ARCHETYPE=B;SCOPE=T. Tenant-owned custom parameter definitions. Product-owned definitions live in control.parameter_definition.';


CREATE TABLE IF NOT EXISTS master.tenant_parameter_value (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    parameter_code      text        NOT NULL,

    override_enabled    boolean     NOT NULL DEFAULT false,
    value               jsonb,
    reason              text,
    effective_from      timestamptz NOT NULL DEFAULT now(),
    effective_to        timestamptz,

    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT tenant_parameter_value_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_parameter_value_code_uq UNIQUE (tenant_id, parameter_code),
    CONSTRAINT tenant_parameter_value_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tenant_parameter_value_code_fmt CHECK (parameter_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT tenant_parameter_value_window_chk CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT tenant_parameter_value_status_chk CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT tenant_parameter_value_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS tenant_parameter_value_lookup_idx
    ON master.tenant_parameter_value (tenant_id, parameter_code)
    WHERE status = 'active';

COMMENT ON TABLE master.tenant_parameter_value IS
    'ARCHETYPE=C;SCOPE=T. Tenant override values for product-owned or tenant-owned parameters. override_enabled=false means resolved value falls back to product/default.';
COMMENT ON COLUMN master.tenant_parameter_value.override_enabled IS
    'Tenant override switch. When false the row is retained for audit/history but runtime ignores value.';
