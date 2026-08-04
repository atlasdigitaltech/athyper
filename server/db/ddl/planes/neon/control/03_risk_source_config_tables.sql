CREATE TABLE control.risk_source_config (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    source_code           text        NOT NULL,
    connector_instance_id uuid,
    custom_trust_level    smallint,
    risk_settings         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'active',
    is_enabled            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT risk_source_config_pkey PRIMARY KEY (id),
    CONSTRAINT risk_source_config_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT risk_source_config_source_uq UNIQUE (tenant_id, source_code),
    CONSTRAINT risk_source_config_trust_chk
        CHECK (custom_trust_level IS NULL OR custom_trust_level BETWEEN 1 AND 5),
    CONSTRAINT risk_source_config_settings_chk
        CHECK (jsonb_typeof(risk_settings) = 'object'),
    CONSTRAINT risk_source_config_status_chk
        CHECK (status IN ('active', 'disabled')),
    CONSTRAINT risk_source_config_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT risk_source_config_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.risk_source_config IS
  'Neon tenant enablement and risk-specific policy for a platform risk source. Transport endpoints, authentication, and secret references belong to the linked connector instance.';
