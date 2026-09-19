
-- ============================================================================
-- Neon organization foundation
-- ============================================================================

CREATE TABLE master.legal_entity (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    canonical_party_id    uuid,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    display_name          text,
    legal_name            text                         NOT NULL,
    entity_type           master.legal_entity_type_d   NOT NULL DEFAULT 'company',
    parent_legal_entity_id uuid,
    registration_number   text,
    registration_country_code character(2),
    logo_asset_ref        text,
    incorporation_date    date,
    functional_currency   character(3)                 NOT NULL,
    reporting_currency    character(3),
    effective_from        date,
    effective_until       date,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.organization_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT legal_entity_pkey PRIMARY KEY (id),
    CONSTRAINT legal_entity_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT legal_entity_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT legal_entity_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT legal_entity_names_chk CHECK (
        btrim(name) <> '' AND btrim(legal_name) <> ''
        AND (display_name IS NULL OR btrim(display_name) <> '')
    ),
    CONSTRAINT legal_entity_registration_chk CHECK (
        registration_number IS NULL OR btrim(registration_number) <> ''
    ),
    CONSTRAINT legal_entity_logo_asset_ref_chk CHECK (
        logo_asset_ref IS NULL
        OR (
            btrim(logo_asset_ref) = logo_asset_ref
            AND length(logo_asset_ref) BETWEEN 2 AND 1024
            AND logo_asset_ref ~ '^/[A-Za-z0-9][A-Za-z0-9_./-]*$'
            AND logo_asset_ref !~ '(^|/)\.\.(/|$)'
        )
    ),
    CONSTRAINT legal_entity_parent_self_chk CHECK (parent_legal_entity_id IS DISTINCT FROM id),
    CONSTRAINT legal_entity_effective_range_chk CHECK (
        effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT legal_entity_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT legal_entity_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT legal_entity_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.legal_entity IS
  'Neon statutory organization representation linked by opaque canonical_party_id. A TrustIAM organization may project this legal entity as a scope ceiling but never owns the record.';

COMMENT ON COLUMN master.legal_entity.logo_asset_ref IS
  'Optional same-origin managed logo path for legal-entity context presentation.';

CREATE TABLE master.company_code (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    legal_entity_id       uuid                         NOT NULL,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    display_name          text,
    description           text,
    functional_currency   character(3)                 NOT NULL,
    country_code          character(2),
    fiscal_year_start_month smallint                   NOT NULL DEFAULT 1,
    timezone_code         text,
    locale_code           text,
    external_ref          text,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.organization_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT company_code_pkey PRIMARY KEY (id),
    CONSTRAINT company_code_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT company_code_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT company_code_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT company_code_names_chk CHECK (
        btrim(name) <> '' AND (display_name IS NULL OR btrim(display_name) <> '')
    ),
    CONSTRAINT company_code_fiscal_month_chk CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    CONSTRAINT company_code_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT company_code_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_code_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.company_code IS
  'Accounting and balancing entity owned by exactly one same-tenant legal entity.';

-- Stable tax identity catalogs. Effective rates, registrations, thresholds,
-- resolution rules, filing policy, and calculations are deliberately separate.
CREATE TABLE master.tax_jurisdiction (
    id                    uuid                                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                NOT NULL,
    code                  text                                NOT NULL,
    name                  text                                NOT NULL,
    description           text,
    jurisdiction_type     master.tax_jurisdiction_type_d      NOT NULL,
    country_code          character(2),
    state_region_code     text,
    authority_name        text,
    sort_order            smallint                            NOT NULL DEFAULT 0,
    metadata              jsonb                               NOT NULL DEFAULT '{}'::jsonb,
    status                master.tax_identity_status_d        NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                         NOT NULL DEFAULT now(),
    created_by            uuid                                NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT tax_jurisdiction_pkey PRIMARY KEY (id),
    CONSTRAINT tax_jurisdiction_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_jurisdiction_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT tax_jurisdiction_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT tax_jurisdiction_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT tax_jurisdiction_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT tax_jurisdiction_authority_chk
        CHECK (authority_name IS NULL OR btrim(authority_name) <> ''),
    CONSTRAINT tax_jurisdiction_country_chk
        CHECK (country_code IS NULL OR country_code::text ~ '^[A-Z]{2}$'),
    CONSTRAINT tax_jurisdiction_geography_chk CHECK (
        (
            jurisdiction_type = 'country'
            AND country_code IS NOT NULL
            AND state_region_code IS NULL
        )
        OR
        (
            jurisdiction_type IN ('state', 'province')
            AND country_code IS NOT NULL
            AND state_region_code IS NOT NULL
        )
        OR
        (
            jurisdiction_type IN (
                'county', 'city', 'district', 'special_zone'
            )
            AND country_code IS NOT NULL
        )
        OR
        (
            jurisdiction_type IN ('supranational', 'treaty')
            AND country_code IS NULL
            AND state_region_code IS NULL
        )
    ),
    CONSTRAINT tax_jurisdiction_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT tax_jurisdiction_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tax_jurisdiction_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tax_jurisdiction_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.tax_jurisdiction IS
  'Tenant tax-authority or tax-territory identity. Jurisdictions may overlap; geographic coordinates are not assumed to be unique.';

CREATE TABLE master.condition_type (
    id                              uuid                                    NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid                                    NOT NULL,
    code                            text                                    NOT NULL,
    name                            text                                    NOT NULL,
    description                     text,
    term_type                       master.pricing_term_type_d              NOT NULL,
    term_sub_type                   master.pricing_term_sub_type_d,
    default_basis                   master.pricing_basis_d                  NOT NULL,
    default_rate                    numeric(20,10),
    default_amount                  numeric(18,4),
    default_apportion_basis         master.pricing_apportion_basis_d,
    is_subject_to_tax               boolean                                 NOT NULL DEFAULT false,
    is_apportionable                boolean                                 NOT NULL DEFAULT false,
    applies_to_classes              text[]                                  NOT NULL DEFAULT ARRAY[]::text[],
    default_cost_effect             master.pricing_cost_effect_d            NOT NULL DEFAULT 'NO_COST_EFFECT',
    default_posting_pattern         master.pricing_posting_pattern_d        NOT NULL DEFAULT 'MEMO_ONLY',
    default_distribution_policy     master.pricing_distribution_policy_d   NOT NULL DEFAULT 'NO_COST_DISTRIBUTION',
    default_capitalization_policy   master.pricing_capitalization_policy_d NOT NULL DEFAULT 'NEVER_CAPITALIZE',
    default_posting_role_code       text,
    origin                          master.pricing_condition_origin_d       NOT NULL DEFAULT 'tenant',
    replaces_condition_type_id      uuid,
    sort_order                      smallint                                NOT NULL DEFAULT 0,
    metadata                        jsonb                                   NOT NULL DEFAULT '{}'::jsonb,
    status                          master.pricing_condition_status_d       NOT NULL DEFAULT 'draft',
    status_changed_at               timestamptz,
    status_changed_by               uuid,
    created_at                      timestamptz                             NOT NULL DEFAULT now(),
    created_by                      uuid                                    NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT condition_type_pkey PRIMARY KEY (id),
    CONSTRAINT condition_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT condition_type_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT condition_type_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT condition_type_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT condition_type_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT condition_type_term_sub_type_chk CHECK (
        (term_type = 'discount' AND term_sub_type IS NOT DISTINCT FROM 'settlement')
        OR (term_type = 'discount' AND term_sub_type IS NULL)
        OR (term_type = 'charge' AND term_sub_type IN ('landed'))
        OR (term_type = 'charge' AND term_sub_type IS NULL)
        OR (term_type IN ('tax', 'withholding', 'principal_marker') AND term_sub_type IS NULL)
        OR (term_type = 'retention' AND term_sub_type IN ('warranty', 'performance', 'completion'))
    ),
    CONSTRAINT condition_type_basis_value_chk CHECK (
        (
            default_basis IN ('percent', 'per_unit')
            AND default_rate IS NOT NULL
            AND default_amount IS NULL
        )
        OR
        (
            default_basis IN ('amount', 'flat')
            AND default_amount IS NOT NULL
            AND default_rate IS NULL
        )
    ),
    CONSTRAINT condition_type_rate_chk CHECK (
        default_rate IS NULL
        OR (
            default_rate >= 0
            AND (default_basis <> 'percent' OR default_rate <= 100)
        )
    ),
    CONSTRAINT condition_type_amount_chk
        CHECK (default_amount IS NULL OR default_amount >= 0),
    CONSTRAINT condition_type_apportion_chk CHECK (
        is_apportionable
        OR (
            default_apportion_basis IS NULL
            AND default_distribution_policy <> 'APPORTION_TO_LINES'
        )
    ),
    CONSTRAINT condition_type_distribution_chk CHECK (
        default_distribution_policy <> 'APPORTION_TO_LINES'
        OR (
            is_apportionable
            AND default_apportion_basis IS NOT NULL
        )
    ),
    CONSTRAINT condition_type_applicability_chk CHECK (
        cardinality(applies_to_classes) > 0
        AND array_position(applies_to_classes, NULL) IS NULL
    ),
    CONSTRAINT condition_type_posting_role_chk CHECK (
        default_posting_role_code IS NULL
        OR default_posting_role_code ~ '^[a-z][a-z0-9_.-]{1,62}$'
    ),
    CONSTRAINT condition_type_replacement_chk
        CHECK (replaces_condition_type_id IS NULL OR replaces_condition_type_id <> id),
    CONSTRAINT condition_type_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT condition_type_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT condition_type_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT condition_type_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.condition_type IS
  'Tenant-owned pricing-condition catalog. Calculation, posting, and distribution values are defaults; effective determination, rate schedules, and overrides belong in control.';
COMMENT ON COLUMN master.condition_type.applies_to_classes IS
  'Extensible document entity-class codes. This remains an array until the document entity catalog is available as a stable FK target.';
COMMENT ON COLUMN master.condition_type.default_posting_role_code IS
  'Posting-role catalog code. The FK is deferred until the control posting-role catalog moves into the foundation.';
COMMENT ON COLUMN master.condition_type.origin IS
  'Platform-seeded definitions are tenant-local and immutable after activation; tenant definitions use origin=tenant.';

CREATE TABLE master.tax_type (
    id                    uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                           NOT NULL,
    code                  text                           NOT NULL,
    name                  text                           NOT NULL,
    description           text,
    tax_class             master.tax_class_d             NOT NULL,
    section_code_mode     master.tax_section_code_mode_d NOT NULL DEFAULT 'not_used',
    condition_type_id     uuid,
    sort_order            smallint                       NOT NULL DEFAULT 0,
    metadata              jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                master.tax_identity_status_d   NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                    NOT NULL DEFAULT now(),
    created_by            uuid                           NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT tax_type_pkey PRIMARY KEY (id),
    CONSTRAINT tax_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_type_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT tax_type_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT tax_type_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT tax_type_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT tax_type_section_mode_chk CHECK (
        tax_class = 'withholding'
        OR section_code_mode = 'not_used'
    ),
    CONSTRAINT tax_type_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT tax_type_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tax_type_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tax_type_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.tax_type IS
  'Tenant tax-kind identity, linked to a tenant-local pricing condition while remaining independent of effective tax-rate policy.';
COMMENT ON COLUMN master.tax_type.condition_type_id IS
  'Optional same-tenant pricing-condition identity used by pricing components for this tax kind.';

CREATE TABLE master.organization_tax_registration (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    legal_entity_id       uuid                         NOT NULL,
    company_code_id       uuid,
    jurisdiction_id       uuid                         NOT NULL,
    registration_type     text                         NOT NULL,
    registration_number   text                         NOT NULL,
    filing_frequency      text,
    effective_from        date                         NOT NULL DEFAULT CURRENT_DATE,
    effective_until       date,
    is_primary            boolean                      NOT NULL DEFAULT false,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.organization_status_d NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT organization_tax_registration_pkey PRIMARY KEY (id),
    CONSTRAINT organization_tax_registration_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT organization_tax_registration_values_chk CHECK (
        btrim(registration_type) <> ''
        AND btrim(registration_number) <> ''
        AND (filing_frequency IS NULL OR btrim(filing_frequency) <> '')
    ),
    CONSTRAINT organization_tax_registration_range_chk CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT organization_tax_registration_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT organization_tax_registration_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT organization_tax_registration_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.operating_organization (
    id                    uuid                                   NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                   NOT NULL,
    code                  text                                   NOT NULL,
    name                  text                                   NOT NULL,
    display_name          text,
    description           text,
    organization_kind     text                                   NOT NULL DEFAULT 'business_operations',
    parent_operating_organization_id uuid,
    effective_from        date,
    effective_until       date,
    metadata              jsonb                                  NOT NULL DEFAULT '{}'::jsonb,
    status                master.organization_status_d           NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                            NOT NULL DEFAULT now(),
    created_by            uuid                                   NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT operating_organization_pkey PRIMARY KEY (id),
    CONSTRAINT operating_organization_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT operating_organization_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT operating_organization_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT operating_organization_name_chk CHECK (
        btrim(name) <> '' AND (display_name IS NULL OR btrim(display_name) <> '')
    ),
    CONSTRAINT operating_organization_kind_chk CHECK (
        organization_kind IN ('company_operations','business_operations','shared_operations')
    ),
    CONSTRAINT operating_organization_parent_self_chk
        CHECK (parent_operating_organization_id IS DISTINCT FROM id),
    CONSTRAINT operating_organization_effective_range_chk CHECK (
        effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT operating_organization_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT operating_organization_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT operating_organization_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.operating_organization IS
  'Neon operational coordination boundary. Procurement and sales profiles are optional 1:1 behavior facets.';

CREATE TABLE master.procurement_organization_profile (
    tenant_id                uuid                  NOT NULL,
    operating_organization_id uuid                 NOT NULL,
    buying_model             master.buying_model_d NOT NULL DEFAULT 'federated',
    default_currency         character(3),
    lead_company_code_id     uuid,
    metadata                 jsonb                 NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz           NOT NULL DEFAULT now(),
    created_by               uuid                  NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT procurement_organization_profile_pkey
        PRIMARY KEY (tenant_id, operating_organization_id),
    CONSTRAINT procurement_organization_profile_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT procurement_organization_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.sales_organization_profile (
    tenant_id                uuid                   NOT NULL,
    operating_organization_id uuid                  NOT NULL,
    selling_model            master.selling_model_d NOT NULL DEFAULT 'federated',
    default_currency         character(3),
    booking_company_code_id  uuid,
    invoicing_company_code_id uuid,
    metadata                 jsonb                  NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz            NOT NULL DEFAULT now(),
    created_by               uuid                   NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT sales_organization_profile_pkey
        PRIMARY KEY (tenant_id, operating_organization_id),
    CONSTRAINT sales_organization_profile_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_organization_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.operating_organization_company_assignment (
    id                       uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                         NOT NULL,
    operating_organization_id uuid                        NOT NULL,
    company_code_id          uuid                         NOT NULL,
    participation_role       text                         NOT NULL DEFAULT 'participant',
    effective_from           date                         NOT NULL DEFAULT CURRENT_DATE,
    effective_until          date,
    metadata                 jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                   master.organization_status_d NOT NULL DEFAULT 'active',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                  NOT NULL DEFAULT now(),
    created_by               uuid                         NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT operating_organization_company_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT operating_organization_company_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT operating_organization_company_assignment_role_chk
        CHECK (participation_role IN ('lead', 'participant')),
    CONSTRAINT operating_organization_company_assignment_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT operating_organization_company_assignment_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT operating_organization_company_assignment_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT operating_organization_company_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.org_unit (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    org_unit_type_id      uuid                         NOT NULL,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    display_name          text,
    parent_org_unit_id    uuid,
    manager_principal_id  uuid,
    sort_order            integer                      NOT NULL DEFAULT 0,
    effective_from        date,
    effective_until       date,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.organization_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT org_unit_pkey PRIMARY KEY (id),
    CONSTRAINT org_unit_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT org_unit_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT org_unit_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT org_unit_name_chk CHECK (
        btrim(name) <> '' AND (display_name IS NULL OR btrim(display_name) <> '')
    ),
    CONSTRAINT org_unit_parent_self_chk CHECK (parent_org_unit_id IS DISTINCT FROM id),
    CONSTRAINT org_unit_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT org_unit_effective_range_chk CHECK (
        effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT org_unit_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT org_unit_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT org_unit_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Neon management-accounting foundation. Cost and profit centers are
-- first-class company-code masters. Generic dimensions represent only
-- additional tenant-configurable accounting axes.
CREATE TABLE master.profit_center (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    company_code_id       uuid                         NOT NULL,
    parent_id             uuid,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    description           text,
    category_code         text,
    is_posting_allowed    boolean                      NOT NULL DEFAULT true,
    valid_from            date,
    valid_to              date,
    sort_order            integer                      NOT NULL DEFAULT 0,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.organization_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT profit_center_pkey PRIMARY KEY (id),
    CONSTRAINT profit_center_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT profit_center_company_identity_uq
        UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT profit_center_company_code_uq
        UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT profit_center_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT profit_center_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT profit_center_category_chk CHECK (
        category_code IS NULL
        OR category_code ~ '^[a-z][a-z0-9_.-]{1,62}$'
    ),
    CONSTRAINT profit_center_parent_self_chk CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT profit_center_valid_range_chk CHECK (
        valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from
    ),
    CONSTRAINT profit_center_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT profit_center_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT profit_center_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT profit_center_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.profit_center IS
  'Neon company-code-scoped responsibility center for profit-and-loss reporting. Parent-child hierarchy is authoritative; derived paths are not stored.';

CREATE TABLE master.cost_center (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    company_code_id       uuid                         NOT NULL,
    parent_id             uuid,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    description           text,
    category_code         text,
    is_posting_allowed    boolean                      NOT NULL DEFAULT true,
    is_statistical        boolean                      NOT NULL DEFAULT false,
    profit_center_id      uuid,
    valid_from            date,
    valid_to              date,
    sort_order            integer                      NOT NULL DEFAULT 0,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.organization_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT cost_center_pkey PRIMARY KEY (id),
    CONSTRAINT cost_center_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cost_center_company_identity_uq
        UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT cost_center_company_code_uq
        UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT cost_center_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT cost_center_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT cost_center_category_chk CHECK (
        category_code IS NULL
        OR category_code ~ '^[a-z][a-z0-9_.-]{1,62}$'
    ),
    CONSTRAINT cost_center_parent_self_chk CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT cost_center_valid_range_chk CHECK (
        valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from
    ),
    CONSTRAINT cost_center_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT cost_center_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cost_center_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cost_center_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.cost_center IS
  'Neon company-code-scoped responsibility center for cost tracking. Optional profit-center assignment is constrained to the same company code.';

CREATE TABLE master.dimension_type (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    description           text,
    scope_mode            master.dimension_scope_d     NOT NULL DEFAULT 'tenant',
    is_hierarchical       boolean                      NOT NULL DEFAULT false,
    max_depth             smallint,
    sort_order            integer                      NOT NULL DEFAULT 0,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.organization_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT dimension_type_pkey PRIMARY KEY (id),
    CONSTRAINT dimension_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT dimension_type_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT dimension_type_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT dimension_type_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT dimension_type_hierarchy_chk CHECK (
        (is_hierarchical AND (max_depth IS NULL OR max_depth > 0))
        OR (NOT is_hierarchical AND max_depth IS NULL)
    ),
    CONSTRAINT dimension_type_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT dimension_type_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT dimension_type_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT dimension_type_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.dimension_type IS
  'Catalog of additional tenant-configurable accounting dimensions. Core cost center, profit center, and project coordinates remain first-class columns.';

CREATE TABLE master.dimension_value (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    dimension_type_id     uuid                         NOT NULL,
    company_code_id       uuid,
    parent_id             uuid,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    description           text,
    is_posting_allowed    boolean                      NOT NULL DEFAULT true,
    is_budgeting_allowed  boolean                      NOT NULL DEFAULT true,
    is_planning_allowed   boolean                      NOT NULL DEFAULT true,
    effective_from        date,
    effective_to          date,
    sort_order            integer                      NOT NULL DEFAULT 0,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.organization_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT dimension_value_pkey PRIMARY KEY (id),
    CONSTRAINT dimension_value_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT dimension_value_type_identity_uq
        UNIQUE (tenant_id, dimension_type_id, id),
    CONSTRAINT dimension_value_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT dimension_value_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT dimension_value_parent_self_chk CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT dimension_value_effective_range_chk CHECK (
        effective_to IS NULL
        OR effective_from IS NULL
        OR effective_to >= effective_from
    ),
    CONSTRAINT dimension_value_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT dimension_value_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT dimension_value_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT dimension_value_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.dimension_value IS
  'Value of an additional accounting dimension. Tenant/company scope and hierarchy consistency are enforced at the database boundary.';

CREATE TABLE master.dimension_set (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    set_hash              bytea       NOT NULL,
    dimension_count       smallint    NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT dimension_set_pkey PRIMARY KEY (id),
    CONSTRAINT dimension_set_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT dimension_set_tenant_hash_uq UNIQUE (tenant_id, set_hash),
    CONSTRAINT dimension_set_hash_chk CHECK (octet_length(set_hash) = 32),
    CONSTRAINT dimension_set_count_chk CHECK (dimension_count BETWEEN 1 AND 64)
);

COMMENT ON TABLE master.dimension_set IS
  'Immutable content-addressed combination of additional dimension values. It is created only through master.fn_resolve_dimension_set.';

CREATE TABLE master.dimension_set_item (
    tenant_id             uuid        NOT NULL,
    dimension_set_id      uuid        NOT NULL,
    dimension_type_id     uuid        NOT NULL,
    dimension_value_id    uuid        NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT dimension_set_item_pkey
        PRIMARY KEY (tenant_id, dimension_set_id, dimension_type_id)
);

COMMENT ON TABLE master.dimension_set_item IS
  'Immutable type/value member of a dimension set. One value per type is enforced by the primary key.';

-- ============================================================================
-- Neon accounting foundation
-- ============================================================================

CREATE TABLE master.accounting_profile (
    id                    uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                  NOT NULL,
    code                  text                                  NOT NULL,
    name                  text                                  NOT NULL,
    description           text,
    direction             master.accounting_profile_direction_d NOT NULL DEFAULT 'INBOUND',
    subledger_type        master.accounting_subledger_d          NOT NULL DEFAULT 'AP',
    domain_hint           text,
    icon_key              text,
    color_token           text,
    sort_order            smallint                              NOT NULL DEFAULT 0,
    metadata              jsonb                                  NOT NULL DEFAULT '{}'::jsonb,
    status                master.finance_setup_status_d          NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                            NOT NULL DEFAULT now(),
    created_by            uuid                                   NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT accounting_profile_pkey PRIMARY KEY (id),
    CONSTRAINT accounting_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT accounting_profile_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT accounting_profile_code_chk CHECK (code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,62}$'),
    CONSTRAINT accounting_profile_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT accounting_profile_direction_subledger_chk CHECK (
        (direction = 'INBOUND' AND subledger_type IN ('AP', 'ASSET', 'INVENTORY', 'WIP'))
        OR (direction = 'OUTBOUND' AND subledger_type IN ('AR', 'COMMISSION'))
        OR direction = 'BILATERAL'
    ),
    CONSTRAINT accounting_profile_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT accounting_profile_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT accounting_profile_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT accounting_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.accounting_profile IS
  'Stable AP/AR/subledger accounting-profile identity. Versioned routing configuration remains outside this master record.';

CREATE TABLE master.chart_of_account (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    description           text,
    framework             text,
    country_code          character(2),
    account_range         text                         DEFAULT '1000-9999',
    version               integer                      NOT NULL DEFAULT 1,
    is_locked             boolean                      NOT NULL DEFAULT false,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.finance_setup_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT chart_of_account_pkey PRIMARY KEY (id),
    CONSTRAINT chart_of_account_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT chart_of_account_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT chart_of_account_code_chk CHECK (code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,62}$'),
    CONSTRAINT chart_of_account_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT chart_of_account_country_chk
        CHECK (country_code IS NULL OR country_code::text ~ '^[A-Z]{2}$'),
    CONSTRAINT chart_of_account_version_chk CHECK (version > 0),
    CONSTRAINT chart_of_account_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT chart_of_account_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT chart_of_account_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.gl_account (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    chart_of_account_id   uuid                         NOT NULL,
    parent_id             uuid,
    level_no              smallint                     NOT NULL DEFAULT 1,
    path                  text,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    description           text,
    account_class         master.gl_account_class_d    NOT NULL,
    node_type             master.gl_node_type_d        NOT NULL DEFAULT 'posting',
    normal_balance        master.normal_balance_d      NOT NULL,
    subledger_type        master.accounting_subledger_d,
    currency_code         character(3),
    is_reconciling        boolean                      NOT NULL DEFAULT false,
    is_blocked            boolean                      NOT NULL DEFAULT false,
    sort_order            smallint                     NOT NULL DEFAULT 0,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.finance_setup_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT gl_account_pkey PRIMARY KEY (id),
    CONSTRAINT gl_account_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT gl_account_chart_identity_uq UNIQUE (tenant_id, chart_of_account_id, id),
    CONSTRAINT gl_account_chart_code_uq UNIQUE (tenant_id, chart_of_account_id, code),
    CONSTRAINT gl_account_parent_self_chk CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT gl_account_level_chk CHECK (level_no BETWEEN 1 AND 32),
    CONSTRAINT gl_account_path_chk CHECK (path IS NULL OR btrim(path) <> ''),
    CONSTRAINT gl_account_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT gl_account_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT gl_account_currency_chk
        CHECK (currency_code IS NULL OR currency_code::text ~ '^[A-Z]{3}$'),
    CONSTRAINT gl_account_header_semantics_chk CHECK (
        node_type = 'posting'
        OR (
            subledger_type IS NULL
            AND currency_code IS NULL
            AND is_reconciling = false
        )
    ),
    CONSTRAINT gl_account_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT gl_account_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT gl_account_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT gl_account_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.gl_account IS
  'Natural account within one chart. Parent identity includes tenant and chart, preventing cross-chart trees.';

CREATE TABLE master.ledger_book (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    description           text,
    category              master.ledger_book_category_d NOT NULL DEFAULT 'statutory',
    reporting_standard    text,
    base_currency_code    character(3)                 NOT NULL DEFAULT 'USD',
    is_primary            boolean                      NOT NULL DEFAULT false,
    is_auto_post          boolean                      NOT NULL DEFAULT true,
    is_approval_required  boolean                      NOT NULL DEFAULT false,
    is_manual_je_allowed  boolean                      NOT NULL DEFAULT true,
    is_reversal_allowed   boolean                      NOT NULL DEFAULT true,
    close_mode            master.ledger_close_mode_d   NOT NULL DEFAULT 'unified',
    sort_order            smallint                     NOT NULL DEFAULT 0,
    color_code            text,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.finance_setup_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT ledger_book_pkey PRIMARY KEY (id),
    CONSTRAINT ledger_book_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT ledger_book_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT ledger_book_code_chk CHECK (code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,62}$'),
    CONSTRAINT ledger_book_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT ledger_book_currency_chk CHECK (base_currency_code::text ~ '^[A-Z]{3}$'),
    CONSTRAINT ledger_book_reporting_standard_chk
        CHECK (reporting_standard IS NULL OR btrim(reporting_standard) <> ''),
    CONSTRAINT ledger_book_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT ledger_book_color_chk
        CHECK (color_code IS NULL OR color_code ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT ledger_book_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT ledger_book_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT ledger_book_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.company_code_chart_assignment (
    id                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                              NOT NULL,
    company_code_id       uuid                              NOT NULL,
    chart_of_account_id   uuid                              NOT NULL,
    assignment_type       master.chart_assignment_type_d    NOT NULL DEFAULT 'operating',
    is_primary            boolean                           NOT NULL DEFAULT false,
    effective_from        date,
    effective_to          date,
    metadata              jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                master.finance_setup_status_d     NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                       NOT NULL DEFAULT now(),
    created_by            uuid                              NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT company_code_chart_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT company_code_chart_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT company_code_chart_assignment_identity_uq
        UNIQUE (tenant_id, company_code_id, chart_of_account_id, assignment_type),
    CONSTRAINT company_code_chart_assignment_effective_chk
        CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
    CONSTRAINT company_code_chart_assignment_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT company_code_chart_assignment_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_code_chart_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.company_code_book_assignment (
    id                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                              NOT NULL,
    company_code_id       uuid                              NOT NULL,
    book_id               uuid                              NOT NULL,
    alternate_coa_prefix  text,
    override_currency_code character(3),
    effective_from        date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_to          date,
    priority              smallint                          NOT NULL DEFAULT 0,
    conflict_strategy     master.book_conflict_strategy_d   NOT NULL DEFAULT 'highest_priority',
    metadata              jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                master.finance_setup_status_d     NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                       NOT NULL DEFAULT now(),
    created_by            uuid                              NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT company_code_book_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT company_code_book_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT company_code_book_assignment_identity_uq
        UNIQUE (tenant_id, company_code_id, book_id, effective_from),
    CONSTRAINT company_code_book_assignment_effective_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT company_code_book_assignment_priority_chk CHECK (priority >= 0),
    CONSTRAINT company_code_book_assignment_currency_chk
        CHECK (override_currency_code IS NULL OR override_currency_code::text ~ '^[A-Z]{3}$'),
    CONSTRAINT company_code_book_assignment_prefix_chk
        CHECK (alternate_coa_prefix IS NULL OR btrim(alternate_coa_prefix) <> ''),
    CONSTRAINT company_code_book_assignment_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT company_code_book_assignment_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_code_book_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.fiscal_period (
    id                    uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                           NOT NULL,
    company_code_id       uuid                           NOT NULL,
    code                  text                           NOT NULL,
    name                  text                           NOT NULL,
    fiscal_year           smallint                       NOT NULL,
    period_number         smallint                       NOT NULL,
    period_type           master.fiscal_period_type_d    NOT NULL DEFAULT 'normal',
    start_date            date                           NOT NULL,
    end_date              date                           NOT NULL,
    fiscal_calendar_config_id uuid,
    calendar_version_no   integer,
    generation_key        text,
    generated_at          timestamptz,
    is_adjustment         boolean GENERATED ALWAYS AS (period_type = 'adjustment') STORED,
    opened_at             timestamptz,
    opened_by             uuid,
    soft_closed_at        timestamptz,
    soft_closed_by        uuid,
    hard_closed_at        timestamptz,
    hard_closed_by        uuid,
    sort_order            smallint                       NOT NULL DEFAULT 0,
    metadata              jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                master.fiscal_period_status_d  NOT NULL DEFAULT 'future',
    is_active             boolean GENERATED ALWAYS AS (status IN ('open', 'soft_close')) STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                    NOT NULL DEFAULT now(),
    created_by            uuid                           NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT fiscal_period_pkey PRIMARY KEY (id),
    CONSTRAINT fiscal_period_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fiscal_period_company_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT fiscal_period_coordinates_uq
        UNIQUE (tenant_id, company_code_id, fiscal_year, period_number),
    CONSTRAINT fiscal_period_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT fiscal_period_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT fiscal_period_year_chk CHECK (fiscal_year BETWEEN 1900 AND 9999),
    CONSTRAINT fiscal_period_number_chk CHECK (period_number BETWEEN 0 AND 99),
    CONSTRAINT fiscal_period_type_number_chk CHECK (
        (period_type = 'opening' AND period_number = 0)
        OR (period_type = 'normal' AND period_number BETWEEN 1 AND 16)
        OR (period_type IN ('adjustment', 'closing') AND period_number BETWEEN 1 AND 99)
    ),
    CONSTRAINT fiscal_period_date_chk CHECK (end_date >= start_date),
    CONSTRAINT fiscal_period_calendar_provenance_chk CHECK (
        (
            fiscal_calendar_config_id IS NULL
            AND calendar_version_no IS NULL
            AND generation_key IS NULL
            AND generated_at IS NULL
        )
        OR (
            fiscal_calendar_config_id IS NOT NULL
            AND calendar_version_no IS NOT NULL
            AND generation_key IS NOT NULL
            AND generated_at IS NOT NULL
        )
    ),
    CONSTRAINT fiscal_period_calendar_version_chk
        CHECK (calendar_version_no IS NULL OR calendar_version_no > 0),
    CONSTRAINT fiscal_period_opened_pair_chk CHECK ((opened_at IS NULL) = (opened_by IS NULL)),
    CONSTRAINT fiscal_period_soft_closed_pair_chk
        CHECK ((soft_closed_at IS NULL) = (soft_closed_by IS NULL)),
    CONSTRAINT fiscal_period_hard_closed_pair_chk
        CHECK ((hard_closed_at IS NULL) = (hard_closed_by IS NULL)),
    CONSTRAINT fiscal_period_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT fiscal_period_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT fiscal_period_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT fiscal_period_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON COLUMN master.fiscal_period.fiscal_calendar_config_id IS
  'Immutable provenance link to the fiscal-calendar version that generated the period.';

CREATE TABLE master.fx_rate (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    from_currency         character(3)                 NOT NULL,
    to_currency           character(3)                 NOT NULL,
    rate                  numeric(18,10)                NOT NULL,
    inverse_rate          numeric(18,10) GENERATED ALWAYS AS (round(1.0 / rate, 10)) STORED,
    rate_type             master.fx_rate_type_d        NOT NULL,
    effective_date        date                         NOT NULL,
    effective_time        time,
    source                master.fx_rate_source_d      NOT NULL DEFAULT 'MANUAL',
    source_reference      text,
    version_no            integer                      NOT NULL DEFAULT 1,
    supersedes_id         uuid,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.fx_rate_status_d      NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT fx_rate_pkey PRIMARY KEY (id),
    CONSTRAINT fx_rate_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fx_rate_series_identity_uq
        UNIQUE (tenant_id, from_currency, to_currency, rate_type, source, effective_date, version_no),
    CONSTRAINT fx_rate_currency_chk CHECK (
        from_currency::text ~ '^[A-Z]{3}$'
        AND to_currency::text ~ '^[A-Z]{3}$'
        AND from_currency <> to_currency
    ),
    CONSTRAINT fx_rate_positive_chk CHECK (rate > 0),
    CONSTRAINT fx_rate_version_chk CHECK (version_no > 0),
    CONSTRAINT fx_rate_supersedes_self_chk CHECK (supersedes_id IS DISTINCT FROM id),
    CONSTRAINT fx_rate_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT fx_rate_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT fx_rate_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.fx_rate IS
  'Immutable append-only FX observation. Corrections create a successor in the same currency/rate/source series.';

CREATE TABLE master.company_code_dimension_default (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    company_code_id       uuid                         NOT NULL,
    dimension_type_id     uuid                         NOT NULL,
    dimension_value_id    uuid                         NOT NULL,
    is_mandatory          boolean                      NOT NULL DEFAULT false,
    allow_override        boolean                      NOT NULL DEFAULT true,
    effective_from        date                         NOT NULL DEFAULT CURRENT_DATE,
    effective_to          date,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.finance_setup_status_d NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT company_code_dimension_default_pkey PRIMARY KEY (id),
    CONSTRAINT company_code_dimension_default_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT company_code_dimension_default_identity_uq
        UNIQUE (tenant_id, company_code_id, dimension_type_id, effective_from),
    CONSTRAINT company_code_dimension_default_effective_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT company_code_dimension_default_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT company_code_dimension_default_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_code_dimension_default_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.company_code_gl_account (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    company_code_id       uuid                         NOT NULL,
    gl_account_id         uuid                         NOT NULL,
    posting_allowed       boolean                      NOT NULL DEFAULT true,
    blocked_for_manual    boolean                      NOT NULL DEFAULT false,
    blocked_for_auto      boolean                      NOT NULL DEFAULT false,
    requires_cost_center  boolean                      NOT NULL DEFAULT false,
    requires_profit_center boolean                     NOT NULL DEFAULT false,
    requires_project      boolean                      NOT NULL DEFAULT false,
    default_cost_center_id uuid,
    default_site_id       uuid,
    tax_category          text,
    reconciliation_type   text,
    metadata              jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                master.finance_setup_status_d NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                  NOT NULL DEFAULT now(),
    created_by            uuid                         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT company_code_gl_account_pkey PRIMARY KEY (id),
    CONSTRAINT company_code_gl_account_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT company_code_gl_account_identity_uq
        UNIQUE (tenant_id, company_code_id, gl_account_id),
    CONSTRAINT company_code_gl_account_default_cost_chk
        CHECK (default_cost_center_id IS NULL OR requires_cost_center),
    CONSTRAINT company_code_gl_account_reconciliation_chk
        CHECK (reconciliation_type IS NULL OR btrim(reconciliation_type) <> ''),
    CONSTRAINT company_code_gl_account_tax_category_chk
        CHECK (tax_category IS NULL OR btrim(tax_category) <> ''),
    CONSTRAINT company_code_gl_account_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT company_code_gl_account_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_code_gl_account_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.company_code_gl_account IS
  'Per-company posting controls for a chart account. Redundant code/name coordinates are intentionally excluded.';

COMMENT ON COLUMN master.company_code_gl_account.default_site_id IS
  'Compatibility coordinate used by finance configuration. FK is deferred until master.site moves to the new foundation.';

-- ============================================================================
-- Neon operational banking foundation
-- ============================================================================


CREATE TABLE master.bank_provisional_reference (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
 tenant_id uuid NOT NULL REFERENCES master.tenant(id),
 submitted_name text NOT NULL CHECK (btrim(submitted_name) <> ''),
 submitted_country character(2) NOT NULL REFERENCES shared.country(code),
 submitted_bic text,
 status text NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved','resolved','rejected')),
 resolved_institution_id uuid REFERENCES shared.bank_institution(id),
 resolved_branch_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (resolved_institution_id,resolved_branch_id) REFERENCES shared.bank_branch(institution_id,id),
 CHECK ((status='resolved') = (resolved_institution_id IS NOT NULL)),
 CHECK (resolved_branch_id IS NULL OR resolved_institution_id IS NOT NULL)
);

CREATE TABLE master.bank_account (
    id                    uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                           NOT NULL,
    code                  text,
    name                  text,
    bank_institution_id         uuid,
    bank_branch_id uuid,
    provisional_bank_reference_id uuid,
    account_holder_name   text                           NOT NULL,
    account_id_type       master.bank_account_id_type_d  NOT NULL,
    account_id_value      text                           NOT NULL,
    account_last4         text                           NOT NULL,
    currency_code         character(3)                   NOT NULL,
    bic_override          text,
    bank_name_override    text,
    bank_country_override character(2),
    account_nature        master.bank_account_nature_d   NOT NULL DEFAULT 'direct',
    provider_account_ref  text,
    correspondent_bank_institution_id uuid,
    is_verified           boolean                        NOT NULL DEFAULT false,
    verified_at           timestamptz,
    verified_by           uuid,
    verification_method   master.bank_verification_method_d,
    metadata              jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                master.bank_account_status_d   NOT NULL DEFAULT 'pending_verification',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                    NOT NULL DEFAULT now(),
    created_by            uuid                           NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT bank_account_pkey PRIMARY KEY (id),
    CONSTRAINT bank_account_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_account_code_chk
        CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT bank_account_name_chk
        CHECK (name IS NULL OR btrim(name) <> ''),
    CONSTRAINT bank_account_holder_chk CHECK (btrim(account_holder_name) <> ''),
    CONSTRAINT bank_account_identifier_chk
        CHECK (account_id_value ~ '^[A-Z0-9]{4,64}$'),
    CONSTRAINT bank_account_last4_chk CHECK (
        account_last4 ~ '^[A-Z0-9]{4}$' AND (
          (metadata->>'protectedValueToken' IS NULL AND account_last4=right(account_id_value,4))
          OR (metadata->>'protectedValueToken' IS NOT NULL AND account_id_value~'^[A-F0-9]{64}$')
        )
    ),
    CONSTRAINT bank_account_currency_chk CHECK (currency_code::text ~ '^[A-Z]{3}$'),
    CONSTRAINT bank_account_bank_identity_chk CHECK (
        (
            bank_institution_id IS NOT NULL
            AND bank_name_override IS NULL
            AND bank_country_override IS NULL
        )
        OR (
            bank_institution_id IS NULL
            AND bank_name_override IS NOT NULL
            AND btrim(bank_name_override) <> ''
            AND bank_country_override IS NOT NULL
        )
    ),
    CONSTRAINT bank_account_override_country_chk CHECK (
        bank_country_override IS NULL
        OR bank_country_override::text ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT bank_account_bic_override_chk CHECK (
        bic_override IS NULL
        OR bic_override ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'
    ),
    CONSTRAINT bank_account_correspondent_self_chk
        CHECK (
            correspondent_bank_institution_id IS NULL
            OR correspondent_bank_institution_id IS DISTINCT FROM bank_institution_id
        ),
    CONSTRAINT bank_account_provider_ref_chk
        CHECK (provider_account_ref IS NULL OR btrim(provider_account_ref) <> ''),
    CONSTRAINT bank_account_verification_evidence_chk CHECK (
        (
            NOT is_verified
            AND verified_at IS NULL
            AND verified_by IS NULL
            AND verification_method IS NULL
        )
        OR (
            is_verified
            AND verified_at IS NOT NULL
            AND verified_by IS NOT NULL
            AND verification_method IS NOT NULL
        )
    ),
    CONSTRAINT bank_account_active_verification_chk
        CHECK (status <> 'active' OR is_verified),
    CONSTRAINT bank_account_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bank_account_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bank_account_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON COLUMN master.bank_account.account_id_value IS
  'Sensitive normalized identifier for legacy rows; protected registrations store a SHA-256 fingerprint here and keep the raw value only in protected storage.';

CREATE TABLE master.bank_account_link (
    id                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                              NOT NULL,
    owner_type_id         uuid                              NOT NULL,
    owner_type            text                              NOT NULL,
    owner_id              uuid                              NOT NULL,
    relationship_role     master.bank_relationship_role_d   NOT NULL,
    bank_account_id       uuid                              NOT NULL,
    company_code_id       uuid,
    purpose               text                              NOT NULL DEFAULT 'default',
    is_primary            boolean                           NOT NULL DEFAULT false,
    effective_from        date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_until       date,
    metadata              jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz                       NOT NULL DEFAULT now(),
    created_by            uuid                              NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT bank_account_link_pkey PRIMARY KEY (id),
    CONSTRAINT bank_account_link_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_account_link_owner_code_chk
        CHECK (owner_type ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT bank_account_link_purpose_chk
        CHECK (purpose ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT bank_account_link_company_owner_chk CHECK (
        owner_type <> 'company_code'
        OR company_code_id = owner_id
    ),
    CONSTRAINT bank_account_link_effective_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT bank_account_link_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bank_account_link_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT bank_account_link_no_overlap EXCLUDE USING gist (
        tenant_id WITH =,
        owner_type_id WITH =,
        owner_id WITH =,
        bank_account_id WITH =,
        purpose WITH =,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ),
    CONSTRAINT bank_account_link_primary_no_overlap EXCLUDE USING gist (
        tenant_id WITH =,
        owner_type_id WITH =,
        owner_id WITH =,
        purpose WITH =,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (is_primary)
);

COMMENT ON COLUMN master.bank_account_link.owner_type IS
  'Compatibility code retained for existing services. owner_type_id is authoritative and a trigger enforces exact registry-code agreement.';

CREATE TABLE master.bank_account_house_config (
    id                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                              NOT NULL,
    bank_account_link_id  uuid                              NOT NULL,
    gl_account_id         uuid                              NOT NULL,
    local_account_type    text,
    account_nickname      text,
    usage_type            master.house_bank_usage_d         NOT NULL DEFAULT 'disbursement',
    is_disbursement_enabled boolean                         NOT NULL DEFAULT true,
    is_collection_enabled boolean                           NOT NULL DEFAULT false,
    is_default_disbursement boolean                         NOT NULL DEFAULT false,
    is_default_collection boolean                           NOT NULL DEFAULT false,
    priority              smallint                          NOT NULL DEFAULT 0,
    is_manual_payment_allowed boolean                       NOT NULL DEFAULT true,
    is_payment_file_allowed boolean                         NOT NULL DEFAULT true,
    reconciliation_mode   master.bank_reconciliation_mode_d NOT NULL DEFAULT 'manual',
    metadata              jsonb                              NOT NULL DEFAULT '{}'::jsonb,
    status                master.finance_setup_status_d      NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                       NOT NULL DEFAULT now(),
    created_by            uuid                              NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT bank_account_house_config_pkey PRIMARY KEY (id),
    CONSTRAINT bank_account_house_config_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_account_house_config_link_uq UNIQUE (tenant_id, bank_account_link_id),
    CONSTRAINT bank_account_house_config_local_type_chk
        CHECK (local_account_type IS NULL OR btrim(local_account_type) <> ''),
    CONSTRAINT bank_account_house_config_nickname_chk
        CHECK (account_nickname IS NULL OR btrim(account_nickname) <> ''),
    CONSTRAINT bank_account_house_config_default_disb_chk
        CHECK (NOT is_default_disbursement OR is_disbursement_enabled),
    CONSTRAINT bank_account_house_config_default_coll_chk
        CHECK (NOT is_default_collection OR is_collection_enabled),
    CONSTRAINT bank_account_house_config_priority_chk CHECK (priority >= 0),
    CONSTRAINT bank_account_house_config_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bank_account_house_config_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bank_account_house_config_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- ============================================================================
-- Neon payment method catalog.
-- Canonical payment method reference used by payment policy and bank-interface
-- resolvers. This table is intentionally tenant-scoped and immutable via seeds.
-- ============================================================================

CREATE TABLE master.payment_method (
    id                     uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid        NOT NULL,
    code                   text        NOT NULL,
    name                   text        NOT NULL,
    description            text,
    direction              text        NOT NULL DEFAULT 'both',
    instrument_mode        text        NOT NULL,
    requires_bank_account   boolean     NOT NULL DEFAULT true,
    requires_counterparty_bank boolean  NOT NULL DEFAULT true,
    requires_bank_interface boolean     NOT NULL DEFAULT true,
    requires_reference_number boolean   NOT NULL DEFAULT false,
    supports_batch         boolean     NOT NULL DEFAULT true,
    supports_partial       boolean     NOT NULL DEFAULT false,
    supports_reversal      boolean     NOT NULL DEFAULT true,
    supports_file_generation boolean   NOT NULL DEFAULT true,
    supports_real_time_api  boolean    NOT NULL DEFAULT false,
    sort_order             smallint    NOT NULL DEFAULT 0,
    metadata               jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                 text        NOT NULL DEFAULT 'active',
    is_active              boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz  NOT NULL DEFAULT now(),
    created_by             uuid         NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT payment_method_pkey PRIMARY KEY (id),
    CONSTRAINT payment_method_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT payment_method_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT payment_method_code_nonempty
        CHECK (btrim(code) <> ''),
    CONSTRAINT payment_method_name_nonempty
        CHECK (btrim(name) <> ''),
    CONSTRAINT payment_method_direction_chk
        CHECK (direction IN ('outbound','inbound','both')),
    CONSTRAINT payment_method_instrument_nonempty
        CHECK (btrim(instrument_mode) <> ''),
    CONSTRAINT payment_method_sort_order_chk
        CHECK (sort_order >= 0),
    CONSTRAINT payment_method_status_chk
        CHECK (status IN ('active','inactive','archived')),
    CONSTRAINT payment_method_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT payment_method_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT payment_method_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE master.payment_method IS
  'Tenant payment-method reference catalog: capabilities and defaults for execution.';
COMMENT ON COLUMN master.payment_method.direction IS
  'Direction scope for the method: outbound (payable), inbound (receivable), both.';
COMMENT ON COLUMN master.payment_method.instrument_mode IS
  'Instrument type family used for dispatch routing and provider integrations.';

-- ============================================================================
-- Neon payment-term aggregate
-- An active definition and all of its children are permanently immutable.
-- Business changes require a new payment term with a new code and id.
-- ============================================================================

CREATE TABLE master.payment_term (
    id                       uuid                                      NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                                      NOT NULL,
    code                     text                                      NOT NULL,
    name                     text                                      NOT NULL,
    description              text,
    applicable_to            master.payment_term_applicability_d       NOT NULL DEFAULT 'BOTH',
    base_event               master.payment_term_base_event_d          NOT NULL DEFAULT 'INVOICE_DATE',
    due_rule_type            master.payment_term_due_rule_d            NOT NULL DEFAULT 'NET_DAYS',
    due_days                 smallint,
    due_day_of_month         smallint,
    grace_days               smallint                                  NOT NULL DEFAULT 0,
    due_date_flexibility     master.payment_term_flexibility_d         NOT NULL DEFAULT 'FIXED',
    business_day_convention  master.business_day_convention_d         NOT NULL DEFAULT 'NONE',
    holiday_calendar_id      uuid,
    month_offset             smallint                                  NOT NULL DEFAULT 0,
    term_category            text                                      NOT NULL DEFAULT 'standard',
    installment_count        smallint,
    version                  integer                                   NOT NULL DEFAULT 1,
    is_current_version       boolean                                   NOT NULL DEFAULT true,
    discount_selection_mode  master.payment_term_discount_selection_d NOT NULL DEFAULT 'BEST_ELIGIBLE',
    replaces_payment_term_id uuid,
    sort_order               smallint                                  NOT NULL DEFAULT 0,
    metadata                 jsonb                                     NOT NULL DEFAULT '{}'::jsonb,
    status                   master.payment_term_status_d              NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                               NOT NULL DEFAULT now(),
    created_by               uuid                                      NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT payment_term_pkey PRIMARY KEY (id),
    CONSTRAINT payment_term_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT payment_term_tenant_code_version_uq UNIQUE (tenant_id, code, version),
    CONSTRAINT payment_term_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT payment_term_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT payment_term_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT payment_term_due_days_chk
        CHECK (due_days IS NULL OR due_days >= 0),
    CONSTRAINT payment_term_net_days_chk
        CHECK (due_rule_type <> 'NET_DAYS' OR due_days IS NOT NULL),
    CONSTRAINT payment_term_no_days_chk
        CHECK (due_rule_type NOT IN ('COD', 'PREPAID') OR due_days IS NULL),
    CONSTRAINT payment_term_due_day_chk
        CHECK (
            (due_rule_type = 'FIXED_DAY'
             AND due_day_of_month IS NOT NULL
             AND due_day_of_month BETWEEN 1 AND 31)
            OR
            (due_rule_type <> 'FIXED_DAY'
             AND due_day_of_month IS NULL)
        ),
    CONSTRAINT payment_term_grace_days_chk CHECK (grace_days >= 0),
    CONSTRAINT payment_term_calendar_chk
        CHECK (
            business_day_convention = 'NONE'
            OR holiday_calendar_id IS NOT NULL
        ),
    CONSTRAINT payment_term_month_offset_chk
        CHECK (month_offset BETWEEN 0 AND 12),
    CONSTRAINT payment_term_category_chk
        CHECK (term_category ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT payment_term_version_chk
        CHECK (version >= 1),
    CONSTRAINT payment_term_installment_chk
        CHECK (installment_count IS NULL OR installment_count >= 1),
    CONSTRAINT payment_term_replaces_self_chk
        CHECK (replaces_payment_term_id IS DISTINCT FROM id),
    CONSTRAINT payment_term_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT payment_term_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT payment_term_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT payment_term_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.payment_term IS
  'Tenant payment-term aggregate. Once active, the header, clauses, and discount tiers are immutable; create a new code to change commercial terms.';
COMMENT ON COLUMN master.payment_term.holiday_calendar_id IS
  'Compatibility reference. The tenant-scoped FK is added when master.holiday_calendar moves into the new foundation.';

CREATE TABLE master.payment_term_clause (
    id                         uuid                                    NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid                                    NOT NULL,
    payment_term_id            uuid                                    NOT NULL,
    clause_code                text                                    NOT NULL,
    clause_type                master.payment_term_clause_type_d       NOT NULL,
    sequence_no                smallint                                NOT NULL,
    settles_clause_code        text,
    application_scope          master.payment_term_application_scope_d NOT NULL DEFAULT 'HEADER',
    basis_amount_mode          master.payment_term_basis_mode_d        NOT NULL DEFAULT 'GROSS',
    calc_mode                  master.payment_term_calc_mode_d         NOT NULL DEFAULT 'PERCENT',
    default_pct                numeric(7,4),
    default_amount             numeric(18,4),
    currency_code              character(3),
    flexibility_mode           master.payment_term_flexibility_d       NOT NULL DEFAULT 'FIXED',
    min_pct                    numeric(7,4),
    max_pct                    numeric(7,4),
    min_amount                 numeric(18,4),
    max_amount                 numeric(18,4),
    cumulative_cap_pct         numeric(7,4),
    cumulative_cap_amount      numeric(18,4),
    trigger_event              text,
    release_event              text,
    release_delay_days         smallint,
    recovery_start_after_pct   numeric(7,4),
    recovery_end_before_pct    numeric(7,4),
    recovery_method            text,
    partial_release_pct        numeric(7,4),
    partial_release_event      text,
    rounding_method            master.payment_term_rounding_method_d   NOT NULL DEFAULT 'ROUND_HALF_UP',
    rounding_scale             smallint                                NOT NULL DEFAULT 2,
    metadata                   jsonb                                   NOT NULL DEFAULT '{}'::jsonb,
    created_at                 timestamptz                             NOT NULL DEFAULT now(),
    created_by                 uuid                                    NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT payment_term_clause_pkey PRIMARY KEY (id),
    CONSTRAINT payment_term_clause_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT payment_term_clause_term_code_uq
        UNIQUE (tenant_id, payment_term_id, clause_code),
    CONSTRAINT payment_term_clause_term_sequence_uq
        UNIQUE (tenant_id, payment_term_id, sequence_no),
    CONSTRAINT payment_term_clause_code_chk
        CHECK (clause_code ~ '^[A-Z][A-Z0-9_]{1,62}$'),
    CONSTRAINT payment_term_clause_sequence_chk CHECK (sequence_no > 0),
    CONSTRAINT payment_term_clause_settles_self_chk
        CHECK (settles_clause_code IS DISTINCT FROM clause_code),
    CONSTRAINT payment_term_clause_settles_shape_chk CHECK (
        (
            clause_type IN ('ADVANCE_RECOVERY', 'RETENTION_RELEASE')
            AND settles_clause_code IS NOT NULL
        )
        OR
        (
            clause_type IN ('ADVANCE', 'RETENTION')
            AND settles_clause_code IS NULL
        )
    ),
    CONSTRAINT payment_term_clause_calculation_chk CHECK (
        (
            calc_mode = 'PERCENT'
            AND default_pct IS NOT NULL
            AND default_pct > 0 AND default_pct <= 100
            AND default_amount IS NULL
            AND currency_code IS NULL
        )
        OR
        (
            calc_mode = 'FIXED_AMOUNT'
            AND default_amount IS NOT NULL
            AND default_amount > 0
            AND currency_code IS NOT NULL
            AND default_pct IS NULL
        )
    ),
    CONSTRAINT payment_term_clause_flexibility_chk CHECK (
        (
            flexibility_mode = 'FIXED'
            AND min_pct IS NULL AND max_pct IS NULL
            AND min_amount IS NULL AND max_amount IS NULL
        )
        OR
        (
            flexibility_mode = 'FLEXIBLE'
            AND (
                (
                    calc_mode = 'PERCENT'
                    AND min_pct IS NOT NULL AND max_pct IS NOT NULL
                    AND min_pct > 0 AND max_pct <= 100
                    AND min_pct <= default_pct AND default_pct <= max_pct
                    AND min_amount IS NULL AND max_amount IS NULL
                )
                OR
                (
                    calc_mode = 'FIXED_AMOUNT'
                    AND min_amount IS NOT NULL AND max_amount IS NOT NULL
                    AND min_amount > 0 AND min_amount <= default_amount
                    AND default_amount <= max_amount
                    AND min_pct IS NULL AND max_pct IS NULL
                )
            )
        )
    ),
    CONSTRAINT payment_term_clause_cap_chk CHECK (
        NOT (
            cumulative_cap_pct IS NOT NULL
            AND cumulative_cap_amount IS NOT NULL
        )
        AND (
            cumulative_cap_pct IS NULL
            OR cumulative_cap_pct > 0 AND cumulative_cap_pct <= 100
        )
        AND (
            cumulative_cap_amount IS NULL
            OR cumulative_cap_amount > 0
        )
    ),
    CONSTRAINT payment_term_clause_recovery_chk CHECK (
        (
            clause_type = 'ADVANCE_RECOVERY'
            AND recovery_method IS NOT NULL
            AND (
                recovery_start_after_pct IS NULL
                OR recovery_start_after_pct BETWEEN 0 AND 100
            )
            AND (
                recovery_end_before_pct IS NULL
                OR recovery_end_before_pct BETWEEN 0 AND 100
            )
            AND (
                recovery_start_after_pct IS NULL
                OR recovery_end_before_pct IS NULL
                OR recovery_start_after_pct < recovery_end_before_pct
            )
        )
        OR
        (
            clause_type <> 'ADVANCE_RECOVERY'
            AND recovery_method IS NULL
            AND recovery_start_after_pct IS NULL
            AND recovery_end_before_pct IS NULL
        )
    ),
    CONSTRAINT payment_term_clause_release_chk CHECK (
        (
            clause_type = 'RETENTION_RELEASE'
            AND release_event IS NOT NULL
            AND (release_delay_days IS NULL OR release_delay_days >= 0)
        )
        OR
        (
            clause_type <> 'RETENTION_RELEASE'
            AND release_event IS NULL
            AND release_delay_days IS NULL
        )
    ),
    CONSTRAINT payment_term_clause_partial_release_chk CHECK (
        (
            partial_release_pct IS NULL
            AND partial_release_event IS NULL
        )
        OR
        (
            clause_type = 'RETENTION_RELEASE'
            AND partial_release_pct IS NOT NULL
            AND partial_release_pct > 0
            AND partial_release_pct <= 100
            AND partial_release_event IS NOT NULL
        )
    ),
    CONSTRAINT payment_term_clause_rounding_scale_chk
        CHECK (rounding_scale BETWEEN 0 AND 6),
    CONSTRAINT payment_term_clause_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT payment_term_clause_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.payment_term_discount_tier (
    id                    uuid                                 NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                 NOT NULL,
    payment_term_id       uuid                                 NOT NULL,
    tier_no               smallint                             NOT NULL,
    qualify_within_days   smallint                             NOT NULL,
    discount_pct          numeric(7,4),
    discount_fixed        numeric(18,4),
    currency_code         character(3),
    discount_basis_mode   master.payment_term_discount_basis_d NOT NULL DEFAULT 'GROSS',
    min_invoice_amount    numeric(18,4),
    metadata              jsonb                                NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz                          NOT NULL DEFAULT now(),
    created_by            uuid                                 NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT payment_term_discount_tier_pkey PRIMARY KEY (id),
    CONSTRAINT payment_term_discount_tier_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT payment_term_discount_tier_number_uq
        UNIQUE (tenant_id, payment_term_id, tier_no),
    CONSTRAINT payment_term_discount_tier_days_uq
        UNIQUE (tenant_id, payment_term_id, qualify_within_days),
    CONSTRAINT payment_term_discount_tier_number_chk CHECK (tier_no > 0),
    CONSTRAINT payment_term_discount_tier_days_chk
        CHECK (qualify_within_days > 0),
    CONSTRAINT payment_term_discount_tier_value_chk CHECK (
        (
            discount_pct > 0 AND discount_pct <= 100
            AND discount_pct IS NOT NULL
            AND discount_fixed IS NULL
            AND currency_code IS NULL
        )
        OR
        (
            discount_fixed IS NOT NULL
            AND discount_fixed > 0
            AND currency_code IS NOT NULL
            AND discount_pct IS NULL
        )
    ),
    CONSTRAINT payment_term_discount_tier_minimum_chk
        CHECK (min_invoice_amount IS NULL OR min_invoice_amount >= 0),
    CONSTRAINT payment_term_discount_tier_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT payment_term_discount_tier_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.payment_term_clause IS
  'Ordered contractual advance, recovery, retention, and release rules owned by a draft payment term and frozen on activation.';
COMMENT ON TABLE master.payment_term_discount_tier IS
  'Contractual early-payment discount tiers. Dynamic discount offers are intentionally outside this immutable aggregate.';

-- Canonical commercial identity. Supplier and customer are optional,
-- one-to-one roles of this record and never duplicate its name/legal fields.
CREATE TABLE master.business_partner (
    id                         uuid                             NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid                             NOT NULL,
    canonical_party_id         uuid,
    representation_purpose_code text                            NOT NULL DEFAULT 'default',
    code                       text                             NOT NULL,
    name                       text                             NOT NULL,
    partner_category           master.business_partner_category_d NOT NULL DEFAULT 'organization',
    ownership_class            master.business_partner_ownership_d NOT NULL DEFAULT 'external',
    legal_classification       master.business_partner_legal_classification_d,
    category_locked_at         timestamptz                      NOT NULL DEFAULT now(),
    category_locked_by         uuid                             NOT NULL,
    record_version             bigint                           NOT NULL DEFAULT 1,
    legal_form                 text,
    registration_country_code  character(2),
    incorporation_date         date,
    website_url                text,
    parent_business_partner_id uuid,
    description                text,
    aliases                    text[]                           NOT NULL DEFAULT '{}'::text[],
    metadata                   jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    status                     master.business_partner_status_d NOT NULL DEFAULT 'draft',
    is_active                  boolean                          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    created_at                 timestamptz                      NOT NULL DEFAULT now(),
    created_by                 uuid                             NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT business_partner_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_code_fmt_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_purpose_chk
        CHECK (representation_purpose_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_name_nonempty_chk
        CHECK (btrim(name) <> '' AND length(name) <= 320),
    CONSTRAINT business_partner_record_version_chk CHECK (record_version >= 1),
    CONSTRAINT business_partner_legal_form_chk
        CHECK (
            legal_form IS NULL
            OR (btrim(legal_form) <> '' AND length(legal_form) <= 100)
        ),
    CONSTRAINT business_partner_registration_country_chk
        CHECK (
            registration_country_code IS NULL
            OR registration_country_code::text ~ '^[A-Z]{2}$'
        ),
    CONSTRAINT business_partner_website_chk
        CHECK (
            website_url IS NULL
            OR (
                length(website_url) <= 2048
                AND website_url !~ '[[:space:][:cntrl:]@]'
                AND website_url ~* '^https://([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?(?:[/#?][^[:space:][:cntrl:]]*)?$'
            )
        ),
    CONSTRAINT business_partner_parent_not_self_chk
        CHECK (parent_business_partner_id IS DISTINCT FROM id),
    CONSTRAINT business_partner_description_chk
        CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT business_partner_aliases_cache_chk
        CHECK (cardinality(aliases) <= 50),
    CONSTRAINT business_partner_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'
               AND octet_length(metadata::text) <= 16384
               AND metadata - ARRAY['_seed','acceptanceFamily','externalScopeKey',
                   'sourceSystem','sourceReference','integrationTags','notes',
                   'importedAt','importBatchId']::text[] = '{}'::jsonb),
    CONSTRAINT business_partner_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.business_partner IS
  'Neon canonical commercial counterparty identity. Supplier and customer are optional thin roles; registration identifiers, tax profiles, addresses, contacts, and banking remain capability-owned.';
COMMENT ON COLUMN master.business_partner.name IS
  'Required registered organization name. Alternate names are owned by master.business_partner_alias.';
COMMENT ON COLUMN master.business_partner.partner_category IS
  'Organization-only identity. Ownership and supplier/customer roles are separate axes.';
COMMENT ON COLUMN master.business_partner.ownership_class IS
  'External or tenant-internal ownership. Internal organization roles must be intercompany.';
COMMENT ON COLUMN master.business_partner.legal_classification IS
  'Optional legal/business classification such as government or nonprofit; never a structural category.';
COMMENT ON COLUMN master.business_partner.metadata IS
  'Non-authoritative integration metadata only; legal identifiers, tax facts, permissions, and workflow state are prohibited.';
COMMENT ON COLUMN master.business_partner.aliases IS
  'Read-compatible cache maintained from master.business_partner_alias; direct writes are rejected.';

CREATE TABLE master.supplier (
    id                  uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                     NOT NULL,
    business_partner_id uuid                     NOT NULL,
    supplier_code       text                     NOT NULL,
    supplier_type       master.supplier_type_d   NOT NULL DEFAULT 'general',
    record_version      bigint                   NOT NULL DEFAULT 1,
    metadata            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
    status              master.supplier_status_d NOT NULL DEFAULT 'onboarding',
    is_active           boolean                  GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz              NOT NULL DEFAULT now(),
    created_by          uuid                     NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT supplier_pkey PRIMARY KEY (id),
    CONSTRAINT supplier_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT supplier_tenant_role_partner_uq UNIQUE (tenant_id, id, business_partner_id),
    CONSTRAINT supplier_business_partner_uq
        UNIQUE (tenant_id, business_partner_id),
    CONSTRAINT supplier_code_fmt_chk
        CHECK (supplier_code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT supplier_record_version_chk CHECK (record_version >= 1),
    CONSTRAINT supplier_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384
               AND metadata - ARRAY['sourceSystem','sourceReference','integrationTags',
                   'notes','importedAt','importBatchId']::text[] = '{}'::jsonb),
    CONSTRAINT supplier_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT supplier_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.supplier IS
  'Stable one-lifetime supplier role identity and thin Neon procurement/AP role of one business partner. Lifecycle evidence preserves history; identity, legal name, addresses, contacts, identifiers and canonical bank ownership resolve through business_partner_id.';
COMMENT ON COLUMN master.supplier.metadata IS
  'Non-authoritative integration metadata only. Payment configuration, readiness, qualification, risk, block state, and commodity assignments are prohibited.';

CREATE TABLE master.customer (
    id                  uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                     NOT NULL,
    business_partner_id uuid                     NOT NULL,
    customer_code       text                     NOT NULL,
    customer_type       master.customer_type_d   NOT NULL DEFAULT 'corporate',
    record_version      bigint                   NOT NULL DEFAULT 1,
    metadata            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
    status              master.customer_status_d NOT NULL DEFAULT 'prospect',
    is_active           boolean                  GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz              NOT NULL DEFAULT now(),
    created_by          uuid                     NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT customer_pkey PRIMARY KEY (id),
    CONSTRAINT customer_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT customer_tenant_role_partner_uq UNIQUE (tenant_id, id, business_partner_id),
    CONSTRAINT customer_business_partner_uq
        UNIQUE (tenant_id, business_partner_id),
    CONSTRAINT customer_code_fmt_chk
        CHECK (customer_code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT customer_record_version_chk CHECK (record_version >= 1),
    CONSTRAINT customer_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384
               AND metadata - ARRAY['sourceSystem','sourceReference','integrationTags',
                   'notes','importedAt','importBatchId']::text[] = '{}'::jsonb),
    CONSTRAINT customer_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT customer_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Alternate names are effective-dated assertions, not an array embedded in
-- the canonical identity.  One normalized spelling may occur only once in an
-- overlapping period for a partner.
CREATE TABLE master.business_partner_alias (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    business_partner_id uuid        NOT NULL,
    alias_kind          text        NOT NULL DEFAULT 'search',
    alias_name          text        NOT NULL,
    normalized_alias    text        GENERATED ALWAYS AS (
        lower(regexp_replace(btrim(alias_name), '\s+', ' ', 'g'))
    ) STORED,
    language_code       text,
    country_code        character(2),
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    is_primary          boolean     NOT NULL DEFAULT false,
    source_system       text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT business_partner_alias_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_alias_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_alias_kind_chk
        CHECK (alias_kind IN ('legal', 'trading', 'former', 'search')),
    CONSTRAINT business_partner_alias_name_chk
        CHECK (btrim(alias_name) <> '' AND length(alias_name) <= 320),
    CONSTRAINT business_partner_alias_language_chk
        CHECK (language_code IS NULL OR language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
    CONSTRAINT business_partner_alias_country_chk
        CHECK (country_code IS NULL OR country_code::text ~ '^[A-Z]{2}$'),
    CONSTRAINT business_partner_alias_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT business_partner_alias_source_chk
        CHECK (source_system IS NULL OR length(btrim(source_system)) BETWEEN 1 AND 128),
    CONSTRAINT business_partner_alias_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'
               AND octet_length(metadata::text) <= 8192),
    CONSTRAINT business_partner_alias_status_chk
        CHECK (status IN ('active', 'inactive')),
    CONSTRAINT business_partner_alias_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.business_partner_alias IS
  'Authoritative normalized, effective-dated legal/trading/former/search names for a Business Partner.';

COMMENT ON TABLE master.customer IS
  'Stable one-lifetime customer role identity and thin Neon sales/AR role of one business partner. Lifecycle evidence preserves history; identity and legal facts resolve through business_partner_id; company-specific credit and payment configuration remain outside this role.';
COMMENT ON COLUMN master.customer.metadata IS
  'Non-authoritative integration metadata only. Designations, credit limits, credit rating, qualification, block state, payment behavior, and ledger analytics are prohibited.';

-- Neon fixed-asset foundation.
CREATE TABLE master.asset_class (
    id                              uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid                          NOT NULL,
    code                            text                          NOT NULL,
    name                            text                          NOT NULL,
    description                     text,
    parent_id                       uuid,
    asset_nature                    master.asset_nature_d         NOT NULL DEFAULT 'tangible',
    is_componentization_required    boolean                       NOT NULL DEFAULT false,
    is_asset_tag_required           boolean                       NOT NULL DEFAULT true,
    is_serial_tracking_required     boolean                       NOT NULL DEFAULT false,
    is_location_tracking_required   boolean                       NOT NULL DEFAULT true,
    default_uom_code                text,
    sort_order                      smallint                      NOT NULL DEFAULT 0,
    metadata                        jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status                          master.asset_class_status_d   NOT NULL DEFAULT 'active',
    is_active                       boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,
    created_at                      timestamptz                   NOT NULL DEFAULT now(),
    created_by                      uuid                          NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT asset_class_pkey PRIMARY KEY (id),
    CONSTRAINT asset_class_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT asset_class_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT asset_class_parent_self_chk CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT asset_class_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT asset_class_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT asset_class_description_chk
        CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT asset_class_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT asset_class_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT asset_class_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT asset_class_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.asset_class IS
  'Tenant asset classification hierarchy. Accounting, capitalization, depreciation, approval, revaluation and impairment policies are deliberately excluded and belong to control policy.';

CREATE TABLE master.asset (
    id                          uuid                    NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid                    NOT NULL,
    company_code_id             uuid                    NOT NULL,
    asset_class_id              uuid                    NOT NULL,
    code                        text                    NOT NULL,
    name                        text                    NOT NULL,
    description                 text,
    acquisition_date            date                    NOT NULL,
    in_service_date             date,
    acquisition_cost            numeric(18,4)           NOT NULL,
    currency_code               character(3)            NOT NULL,
    barcode                     text,
    serial_number               text,
    custodian_principal_id      uuid,
    location_description        text,
    is_capitalized_from_wip     boolean                 NOT NULL DEFAULT false,
    capitalized_at              timestamptz,
    warranty_expiry_date        date,
    insured_value               numeric(18,4),
    insurance_policy_ref        text,
    retired_at                  timestamptz,
    retirement_type             master.asset_retirement_type_d,
    metadata                    jsonb                   NOT NULL DEFAULT '{}'::jsonb,
    status                      master.asset_status_d   NOT NULL DEFAULT 'draft',
    is_active                   boolean GENERATED ALWAYS AS (
                                    status IN ('draft', 'active', 'suspended')
                                ) STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz             NOT NULL DEFAULT now(),
    created_by                  uuid                    NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT asset_pkey PRIMARY KEY (id),
    CONSTRAINT asset_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT asset_company_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT asset_code_chk CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT asset_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT asset_description_chk
        CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT asset_acquisition_cost_chk CHECK (acquisition_cost >= 0),
    CONSTRAINT asset_in_service_date_chk
        CHECK (in_service_date IS NULL OR in_service_date >= acquisition_date),
    CONSTRAINT asset_currency_chk CHECK (currency_code::text ~ '^[A-Z]{3}$'),
    CONSTRAINT asset_barcode_chk CHECK (barcode IS NULL OR btrim(barcode) <> ''),
    CONSTRAINT asset_serial_chk CHECK (serial_number IS NULL OR btrim(serial_number) <> ''),
    CONSTRAINT asset_capitalization_evidence_chk CHECK (
        (is_capitalized_from_wip = false AND capitalized_at IS NULL)
        OR (is_capitalized_from_wip = true AND capitalized_at IS NOT NULL)
    ),
    CONSTRAINT asset_insured_value_chk CHECK (insured_value IS NULL OR insured_value >= 0),
    CONSTRAINT asset_retirement_evidence_chk CHECK (
        (status = 'retired') = (retired_at IS NOT NULL)
        AND (retired_at IS NULL) = (retirement_type IS NULL)
    ),
    CONSTRAINT asset_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT asset_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT asset_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.asset IS
  'Company-owned fixed-asset register. Book-specific valuation and depreciation values are excluded; management-dimension, supplier, site and source-document bindings remain parked until those aggregates are finalized.';

CREATE TABLE master.asset_book (
    id                          uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid                              NOT NULL,
    company_code_id             uuid                              NOT NULL,
    asset_id                    uuid                              NOT NULL,
    ledger_book_id              uuid                              NOT NULL,
    depreciation_method         master.depreciation_method_d      NOT NULL,
    useful_life_months          integer                           NOT NULL,
    residual_value              numeric(18,4)                     NOT NULL DEFAULT 0,
    cost_basis                  numeric(18,4)                     NOT NULL,
    currency_code               character(3)                      NOT NULL,
    depreciation_start_date     date,
    convention                  master.depreciation_convention_d,
    prorate_basis               master.asset_prorate_basis_d      NOT NULL DEFAULT 'monthly',
    bonus_depreciation_pct      numeric(5,2)                      NOT NULL DEFAULT 0,
    salvage_value_locked        boolean                           NOT NULL DEFAULT false,
    metadata                    jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                      master.asset_status_d             NOT NULL DEFAULT 'draft',
    is_active                   boolean GENERATED ALWAYS AS (
                                    status IN ('draft', 'active', 'suspended')
                                ) STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz                       NOT NULL DEFAULT now(),
    created_by                  uuid                              NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT asset_book_pkey PRIMARY KEY (id),
    CONSTRAINT asset_book_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT asset_book_asset_ledger_uq UNIQUE (tenant_id, asset_id, ledger_book_id),
    CONSTRAINT asset_book_life_chk CHECK (
        (depreciation_method = 'no_depreciation' AND useful_life_months = 0)
        OR (depreciation_method <> 'no_depreciation' AND useful_life_months > 0)
    ),
    CONSTRAINT asset_book_amounts_chk CHECK (
        cost_basis >= 0 AND residual_value >= 0 AND residual_value <= cost_basis
    ),
    CONSTRAINT asset_book_currency_chk CHECK (currency_code::text ~ '^[A-Z]{3}$'),
    CONSTRAINT asset_book_bonus_chk
        CHECK (bonus_depreciation_pct BETWEEN 0 AND 100),
    CONSTRAINT asset_book_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT asset_book_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT asset_book_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.asset_book IS
  'Per-asset accounting-book configuration. Posted depreciation, revaluation, impairment and carrying balances are derived from document and ledger facts rather than stored here.';

CREATE TABLE master.asset_component (
    id                      uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid                            NOT NULL,
    parent_asset_id         uuid                            NOT NULL,
    component_asset_id      uuid                            NOT NULL,
    component_type          master.asset_component_type_d   NOT NULL,
    allocation_percentage   numeric(7,4),
    description             text,
    effective_from          date                            NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    sort_order              smallint                        NOT NULL DEFAULT 0,
    metadata                jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    status                  master.asset_class_status_d     NOT NULL DEFAULT 'active',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz                     NOT NULL DEFAULT now(),
    created_by              uuid                            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT asset_component_pkey PRIMARY KEY (id),
    CONSTRAINT asset_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT asset_component_pair_uq
        UNIQUE (tenant_id, parent_asset_id, component_asset_id),
    CONSTRAINT asset_component_not_self_chk
        CHECK (parent_asset_id <> component_asset_id),
    CONSTRAINT asset_component_allocation_chk
        CHECK (allocation_percentage IS NULL OR allocation_percentage > 0
               AND allocation_percentage <= 100),
    CONSTRAINT asset_component_effective_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT asset_component_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT asset_component_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT asset_component_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT asset_component_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.asset_component IS
  'Effective-dated parent/component relationship. The component is itself a complete asset; identity, company, cost, currency and useful life are therefore not duplicated.';

CREATE TABLE master.asset_assignment_history (
    id                      uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid                            NOT NULL,
    asset_id                uuid                            NOT NULL,
    assignment_type         master.asset_assignment_type_d NOT NULL,
    from_principal_id       uuid,
    to_principal_id         uuid,
    from_scope_target_id    uuid,
    to_scope_target_id      uuid,
    from_location_text      text,
    to_location_text        text,
    effective_at            timestamptz                     NOT NULL DEFAULT now(),
    reason                  text,
    reference_document_type text,
    reference_document_id   uuid,
    assigned_by             uuid                            NOT NULL,
    metadata                jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz                     NOT NULL DEFAULT now(),
    created_by              uuid                            NOT NULL,

    CONSTRAINT asset_assignment_history_pkey PRIMARY KEY (id),
    CONSTRAINT asset_assignment_history_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT asset_assignment_coordinates_chk CHECK (
        (
            assignment_type = 'custodian'
            AND (from_principal_id IS NOT NULL OR to_principal_id IS NOT NULL)
            AND from_scope_target_id IS NULL AND to_scope_target_id IS NULL
            AND from_location_text IS NULL AND to_location_text IS NULL
        )
        OR (
            assignment_type = 'organization'
            AND (from_scope_target_id IS NOT NULL OR to_scope_target_id IS NOT NULL)
            AND from_principal_id IS NULL AND to_principal_id IS NULL
            AND from_location_text IS NULL AND to_location_text IS NULL
        )
        OR (
            assignment_type = 'location'
            AND (
                nullif(btrim(from_location_text), '') IS NOT NULL
                OR nullif(btrim(to_location_text), '') IS NOT NULL
            )
            AND from_principal_id IS NULL AND to_principal_id IS NULL
            AND from_scope_target_id IS NULL AND to_scope_target_id IS NULL
        )
    ),
    CONSTRAINT asset_assignment_reference_pair_chk
        CHECK ((reference_document_type IS NULL) = (reference_document_id IS NULL)),
    CONSTRAINT asset_assignment_reason_chk
        CHECK (reason IS NULL OR btrim(reason) <> ''),
    CONSTRAINT asset_assignment_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE master.asset_assignment_history IS
  'Append-only timeline of custodian, organization-scope and free-text location transitions. Typed coordinates replace the former unvalidated from_value/to_value polymorphism.';
-- Neon-only business-purpose master data.
CREATE TABLE master.business_intent (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,
    domain              text        NOT NULL,
    subtype             text,
    parent_id           uuid,
    path                text,
    depth               smallint    NOT NULL DEFAULT 0,
    visibility          text        NOT NULL DEFAULT 'STANDARD',
    sort_order          smallint    NOT NULL DEFAULT 0,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active           boolean GENERATED ALWAYS AS (status::text = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT business_intent_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.business_intent IS
    'ARCHETYPE=B;SCOPE=T. Neon tenant master data defining the business-purpose ontology used by commodity, accounting, tax, approval, and asset policies.';

-- Neon-only people, workforce, leave, payroll, and business-calendar masters.
-- These tables are tenant ERP authority and must not be added to Athyper or Mesh.

CREATE TABLE master.person (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    person_number   text,
    first_name      text        NOT NULL,
    middle_name     text,
    last_name       text        NOT NULL,
    display_name    text,
    preferred_name  text,
    primary_email   text,
    primary_phone   text,
    country_code    character(2),
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT person_pkey PRIMARY KEY (id),
    CONSTRAINT person_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT person_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT person_number_uq UNIQUE NULLS NOT DISTINCT (tenant_id, person_number),
    CONSTRAINT person_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT person_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT person_first_name_nonempty_chk CHECK (btrim(first_name) <> ''),
    CONSTRAINT person_last_name_nonempty_chk CHECK (btrim(last_name) <> ''),
    CONSTRAINT person_email_chk
        CHECK (primary_email IS NULL OR primary_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT person_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT person_status_chk CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    CONSTRAINT person_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT person_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.person IS
  'People/Workforce-owned controlled PII profile. A Person is not a Business Partner; employee, employment, work assignment and external-worker engagement own workforce facts.';

CREATE TABLE master.person_sensitive_profile (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    person_id               uuid        NOT NULL,
    date_of_birth           date,
    gender                  text,
    marital_status          text,
    nationality_country_code character(2),
    national_id_type        text,
    national_id_token       text,
    tax_identifier_token    text,
    passport_number_token   text,
    emergency_contact       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    protected_attributes    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT person_sensitive_profile_pkey PRIMARY KEY (id),
    CONSTRAINT person_sensitive_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT person_sensitive_profile_person_uq UNIQUE (tenant_id, person_id),
    CONSTRAINT person_sensitive_profile_dob_chk
        CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE),
    CONSTRAINT person_sensitive_profile_emergency_object_chk
        CHECK (jsonb_typeof(emergency_contact) = 'object'),
    CONSTRAINT person_sensitive_profile_attributes_object_chk
        CHECK (jsonb_typeof(protected_attributes) = 'object'),
    CONSTRAINT person_sensitive_profile_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT person_sensitive_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.person_sensitive_profile IS
  'Neon sensitive person extension. Runtime exposure requires a purpose-specific HR/payroll service path and must not be projected to Mesh.';

CREATE TABLE master.site (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    company_code_id uuid        NOT NULL,
    description     text,
    site_type       text        NOT NULL,
    parent_site_id  uuid,
    level_no        smallint    NOT NULL DEFAULT 1,
    sort_order      smallint    NOT NULL DEFAULT 0,
    country_code    character(2) NOT NULL,
    timezone_code   text,
    manager_id      uuid,
    capacity_uom    text,
    capacity_value  numeric(12,2),
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status          text        NOT NULL DEFAULT 'draft',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT site_pkey PRIMARY KEY (id),
    CONSTRAINT site_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT site_company_identity_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT site_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT site_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT site_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT site_type_nonempty_chk CHECK (btrim(site_type) <> ''),
    CONSTRAINT site_parent_not_self_chk CHECK (parent_site_id IS DISTINCT FROM id),
    CONSTRAINT site_level_chk CHECK (level_no >= 1),
    CONSTRAINT site_capacity_chk CHECK (capacity_value IS NULL OR capacity_value >= 0),
    CONSTRAINT site_capacity_pair_chk
        CHECK ((capacity_value IS NULL) = (capacity_uom IS NULL)),
    CONSTRAINT site_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT site_status_chk CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    CONSTRAINT site_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT site_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.site IS
  'Neon physical operating location. Address values remain in master.address/address_link.';

CREATE TABLE master.career_band (
    id          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id   uuid        NOT NULL,
    code        text        NOT NULL,
    name        text        NOT NULL,
    sort_order  smallint    NOT NULL DEFAULT 0,
    status      text        NOT NULL DEFAULT 'active',
    is_active   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid        NOT NULL,
    updated_at  timestamptz,
    updated_by  uuid,
    CONSTRAINT career_band_pkey PRIMARY KEY (id),
    CONSTRAINT career_band_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT career_band_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT career_band_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT career_band_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT career_band_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.career_level (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    career_band_id  uuid,
    level_no        smallint    NOT NULL DEFAULT 1,
    sort_order      smallint    NOT NULL DEFAULT 0,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT career_level_pkey PRIMARY KEY (id),
    CONSTRAINT career_level_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT career_level_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT career_level_number_chk CHECK (level_no >= 1),
    CONSTRAINT career_level_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT career_level_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT career_level_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.designation (
    id          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id   uuid        NOT NULL,
    code        text        NOT NULL,
    name        text        NOT NULL,
    description text,
    status      text        NOT NULL DEFAULT 'active',
    is_active   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid        NOT NULL,
    updated_at  timestamptz,
    updated_by  uuid,
    CONSTRAINT designation_pkey PRIMARY KEY (id),
    CONSTRAINT designation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT designation_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT designation_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT designation_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT designation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.job_family (
    id          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id   uuid        NOT NULL,
    code        text        NOT NULL,
    name        text        NOT NULL,
    description text,
    status      text        NOT NULL DEFAULT 'active',
    is_active   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid        NOT NULL,
    updated_at  timestamptz,
    updated_by  uuid,
    CONSTRAINT job_family_pkey PRIMARY KEY (id),
    CONSTRAINT job_family_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_family_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT job_family_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT job_family_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT job_family_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.job_function (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    job_family_id   uuid,
    description     text,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT job_function_pkey PRIMARY KEY (id),
    CONSTRAINT job_function_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_function_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT job_function_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT job_function_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT job_function_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.pay_grade (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    grade_set       text,
    min_amount      numeric(18,4),
    midpoint_amount numeric(18,4),
    max_amount      numeric(18,4),
    currency_code   character(3),
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT pay_grade_pkey PRIMARY KEY (id),
    CONSTRAINT pay_grade_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_grade_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_grade_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT pay_grade_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT pay_grade_amounts_chk CHECK (
        (min_amount IS NULL OR min_amount >= 0)
        AND (midpoint_amount IS NULL OR midpoint_amount >= 0)
        AND (max_amount IS NULL OR max_amount >= 0)
        AND (min_amount IS NULL OR midpoint_amount IS NULL OR min_amount <= midpoint_amount)
        AND (midpoint_amount IS NULL OR max_amount IS NULL OR midpoint_amount <= max_amount)
        AND (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount)
    ),
    CONSTRAINT pay_grade_currency_required_chk CHECK (
        currency_code IS NOT NULL
        OR (min_amount IS NULL AND midpoint_amount IS NULL AND max_amount IS NULL)
    ),
    CONSTRAINT pay_grade_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.job (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    job_family_id   uuid,
    job_function_id uuid,
    career_band_id  uuid,
    career_level_id uuid,
    pay_grade_id    uuid,
    designation_id  uuid,
    description     text,
    status          text        NOT NULL DEFAULT 'draft',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT job_pkey PRIMARY KEY (id),
    CONSTRAINT job_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT job_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT job_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT job_status_chk CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    CONSTRAINT job_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.holiday_calendar (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    country_code    character(2),
    company_code_id uuid,
    legal_entity_id uuid,
    site_id         uuid,
    weekend_pattern text        NOT NULL DEFAULT 'SAT_SUN',
    weekend_days    smallint[],
    description     text,
    is_default      boolean     NOT NULL DEFAULT false,
    sort_order      smallint    NOT NULL DEFAULT 0,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT holiday_calendar_pkey PRIMARY KEY (id),
    CONSTRAINT holiday_calendar_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT holiday_calendar_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT holiday_calendar_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT holiday_calendar_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT holiday_calendar_weekend_days_chk CHECK (
        weekend_days IS NULL
        OR (
            cardinality(weekend_days) BETWEEN 1 AND 7
            AND weekend_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
        )
    ),
    CONSTRAINT holiday_calendar_custom_weekend_chk
        CHECK (weekend_pattern <> 'CUSTOM' OR weekend_days IS NOT NULL),
    CONSTRAINT holiday_calendar_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT holiday_calendar_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT holiday_calendar_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.holiday_calendar_day (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    holiday_calendar_id uuid        NOT NULL,
    calendar_year       smallint    NOT NULL,
    holiday_date        date        NOT NULL,
    name                text        NOT NULL,
    day_type            text        NOT NULL DEFAULT 'HOLIDAY',
    observance_type     text        NOT NULL DEFAULT 'MANDATORY',
    is_half_day         boolean     NOT NULL DEFAULT false,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT holiday_calendar_day_pkey PRIMARY KEY (id),
    CONSTRAINT holiday_calendar_day_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT holiday_calendar_day_date_uq UNIQUE (tenant_id, holiday_calendar_id, holiday_date),
    CONSTRAINT holiday_calendar_day_year_chk
        CHECK (calendar_year = EXTRACT(YEAR FROM holiday_date)::smallint),
    CONSTRAINT holiday_calendar_day_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT holiday_calendar_day_type_chk
        CHECK (day_type IN ('HOLIDAY', 'WORKING_OVERRIDE', 'BLACKOUT')),
    CONSTRAINT holiday_calendar_day_observance_chk
        CHECK (observance_type IN ('MANDATORY', 'OPTIONAL', 'INFORMATIONAL')),
    CONSTRAINT holiday_calendar_day_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT holiday_calendar_day_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.shift_type (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    start_time      time        NOT NULL,
    end_time        time        NOT NULL,
    break_minutes   smallint    NOT NULL DEFAULT 0,
    paid_minutes    smallint,
    is_overnight    boolean     NOT NULL DEFAULT false,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT shift_type_pkey PRIMARY KEY (id),
    CONSTRAINT shift_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT shift_type_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT shift_type_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT shift_type_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT shift_type_break_chk CHECK (break_minutes BETWEEN 0 AND 1440),
    CONSTRAINT shift_type_paid_chk CHECK (paid_minutes IS NULL OR paid_minutes BETWEEN 0 AND 1440),
    CONSTRAINT shift_type_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.work_pattern (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    pattern_type        text        NOT NULL DEFAULT 'weekly',
    cycle_length_days   smallint    NOT NULL DEFAULT 7,
    weekly_hours        numeric(8,2),
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT work_pattern_pkey PRIMARY KEY (id),
    CONSTRAINT work_pattern_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT work_pattern_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT work_pattern_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT work_pattern_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT work_pattern_type_chk
        CHECK (pattern_type IN ('weekly', 'bi_weekly', 'rotating', 'flexible', 'custom')),
    CONSTRAINT work_pattern_cycle_chk CHECK (cycle_length_days BETWEEN 1 AND 366),
    CONSTRAINT work_pattern_hours_chk CHECK (weekly_hours IS NULL OR weekly_hours BETWEEN 0 AND 168),
    CONSTRAINT work_pattern_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT work_pattern_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.work_pattern_day (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    work_pattern_id     uuid        NOT NULL,
    day_no              smallint    NOT NULL,
    is_working_day      boolean     NOT NULL DEFAULT true,
    start_time          time,
    end_time            time,
    break_minutes       smallint    NOT NULL DEFAULT 0,
    planned_minutes     smallint    NOT NULL DEFAULT 0,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT work_pattern_day_pkey PRIMARY KEY (id),
    CONSTRAINT work_pattern_day_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT work_pattern_day_no_uq UNIQUE (tenant_id, work_pattern_id, day_no),
    CONSTRAINT work_pattern_day_number_chk CHECK (day_no BETWEEN 1 AND 366),
    CONSTRAINT work_pattern_day_break_chk CHECK (break_minutes BETWEEN 0 AND 1440),
    CONSTRAINT work_pattern_day_planned_chk CHECK (planned_minutes BETWEEN 0 AND 1440),
    CONSTRAINT work_pattern_day_times_chk CHECK (
        (
            is_working_day
            AND (
                (start_time IS NOT NULL AND end_time IS NOT NULL)
                OR (start_time IS NULL AND end_time IS NULL AND planned_minutes > 0)
            )
        )
        OR (NOT is_working_day AND start_time IS NULL AND end_time IS NULL AND planned_minutes = 0)
    ),
    CONSTRAINT work_pattern_day_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT work_pattern_day_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.pay_component (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    component_type          text        NOT NULL,
    value_type              text        NOT NULL DEFAULT 'amount',
    taxable_behavior        text        NOT NULL DEFAULT 'taxable',
    is_recurring            boolean     NOT NULL DEFAULT true,
    is_employer_cost        boolean     NOT NULL DEFAULT false,
    formula_expression_id   uuid,
    default_gl_role         text,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'draft',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT pay_component_pkey PRIMARY KEY (id),
    CONSTRAINT pay_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_component_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_component_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT pay_component_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT pay_component_type_nonempty_chk CHECK (btrim(component_type) <> ''),
    CONSTRAINT pay_component_value_type_chk
        CHECK (value_type IN ('amount', 'rate', 'quantity', 'formula')),
    CONSTRAINT pay_component_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT pay_component_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.pay_group (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    legal_entity_id uuid,
    company_code_id uuid        NOT NULL,
    pay_frequency   text        NOT NULL DEFAULT 'monthly',
    currency_code   character(3) NOT NULL,
    country_code    character(2),
    calendar_id     uuid,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT pay_group_pkey PRIMARY KEY (id),
    CONSTRAINT pay_group_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_group_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_group_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT pay_group_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT pay_group_frequency_chk
        CHECK (pay_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly')),
    CONSTRAINT pay_group_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.pay_structure (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    pay_group_id    uuid,
    currency_code   character(3) NOT NULL,
    effective_from  date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until date,
    status          text        NOT NULL DEFAULT 'draft',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT pay_structure_pkey PRIMARY KEY (id),
    CONSTRAINT pay_structure_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_structure_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT pay_structure_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT pay_structure_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT pay_structure_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT pay_structure_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.pay_structure_line (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    pay_structure_id      uuid        NOT NULL,
    pay_component_id      uuid        NOT NULL,
    line_no               smallint    NOT NULL,
    default_amount        numeric(18,4),
    default_rate          numeric(18,8),
    formula_expression_id uuid,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT pay_structure_line_pkey PRIMARY KEY (id),
    CONSTRAINT pay_structure_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pay_structure_line_no_uq UNIQUE (tenant_id, pay_structure_id, line_no),
    CONSTRAINT pay_structure_line_component_uq UNIQUE (tenant_id, pay_structure_id, pay_component_id),
    CONSTRAINT pay_structure_line_number_chk CHECK (line_no >= 1),
    CONSTRAINT pay_structure_line_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT pay_structure_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.statutory_scheme (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    country_code            character(2) NOT NULL,
    scheme_type             text        NOT NULL,
    employee_component_id   uuid,
    employer_component_id   uuid,
    rate_table_id           uuid,
    formula_expression_id   uuid,
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT statutory_scheme_pkey PRIMARY KEY (id),
    CONSTRAINT statutory_scheme_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT statutory_scheme_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT statutory_scheme_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT statutory_scheme_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT statutory_scheme_type_nonempty_chk CHECK (btrim(scheme_type) <> ''),
    CONSTRAINT statutory_scheme_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.leave_type (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    leave_category      text        NOT NULL DEFAULT 'annual',
    unit                text        NOT NULL DEFAULT 'day',
    is_paid             boolean     NOT NULL DEFAULT true,
    requires_attachment boolean     NOT NULL DEFAULT false,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT leave_type_pkey PRIMARY KEY (id),
    CONSTRAINT leave_type_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT leave_type_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT leave_type_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT leave_type_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT leave_type_unit_chk CHECK (unit IN ('day', 'hour')),
    CONSTRAINT leave_type_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.leave_plan (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    leave_type_id           uuid        NOT NULL,
    country_code            character(2),
    legal_entity_id         uuid,
    company_code_id         uuid,
    accrual_frequency       text        NOT NULL DEFAULT 'monthly',
    carry_forward_policy    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'draft',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT leave_plan_pkey PRIMARY KEY (id),
    CONSTRAINT leave_plan_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT leave_plan_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT leave_plan_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT leave_plan_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT leave_plan_frequency_chk
        CHECK (
            accrual_frequency IN (
                'none', 'daily', 'weekly', 'monthly', 'quarterly',
                'annual', 'manual', 'on_hire'
            )
        ),
    CONSTRAINT leave_plan_carry_policy_object_chk CHECK (jsonb_typeof(carry_forward_policy) = 'object'),
    CONSTRAINT leave_plan_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.leave_plan_rule (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    leave_plan_id               uuid        NOT NULL,
    rule_code                   text        NOT NULL,
    priority                    smallint    NOT NULL DEFAULT 100,
    eligibility_condition       jsonb,
    entitlement_quantity        numeric(12,4),
    accrual_formula_version_id  uuid,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      text        NOT NULL DEFAULT 'active',
    is_active                   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,
    CONSTRAINT leave_plan_rule_pkey PRIMARY KEY (id),
    CONSTRAINT leave_plan_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT leave_plan_rule_code_uq UNIQUE (tenant_id, leave_plan_id, rule_code),
    CONSTRAINT leave_plan_rule_code_nonempty_chk CHECK (btrim(rule_code) <> ''),
    CONSTRAINT leave_plan_rule_priority_chk CHECK (priority >= 0),
    CONSTRAINT leave_plan_rule_entitlement_chk
        CHECK (entitlement_quantity IS NULL OR entitlement_quantity >= 0),
    CONSTRAINT leave_plan_rule_eligibility_object_chk
        CHECK (eligibility_condition IS NULL OR jsonb_typeof(eligibility_condition) = 'object'),
    CONSTRAINT leave_plan_rule_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT leave_plan_rule_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.position (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    legal_entity_id         uuid,
    company_code_id         uuid        NOT NULL,
    org_unit_id             uuid,
    job_id                  uuid,
    reports_to_position_id  uuid,
    cost_center_id          uuid,
    profit_center_id        uuid,
    site_id                 uuid,
    position_type           text        NOT NULL DEFAULT 'regular',
    headcount_capacity      numeric(10,2) NOT NULL DEFAULT 1,
    valid_from              date,
    valid_to                date,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'draft',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT position_pkey PRIMARY KEY (id),
    CONSTRAINT position_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT position_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT position_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT position_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT position_parent_not_self_chk CHECK (reports_to_position_id IS DISTINCT FROM id),
    CONSTRAINT position_capacity_chk CHECK (headcount_capacity > 0),
    CONSTRAINT position_validity_chk CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CONSTRAINT position_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT position_status_chk CHECK (status IN ('draft', 'active', 'frozen', 'closed', 'archived')),
    CONSTRAINT position_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.employee (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    principal_id        uuid,
    person_id           uuid        NOT NULL,
    employee_number     text        NOT NULL,
    first_name          text        NOT NULL,
    last_name           text        NOT NULL,
    display_name        text,
    email               text,
    phone               text,
    employment_type     text        NOT NULL DEFAULT 'full_time',
    department          text,
    title               text,
    manager_id          uuid,
    company_code_id     uuid,
    hire_date           date,
    termination_date    date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT employee_pkey PRIMARY KEY (id),
    CONSTRAINT employee_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employee_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT employee_number_uq UNIQUE (tenant_id, employee_number),
    CONSTRAINT employee_person_uq UNIQUE (tenant_id, person_id),
    CONSTRAINT employee_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT employee_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT employee_number_nonempty_chk CHECK (btrim(employee_number) <> ''),
    CONSTRAINT employee_manager_not_self_chk CHECK (manager_id IS DISTINCT FROM id),
    CONSTRAINT employee_dates_chk
        CHECK (termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date),
    CONSTRAINT employee_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT employee_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT employee_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.employee IS
  'Neon workforce identity. Legacy flattened employment/organization columns are compatibility fields; employment and work_assignment are canonical for new writes.';

CREATE TABLE master.employment (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    person_id           uuid        NOT NULL,
    employee_id         uuid,
    legal_entity_id     uuid        NOT NULL,
    company_code_id     uuid        NOT NULL,
    employment_number   text        NOT NULL,
    employment_type     text        NOT NULL DEFAULT 'full_time',
    is_primary          boolean     NOT NULL DEFAULT true,
    employment_status   text        NOT NULL DEFAULT 'active',
    hire_date           date        NOT NULL,
    service_date        date,
    probation_end_date  date,
    termination_date    date,
    termination_reason  text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT employment_pkey PRIMARY KEY (id),
    CONSTRAINT employment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employment_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT employment_number_uq UNIQUE (tenant_id, company_code_id, employment_number),
    CONSTRAINT employment_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT employment_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT employment_number_nonempty_chk CHECK (btrim(employment_number) <> ''),
    CONSTRAINT employment_type_chk
        CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'casual', 'intern', 'volunteer')),
    CONSTRAINT employment_status_chk
        CHECK (employment_status IN ('pending', 'active', 'suspended', 'terminated')),
    CONSTRAINT employment_lifecycle_alignment_chk CHECK (
        (employment_status = 'terminated' AND status IN ('inactive', 'archived'))
        OR (employment_status <> 'terminated' AND status <> 'archived')
    ),
    CONSTRAINT employment_dates_chk CHECK (
        (service_date IS NULL OR service_date <= hire_date)
        AND (probation_end_date IS NULL OR probation_end_date >= hire_date)
        AND (termination_date IS NULL OR termination_date > hire_date)
    ),
    CONSTRAINT employment_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT employment_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.work_assignment (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    employee_id         uuid        NOT NULL,
    employment_id       uuid,
    position_id         uuid,
    org_unit_id         uuid,
    job_id              uuid,
    manager_employee_id uuid,
    company_code_id     uuid        NOT NULL,
    cost_center_id      uuid,
    profit_center_id    uuid,
    site_id             uuid,
    assignment_type     text        NOT NULL DEFAULT 'primary',
    fte                 numeric(5,4) NOT NULL DEFAULT 1,
    effective_from      date        NOT NULL,
    effective_until     date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT work_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT work_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT work_assignment_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT work_assignment_code_nonempty_chk CHECK (btrim(code) <> ''),
    CONSTRAINT work_assignment_name_nonempty_chk CHECK (btrim(name) <> ''),
    CONSTRAINT work_assignment_manager_not_self_chk CHECK (manager_employee_id IS DISTINCT FROM employee_id),
    CONSTRAINT work_assignment_type_chk
        CHECK (assignment_type IN ('primary', 'secondary', 'temporary', 'acting')),
    CONSTRAINT work_assignment_fte_chk CHECK (fte > 0 AND fte <= 1),
    CONSTRAINT work_assignment_effective_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT work_assignment_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT work_assignment_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON COLUMN master.employment.is_primary IS
  'Exactly one active primary employment may cover a person on an applicable [hire_date, termination_date) range.';
COMMENT ON COLUMN master.work_assignment.effective_until IS
  'Exclusive upper bound of the assignment effective range.';

-- External workforce is a distinct person role.  It deliberately does not
-- imply buyer employment, payroll eligibility, statutory enrollment, or
-- employee headcount.  A person may concurrently have both employee and
-- external_worker rows; the governing contracts remain independent.
CREATE TABLE master.external_worker (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    person_id           uuid        NOT NULL,
    worker_number       text        NOT NULL,
    default_classification text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'prospect',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT external_worker_pkey PRIMARY KEY (id),
    CONSTRAINT external_worker_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_worker_person_uq UNIQUE (tenant_id, person_id),
    CONSTRAINT external_worker_number_uq UNIQUE (tenant_id, worker_number),
    CONSTRAINT external_worker_number_chk CHECK (worker_number ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT external_worker_classification_chk CHECK (
        default_classification IS NULL OR default_classification IN (
            'agency_worker','independent_contractor','consultant','sow_worker','other'
        )
    ),
    CONSTRAINT external_worker_status_chk CHECK (
        status IN ('prospect','active','suspended','inactive','archived')
    ),
    CONSTRAINT external_worker_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT external_worker_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT external_worker_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.external_worker IS
  'Reusable external-workforce role for one person. Supplier, buyer, commercial terms, placement, compliance, access and tenure belong to effective-dated worker engagements; this row never creates buyer employment.';

CREATE TABLE master.employee_leave_enrollment (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    employee_id         uuid        NOT NULL,
    leave_plan_id       uuid        NOT NULL,
    effective_from      date        NOT NULL,
    effective_until     date,
    opening_balance     numeric(12,4) NOT NULL DEFAULT 0,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT employee_leave_enrollment_pkey PRIMARY KEY (id),
    CONSTRAINT employee_leave_enrollment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employee_leave_enrollment_uq
        UNIQUE (tenant_id, employee_id, leave_plan_id, effective_from),
    CONSTRAINT employee_leave_enrollment_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT employee_leave_enrollment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.employee_statutory_enrollment (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    employee_id             uuid        NOT NULL,
    statutory_scheme_id     uuid        NOT NULL,
    member_number           text,
    effective_from          date        NOT NULL,
    effective_until         date,
    contribution_category   text,
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT employee_statutory_enrollment_pkey PRIMARY KEY (id),
    CONSTRAINT employee_statutory_enrollment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employee_statutory_enrollment_uq
        UNIQUE (tenant_id, employee_id, statutory_scheme_id, effective_from),
    CONSTRAINT employee_statutory_enrollment_effective_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT employee_statutory_enrollment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.warehouse (
    id                        uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                         NOT NULL,
    code                      text                         NOT NULL,
    name                      text                         NOT NULL,
    site_id                   uuid                         NOT NULL,
    description               text,
    warehouse_type            text                         NOT NULL DEFAULT 'finished_goods',
    manager_id                uuid,
    is_negative_stock_allowed boolean                      NOT NULL DEFAULT false,
    metadata                  jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                    master.organization_status_d NOT NULL DEFAULT 'draft',
    is_active                 boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at         timestamptz,
    status_changed_by         uuid,
    created_at                timestamptz                  NOT NULL DEFAULT now(),
    created_by                uuid                         NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,
    CONSTRAINT warehouse_pkey PRIMARY KEY (id),
    CONSTRAINT warehouse_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT warehouse_site_id_uq UNIQUE (tenant_id, site_id, id),
    CONSTRAINT warehouse_site_code_uq UNIQUE (tenant_id, site_id, code),
    CONSTRAINT warehouse_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT warehouse_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT warehouse_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT warehouse_type_chk CHECK (warehouse_type ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT warehouse_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT warehouse_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT warehouse_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.warehouse IS
  'Tenant inventory storage location within one immutable site. Company identity and address are inherited from master.site.';
COMMENT ON COLUMN master.warehouse.is_negative_stock_allowed IS
  'Warehouse-level operational exception. Item/category inventory policy may impose a stricter prohibition.';

-- Neon party-risk foundation.
--
-- Ownership is intentionally split by semantics, not by UI surface:
--   * platform taxonomies/models/sources remain master reference catalogs;
--   * interpreted party-risk records remain master business state;
--   * governance continues to own close cycles, certifications, legal holds,
--     moderation, and report packs. It does not duplicate these tables.

CREATE TABLE master.risk_dimension (
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    category                text        NOT NULL,
    applicable_contexts     text[]      NOT NULL DEFAULT '{}'::text[],
    is_knockout             boolean     NOT NULL DEFAULT false,
    ordinal                 smallint    NOT NULL DEFAULT 0,
    is_system_defined       boolean     NOT NULL DEFAULT true,
    status                  text        NOT NULL DEFAULT 'active',

    CONSTRAINT risk_dimension_pkey PRIMARY KEY (code),
    CONSTRAINT risk_dimension_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT risk_dimension_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 240),
    CONSTRAINT risk_dimension_category_chk
        CHECK (category IN (
            'esg', 'credit', 'compliance', 'operational',
            'reputational', 'data_quality', 'engagement'
        )),
    CONSTRAINT risk_dimension_contexts_chk
        CHECK (applicable_contexts <@ ARRAY[
            'organization', 'supplier_role', 'customer_role',
            'project_engagement'
        ]::text[]),
    CONSTRAINT risk_dimension_ordinal_chk CHECK (ordinal >= 0),
    CONSTRAINT risk_dimension_status_chk
        CHECK (status IN ('active', 'deprecated'))
);

COMMENT ON TABLE master.risk_dimension IS
  'Platform risk taxonomy used by all Neon tenants. Model-specific weights and knockout behavior belong to risk_model_dimension.';

CREATE TABLE master.risk_driver_registry (
    code                      text        NOT NULL,
    name                      text        NOT NULL,
    description               text,
    default_dimension_code    text,
    default_severity          text        NOT NULL DEFAULT 'medium',
    applicable_evidence_types text[]      NOT NULL DEFAULT '{}'::text[],
    is_knockout               boolean     NOT NULL DEFAULT false,
    is_system_defined         boolean     NOT NULL DEFAULT true,

    CONSTRAINT risk_driver_registry_pkey PRIMARY KEY (code),
    CONSTRAINT risk_driver_registry_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT risk_driver_registry_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 240),
    CONSTRAINT risk_driver_registry_severity_chk
        CHECK (default_severity IN ('critical', 'high', 'medium', 'low', 'info'))
);

COMMENT ON TABLE master.risk_driver_registry IS
  'Reusable risk-driver definitions. Assessment drivers may remain ad hoc by leaving driver_code NULL.';

CREATE TABLE master.risk_model (
    code                    text        NOT NULL,
    version                 text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    applicable_context      text        NOT NULL,
    scoring_algorithm       text        NOT NULL DEFAULT 'weighted_average',
    risk_band_thresholds    jsonb       NOT NULL DEFAULT
        '{"low":[75,100],"medium":[50,74],"high":[25,49],"critical":[0,24]}'::jsonb,
    config                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,
    status                  text        NOT NULL DEFAULT 'active',

    CONSTRAINT risk_model_pkey PRIMARY KEY (code, version),
    CONSTRAINT risk_model_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT risk_model_version_chk
        CHECK (btrim(version) <> '' AND length(version) <= 64),
    CONSTRAINT risk_model_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 240),
    CONSTRAINT risk_model_context_chk
        CHECK (applicable_context IN (
            'organization', 'supplier_role', 'customer_role',
            'project_engagement', 'universal'
        )),
    CONSTRAINT risk_model_algorithm_chk
        CHECK (scoring_algorithm IN (
            'weighted_average', 'rule_based', 'ml_model', 'manual'
        )),
    CONSTRAINT risk_model_thresholds_object_chk
        CHECK (jsonb_typeof(risk_band_thresholds) = 'object'),
    CONSTRAINT risk_model_config_object_chk
        CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT risk_model_dates_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT risk_model_status_chk
        CHECK (status IN ('active', 'deprecated', 'experimental'))
);

COMMENT ON TABLE master.risk_model IS
  'Version-pinned risk scoring model. Active versions are immutable; publish a new version instead of changing historical interpretation.';

CREATE TABLE master.risk_model_dimension (
    model_code              text          NOT NULL,
    model_version           text          NOT NULL,
    dimension_code          text          NOT NULL,
    weight                  numeric(5,4)  NOT NULL,
    is_required             boolean       NOT NULL DEFAULT true,
    is_knockout             boolean       NOT NULL DEFAULT false,
    ordinal                 smallint      NOT NULL DEFAULT 0,

    CONSTRAINT risk_model_dimension_pkey
        PRIMARY KEY (model_code, model_version, dimension_code),
    CONSTRAINT risk_model_dimension_weight_chk
        CHECK (weight BETWEEN 0 AND 1),
    CONSTRAINT risk_model_dimension_ordinal_chk CHECK (ordinal >= 0)
);

COMMENT ON TABLE master.risk_model_dimension IS
  'Dimension weight and behavior within one immutable risk-model version.';

CREATE TABLE master.risk_source (
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    source_type             text        NOT NULL,
    provider_category       text        NOT NULL,
    trust_level             smallint    NOT NULL DEFAULT 3,
    refresh_mode            text        NOT NULL DEFAULT 'manual',
    status                  text        NOT NULL DEFAULT 'active',

    CONSTRAINT risk_source_pkey PRIMARY KEY (code),
    CONSTRAINT risk_source_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT risk_source_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 240),
    CONSTRAINT risk_source_type_chk
        CHECK (source_type IN (
            'external_provider', 'internal_system', 'manual', 'workflow'
        )),
    CONSTRAINT risk_source_provider_category_chk
        CHECK (provider_category IN (
            'esg', 'credit', 'sanctions', 'project', 'compliance', 'identity'
        )),
    CONSTRAINT risk_source_trust_chk CHECK (trust_level BETWEEN 1 AND 5),
    CONSTRAINT risk_source_refresh_chk
        CHECK (refresh_mode IN ('api', 'file', 'manual', 'event')),
    CONSTRAINT risk_source_status_chk
        CHECK (status IN ('active', 'deprecated', 'disabled'))
);

COMMENT ON TABLE master.risk_source IS
  'Platform registry of risk-signal origins. Tenant enablement and source policy live in control.risk_source_config.';

CREATE TABLE master.party_risk_assessment (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    subject_type          text          NOT NULL,
    subject_id            uuid          NOT NULL,
    business_partner_id   uuid          NOT NULL,
    assessment_context    text          NOT NULL,
    model_code            text          NOT NULL,
    model_version         text          NOT NULL,
    overall_score         numeric(5,2),
    risk_band             text          NOT NULL DEFAULT 'unknown',
    is_override           boolean       NOT NULL DEFAULT false,
    override_reason       text,
    override_score        numeric(5,2),
    status                text          NOT NULL DEFAULT 'draft',
    assessed_at           timestamptz,
    assessed_by           uuid,
    approved_at           timestamptz,
    approved_by           uuid,
    next_review_at        date,
    review_frequency      text,
    version               integer       NOT NULL DEFAULT 1,
    superseded_by         uuid,
    notes                 text,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    created_by            uuid          NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT party_risk_assessment_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_assessment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_assessment_subject_type_chk
        CHECK (subject_type IN (
            'business_partner', 'supplier', 'customer', 'project_engagement'
        )),
    CONSTRAINT party_risk_assessment_context_chk
        CHECK (assessment_context IN (
            'organization', 'supplier_role', 'customer_role', 'project_engagement'
        )),
    CONSTRAINT party_risk_assessment_subject_context_chk CHECK (
        (subject_type = 'business_partner' AND assessment_context = 'organization')
        OR (subject_type = 'supplier' AND assessment_context = 'supplier_role')
        OR (subject_type = 'customer' AND assessment_context = 'customer_role')
        OR (
            subject_type = 'project_engagement'
            AND assessment_context = 'project_engagement'
        )
    ),
    CONSTRAINT party_risk_assessment_score_chk
        CHECK (overall_score IS NULL OR overall_score BETWEEN 0 AND 100),
    CONSTRAINT party_risk_assessment_band_chk
        CHECK (risk_band IN ('critical', 'high', 'medium', 'low', 'unknown')),
    CONSTRAINT party_risk_assessment_override_chk CHECK (
        NOT is_override
        OR (
            override_reason IS NOT NULL
            AND btrim(override_reason) <> ''
            AND override_score BETWEEN 0 AND 100
        )
    ),
    CONSTRAINT party_risk_assessment_status_chk
        CHECK (status IN (
            'draft', 'pending_review', 'approved', 'superseded', 'archived'
        )),
    CONSTRAINT party_risk_assessment_approved_band_chk
        CHECK (status <> 'approved' OR risk_band <> 'unknown'),
    CONSTRAINT party_risk_assessment_review_frequency_chk
        CHECK (
            review_frequency IS NULL
            OR review_frequency IN ('monthly', 'quarterly', 'annually', 'on_event')
        ),
    CONSTRAINT party_risk_assessment_version_chk CHECK (version >= 1),
    CONSTRAINT party_risk_assessment_superseded_chk
        CHECK (superseded_by IS NULL OR status = 'superseded'),
    CONSTRAINT party_risk_assessment_approval_pair_chk
        CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT party_risk_assessment_assessment_pair_chk
        CHECK ((assessed_at IS NULL) = (assessed_by IS NULL)),
    CONSTRAINT party_risk_assessment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.party_risk_assessment IS
  'Versioned interpreted party-risk result. One approved row per subject and assessment context is enforced by a partial unique index.';

CREATE TABLE master.party_risk_dimension_score (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    assessment_id         uuid          NOT NULL,
    dimension_code        text          NOT NULL,
    raw_score             numeric(5,2),
    weighted_score        numeric(5,2),
    weight_applied        numeric(5,4),
    risk_band             text          NOT NULL DEFAULT 'unknown',
    knockout_hit          boolean       NOT NULL DEFAULT false,
    driver_count          integer       NOT NULL DEFAULT 0,
    coverage_pct          numeric(5,2),
    is_incomplete         boolean       NOT NULL DEFAULT false,
    notes                 text,

    CONSTRAINT party_risk_dimension_score_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_dimension_score_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_dimension_score_assessment_dimension_uq
        UNIQUE (tenant_id, assessment_id, dimension_code),
    CONSTRAINT party_risk_dimension_score_raw_chk
        CHECK (raw_score IS NULL OR raw_score BETWEEN 0 AND 100),
    CONSTRAINT party_risk_dimension_score_weighted_chk
        CHECK (weighted_score IS NULL OR weighted_score BETWEEN 0 AND 100),
    CONSTRAINT party_risk_dimension_score_weight_chk
        CHECK (weight_applied IS NULL OR weight_applied BETWEEN 0 AND 1),
    CONSTRAINT party_risk_dimension_score_band_chk
        CHECK (risk_band IN ('critical', 'high', 'medium', 'low', 'unknown')),
    CONSTRAINT party_risk_dimension_score_driver_count_chk CHECK (driver_count >= 0),
    CONSTRAINT party_risk_dimension_score_coverage_chk
        CHECK (coverage_pct IS NULL OR coverage_pct BETWEEN 0 AND 100)
);

COMMENT ON TABLE master.party_risk_dimension_score IS
  'Explainable per-dimension score inside one party-risk assessment.';

CREATE TABLE master.party_risk_evidence (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    subject_type          text          NOT NULL,
    subject_id            uuid          NOT NULL,
    business_partner_id   uuid          NOT NULL,
    source_code           text          NOT NULL,
    source_reference      text,
    evidence_type         text          NOT NULL,
    evidence_date         date,
    received_at           timestamptz   NOT NULL DEFAULT now(),
    valid_from            date,
    valid_until           date,
    title                 text          NOT NULL,
    summary               text,
    raw_payload           jsonb,
    normalized_payload    jsonb,
    confidence_score      numeric(5,2),
    status                text          NOT NULL DEFAULT 'active',
    superseded_by         uuid,
    ingested_by           uuid,
    ingested_via          text,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    created_by            uuid          NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT party_risk_evidence_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_evidence_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_evidence_subject_type_chk
        CHECK (subject_type IN (
            'business_partner', 'supplier', 'customer', 'project_engagement'
        )),
    CONSTRAINT party_risk_evidence_type_chk
        CHECK (evidence_type IN (
            'score', 'certificate', 'finding', 'alert', 'questionnaire',
            'engagement', 'sanction_hit', 'manual_override'
        )),
    CONSTRAINT party_risk_evidence_title_chk
        CHECK (btrim(title) <> '' AND length(title) <= 500),
    CONSTRAINT party_risk_evidence_validity_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT party_risk_evidence_payloads_chk CHECK (
        (raw_payload IS NULL OR jsonb_typeof(raw_payload) IN ('object', 'array'))
        AND (
            normalized_payload IS NULL
            OR jsonb_typeof(normalized_payload) IN ('object', 'array')
        )
    ),
    CONSTRAINT party_risk_evidence_confidence_chk
        CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
    CONSTRAINT party_risk_evidence_status_chk
        CHECK (status IN ('active', 'superseded', 'ignored', 'disputed', 'expired')),
    CONSTRAINT party_risk_evidence_superseded_chk
        CHECK (superseded_by IS NULL OR status = 'superseded'),
    CONSTRAINT party_risk_evidence_ingested_via_chk
        CHECK (
            ingested_via IS NULL
            OR ingested_via IN ('api', 'file_import', 'manual', 'workflow')
        ),
    CONSTRAINT party_risk_evidence_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.party_risk_evidence IS
  'Append-oriented incoming risk signal. Provider raw_payload becomes immutable once written; normalized_payload may be reprocessed.';

CREATE TABLE master.party_risk_driver (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    assessment_id         uuid          NOT NULL,
    dimension_score_id    uuid,
    evidence_id           uuid,
    dimension_code        text          NOT NULL,
    driver_code           text,
    severity              text          NOT NULL DEFAULT 'medium',
    impact_score          numeric(5,2),
    is_knockout           boolean       NOT NULL DEFAULT false,
    title                 text          NOT NULL,
    description           text,
    source_entity         text,
    source_record_id      uuid,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    created_by            uuid,

    CONSTRAINT party_risk_driver_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_driver_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_driver_severity_chk
        CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    CONSTRAINT party_risk_driver_impact_chk
        CHECK (impact_score IS NULL OR impact_score BETWEEN 0 AND 100),
    CONSTRAINT party_risk_driver_title_chk
        CHECK (btrim(title) <> '' AND length(title) <= 500),
    CONSTRAINT party_risk_driver_source_chk CHECK (
        evidence_id IS NOT NULL
        OR (source_entity IS NOT NULL AND source_record_id IS NOT NULL)
    )
);

COMMENT ON TABLE master.party_risk_driver IS
  'Explainability layer describing why an assessment received its score or band.';

CREATE TABLE master.party_risk_mitigation (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    business_partner_id   uuid          NOT NULL,
    assessment_id         uuid,
    driver_id             uuid,
    mitigation_type       text          NOT NULL,
    title                 text          NOT NULL,
    description           text,
    status                text          NOT NULL DEFAULT 'draft',
    due_date              date,
    completed_at          timestamptz,
    assigned_to           uuid,
    approved_by           uuid,
    approved_at           timestamptz,
    evidence_note         text,
    evidence_url          text,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    created_by            uuid          NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT party_risk_mitigation_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_mitigation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_mitigation_scope_chk
        CHECK (assessment_id IS NOT NULL OR driver_id IS NOT NULL),
    CONSTRAINT party_risk_mitigation_type_chk
        CHECK (mitigation_type IN (
            'waiver', 'corrective_action', 'monitoring', 'escalation',
            'rejection', 'conditional_approval'
        )),
    CONSTRAINT party_risk_mitigation_title_chk
        CHECK (btrim(title) <> '' AND length(title) <= 500),
    CONSTRAINT party_risk_mitigation_status_chk
        CHECK (status IN (
            'draft', 'pending_approval', 'approved', 'in_progress',
            'completed', 'overdue', 'cancelled'
        )),
    CONSTRAINT party_risk_mitigation_completed_chk
        CHECK (completed_at IS NULL OR status = 'completed'),
    CONSTRAINT party_risk_mitigation_approved_pair_chk
        CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
    CONSTRAINT party_risk_mitigation_evidence_url_chk
        CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://'),
    CONSTRAINT party_risk_mitigation_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.party_risk_mitigation IS
  'Risk acceptance, correction, monitoring, escalation, rejection, or conditional-approval action.';

CREATE TABLE master.party_risk_review_event (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    assessment_id         uuid          NOT NULL,
    event_type            text          NOT NULL,
    actor_id              uuid,
    actor_type            text          NOT NULL DEFAULT 'system',
    prior_status          text,
    new_status            text          NOT NULL,
    prior_risk_band       text,
    new_risk_band         text,
    comment               text,
    metadata              jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT party_risk_review_event_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_review_event_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_review_event_type_chk
        CHECK (event_type IN (
            'created', 'submitted', 'approved', 'rejected', 'overridden',
            'superseded', 'archived', 'scheduled_review'
        )),
    CONSTRAINT party_risk_review_event_actor_type_chk
        CHECK (actor_type IN ('user', 'system', 'api')),
    CONSTRAINT party_risk_review_event_actor_chk
        CHECK ((actor_type = 'system') OR actor_id IS NOT NULL),
    CONSTRAINT party_risk_review_event_new_status_chk
        CHECK (new_status IN (
            'draft', 'pending_review', 'approved', 'superseded', 'archived'
        )),
    CONSTRAINT party_risk_review_event_bands_chk CHECK (
        (prior_risk_band IS NULL OR prior_risk_band IN (
            'critical', 'high', 'medium', 'low', 'unknown'
        ))
        AND
        (new_risk_band IS NULL OR new_risk_band IN (
            'critical', 'high', 'medium', 'low', 'unknown'
        ))
    ),
    CONSTRAINT party_risk_review_event_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE master.party_risk_review_event IS
  'Immutable assessment lifecycle and review audit trail.';

-- Canonical Neon product, item, catalog, and bill-of-material foundation.

CREATE TABLE master.commodity_category (
    id                 uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                           NOT NULL,
    code               text                           NOT NULL,
    name               text                           NOT NULL,
    description        text,
    parent_id          uuid,
    sort_order         integer                        NOT NULL DEFAULT 0,
    metadata           jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status             master.catalog_record_status_d NOT NULL DEFAULT 'draft',
    is_active          boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz                    NOT NULL DEFAULT now(),
    created_by         uuid                           NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT commodity_category_pkey PRIMARY KEY (id),
    CONSTRAINT commodity_category_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT commodity_category_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT commodity_category_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT commodity_category_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT commodity_category_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT commodity_category_no_self_parent_chk
        CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT commodity_category_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT commodity_category_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT commodity_category_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.commodity_category IS
  'Tenant-owned hierarchical business taxonomy only. Buy, sell, inventory, accounting, tax, and tracking behavior belongs in control policy.';

CREATE TABLE master.product (
    id                    uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                           NOT NULL,
    code                  text                           NOT NULL,
    name                  text                           NOT NULL,
    description           text,
    product_type          master.product_type_d          NOT NULL,
    commodity_category_id uuid                           NOT NULL,
    base_uom_code         text                           NOT NULL,
    metadata              jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                master.catalog_record_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                    NOT NULL DEFAULT now(),
    created_by            uuid                           NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT product_pkey PRIMARY KEY (id),
    CONSTRAINT product_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT product_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT product_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT product_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT product_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT product_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT product_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT product_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.product IS
  'Tenant-wide commercial or technical definition. Supplier, price, tax, company, inventory, and BOM behavior are intentionally excluded.';

CREATE TABLE master.item (
    id                   uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                           NOT NULL,
    company_code_id      uuid                           NOT NULL,
    product_id           uuid                           NOT NULL,
    code                 text                           NOT NULL,
    name                 text                           NOT NULL,
    description          text,
    base_uom_code        text                           NOT NULL,
    is_purchasable       boolean                        NOT NULL DEFAULT false,
    is_sellable          boolean                        NOT NULL DEFAULT false,
    is_inventory_managed boolean                        NOT NULL DEFAULT false,
    is_manufactured      boolean                        NOT NULL DEFAULT false,
    metadata             jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status               master.catalog_record_status_d NOT NULL DEFAULT 'draft',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                    NOT NULL DEFAULT now(),
    created_by           uuid                           NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT item_pkey PRIMARY KEY (id),
    CONSTRAINT item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT item_company_id_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT item_company_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT item_company_product_uq
        UNIQUE (tenant_id, company_code_id, product_id),
    CONSTRAINT item_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT item_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT item_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT item_capability_chk CHECK (
        is_purchasable OR is_sellable OR is_inventory_managed OR is_manufactured
        OR status = 'draft'
    ),
    CONSTRAINT item_manufactured_inventory_chk
        CHECK (NOT is_manufactured OR is_inventory_managed),
    CONSTRAINT item_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT item_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT item_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.item IS
  'Company-code operational identity used by procurement, sales, inventory, BOM, production, and projects. Category derives through product.';

CREATE TABLE master.commodity_code_assignment (
    id                    uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                               NOT NULL,
    commodity_category_id uuid,
    product_id            uuid,
    item_id               uuid,
    commodity_domain_code text                               NOT NULL,
    commodity_code_id     uuid                               NOT NULL,
    mapping_type          master.classification_mapping_d    NOT NULL DEFAULT 'exact',
    confidence            numeric(5,2),
    provenance            master.classification_provenance_d NOT NULL DEFAULT 'manual',
    is_owner_primary      boolean                            NOT NULL DEFAULT false,
    is_code_routing_default boolean                          NOT NULL DEFAULT false,
    description           text,
    metadata              jsonb                              NOT NULL DEFAULT '{}'::jsonb,
    status                master.catalog_record_status_d     NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                        NOT NULL DEFAULT now(),
    created_by            uuid                               NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT commodity_code_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT commodity_code_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT commodity_code_assignment_exact_owner_chk CHECK (
        num_nonnulls(commodity_category_id, product_id, item_id) = 1
    ),
    CONSTRAINT commodity_code_assignment_domain_chk
        CHECK (commodity_domain_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT commodity_code_assignment_confidence_chk
        CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
    CONSTRAINT commodity_code_assignment_routing_owner_chk CHECK (
        NOT is_code_routing_default
        OR commodity_category_id IS NOT NULL
    ),
    CONSTRAINT commodity_code_assignment_routing_mapping_chk CHECK (
        NOT is_code_routing_default
        OR mapping_type IN ('exact', 'broader')
    ),
    CONSTRAINT commodity_code_assignment_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT commodity_code_assignment_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT commodity_code_assignment_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT commodity_code_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.commodity_code_assignment IS
  'Authoritative bidirectional commodity-code assignment for exactly one category, product, or company item. Owner-primary rows resolve owner to code; category routing-default rows resolve incoming codes and their nearest classified ancestors back to a tenant category.';

COMMENT ON COLUMN master.commodity_code_assignment.is_owner_primary IS
  'Preferred code for the owner within commodity_domain_code. Multiple domains may each have one primary assignment.';

COMMENT ON COLUMN master.commodity_code_assignment.is_code_routing_default IS
  'Permits reverse code-to-category routing. Valid only for category assignments and unique for an active tenant/domain/code coordinate.';

CREATE TABLE master.catalog (
    id                           uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                    uuid                           NOT NULL,
    company_code_id              uuid                           NOT NULL,
    code                         text                           NOT NULL,
    name                         text                           NOT NULL,
    catalog_direction            master.catalog_direction_d     NOT NULL,
    supplier_business_partner_id uuid,
    source_system                text,
    source_account_id            uuid,
    source_catalog_id            uuid,
    source_publication_id        uuid,
    source_revision_no           integer,
    source_content_hash          text,
    valid_from                   date,
    valid_until                  date,
    metadata                     jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                       master.catalog_record_status_d NOT NULL DEFAULT 'draft',
    is_active                    boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at            timestamptz,
    status_changed_by            uuid,
    created_at                   timestamptz                    NOT NULL DEFAULT now(),
    created_by                   uuid                           NOT NULL,
    updated_at                   timestamptz,
    updated_by                   uuid,

    CONSTRAINT catalog_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_company_id_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT catalog_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT catalog_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT catalog_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT catalog_supplier_direction_chk CHECK (
        catalog_direction <> 'buy'
        OR supplier_business_partner_id IS NOT NULL
        OR status = 'draft'
    ),
    CONSTRAINT catalog_source_coordinate_chk CHECK (
        (
            source_system IS NULL
            AND source_account_id IS NULL
            AND source_catalog_id IS NULL
            AND source_publication_id IS NULL
            AND source_revision_no IS NULL
            AND source_content_hash IS NULL
        )
        OR (
            source_system IS NOT NULL
            AND source_account_id IS NOT NULL
            AND source_catalog_id IS NOT NULL
            AND source_publication_id IS NOT NULL
            AND source_revision_no IS NOT NULL
            AND source_content_hash IS NOT NULL
        )
    ),
    CONSTRAINT catalog_source_system_chk
        CHECK (source_system IS NULL OR btrim(source_system) <> ''),
    CONSTRAINT catalog_source_revision_chk
        CHECK (source_revision_no IS NULL OR source_revision_no >= 1),
    CONSTRAINT catalog_source_hash_chk CHECK (
        source_content_hash IS NULL
        OR source_content_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT catalog_range_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT catalog_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.catalog_item (
    id                     uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                           NOT NULL,
    catalog_id             uuid                           NOT NULL,
    item_id                uuid                           NOT NULL,
    source_catalog_item_id uuid,
    external_item_code     text,
    display_name_override  text,
    minimum_order_qty      numeric(18,6),
    order_multiple         numeric(18,6),
    lead_time_days         integer,
    valid_from             date,
    valid_until            date,
    metadata               jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                 master.catalog_record_status_d NOT NULL DEFAULT 'draft',
    is_active              boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz                    NOT NULL DEFAULT now(),
    created_by             uuid                           NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT catalog_item_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_item_coordinate_uq UNIQUE (tenant_id, catalog_id, item_id),
    CONSTRAINT catalog_item_external_code_chk
        CHECK (external_item_code IS NULL OR btrim(external_item_code) <> ''),
    CONSTRAINT catalog_item_display_name_chk
        CHECK (display_name_override IS NULL OR btrim(display_name_override) <> ''),
    CONSTRAINT catalog_item_order_chk CHECK (
        (minimum_order_qty IS NULL OR minimum_order_qty > 0)
        AND (order_multiple IS NULL OR order_multiple > 0)
    ),
    CONSTRAINT catalog_item_lead_time_chk
        CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    CONSTRAINT catalog_item_range_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT catalog_item_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_item_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_item_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.catalog_item IS
  'Purchaser-approved catalog listing. item_id is mandatory; unmatched supplier offers remain in document.catalog_import_line.';

CREATE TABLE master.catalog_price (
    id                 uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                           NOT NULL,
    catalog_item_id    uuid                           NOT NULL,
    price_type         text                           NOT NULL DEFAULT 'list',
    unit_price         numeric(18,6)                  NOT NULL,
    price_unit         numeric(18,6)                  NOT NULL DEFAULT 1,
    currency_code      character(3)                   NOT NULL,
    price_uom_code     text                           NOT NULL,
    minimum_quantity   numeric(18,6),
    maximum_quantity   numeric(18,6),
    valid_from         date                           NOT NULL DEFAULT CURRENT_DATE,
    valid_until        date,
    source_price_id    uuid,
    metadata           jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status             master.catalog_record_status_d NOT NULL DEFAULT 'active',
    is_active          boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz                    NOT NULL DEFAULT now(),
    created_by         uuid                           NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT catalog_price_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_price_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_price_type_chk
        CHECK (price_type IN ('list', 'contract', 'tier', 'promotional', 'internal')),
    CONSTRAINT catalog_price_amount_chk
        CHECK (unit_price >= 0 AND price_unit > 0),
    CONSTRAINT catalog_price_quantity_chk CHECK (
        (minimum_quantity IS NULL OR minimum_quantity >= 0)
        AND (maximum_quantity IS NULL OR maximum_quantity >= 0)
        AND (
            minimum_quantity IS NULL
            OR maximum_quantity IS NULL
            OR maximum_quantity >= minimum_quantity
        )
    ),
    CONSTRAINT catalog_price_range_chk
        CHECK (valid_until IS NULL OR valid_until >= valid_from),
    CONSTRAINT catalog_price_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_price_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_price_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.bom (
    id                 uuid                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                NOT NULL,
    company_code_id    uuid                NOT NULL,
    output_item_id     uuid                NOT NULL,
    code               text                NOT NULL,
    name               text                NOT NULL,
    bom_type           master.bom_type_d   NOT NULL,
    base_quantity      numeric(18,6)       NOT NULL DEFAULT 1,
    uom_code           text                NOT NULL,
    effective_from     date,
    effective_until    date,
    metadata           jsonb               NOT NULL DEFAULT '{}'::jsonb,
    status             master.bom_status_d NOT NULL DEFAULT 'draft',
    is_active          boolean GENERATED ALWAYS AS (status = 'released') STORED,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz         NOT NULL DEFAULT now(),
    created_by         uuid                NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT bom_pkey PRIMARY KEY (id),
    CONSTRAINT bom_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bom_company_id_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT bom_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT bom_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT bom_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT bom_quantity_chk CHECK (base_quantity > 0),
    CONSTRAINT bom_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from),
    CONSTRAINT bom_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bom_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bom_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.bom_component (
    id                   uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                           NOT NULL,
    company_code_id      uuid                           NOT NULL,
    bom_id               uuid                           NOT NULL,
    component_item_id    uuid                           NOT NULL,
    line_no              integer                        NOT NULL,
    quantity             numeric(18,6)                  NOT NULL,
    uom_code             text                           NOT NULL,
    scrap_percent        numeric(7,4)                   NOT NULL DEFAULT 0,
    issue_method         text                           NOT NULL DEFAULT 'manual',
    is_optional          boolean                        NOT NULL DEFAULT false,
    alternate_group_code text,
    sort_order           integer                        NOT NULL DEFAULT 0,
    metadata             jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status               master.catalog_record_status_d NOT NULL DEFAULT 'active',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                    NOT NULL DEFAULT now(),
    created_by           uuid                           NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT bom_component_pkey PRIMARY KEY (id),
    CONSTRAINT bom_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bom_component_line_uq UNIQUE (tenant_id, bom_id, line_no),
    CONSTRAINT bom_component_item_uq
        UNIQUE NULLS NOT DISTINCT (
            tenant_id, bom_id, component_item_id, alternate_group_code
        ),
    CONSTRAINT bom_component_line_chk CHECK (line_no >= 1),
    CONSTRAINT bom_component_quantity_chk CHECK (quantity > 0),
    CONSTRAINT bom_component_scrap_chk
        CHECK (scrap_percent >= 0 AND scrap_percent < 100),
    CONSTRAINT bom_component_issue_method_chk
        CHECK (issue_method IN ('manual', 'backflush', 'preflush')),
    CONSTRAINT bom_component_alternate_group_chk
        CHECK (alternate_group_code IS NULL OR btrim(alternate_group_code) <> ''),
    CONSTRAINT bom_component_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bom_component_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bom_component_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.bom IS
  'Company-specific bill of material whose output and components are operational master.item identities.';

COMMENT ON TABLE master.bom_component IS
  'BOM component requirement. Released historical content is copied into snapshot.bom_component.';

CREATE TABLE master.project (
    id                       uuid                    NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                    NOT NULL,
    company_code_id          uuid                    NOT NULL,
    customer_id              uuid,
    code                     text                    NOT NULL,
    name                     text                    NOT NULL,
    description              text,
    project_type             master.project_type_d   NOT NULL,
    responsible_principal_id uuid,
    default_cost_center_id   uuid,
    currency_code            character(3)            NOT NULL,
    planned_start            date,
    planned_end              date,
    actual_start             date,
    actual_end               date,
    metadata                 jsonb                   NOT NULL DEFAULT '{}'::jsonb,
    status                   master.project_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz             NOT NULL DEFAULT now(),
    created_by               uuid                    NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT project_pkey PRIMARY KEY (id),
    CONSTRAINT project_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_company_id_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT project_company_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT project_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT project_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT project_description_chk CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT project_planned_range_chk CHECK (
        planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start
    ),
    CONSTRAINT project_actual_range_chk CHECK (
        actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start
    ),
    CONSTRAINT project_completion_chk CHECK (
        status NOT IN ('completed', 'closed')
        OR (actual_start IS NOT NULL AND actual_end IS NOT NULL)
    ),
    CONSTRAINT project_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT project_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT project_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.project_wbs (
    id                       uuid                      NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                      NOT NULL,
    project_id               uuid                      NOT NULL,
    parent_wbs_id            uuid,
    wbs_code                 text                      NOT NULL,
    name                     text                      NOT NULL,
    description              text,
    wbs_type                 master.project_wbs_type_d NOT NULL,
    level_no                 smallint                  NOT NULL DEFAULT 1,
    is_postable              boolean                   NOT NULL DEFAULT false,
    responsible_principal_id uuid,
    default_cost_center_id   uuid,
    planned_start            date,
    planned_end              date,
    sort_order               integer                   NOT NULL DEFAULT 0,
    metadata                 jsonb                     NOT NULL DEFAULT '{}'::jsonb,
    status                   master.project_record_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz               NOT NULL DEFAULT now(),
    created_by               uuid                      NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT project_wbs_pkey PRIMARY KEY (id),
    CONSTRAINT project_wbs_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_wbs_project_id_uq UNIQUE (tenant_id, project_id, id),
    CONSTRAINT project_wbs_code_uq UNIQUE (tenant_id, project_id, wbs_code),
    CONSTRAINT project_wbs_code_fmt_chk CHECK (wbs_code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,126}$'),
    CONSTRAINT project_wbs_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT project_wbs_no_self_parent_chk CHECK (parent_wbs_id IS NULL OR parent_wbs_id <> id),
    CONSTRAINT project_wbs_level_chk CHECK (level_no >= 1),
    CONSTRAINT project_wbs_postable_chk CHECK (
        NOT is_postable OR wbs_type IN ('control_account', 'work_package')
    ),
    CONSTRAINT project_wbs_range_chk CHECK (
        planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start
    ),
    CONSTRAINT project_wbs_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT project_wbs_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT project_wbs_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.project_item (
    id                  uuid                       NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                       NOT NULL,
    project_id          uuid                       NOT NULL,
    project_wbs_id      uuid,
    item_id             uuid,
    code                text                       NOT NULL,
    name                text                       NOT NULL,
    description         text,
    item_type           master.project_item_type_d NOT NULL,
    uom_code            text                       NOT NULL,
    planned_quantity    numeric(18,6),
    estimated_unit_cost numeric(18,6),
    currency_code       character(3),
    metadata            jsonb                      NOT NULL DEFAULT '{}'::jsonb,
    status              master.project_record_status_d NOT NULL DEFAULT 'draft',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                NOT NULL DEFAULT now(),
    created_by          uuid                       NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT project_item_pkey PRIMARY KEY (id),
    CONSTRAINT project_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_item_project_id_uq UNIQUE (tenant_id, project_id, id),
    CONSTRAINT project_item_code_uq UNIQUE (tenant_id, project_id, code),
    CONSTRAINT project_item_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT project_item_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT project_item_quantity_chk CHECK (
        planned_quantity IS NULL OR planned_quantity > 0
    ),
    CONSTRAINT project_item_cost_chk CHECK (
        (estimated_unit_cost IS NULL AND currency_code IS NULL)
        OR (estimated_unit_cost IS NOT NULL AND estimated_unit_cost >= 0 AND currency_code IS NOT NULL)
    ),
    CONSTRAINT project_item_catalog_kind_chk CHECK (
        item_id IS NULL OR item_type IN ('material', 'service', 'asset')
    ),
    CONSTRAINT project_item_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT project_item_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT project_item_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.project IS
  'Company-specific accounting/project identity. WBS owns hierarchy; budgets and ledger own financial amounts.';
COMMENT ON TABLE master.project_wbs IS
  'Project financial and scope hierarchy. Only postable control-account/work-package rows may be used by accounting.';
COMMENT ON TABLE master.project_item IS
  'Project requirement catalog. Work execution and quantities consumed belong to document.project_task_requirement.';

CREATE TABLE master.compensation_assignment (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    employee_id uuid NOT NULL,
    employment_id uuid NOT NULL,
    pay_group_id uuid NOT NULL,
    pay_structure_id uuid,
    currency_code character(3) NOT NULL,
    base_amount numeric(18,4) NOT NULL,
    annualized_amount numeric(18,4),
    effective_from date NOT NULL,
    effective_until date,
    source_compensation_change_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status master.compensation_assignment_status_d NOT NULL DEFAULT 'planned',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT compensation_assignment_pkey PRIMARY KEY(id),
    CONSTRAINT compensation_assignment_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT compensation_assignment_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT compensation_assignment_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT compensation_assignment_amount_chk CHECK(base_amount>=0 AND (annualized_amount IS NULL OR annualized_amount>=0)),
    CONSTRAINT compensation_assignment_dates_chk CHECK(effective_until IS NULL OR effective_until>=effective_from),
    CONSTRAINT compensation_assignment_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT compensation_assignment_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT compensation_assignment_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

COMMENT ON TABLE master.compensation_assignment IS
  'Immutable effective-dated employee compensation fact. Approved compensation changes create a new assignment and supersede the prior row.';

-- Neon authoritative business-partner extensions.

CREATE TABLE master.business_partner_relationship (
    id                       uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                              NOT NULL,
    source_business_partner_id uuid                            NOT NULL,
    target_business_partner_id uuid                            NOT NULL,
    relationship_type_code   text                              NOT NULL,
    record_version           bigint                            NOT NULL DEFAULT 1,
    country_code             character(2),
    effective_from           date,
    effective_until          date,
    notes                    text,
    metadata                 jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                   master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                       NOT NULL DEFAULT now(),
    created_by               uuid                              NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT business_partner_relationship_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_relationship_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_relationship_not_self_chk
        CHECK (source_business_partner_id <> target_business_partner_id),
    CONSTRAINT business_partner_relationship_type_chk
        CHECK (relationship_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_relationship_record_version_chk
        CHECK (record_version >= 1),
    CONSTRAINT business_partner_relationship_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until > effective_from),
    CONSTRAINT business_partner_relationship_notes_chk
        CHECK (notes IS NULL OR length(notes) <= 4000),
    CONSTRAINT business_partner_relationship_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384),
    CONSTRAINT business_partner_relationship_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_relationship_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_governance_relation (
    id                         uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid                               NOT NULL,
    business_partner_id        uuid                               NOT NULL,
    relation_type_code         text                               NOT NULL,
    member_name                text                               NOT NULL,
    member_type                master.governance_member_type_d    NOT NULL DEFAULT 'individual',
    member_business_partner_id uuid,
    member_country_code        character(2),
    business_title             text,
    ownership_pct              numeric(7,4),
    voting_pct                 numeric(7,4),
    beneficial_ownership_pct   numeric(7,4),
    appointed_date             date,
    end_of_term                date,
    notes                      text,
    metadata                   jsonb                              NOT NULL DEFAULT '{}'::jsonb,
    status                     master.partner_extension_status_d  NOT NULL DEFAULT 'draft',
    is_active                  boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    created_at                 timestamptz                        NOT NULL DEFAULT now(),
    created_by                 uuid                               NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT business_partner_governance_relation_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_governance_relation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_governance_relation_type_chk
        CHECK (relation_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_governance_relation_name_chk
        CHECK (btrim(member_name) <> '' AND length(member_name) <= 320),
    CONSTRAINT business_partner_governance_relation_pct_chk CHECK (
        (ownership_pct IS NULL OR ownership_pct BETWEEN 0 AND 100)
        AND (voting_pct IS NULL OR voting_pct BETWEEN 0 AND 100)
        AND (beneficial_ownership_pct IS NULL
             OR beneficial_ownership_pct BETWEEN 0 AND 100)
    ),
    CONSTRAINT business_partner_governance_relation_dates_chk
        CHECK (end_of_term IS NULL OR appointed_date IS NULL
               OR end_of_term >= appointed_date),
    CONSTRAINT business_partner_governance_relation_member_chk
        CHECK (member_business_partner_id IS NULL
               OR member_business_partner_id <> business_partner_id),
    CONSTRAINT business_partner_governance_relation_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_governance_relation_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_governance_relation_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_identifier (
    id                  uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                              NOT NULL,
    business_partner_id uuid                              NOT NULL,
    scheme_code         text                              NOT NULL,
    identifier_value    text                              NOT NULL,
    issuing_authority   text,
    issuing_country_code character(2),
    issued_at           date,
    effective_until     date,
    is_primary          boolean                           NOT NULL DEFAULT false,
    verified_at         timestamptz,
    verified_by         uuid,
    metadata            jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status              master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                       NOT NULL DEFAULT now(),
    created_by          uuid                              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT business_partner_identifier_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_identifier_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_identifier_scheme_chk
        CHECK (scheme_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_identifier_value_chk
        CHECK (btrim(identifier_value) <> '' AND length(identifier_value) <= 256),
    CONSTRAINT business_partner_identifier_dates_chk
        CHECK (effective_until IS NULL OR issued_at IS NULL
               OR effective_until >= issued_at),
    CONSTRAINT business_partner_identifier_verification_pair_chk
        CHECK ((verified_at IS NULL) = (verified_by IS NULL)),
    CONSTRAINT business_partner_identifier_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_identifier_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_identifier_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_tax_registration (
    id                     uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                              NOT NULL,
    business_partner_id    uuid                              NOT NULL,
    jurisdiction_id        uuid                              NOT NULL,
    tax_type_id            uuid,
    registration_type_code text                              NOT NULL,
    registration_number    text                              NOT NULL,
    effective_from         date,
    effective_until        date,
    is_primary             boolean                           NOT NULL DEFAULT false,
    verified_at            timestamptz,
    verified_by            uuid,
    metadata               jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                 master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active              boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz                       NOT NULL DEFAULT now(),
    created_by             uuid                              NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT business_partner_tax_registration_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_tax_registration_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_tax_registration_type_chk
        CHECK (registration_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_tax_registration_number_chk
        CHECK (btrim(registration_number) <> ''
               AND length(registration_number) <= 128),
    CONSTRAINT business_partner_tax_registration_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until > effective_from),
    CONSTRAINT business_partner_tax_registration_verification_pair_chk
        CHECK ((verified_at IS NULL) = (verified_by IS NULL)),
    CONSTRAINT business_partner_tax_registration_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_tax_registration_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_tax_registration_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_commodity_capability (
    id                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                              NOT NULL,
    business_partner_id   uuid                              NOT NULL,
    commodity_category_id uuid                              NOT NULL,
    partner_role          master.partner_role_d             NOT NULL,
    effective_from        date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_until       date,
    notes                 text,
    metadata              jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                       NOT NULL DEFAULT now(),
    created_by            uuid                              NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT business_partner_commodity_capability_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_commodity_capability_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_commodity_capability_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT business_partner_commodity_capability_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_commodity_capability_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_commodity_capability_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_industry_classification (
    id                   uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                              NOT NULL,
    business_partner_id  uuid                              NOT NULL,
    industry_domain_code text                              NOT NULL,
    industry_code_id     uuid                              NOT NULL,
    assignment_kind      text                              NOT NULL DEFAULT 'declared',
    is_primary           boolean                           NOT NULL DEFAULT false,
    confidence           smallint,
    effective_from       date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_until      date,
    verified_at          timestamptz,
    verified_by          uuid,
    source_system        text,
    source_reference     text,
    metadata             jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status               master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                       NOT NULL DEFAULT now(),
    created_by           uuid                              NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT business_partner_industry_classification_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_industry_classification_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_industry_classification_domain_chk
        CHECK (industry_domain_code IN ('isic', 'naics')),
    CONSTRAINT business_partner_industry_classification_kind_chk
        CHECK (assignment_kind IN ('declared', 'verified', 'inferred', 'imported')),
    CONSTRAINT business_partner_industry_classification_confidence_chk
        CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
    CONSTRAINT business_partner_industry_classification_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT business_partner_industry_classification_verification_chk
        CHECK (
            ((verified_at IS NULL) = (verified_by IS NULL))
            AND (assignment_kind <> 'verified' OR verified_at IS NOT NULL)
        ),
    CONSTRAINT business_partner_industry_classification_source_chk
        CHECK (
            (source_system IS NULL OR (btrim(source_system) <> '' AND length(source_system) <= 128))
            AND (source_reference IS NULL OR (btrim(source_reference) <> '' AND length(source_reference) <= 256))
        ),
    CONSTRAINT business_partner_industry_classification_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_industry_classification_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_industry_classification_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_operating_organization_assignment (
    id                        uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                              NOT NULL,
    business_partner_id       uuid                              NOT NULL,
    operating_organization_id uuid                              NOT NULL,
    partner_role              master.partner_role_d             NOT NULL,
    effective_from            date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_until           date,
    metadata                  jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                    master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active                 boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at         timestamptz,
    status_changed_by         uuid,
    created_at                timestamptz                       NOT NULL DEFAULT now(),
    created_by                uuid                              NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,

    CONSTRAINT business_partner_operating_org_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_operating_org_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_operating_org_assignment_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT business_partner_operating_org_assignment_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 8192),
    CONSTRAINT business_partner_operating_org_assignment_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_operating_org_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.company_code_supplier_profile (
    id                                uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                         uuid                              NOT NULL,
    supplier_id                       uuid                              NOT NULL,
    company_code_id                   uuid                              NOT NULL,
    currency_code                     character(3),
    payment_term_id                   uuid,
    default_accounting_profile_id     uuid,
    preferred_remittance_bank_link_id uuid,
    default_dimension_set_id          uuid,
    metadata                          jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                            master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active                         boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                 timestamptz,
    status_changed_by                 uuid,
    created_at                        timestamptz                       NOT NULL DEFAULT now(),
    created_by                        uuid                              NOT NULL,
    updated_at                        timestamptz,
    updated_by                        uuid,

    CONSTRAINT company_code_supplier_profile_pkey PRIMARY KEY (id),
    CONSTRAINT company_code_supplier_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT company_code_supplier_profile_company_id_uq
        UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT company_code_supplier_profile_coordinate_uq
        UNIQUE (tenant_id, supplier_id, company_code_id),
    CONSTRAINT company_code_supplier_profile_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384
               AND NOT (metadata ?| ARRAY['creditLimit','bankAccount','paymentTerms','currency'])),
    CONSTRAINT company_code_supplier_profile_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_code_supplier_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.company_code_customer_profile (
    id                            uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                     uuid                              NOT NULL,
    customer_id                   uuid                              NOT NULL,
    company_code_id               uuid                              NOT NULL,
    currency_code                 character(3),
    payment_term_id               uuid,
    default_accounting_profile_id uuid,
    default_dimension_set_id      uuid,
    statement_cycle_code          text,
    metadata                      jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                        master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active                     boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at             timestamptz,
    status_changed_by             uuid,
    created_at                    timestamptz                       NOT NULL DEFAULT now(),
    created_by                    uuid                              NOT NULL,
    updated_at                    timestamptz,
    updated_by                    uuid,

    CONSTRAINT company_code_customer_profile_pkey PRIMARY KEY (id),
    CONSTRAINT company_code_customer_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT company_code_customer_profile_company_id_uq
        UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT company_code_customer_profile_coordinate_uq
        UNIQUE (tenant_id, customer_id, company_code_id),
    CONSTRAINT company_code_customer_profile_statement_chk
        CHECK (statement_cycle_code IS NULL
               OR statement_cycle_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT company_code_customer_profile_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384
               AND NOT (metadata ?| ARRAY['creditLimit','riskClass','keyAccount','paymentTerms','currency'])),
    CONSTRAINT company_code_customer_profile_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_code_customer_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.legal_entity_internal_partner_link (
    id                  uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                              NOT NULL,
    legal_entity_id     uuid                              NOT NULL,
    business_partner_id uuid                              NOT NULL,
    effective_from      date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    notes               text,
    metadata            jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status              master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                       NOT NULL DEFAULT now(),
    created_by          uuid                              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT legal_entity_internal_partner_link_pkey PRIMARY KEY (id),
    CONSTRAINT legal_entity_internal_partner_link_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT legal_entity_internal_partner_link_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT legal_entity_internal_partner_link_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT legal_entity_internal_partner_link_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT legal_entity_internal_partner_link_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.legal_entity_internal_partner_link IS
  'Optional effective-dated one-to-one mapping from a statutory legal entity to the internal Business Partner identity used for intercompany counterparty operations.';

CREATE TABLE master.intercompany_trading_pair (
    id                              uuid                                   NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid                                   NOT NULL,
    source_company_code_id          uuid                                   NOT NULL,
    counterparty_company_code_id    uuid                                   NOT NULL,
    counterparty_supplier_profile_id uuid,
    mirror_customer_profile_id      uuid,
    requires_agreement              boolean                                NOT NULL DEFAULT true,
    mirror_mode                     master.intercompany_mirror_mode_d       NOT NULL DEFAULT 'manual',
    settlement_mode                 master.intercompany_settlement_mode_d   NOT NULL DEFAULT 'open_item',
    effective_from                  date,
    effective_until                 date,
    notes                           text,
    metadata                        jsonb                                  NOT NULL DEFAULT '{}'::jsonb,
    status                          master.partner_extension_status_d       NOT NULL DEFAULT 'draft',
    is_active                       boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,
    created_at                      timestamptz                             NOT NULL DEFAULT now(),
    created_by                      uuid                                    NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT intercompany_trading_pair_pkey PRIMARY KEY (id),
    CONSTRAINT intercompany_trading_pair_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT intercompany_trading_pair_not_self_chk
        CHECK (source_company_code_id <> counterparty_company_code_id),
    CONSTRAINT intercompany_trading_pair_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until > effective_from),
    CONSTRAINT intercompany_trading_pair_mirror_chk
        CHECK (mirror_mode = 'disabled' OR mirror_customer_profile_id IS NOT NULL
               OR status <> 'active'),
    CONSTRAINT intercompany_trading_pair_supplier_chk
        CHECK (counterparty_supplier_profile_id IS NOT NULL OR status <> 'active'),
    CONSTRAINT intercompany_trading_pair_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT intercompany_trading_pair_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT intercompany_trading_pair_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.contact_person_identity_link (
    tenant_id         uuid        NOT NULL,
    contact_person_id uuid        NOT NULL,
    person_id         uuid        NOT NULL,
    link_type         text        NOT NULL DEFAULT 'same_person',
    effective_from    date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until   date,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,

    CONSTRAINT contact_person_identity_link_pkey
        PRIMARY KEY (tenant_id, contact_person_id),
    CONSTRAINT contact_person_identity_link_type_chk
        CHECK (link_type = 'same_person'),
    CONSTRAINT contact_person_identity_link_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from)
);

-- Neon party finance/compliance optional pack.

CREATE TABLE master.certification_type (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  tenant_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  issuing_body text,
  category text,
  description text,
  is_custom boolean DEFAULT false NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active'::text) STORED,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamp with time zone,
  updated_by uuid,
  CONSTRAINT certification_type_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.certification_type IS
  'ARCHETYPE=A;SCOPE=P+T. Shared certification type registry. NULL tenant_id denotes a platform type; non-NULL denotes a tenant custom type.';
COMMENT ON COLUMN master.certification_type.tenant_id IS
  'NULL = platform-wide standard available to all tenants. UUID = tenant-scoped custom type.';

CREATE TABLE master.certification (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  tenant_id uuid NOT NULL,
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  certification_type_id uuid,
  custom_name text,
  certificate_number text,
  certified_by text,
  certified_location text,
  additional_info text,
  document_attachment_id uuid,
  effective_from date,
  effective_until date,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active'::text) STORED,
  status_changed_at timestamp with time zone,
  status_changed_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamp with time zone,
  updated_by uuid,
  company_code_id uuid,
  site_id uuid,
  CONSTRAINT certification_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
  CONSTRAINT certification_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.certification IS
  'ARCHETYPE=B;SCOPE=T. Shared polymorphic certification record for a party, organization, person, product, or other domain owner.';
COMMENT ON COLUMN master.certification.certification_type_id IS
  'Registered shared certification type. Exactly one of certification_type_id or custom_name must be set.';
COMMENT ON COLUMN master.certification.document_attachment_id IS
  'Optional identifier of the uploaded certificate document; attachment ownership is resolved by the consuming plane.';
COMMENT ON COLUMN master.certification.company_code_id IS
  'Optional company scope identifier. NULL means the certification applies to the entire owner.';
COMMENT ON COLUMN master.certification.site_id IS
  'Optional physical-site scope identifier. NULL means the certification applies to the entire owner.';


CREATE TABLE master.organization_amendment (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    resource_kind text NOT NULL,
    resource_id uuid NOT NULL,
    revision_no bigint NOT NULL,
    amendment_kind text NOT NULL,
    before_state jsonb NOT NULL,
    after_state jsonb NOT NULL,
    effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    reason text,
    correlation_id uuid,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    recorded_by uuid NOT NULL,
    CONSTRAINT organization_amendment_pkey PRIMARY KEY(id),
    CONSTRAINT organization_amendment_coordinate_uq UNIQUE(tenant_id,resource_kind,resource_id,revision_no),
    CONSTRAINT organization_amendment_kind_chk CHECK(resource_kind IN ('legal_entity','operating_organization','operating_organization_company_assignment','business_partner')),
    CONSTRAINT organization_amendment_revision_chk CHECK(revision_no>=1),
    CONSTRAINT organization_amendment_type_chk CHECK(amendment_kind ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT organization_amendment_state_chk CHECK(jsonb_typeof(before_state)='object' AND jsonb_typeof(after_state)='object' AND before_state<>after_state),
    CONSTRAINT organization_amendment_reason_chk CHECK(reason IS NULL OR (btrim(reason)<>'' AND length(reason)<=2000))
);
COMMENT ON TABLE master.organization_amendment IS 'Append-only Neon amendment evidence for legal entities, operating organizations and company participation assignments, and business partners; current source rows remain authoritative.';
