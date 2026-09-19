-- Plane-local commercial subscription catalog.
-- Plan version history is captured by the plane's snapshot schema.

CREATE TABLE control.subscription_plan (
    entitlement_version integer NOT NULL DEFAULT 1 CHECK (entitlement_version > 0),
    entitlement_effective_from timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
    id                uuid                NOT NULL DEFAULT shared.uuidv7(),
    code              text                NOT NULL,
    name              text                NOT NULL,
    max_users         integer,
    sort_order        smallint            NOT NULL DEFAULT 0,
    metadata          jsonb               NOT NULL DEFAULT '{}'::jsonb,
    status            shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active         boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz         NOT NULL DEFAULT now(),
    created_by        uuid                NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT subscription_plan_pkey PRIMARY KEY (id),
    CONSTRAINT subscription_plan_code_uq UNIQUE (code),
    CONSTRAINT subscription_plan_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT subscription_plan_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT subscription_plan_max_users_positive
        CHECK (max_users IS NULL OR max_users > 0),
    CONSTRAINT subscription_plan_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT subscription_plan_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT subscription_plan_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.subscription_plan IS
  'Plane-local subscription plan catalog. Historical versions belong in snapshot; no subscription_plan_version table is maintained.';

CREATE TABLE control.owner_type (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid,
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,
    category            text        NOT NULL,
    source_type         text        NOT NULL DEFAULT 'customer',
    target_schema       text        NOT NULL,
    target_table        text        NOT NULL,
    pk_column           text        NOT NULL DEFAULT 'id',
    is_tenant_scoped    boolean     NOT NULL DEFAULT true,
    tenant_column       text,
    supports_address    boolean     NOT NULL DEFAULT false,
    supports_contact    boolean     NOT NULL DEFAULT false,
    supports_external_reference boolean NOT NULL DEFAULT false,
    sort_order          smallint    NOT NULL DEFAULT 0,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'draft',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT owner_type_pkey PRIMARY KEY (id),
    CONSTRAINT owner_type_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT owner_type_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT owner_type_category_chk
        CHECK (category IN ('identity', 'party', 'structure', 'asset', 'custom')),
    CONSTRAINT owner_type_source_type_chk
        CHECK (source_type IN ('platform', 'customer')),
    CONSTRAINT owner_type_source_scope_chk
        CHECK (
            (source_type = 'platform' AND tenant_id IS NULL)
            OR (source_type = 'customer' AND tenant_id IS NOT NULL)
        ),
    CONSTRAINT owner_type_target_schema_fmt_chk
        CHECK (target_schema ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT owner_type_target_table_fmt_chk
        CHECK (target_table ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT owner_type_pk_column_fmt_chk
        CHECK (pk_column ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT owner_type_tenant_column_chk
        CHECK (
            (is_tenant_scoped AND tenant_column IS NOT NULL
                AND tenant_column ~ '^[a-z][a-z0-9_]*$')
            OR (NOT is_tenant_scoped AND tenant_column IS NULL)
        ),
    CONSTRAINT owner_type_customer_scope_chk
        CHECK (
            source_type <> 'customer'
            OR (is_tenant_scoped AND tenant_column = 'tenant_id')
        ),
    CONSTRAINT owner_type_capability_chk
        CHECK (
            supports_address
            OR supports_contact
            OR supports_external_reference
        ),
    CONSTRAINT owner_type_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT owner_type_status_chk
        CHECK (status IN ('draft', 'active', 'deprecated')),
    CONSTRAINT owner_type_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT owner_type_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.owner_type IS
  'Plane-local registry of trusted entity tables that may own addresses, contacts, or external-system references. Platform rows are seeded; customer rows require guarded structural and RLS validation before activation.';

COMMENT ON COLUMN control.owner_type.tenant_id IS
  'NULL for plane-owned types; owning tenant for customer-defined types.';

COMMENT ON COLUMN control.owner_type.target_schema IS
  'Validated backing-table schema. Customer targets are limited to certified ext_* schemas.';

CREATE TABLE control.owner_type_purpose (
    owner_type_id   uuid        NOT NULL,
    capability     text        NOT NULL,
    purpose_code   text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid        NOT NULL,

    CONSTRAINT owner_type_purpose_pkey
        PRIMARY KEY (owner_type_id, capability, purpose_code),
    CONSTRAINT owner_type_purpose_capability_chk
        CHECK (capability IN ('address', 'contact')),
    CONSTRAINT owner_type_purpose_code_fmt_chk
        CHECK (purpose_code ~ '^[a-z][a-z0-9_]{1,62}$')
);

COMMENT ON TABLE control.owner_type_purpose IS
  'Normalized address/contact purposes allowed for an owner type. Customer rows may be configured only for owner types belonging to the current tenant.';

-- Runtime document catalog projected from Athyper Entity Studio. Entity IDs are
-- published coordinates: PostgreSQL cannot enforce an FK across plane databases.
CREATE TABLE control.network_document_type (
    id                       uuid                                   NOT NULL DEFAULT shared.uuidv7(),
    code                     text                                   NOT NULL,
    name                     text                                   NOT NULL,
    description              text,
    direction_scope          control.network_document_direction_d   NOT NULL DEFAULT 'both',
    entity_id                uuid                                   NOT NULL,
    entity_code              text                                   NOT NULL,
    entity_version_policy    control.entity_version_policy_d        NOT NULL DEFAULT 'latest_published',
    pinned_entity_version_id uuid,
    pinned_contract_hash     text,
    metadata                 jsonb                                  NOT NULL DEFAULT '{}'::jsonb,
    status                   control.network_document_type_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                            NOT NULL DEFAULT now(),
    created_by               uuid                                   NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT network_document_type_pkey PRIMARY KEY (id),
    CONSTRAINT network_document_type_code_uq UNIQUE (code),
    CONSTRAINT network_document_type_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT network_document_type_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT network_document_type_entity_code_chk
        CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT network_document_type_version_policy_chk CHECK (
        (entity_version_policy = 'latest_published'
            AND pinned_entity_version_id IS NULL
            AND pinned_contract_hash IS NULL)
        OR
        (entity_version_policy = 'pinned'
            AND pinned_entity_version_id IS NOT NULL
            AND pinned_contract_hash IS NOT NULL)
    ),
    CONSTRAINT network_document_type_contract_hash_chk CHECK (
        pinned_contract_hash IS NULL
        OR pinned_contract_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT network_document_type_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT network_document_type_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_document_type_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.network_document_type IS
  'Mesh document-type catalog linked to an Entity Studio publication by stable entity identity. A pinned row freezes one published version; latest_published is resolved and frozen by each envelope.';
COMMENT ON COLUMN control.network_document_type.entity_id IS
  'Stable Entity Studio identity published from Athyper. This is deliberately not a cross-database FK.';

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
