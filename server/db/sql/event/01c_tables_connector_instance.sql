-- ============================================================================
-- event/01c_tables_connector_instance.sql
-- Concept: Integration Connectors — live connector instance registry
-- Depends on: 04_tables/007_event.sql, 04_tables/002_control.sql
-- Per-tenant connector connection instances.
--
-- A connector_instance is one configured, authenticated connection to an
-- external system described by a control.connector_type template.
-- The config_schema of the type drives the UI form for instance creation.
--
-- NOTE (Phase 5 hardening): credential fields inside the `config` JSONB
-- should be encrypted at rest via CredentialEncryptionService before storage.
-- For Phase 4 they are stored as plaintext. Mask them in list responses.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event.connector_instance (
    -- Identity
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL REFERENCES master.tenant(id),
    connector_type_id     uuid        NOT NULL REFERENCES control.connector_type(id),

    -- Instance identity
    code                  text        NOT NULL,
    name                  text        NOT NULL,
    description           text,

    -- Config (form values matching connector_type.config_schema)
    -- WARNING: may contain credential values — encrypt in Phase 5.
    config                jsonb       NOT NULL DEFAULT '{}',

    -- Status & health
    status                text        NOT NULL DEFAULT 'active',
    health_status         text        NOT NULL DEFAULT 'unknown',
    last_health_check_at  timestamptz,
    last_error_message    text,
    is_active             boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT connector_instance_pkey         PRIMARY KEY (id),
    CONSTRAINT connector_instance_code_uq      UNIQUE (tenant_id, code),
    CONSTRAINT connector_instance_status_chk   CHECK (status IN ('active', 'testing', 'paused', 'error', 'deprecated')),
    CONSTRAINT connector_instance_health_chk   CHECK (health_status IN ('healthy', 'degraded', 'down', 'unknown'))
);

CREATE INDEX IF NOT EXISTS idx_connector_instance_tenant
    ON event.connector_instance (tenant_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connector_instance_type
    ON event.connector_instance (connector_type_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_connector_instance_health
    ON event.connector_instance (tenant_id, health_status)
    WHERE health_status IN ('degraded', 'down');

COMMENT ON TABLE event.connector_instance IS
    'Per-tenant configured connections to external systems — instances of control.connector_type templates';
