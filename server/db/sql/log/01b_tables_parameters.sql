-- ============================================================================
-- log/01b_tables_parameters.sql
-- Concept: Parameter change audit
-- ============================================================================

CREATE TABLE IF NOT EXISTS log.parameter_change_log (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    parameter_code        text        NOT NULL,
    actor_principal_id    uuid,
    operation             text        NOT NULL,
    old_override_enabled  boolean,
    new_override_enabled  boolean,
    old_value             jsonb,
    new_value             jsonb,
    reason                text,
    request_id            text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT parameter_change_log_pkey PRIMARY KEY (id),
    CONSTRAINT parameter_change_log_operation_chk CHECK (operation IN ('create', 'update', 'disable_override', 'enable_override')),
    CONSTRAINT parameter_change_log_code_fmt CHECK (parameter_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

CREATE INDEX IF NOT EXISTS parameter_change_log_tenant_idx
    ON log.parameter_change_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS parameter_change_log_code_idx
    ON log.parameter_change_log (parameter_code, created_at DESC);

COMMENT ON TABLE log.parameter_change_log IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Audit trail for tenant parameter override changes.';
