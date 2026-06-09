-- ============================================================================
-- mesh_control/01_tables.sql
-- Concept: Mesh runtime controls for flags, routing, delivery, retention,
--          quotas, connectors, notifications, schedules, and policies.
-- Depends on: mesh tables, shared reference tables, shared.uuidv7().
-- ============================================================================
-- Boundary rule:
--   This is not a copy of Neon control.*. Mesh controls are limited to network
--   service behavior and never FK into Neon master/control/document/ledger.

CREATE TABLE IF NOT EXISTS mesh_control.feature_flag (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,
    flag_type           text        NOT NULL DEFAULT 'release_gate',
    is_enabled          boolean     NOT NULL DEFAULT false,
    account_overrides   jsonb,
    rollout_pct         smallint,
    expires_at          timestamptz,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_control_feature_flag_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_feature_flag_code_uq UNIQUE (code),
    CONSTRAINT mesh_control_feature_flag_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_control_feature_flag_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_control_feature_flag_type_chk CHECK (
        flag_type IN ('release_gate', 'capability_toggle', 'experiment')
    ),
    CONSTRAINT mesh_control_feature_flag_rollout_chk CHECK (
        rollout_pct IS NULL OR rollout_pct BETWEEN 0 AND 100
    ),
    CONSTRAINT mesh_control_feature_flag_overrides_chk CHECK (
        account_overrides IS NULL OR jsonb_typeof(account_overrides) = 'object'
    ),
    CONSTRAINT mesh_control_feature_flag_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE mesh_control.feature_flag IS
    'Mesh feature flag registry. Used for writer cutover gates, shadow mode, and capability toggles.';
COMMENT ON COLUMN mesh_control.feature_flag.account_overrides IS
    'JSON object mapping Mesh BNA account_code to boolean override.';

CREATE TABLE IF NOT EXISTS mesh_control.reference_sync_state (
    table_name      text        NOT NULL,
    source_version  text,
    source_checksum text,
    last_synced_at  timestamptz NOT NULL DEFAULT now(),
    record_count    integer,
    status          text        NOT NULL DEFAULT 'current',
    error_message   text,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text        NOT NULL DEFAULT 'system',
    updated_at      timestamptz,
    updated_by      text,

    CONSTRAINT mesh_control_reference_sync_state_pkey PRIMARY KEY (table_name),
    CONSTRAINT mesh_control_reference_sync_state_table_chk CHECK (btrim(table_name) <> ''),
    CONSTRAINT mesh_control_reference_sync_state_count_chk CHECK (record_count IS NULL OR record_count >= 0),
    CONSTRAINT mesh_control_reference_sync_state_status_chk CHECK (
        status IN ('current', 'stale', 'syncing', 'error')
    ),
    CONSTRAINT mesh_control_reference_sync_state_error_chk CHECK (
        status = 'error' OR error_message IS NULL
    ),
    CONSTRAINT mesh_control_reference_sync_state_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE mesh_control.reference_sync_state IS
    'Admin-published reference snapshot freshness and version state for Mesh-local shared.* reference tables.';

CREATE TABLE IF NOT EXISTS mesh_control.routing_rule (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    route_type              text        NOT NULL,
    event_type              text,
    document_type_code      text,
    sender_account_code     text,
    receiver_account_code   text,
    provider_code           text,
    topic                   text        NOT NULL,
    handler_key             text,
    condition_expr          jsonb,
    priority                smallint    NOT NULL DEFAULT 0,
    is_enabled              boolean     NOT NULL DEFAULT true,
    effective_from          timestamptz,
    effective_until         timestamptz,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_control_routing_rule_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_routing_rule_code_uq UNIQUE NULLS NOT DISTINCT (account_code, code),
    CONSTRAINT mesh_control_routing_rule_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_control_routing_rule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_control_routing_rule_type_chk CHECK (
        route_type IN ('network_event', 'document', 'webhook', 'notification', 'projection')
    ),
    CONSTRAINT mesh_control_routing_rule_event_chk CHECK (event_type IS NULL OR btrim(event_type) <> ''),
    CONSTRAINT mesh_control_routing_rule_topic_chk CHECK (btrim(topic) <> ''),
    CONSTRAINT mesh_control_routing_rule_condition_chk CHECK (
        condition_expr IS NULL OR jsonb_typeof(condition_expr) = 'object'
    ),
    CONSTRAINT mesh_control_routing_rule_window_chk CHECK (
        effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT mesh_control_routing_rule_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_control_routing_rule_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_control_routing_rule_sender_fk FOREIGN KEY (sender_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_control_routing_rule_receiver_fk FOREIGN KEY (receiver_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_control_routing_rule_document_type_fk FOREIGN KEY (document_type_code)
        REFERENCES mesh.network_document_type (code) ON DELETE RESTRICT,
    CONSTRAINT mesh_control_routing_rule_provider_fk FOREIGN KEY (provider_code)
        REFERENCES mesh.network_provider (code) ON DELETE RESTRICT
);

COMMENT ON TABLE mesh_control.routing_rule IS
    'Mesh event/document routing map. account_code NULL means platform-global rule.';

CREATE TABLE IF NOT EXISTS mesh_control.delivery_policy (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    delivery_type           text        NOT NULL,
    destination_type        text,
    max_attempts            smallint    NOT NULL DEFAULT 5,
    initial_delay_seconds   integer     NOT NULL DEFAULT 30,
    max_delay_seconds       integer     NOT NULL DEFAULT 3600,
    backoff_strategy        text        NOT NULL DEFAULT 'exponential',
    timeout_ms              integer     NOT NULL DEFAULT 30000,
    dlq_enabled             boolean     NOT NULL DEFAULT true,
    redaction_policy        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    is_enabled              boolean     NOT NULL DEFAULT true,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_control_delivery_policy_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_delivery_policy_code_uq UNIQUE NULLS NOT DISTINCT (account_code, code),
    CONSTRAINT mesh_control_delivery_policy_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_control_delivery_policy_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_control_delivery_policy_type_chk CHECK (
        delivery_type IN ('document', 'webhook', 'notification', 'projection', 'acknowledgement')
    ),
    CONSTRAINT mesh_control_delivery_policy_destination_chk CHECK (
        destination_type IS NULL OR destination_type IN (
            'mesh_account', 'http_endpoint', 'neon_projection', 'email', 'queue'
        )
    ),
    CONSTRAINT mesh_control_delivery_policy_attempts_chk CHECK (max_attempts >= 1),
    CONSTRAINT mesh_control_delivery_policy_delay_chk CHECK (
        initial_delay_seconds >= 0 AND max_delay_seconds >= initial_delay_seconds
    ),
    CONSTRAINT mesh_control_delivery_policy_backoff_chk CHECK (
        backoff_strategy IN ('fixed', 'linear', 'exponential')
    ),
    CONSTRAINT mesh_control_delivery_policy_timeout_chk CHECK (timeout_ms > 0),
    CONSTRAINT mesh_control_delivery_policy_redaction_chk CHECK (jsonb_typeof(redaction_policy) = 'object'),
    CONSTRAINT mesh_control_delivery_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_control_delivery_policy_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

COMMENT ON TABLE mesh_control.delivery_policy IS
    'Retry, timeout, and DLQ policy for Mesh delivery paths.';

CREATE TABLE IF NOT EXISTS mesh_control.retention_policy (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    code                text        NOT NULL,
    resource_type       text        NOT NULL,
    retention_days      integer     NOT NULL,
    action              text        NOT NULL DEFAULT 'delete',
    legal_hold_enabled  boolean     NOT NULL DEFAULT false,
    is_enabled          boolean     NOT NULL DEFAULT true,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_control_retention_policy_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_retention_policy_code_uq UNIQUE NULLS NOT DISTINCT (account_code, code),
    CONSTRAINT mesh_control_retention_policy_resource_uq UNIQUE NULLS NOT DISTINCT (account_code, resource_type),
    CONSTRAINT mesh_control_retention_policy_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_control_retention_policy_resource_chk CHECK (
        resource_type IN (
            'document_payload', 'attachment', 'audit_log', 'activity_log',
            'invitation', 'idempotency_key', 'dlq', 'delivery_attempt'
        )
    ),
    CONSTRAINT mesh_control_retention_policy_days_chk CHECK (retention_days >= 0),
    CONSTRAINT mesh_control_retention_policy_action_chk CHECK (action IN ('archive', 'delete', 'anonymize')),
    CONSTRAINT mesh_control_retention_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_control_retention_policy_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

COMMENT ON TABLE mesh_control.retention_policy IS
    'Retention controls for Mesh payloads, logs, invitations, idempotency rows, and DLQs.';

CREATE TABLE IF NOT EXISTS mesh_control.quota_policy (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    code                text        NOT NULL,
    quota_subject       text        NOT NULL DEFAULT 'account',
    quota_metric        text        NOT NULL,
    limit_value         bigint      NOT NULL,
    window_seconds      integer,
    hard_limit          boolean     NOT NULL DEFAULT true,
    is_enabled          boolean     NOT NULL DEFAULT true,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_control_quota_policy_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_quota_policy_code_uq UNIQUE NULLS NOT DISTINCT (account_code, code),
    CONSTRAINT mesh_control_quota_policy_metric_uq UNIQUE NULLS NOT DISTINCT (
        account_code, quota_subject, quota_metric
    ),
    CONSTRAINT mesh_control_quota_policy_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_control_quota_policy_subject_chk CHECK (
        quota_subject IN ('account', 'connection', 'principal')
    ),
    CONSTRAINT mesh_control_quota_policy_metric_chk CHECK (
        quota_metric IN (
            'payload_size_bytes', 'daily_document_count', 'api_requests',
            'concurrent_uploads', 'storage_bytes', 'active_connections'
        )
    ),
    CONSTRAINT mesh_control_quota_policy_limit_chk CHECK (limit_value >= 0),
    CONSTRAINT mesh_control_quota_policy_window_chk CHECK (window_seconds IS NULL OR window_seconds > 0),
    CONSTRAINT mesh_control_quota_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_control_quota_policy_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

COMMENT ON TABLE mesh_control.quota_policy IS
    'Mesh account quota policy. account_code NULL means platform default.';

CREATE TABLE IF NOT EXISTS mesh_control.connector_type (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    category                text        NOT NULL,
    description             text,
    icon_key                text,
    config_schema           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    auth_types              text[]      NOT NULL DEFAULT '{}',
    capabilities            text[]      NOT NULL DEFAULT '{}',
    health_check_config     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    is_system               boolean     NOT NULL DEFAULT false,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'active',
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_control_connector_type_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_connector_type_code_uq UNIQUE (code),
    CONSTRAINT mesh_control_connector_type_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_control_connector_type_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_control_connector_type_category_chk CHECK (
        category IN ('api', 'file_transfer', 'messaging', 'erp', 'document_network', 'object_store', 'custom')
    ),
    CONSTRAINT mesh_control_connector_type_status_chk CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT mesh_control_connector_type_schema_chk CHECK (jsonb_typeof(config_schema) = 'object'),
    CONSTRAINT mesh_control_connector_type_hc_chk CHECK (jsonb_typeof(health_check_config) = 'object'),
    CONSTRAINT mesh_control_connector_type_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE mesh_control.connector_type IS
    'Mesh connector type catalog: API, SFTP, AS2, Peppol, ERP adapters, and object stores.';

CREATE TABLE IF NOT EXISTS mesh_control.connector_instance (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text        NOT NULL,
    connector_type_code     text        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    direction               text        NOT NULL DEFAULT 'both',
    endpoint_uri            text,
    secret_ref              text,
    config                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'active',
    health                  text        NOT NULL DEFAULT 'unknown',
    last_health_check_at    timestamptz,
    last_success_at         timestamptz,
    last_failure_at         timestamptz,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_control_connector_instance_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_connector_instance_code_uq UNIQUE (account_code, code),
    CONSTRAINT mesh_control_connector_instance_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_control_connector_instance_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_control_connector_instance_direction_chk CHECK (direction IN ('inbound', 'outbound', 'both')),
    CONSTRAINT mesh_control_connector_instance_status_chk CHECK (
        status IN ('active', 'inactive', 'suspended', 'error')
    ),
    CONSTRAINT mesh_control_connector_instance_health_chk CHECK (
        health IN ('unknown', 'healthy', 'degraded', 'down')
    ),
    CONSTRAINT mesh_control_connector_instance_config_chk CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT mesh_control_connector_instance_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_control_connector_instance_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_control_connector_instance_type_fk FOREIGN KEY (connector_type_code)
        REFERENCES mesh_control.connector_type (code) ON DELETE RESTRICT
);

COMMENT ON TABLE mesh_control.connector_instance IS
    'Account-scoped Mesh connector instance. secret_ref stores a vault/key reference, not the secret value.';

CREATE TABLE IF NOT EXISTS mesh_control.notification_provider (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    channel             text        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    adapter_key         text        NOT NULL,
    priority            smallint    NOT NULL DEFAULT 1,
    is_enabled          boolean     NOT NULL DEFAULT true,
    config              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    rate_limit          jsonb,
    health              text        NOT NULL DEFAULT 'unknown',
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_control_notification_provider_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_notification_provider_code_uq UNIQUE NULLS NOT DISTINCT (account_code, channel, code),
    CONSTRAINT mesh_control_notification_provider_channel_chk CHECK (
        channel IN ('in_app', 'email', 'sms', 'push', 'webhook')
    ),
    CONSTRAINT mesh_control_notification_provider_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_control_notification_provider_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_control_notification_provider_adapter_chk CHECK (btrim(adapter_key) <> ''),
    CONSTRAINT mesh_control_notification_provider_priority_chk CHECK (priority >= 1),
    CONSTRAINT mesh_control_notification_provider_config_chk CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT mesh_control_notification_provider_rate_chk CHECK (
        rate_limit IS NULL OR jsonb_typeof(rate_limit) = 'object'
    ),
    CONSTRAINT mesh_control_notification_provider_health_chk CHECK (
        health IN ('unknown', 'healthy', 'degraded', 'down')
    ),
    CONSTRAINT mesh_control_notification_provider_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

COMMENT ON TABLE mesh_control.notification_provider IS
    'Optional Mesh notification provider registry. Use only when Mesh sends its own network notifications.';

CREATE TABLE IF NOT EXISTS mesh_control.notification_routing_rule (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,
    event_type          text        NOT NULL,
    entity_type         text,
    condition_expr      jsonb,
    template_key        text        NOT NULL,
    channels            text[]      NOT NULL,
    priority            text        NOT NULL DEFAULT 'normal',
    recipient_rules     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    dedup_window_ms     integer     NOT NULL DEFAULT 300000,
    is_enabled          boolean     NOT NULL DEFAULT true,
    sort_order          smallint    NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_control_notification_route_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_notification_route_code_uq UNIQUE NULLS NOT DISTINCT (account_code, code),
    CONSTRAINT mesh_control_notification_route_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_control_notification_route_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_control_notification_route_event_chk CHECK (btrim(event_type) <> ''),
    CONSTRAINT mesh_control_notification_route_template_chk CHECK (btrim(template_key) <> ''),
    CONSTRAINT mesh_control_notification_route_channels_chk CHECK (array_length(channels, 1) >= 1),
    CONSTRAINT mesh_control_notification_route_priority_chk CHECK (
        priority IN ('low', 'normal', 'high', 'urgent')
    ),
    CONSTRAINT mesh_control_notification_route_dedup_chk CHECK (dedup_window_ms >= 0),
    CONSTRAINT mesh_control_notification_route_recipient_chk CHECK (jsonb_typeof(recipient_rules) = 'object'),
    CONSTRAINT mesh_control_notification_route_condition_chk CHECK (
        condition_expr IS NULL OR jsonb_typeof(condition_expr) = 'object'
    ),
    CONSTRAINT mesh_control_notification_route_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

COMMENT ON TABLE mesh_control.notification_routing_rule IS
    'Optional Mesh network-notification routing rule. account_code NULL means platform-global.';

CREATE TABLE IF NOT EXISTS mesh_control.notification_template (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    template_key        text        NOT NULL,
    channel             text        NOT NULL,
    locale_code         text        NOT NULL DEFAULT 'en',
    version             smallint    NOT NULL DEFAULT 1,
    status              text        NOT NULL DEFAULT 'draft',
    subject             text,
    body_text           text,
    body_html           text,
    body_json           jsonb,
    variables_schema    jsonb,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_control_notification_template_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_notification_template_version_uq
        UNIQUE NULLS NOT DISTINCT (account_code, template_key, channel, locale_code, version),
    CONSTRAINT mesh_control_notification_template_key_chk CHECK (btrim(template_key) <> ''),
    CONSTRAINT mesh_control_notification_template_channel_chk CHECK (
        channel IN ('in_app', 'email', 'sms', 'push', 'webhook')
    ),
    CONSTRAINT mesh_control_notification_template_version_chk CHECK (version >= 1),
    CONSTRAINT mesh_control_notification_template_status_chk CHECK (status IN ('draft', 'active', 'retired')),
    CONSTRAINT mesh_control_notification_template_body_chk CHECK (
        num_nonnulls(body_text, body_html, body_json) >= 1
    ),
    CONSTRAINT mesh_control_notification_template_body_json_chk CHECK (
        body_json IS NULL OR jsonb_typeof(body_json) = 'object'
    ),
    CONSTRAINT mesh_control_notification_template_vars_chk CHECK (
        variables_schema IS NULL OR jsonb_typeof(variables_schema) = 'object'
    ),
    CONSTRAINT mesh_control_notification_template_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_control_notification_template_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_control_notification_template_locale_fk FOREIGN KEY (locale_code)
        REFERENCES shared.locale (code) ON DELETE RESTRICT
);

COMMENT ON TABLE mesh_control.notification_template IS
    'Optional Mesh notification template. account_code NULL means platform default.';

CREATE TABLE IF NOT EXISTS mesh_control.cron_schedule (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,
    handler_type        text        NOT NULL,
    cron_expression     text        NOT NULL,
    timezone_code       text        NOT NULL DEFAULT 'UTC',
    target_queue        text        NOT NULL,
    payload_template    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    priority            smallint    NOT NULL DEFAULT 0,
    max_retries         smallint    NOT NULL DEFAULT 3,
    concurrency_limit   smallint,
    effective_from      timestamptz,
    effective_until     timestamptz,
    is_enabled          boolean     NOT NULL DEFAULT true,
    lock_key            text,
    last_run_at         timestamptz,
    next_run_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_control_cron_schedule_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_cron_schedule_code_uq UNIQUE NULLS NOT DISTINCT (account_code, code),
    CONSTRAINT mesh_control_cron_schedule_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_control_cron_schedule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_control_cron_schedule_handler_chk CHECK (btrim(handler_type) <> ''),
    CONSTRAINT mesh_control_cron_schedule_cron_chk CHECK (btrim(cron_expression) <> ''),
    CONSTRAINT mesh_control_cron_schedule_queue_chk CHECK (btrim(target_queue) <> ''),
    CONSTRAINT mesh_control_cron_schedule_priority_chk CHECK (priority BETWEEN -10 AND 10),
    CONSTRAINT mesh_control_cron_schedule_retries_chk CHECK (max_retries >= 0),
    CONSTRAINT mesh_control_cron_schedule_concurrency_chk CHECK (
        concurrency_limit IS NULL OR concurrency_limit > 0
    ),
    CONSTRAINT mesh_control_cron_schedule_window_chk CHECK (
        effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT mesh_control_cron_schedule_payload_chk CHECK (jsonb_typeof(payload_template) = 'object'),
    CONSTRAINT mesh_control_cron_schedule_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_control_cron_schedule_timezone_fk FOREIGN KEY (timezone_code)
        REFERENCES shared.timezone (code) ON DELETE RESTRICT
);

COMMENT ON TABLE mesh_control.cron_schedule IS
    'Runtime-configurable Mesh jobs: retention, hash anchoring, DLQ retry, replay, scan sweeps.';

CREATE TABLE IF NOT EXISTS mesh_control.policy_rule (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    rule_code           text        NOT NULL,
    name                text        NOT NULL,
    rule_type           text        NOT NULL,
    resource_type       text        NOT NULL,
    action_code         text        NOT NULL,
    effect              text        NOT NULL,
    condition_expr      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    result_payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    priority            smallint    NOT NULL DEFAULT 0,
    version_no          integer     NOT NULL DEFAULT 1,
    effective_from      timestamptz,
    effective_until     timestamptz,
    is_enabled          boolean     NOT NULL DEFAULT true,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_control_policy_rule_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_policy_rule_code_uq UNIQUE NULLS NOT DISTINCT (account_code, rule_code),
    CONSTRAINT mesh_control_policy_rule_code_chk CHECK (btrim(rule_code) <> ''),
    CONSTRAINT mesh_control_policy_rule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_control_policy_rule_type_chk CHECK (
        rule_type IN ('authorization', 'document_acceptance', 'quota', 'routing', 'retention', 'connector')
    ),
    CONSTRAINT mesh_control_policy_rule_resource_chk CHECK (btrim(resource_type) <> ''),
    CONSTRAINT mesh_control_policy_rule_action_chk CHECK (btrim(action_code) <> ''),
    CONSTRAINT mesh_control_policy_rule_effect_chk CHECK (
        effect IN ('allow', 'deny', 'require_review', 'quarantine', 'rate_limit')
    ),
    CONSTRAINT mesh_control_policy_rule_condition_chk CHECK (jsonb_typeof(condition_expr) = 'object'),
    CONSTRAINT mesh_control_policy_rule_result_chk CHECK (jsonb_typeof(result_payload) = 'object'),
    CONSTRAINT mesh_control_policy_rule_version_chk CHECK (version_no >= 1),
    CONSTRAINT mesh_control_policy_rule_window_chk CHECK (
        effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT mesh_control_policy_rule_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_control_policy_rule_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

COMMENT ON TABLE mesh_control.policy_rule IS
    'Mesh business/security policy rule. Not an ERP accounting/tax/control rule.';

CREATE TABLE IF NOT EXISTS mesh_control.policy_rule_version (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    policy_rule_id  uuid        NOT NULL,
    account_code    text,
    rule_code       text        NOT NULL,
    version_no      integer     NOT NULL,
    rule_snapshot   jsonb       NOT NULL,
    superseded_at   timestamptz NOT NULL DEFAULT now(),
    superseded_by   text        NOT NULL DEFAULT 'system',
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_control_policy_rule_version_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_policy_rule_version_uq UNIQUE (policy_rule_id, version_no),
    CONSTRAINT mesh_control_policy_rule_version_code_chk CHECK (btrim(rule_code) <> ''),
    CONSTRAINT mesh_control_policy_rule_version_no_chk CHECK (version_no >= 1),
    CONSTRAINT mesh_control_policy_rule_version_snapshot_chk CHECK (jsonb_typeof(rule_snapshot) = 'object'),
    CONSTRAINT mesh_control_policy_rule_version_rule_fk FOREIGN KEY (policy_rule_id)
        REFERENCES mesh_control.policy_rule (id) ON DELETE CASCADE,
    CONSTRAINT mesh_control_policy_rule_version_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL
);

COMMENT ON TABLE mesh_control.policy_rule_version IS
    'Immutable version history for mesh_control.policy_rule updates.';

CREATE TABLE IF NOT EXISTS mesh_control.change_request (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text,
    request_code            text        NOT NULL,
    requested_by_principal_id uuid,
    change_type             text        NOT NULL,
    target_table            text        NOT NULL,
    target_id               uuid,
    payload                 jsonb       NOT NULL,
    status                  text        NOT NULL DEFAULT 'submitted',
    reviewed_by_principal_id uuid,
    reviewed_at             timestamptz,
    review_note             text,
    applied_at              timestamptz,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_control_change_request_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_control_change_request_code_uq UNIQUE NULLS NOT DISTINCT (account_code, request_code),
    CONSTRAINT mesh_control_change_request_code_chk CHECK (btrim(request_code) <> ''),
    CONSTRAINT mesh_control_change_request_type_chk CHECK (
        change_type IN ('create', 'update', 'disable', 'enable', 'delete', 'rotate_secret')
    ),
    CONSTRAINT mesh_control_change_request_target_chk CHECK (btrim(target_table) <> ''),
    CONSTRAINT mesh_control_change_request_payload_chk CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT mesh_control_change_request_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_control_change_request_status_chk CHECK (
        status IN ('submitted', 'pending_review', 'approved', 'rejected', 'applied', 'cancelled')
    ),
    CONSTRAINT mesh_control_change_request_review_pair_chk CHECK (
        (reviewed_by_principal_id IS NULL) = (reviewed_at IS NULL)
    ),
    CONSTRAINT mesh_control_change_request_applied_chk CHECK (
        applied_at IS NULL OR status = 'applied'
    ),
    CONSTRAINT mesh_control_change_request_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_control_change_request_requested_by_fk FOREIGN KEY (requested_by_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL,
    CONSTRAINT mesh_control_change_request_reviewed_by_fk FOREIGN KEY (reviewed_by_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL
);

COMMENT ON TABLE mesh_control.change_request IS
    'Optional approval workflow for risky Mesh control changes.';
