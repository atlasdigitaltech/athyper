-- Durable semantic idempotency claim used while a delivery row is being
-- created. The delivery row remains the long-lived dedup record.
CREATE TABLE event.notification_delivery_claim (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    idempotency_key text        NOT NULL,
    message_id      uuid        NOT NULL,
    recipient_id    uuid        NOT NULL,
    channel         text        NOT NULL,
    claimed_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    expires_at      timestamptz NOT NULL,
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT notification_delivery_claim_pkey PRIMARY KEY (id),
    CONSTRAINT notification_delivery_claim_key_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT notification_delivery_claim_channel_chk CHECK (channel IN ('in_app','email','sms','whatsapp','push','webhook')),
    CONSTRAINT notification_delivery_claim_expiry_chk CHECK (expires_at > claimed_at),
    CONSTRAINT notification_delivery_claim_audit_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE event.digest_staging (
    id           uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id    uuid        NOT NULL,
    recipient_id uuid        NOT NULL,
    channel      text        NOT NULL,
    frequency    text        NOT NULL,
    message_id   uuid        NOT NULL,
    event_code   text        NOT NULL,
    subject      text,
    payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    template_key text        NOT NULL,
    priority     text        NOT NULL DEFAULT 'normal',
    metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    staged_at    timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid        NOT NULL,
    CONSTRAINT digest_staging_pkey PRIMARY KEY (id),
    CONSTRAINT digest_staging_coordinate_uq UNIQUE (tenant_id, message_id, recipient_id, channel, frequency),
    CONSTRAINT digest_staging_channel_chk CHECK (channel IN ('email','sms','whatsapp','push','in_app')),
    CONSTRAINT digest_staging_frequency_chk CHECK (frequency IN ('hourly_digest','daily_digest','weekly_digest')),
    CONSTRAINT digest_staging_priority_chk CHECK (priority IN ('low','normal','high','urgent')),
    CONSTRAINT digest_staging_json_chk CHECK (jsonb_typeof(payload) = 'object' AND jsonb_typeof(metadata) = 'object')
);

CREATE TABLE event.push_subscription (
    id           uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id    uuid        NOT NULL,
    principal_id uuid        NOT NULL,
    plane_key    text        NOT NULL,
    platform     text        NOT NULL,
    device_id    text        NOT NULL,
    endpoint     text        NOT NULL,
    p256dh_key   text,
    auth_key     text,
    device_token text,
    user_agent   text,
    metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    is_active    boolean     NOT NULL DEFAULT true,
    last_used_at timestamptz,
    expires_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid        NOT NULL,
    updated_at   timestamptz,
    updated_by   uuid,
    CONSTRAINT push_subscription_pkey PRIMARY KEY (id),
    CONSTRAINT push_subscription_coordinate_uq UNIQUE (tenant_id, principal_id, plane_key, platform, device_id),
    CONSTRAINT push_subscription_plane_chk CHECK (plane_key IN ('admin','neon','mesh')),
    CONSTRAINT push_subscription_platform_chk CHECK (platform IN ('web','android','ios')),
    CONSTRAINT push_subscription_device_chk CHECK (btrim(device_id) <> '' AND btrim(endpoint) <> ''),
    CONSTRAINT push_subscription_key_chk CHECK ((platform = 'web' AND p256dh_key IS NOT NULL AND auth_key IS NOT NULL) OR (platform IN ('android','ios') AND device_token IS NOT NULL)),
    CONSTRAINT push_subscription_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT push_subscription_audit_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Compatibility state table for the current WhatsApp API. channel_consent_event
-- remains the immutable compliance ledger; triggers mirror mutations into it.
CREATE TABLE event.whatsapp_consent (
    id             uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id      uuid        NOT NULL,
    principal_id   uuid        NOT NULL,
    phone_e164     text        NOT NULL,
    consent_status text        NOT NULL DEFAULT 'pending',
    consented_at   timestamptz,
    revoked_at     timestamptz,
    consent_source text        NOT NULL DEFAULT 'api',
    waba_id        text,
    namespace      text,
    metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid        NOT NULL,
    updated_at     timestamptz,
    updated_by     uuid,
    CONSTRAINT whatsapp_consent_pkey PRIMARY KEY (id),
    CONSTRAINT whatsapp_consent_coordinate_uq UNIQUE (tenant_id, principal_id, phone_e164),
    CONSTRAINT whatsapp_consent_phone_chk CHECK (phone_e164 ~ '^\\+[1-9][0-9]{1,14}$'),
    CONSTRAINT whatsapp_consent_status_chk CHECK (consent_status IN ('pending','opted_in','opted_out','revoked')),
    CONSTRAINT whatsapp_consent_times_chk CHECK ((consent_status <> 'opted_in' OR consented_at IS NOT NULL) AND (consent_status <> 'revoked' OR revoked_at IS NOT NULL)),
    CONSTRAINT whatsapp_consent_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT whatsapp_consent_audit_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Compatibility registry for the active webhook worker. The richer
-- control.webhook_subscription model is the administrative source of truth;
-- this plane-local projection keeps delivery state and encrypted signing
-- material beside the worker until the endpoint projection is wired.
CREATE TABLE event.webhook_subscription (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid        NOT NULL,
    target_url           text        NOT NULL,
    signing_secret       text,
    topics               text[]      NOT NULL DEFAULT '{}'::text[],
    description          text,
    max_retries          smallint    NOT NULL DEFAULT 3,
    timeout_ms           integer     NOT NULL DEFAULT 10000,
    last_delivery_at     timestamptz,
    last_delivery_status text,
    failure_count        integer     NOT NULL DEFAULT 0,
    is_active            boolean     NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,
    CONSTRAINT webhook_subscription_pkey PRIMARY KEY (id),
    CONSTRAINT webhook_subscription_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT webhook_subscription_url_chk CHECK (btrim(target_url) <> ''),
    CONSTRAINT webhook_subscription_retry_chk CHECK (max_retries >= 0 AND timeout_ms > 0 AND failure_count >= 0),
    CONSTRAINT webhook_subscription_audit_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE event.digest_staging IS 'Plane-local mutable digest work queue.';
COMMENT ON TABLE event.push_subscription IS 'Plane-local push device subscription. plane_key is transitional while runtime routing is contracted to physical database identity.';
COMMENT ON TABLE event.webhook_subscription IS 'Plane-local compatibility projection consumed by the webhook delivery worker; control.webhook_subscription remains the administrative model.';
