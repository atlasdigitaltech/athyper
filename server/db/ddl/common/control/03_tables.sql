-- Platform connector catalog. Tenant credentials never belong here.
-- Published plane-local workspace/module catalog. Athyper is the authoring
-- authority; every plane enforces from its own verified read model.

CREATE TABLE control.workspace (
    id                       uuid                NOT NULL DEFAULT shared.uuidv7(),
    code                     text                NOT NULL,
    name                     text                NOT NULL,
    description              text,
    icon_key                 text,
    sort_order               smallint            NOT NULL DEFAULT 0,
    is_shared_infrastructure boolean             NOT NULL DEFAULT false,
    metadata                 jsonb               NOT NULL DEFAULT '{}'::jsonb,
    status                   shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active                boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz         NOT NULL DEFAULT now(),
    created_by               uuid                NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT control_workspace_pkey PRIMARY KEY (id),
    CONSTRAINT control_workspace_code_uq UNIQUE (code),
    CONSTRAINT control_workspace_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT control_workspace_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT control_workspace_icon_key_chk
        CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT control_workspace_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT control_workspace_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT control_workspace_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT control_workspace_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.module (
    id                uuid                NOT NULL DEFAULT shared.uuidv7(),
    code              text                NOT NULL,
    name              text                NOT NULL,
    description       text,
    icon_key          text,
    config            jsonb               NOT NULL DEFAULT '{}'::jsonb,
    metadata          jsonb               NOT NULL DEFAULT '{}'::jsonb,
    status            shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active         boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz         NOT NULL DEFAULT now(),
    created_by        uuid                NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT control_module_pkey PRIMARY KEY (id),
    CONSTRAINT control_module_code_uq UNIQUE (code),
    CONSTRAINT control_module_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT control_module_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT control_module_icon_key_chk
        CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT control_module_config_chk CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT control_module_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT control_module_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT control_module_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.workspace_module (
    workspace_id      uuid                NOT NULL,
    module_id         uuid                NOT NULL,
    is_primary        boolean             NOT NULL DEFAULT true,
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

    CONSTRAINT workspace_module_pkey PRIMARY KEY (workspace_id, module_id),
    CONSTRAINT workspace_module_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT workspace_module_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT workspace_module_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT workspace_module_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.subscription_plan_module (
    id                   uuid                NOT NULL DEFAULT shared.uuidv7(),
    subscription_plan_id uuid                NOT NULL,
    module_id             uuid                NOT NULL,
    entitlement_mode      text                NOT NULL DEFAULT 'included',
    metadata              jsonb               NOT NULL DEFAULT '{}'::jsonb,
    status                shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active             boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz         NOT NULL DEFAULT now(),
    created_by            uuid                NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT subscription_plan_module_pkey PRIMARY KEY (id),
    CONSTRAINT subscription_plan_module_coordinate_uq
        UNIQUE (subscription_plan_id, module_id),
    CONSTRAINT subscription_plan_module_mode_chk
        CHECK (entitlement_mode IN ('included', 'optional_addon')),
    CONSTRAINT subscription_plan_module_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT subscription_plan_module_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT subscription_plan_module_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.workspace IS
  'Published plane-local UI grouping catalog. A workspace is neither a subscription entitlement nor an authorization grant.';
COMMENT ON TABLE control.module IS
  'Published plane-local independently entitled functional module catalog.';
COMMENT ON TABLE control.workspace_module IS
  'Workspace display association. is_primary selects the canonical navigation home without restricting additional placement.';
COMMENT ON TABLE control.subscription_plan_module IS
  'Plan-to-module commercial entitlement. Inclusion exposes a module but never grants a role, permission, membership, or scope.';

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
    credential_revision  integer                             NOT NULL DEFAULT 1,
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
        CHECK ((credential_reference IS NULL OR btrim(credential_reference) <> '') AND credential_revision > 0),
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
    request_schema        jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    max_payload_bytes     integer                               NOT NULL DEFAULT 1048576,
    definition_version    integer                               NOT NULL DEFAULT 1,
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
        AND jsonb_typeof(headers) = 'object' AND jsonb_typeof(request_schema) = 'object'
    ),
    CONSTRAINT integration_endpoint_payload_chk CHECK (max_payload_bytes BETWEEN 1 AND 10485760 AND definition_version > 0),
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
    signing_secret_reference text,
    signature_header      text                                  NOT NULL DEFAULT 'x-webhook-signature',
    timestamp_header      text                                  NOT NULL DEFAULT 'x-webhook-timestamp',
    timestamp_tolerance_seconds integer                         NOT NULL DEFAULT 300,
    max_body_bytes        integer                               NOT NULL DEFAULT 1048576,
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
        CHECK (max_retries BETWEEN 0 AND 20 AND failure_count >= 0 AND timestamp_tolerance_seconds BETWEEN 1 AND 3600 AND max_body_bytes BETWEEN 1 AND 10485760),
    CONSTRAINT webhook_subscription_secret_chk CHECK (signing_secret_reference IS NULL OR btrim(signing_secret_reference) <> ''),
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

CREATE TABLE control.cycle_template_revision (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid        NOT NULL,
    cycle_type_id        uuid        NOT NULL,
    revision_number      integer     NOT NULL,
    schema_code          text        NOT NULL DEFAULT 'athyper.cycle-template/1.0',
    template_json        jsonb       NOT NULL,
    template_hash        char(64)    NOT NULL,
    topological_task_ids uuid[]      NOT NULL DEFAULT '{}'::uuid[],
    idempotency_key      text        NOT NULL,
    published_at         timestamptz NOT NULL DEFAULT now(),
    published_by         uuid        NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,

    CONSTRAINT cycle_template_revision_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_template_revision_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_template_revision_coordinate_uq UNIQUE (tenant_id, cycle_type_id, revision_number),
    CONSTRAINT cycle_template_revision_pin_uq UNIQUE (tenant_id, cycle_type_id, id, revision_number, template_hash),
    CONSTRAINT cycle_template_revision_idempotency_uq UNIQUE (tenant_id, cycle_type_id, idempotency_key),
    CONSTRAINT cycle_template_revision_number_chk CHECK (revision_number > 0),
    CONSTRAINT cycle_template_revision_schema_chk CHECK (schema_code = 'athyper.cycle-template/1.0'),
    CONSTRAINT cycle_template_revision_json_chk CHECK (jsonb_typeof(template_json) = 'object'),
    CONSTRAINT cycle_template_revision_hash_chk CHECK (template_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT cycle_template_revision_key_chk CHECK (btrim(idempotency_key) <> '')
);

COMMENT ON TABLE control.cycle_template_revision IS
  'Immutable, complete published cycle-template aggregate. Runtime cycle runs pin its revision identity and hash.';

-- Platform-owned banking identifier standards. This catalog is installed in
-- every plane so Admin can govern the standard and Neon/Mesh can validate
-- local bank-account data without copying payment-execution credentials.
CREATE TABLE control.bank_account_validation_rule (
    id                              uuid NOT NULL DEFAULT shared.uuidv7(),
    code                            text NOT NULL,
    name                            text NOT NULL,
    description                     text,
    country_code                    char(2) NOT NULL,
    payment_rail_code               text NOT NULL,
    direction                       control.bank_validation_direction_d NOT NULL DEFAULT 'both',
    currency_code                   char(3),
    account_identifier_type         text NOT NULL,
    bank_identifier_type            text NOT NULL,
    is_account_identifier_required  boolean NOT NULL DEFAULT true,
    is_bank_identifier_required     boolean NOT NULL DEFAULT true,
    is_bic_allowed                  boolean NOT NULL DEFAULT true,
    is_bic_required                 boolean NOT NULL DEFAULT false,
    is_branch_code_required         boolean NOT NULL DEFAULT false,
    is_national_bank_code_required  boolean NOT NULL DEFAULT false,
    account_pattern                 text,
    bank_identifier_pattern         text,
    branch_code_pattern             text,
    iban_country_prefix             char(2),
    is_checksum_validated           boolean NOT NULL DEFAULT false,
    validation_schema               jsonb NOT NULL DEFAULT '{}'::jsonb,
    priority                        smallint NOT NULL DEFAULT 0,
    metadata                        jsonb NOT NULL DEFAULT '{}'::jsonb,
    status                          control.bank_validation_status_d NOT NULL DEFAULT 'active',
    is_active                       boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT bank_account_validation_rule_pkey PRIMARY KEY (id),
    CONSTRAINT bank_account_validation_rule_code_uq UNIQUE (code),
    CONSTRAINT bank_account_validation_rule_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT bank_account_validation_rule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT bank_account_validation_rule_rail_chk
        CHECK (payment_rail_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT bank_account_validation_rule_identifier_type_chk
        CHECK (
            account_identifier_type ~ '^[a-z][a-z0-9_.-]{1,62}$'
            AND bank_identifier_type ~ '^[a-z][a-z0-9_.-]{1,62}$'
        ),
    CONSTRAINT bank_account_validation_rule_country_chk
        CHECK (country_code = upper(country_code)),
    CONSTRAINT bank_account_validation_rule_currency_chk
        CHECK (currency_code IS NULL OR currency_code = upper(currency_code)),
    CONSTRAINT bank_account_validation_rule_iban_prefix_chk
        CHECK (iban_country_prefix IS NULL OR iban_country_prefix = upper(iban_country_prefix)),
    CONSTRAINT bank_account_validation_rule_bic_chk
        CHECK (NOT is_bic_required OR is_bic_allowed),
    CONSTRAINT bank_account_validation_rule_priority_chk CHECK (priority >= 0),
    CONSTRAINT bank_account_validation_rule_json_chk
        CHECK (jsonb_typeof(validation_schema) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bank_account_validation_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.bank_account_validation_rule IS
    'Platform-owned country and payment-rail validation standard for bank-account and institution identifiers. It carries no tenant credentials and is used by Neon and Mesh.';

-- Platform-governed usage measurements and plane-local commercial limits.
-- Admin is the authoring authority; Neon and Mesh hold published read models
-- so enforcement never depends on a cross-database query.

CREATE TABLE control.usage_metric_catalog (
    id                  uuid                NOT NULL DEFAULT shared.uuidv7(),
    code                text                NOT NULL,
    name                text                NOT NULL,
    description         text,
    module_id           uuid,
    unit_code           text                NOT NULL,
    dimension_type_code text,
    status              shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active           boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz         NOT NULL DEFAULT now(),
    created_by          uuid                NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT usage_metric_catalog_pkey PRIMARY KEY (id),
    CONSTRAINT usage_metric_catalog_code_uq UNIQUE (code),
    CONSTRAINT usage_metric_catalog_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT usage_metric_catalog_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT usage_metric_catalog_unit_chk
        CHECK (unit_code IN ('count', 'bytes')),
    CONSTRAINT usage_metric_catalog_dimension_type_chk
        CHECK (
            dimension_type_code IS NULL
            OR dimension_type_code ~ '^[a-z][a-z0-9_]{1,62}$'
        ),
    CONSTRAINT usage_metric_catalog_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT usage_metric_catalog_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.subscription_plan_usage_limit (
    id                   uuid                NOT NULL DEFAULT shared.uuidv7(),
    subscription_plan_id uuid                NOT NULL,
    usage_metric_id      uuid                NOT NULL,
    dimension_code       text                NOT NULL DEFAULT '*',
    limit_value          bigint,
    warn_at_pct          smallint            NOT NULL DEFAULT 80,
    status               shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active            boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz         NOT NULL DEFAULT now(),
    created_by           uuid                NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT subscription_plan_usage_limit_pkey PRIMARY KEY (id),
    CONSTRAINT subscription_plan_usage_limit_plan_metric_dimension_uq
        UNIQUE (subscription_plan_id, usage_metric_id, dimension_code),
    CONSTRAINT subscription_plan_usage_limit_dimension_chk
        CHECK (dimension_code = '*' OR dimension_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT subscription_plan_usage_limit_value_chk
        CHECK (limit_value IS NULL OR limit_value > 0),
    CONSTRAINT subscription_plan_usage_limit_warn_chk
        CHECK (warn_at_pct BETWEEN 1 AND 100),
    CONSTRAINT subscription_plan_usage_limit_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT subscription_plan_usage_limit_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.tenant_usage_limit_override (
    id              uuid                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid                NOT NULL,
    usage_metric_id uuid                NOT NULL,
    dimension_code  text                NOT NULL DEFAULT '*',
    limit_value     bigint              NOT NULL,
    reason          text                NOT NULL,
    effective_from  timestamptz         NOT NULL DEFAULT now(),
    effective_until timestamptz,
    status          shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active       boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at      timestamptz         NOT NULL DEFAULT now(),
    created_by      uuid                NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT tenant_usage_limit_override_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_usage_limit_override_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tenant_usage_limit_override_dimension_chk
        CHECK (dimension_code = '*' OR dimension_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT tenant_usage_limit_override_value_chk CHECK (limit_value > 0),
    CONSTRAINT tenant_usage_limit_override_reason_chk CHECK (btrim(reason) <> ''),
    CONSTRAINT tenant_usage_limit_override_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT tenant_usage_limit_override_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tenant_usage_limit_override_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.usage_metric_catalog IS
  'Platform-controlled catalog of usage measurements. Admin authors the catalog and publishes it unchanged to Neon and Mesh.';
COMMENT ON TABLE control.subscription_plan_usage_limit IS
  'Plane-local subscription-plan entitlement. dimension_code = ''*'' is the fallback for a dimensioned metric; limit_value NULL means unlimited.';
COMMENT ON TABLE control.tenant_usage_limit_override IS
  'Approved, time-bounded commercial exception to a plan usage limit. It cannot express unlimited access; assign an appropriate subscription plan instead.';

-- Release gates are temporary operational controls. Typed parameters are
-- stable configuration contracts. Neither is Meta Entity capability metadata.

CREATE TABLE control.feature_flag_catalog (
    id                uuid                NOT NULL DEFAULT shared.uuidv7(),
    code              text                NOT NULL,
    name              text                NOT NULL,
    description       text,
    module_id          uuid,
    flag_kind         text                NOT NULL DEFAULT 'release_gate',
    default_enabled   boolean             NOT NULL DEFAULT false,
    rollout_pct       smallint,
    effective_from    timestamptz         NOT NULL DEFAULT now(),
    effective_until   timestamptz,
    status            shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active         boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    metadata          jsonb               NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz         NOT NULL DEFAULT now(),
    created_by        uuid                NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT feature_flag_catalog_pkey PRIMARY KEY (id),
    CONSTRAINT feature_flag_catalog_code_uq UNIQUE (code),
    CONSTRAINT feature_flag_catalog_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT feature_flag_catalog_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT feature_flag_catalog_kind_chk
        CHECK (flag_kind IN ('release_gate', 'kill_switch', 'experiment')),
    CONSTRAINT feature_flag_catalog_rollout_chk
        CHECK (rollout_pct IS NULL OR rollout_pct BETWEEN 0 AND 100),
    CONSTRAINT feature_flag_catalog_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT feature_flag_catalog_experiment_rollout_chk
        CHECK (flag_kind <> 'experiment' OR rollout_pct IS NOT NULL),
    CONSTRAINT feature_flag_catalog_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT feature_flag_catalog_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT feature_flag_catalog_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.feature_flag_override (
    id                uuid                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid                NOT NULL,
    feature_flag_id   uuid                NOT NULL,
    is_enabled        boolean             NOT NULL,
    reason            text                NOT NULL,
    effective_from    timestamptz         NOT NULL DEFAULT now(),
    effective_until   timestamptz,
    status            shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active         boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz         NOT NULL DEFAULT now(),
    created_by        uuid                NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT feature_flag_override_pkey PRIMARY KEY (id),
    CONSTRAINT feature_flag_override_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT feature_flag_override_reason_chk CHECK (btrim(reason) <> ''),
    CONSTRAINT feature_flag_override_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT feature_flag_override_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT feature_flag_override_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.parameter_definition (
    id                  uuid                NOT NULL DEFAULT shared.uuidv7(),
    code                text                NOT NULL,
    name                text                NOT NULL,
    description         text,
    module_id           uuid,
    value_type          text                NOT NULL,
    unit_code           text,
    default_value       jsonb               NOT NULL,
    min_value           jsonb,
    max_value           jsonb,
    allowed_values      jsonb,
    tenant_can_override boolean             NOT NULL DEFAULT false,
    reload_mode         text                NOT NULL DEFAULT 'next_request',
    cache_ttl_seconds   integer             NOT NULL DEFAULT 300,
    is_sensitive        boolean             NOT NULL DEFAULT false,
    sort_order          integer             NOT NULL DEFAULT 0,
    status              shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active           boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    metadata            jsonb               NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz         NOT NULL DEFAULT now(),
    created_by          uuid                NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT parameter_definition_pkey PRIMARY KEY (id),
    CONSTRAINT parameter_definition_code_uq UNIQUE (code),
    CONSTRAINT parameter_definition_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT parameter_definition_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT parameter_definition_type_chk
        CHECK (value_type IN ('boolean', 'integer', 'number', 'string', 'enum', 'duration', 'json')),
    CONSTRAINT parameter_definition_unit_chk
        CHECK (unit_code IS NULL OR unit_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT parameter_definition_allowed_values_chk
        CHECK (allowed_values IS NULL OR jsonb_typeof(allowed_values) = 'array'),
    CONSTRAINT parameter_definition_bounds_chk
        CHECK (
            (min_value IS NULL AND max_value IS NULL)
            OR value_type IN ('integer', 'number')
        ),
    CONSTRAINT parameter_definition_reload_mode_chk
        CHECK (reload_mode IN ('immediate', 'next_request', 'next_login', 'restart', 'external_provider')),
    CONSTRAINT parameter_definition_cache_ttl_chk
        CHECK (cache_ttl_seconds BETWEEN 0 AND 86400),
    CONSTRAINT parameter_definition_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT parameter_definition_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT parameter_definition_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT parameter_definition_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.tenant_parameter_value (
    id                      uuid                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid                NOT NULL,
    parameter_definition_id uuid                NOT NULL,
    value                   jsonb               NOT NULL,
    reason                  text,
    effective_from          timestamptz         NOT NULL DEFAULT now(),
    effective_until         timestamptz,
    status                  shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active               boolean             GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz         NOT NULL DEFAULT now(),
    created_by              uuid                NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tenant_parameter_value_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_parameter_value_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tenant_parameter_value_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT tenant_parameter_value_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tenant_parameter_value_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.feature_flag_catalog IS
  'Platform-governed release gate, kill switch, or experiment. It is never a module entitlement, authorization decision, or permanent business setting.';
COMMENT ON TABLE control.feature_flag_override IS
  'Approved tenant-specific release-rollout exception. Admin authors and publishes it; tenant applications receive it read-only.';
COMMENT ON TABLE control.parameter_definition IS
  'Platform-governed typed configuration contract. It specifies the default, validation boundary, tenant override permission, and reload behaviour.';
COMMENT ON TABLE control.tenant_parameter_value IS
  'Tenant value for a tenant-configurable parameter. A row is an explicit override of parameter_definition.default_value.';

-- Plane-local configurable vocabulary shared by Athyper, Neon, and Mesh.
-- Domain codes express semantic ownership; physical storage remains in control.

CREATE TABLE control.lookup_domain (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  source_schema text NOT NULL,
  is_extensible boolean DEFAULT false NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
  status_changed_at timestamptz,
  status_changed_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid
);

COMMENT ON TABLE control.lookup_domain IS
  'ARCHETYPE=B;SCOPE=N. Plane-local registry of named lookup domains. source_schema records semantic ownership, not physical storage.';

CREATE TABLE control.lookup_value (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  tenant_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  domain_code text NOT NULL,
  description text,
  category text,
  sort_order smallint DEFAULT 0 NOT NULL,
  is_system boolean DEFAULT true NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
  status_changed_at timestamptz,
  status_changed_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid
);

COMMENT ON TABLE control.lookup_value IS
  'ARCHETYPE=B;SCOPE=P+T. Global rows have NULL tenant_id/is_system=true; extensible domains may add tenant rows.';

CREATE TABLE control.cron_schedule (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid,
    code              text        NOT NULL,
    name              text        NOT NULL,
    description       text,
    handler_type      text        NOT NULL,
    cron_expression   text        NOT NULL,
    timezone          text        NOT NULL DEFAULT 'UTC',
    target_queue      text        NOT NULL,
    payload_template  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    priority          smallint    NOT NULL DEFAULT 0,
    max_retries       smallint    NOT NULL DEFAULT 3,
    concurrency_limit smallint,
    effective_from    timestamptz,
    effective_until   timestamptz,
    is_enabled        boolean     NOT NULL DEFAULT true,
    lock_key          text,
    last_run_at       timestamptz,
    next_run_at       timestamptz,
    last_reconciled_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,
    CONSTRAINT cron_schedule_pkey PRIMARY KEY (id),
    CONSTRAINT cron_schedule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cron_schedule_code_uq UNIQUE NULLS NOT DISTINCT (tenant_id, code),
    CONSTRAINT cron_schedule_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT cron_schedule_text_chk CHECK (btrim(name) <> '' AND btrim(handler_type) <> '' AND btrim(cron_expression) <> '' AND btrim(target_queue) <> ''),
    CONSTRAINT cron_schedule_retry_chk CHECK (max_retries >= 0 AND (concurrency_limit IS NULL OR concurrency_limit > 0)),
    CONSTRAINT cron_schedule_window_chk CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
    CONSTRAINT cron_schedule_json_chk CHECK (jsonb_typeof(payload_template) = 'object'),
    CONSTRAINT cron_schedule_audit_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.cron_schedule IS 'Physical-plane BullMQ schedules. tenant_id NULL rows are plane-global; code-owned registry entries win at runtime.';

CREATE TABLE control.cron_schedule_change_log (
    id          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id   uuid,
    schedule_id uuid        NOT NULL,
    action      text        NOT NULL CHECK (action IN ('created','updated','deactivated')),
    reason      text        NOT NULL CHECK (btrim(reason) <> ''),
    changed_at  timestamptz NOT NULL DEFAULT now(),
    changed_by  uuid        NOT NULL,
    CONSTRAINT cron_schedule_change_log_pkey PRIMARY KEY (id),
    CONSTRAINT cron_schedule_change_log_schedule_fk FOREIGN KEY (schedule_id) REFERENCES control.cron_schedule(id) ON DELETE CASCADE,
    CONSTRAINT cron_schedule_change_log_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE
);
COMMENT ON TABLE control.cron_schedule_change_log IS 'Append-only operator evidence for governed schedule mutations.';

-- Canonical notification configuration shared by all three physical planes.
-- Provider credentials remain in the external secret provider. config may only
-- contain non-secret adapter settings; credential_ref is an opaque reference.
CREATE TABLE control.notification_provider (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    channel               text        NOT NULL,
    code                  text        NOT NULL,
    name                  text        NOT NULL,
    adapter_key           text        NOT NULL,
    credential_ref        text,
    priority              smallint    NOT NULL DEFAULT 1,
    is_enabled            boolean     NOT NULL DEFAULT true,
    config                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    rate_limit            jsonb,
    health                control.notification_provider_health_d NOT NULL DEFAULT 'unknown',
    last_health_check_at  timestamptz,
    last_error_code       text,
    last_error_message    text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT notification_provider_pkey PRIMARY KEY (id),
    CONSTRAINT notification_provider_code_uq UNIQUE (channel, code),
    CONSTRAINT notification_provider_channel_chk CHECK (channel IN ('in_app','email','sms','whatsapp','push','webhook')),
    CONSTRAINT notification_provider_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT notification_provider_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT notification_provider_adapter_chk CHECK (adapter_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT notification_provider_credential_chk CHECK (credential_ref IS NULL OR btrim(credential_ref) <> ''),
    CONSTRAINT notification_provider_json_chk CHECK (jsonb_typeof(config) = 'object' AND (rate_limit IS NULL OR jsonb_typeof(rate_limit) = 'object')),
    CONSTRAINT notification_provider_priority_chk CHECK (priority BETWEEN 1 AND 32767),
    CONSTRAINT notification_provider_audit_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.notification_template (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid,
    template_key     text        NOT NULL,
    channel          text        NOT NULL,
    locale           text        NOT NULL DEFAULT 'en',
    version          smallint    NOT NULL DEFAULT 1,
    status           control.notification_template_status_d NOT NULL DEFAULT 'draft',
    subject          text,
    body_text        text,
    body_html        text,
    body_json        jsonb,
    variables_schema jsonb,
    metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,
    CONSTRAINT notification_template_pkey PRIMARY KEY (id),
    CONSTRAINT notification_template_coordinate_uq UNIQUE NULLS NOT DISTINCT (tenant_id, template_key, channel, locale, version),
    CONSTRAINT notification_template_key_chk CHECK (template_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT notification_template_channel_chk CHECK (channel IN ('in_app','email','sms','whatsapp','push','webhook')),
    CONSTRAINT notification_template_locale_chk CHECK (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
    CONSTRAINT notification_template_version_chk CHECK (version > 0),
    CONSTRAINT notification_template_body_chk CHECK (subject IS NOT NULL OR body_text IS NOT NULL OR body_html IS NOT NULL OR body_json IS NOT NULL),
    CONSTRAINT notification_template_json_chk CHECK ((variables_schema IS NULL OR jsonb_typeof(variables_schema) = 'object') AND jsonb_typeof(metadata) = 'object' AND (body_json IS NULL OR jsonb_typeof(body_json) = 'object')),
    CONSTRAINT notification_template_audit_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.notification_routing_rule (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid,
    code             text        NOT NULL,
    name             text        NOT NULL,
    description      text,
    event_type       text        NOT NULL,
    entity_type      text,
    lifecycle_state  text,
    workflow_phase   text,
    condition_expr   jsonb,
    template_key     text        NOT NULL,
    channels         text[]      NOT NULL,
    priority         text        NOT NULL DEFAULT 'normal',
    recipient_rules  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    digest_frequency text,
    sla_minutes      integer,
    dedup_window_ms  integer     NOT NULL DEFAULT 300000,
    is_enabled       boolean     NOT NULL DEFAULT true,
    sort_order       smallint    NOT NULL DEFAULT 0,
    metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,
    CONSTRAINT notification_routing_rule_pkey PRIMARY KEY (id),
    CONSTRAINT notification_routing_rule_code_uq UNIQUE NULLS NOT DISTINCT (tenant_id, code),
    CONSTRAINT notification_routing_rule_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$' AND event_type ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND template_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT notification_routing_rule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT notification_routing_rule_channels_chk CHECK (cardinality(channels) > 0 AND channels <@ ARRAY['in_app','email','sms','whatsapp','push','webhook']::text[] AND array_position(channels, NULL) IS NULL),
    CONSTRAINT notification_routing_rule_priority_chk CHECK (priority IN ('low','normal','high','urgent')),
    CONSTRAINT notification_routing_rule_digest_chk CHECK (digest_frequency IS NULL OR digest_frequency IN ('hourly_digest','daily_digest','weekly_digest')),
    CONSTRAINT notification_routing_rule_json_chk CHECK ((condition_expr IS NULL OR jsonb_typeof(condition_expr) = 'object') AND jsonb_typeof(recipient_rules) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT notification_routing_rule_limits_chk CHECK (dedup_window_ms >= 0 AND (sla_minutes IS NULL OR sla_minutes > 0)),
    CONSTRAINT notification_routing_rule_audit_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.notification_provider IS 'Physical-plane provider binding and health metadata. Secrets are externally referenced by credential_ref.';
COMMENT ON TABLE control.notification_template IS 'Physical-plane platform defaults and tenant overrides. Product defaults belong in plane seed overlays.';
COMMENT ON TABLE control.notification_routing_rule IS 'Physical-plane event routing rules. tenant_id NULL rows are platform defaults.';

-- Identical plane-local policy contract for Neon and Mesh.
-- Athyper metadata stores only portable policy coordinates; counters are a later runtime slice.
CREATE TABLE control.numbering_policy (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid,
    policy_code       text        NOT NULL,
    policy_revision   integer     NOT NULL,
    name              text        NOT NULL,
    description       text,
    format_template   text        NOT NULL,
    sequence_width    smallint    NOT NULL DEFAULT 6,
    pad_character     character(1) NOT NULL DEFAULT '0',
    start_value       bigint      NOT NULL DEFAULT 1,
    increment_by      integer     NOT NULL DEFAULT 1,
    maximum_value     bigint,
    scope_kind        text        NOT NULL DEFAULT 'tenant',
    reset_kind        text        NOT NULL DEFAULT 'never',
    timezone_code     text,
    status            text        NOT NULL DEFAULT 'draft',
    activated_at      timestamptz,
    activated_by      uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT numbering_policy_pkey PRIMARY KEY (id),
    CONSTRAINT numbering_policy_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT numbering_policy_code_revision_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, policy_code, policy_revision),
    CONSTRAINT numbering_policy_code_chk CHECK (policy_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT numbering_policy_revision_chk CHECK (policy_revision >= 1),
    CONSTRAINT numbering_policy_name_chk CHECK (btrim(name) <> '' AND length(name) <= 256),
    CONSTRAINT numbering_policy_description_chk CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT numbering_policy_template_length_chk CHECK (length(format_template) BETWEEN 3 AND 256),
    CONSTRAINT numbering_policy_width_chk CHECK (sequence_width BETWEEN 1 AND 20),
    CONSTRAINT numbering_policy_pad_chk CHECK (pad_character !~ '[{}[:space:]]'),
    CONSTRAINT numbering_policy_start_chk CHECK (
        start_value BETWEEN 0 AND 9007199254740991 - increment_by
    ),
    CONSTRAINT numbering_policy_increment_chk CHECK (increment_by > 0),
    CONSTRAINT numbering_policy_maximum_chk CHECK (
        maximum_value IS NULL OR maximum_value BETWEEN start_value AND 9007199254740991 - increment_by
    ),
    CONSTRAINT numbering_policy_scope_chk CHECK (scope_kind IN (
        'tenant','entity','legal_entity','company_code','site',
        'operating_organization','resource_company','ledger','network_account'
    )),
    CONSTRAINT numbering_policy_reset_chk CHECK (reset_kind IN (
        'never','calendar_year','calendar_month','calendar_day','fiscal_year'
    )),
    CONSTRAINT numbering_policy_status_chk CHECK (status IN ('draft','active','retired')),
    CONSTRAINT numbering_policy_activation_pair_chk CHECK ((activated_at IS NULL) = (activated_by IS NULL)),
    CONSTRAINT numbering_policy_activation_state_chk CHECK (
        (status = 'draft' AND activated_at IS NULL)
        OR (status IN ('active','retired') AND activated_at IS NOT NULL)
    ),
    CONSTRAINT numbering_policy_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.numbering_policy IS
  'Plane-local immutable numbering policy revision. It describes formatting and counter partitioning but stores no mutable counter value.';
COMMENT ON COLUMN control.numbering_policy.format_template IS
  'Controlled template containing exactly one {seq}; optional tokens: {yyyy},{yy},{mm},{dd},{mmm},{fiscal_year},{scope},{ctx.<key>}.';
COMMENT ON COLUMN control.numbering_policy.scope_kind IS
  'Resolver contract for the counter partition beyond tenant. The future allocation service supplies the corresponding stable scope key.';

-- Plane-local policy catalog required by common services, including Atlas AI.
-- This file is applied to Athyper, Neon, and Mesh.

CREATE TABLE control.policy_definition (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid,
    module_id        uuid,
    entity_type      text        NOT NULL,
    name             text        NOT NULL,
    description      text,
    priority         smallint    NOT NULL DEFAULT 100,
    evaluation_mode  text        NOT NULL DEFAULT 'first_match',
    effective_from   date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until  date,
    version_no       integer     NOT NULL DEFAULT 1,
    predecessor_id   uuid,
    definition_hash  text,
    status           text        NOT NULL DEFAULT 'active',
    is_active        boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT pdef_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE control.policy_definition IS
    'Plane-local policy container shared by common services. tenant_id=NULL denotes a platform-global policy.';

COMMENT ON COLUMN control.policy_definition.module_id IS
    'Optional plane module scope. NULL denotes a cross-module policy.';

-- Version ownership remains on control.policy_definition.version_no. Rules and
-- tests are children of that version; no independent rule-version table exists.
CREATE TABLE control.policy_rule (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    policy_definition_id uuid        NOT NULL,
    priority             smallint    NOT NULL DEFAULT 10,
    condition_expr       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    action_code          text        NOT NULL,
    action_config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    score                numeric(9,4),
    confidence           numeric(5,4),
    explanation          text,
    approver_rules       jsonb,
    sla_hours            smallint,
    metadata             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT policy_rule_pkey PRIMARY KEY (id),
    CONSTRAINT policy_rule_priority_uq UNIQUE (policy_definition_id, priority),
    CONSTRAINT policy_rule_priority_chk CHECK (priority > 0),
    CONSTRAINT policy_rule_action_chk
        CHECK (action_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT policy_rule_json_chk CHECK (
        jsonb_typeof(condition_expr) = 'object'
        AND jsonb_typeof(action_config) = 'object'
        AND jsonb_typeof(metadata) = 'object'
        AND (approver_rules IS NULL OR jsonb_typeof(approver_rules) IN ('array','object'))
    ),
    CONSTRAINT policy_rule_score_chk CHECK (score IS NULL OR score BETWEEN -100000 AND 100000),
    CONSTRAINT policy_rule_confidence_chk CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CONSTRAINT policy_rule_sla_chk CHECK (sla_hours IS NULL OR sla_hours > 0),
    CONSTRAINT policy_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.policy_test_case (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    policy_definition_id uuid        NOT NULL,
    code                 text        NOT NULL,
    name                 text        NOT NULL,
    description          text,
    input_payload        jsonb       NOT NULL,
    expected_outcome     jsonb       NOT NULL,
    metadata             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status               text        NOT NULL DEFAULT 'active',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT policy_test_case_pkey PRIMARY KEY (id),
    CONSTRAINT policy_test_case_code_uq UNIQUE (policy_definition_id, code),
    CONSTRAINT policy_test_case_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT policy_test_case_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT policy_test_case_json_chk CHECK (
        jsonb_typeof(input_payload) = 'object'
        AND jsonb_typeof(expected_outcome) = 'object'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT policy_test_case_status_chk CHECK (status IN ('active','deprecated')),
    CONSTRAINT policy_test_case_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT policy_test_case_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.policy_test_result (
    id uuid NOT NULL DEFAULT shared.uuidv7(), policy_test_case_id uuid NOT NULL,
    policy_definition_id uuid NOT NULL, definition_hash text NOT NULL, passed boolean NOT NULL,
    actual_outcome jsonb NOT NULL, executed_at timestamptz NOT NULL DEFAULT now(), executed_by uuid NOT NULL,
    CONSTRAINT policy_test_result_pkey PRIMARY KEY (id),
    CONSTRAINT policy_test_result_hash_chk CHECK (definition_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT policy_test_result_json_chk CHECK (jsonb_typeof(actual_outcome) = 'object')
);

CREATE TABLE control.policy_activation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_type text NOT NULL, name text NOT NULL, policy_definition_id uuid NOT NULL,
    definition_hash text NOT NULL, activated_at timestamptz NOT NULL DEFAULT now(), activated_by uuid NOT NULL,
    CONSTRAINT policy_activation_pkey PRIMARY KEY (id),
    CONSTRAINT policy_activation_hash_chk CHECK (definition_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE control.policy_evaluation_history (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, policy_definition_id uuid NOT NULL,
    definition_hash text NOT NULL, entity_type text NOT NULL, entity_id text, decision jsonb NOT NULL,
    evaluated_at timestamptz NOT NULL DEFAULT now(), evaluated_by uuid NOT NULL,
    CONSTRAINT policy_evaluation_history_pkey PRIMARY KEY (id),
    CONSTRAINT policy_evaluation_history_hash_chk CHECK (definition_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT policy_evaluation_history_json_chk CHECK (jsonb_typeof(decision) = 'object')
);

COMMENT ON TABLE control.policy_rule IS
  'Ordered rule owned by one policy-definition version. Rule history is represented by a new policy_definition.version_no, never by a second rule-version table.';
COMMENT ON TABLE control.policy_test_case IS
  'Deterministic policy input and expected outcome. Mutable execution evidence belongs in operations/audit storage.';

-- ── Rounding rule ─────────────────────────────────────────────────────────────
-- Tenant rounding contract. NULL precision derives from the transaction
-- currency minor_units; rounding_increment supports non-decimal increments
-- such as 0.05 for CHF or 50 for COP.

CREATE TABLE control.rounding_rule (
    id                  uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                           NOT NULL,
    code                text                           NOT NULL,
    name                text                           NOT NULL,
    method              control.rounding_method_d      NOT NULL DEFAULT 'ROUND_HALF_UP',
    precision_digits    smallint,
    rounding_increment  numeric(18,6),
    metadata            jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status              control.finance_policy_status_d NOT NULL DEFAULT 'draft',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                    NOT NULL DEFAULT now(),
    created_by          uuid                           NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT rounding_rule_pkey PRIMARY KEY (id),
    CONSTRAINT rounding_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT rounding_rule_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT rounding_rule_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT rounding_rule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT rounding_rule_precision_chk
        CHECK (precision_digits IS NULL OR precision_digits BETWEEN 0 AND 6),
    CONSTRAINT rounding_rule_increment_chk
        CHECK (rounding_increment IS NULL OR rounding_increment > 0),
    CONSTRAINT rounding_rule_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT rounding_rule_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT rounding_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.rounding_rule IS
    'Tenant rounding contract. NULL precision_digits derives from '
    'shared.currency.minor_units at resolution time. rounding_increment '
    'supports non-decimal steps (CHF=0.05, COP=50). Activated rules are '
    'immutable — create a replacement to change behaviour.';

-- ── Rounding context ──────────────────────────────────────────────────────────
-- Sparse dispatch table mapping (tenant, company?, currency?, slot?) to a
-- rounding_rule. NULL in any dimension acts as wildcard. The resolver picks
-- the most-specific match using a 3-bit specificity score:
--   company(4) + currency(2) + slot(1) → highest wins.
-- Falls through to shared.currency.minor_units when no row matches.
-- Quantity slots (UNIT_QUANTITY, WEIGHT…) always use currency_code IS NULL rows.

CREATE TABLE control.rounding_context (
    id               uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid                     NOT NULL,
    company_code_id  uuid,
    currency_code    char(3),
    slot             control.rounding_slot_d,
    rounding_rule_id uuid                     NOT NULL,
    created_at       timestamptz              NOT NULL DEFAULT now(),
    created_by       uuid                     NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT rounding_context_pkey PRIMARY KEY (id),
    CONSTRAINT rounding_context_tenant_uq UNIQUE (tenant_id, id),
    CONSTRAINT rounding_context_dispatch_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, company_code_id, currency_code, slot),
    CONSTRAINT rounding_context_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.rounding_context IS
    'Sparse dispatch: (tenant, company?, currency?, slot?) → rounding_rule. '
    'NULL dimensions act as wildcards. Most-specific match wins. '
    'Falls back to shared.currency.minor_units when no row matches.';
