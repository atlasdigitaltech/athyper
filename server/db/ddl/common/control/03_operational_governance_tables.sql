-- Platform connector catalog. Tenant credentials never belong here.
CREATE TABLE control.connector_type (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    code                text        NOT NULL,
    name                text        NOT NULL,
    category_code       text        NOT NULL,
    description         text,
    icon_key            text,
    config_schema       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    auth_types          text[]      NOT NULL DEFAULT '{}'::text[],
    capabilities        text[]      NOT NULL DEFAULT '{}'::text[],
    health_check_config jsonb       NOT NULL DEFAULT '{}'::jsonb,
    is_system           boolean     NOT NULL DEFAULT true,
    status              text        NOT NULL DEFAULT 'active',
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT connector_type_pkey PRIMARY KEY (id),
    CONSTRAINT connector_type_code_uq UNIQUE (code),
    CONSTRAINT connector_type_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT connector_type_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT connector_type_category_chk
        CHECK (category_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT connector_type_json_chk CHECK (
        jsonb_typeof(config_schema) = 'object'
        AND jsonb_typeof(health_check_config) = 'object'
    ),
    CONSTRAINT connector_type_status_chk
        CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT connector_type_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.connector_instance (
    id                   uuid                                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                                NOT NULL,
    connector_type_id    uuid                                NOT NULL,
    code                 text                                NOT NULL,
    name                 text                                NOT NULL,
    description          text,
    environment_code     text                                NOT NULL DEFAULT 'production',
    base_url             text,
    credential_reference text,
    config               jsonb                               NOT NULL DEFAULT '{}'::jsonb,
    health_status        control.connector_health_status_d   NOT NULL DEFAULT 'unknown',
    last_health_check_at timestamptz,
    last_error_code      text,
    last_error_message   text,
    status               control.connector_instance_status_d NOT NULL DEFAULT 'draft',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                         NOT NULL DEFAULT now(),
    created_by           uuid                                NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT connector_instance_pkey PRIMARY KEY (id),
    CONSTRAINT connector_instance_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT connector_instance_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT connector_instance_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT connector_instance_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT connector_instance_environment_chk
        CHECK (environment_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT connector_instance_url_chk
        CHECK (base_url IS NULL OR base_url ~* '^https://'),
    CONSTRAINT connector_instance_credential_chk
        CHECK (credential_reference IS NULL OR btrim(credential_reference) <> ''),
    CONSTRAINT connector_instance_config_chk CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT connector_instance_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT connector_instance_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.integration_endpoint (
    id                    uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                  NOT NULL,
    connector_instance_id uuid                                  NOT NULL,
    code                  text                                  NOT NULL,
    name                  text                                  NOT NULL,
    description           text,
    endpoint_kind_code    text                                  NOT NULL DEFAULT 'operation',
    path                  text                                  NOT NULL,
    http_method           control.http_method_d                 NOT NULL DEFAULT 'POST',
    request_content_type  text                                  NOT NULL DEFAULT 'application/json',
    timeout_ms            integer                               NOT NULL DEFAULT 10000,
    retry_policy          jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    headers               jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    health_check_path     text,
    health_status         control.connector_health_status_d     NOT NULL DEFAULT 'unknown',
    last_checked_at       timestamptz,
    last_response_ms      integer,
    last_error_code       text,
    status                control.integration_endpoint_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                           NOT NULL DEFAULT now(),
    created_by            uuid                                  NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT integration_endpoint_pkey PRIMARY KEY (id),
    CONSTRAINT integration_endpoint_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT integration_endpoint_code_uq
        UNIQUE (tenant_id, connector_instance_id, code),
    CONSTRAINT integration_endpoint_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT integration_endpoint_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT integration_endpoint_kind_chk
        CHECK (endpoint_kind_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT integration_endpoint_path_chk CHECK (btrim(path) <> ''),
    CONSTRAINT integration_endpoint_timeout_chk CHECK (timeout_ms BETWEEN 100 AND 300000),
    CONSTRAINT integration_endpoint_response_chk
        CHECK (last_response_ms IS NULL OR last_response_ms >= 0),
    CONSTRAINT integration_endpoint_json_chk CHECK (
        jsonb_typeof(retry_policy) = 'object'
        AND jsonb_typeof(headers) = 'object'
    ),
    CONSTRAINT integration_endpoint_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT integration_endpoint_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.webhook_subscription (
    id                    uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                  NOT NULL,
    integration_endpoint_id uuid                                NOT NULL,
    code                  text                                  NOT NULL,
    name                  text                                  NOT NULL,
    description           text,
    topics                text[]                                NOT NULL DEFAULT '{}'::text[],
    event_filter          jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    payload_contract_version integer                             NOT NULL DEFAULT 1,
    max_retries           smallint                              NOT NULL DEFAULT 3,
    retry_policy          jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    last_delivery_at      timestamptz,
    last_delivery_status  text,
    failure_count         integer                               NOT NULL DEFAULT 0,
    status                control.webhook_subscription_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                           NOT NULL DEFAULT now(),
    created_by            uuid                                  NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT webhook_subscription_pkey PRIMARY KEY (id),
    CONSTRAINT webhook_subscription_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT webhook_subscription_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT webhook_subscription_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT webhook_subscription_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT webhook_subscription_topics_chk
        CHECK (array_position(topics, NULL::text) IS NULL),
    CONSTRAINT webhook_subscription_version_chk
        CHECK (payload_contract_version > 0),
    CONSTRAINT webhook_subscription_retry_chk
        CHECK (max_retries BETWEEN 0 AND 20 AND failure_count >= 0),
    CONSTRAINT webhook_subscription_json_chk CHECK (
        jsonb_typeof(event_filter) = 'object'
        AND jsonb_typeof(retry_policy) = 'object'
    ),
    CONSTRAINT webhook_subscription_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT webhook_subscription_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cycle_type (
    id                    uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                          NOT NULL,
    code                  text                          NOT NULL,
    name                  text                          NOT NULL,
    description           text,
    domain_code           text                          NOT NULL,
    frequency             control.cycle_frequency_d     NOT NULL,
    clean_cycle_policy    jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    approval_policy       jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    run_data_schema       jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    task_data_schema      jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status                control.cycle_config_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                   NOT NULL DEFAULT now(),
    created_by            uuid                          NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT cycle_type_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_type_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT cycle_type_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_type_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT cycle_type_domain_chk
        CHECK (domain_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_type_json_chk CHECK (
        jsonb_typeof(clean_cycle_policy) = 'object'
        AND jsonb_typeof(approval_policy) = 'object'
        AND jsonb_typeof(run_data_schema) = 'object'
        AND jsonb_typeof(task_data_schema) = 'object'
    ),
    CONSTRAINT cycle_type_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cycle_type_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cycle_phase (
    id                      uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid                          NOT NULL,
    cycle_type_id           uuid                          NOT NULL,
    code                    text                          NOT NULL,
    name                    text                          NOT NULL,
    description             text,
    sort_order              smallint                      NOT NULL,
    is_gate_enforced        boolean                       NOT NULL DEFAULT false,
    minimum_readiness_pct   numeric(5,2),
    target_hours_from_start integer,
    status                  control.cycle_config_status_d NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz                   NOT NULL DEFAULT now(),
    created_by              uuid                          NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cycle_phase_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_phase_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_phase_type_id_uq UNIQUE (tenant_id, cycle_type_id, id),
    CONSTRAINT cycle_phase_code_uq UNIQUE (tenant_id, cycle_type_id, code),
    CONSTRAINT cycle_phase_order_uq UNIQUE (tenant_id, cycle_type_id, sort_order),
    CONSTRAINT cycle_phase_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_phase_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT cycle_phase_order_chk CHECK (sort_order > 0),
    CONSTRAINT cycle_phase_readiness_chk
        CHECK (minimum_readiness_pct IS NULL OR minimum_readiness_pct BETWEEN 0 AND 100),
    CONSTRAINT cycle_phase_target_chk
        CHECK (target_hours_from_start IS NULL OR target_hours_from_start > 0),
    CONSTRAINT cycle_phase_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cycle_phase_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cycle_task_category (
    id                uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid                          NOT NULL,
    cycle_type_id     uuid                          NOT NULL,
    code              text                          NOT NULL,
    name              text                          NOT NULL,
    description       text,
    sort_order        smallint                      NOT NULL DEFAULT 10,
    color_code        text,
    status            control.cycle_config_status_d NOT NULL DEFAULT 'draft',
    is_active         boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz                   NOT NULL DEFAULT now(),
    created_by        uuid                          NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT cycle_task_category_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_task_category_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_task_category_type_id_uq UNIQUE (tenant_id, cycle_type_id, id),
    CONSTRAINT cycle_task_category_code_uq UNIQUE (tenant_id, cycle_type_id, code),
    CONSTRAINT cycle_task_category_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_task_category_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT cycle_task_category_order_chk CHECK (sort_order >= 0),
    CONSTRAINT cycle_task_category_color_chk
        CHECK (color_code IS NULL OR color_code ~ '^#[A-Fa-f0-9]{6}$'),
    CONSTRAINT cycle_task_category_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cycle_task_category_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cycle_task_template (
    id                       uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                            NOT NULL,
    cycle_type_id            uuid                            NOT NULL,
    phase_id                 uuid                            NOT NULL,
    category_id              uuid                            NOT NULL,
    entity_code              text                            NOT NULL,
    code                     text                            NOT NULL,
    name                     text                            NOT NULL,
    description              text,
    completion_mode          control.cycle_completion_mode_d NOT NULL DEFAULT 'manual',
    system_check_handler     text,
    is_mandatory             boolean                         NOT NULL DEFAULT true,
    is_waivable              boolean                         NOT NULL DEFAULT false,
    severity_code            text,
    sort_order               smallint                        NOT NULL DEFAULT 10,
    sla_hours                integer,
    estimated_duration_min   integer,
    reminder_lead_hours      integer,
    default_owner_role_code  text,
    default_owner_principal_id uuid,
    auto_start_when_ready    boolean                         NOT NULL DEFAULT false,
    orchestration_group      text,
    applicability           jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    status                   control.cycle_config_status_d   NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                     NOT NULL DEFAULT now(),
    created_by               uuid                            NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT cycle_task_template_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_task_template_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_task_template_type_id_uq UNIQUE (tenant_id, cycle_type_id, id),
    CONSTRAINT cycle_task_template_code_uq
        UNIQUE (tenant_id, cycle_type_id, entity_code, code),
    CONSTRAINT cycle_task_template_entity_chk
        CHECK (entity_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT cycle_task_template_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_task_template_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT cycle_task_template_handler_chk
        CHECK (completion_mode = 'manual' OR nullif(btrim(system_check_handler), '') IS NOT NULL),
    CONSTRAINT cycle_task_template_order_chk CHECK (sort_order >= 0),
    CONSTRAINT cycle_task_template_duration_chk CHECK (
        (sla_hours IS NULL OR sla_hours > 0)
        AND (estimated_duration_min IS NULL OR estimated_duration_min > 0)
        AND (reminder_lead_hours IS NULL OR reminder_lead_hours >= 0)
    ),
    CONSTRAINT cycle_task_template_applicability_chk
        CHECK (jsonb_typeof(applicability) = 'object'),
    CONSTRAINT cycle_task_template_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cycle_task_template_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cycle_task_dependency (
    id                      uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid                            NOT NULL,
    cycle_type_id           uuid                            NOT NULL,
    predecessor_template_id uuid                            NOT NULL,
    successor_template_id   uuid                            NOT NULL,
    dependency_type         control.cycle_dependency_type_d NOT NULL DEFAULT 'finish_to_start',
    is_hard                 boolean                         NOT NULL DEFAULT true,
    status                  control.cycle_config_status_d   NOT NULL DEFAULT 'active',
    created_at              timestamptz                     NOT NULL DEFAULT now(),
    created_by              uuid                            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cycle_task_dependency_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_task_dependency_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_task_dependency_edge_uq UNIQUE (
        tenant_id, cycle_type_id, predecessor_template_id, successor_template_id
    ),
    CONSTRAINT cycle_task_dependency_not_self_chk
        CHECK (predecessor_template_id <> successor_template_id),
    CONSTRAINT cycle_task_dependency_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cycle_cross_dependency (
    id                   uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                          NOT NULL,
    predecessor_type_id  uuid                          NOT NULL,
    predecessor_phase_id uuid                          NOT NULL,
    successor_type_id    uuid                          NOT NULL,
    successor_phase_id   uuid                          NOT NULL,
    is_hard              boolean                       NOT NULL DEFAULT true,
    description          text,
    status               control.cycle_config_status_d NOT NULL DEFAULT 'active',
    created_at           timestamptz                   NOT NULL DEFAULT now(),
    created_by           uuid                          NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT cycle_cross_dependency_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_cross_dependency_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_cross_dependency_edge_uq UNIQUE (
        tenant_id, predecessor_type_id, predecessor_phase_id,
        successor_type_id, successor_phase_id
    ),
    CONSTRAINT cycle_cross_dependency_not_self_chk CHECK (
        predecessor_type_id <> successor_type_id
        OR predecessor_phase_id <> successor_phase_id
    ),
    CONSTRAINT cycle_cross_dependency_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cycle_carryforward_rule (
    id                       uuid                                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                                NOT NULL,
    cycle_type_id            uuid                                NOT NULL,
    deviation_type           control.cycle_deviation_type_d      NOT NULL,
    action                   control.cycle_carryforward_action_d NOT NULL,
    maximum_carry_count      smallint,
    escalate_after_carries   smallint,
    description              text,
    status                   control.cycle_config_status_d       NOT NULL DEFAULT 'active',
    created_at               timestamptz                         NOT NULL DEFAULT now(),
    created_by               uuid                                NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT cycle_carryforward_rule_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_carryforward_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_carryforward_rule_coordinate_uq
        UNIQUE (tenant_id, cycle_type_id, deviation_type),
    CONSTRAINT cycle_carryforward_rule_count_chk CHECK (
        (maximum_carry_count IS NULL OR maximum_carry_count > 0)
        AND (escalate_after_carries IS NULL OR escalate_after_carries > 0)
    ),
    CONSTRAINT cycle_carryforward_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);
