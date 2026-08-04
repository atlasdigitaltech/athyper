-- Neon-only finance controls. Mesh retains authoritative catalog currencies
-- and Admin publishes metadata; neither plane receives these accounting tables.
CREATE TABLE control.rounding_rule (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    method              control.rounding_method_d NOT NULL DEFAULT 'ROUND_HALF_UP',
    precision_digits    smallint,
    rounding_increment  numeric(18,6),
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              control.finance_policy_status_d NOT NULL DEFAULT 'draft',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
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
  'Tenant rounding contract selected by Neon finance aggregates. NULL precision derives from the transaction currency minor units; rounding_increment supports non-decimal increments such as 0.05.';

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
