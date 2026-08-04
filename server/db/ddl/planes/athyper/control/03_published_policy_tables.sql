-- Admin is the authoring authority. Active rows are published through the
-- existing snapshot layer for plane-local runtime consumption.
CREATE TABLE control.workflow_sla_policy (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid,
    code                  text        NOT NULL,
    name                  text        NOT NULL,
    description           text,
    version_no            integer     NOT NULL DEFAULT 1,
    default_sla_minutes   integer     NOT NULL,
    timers                jsonb       NOT NULL DEFAULT '[]'::jsonb,
    escalation_chain      jsonb       NOT NULL DEFAULT '[]'::jsonb,
    terminal_action       text        NOT NULL DEFAULT 'none',
    effective_from        timestamptz NOT NULL DEFAULT now(),
    effective_until       timestamptz,
    supersedes_policy_id  uuid,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT workflow_sla_policy_pkey PRIMARY KEY (id),
    CONSTRAINT workflow_sla_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT workflow_sla_policy_revision_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, code, version_no),
    CONSTRAINT workflow_sla_policy_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT workflow_sla_policy_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT workflow_sla_policy_version_chk CHECK (version_no > 0),
    CONSTRAINT workflow_sla_policy_minutes_chk CHECK (default_sla_minutes > 0),
    CONSTRAINT workflow_sla_policy_json_chk CHECK (
        jsonb_typeof(timers) = 'array'
        AND jsonb_typeof(escalation_chain) = 'array'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT workflow_sla_policy_action_chk
        CHECK (terminal_action IN ('none','reject','cancel','escalate')),
    CONSTRAINT workflow_sla_policy_period_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT workflow_sla_policy_successor_chk
        CHECK (supersedes_policy_id IS NULL OR supersedes_policy_id <> id),
    CONSTRAINT workflow_sla_policy_status_chk
        CHECK (status IN ('draft','scheduled','active','expired','retired')),
    CONSTRAINT workflow_sla_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT workflow_sla_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.bank_format_rule (
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid,
    code                            text        NOT NULL,
    name                            text        NOT NULL,
    description                     text,
    version_no                      integer     NOT NULL DEFAULT 1,
    country_code                    character(2) NOT NULL,
    payment_network                 text        NOT NULL,
    direction                       text        NOT NULL DEFAULT 'both',
    currency_code                   character(3),
    account_id_type                 text        NOT NULL,
    bank_id_type                    text        NOT NULL,
    account_id_required             boolean     NOT NULL DEFAULT true,
    bank_id_required                boolean     NOT NULL DEFAULT true,
    bic_allowed                     boolean     NOT NULL DEFAULT true,
    bic_required                    boolean     NOT NULL DEFAULT false,
    branch_code_required            boolean     NOT NULL DEFAULT false,
    national_bank_code_required     boolean     NOT NULL DEFAULT false,
    account_pattern                 text,
    bank_id_pattern                 text,
    branch_code_pattern             text,
    iban_country_prefix             character(2),
    checksum_validation             text        NOT NULL DEFAULT 'none',
    validation_schema               jsonb       NOT NULL DEFAULT '{}'::jsonb,
    priority                        smallint    NOT NULL DEFAULT 0,
    effective_from                  date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until                 date,
    supersedes_rule_id              uuid,
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                          text        NOT NULL DEFAULT 'draft',
    is_active                       boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT bank_format_rule_pkey PRIMARY KEY (id),
    CONSTRAINT bank_format_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_format_rule_revision_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, code, version_no),
    CONSTRAINT bank_format_rule_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT bank_format_rule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT bank_format_rule_version_chk CHECK (version_no > 0),
    CONSTRAINT bank_format_rule_network_chk CHECK (payment_network ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT bank_format_rule_direction_chk CHECK (direction IN ('inbound','outbound','both')),
    CONSTRAINT bank_format_rule_identifier_type_chk CHECK (
        account_id_type ~ '^[a-z][a-z0-9_.-]{1,62}$'
        AND bank_id_type ~ '^[a-z][a-z0-9_.-]{1,62}$'
    ),
    CONSTRAINT bank_format_rule_bic_chk CHECK (NOT bic_required OR bic_allowed),
    CONSTRAINT bank_format_rule_iban_chk CHECK (
        iban_country_prefix IS NULL OR iban_country_prefix = country_code
    ),
    CONSTRAINT bank_format_rule_checksum_chk
        CHECK (checksum_validation IN ('none','iban_mod97','aba','custom_schema')),
    CONSTRAINT bank_format_rule_json_chk CHECK (
        jsonb_typeof(validation_schema) = 'object' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT bank_format_rule_priority_chk CHECK (priority >= 0),
    CONSTRAINT bank_format_rule_period_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT bank_format_rule_successor_chk
        CHECK (supersedes_rule_id IS NULL OR supersedes_rule_id <> id),
    CONSTRAINT bank_format_rule_status_chk
        CHECK (status IN ('draft','scheduled','active','expired','retired')),
    CONSTRAINT bank_format_rule_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bank_format_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.workflow_sla_policy IS
  'Admin-authored versioned SLA definition published as an immutable snapshot for local plane execution.';
COMMENT ON TABLE control.bank_format_rule IS
  'Admin-authored country/network payment identifier validation contract published to Neon; connector transport configuration is stored elsewhere.';
