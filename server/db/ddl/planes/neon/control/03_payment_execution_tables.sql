-- Neon-only business routing above the generic integration connector layer.
-- Credentials, endpoints, headers, and connection health remain on
-- control.connector_instance / control.integration_endpoint.
CREATE TABLE control.payment_execution_profile (
    id                    uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid NOT NULL,
    connector_instance_id uuid,
    code                  text NOT NULL,
    name                  text NOT NULL,
    description           text,
    payment_rail_code     text NOT NULL,
    delivery_mode          control.payment_execution_delivery_mode_d NOT NULL,
    message_format_code   text,
    message_version       text,
    message_options       jsonb NOT NULL DEFAULT '{}'::jsonb,
    supports_remittance_advice boolean NOT NULL DEFAULT false,
    supports_acknowledgement   boolean NOT NULL DEFAULT false,
    supports_status_pull       boolean NOT NULL DEFAULT false,
    supports_return_file       boolean NOT NULL DEFAULT false,
    metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
    status                control.payment_execution_profile_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT payment_execution_profile_pkey PRIMARY KEY (id),
    CONSTRAINT payment_execution_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT payment_execution_profile_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT payment_execution_profile_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT payment_execution_profile_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT payment_execution_profile_rail_chk
        CHECK (payment_rail_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT payment_execution_profile_message_format_chk
        CHECK (message_format_code IS NULL OR message_format_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,62}$'),
    CONSTRAINT payment_execution_profile_message_version_chk
        CHECK (message_version IS NULL OR btrim(message_version) <> ''),
    CONSTRAINT payment_execution_profile_options_chk
        CHECK (jsonb_typeof(message_options) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT payment_execution_profile_connector_mode_chk CHECK (
        (delivery_mode IN ('api', 'sftp') AND connector_instance_id IS NOT NULL)
        OR (delivery_mode IN ('file', 'check_print', 'manual') AND connector_instance_id IS NULL)
    ),
    CONSTRAINT payment_execution_profile_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT payment_execution_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.payment_execution_profile IS
    'Neon payment-message routing profile. It selects rail, delivery mode and message semantics while generic connector records exclusively own credentials, endpoints and transport health.';
