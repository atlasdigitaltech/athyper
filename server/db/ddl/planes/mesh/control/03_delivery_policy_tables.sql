-- Mesh-only delivery governance. In the physically isolated Mesh database the
-- local control schema replaces the legacy mesh_control namespace.
CREATE TABLE control.delivery_policy (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    network_account_id    uuid,
    code                  text        NOT NULL,
    name                  text        NOT NULL,
    delivery_type         text        NOT NULL,
    destination_type      text,
    max_attempts          smallint    NOT NULL DEFAULT 5,
    initial_delay_seconds integer     NOT NULL DEFAULT 30,
    max_delay_seconds     integer     NOT NULL DEFAULT 3600,
    backoff_strategy      text        NOT NULL DEFAULT 'exponential',
    timeout_ms            integer     NOT NULL DEFAULT 30000,
    dlq_enabled           boolean     NOT NULL DEFAULT true,
    redaction_policy      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    is_enabled            boolean     NOT NULL DEFAULT true,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT delivery_policy_pkey PRIMARY KEY (id),
    CONSTRAINT delivery_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT delivery_policy_code_uq UNIQUE NULLS NOT DISTINCT (tenant_id, network_account_id, code),
    CONSTRAINT delivery_policy_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT delivery_policy_text_chk CHECK (btrim(name) <> '' AND btrim(delivery_type) <> ''),
    CONSTRAINT delivery_policy_retry_chk CHECK (max_attempts > 0 AND initial_delay_seconds >= 0 AND max_delay_seconds >= initial_delay_seconds AND timeout_ms > 0),
    CONSTRAINT delivery_policy_backoff_chk CHECK (backoff_strategy IN ('fixed','linear','exponential')),
    CONSTRAINT delivery_policy_json_chk CHECK (jsonb_typeof(redaction_policy) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT delivery_policy_audit_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.delivery_policy IS 'Mesh plane retry, timeout, redaction, and DLQ policy. NULL network_account_id is a tenant-wide default.';
