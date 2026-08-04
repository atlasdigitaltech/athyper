CREATE TABLE control.routing_rule (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    network_account_id          uuid        NOT NULL,
    code                        text        NOT NULL,
    name                        text        NOT NULL,
    description                 text,
    route_type                  text        NOT NULL,
    event_type                  text        NOT NULL,
    document_type_code          text,
    sender_network_account_id   uuid,
    receiver_network_account_id uuid,
    provider_code               text,
    topic                       text,
    handler_key                 text,
    condition_expr              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    priority                    smallint    NOT NULL DEFAULT 100,
    effective_from              timestamptz NOT NULL DEFAULT now(),
    effective_until             timestamptz,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      text        NOT NULL DEFAULT 'draft',
    is_active                   boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT routing_rule_pkey PRIMARY KEY (id),
    CONSTRAINT routing_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT routing_rule_code_uq UNIQUE (tenant_id, network_account_id, code),
    CONSTRAINT routing_rule_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT routing_rule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT routing_rule_type_chk CHECK (route_type IN ('event','document','provider','topic','handler')),
    CONSTRAINT routing_rule_event_chk CHECK (event_type ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT routing_rule_provider_chk
        CHECK (provider_code IS NULL OR provider_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT routing_rule_topic_chk CHECK (topic IS NULL OR btrim(topic) <> ''),
    CONSTRAINT routing_rule_handler_chk
        CHECK (handler_key IS NULL OR handler_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT routing_rule_target_chk CHECK (
        document_type_code IS NOT NULL OR provider_code IS NOT NULL
        OR topic IS NOT NULL OR handler_key IS NOT NULL
    ),
    CONSTRAINT routing_rule_json_chk CHECK (
        jsonb_typeof(condition_expr) = 'object' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT routing_rule_priority_chk CHECK (priority > 0),
    CONSTRAINT routing_rule_period_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT routing_rule_status_chk
        CHECK (status IN ('draft','scheduled','active','expired','retired')),
    CONSTRAINT routing_rule_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT routing_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.retention_policy (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    network_account_id         uuid        NOT NULL,
    code                       text        NOT NULL,
    name                       text        NOT NULL,
    description                text,
    resource_type              text        NOT NULL,
    retention_days             integer     NOT NULL,
    expiry_action              text        NOT NULL DEFAULT 'archive',
    legal_hold_enabled         boolean     NOT NULL DEFAULT true,
    version_no                 integer     NOT NULL DEFAULT 1,
    effective_from             date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until            date,
    supersedes_policy_id       uuid,
    metadata                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                     text        NOT NULL DEFAULT 'draft',
    is_active                  boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT retention_policy_pkey PRIMARY KEY (id),
    CONSTRAINT retention_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT retention_policy_revision_uq
        UNIQUE (tenant_id, network_account_id, code, version_no),
    CONSTRAINT retention_policy_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT retention_policy_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT retention_policy_resource_chk
        CHECK (resource_type ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT retention_policy_days_chk CHECK (retention_days > 0),
    CONSTRAINT retention_policy_action_chk
        CHECK (expiry_action IN ('archive','delete','anonymize','retain')),
    CONSTRAINT retention_policy_version_chk CHECK (version_no > 0),
    CONSTRAINT retention_policy_period_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT retention_policy_successor_chk
        CHECK (supersedes_policy_id IS NULL OR supersedes_policy_id <> id),
    CONSTRAINT retention_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT retention_policy_status_chk
        CHECK (status IN ('draft','scheduled','active','expired','retired')),
    CONSTRAINT retention_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT retention_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.quota_policy (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    network_account_id         uuid        NOT NULL,
    code                       text        NOT NULL,
    name                       text        NOT NULL,
    description                text,
    quota_subject              text        NOT NULL,
    usage_metric_code          text        NOT NULL,
    dimension_code             text        NOT NULL DEFAULT '*',
    limit_value                bigint      NOT NULL,
    window_seconds             integer     NOT NULL,
    warn_at_pct                smallint    NOT NULL DEFAULT 80,
    hard_limit                 boolean     NOT NULL DEFAULT true,
    effective_from             timestamptz NOT NULL DEFAULT now(),
    effective_until            timestamptz,
    metadata                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                     text        NOT NULL DEFAULT 'active',
    is_active                  boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT quota_policy_pkey PRIMARY KEY (id),
    CONSTRAINT quota_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT quota_policy_code_uq UNIQUE (tenant_id, network_account_id, code),
    CONSTRAINT quota_policy_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT quota_policy_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT quota_policy_subject_chk
        CHECK (quota_subject ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT quota_policy_dimension_chk
        CHECK (dimension_code = '*' OR dimension_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT quota_policy_limit_chk CHECK (limit_value > 0 AND window_seconds > 0),
    CONSTRAINT quota_policy_warn_chk CHECK (warn_at_pct BETWEEN 1 AND 100),
    CONSTRAINT quota_policy_period_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT quota_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT quota_policy_status_chk CHECK (status IN ('active','suspended','retired')),
    CONSTRAINT quota_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT quota_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.routing_rule IS
  'Mesh network-account routing policy for document, event, provider, topic, or handler selection.';
COMMENT ON TABLE control.retention_policy IS
  'Mesh network-account resource retention policy. Legal holds are enforced through the governance layer before expiry actions.';
COMMENT ON TABLE control.quota_policy IS
  'Mesh network-account quota overlay. Mutable consumption remains in runtime_meta counters.';
