-- 04_tables/007c_int.sql
-- Depends on: 01_schemas/002_int_schema.sql
-- Integration hub schema tables: endpoint registry + webhook subscriptions.

-- ============================================================================
-- §1  int.endpoint — integration endpoint registry
-- ============================================================================
-- Registered outbound integration targets. Each row is a named endpoint
-- that the platform can call (webhook target, external API, etc.).
-- Tenant-scoped: one tenant's endpoints are invisible to others.
-- config jsonb holds adapter-specific fields (base_url, headers, auth, timeout).
-- Sensitive values (API keys, secrets) should be stored encrypted at rest.

CREATE TABLE IF NOT EXISTS int.endpoint (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Classification
    service         text        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    description     text,

    -- Target
    path            text        NOT NULL,
    method          text        NOT NULL DEFAULT 'POST',

    -- Config (adapter-specific: base_url, headers, auth, timeout_ms, retry_policy)
    config          jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Health
    health          text        NOT NULL DEFAULT 'healthy',
    last_checked_at timestamptz,

    -- Lifecycle
    is_active       boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT endpoint_pkey        PRIMARY KEY (id),
    CONSTRAINT endpoint_tenant_uq   UNIQUE (tenant_id, id),
    CONSTRAINT endpoint_code_uq     UNIQUE (tenant_id, service, code),
    CONSTRAINT endpoint_method_chk  CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
    CONSTRAINT endpoint_health_chk  CHECK (health IN ('healthy','degraded','down')),
    CONSTRAINT endpoint_path_chk    CHECK (btrim(path) <> ''),
    CONSTRAINT endpoint_service_chk CHECK (btrim(service) <> ''),
    CONSTRAINT endpoint_code_chk    CHECK (btrim(code) <> '')
);

COMMENT ON TABLE  int.endpoint IS
    'Outbound integration endpoint registry. One row per named target '
    '(webhook, external API, partner endpoint). config holds adapter-specific '
    'settings; sensitive fields should be encrypted at rest.';
COMMENT ON COLUMN int.endpoint.service IS
    'Logical service grouping (e.g. erp, payment_gateway, id_provider).';
COMMENT ON COLUMN int.endpoint.config IS
    'Adapter config: base_url, headers, auth (type + credentials), '
    'timeout_ms, retry_policy. Sensitive values encrypted at rest.';
COMMENT ON COLUMN int.endpoint.health IS
    'Last known health state. Updated by the integration health-check worker. '
    'healthy | degraded | down.';


-- ============================================================================
-- §2  int.webhook_subscription — per-tenant webhook target registrations
-- ============================================================================
-- Subscription record for outbound webhook delivery.
-- Each row declares: which event topics to forward, to what target URL,
-- and with what signing secret.
-- event.notification_delivery rows reference subscription_id for traceability.

CREATE TABLE IF NOT EXISTS int.webhook_subscription (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Target
    target_url      text        NOT NULL,
    signing_secret  text,

    -- Subscription config
    topics          text[]      NOT NULL DEFAULT '{}',
    description     text,

    -- Delivery policy
    max_retries     smallint    NOT NULL DEFAULT 3,
    timeout_ms      integer     NOT NULL DEFAULT 10000,

    -- Health
    last_delivery_at    timestamptz,
    last_delivery_status text,
    failure_count   integer     NOT NULL DEFAULT 0,

    -- Lifecycle
    is_active       boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT ws_pkey              PRIMARY KEY (id),
    CONSTRAINT ws_tenant_uq         UNIQUE (tenant_id, id),
    CONSTRAINT ws_url_chk           CHECK (btrim(target_url) <> ''),
    CONSTRAINT ws_timeout_chk       CHECK (timeout_ms > 0),
    CONSTRAINT ws_retries_chk       CHECK (max_retries >= 0),
    CONSTRAINT ws_failure_chk       CHECK (failure_count >= 0)
);

COMMENT ON TABLE  int.webhook_subscription IS
    'Per-tenant webhook subscription registry. Each row is a target URL '
    'that receives event.outbox payloads for the subscribed topics. '
    'event.notification_delivery.subscription_id references this table.';
COMMENT ON COLUMN int.webhook_subscription.signing_secret IS
    'HMAC-SHA256 signing secret for payload signature header. '
    'Store encrypted at rest. NULL = unsigned delivery.';
COMMENT ON COLUMN int.webhook_subscription.topics IS
    'List of event.outbox topic values this subscription receives. '
    'Empty array = subscribe to all topics.';
