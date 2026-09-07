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
    supports_bank_account boolean   NOT NULL DEFAULT false,
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
        CHECK (category IN ('identity', 'party', 'structure', 'organization', 'asset', 'custom')),
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
            OR supports_bank_account
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
        CHECK (capability IN ('address', 'contact', 'bank_account')),
    CONSTRAINT owner_type_purpose_code_fmt_chk
        CHECK (purpose_code ~ '^[a-z][a-z0-9_]{1,62}$')
);

CREATE TABLE control.org_unit_type (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    code              text        NOT NULL,
    name              text        NOT NULL,
    description       text,
    level_order       integer     NOT NULL DEFAULT 0,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status            text        NOT NULL DEFAULT 'active',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT org_unit_type_pkey PRIMARY KEY (id),
    CONSTRAINT org_unit_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT org_unit_type_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT org_unit_type_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT org_unit_type_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT org_unit_type_level_order_chk CHECK (level_order >= 0),
    CONSTRAINT org_unit_type_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT org_unit_type_status_chk CHECK (status IN ('active', 'suspended', 'retired')),
    CONSTRAINT org_unit_type_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT org_unit_type_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.org_unit_type IS
  'Tenant-configurable workforce hierarchy level/type catalog; no fixed Division/Department ordering is imposed.';

COMMENT ON TABLE control.owner_type_purpose IS
  'Normalized address/contact purposes allowed for an owner type. Customer rows may be configured only for owner types belonging to the current tenant.';

CREATE TABLE control.risk_source_config (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    source_code           text        NOT NULL,
    connector_instance_id uuid,
    custom_trust_level    smallint,
    risk_settings         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'active',
    is_enabled            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT risk_source_config_pkey PRIMARY KEY (id),
    CONSTRAINT risk_source_config_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT risk_source_config_source_uq UNIQUE (tenant_id, source_code),
    CONSTRAINT risk_source_config_trust_chk
        CHECK (custom_trust_level IS NULL OR custom_trust_level BETWEEN 1 AND 5),
    CONSTRAINT risk_source_config_settings_chk
        CHECK (jsonb_typeof(risk_settings) = 'object'),
    CONSTRAINT risk_source_config_status_chk
        CHECK (status IN ('active', 'disabled')),
    CONSTRAINT risk_source_config_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT risk_source_config_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.risk_source_config IS
  'Neon tenant enablement and risk-specific policy for a platform risk source. Transport endpoints, authentication, and secret references belong to the linked connector instance.';

CREATE TABLE control.business_partner_qualification (
    id                        uuid                             NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                             NOT NULL,
    business_partner_id       uuid                             NOT NULL,
    partner_role              master.partner_role_d            NOT NULL,
    role_id                   uuid                             NOT NULL,
    operating_organization_id uuid,
    company_code_id           uuid,
    commodity_capability_id   uuid,
    qualification_type_code   text                             NOT NULL,
    idempotency_key           text                             NOT NULL,
    decision                  control.qualification_decision_d NOT NULL DEFAULT 'pending',
    decision_reason           text,
    risk_assessment_id        uuid,
    effective_from            date,
    effective_until           date,
    reviewed_at               timestamptz,
    reviewed_by               uuid,
    approved_at               timestamptz,
    approved_by               uuid,
    next_review_at            date,
    decision_idempotency_key  text,
    decision_fingerprint      text,
    row_version               bigint                           NOT NULL DEFAULT 1,
    metadata                  jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    created_at                timestamptz                      NOT NULL DEFAULT now(),
    created_by                uuid                             NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,

    CONSTRAINT business_partner_qualification_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_qualification_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_qualification_type_chk
        CHECK (qualification_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_qualification_idempotency_chk
        CHECK (btrim(idempotency_key) = idempotency_key
               AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT business_partner_qualification_decision_key_chk
        CHECK (decision_idempotency_key IS NULL OR
               (btrim(decision_idempotency_key) = decision_idempotency_key
                AND length(decision_idempotency_key) BETWEEN 8 AND 200)),
    CONSTRAINT business_partner_qualification_fingerprint_chk
        CHECK (decision_fingerprint IS NULL OR decision_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT business_partner_qualification_decision_evidence_chk
        CHECK ((decision = 'pending') =
               (decision_idempotency_key IS NULL AND decision_fingerprint IS NULL)),
    CONSTRAINT business_partner_qualification_row_version_chk
        CHECK (row_version >= 1),
    CONSTRAINT business_partner_qualification_reason_chk
        CHECK (decision_reason IS NULL OR length(decision_reason) <= 4000),
    CONSTRAINT business_partner_qualification_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until > effective_from),
    CONSTRAINT business_partner_qualification_review_pair_chk
        CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CONSTRAINT business_partner_qualification_approval_pair_chk
        CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT business_partner_qualification_no_self_approval_chk
        CHECK (reviewed_by IS NULL OR reviewed_by <> created_by),
    CONSTRAINT business_partner_qualification_approved_chk
        CHECK (decision NOT IN ('approved', 'conditional')
               OR approved_at IS NOT NULL),
    CONSTRAINT business_partner_qualification_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384),
    CONSTRAINT business_partner_qualification_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.supplier_preference_designation (
    id                          uuid                                 NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid                                 NOT NULL,
    business_partner_id         uuid                                 NOT NULL,
    supplier_id                 uuid                                 NOT NULL,
    operating_organization_id   uuid,
    company_code_id             uuid,
    country_code                character(2),
    channel_code                text,
    commodity_category_id       uuid,
    effective_from              date                                 NOT NULL,
    effective_until             date,
    rationale                   text                                 NOT NULL,
    status                      control.supplier_preference_status_d NOT NULL DEFAULT 'pending',
    idempotency_key             text                                 NOT NULL,
    decision_reason             text,
    reviewed_at                 timestamptz,
    reviewed_by                 uuid,
    approved_at                 timestamptz,
    approved_by                 uuid,
    decision_idempotency_key    text,
    decision_fingerprint        text,
    revocation_reason           text,
    revoked_at                  timestamptz,
    revoked_by                  uuid,
    revocation_idempotency_key  text,
    revocation_fingerprint      text,
    row_version                 bigint                               NOT NULL DEFAULT 1,
    metadata                    jsonb                                NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz                          NOT NULL DEFAULT now(),
    created_by                  uuid                                 NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT supplier_preference_designation_pkey PRIMARY KEY (id),
    CONSTRAINT supplier_preference_designation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT supplier_preference_designation_idempotency_chk CHECK (
        btrim(idempotency_key) = idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT supplier_preference_designation_decision_key_chk CHECK (
        decision_idempotency_key IS NULL OR
        (btrim(decision_idempotency_key) = decision_idempotency_key AND length(decision_idempotency_key) BETWEEN 8 AND 200)),
    CONSTRAINT supplier_preference_designation_revocation_key_chk CHECK (
        revocation_idempotency_key IS NULL OR
        (btrim(revocation_idempotency_key) = revocation_idempotency_key AND length(revocation_idempotency_key) BETWEEN 8 AND 200)),
    CONSTRAINT supplier_preference_designation_fingerprint_chk CHECK (
        (decision_fingerprint IS NULL OR decision_fingerprint ~ '^[a-f0-9]{64}$') AND
        (revocation_fingerprint IS NULL OR revocation_fingerprint ~ '^[a-f0-9]{64}$')),
    CONSTRAINT supplier_preference_designation_range_chk CHECK (
        effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT supplier_preference_designation_reason_chk CHECK (
        length(rationale) BETWEEN 1 AND 4000 AND
        (decision_reason IS NULL OR length(decision_reason) BETWEEN 1 AND 4000) AND
        (revocation_reason IS NULL OR length(revocation_reason) BETWEEN 1 AND 4000)),
    CONSTRAINT supplier_preference_designation_review_pair_chk CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CONSTRAINT supplier_preference_designation_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT supplier_preference_designation_revoke_pair_chk CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
    CONSTRAINT supplier_preference_designation_state_evidence_chk CHECK (
        (status = 'pending' AND reviewed_at IS NULL AND approved_at IS NULL AND decision_idempotency_key IS NULL AND decision_fingerprint IS NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
        OR (status = 'approved' AND reviewed_at IS NOT NULL AND approved_at IS NOT NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
        OR (status = 'rejected' AND reviewed_at IS NOT NULL AND approved_at IS NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
        OR (status = 'revoked' AND reviewed_at IS NOT NULL AND approved_at IS NOT NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NOT NULL AND revocation_idempotency_key IS NOT NULL AND revocation_fingerprint IS NOT NULL)),
    CONSTRAINT supplier_preference_designation_no_self_approval_chk CHECK (
        reviewed_by IS NULL OR reviewed_by <> created_by),
    CONSTRAINT supplier_preference_designation_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT supplier_preference_designation_metadata_chk CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384),
    CONSTRAINT supplier_preference_designation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.supplier_preference_designation IS
  'Governed effective-dated preferred-supplier designation by operating organization, optional company code, and optional commodity category. Preference ranks an eligible supplier; it never replaces readiness controls.';

CREATE TABLE control.customer_account_designation (
    id                          uuid                                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid                                          NOT NULL,
    business_partner_id         uuid                                          NOT NULL,
    customer_id                 uuid                                          NOT NULL,
    operating_organization_id   uuid,
    company_code_id             uuid,
    country_code                character(2),
    channel_code                text,
    designation_type            control.customer_account_designation_type_d   NOT NULL,
    priority_tier               smallint,
    effective_from              date                                          NOT NULL,
    effective_until             date,
    rationale                   text                                          NOT NULL,
    status                      control.customer_account_designation_status_d NOT NULL DEFAULT 'pending',
    idempotency_key             text                                          NOT NULL,
    decision_reason             text,
    reviewed_at                 timestamptz,
    reviewed_by                 uuid,
    approved_at                 timestamptz,
    approved_by                 uuid,
    decision_idempotency_key    text,
    decision_fingerprint        text,
    revocation_reason           text,
    revoked_at                  timestamptz,
    revoked_by                  uuid,
    revocation_idempotency_key  text,
    revocation_fingerprint      text,
    row_version                 bigint                                        NOT NULL DEFAULT 1,
    metadata                    jsonb                                         NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz                                   NOT NULL DEFAULT now(),
    created_by                  uuid                                          NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT customer_account_designation_pkey PRIMARY KEY (id),
    CONSTRAINT customer_account_designation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT customer_account_designation_priority_chk CHECK (priority_tier IS NULL OR priority_tier BETWEEN 1 AND 5),
    CONSTRAINT customer_account_designation_country_chk CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT customer_account_designation_channel_chk CHECK (channel_code IS NULL OR channel_code ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
    CONSTRAINT customer_account_designation_idempotency_chk CHECK (btrim(idempotency_key) = idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT customer_account_designation_decision_key_chk CHECK (decision_idempotency_key IS NULL OR (btrim(decision_idempotency_key) = decision_idempotency_key AND length(decision_idempotency_key) BETWEEN 8 AND 200)),
    CONSTRAINT customer_account_designation_revocation_key_chk CHECK (revocation_idempotency_key IS NULL OR (btrim(revocation_idempotency_key) = revocation_idempotency_key AND length(revocation_idempotency_key) BETWEEN 8 AND 200)),
    CONSTRAINT customer_account_designation_fingerprint_chk CHECK ((decision_fingerprint IS NULL OR decision_fingerprint ~ '^[a-f0-9]{64}$') AND (revocation_fingerprint IS NULL OR revocation_fingerprint ~ '^[a-f0-9]{64}$')),
    CONSTRAINT customer_account_designation_range_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT customer_account_designation_reason_chk CHECK (length(rationale) BETWEEN 1 AND 4000 AND (decision_reason IS NULL OR length(decision_reason) BETWEEN 1 AND 4000) AND (revocation_reason IS NULL OR length(revocation_reason) BETWEEN 1 AND 4000)),
    CONSTRAINT customer_account_designation_review_pair_chk CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CONSTRAINT customer_account_designation_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT customer_account_designation_revoke_pair_chk CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
    CONSTRAINT customer_account_designation_state_evidence_chk CHECK (
        (status = 'pending' AND reviewed_at IS NULL AND approved_at IS NULL AND decision_idempotency_key IS NULL AND decision_fingerprint IS NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
        OR (status = 'approved' AND reviewed_at IS NOT NULL AND approved_at IS NOT NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
        OR (status = 'rejected' AND reviewed_at IS NOT NULL AND approved_at IS NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
        OR (status = 'revoked' AND reviewed_at IS NOT NULL AND approved_at IS NOT NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NOT NULL AND revocation_idempotency_key IS NOT NULL AND revocation_fingerprint IS NOT NULL)),
    CONSTRAINT customer_account_designation_no_self_approval_chk CHECK (reviewed_by IS NULL OR reviewed_by <> created_by),
    CONSTRAINT customer_account_designation_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT customer_account_designation_metadata_chk CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384),
    CONSTRAINT customer_account_designation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.customer_account_designation IS
  'Governed effective-dated customer account designation by sales operating organization with optional company, geography, and channel coordinates. It models key-account, strategic, and priority-service decisions separately from supplier preference, credit, eligibility, and customer master status.';

COMMENT ON COLUMN control.customer_account_designation.priority_tier IS
  'Optional tenant-defined priority from 1 (highest) through 5 (lowest); it does not grant credit or override blocks.';

CREATE TABLE control.business_partner_block (
    id                        uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                           NOT NULL,
    business_partner_id       uuid                           NOT NULL,
    partner_role_scope        control.partner_role_scope_d   NOT NULL DEFAULT 'all',
    operating_organization_id uuid,
    company_code_id           uuid,
    operation_code            text                           NOT NULL,
    reason_code               text,
    reason                    text                           NOT NULL,
    effective_from            timestamptz                    NOT NULL DEFAULT now(),
    effective_until           timestamptz,
    blocked_at                timestamptz                    NOT NULL DEFAULT now(),
    blocked_by                uuid                           NOT NULL,
    lifted_at                 timestamptz,
    lifted_by                 uuid,
    lift_reason               text,
    metadata                  jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                    control.partner_block_status_d NOT NULL DEFAULT 'active',
    created_at                timestamptz                    NOT NULL DEFAULT now(),
    created_by                uuid                           NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,

    CONSTRAINT business_partner_block_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_block_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_block_operation_chk
        CHECK (operation_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_block_reason_code_chk
        CHECK (reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_block_reason_chk
        CHECK (btrim(reason) <> '' AND length(reason) <= 4000),
    CONSTRAINT business_partner_block_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT business_partner_block_lift_chk CHECK (
        (status = 'lifted' AND lifted_at IS NOT NULL AND lifted_by IS NOT NULL
         AND nullif(btrim(lift_reason), '') IS NOT NULL)
        OR
        (status <> 'lifted' AND lifted_at IS NULL AND lifted_by IS NULL
         AND lift_reason IS NULL)
    ),
    CONSTRAINT business_partner_block_status_time_chk
        CHECK (status <> 'expired' OR effective_until IS NOT NULL),
    CONSTRAINT business_partner_block_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_block_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Neon-only formula and rate-table authority for HR, leave, and payroll.

CREATE TABLE control.formula_expression (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    code              text        NOT NULL,
    name              text        NOT NULL,
    module_code       text        NOT NULL DEFAULT 'PAYROLL',
    formula_kind      text        NOT NULL DEFAULT 'payroll',
    description       text,
    input_schema      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    output_schema     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    default_rounding  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status            text        NOT NULL DEFAULT 'draft',
    is_active         boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT formula_expression_pkey PRIMARY KEY (id),
    CONSTRAINT formula_expression_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT formula_expression_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT formula_expression_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT formula_expression_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT formula_expression_module_nonempty_chk CHECK (btrim(module_code) <> ''),
    CONSTRAINT formula_expression_kind_chk
        CHECK (
            formula_kind IN (
                'payroll', 'tax', 'accrual', 'leave',
                'benefit', 'statutory', 'workforce'
            )
        ),
    CONSTRAINT formula_expression_json_chk CHECK (
        jsonb_typeof(input_schema) = 'object'
        AND jsonb_typeof(output_schema) = 'object'
        AND jsonb_typeof(default_rounding) = 'object'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT formula_expression_status_chk
        CHECK (status IN ('draft', 'active', 'retired', 'archived')),
    CONSTRAINT formula_expression_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT formula_expression_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.formula_expression IS
  'Neon versioned formula header for payroll, leave, statutory, benefit, and workforce calculations.';

CREATE TABLE control.formula_expression_version (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    formula_expression_id uuid        NOT NULL,
    version_no            integer     NOT NULL,
    expression_language   text        NOT NULL DEFAULT 'jsonlogic',
    expression_body       jsonb       NOT NULL,
    input_defaults        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    output_mapping        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    rounding_config       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    effective_from        date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until       date,
    status                text        NOT NULL DEFAULT 'draft',
    is_effective          boolean     GENERATED ALWAYS AS (status = 'effective') STORED,
    published_at          timestamptz,
    published_by          uuid,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT formula_expression_version_pkey PRIMARY KEY (id),
    CONSTRAINT formula_expression_version_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT formula_expression_version_no_uq
        UNIQUE (tenant_id, formula_expression_id, version_no),
    CONSTRAINT formula_expression_version_number_chk CHECK (version_no >= 1),
    CONSTRAINT formula_expression_version_language_chk
        CHECK (expression_language IN ('jsonlogic', 'cel', 'mathjs')),
    CONSTRAINT formula_expression_version_body_chk
        CHECK (jsonb_typeof(expression_body) IN ('object', 'array')),
    CONSTRAINT formula_expression_version_json_chk CHECK (
        jsonb_typeof(input_defaults) = 'object'
        AND jsonb_typeof(output_mapping) = 'object'
        AND jsonb_typeof(rounding_config) = 'object'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT formula_expression_version_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT formula_expression_version_status_chk
        CHECK (status IN ('draft', 'effective', 'retired', 'archived')),
    CONSTRAINT formula_expression_version_publication_chk CHECK (
        (status = 'draft' AND published_at IS NULL AND published_by IS NULL)
        OR (status <> 'draft' AND published_at IS NOT NULL AND published_by IS NOT NULL)
    ),
    CONSTRAINT formula_expression_version_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.formula_expression_version IS
  'Immutable-on-publication Neon formula version. Payroll and leave results must snapshot the exact version id used.';

CREATE TABLE control.rate_table (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    code              text        NOT NULL,
    name              text        NOT NULL,
    rate_table_kind   text        NOT NULL DEFAULT 'statutory',
    country_code      character(2),
    currency_code     character(3),
    description       text,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status            text        NOT NULL DEFAULT 'draft',
    is_active         boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT rate_table_pkey PRIMARY KEY (id),
    CONSTRAINT rate_table_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT rate_table_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT rate_table_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT rate_table_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT rate_table_kind_chk
        CHECK (
            rate_table_kind IN (
                'statutory', 'bracket', 'lookup', 'allowance',
                'contribution', 'constant', 'custom'
            )
        ),
    CONSTRAINT rate_table_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT rate_table_status_chk
        CHECK (status IN ('draft', 'active', 'retired', 'archived')),
    CONSTRAINT rate_table_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT rate_table_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.rate_table IS
  'Neon effective-dated rate-table header for statutory bands, allowances, contributions, and payroll constants.';

CREATE TABLE control.rate_table_row (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    rate_table_id   uuid        NOT NULL,
    row_key         text,
    effective_from  date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until date,
    sequence_no     integer     NOT NULL DEFAULT 1,
    range_from      numeric(18,4),
    range_until     numeric(18,4),
    key_values      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    rate_value      numeric(18,8),
    amount_value    numeric(18,4),
    cap_amount      numeric(18,4),
    floor_amount    numeric(18,4),
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT rate_table_row_pkey PRIMARY KEY (id),
    CONSTRAINT rate_table_row_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT rate_table_row_key_uq
        UNIQUE (tenant_id, rate_table_id, effective_from, sequence_no),
    CONSTRAINT rate_table_row_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT rate_table_row_sequence_chk CHECK (sequence_no >= 1),
    CONSTRAINT rate_table_row_range_chk
        CHECK (range_until IS NULL OR range_from IS NULL OR range_until >= range_from),
    CONSTRAINT rate_table_row_value_chk
        CHECK (rate_value IS NOT NULL OR amount_value IS NOT NULL),
    CONSTRAINT rate_table_row_cap_floor_chk
        CHECK (cap_amount IS NULL OR floor_amount IS NULL OR cap_amount >= floor_amount),
    CONSTRAINT rate_table_row_json_chk
        CHECK (jsonb_typeof(key_values) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT rate_table_row_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.rate_table_row IS
  'Neon effective-dated rate or band row. Parent deletion cascades only while the owning rate table is deliberately removed.';

CREATE TABLE control.item_inventory_policy (
    id                             uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                      uuid                              NOT NULL,
    company_code_id                uuid                              NOT NULL,
    item_id                        uuid                              NOT NULL,
    stocking_status                control.stocking_status_d         NOT NULL DEFAULT 'stocked',
    valuation_method               control.valuation_method_d        NOT NULL,
    lot_tracking_required          boolean                           NOT NULL DEFAULT false,
    serial_tracking_required       boolean                           NOT NULL DEFAULT false,
    effective_from                 date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_to                   date,
    metadata                       jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                         control.inventory_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                      boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at              timestamptz,
    status_changed_by              uuid,
    created_at                     timestamptz                       NOT NULL DEFAULT now(),
    created_by                     uuid                              NOT NULL,
    updated_at                     timestamptz,
    updated_by                     uuid,

    CONSTRAINT item_inventory_policy_pkey PRIMARY KEY (id),
    CONSTRAINT item_inventory_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT item_inventory_policy_coordinate_uq
        UNIQUE (tenant_id, company_code_id, item_id, effective_from),
    CONSTRAINT item_inventory_policy_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT item_inventory_policy_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT item_inventory_policy_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT item_inventory_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.item_inventory_policy IS
  'Effective-dated company/item inventory override for stocking, valuation method and tracking. UOM derives from master.item; costs, replenishment quantities and GL accounts deliberately live outside this policy.';

CREATE TABLE control.planning_model (
    id                       uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                            NOT NULL,
    company_code_id          uuid                            NOT NULL,
    ledger_book_id           uuid                            NOT NULL,
    code                     text                            NOT NULL,
    name                     text                            NOT NULL,
    description              text,
    model_type               control.planning_model_type_d   NOT NULL,
    granularity              control.planning_granularity_d  NOT NULL,
    base_currency_code       character(3)                    NOT NULL,
    fiscal_year_from         smallint                        NOT NULL,
    fiscal_year_to           smallint                        NOT NULL,
    version_number           integer                         NOT NULL DEFAULT 1,
    based_on_model_id        uuid,
    responsible_principal_id uuid,
    auto_recalculate         boolean                         NOT NULL DEFAULT false,
    lock_on_approval         boolean                         NOT NULL DEFAULT true,
    allows_overrides         boolean                         NOT NULL DEFAULT false,
    metadata                 jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    status                   control.planning_record_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                     NOT NULL DEFAULT now(),
    created_by               uuid                            NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT planning_model_pkey PRIMARY KEY (id),
    CONSTRAINT planning_model_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_model_company_id_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT planning_model_code_version_uq
        UNIQUE (tenant_id, company_code_id, code, version_number),
    CONSTRAINT planning_model_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT planning_model_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT planning_model_fiscal_range_chk CHECK (
        fiscal_year_from BETWEEN 1900 AND 9999
        AND fiscal_year_to BETWEEN fiscal_year_from AND 9999
    ),
    CONSTRAINT planning_model_version_chk CHECK (version_number >= 1),
    CONSTRAINT planning_model_no_self_base_chk
        CHECK (based_on_model_id IS NULL OR based_on_model_id <> id),
    CONSTRAINT planning_model_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT planning_model_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT planning_model_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.planning_driver (
    id                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                              NOT NULL,
    planning_model_id     uuid                              NOT NULL,
    code                  text                              NOT NULL,
    name                  text                              NOT NULL,
    description           text,
    driver_type           control.planning_driver_type_d    NOT NULL,
    aggregation_method    control.planning_aggregation_d    NOT NULL DEFAULT 'sum',
    uom_code              text,
    formula_expression_id uuid,
    is_input              boolean                           NOT NULL DEFAULT true,
    is_derived            boolean                           NOT NULL DEFAULT false,
    default_value         numeric(18,6),
    minimum_value         numeric(18,6),
    maximum_value         numeric(18,6),
    sort_order            integer                           NOT NULL DEFAULT 0,
    metadata              jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                control.planning_record_status_d  NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                       NOT NULL DEFAULT now(),
    created_by            uuid                              NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT planning_driver_pkey PRIMARY KEY (id),
    CONSTRAINT planning_driver_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_driver_model_id_uq UNIQUE (tenant_id, planning_model_id, id),
    CONSTRAINT planning_driver_code_uq UNIQUE (tenant_id, planning_model_id, code),
    CONSTRAINT planning_driver_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT planning_driver_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT planning_driver_source_chk CHECK (
        (is_input AND NOT is_derived AND formula_expression_id IS NULL)
        OR (NOT is_input AND is_derived AND formula_expression_id IS NOT NULL)
    ),
    CONSTRAINT planning_driver_range_chk CHECK (
        minimum_value IS NULL OR maximum_value IS NULL OR maximum_value >= minimum_value
    ),
    CONSTRAINT planning_driver_default_range_chk CHECK (
        default_value IS NULL
        OR (
            (minimum_value IS NULL OR default_value >= minimum_value)
            AND (maximum_value IS NULL OR default_value <= maximum_value)
        )
    ),
    CONSTRAINT planning_driver_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT planning_driver_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT planning_driver_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.planning_driver_dependency (
    id                   uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                                  NOT NULL,
    planning_model_id    uuid                                  NOT NULL,
    planning_driver_id   uuid                                  NOT NULL,
    depends_on_driver_id uuid                                  NOT NULL,
    dependency_type      control.planning_dependency_type_d     NOT NULL DEFAULT 'formula',
    sort_order           integer                               NOT NULL DEFAULT 0,
    metadata             jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz                           NOT NULL DEFAULT now(),
    created_by           uuid                                  NOT NULL,

    CONSTRAINT planning_driver_dependency_pkey PRIMARY KEY (id),
    CONSTRAINT planning_driver_dependency_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_driver_dependency_coordinate_uq
        UNIQUE (tenant_id, planning_model_id, planning_driver_id, depends_on_driver_id),
    CONSTRAINT planning_driver_dependency_no_self_chk
        CHECK (planning_driver_id <> depends_on_driver_id),
    CONSTRAINT planning_driver_dependency_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE control.planning_driver_dependency IS
  'Normalized driver dependency graph. Replaces the legacy unverifiable depends_on_drivers UUID array.';

CREATE TABLE control.budget_control_policy (
    id                            uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                     uuid        NOT NULL,
    policy_code                   text        NOT NULL,
    version_no                    integer     NOT NULL DEFAULT 1,
    name                          text        NOT NULL,
    description                   text,
    company_code_id               uuid,
    ledger_book_id                uuid,
    source_document_type          text,
    period_scope                  control.budget_period_scope_d
                                              NOT NULL DEFAULT 'fiscal_year',
    consumption_basis             control.budget_consumption_basis_d
                                              NOT NULL DEFAULT 'actuals_and_commitments',
    warn_at_percent               numeric(7,4) NOT NULL DEFAULT 80,
    block_at_percent              numeric(7,4) NOT NULL DEFAULT 100,
    override_policy_definition_id uuid,
    effective_from                date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                  date,
    supersedes_id                 uuid,
    metadata                      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                        control.finance_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                     boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at             timestamptz,
    status_changed_by             uuid,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid        NOT NULL,
    updated_at                    timestamptz,
    updated_by                    uuid,

    CONSTRAINT budget_control_policy_pkey PRIMARY KEY (id),
    CONSTRAINT budget_control_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT budget_control_policy_lineage_version_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, policy_code, company_code_id, ledger_book_id,
        source_document_type, version_no
    ),
    CONSTRAINT budget_control_policy_code_chk
        CHECK (policy_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT budget_control_policy_version_chk CHECK (version_no > 0),
    CONSTRAINT budget_control_policy_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT budget_control_policy_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT budget_control_policy_scope_chk
        CHECK (ledger_book_id IS NULL OR company_code_id IS NOT NULL),
    CONSTRAINT budget_control_policy_document_type_chk CHECK (
        source_document_type IS NULL
        OR source_document_type ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT budget_control_policy_threshold_chk CHECK (
        warn_at_percent BETWEEN 0 AND 1000
        AND block_at_percent BETWEEN warn_at_percent AND 1000
    ),
    CONSTRAINT budget_control_policy_effective_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT budget_control_policy_not_self_superseding_chk
        CHECK (supersedes_id IS NULL OR supersedes_id <> id),
    CONSTRAINT budget_control_policy_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT budget_control_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT budget_control_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.budget_control_policy IS
  'Neon-only typed budget-evaluation policy. Budget authority remains in document.budget_profile and document.budget_allocation; balances remain ledger-derived.';

COMMENT ON COLUMN control.budget_control_policy.consumption_basis IS
  'Defines which ledger evidence contributes to utilization; it does not store or duplicate balances.';

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

-- Neon fixed-asset accounting defaults.  This is the effective policy used
-- when an asset book is created; it is intentionally separate from the
-- resulting master.asset_book record.
CREATE TABLE control.asset_class_book_policy (
    id                                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                             uuid                              NOT NULL,
    company_code_id                       uuid                              NOT NULL,
    asset_class_id                        uuid                              NOT NULL,
    ledger_book_id                        uuid                              NOT NULL,
    capitalization_threshold              numeric(18,4)                     NOT NULL DEFAULT 0,
    capitalization_currency               character(3),
    effective_from                        date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_to                          date,
    depreciation_method                   master.depreciation_method_d      NOT NULL,
    useful_life_months                    integer                           NOT NULL,
    residual_value_mode                   text                              NOT NULL DEFAULT 'zero',
    residual_value_amount                 numeric(18,4),
    residual_value_pct                    numeric(9,4),
    convention                            master.depreciation_convention_d,
    prorate_basis                         master.asset_prorate_basis_d      NOT NULL DEFAULT 'monthly',
    depreciation_start_rule               text                              NOT NULL DEFAULT 'in_service_date',
    method_params                         jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    allow_manual_life_override            boolean                           NOT NULL DEFAULT false,
    allow_manual_residual_override        boolean                           NOT NULL DEFAULT false,
    allow_manual_method_override          boolean                           NOT NULL DEFAULT false,
    acquisition_posting_role_code         text,
    accum_depr_posting_role_code          text,
    depr_expense_posting_role_code        text,
    gain_loss_posting_role_code           text,
    impairment_expense_posting_role_code  text,
    impairment_reserve_posting_role_code  text,
    revaluation_surplus_posting_role_code text,
    revaluation_loss_posting_role_code    text,
    cwip_posting_role_code                text,
    class_clearing_posting_role_code      text,
    expense_low_value_posting_role_code   text,
    metadata                              jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                                shared.active_inactive_d         NOT NULL DEFAULT 'active',
    is_active                             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                     timestamptz,
    status_changed_by                     uuid,
    created_at                            timestamptz                       NOT NULL DEFAULT now(),
    created_by                            uuid                              NOT NULL,
    updated_at                            timestamptz,
    updated_by                            uuid,

    CONSTRAINT asset_class_book_policy_pkey PRIMARY KEY (id),
    CONSTRAINT asset_class_book_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT asset_class_book_policy_effective_from_uq
        UNIQUE (tenant_id, company_code_id, asset_class_id, ledger_book_id, effective_from),
    CONSTRAINT asset_class_book_policy_threshold_chk CHECK (capitalization_threshold >= 0),
    CONSTRAINT asset_class_book_policy_threshold_currency_chk CHECK (
        (capitalization_threshold = 0 AND capitalization_currency IS NULL)
        OR (capitalization_threshold > 0 AND capitalization_currency ~ '^[A-Z]{3}$')
    ),
    CONSTRAINT asset_class_book_policy_effective_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT asset_class_book_policy_life_chk CHECK (
        (depreciation_method = 'no_depreciation' AND useful_life_months = 0)
        OR (depreciation_method <> 'no_depreciation' AND useful_life_months > 0)
    ),
    CONSTRAINT asset_class_book_policy_residual_mode_chk
        CHECK (residual_value_mode IN ('zero', 'amount', 'percent')),
    CONSTRAINT asset_class_book_policy_residual_value_chk CHECK (
        (residual_value_mode = 'zero'
            AND residual_value_amount IS NULL AND residual_value_pct IS NULL)
        OR (residual_value_mode = 'amount'
            AND residual_value_amount IS NOT NULL AND residual_value_amount >= 0
            AND residual_value_pct IS NULL)
        OR (residual_value_mode = 'percent'
            AND residual_value_amount IS NULL
            AND residual_value_pct IS NOT NULL AND residual_value_pct BETWEEN 0 AND 100)
    ),
    CONSTRAINT asset_class_book_policy_convention_chk CHECK (
        depreciation_method = 'no_depreciation' OR convention IS NOT NULL
    ),
    CONSTRAINT asset_class_book_policy_start_rule_chk
        CHECK (depreciation_start_rule IN ('in_service_date', 'capitalization_date', 'next_period')),
    CONSTRAINT asset_class_book_policy_required_posting_roles_chk CHECK (
        acquisition_posting_role_code IS NOT NULL
        AND (depreciation_method = 'no_depreciation' OR (
            accum_depr_posting_role_code IS NOT NULL
            AND depr_expense_posting_role_code IS NOT NULL
        ))
    ),
    CONSTRAINT asset_class_book_policy_role_code_fmt_chk CHECK (
        COALESCE(acquisition_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(accum_depr_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(depr_expense_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(gain_loss_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(impairment_expense_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(impairment_reserve_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(revaluation_surplus_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(revaluation_loss_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(cwip_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(class_clearing_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(expense_low_value_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
    ),
    CONSTRAINT asset_class_book_policy_json_chk
        CHECK (jsonb_typeof(method_params) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT asset_class_book_policy_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT asset_class_book_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.asset_class_book_policy IS
    'Effective Neon fixed-asset accounting policy for one company, asset class and ledger book. It supplies controlled defaults for master.asset_book; it never stores asset balances or depreciation postings.';

COMMENT ON COLUMN control.asset_class_book_policy.ledger_book_id IS
    'Ledger book, not a mutable text code. The policy is valid only while that book is assigned to the company.';

COMMENT ON COLUMN control.asset_class_book_policy.method_params IS
    'Method-specific, non-secret inputs only. General policy fields must remain explicit columns.';

CREATE TABLE control.commodity_code_classification_policy (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    primary_commodity_domain_code       text        NOT NULL,
    trade_commodity_domain_code         text,
    commodity_code_required             boolean     NOT NULL DEFAULT false,
    trade_code_required                 boolean     NOT NULL DEFAULT false,
    regulated_classification_required   boolean     NOT NULL DEFAULT true,
    auto_classification_enabled         boolean     NOT NULL DEFAULT true,
    auto_crosswalk_enabled              boolean     NOT NULL DEFAULT true,
    auto_accept_confidence              numeric(5,2) NOT NULL DEFAULT 90,
    suggestion_confidence               numeric(5,2) NOT NULL DEFAULT 60,
    crosswalk_strategy                  control.commodity_crosswalk_strategy_d
                                                    NOT NULL DEFAULT 'best_match',
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              shared.active_inactive_d NOT NULL DEFAULT 'active',
    is_active                           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT commodity_code_classification_policy_pkey PRIMARY KEY (id),
    CONSTRAINT commodity_code_classification_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT commodity_code_classification_policy_tenant_uq UNIQUE (tenant_id),
    CONSTRAINT commodity_code_classification_policy_primary_domain_chk
        CHECK (primary_commodity_domain_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT commodity_code_classification_policy_trade_domain_chk CHECK (
        trade_commodity_domain_code IS NULL
        OR (
            trade_commodity_domain_code ~ '^[a-z][a-z0-9_.-]{1,62}$'
            AND trade_commodity_domain_code <> primary_commodity_domain_code
        )
    ),
    CONSTRAINT commodity_code_classification_policy_trade_required_chk
        CHECK (NOT trade_code_required OR trade_commodity_domain_code IS NOT NULL),
    CONSTRAINT commodity_code_classification_policy_crosswalk_chk CHECK (
        (auto_crosswalk_enabled AND trade_commodity_domain_code IS NOT NULL)
        OR (
            NOT auto_crosswalk_enabled
            AND crosswalk_strategy = 'exact_only'
        )
    ),
    CONSTRAINT commodity_code_classification_policy_ai_chk CHECK (
        crosswalk_strategy <> 'ai_assisted' OR auto_classification_enabled
    ),
    CONSTRAINT commodity_code_classification_policy_confidence_chk CHECK (
        suggestion_confidence BETWEEN 0 AND 100
        AND auto_accept_confidence BETWEEN suggestion_confidence AND 100
    ),
    CONSTRAINT commodity_code_classification_policy_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT commodity_code_classification_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT commodity_code_classification_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.commodity_code_classification_policy IS
  'One Neon tenant policy governing preferred commodity-code domains, required classifications, automatic classification, crosswalk use and confidence thresholds. Actual category/product/item assignments remain authoritative master data.';

-- Category intent eligibility and inventory defaults.  Direct accounting
-- coordinates are intentionally excluded; account determination resolves
-- through accounting profiles and posting-role account maps.
CREATE TABLE control.commodity_category_buy_policy (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    commodity_category_id               uuid        NOT NULL,
    company_code_id                     uuid,
    company_code_supplier_profile_id    uuid,
    business_intent_id                  uuid        NOT NULL,
    is_default                          boolean     NOT NULL DEFAULT false,
    is_selectable                       boolean     NOT NULL DEFAULT true,
    effective_from                      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                        date,
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              control.commodity_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT cc_buy_policy_pkey PRIMARY KEY (id),
    CONSTRAINT cc_buy_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cc_buy_policy_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, commodity_category_id, company_code_id,
        company_code_supplier_profile_id, business_intent_id, effective_from
    ),
    CONSTRAINT cc_buy_policy_scope_chk CHECK (
        company_code_supplier_profile_id IS NULL OR company_code_id IS NOT NULL
    ),
    CONSTRAINT cc_buy_policy_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT cc_buy_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cc_buy_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cc_buy_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.commodity_category_buy_policy IS
  'Allowed and default purchasing intents for a commodity category. Resolution replaces the complete intent set at supplier-company, then company, then tenant scope; direct GL, tax, asset and budget defaults are excluded.';

CREATE TABLE control.commodity_category_sell_policy (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    commodity_category_id               uuid        NOT NULL,
    company_code_id                     uuid,
    company_code_customer_profile_id    uuid,
    business_intent_id                  uuid        NOT NULL,
    is_default                          boolean     NOT NULL DEFAULT false,
    is_selectable                       boolean     NOT NULL DEFAULT true,
    effective_from                      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                        date,
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              control.commodity_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT cc_sell_policy_pkey PRIMARY KEY (id),
    CONSTRAINT cc_sell_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cc_sell_policy_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, commodity_category_id, company_code_id,
        company_code_customer_profile_id, business_intent_id, effective_from
    ),
    CONSTRAINT cc_sell_policy_scope_chk CHECK (
        company_code_customer_profile_id IS NULL OR company_code_id IS NOT NULL
    ),
    CONSTRAINT cc_sell_policy_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT cc_sell_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cc_sell_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cc_sell_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.commodity_category_sell_policy IS
  'Allowed and default sales intents for a commodity category. Resolution replaces the complete intent set at customer-company, then company, then tenant scope; revenue, deferral, COGS and tax determination remain in finance control.';

CREATE TABLE control.commodity_category_inventory_policy (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    commodity_category_id       uuid        NOT NULL,
    company_code_id             uuid,
    stocking_status             control.stocking_status_d NOT NULL DEFAULT 'stocked',
    valuation_method            control.valuation_method_d,
    lot_tracking_required       boolean     NOT NULL DEFAULT false,
    serial_tracking_required    boolean     NOT NULL DEFAULT false,
    effective_from              date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                date,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      control.commodity_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                   boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT cc_inventory_policy_pkey PRIMARY KEY (id),
    CONSTRAINT cc_inventory_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cc_inventory_policy_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, commodity_category_id, company_code_id, effective_from
    ),
    CONSTRAINT cc_inventory_policy_valuation_chk CHECK (
        stocking_status <> 'stocked' OR valuation_method IS NOT NULL
    ),
    CONSTRAINT cc_inventory_policy_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT cc_inventory_policy_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cc_inventory_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cc_inventory_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.commodity_category_inventory_policy IS
  'Tenant or company category defaults for stocking, valuation method and tracking. Company-item policy overrides this row; costs, replenishment quantities, UOM and GL accounts are excluded.';

CREATE TABLE control.procurement_match_tolerance_policy (
    id                                            uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                                     uuid        NOT NULL,
    company_code_id                               uuid,
    match_type                                    control.procurement_match_type_d NOT NULL,
    ordered_quantity_over_tolerance_percent       numeric(9,4) NOT NULL DEFAULT 0,
    received_quantity_over_tolerance_percent      numeric(9,4) NOT NULL DEFAULT 0,
    unit_price_variance_percent                   numeric(9,4) NOT NULL DEFAULT 0,
    effective_from                                date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                                  date,
    metadata                                      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                                        control.finance_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                                     boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                             timestamptz,
    status_changed_by                             uuid,
    created_at                                    timestamptz NOT NULL DEFAULT now(),
    created_by                                    uuid        NOT NULL,
    updated_at                                    timestamptz,
    updated_by                                    uuid,

    CONSTRAINT procurement_match_tolerance_policy_pkey PRIMARY KEY (id),
    CONSTRAINT procurement_match_tolerance_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT procurement_match_tolerance_policy_coordinate_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, company_code_id, match_type, effective_from),
    CONSTRAINT procurement_match_tolerance_policy_ordered_qty_chk
        CHECK (ordered_quantity_over_tolerance_percent BETWEEN 0 AND 100),
    CONSTRAINT procurement_match_tolerance_policy_received_qty_chk
        CHECK (received_quantity_over_tolerance_percent BETWEEN 0 AND 100),
    CONSTRAINT procurement_match_tolerance_policy_price_chk
        CHECK (unit_price_variance_percent BETWEEN 0 AND 100),
    CONSTRAINT procurement_match_tolerance_policy_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT procurement_match_tolerance_policy_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT procurement_match_tolerance_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT procurement_match_tolerance_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.procurement_match_tolerance_policy IS
  'Complete two-way or three-way procurement matching tolerance set. Company scope replaces tenant scope as one unit; values are percentages and no unused absolute-amount tolerance is stored.';

CREATE TABLE control.fx_policy (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    company_code_id                     uuid,
    ledger_book_id                      uuid,
    transaction_context                 text        NOT NULL DEFAULT 'general',
    effective_from                      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                        date,
    default_rate_type                   control.fx_rate_type_d NOT NULL DEFAULT 'SPOT',
    revaluation_rate_type               control.fx_rate_type_d NOT NULL DEFAULT 'PERIOD_END',
    pivot_currency_code                 character(3),
    allow_inverse                       boolean     NOT NULL DEFAULT true,
    allow_triangulation                 boolean     NOT NULL DEFAULT false,
    preferred_source_codes              text[]      NOT NULL DEFAULT ARRAY[]::text[],
    max_rate_age_days                   integer,
    missing_rate_behavior               control.fx_missing_rate_behavior_d NOT NULL DEFAULT 'block',
    manual_override_allowed             boolean     NOT NULL DEFAULT false,
    manual_override_approval_required   boolean     NOT NULL DEFAULT false,
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              control.fx_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    version_no                          integer     NOT NULL DEFAULT 1,
    supersedes_id                       uuid,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT fx_policy_pkey PRIMARY KEY (id),
    CONSTRAINT fx_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fx_policy_lineage_version_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, company_code_id, ledger_book_id, transaction_context, version_no
    ),
    CONSTRAINT fx_policy_scope_chk
        CHECK (ledger_book_id IS NULL OR company_code_id IS NOT NULL),
    CONSTRAINT fx_policy_context_chk
        CHECK (transaction_context ~ '^[a-z][a-z0-9_.-]{0,62}$'),
    CONSTRAINT fx_policy_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT fx_policy_triangulation_chk
        CHECK (NOT allow_triangulation OR pivot_currency_code IS NOT NULL),
    CONSTRAINT fx_policy_rate_age_chk
        CHECK (max_rate_age_days IS NULL OR max_rate_age_days >= 0),
    CONSTRAINT fx_policy_manual_approval_chk
        CHECK (NOT manual_override_approval_required OR manual_override_allowed),
    CONSTRAINT fx_policy_manual_behavior_chk CHECK (
        missing_rate_behavior <> 'manual_with_approval'
        OR (manual_override_allowed AND manual_override_approval_required)
    ),
    CONSTRAINT fx_policy_sources_shape_chk CHECK (
        COALESCE(array_ndims(preferred_source_codes), 1) = 1
        AND array_position(preferred_source_codes, NULL) IS NULL
    ),
    CONSTRAINT fx_policy_version_chk CHECK (version_no > 0),
    CONSTRAINT fx_policy_not_self_superseding_chk
        CHECK (supersedes_id IS NULL OR supersedes_id <> id),
    CONSTRAINT fx_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT fx_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT fx_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.fx_policy IS
  'Append-oriented Neon FX resolution policy. Resolution is exact context before general, then Company+Book, Company and Tenant. Scope precedence is deterministic; overlapping active rows are prohibited rather than ranked by an arbitrary priority.';

COMMENT ON COLUMN control.fx_policy.preferred_source_codes IS
  'Ordered source-code preference. Empty means any eligible source; credentials and connector endpoints are stored elsewhere.';

CREATE TABLE control.dimension_policy (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    policy_code                         text        NOT NULL,
    version_no                          integer     NOT NULL DEFAULT 1,
    description                         text,
    dimension_type_id                   uuid        NOT NULL,
    company_code_id                     uuid,
    scope_account_class                 master.gl_account_class_d,
    scope_account_id                    uuid,
    scope_subledger_type                master.accounting_subledger_d,
    scope_book_id                       uuid,
    scope_document_type                 text,
    enforcement                         control.dimension_policy_enforcement_d
                                                    NOT NULL DEFAULT 'optional',
    depends_on_dimension_type_id        uuid,
    mutually_exclusive_dimension_type_id uuid,
    effective_from                      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                        date,
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              control.finance_policy_status_d
                                                    NOT NULL DEFAULT 'draft',
    is_active                           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    supersedes_id                       uuid,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT dimension_policy_pkey PRIMARY KEY (id),
    CONSTRAINT dimension_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT dimension_policy_tenant_type_id_uq
        UNIQUE (tenant_id, id, dimension_type_id),
    CONSTRAINT dimension_policy_lineage_version_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id,
        policy_code,
        company_code_id,
        scope_account_class,
        scope_account_id,
        scope_subledger_type,
        scope_book_id,
        scope_document_type,
        version_no
    ),
    CONSTRAINT dimension_policy_code_chk CHECK (
        policy_code ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT dimension_policy_version_chk CHECK (version_no > 0),
    CONSTRAINT dimension_policy_description_chk CHECK (
        description IS NULL OR btrim(description) <> ''
    ),
    CONSTRAINT dimension_policy_document_type_chk CHECK (
        scope_document_type IS NULL
        OR scope_document_type ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT dimension_policy_dependency_self_chk CHECK (
        depends_on_dimension_type_id IS NULL
        OR depends_on_dimension_type_id <> dimension_type_id
    ),
    CONSTRAINT dimension_policy_exclusion_self_chk CHECK (
        mutually_exclusive_dimension_type_id IS NULL
        OR mutually_exclusive_dimension_type_id <> dimension_type_id
    ),
    CONSTRAINT dimension_policy_dependency_exclusion_chk CHECK (
        depends_on_dimension_type_id IS NULL
        OR mutually_exclusive_dimension_type_id IS NULL
        OR depends_on_dimension_type_id <> mutually_exclusive_dimension_type_id
    ),
    CONSTRAINT dimension_policy_effective_range_chk CHECK (
        effective_to IS NULL OR effective_to >= effective_from
    ),
    CONSTRAINT dimension_policy_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT dimension_policy_not_self_superseding_chk
        CHECK (supersedes_id IS NULL OR supersedes_id <> id),
    CONSTRAINT dimension_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT dimension_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.dimension_policy IS
  'Neon-only tenant accounting-dimension validation policy. It governs required, optional, or forbidden coordinates; derivation and fixed-value stamping are outside this contract.';

COMMENT ON COLUMN control.dimension_policy.policy_code IS
  'Stable tenant policy-family identifier. Historical versions share the same code and are linked through supersedes_id.';

COMMENT ON COLUMN control.dimension_policy.enforcement IS
  'Validation-only behavior: required, optional, or forbidden.';

CREATE TABLE control.dimension_policy_allowed_value (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    policy_id           uuid        NOT NULL,
    dimension_type_id   uuid        NOT NULL,
    dimension_value_id  uuid        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT dimension_policy_allowed_value_pkey PRIMARY KEY (id),
    CONSTRAINT dimension_policy_allowed_value_tenant_id_uq
        UNIQUE (tenant_id, id),
    CONSTRAINT dimension_policy_allowed_value_membership_uq
        UNIQUE (tenant_id, policy_id, dimension_value_id)
);

COMMENT ON TABLE control.dimension_policy_allowed_value IS
  'Tenant-safe child membership restricting one dimension policy to explicitly allowed values. Absence of children means every otherwise valid value of the policy dimension is allowed.';

-- Neon tax determination policy. Tax groups are effective-dated revisions;
-- there is deliberately no control.tax_group_version table.

CREATE TABLE control.tax_rate_schedule (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    jurisdiction_id         uuid        NOT NULL,
    tax_type_id             uuid        NOT NULL,
    tax_direction           control.tax_direction_d NOT NULL,
    component_code          text        NOT NULL,
    rate_kind               control.tax_rate_kind_d NOT NULL DEFAULT 'PERCENT',
    rate_value              numeric(18,6) NOT NULL,
    rate_currency           character(3),
    rate_uom_code           text,
    recoverability_mode     control.tax_recoverability_d NOT NULL DEFAULT 'NONE',
    recoverability_percent  numeric(5,2),
    reverse_charge_mode     control.tax_reverse_charge_d NOT NULL DEFAULT 'NONE',
    calculation_basis       control.tax_calculation_basis_d NOT NULL DEFAULT 'LINE_NET',
    wht_basis               control.tax_wht_basis_d,
    description             text,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  control.tax_policy_status_d NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tax_rate_schedule_pkey PRIMARY KEY (id),
    CONSTRAINT tax_rate_schedule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_rate_schedule_component_code_chk
        CHECK (component_code ~ '^[A-Z][A-Z0-9_.-]{0,62}$'),
    CONSTRAINT tax_rate_schedule_rate_chk CHECK (
        (rate_kind = 'PERCENT' AND rate_value BETWEEN 0 AND 100)
        OR (rate_kind IN ('FIXED', 'PER_UNIT') AND rate_value >= 0)
    ),
    CONSTRAINT tax_rate_schedule_unit_chk CHECK (
        (rate_kind = 'PERCENT' AND rate_currency IS NULL AND rate_uom_code IS NULL)
        OR (rate_kind = 'FIXED' AND rate_currency IS NOT NULL AND rate_uom_code IS NULL)
        OR (rate_kind = 'PER_UNIT' AND rate_currency IS NOT NULL AND rate_uom_code IS NOT NULL)
    ),
    CONSTRAINT tax_rate_schedule_recoverability_chk CHECK (
        (recoverability_mode = 'PARTIAL' AND recoverability_percent BETWEEN 0 AND 100)
        OR (recoverability_mode <> 'PARTIAL' AND recoverability_percent IS NULL)
    ),
    CONSTRAINT tax_rate_schedule_period_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT tax_rate_schedule_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT tax_rate_schedule_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tax_rate_schedule_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tax_rate_schedule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.tax_group (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    group_kind              control.tax_group_kind_d NOT NULL,
    jurisdiction_id         uuid        NOT NULL,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    is_compound             boolean     NOT NULL DEFAULT false,
    rounding_rule_id        uuid        NOT NULL,
    supersedes_tax_group_id uuid,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  control.tax_policy_status_d NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tax_group_pkey PRIMARY KEY (id),
    CONSTRAINT tax_group_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_group_revision_uq UNIQUE (tenant_id, code, effective_from),
    CONSTRAINT tax_group_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{0,62}$'),
    CONSTRAINT tax_group_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT tax_group_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT tax_group_period_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT tax_group_not_self_superseding_chk
        CHECK (supersedes_tax_group_id IS NULL OR supersedes_tax_group_id <> id),
    CONSTRAINT tax_group_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tax_group_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tax_group_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.tax_group IS
  'One effective-dated tax-group revision. Revisions share tenant/code and link through supersedes_tax_group_id; no separate version table exists.';

CREATE TABLE control.tax_group_component (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    tax_group_id            uuid        NOT NULL,
    tax_rate_schedule_id    uuid        NOT NULL,
    calculation_seq         smallint    NOT NULL,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,

    CONSTRAINT tax_group_component_pkey PRIMARY KEY (id),
    CONSTRAINT tax_group_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_group_component_sequence_uq UNIQUE (tenant_id, tax_group_id, calculation_seq),
    CONSTRAINT tax_group_component_schedule_uq UNIQUE (tenant_id, tax_group_id, tax_rate_schedule_id),
    CONSTRAINT tax_group_component_seq_chk CHECK (calculation_seq > 0),
    CONSTRAINT tax_group_component_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE control.tax_resolution_rule (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    code                                text        NOT NULL,
    name                                text        NOT NULL,
    description                         text,
    scope_company_code_id               uuid,
    scope_transaction_direction         control.tax_transaction_direction_d,
    scope_billto_jurisdiction_id        uuid,
    scope_shipto_jurisdiction_id        uuid,
    scope_billfrom_jurisdiction_id      uuid,
    scope_shipfrom_jurisdiction_id      uuid,
    scope_counterparty_tax_status       control.tax_counterparty_status_d,
    scope_commodity_category_id         uuid,
    scope_supplier_industry_code        text,
    scope_doc_entity_codes              text[]      NOT NULL DEFAULT ARRAY[]::text[],
    requires_shipto_shipfrom_match      boolean     NOT NULL DEFAULT false,
    requires_shipto_shipfrom_mismatch   boolean     NOT NULL DEFAULT false,
    resolved_tax_group_id               uuid        NOT NULL,
    priority                            smallint    NOT NULL DEFAULT 100,
    effective_from                      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                        date,
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              control.tax_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT tax_resolution_rule_pkey PRIMARY KEY (id),
    CONSTRAINT tax_resolution_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_resolution_rule_revision_uq UNIQUE (tenant_id, code, effective_from),
    CONSTRAINT tax_resolution_rule_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{0,62}$'),
    CONSTRAINT tax_resolution_rule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT tax_resolution_rule_priority_chk CHECK (priority BETWEEN 0 AND 1000),
    CONSTRAINT tax_resolution_rule_match_chk
        CHECK (NOT (requires_shipto_shipfrom_match AND requires_shipto_shipfrom_mismatch)),
    CONSTRAINT tax_resolution_rule_period_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT tax_resolution_rule_entity_codes_chk CHECK (
        COALESCE(array_ndims(scope_doc_entity_codes), 1) = 1
        AND array_position(scope_doc_entity_codes, NULL) IS NULL
    ),
    CONSTRAINT tax_resolution_rule_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tax_resolution_rule_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tax_resolution_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.wht_threshold_config (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    company_code_id     uuid,
    jurisdiction_id     uuid        NOT NULL,
    tax_type_id         uuid        NOT NULL,
    section_code        text,
    threshold_amount    numeric(18,4) NOT NULL,
    threshold_currency  character(3) NOT NULL,
    threshold_mode      control.wht_threshold_mode_d NOT NULL DEFAULT 'cumulative',
    reset_period        control.wht_reset_period_d NOT NULL DEFAULT 'fiscal_year',
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to        date,
    description         text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              control.tax_policy_status_d NOT NULL DEFAULT 'draft',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT wht_threshold_config_pkey PRIMARY KEY (id),
    CONSTRAINT wht_threshold_config_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT wht_threshold_config_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, company_code_id, jurisdiction_id, tax_type_id,
        section_code, threshold_mode, effective_from
    ),
    CONSTRAINT wht_threshold_config_amount_chk CHECK (threshold_amount > 0),
    CONSTRAINT wht_threshold_config_section_chk
        CHECK (section_code IS NULL OR btrim(section_code) <> ''),
    CONSTRAINT wht_threshold_config_period_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT wht_threshold_config_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT wht_threshold_config_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT wht_threshold_config_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT wht_threshold_config_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Clean accounting-determination aggregate. No POC acct_profile_* tables,
-- numeric versions, free-form formulas, alias tables or supplier overrides.

CREATE TABLE control.accounting_profile_policy (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    accounting_profile_id   uuid        NOT NULL,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    supersedes_policy_id    uuid,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  control.accounting_policy_status_d NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT accounting_profile_policy_pkey PRIMARY KEY (id),
    CONSTRAINT accounting_profile_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT accounting_profile_policy_revision_uq
        UNIQUE (tenant_id, accounting_profile_id, effective_from),
    CONSTRAINT accounting_profile_policy_period_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT accounting_profile_policy_successor_chk
        CHECK (supersedes_policy_id IS NULL OR supersedes_policy_id <> id),
    CONSTRAINT accounting_profile_policy_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT accounting_profile_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT accounting_profile_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.accounting_profile_policy IS
  'Effective-dated aggregate definition for a stable master.accounting_profile. Children inherit lifecycle/effectivity and become immutable when this row is activated.';

CREATE TABLE control.accounting_profile_event (
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,
    accounting_profile_policy_id    uuid        NOT NULL,
    event_code                      text        NOT NULL,
    journal_action                  control.accounting_journal_action_d NOT NULL DEFAULT 'post',
    reverses_event_code             text,
    auto_reverse                    boolean     NOT NULL DEFAULT false,
    auto_reverse_period_offset      smallint,
    sequence_no                     smallint    NOT NULL DEFAULT 0,
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,

    CONSTRAINT accounting_profile_event_pkey PRIMARY KEY (id),
    CONSTRAINT accounting_profile_event_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT accounting_profile_event_code_uq
        UNIQUE (tenant_id, accounting_profile_policy_id, event_code),
    CONSTRAINT accounting_profile_event_code_chk
        CHECK (event_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT accounting_profile_event_reverse_code_chk
        CHECK (reverses_event_code IS NULL OR reverses_event_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT accounting_profile_event_reverse_chk CHECK (
        (journal_action = 'reverse' AND reverses_event_code IS NOT NULL)
        OR (journal_action <> 'reverse' AND reverses_event_code IS NULL)
    ),
    CONSTRAINT accounting_profile_event_auto_reverse_chk CHECK (
        (auto_reverse AND journal_action = 'post' AND auto_reverse_period_offset > 0)
        OR (NOT auto_reverse AND auto_reverse_period_offset IS NULL)
    ),
    CONSTRAINT accounting_profile_event_sequence_chk CHECK (sequence_no >= 0),
    CONSTRAINT accounting_profile_event_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE control.accounting_profile_entry (
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,
    accounting_profile_event_id     uuid        NOT NULL,
    line_no                         smallint    NOT NULL,
    description                     text        NOT NULL,
    posting_side                    control.accounting_posting_side_d NOT NULL,
    posting_role_code               text        NOT NULL,
    amount_source                   control.accounting_amount_source_d NOT NULL,
    condition_type_id               uuid,
    is_balancing_line               boolean     NOT NULL DEFAULT false,
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,

    CONSTRAINT accounting_profile_entry_pkey PRIMARY KEY (id),
    CONSTRAINT accounting_profile_entry_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT accounting_profile_entry_line_uq
        UNIQUE (tenant_id, accounting_profile_event_id, line_no),
    CONSTRAINT accounting_profile_entry_line_chk CHECK (line_no > 0),
    CONSTRAINT accounting_profile_entry_description_chk CHECK (btrim(description) <> ''),
    CONSTRAINT accounting_profile_entry_role_chk
        CHECK (posting_role_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT accounting_profile_entry_condition_chk CHECK (
        (amount_source = 'pricing_component' AND condition_type_id IS NOT NULL)
        OR (amount_source <> 'pricing_component' AND condition_type_id IS NULL)
    ),
    CONSTRAINT accounting_profile_entry_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE control.accounting_profile_assignment (
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,
    company_code_id                 uuid,
    business_intent_id              uuid,
    flow_code                       text,
    document_type_code              text,
    accounting_profile_policy_id    uuid        NOT NULL,
    effective_from                  date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                    date,
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                          control.accounting_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                       boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT accounting_profile_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT accounting_profile_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT accounting_profile_assignment_revision_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, company_code_id, business_intent_id, flow_code,
        document_type_code, effective_from
    ),
    CONSTRAINT accounting_profile_assignment_flow_chk
        CHECK (flow_code IS NULL OR flow_code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT accounting_profile_assignment_document_chk
        CHECK (document_type_code IS NULL OR document_type_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT accounting_profile_assignment_period_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT accounting_profile_assignment_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT accounting_profile_assignment_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT accounting_profile_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.accounting_profile_assignment IS
  'Deterministic company/intent/flow/document routing. Specificity is computed from populated coordinates; equal-specificity ambiguity is an error, never resolved by arbitrary priority.';

CREATE TABLE control.posting_role_account_assignment (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    company_code_id         uuid        NOT NULL,
    ledger_book_id          uuid        NOT NULL,
    posting_role_code       text        NOT NULL,
    gl_account_id           uuid        NOT NULL,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    supersedes_assignment_id uuid,
    description             text,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  control.accounting_policy_status_d NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT posting_role_account_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT posting_role_account_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT posting_role_account_assignment_revision_uq UNIQUE (
        tenant_id, company_code_id, ledger_book_id, posting_role_code, effective_from
    ),
    CONSTRAINT posting_role_account_assignment_role_chk
        CHECK (posting_role_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT posting_role_account_assignment_period_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT posting_role_account_assignment_successor_chk
        CHECK (supersedes_assignment_id IS NULL OR supersedes_assignment_id <> id),
    CONSTRAINT posting_role_account_assignment_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT posting_role_account_assignment_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT posting_role_account_assignment_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT posting_role_account_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cross_book_posting_policy (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    company_code_id             uuid        NOT NULL,
    code                        text        NOT NULL,
    name                        text        NOT NULL,
    description                 text,
    source_book_id              uuid        NOT NULL,
    target_book_id              uuid        NOT NULL,
    scope_document_type_code    text,
    scope_business_intent_id    uuid,
    posting_mode                control.cross_book_posting_mode_d NOT NULL DEFAULT 'mirror',
    recognition_timing          control.cross_book_recognition_d NOT NULL DEFAULT 'simultaneous',
    recognition_lag_periods     smallint,
    effective_from              date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                date,
    supersedes_policy_id        uuid,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      control.accounting_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                   boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT cross_book_posting_policy_pkey PRIMARY KEY (id),
    CONSTRAINT cross_book_posting_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cross_book_posting_policy_revision_uq
        UNIQUE (tenant_id, company_code_id, code, effective_from),
    CONSTRAINT cross_book_posting_policy_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT cross_book_posting_policy_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT cross_book_posting_policy_books_chk CHECK (source_book_id <> target_book_id),
    CONSTRAINT cross_book_posting_policy_document_chk
        CHECK (scope_document_type_code IS NULL OR scope_document_type_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT cross_book_posting_policy_recognition_chk CHECK (
        (recognition_timing = 'simultaneous' AND recognition_lag_periods IS NULL)
        OR (recognition_timing = 'deferred' AND recognition_lag_periods > 0)
    ),
    CONSTRAINT cross_book_posting_policy_period_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT cross_book_posting_policy_successor_chk
        CHECK (supersedes_policy_id IS NULL OR supersedes_policy_id <> id),
    CONSTRAINT cross_book_posting_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cross_book_posting_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cross_book_posting_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cross_book_account_assignment (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    cross_book_posting_policy_id uuid       NOT NULL,
    source_gl_account_id        uuid        NOT NULL,
    target_gl_account_id        uuid        NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,

    CONSTRAINT cross_book_account_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT cross_book_account_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cross_book_account_assignment_source_uq
        UNIQUE (tenant_id, cross_book_posting_policy_id, source_gl_account_id),
    CONSTRAINT cross_book_account_assignment_accounts_chk
        CHECK (source_gl_account_id <> target_gl_account_id)
);

CREATE TABLE control.fiscal_calendar_config (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    calendar_type           control.fiscal_calendar_type_d
                                        NOT NULL DEFAULT 'monthly',
    version_no              integer     NOT NULL DEFAULT 1,
    fiscal_year_label_rule  control.fiscal_year_label_rule_d
                                        NOT NULL DEFAULT 'start_year',
    year_start_rule         control.fiscal_year_start_rule_d
                                        NOT NULL DEFAULT 'fixed_date',
    anchor_month            smallint    NOT NULL DEFAULT 1,
    anchor_day              smallint    NOT NULL DEFAULT 1,
    week_start_day          smallint    NOT NULL DEFAULT 1,
    periods_per_year        smallint    NOT NULL DEFAULT 12,
    leap_week_rule          control.fiscal_leap_week_rule_d
                                        NOT NULL DEFAULT 'none',
    supersedes_id           uuid,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  control.fiscal_calendar_status_d
                                        NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT fiscal_calendar_config_pkey PRIMARY KEY (id),
    CONSTRAINT fiscal_calendar_config_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fiscal_calendar_config_code_version_uq
        UNIQUE (tenant_id, code, version_no),
    CONSTRAINT fiscal_calendar_config_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT fiscal_calendar_config_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT fiscal_calendar_config_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT fiscal_calendar_config_version_chk CHECK (version_no > 0),
    CONSTRAINT fiscal_calendar_config_anchor_month_chk
        CHECK (anchor_month BETWEEN 1 AND 12),
    CONSTRAINT fiscal_calendar_config_anchor_day_chk
        CHECK (anchor_day BETWEEN 1 AND 31),
    CONSTRAINT fiscal_calendar_config_weekday_chk
        CHECK (week_start_day BETWEEN 1 AND 7),
    CONSTRAINT fiscal_calendar_config_period_count_chk
        CHECK (periods_per_year BETWEEN 1 AND 16),
    CONSTRAINT fiscal_calendar_config_not_self_superseding_chk
        CHECK (supersedes_id IS NULL OR supersedes_id <> id),
    CONSTRAINT fiscal_calendar_config_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT fiscal_calendar_config_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT fiscal_calendar_config_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.fiscal_calendar_config IS
  'Neon-only versioned fiscal-calendar definition. Fiscal-year applicability belongs to company_fiscal_calendar_assignment; activated versions are immutable.';

CREATE TABLE control.fiscal_calendar_period_rule (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    fiscal_calendar_config_id   uuid        NOT NULL,
    sequence_no                 smallint    NOT NULL,
    period_number               smallint    NOT NULL,
    period_type                 master.fiscal_period_type_d
                                            NOT NULL DEFAULT 'normal',
    name_template               text        NOT NULL DEFAULT 'Period {period}',
    duration_unit               control.fiscal_rule_duration_unit_d
                                            NOT NULL DEFAULT 'month',
    duration_value              smallint    NOT NULL DEFAULT 1,
    anchor                      control.fiscal_rule_anchor_d
                                            NOT NULL DEFAULT 'sequence',
    quarter_number              smallint,
    absorbs_leap_week           boolean     NOT NULL DEFAULT false,
    sort_order                  smallint    NOT NULL DEFAULT 0,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,

    CONSTRAINT fiscal_calendar_period_rule_pkey PRIMARY KEY (id),
    CONSTRAINT fiscal_calendar_period_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fiscal_calendar_period_rule_sequence_uq
        UNIQUE (tenant_id, fiscal_calendar_config_id, sequence_no),
    CONSTRAINT fiscal_calendar_period_rule_number_uq
        UNIQUE (tenant_id, fiscal_calendar_config_id, period_number),
    CONSTRAINT fiscal_calendar_period_rule_sequence_chk
        CHECK (sequence_no BETWEEN 0 AND 99),
    CONSTRAINT fiscal_calendar_period_rule_number_chk
        CHECK (period_number BETWEEN 0 AND 99),
    CONSTRAINT fiscal_calendar_period_rule_type_number_chk CHECK (
        (period_type = 'opening' AND period_number = 0)
        OR (period_type = 'normal' AND period_number BETWEEN 1 AND 16)
        OR (period_type IN ('adjustment', 'closing') AND period_number BETWEEN 1 AND 99)
    ),
    CONSTRAINT fiscal_calendar_period_rule_name_chk
        CHECK (btrim(name_template) <> ''),
    CONSTRAINT fiscal_calendar_period_rule_duration_chk
        CHECK (duration_value BETWEEN 1 AND 53),
    CONSTRAINT fiscal_calendar_period_rule_point_chk
        CHECK (duration_unit <> 'point' OR duration_value = 1),
    CONSTRAINT fiscal_calendar_period_rule_anchor_chk CHECK (
        (period_type = 'normal' AND anchor = 'sequence')
        OR (period_type = 'opening' AND anchor = 'year_start')
        OR (period_type IN ('adjustment', 'closing') AND anchor IN ('sequence', 'year_end'))
    ),
    CONSTRAINT fiscal_calendar_period_rule_quarter_chk
        CHECK (quarter_number IS NULL OR quarter_number BETWEEN 1 AND 4),
    CONSTRAINT fiscal_calendar_period_rule_leap_chk CHECK (
        NOT absorbs_leap_week
        OR (period_type = 'normal' AND duration_unit = 'week')
    ),
    CONSTRAINT fiscal_calendar_period_rule_sort_chk CHECK (sort_order >= 0),
    CONSTRAINT fiscal_calendar_period_rule_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE control.fiscal_calendar_period_rule IS
  'Composition child containing the ordered construction rules of one fiscal-calendar version. Membership is mutable only while the parent is draft.';

CREATE TABLE control.mesh_business_partner_profile_inbox (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    event_id                    uuid        NOT NULL,
    event_type                  text        NOT NULL,
    source_tenant_id            uuid        NOT NULL,
    source_network_account_id   uuid        NOT NULL,
    recipient_network_account_id uuid       NOT NULL,
    network_relationship_id     uuid        NOT NULL,
    publication_id              uuid        NOT NULL,
    publication_version         integer     NOT NULL,
    lifecycle_version           integer     NOT NULL,
    schema_code                 text        NOT NULL,
    schema_version              integer     NOT NULL,
    field_set_code              text        NOT NULL,
    payload_hash                text        NOT NULL,
    envelope_json               jsonb       NOT NULL,
    envelope_hash               text        NOT NULL,
    occurred_at                 timestamptz NOT NULL,
    received_at                 timestamptz NOT NULL DEFAULT clock_timestamp(),
    received_by                 uuid        NOT NULL,

    CONSTRAINT mesh_bp_profile_inbox_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bp_profile_inbox_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_bp_profile_inbox_event_uq UNIQUE (tenant_id, event_id),
    CONSTRAINT mesh_bp_profile_inbox_participants_chk CHECK (tenant_id <> source_tenant_id),
    CONSTRAINT mesh_bp_profile_inbox_event_type_chk CHECK (event_type IN ('business_partner.profile_publication.published','business_partner.profile_publication.withdrawn')),
    CONSTRAINT mesh_bp_profile_inbox_version_chk CHECK (publication_version >= 1 AND lifecycle_version >= 1 AND schema_version >= 1),
    CONSTRAINT mesh_bp_profile_inbox_field_set_chk CHECK (field_set_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT mesh_bp_profile_inbox_payload_hash_chk CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT mesh_bp_profile_inbox_envelope_chk CHECK (jsonb_typeof(envelope_json) = 'object' AND pg_column_size(envelope_json) <= 524288),
    CONSTRAINT mesh_bp_profile_inbox_envelope_hash_chk CHECK (envelope_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE control.mesh_business_partner_profile_processing_attempt (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    inbox_event_id  uuid        NOT NULL,
    attempt_no      integer     NOT NULL,
    trigger_kind    text        NOT NULL,
    disposition     text        NOT NULL,
    reason_code     text,
    details         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    processed_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    processed_by    uuid        NOT NULL,

    CONSTRAINT mesh_bp_profile_attempt_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bp_profile_attempt_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_bp_profile_attempt_number_uq UNIQUE (tenant_id, inbox_event_id, attempt_no),
    CONSTRAINT mesh_bp_profile_attempt_number_chk CHECK (attempt_no >= 1),
    CONSTRAINT mesh_bp_profile_attempt_trigger_chk CHECK (trigger_kind IN ('delivery','replay')),
    CONSTRAINT mesh_bp_profile_attempt_disposition_chk CHECK (disposition IN ('applied','duplicate','stale','quarantined')),
    CONSTRAINT mesh_bp_profile_attempt_reason_chk CHECK ((disposition = 'applied' AND reason_code IS NULL) OR (disposition <> 'applied' AND reason_code ~ '^[A-Z][A-Z0-9_]{2,95}$')),
    CONSTRAINT mesh_bp_profile_attempt_details_chk CHECK (jsonb_typeof(details) = 'object' AND pg_column_size(details) <= 32768)
);

-- Immutable MESH delivery evidence for external-workforce claims.  Payload
-- bodies and protected receipts remain in the governed content transport;
-- this inbox stores only the coordinates required for validation, replay and
-- idempotent materialization into NEON document aggregates.
CREATE TABLE control.mesh_workforce_claim_inbox (
    id                           uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                    uuid        NOT NULL,
    envelope_id                  uuid        NOT NULL,
    event_id                     uuid        NOT NULL,
    document_kind                text        NOT NULL,
    operation_kind               text        NOT NULL,
    source_tenant_id             uuid        NOT NULL,
    source_network_account_id    uuid        NOT NULL,
    recipient_network_account_id uuid        NOT NULL,
    network_relationship_id      uuid        NOT NULL,
    source_principal_id          uuid,
    entity_id                    uuid        NOT NULL,
    entity_version_id            uuid        NOT NULL,
    entity_contract_hash         char(64)    NOT NULL,
    business_key                 text,
    correlation_id               text,
    idempotency_key              text        NOT NULL,
    payload_hash                 char(64)    NOT NULL,
    occurred_at                  timestamptz NOT NULL,
    received_at                  timestamptz NOT NULL DEFAULT clock_timestamp(),
    received_by                  uuid        NOT NULL,
    CONSTRAINT mesh_workforce_claim_inbox_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_workforce_claim_inbox_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_workforce_claim_inbox_envelope_uq UNIQUE (tenant_id, envelope_id),
    CONSTRAINT mesh_workforce_claim_inbox_event_uq UNIQUE (tenant_id, event_id),
    CONSTRAINT mesh_workforce_claim_inbox_idempotency_uq UNIQUE (tenant_id, source_network_account_id, idempotency_key),
    CONSTRAINT mesh_workforce_claim_inbox_document_chk CHECK (document_kind IN ('external_time_sheet','external_expense_sheet','supplier_invoice')),
    CONSTRAINT mesh_workforce_claim_inbox_operation_chk CHECK (operation_kind IN ('submit','revise','withdraw')),
    CONSTRAINT mesh_workforce_claim_inbox_participant_chk CHECK (tenant_id <> source_tenant_id),
    CONSTRAINT mesh_workforce_claim_inbox_hash_chk CHECK (entity_contract_hash ~ '^[a-f0-9]{64}$' AND payload_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT mesh_workforce_claim_inbox_business_key_chk CHECK (business_key IS NULL OR btrim(business_key) <> ''),
    CONSTRAINT mesh_workforce_claim_inbox_correlation_chk CHECK (correlation_id IS NULL OR btrim(correlation_id) <> ''),
    CONSTRAINT mesh_workforce_claim_inbox_key_chk CHECK (btrim(idempotency_key) = idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT mesh_workforce_claim_inbox_time_chk CHECK (occurred_at <= received_at)
);

CREATE TABLE control.mesh_workforce_claim_processing_attempt (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid        NOT NULL,
    inbox_id         uuid        NOT NULL,
    attempt_no       integer     NOT NULL,
    trigger_kind     text        NOT NULL,
    disposition      text        NOT NULL,
    aggregate_kind   text,
    aggregate_id     uuid,
    safe_reason_code text,
    details          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    processed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
    processed_by     uuid        NOT NULL,
    CONSTRAINT mesh_workforce_claim_attempt_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_workforce_claim_attempt_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_workforce_claim_attempt_no_uq UNIQUE (tenant_id, inbox_id, attempt_no),
    CONSTRAINT mesh_workforce_claim_attempt_no_chk CHECK (attempt_no >= 1),
    CONSTRAINT mesh_workforce_claim_attempt_trigger_chk CHECK (trigger_kind IN ('delivery','replay','manual_reprocess')),
    CONSTRAINT mesh_workforce_claim_attempt_disposition_chk CHECK (disposition IN ('materialized','duplicate','rejected','quarantined','failed')),
    CONSTRAINT mesh_workforce_claim_attempt_target_chk CHECK (
        (disposition = 'materialized' AND aggregate_kind IN ('external_time_sheet','external_expense_sheet','purchase_invoice') AND aggregate_id IS NOT NULL AND safe_reason_code IS NULL)
        OR (disposition <> 'materialized' AND aggregate_kind IS NULL AND aggregate_id IS NULL)
    ),
    CONSTRAINT mesh_workforce_claim_attempt_reason_chk CHECK (safe_reason_code IS NULL OR safe_reason_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT mesh_workforce_claim_attempt_json_chk CHECK (jsonb_typeof(details) = 'object' AND pg_column_size(details) <= 32768)
);

COMMENT ON TABLE control.mesh_workforce_claim_inbox IS
  'Append-only NEON receipt of a MESH external-workforce claim envelope. It contains transport coordinates and hashes, never the unrestricted claim or receipt payload.';
COMMENT ON TABLE control.mesh_workforce_claim_processing_attempt IS
  'Append-only replay/materialization evidence for one MESH workforce-claim inbox receipt.';

CREATE TABLE control.mesh_business_partner_profile_projection (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    source_tenant_id            uuid        NOT NULL,
    source_network_account_id   uuid        NOT NULL,
    recipient_network_account_id uuid       NOT NULL,
    network_relationship_id     uuid        NOT NULL,
    current_publication_id      uuid        NOT NULL,
    current_publication_version integer     NOT NULL,
    current_lifecycle_version   integer     NOT NULL,
    current_snapshot_id         uuid        NOT NULL,
    last_inbox_event_id         uuid        NOT NULL,
    projection_status           text        NOT NULL,
    updated_at                  timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by                  uuid        NOT NULL,

    CONSTRAINT mesh_bp_profile_projection_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bp_profile_projection_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_bp_profile_projection_relationship_uq UNIQUE (tenant_id, network_relationship_id),
    CONSTRAINT mesh_bp_profile_projection_participants_chk CHECK (tenant_id <> source_tenant_id),
    CONSTRAINT mesh_bp_profile_projection_version_chk CHECK (current_publication_version >= 1 AND current_lifecycle_version >= 1),
    CONSTRAINT mesh_bp_profile_projection_status_chk CHECK (projection_status IN ('active','withdrawn'))
);

COMMENT ON TABLE control.mesh_business_partner_profile_inbox IS
  'Immutable NEON receipt of a MESH publication envelope; event_id provides delivery deduplication.';
COMMENT ON TABLE control.mesh_business_partner_profile_processing_attempt IS
  'Append-only delivery and replay results. Quarantine is evidence, never a destructive queue move.';
COMMENT ON TABLE control.mesh_business_partner_profile_projection IS
  'Tenant-local current pointer over verified immutable MESH snapshots. It does not materialize or update master.business_partner.';

CREATE TABLE control.mesh_business_partner_account_link (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    profile_projection_id       uuid        NOT NULL,
    source_tenant_id            uuid        NOT NULL,
    source_network_account_id   uuid        NOT NULL,
    recipient_network_account_id uuid       NOT NULL,
    network_relationship_id     uuid        NOT NULL,
    business_partner_id         uuid        NOT NULL,
    proposed_role               master.partner_role_d NOT NULL,
    external_reference_id       uuid,
    onboarding_request_id       uuid,
    idempotency_key             text        NOT NULL,
    decision_fingerprint        text,
    status                      text        NOT NULL DEFAULT 'pending_approval',
    reviewed_at                 timestamptz,
    reviewed_by                 uuid,
    approved_at                 timestamptz,
    approved_by                 uuid,
    terminated_at               timestamptz,
    terminated_by               uuid,
    termination_reason          text,
    row_version                 bigint      NOT NULL DEFAULT 1,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,
    CONSTRAINT mesh_bp_account_link_pkey PRIMARY KEY(id),
    CONSTRAINT mesh_bp_account_link_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT mesh_bp_account_link_idempotency_uq UNIQUE(tenant_id,idempotency_key),
    CONSTRAINT mesh_bp_account_link_coordinate_uq UNIQUE(tenant_id,source_tenant_id,source_network_account_id),
    CONSTRAINT mesh_bp_account_link_status_chk CHECK(status IN('pending_approval','active','rejected','terminated','corrected')),
    CONSTRAINT mesh_bp_account_link_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT mesh_bp_account_link_decision_chk CHECK((status='pending_approval' AND decision_fingerprint IS NULL AND reviewed_at IS NULL AND reviewed_by IS NULL AND approved_at IS NULL AND approved_by IS NULL AND external_reference_id IS NULL) OR (status='rejected' AND decision_fingerprint ~ '^[a-f0-9]{64}$' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND approved_at IS NULL AND approved_by IS NULL AND external_reference_id IS NULL) OR (status IN('active','terminated','corrected') AND decision_fingerprint ~ '^[a-f0-9]{64}$' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND external_reference_id IS NOT NULL)),
    CONSTRAINT mesh_bp_account_link_sod_chk CHECK(approved_by IS NULL OR approved_by IS DISTINCT FROM created_by),
    CONSTRAINT mesh_bp_account_link_termination_chk CHECK((terminated_at IS NULL AND terminated_by IS NULL AND termination_reason IS NULL) OR (terminated_at IS NOT NULL AND terminated_by IS NOT NULL AND nullif(btrim(termination_reason),'') IS NOT NULL)),
    CONSTRAINT mesh_bp_account_link_version_chk CHECK(row_version>=1),
    CONSTRAINT mesh_bp_account_link_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE control.mesh_bank_account_disclosure_inbox (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    event_id                    uuid        NOT NULL,
    source_tenant_id            uuid        NOT NULL,
    source_network_account_id   uuid        NOT NULL,
    recipient_network_account_id uuid       NOT NULL,
    network_relationship_id     uuid        NOT NULL,
    disclosure_id               uuid        NOT NULL,
    disclosure_version          integer     NOT NULL,
    lifecycle_version           integer     NOT NULL,
    event_type                  text        NOT NULL,
    payload_hash                text        NOT NULL,
    envelope_json               jsonb       NOT NULL,
    envelope_hash               text        NOT NULL,
    occurred_at                 timestamptz NOT NULL,
    received_at                 timestamptz NOT NULL DEFAULT clock_timestamp(),
    received_by                 uuid        NOT NULL,
    CONSTRAINT mesh_bank_disclosure_inbox_pkey PRIMARY KEY(id),
    CONSTRAINT mesh_bank_disclosure_inbox_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT mesh_bank_disclosure_inbox_event_uq UNIQUE(tenant_id,event_id),
    CONSTRAINT mesh_bank_disclosure_inbox_parties_chk CHECK(tenant_id<>source_tenant_id),
    CONSTRAINT mesh_bank_disclosure_inbox_type_chk CHECK(event_type IN('mesh.bank_account.disclosed','mesh.bank_account.changed','mesh.bank_account.revoked')),
    CONSTRAINT mesh_bank_disclosure_inbox_version_chk CHECK(disclosure_version>=1 AND lifecycle_version>=1),
    CONSTRAINT mesh_bank_disclosure_inbox_hash_chk CHECK(payload_hash ~ '^[a-f0-9]{64}$' AND envelope_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT mesh_bank_disclosure_inbox_payload_chk CHECK(jsonb_typeof(envelope_json)='object' AND pg_column_size(envelope_json)<=65536)
    ,CONSTRAINT mesh_bank_disclosure_inbox_safe_chk CHECK(lower(envelope_json::text) !~ '"(account.?id.?value|account.?number|iban|routing.?number|raw.?account)[^"]*"[[:space:]]*:')
);

CREATE TABLE control.mesh_bank_account_projection (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    account_link_id             uuid        NOT NULL,
    source_tenant_id            uuid        NOT NULL,
    source_network_account_id   uuid        NOT NULL,
    recipient_network_account_id uuid       NOT NULL,
    network_relationship_id     uuid        NOT NULL,
    current_disclosure_id       uuid        NOT NULL,
    current_disclosure_version  integer     NOT NULL,
    current_lifecycle_version   integer     NOT NULL,
    current_snapshot_id         uuid        NOT NULL,
    last_inbox_event_id         uuid        NOT NULL,
    account_fingerprint         text        NOT NULL,
    projection_status           text        NOT NULL DEFAULT 'available',
    updated_at                  timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by                  uuid        NOT NULL,
    CONSTRAINT mesh_bank_account_projection_pkey PRIMARY KEY(id),
    CONSTRAINT mesh_bank_account_projection_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT mesh_bank_account_projection_relationship_uq UNIQUE(tenant_id,network_relationship_id),
    CONSTRAINT mesh_bank_account_projection_version_chk CHECK(current_disclosure_version>=1 AND current_lifecycle_version>=1),
    CONSTRAINT mesh_bank_account_projection_fingerprint_chk CHECK(account_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT mesh_bank_account_projection_status_chk CHECK(projection_status IN('available','change_pending','verified','linked','revoked','expired','quarantined'))
);

COMMENT ON TABLE control.mesh_business_partner_account_link IS 'Approved directional mapping from one recipient-visible MESH account to one NEON Business Partner and explicit supplier/customer role.';
COMMENT ON TABLE control.mesh_bank_account_disclosure_inbox IS 'Immutable recipient receipt for a masked, separately governed MESH bank disclosure event.';
COMMENT ON TABLE control.mesh_bank_account_projection IS 'Masked recipient-local bank disclosure head. It contains no raw account identifier and cannot directly update NEON bank master data.';

CREATE TABLE control.company_fiscal_calendar_assignment (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    company_code_id             uuid        NOT NULL,
    fiscal_calendar_config_id   uuid        NOT NULL,
    effective_fiscal_year_from  smallint    NOT NULL,
    effective_fiscal_year_to    smallint,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      control.fiscal_calendar_assignment_status_d
                                            NOT NULL DEFAULT 'active',
    is_active                   boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT company_fiscal_calendar_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT company_fiscal_calendar_assignment_tenant_id_uq
        UNIQUE (tenant_id, id),
    CONSTRAINT company_fiscal_calendar_assignment_year_chk
        CHECK (effective_fiscal_year_from BETWEEN 1900 AND 9999),
    CONSTRAINT company_fiscal_calendar_assignment_range_chk CHECK (
        effective_fiscal_year_to IS NULL
        OR (
            effective_fiscal_year_to BETWEEN 1900 AND 9999
            AND effective_fiscal_year_to >= effective_fiscal_year_from
        )
    ),
    CONSTRAINT company_fiscal_calendar_assignment_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT company_fiscal_calendar_assignment_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_fiscal_calendar_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.company_fiscal_calendar_assignment IS
  'Non-overlapping effective fiscal-year assignment of one active calendar version to a Neon company code.';

CREATE TABLE control.customer_credit_review (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    business_partner_id        uuid        NOT NULL,
    customer_id                uuid        NOT NULL,
    operating_organization_id  uuid,
    company_code_id            uuid,
    review_type_code           text        NOT NULL DEFAULT 'initial',
    requested_credit_limit     numeric(20,4),
    requested_currency_code    character(3),
    approved_credit_limit      numeric(20,4),
    approved_currency_code     character(3),
    risk_class_code            text,
    decision                   text        NOT NULL DEFAULT 'pending',
    decision_reason            text,
    conditions                 jsonb       NOT NULL DEFAULT '[]'::jsonb,
    authority_evidence         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    effective_from             date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until            date,
    idempotency_key            text        NOT NULL,
    decision_idempotency_key   text,
    decision_fingerprint       text,
    reviewed_at                timestamptz,
    reviewed_by                uuid,
    approved_at                timestamptz,
    approved_by                uuid,
    row_version                bigint      NOT NULL DEFAULT 1,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT customer_credit_review_pkey PRIMARY KEY(id),
    CONSTRAINT customer_credit_review_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT customer_credit_review_decision_chk CHECK(decision IN('pending','approved','conditional','rejected','suspended','expired')),
    CONSTRAINT customer_credit_review_requested_limit_chk CHECK(requested_credit_limit IS NULL OR requested_credit_limit>=0),
    CONSTRAINT customer_credit_review_requested_currency_chk CHECK((requested_credit_limit IS NULL)=(requested_currency_code IS NULL)),
    CONSTRAINT customer_credit_review_approved_limit_chk CHECK(approved_credit_limit IS NULL OR approved_credit_limit>=0),
    CONSTRAINT customer_credit_review_approved_currency_chk CHECK((approved_credit_limit IS NULL)=(approved_currency_code IS NULL)),
    CONSTRAINT customer_credit_review_outcome_limit_chk CHECK(decision IN('approved','conditional') OR approved_credit_limit IS NULL),
    CONSTRAINT customer_credit_review_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
    CONSTRAINT customer_credit_review_conditions_chk CHECK(jsonb_typeof(conditions)='array' AND jsonb_array_length(conditions)<=50 AND octet_length(conditions::text)<=32768),
    CONSTRAINT customer_credit_review_authority_evidence_chk CHECK(jsonb_typeof(authority_evidence)='object' AND octet_length(authority_evidence::text)<=65536),
    CONSTRAINT customer_credit_review_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT customer_credit_review_decision_evidence_chk CHECK((decision='pending' AND reviewed_at IS NULL AND reviewed_by IS NULL AND decision_reason IS NULL AND decision_idempotency_key IS NULL AND decision_fingerprint IS NULL) OR (decision<>'pending' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND decision_reason IS NOT NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint ~ '^[a-f0-9]{64}$')),
    CONSTRAINT customer_credit_review_approval_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT customer_credit_review_no_self_approval_chk CHECK(reviewed_by IS NULL OR reviewed_by<>created_by),
    CONSTRAINT customer_credit_review_approved_chk CHECK((decision IN('approved','conditional'))=(approved_at IS NOT NULL)),
    CONSTRAINT customer_credit_review_version_chk CHECK(row_version>=1),
    CONSTRAINT customer_credit_review_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE control.business_partner_mutation_evidence (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    aggregate_kind      text        NOT NULL,
    aggregate_id        uuid        NOT NULL,
    business_partner_id uuid,
    command_code        text        NOT NULL,
    from_state          text        NOT NULL,
    to_state            text        NOT NULL,
    expected_version    bigint      NOT NULL,
    resulting_version   bigint      NOT NULL,
    reason              text        NOT NULL,
    idempotency_key     text        NOT NULL,
    command_fingerprint text        NOT NULL,
    evidence            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
    occurred_by         uuid        NOT NULL,
    CONSTRAINT business_partner_mutation_evidence_pkey PRIMARY KEY(id),
    CONSTRAINT business_partner_mutation_evidence_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT business_partner_mutation_evidence_kind_chk CHECK(aggregate_kind IN(
        'business_partner','supplier','customer','business_partner_relationship',
        'qualification','supplier_preference','customer_designation','customer_credit_review')),
    CONSTRAINT business_partner_mutation_evidence_code_chk CHECK(command_code ~ '^[a-z][a-z0-9_.-]{2,126}$'),
    CONSTRAINT business_partner_mutation_evidence_state_chk CHECK(
        from_state ~ '^[a-z][a-z0-9_.-]{1,62}$' AND to_state ~ '^[a-z][a-z0-9_.-]{1,62}$'
        AND from_state <> to_state),
    CONSTRAINT business_partner_mutation_evidence_version_chk CHECK(
        expected_version >= 1 AND resulting_version = expected_version + 1),
    CONSTRAINT business_partner_mutation_evidence_reason_chk CHECK(
        length(btrim(reason)) BETWEEN 1 AND 4000),
    CONSTRAINT business_partner_mutation_evidence_idempotency_chk CHECK(
        btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT business_partner_mutation_evidence_fingerprint_chk CHECK(
        command_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT business_partner_mutation_evidence_payload_chk CHECK(
        jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=16384)
);

COMMENT ON TABLE control.business_partner_mutation_evidence IS
  'S5 append-only evidence ledger for command-owned Business Partner lifecycle and governed decisions. Every accepted mutation is versioned, idempotent, actor-bound, and paired atomically with event.outbox.';

CREATE TABLE control.customer_lifecycle_event (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    business_partner_id        uuid        NOT NULL,
    customer_id                uuid        NOT NULL,
    operating_organization_id  uuid        NOT NULL,
    company_code_id            uuid        NOT NULL,
    action_code                text        NOT NULL,
    from_status                text        NOT NULL,
    to_status                  text        NOT NULL,
    expected_version           bigint      NOT NULL,
    resulting_version          bigint      NOT NULL,
    reason_code                text        NOT NULL,
    business_date              date        NOT NULL,
    readiness_fingerprint      text,
    readiness_evidence         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key            text        NOT NULL,
    command_fingerprint        text        NOT NULL,
    occurred_at                timestamptz NOT NULL DEFAULT now(),
    occurred_by                uuid        NOT NULL,
    CONSTRAINT customer_lifecycle_event_pkey PRIMARY KEY(id),
    CONSTRAINT customer_lifecycle_event_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT customer_lifecycle_event_action_chk CHECK(action_code IN('activate','suspend','reactivate','deactivate','archive')),
    CONSTRAINT customer_lifecycle_event_transition_chk CHECK(
        (action_code='activate' AND from_status='prospect' AND to_status='active')
        OR (action_code='suspend' AND from_status='active' AND to_status='suspended')
        OR (action_code='reactivate' AND from_status='suspended' AND to_status='active')
        OR (action_code='deactivate' AND from_status IN('active','suspended') AND to_status='inactive')
        OR (action_code='archive' AND from_status='inactive' AND to_status='archived')),
    CONSTRAINT customer_lifecycle_event_version_chk CHECK(expected_version>=1 AND resulting_version=expected_version+1),
    CONSTRAINT customer_lifecycle_event_reason_chk CHECK(reason_code ~ '^[A-Z][A-Z0-9_.-]{2,126}$'),
    CONSTRAINT customer_lifecycle_event_fingerprint_chk CHECK(readiness_fingerprint IS NULL OR readiness_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT customer_lifecycle_event_command_fingerprint_chk CHECK(command_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT customer_lifecycle_event_evidence_chk CHECK(jsonb_typeof(readiness_evidence)='object' AND octet_length(readiness_evidence::text)<=65536),
    CONSTRAINT customer_lifecycle_event_readiness_chk CHECK(action_code IN('suspend','deactivate','archive') OR (readiness_fingerprint IS NOT NULL AND readiness_evidence->>'decisionFingerprint'=readiness_fingerprint AND readiness_evidence->>'eligible'='true')),
    CONSTRAINT customer_lifecycle_event_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200)
);

COMMENT ON TABLE control.customer_credit_review IS 'Sole company-scoped authority for requested and approved customer credit limits. Registration approval cannot decide it, and customer/company master records cannot store a limit.';
COMMENT ON COLUMN control.customer_credit_review.approved_credit_limit IS 'Effective governed credit-limit outcome. Only approved or conditional review records may carry a value.';
COMMENT ON COLUMN control.customer_credit_review.authority_evidence IS 'Immutable decision provenance, including supported-baseline migration evidence; it is not an alternate credit-limit authority.';
COMMENT ON TABLE control.customer_lifecycle_event IS 'Immutable audited and idempotent Customer lifecycle command ledger. It is the sole authority permitted to change master.customer.status.';

-- Normalized decision coordinates.  Rows within one scope_group are
-- conjunctive; separate groups are alternatives.  The typed target columns
-- avoid unvalidated polymorphic UUIDs.
CREATE TABLE control.business_partner_decision_scope (
    id                        uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid        NOT NULL,
    qualification_id          uuid,
    supplier_preference_id    uuid,
    customer_designation_id   uuid,
    credit_review_id          uuid,
    scope_group               smallint    NOT NULL DEFAULT 1,
    scope_mode                text        NOT NULL DEFAULT 'include',
    scope_kind                text        NOT NULL,
    operating_organization_id uuid,
    company_code_id           uuid,
    commodity_category_id     uuid,
    country_code              character(2),
    tax_jurisdiction_id       uuid,
    organization_unit_id      uuid,
    effective_from            date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until           date,
    hierarchy_version         bigint,
    resolution_fingerprint    text,
    metadata                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid        NOT NULL,
    CONSTRAINT business_partner_decision_scope_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_decision_scope_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_decision_scope_authority_chk CHECK (
        num_nonnulls(qualification_id, supplier_preference_id,
                     customer_designation_id, credit_review_id) = 1),
    CONSTRAINT business_partner_decision_scope_group_chk CHECK (scope_group BETWEEN 1 AND 100),
    CONSTRAINT business_partner_decision_scope_mode_chk CHECK (scope_mode IN ('include','exclude')),
    CONSTRAINT business_partner_decision_scope_kind_chk CHECK (
        scope_kind IN ('global','operating_organization','company_code','commodity_category',
                       'country','tax_jurisdiction','organization_unit')),
    CONSTRAINT business_partner_decision_scope_target_chk CHECK (
        (scope_kind='global' AND num_nonnulls(operating_organization_id,company_code_id,commodity_category_id,country_code,tax_jurisdiction_id,organization_unit_id)=0)
        OR (scope_kind='operating_organization' AND operating_organization_id IS NOT NULL AND num_nonnulls(company_code_id,commodity_category_id,country_code,tax_jurisdiction_id,organization_unit_id)=0)
        OR (scope_kind='company_code' AND company_code_id IS NOT NULL AND num_nonnulls(operating_organization_id,commodity_category_id,country_code,tax_jurisdiction_id,organization_unit_id)=0)
        OR (scope_kind='commodity_category' AND commodity_category_id IS NOT NULL AND num_nonnulls(operating_organization_id,company_code_id,country_code,tax_jurisdiction_id,organization_unit_id)=0)
        OR (scope_kind='country' AND country_code IS NOT NULL AND num_nonnulls(operating_organization_id,company_code_id,commodity_category_id,tax_jurisdiction_id,organization_unit_id)=0)
        OR (scope_kind='tax_jurisdiction' AND tax_jurisdiction_id IS NOT NULL AND num_nonnulls(operating_organization_id,company_code_id,commodity_category_id,country_code,organization_unit_id)=0)
        OR (scope_kind='organization_unit' AND organization_unit_id IS NOT NULL AND num_nonnulls(operating_organization_id,company_code_id,commodity_category_id,country_code,tax_jurisdiction_id)=0)),
    CONSTRAINT business_partner_decision_scope_range_chk CHECK (effective_until IS NULL OR effective_until>effective_from),
    CONSTRAINT business_partner_decision_scope_hierarchy_chk CHECK ((hierarchy_version IS NULL)=(resolution_fingerprint IS NULL) AND (hierarchy_version IS NULL OR hierarchy_version>=1)),
    CONSTRAINT business_partner_decision_scope_fingerprint_chk CHECK (resolution_fingerprint IS NULL OR resolution_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT business_partner_decision_scope_metadata_chk CHECK (jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8192)
);

COMMENT ON TABLE control.business_partner_decision_scope IS
  'Normalized include/exclude scope coordinates for BP qualification, preference, designation, and credit decisions.';
-- Fieldglass-inspired external-workforce pricing policy.  Rate cards are
-- governed configuration; accepted commercial rates are snapshotted on work
-- order/SOW revisions and transaction lines.
CREATE TABLE control.external_workforce_rate_card (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    company_code_id     uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,
    currency_code       character(3) NOT NULL,
    effective_from      date        NOT NULL,
    effective_until     date,
    row_version         bigint      NOT NULL DEFAULT 1,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'draft',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT external_workforce_rate_card_pkey PRIMARY KEY (id),
    CONSTRAINT external_workforce_rate_card_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_workforce_rate_card_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT external_workforce_rate_card_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT external_workforce_rate_card_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT external_workforce_rate_card_range_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT external_workforce_rate_card_version_chk CHECK (row_version >= 1),
    CONSTRAINT external_workforce_rate_card_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT external_workforce_rate_card_status_chk CHECK (status IN ('draft','active','inactive','archived')),
    CONSTRAINT external_workforce_rate_card_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT external_workforce_rate_card_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.external_workforce_rate (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    rate_card_id        uuid        NOT NULL,
    supplier_id         uuid,
    job_id              uuid,
    site_id             uuid,
    worker_classification text,
    rate_code           text        NOT NULL,
    unit_of_measure     text        NOT NULL,
    regular_rate        numeric(18,6) NOT NULL,
    minimum_rate        numeric(18,6),
    maximum_rate        numeric(18,6),
    overtime_multiplier numeric(9,4) NOT NULL DEFAULT 1,
    doubletime_multiplier numeric(9,4) NOT NULL DEFAULT 1,
    supplier_markup_percent numeric(9,4) NOT NULL DEFAULT 0,
    effective_from      date        NOT NULL,
    effective_until     date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT external_workforce_rate_pkey PRIMARY KEY (id),
    CONSTRAINT external_workforce_rate_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_workforce_rate_code_uq UNIQUE (tenant_id, rate_card_id, rate_code, effective_from),
    CONSTRAINT external_workforce_rate_code_chk CHECK (rate_code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT external_workforce_rate_uom_chk CHECK (unit_of_measure IN ('hour','day','week','month','each','fixed')),
    CONSTRAINT external_workforce_rate_classification_chk CHECK (
        worker_classification IS NULL OR worker_classification IN (
            'agency_worker','independent_contractor','consultant','sow_worker','other'
        )
    ),
    CONSTRAINT external_workforce_rate_amount_chk CHECK (
        regular_rate >= 0
        AND (minimum_rate IS NULL OR minimum_rate >= 0)
        AND (maximum_rate IS NULL OR maximum_rate >= COALESCE(minimum_rate, 0))
        AND regular_rate BETWEEN COALESCE(minimum_rate, regular_rate) AND COALESCE(maximum_rate, regular_rate)
        AND overtime_multiplier >= 1 AND doubletime_multiplier >= overtime_multiplier
        AND supplier_markup_percent BETWEEN 0 AND 1000
    ),
    CONSTRAINT external_workforce_rate_range_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT external_workforce_rate_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT external_workforce_rate_status_chk CHECK (status IN ('active','inactive','archived')),
    CONSTRAINT external_workforce_rate_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.external_workforce_rate_card IS
  'Buyer-company rate policy for external labor. It is not a purchase commitment and cannot authorize spend.';
COMMENT ON TABLE control.external_workforce_rate IS
  'Effective rate-card row optionally narrowed by staffing supplier, job, site and worker classification.';
