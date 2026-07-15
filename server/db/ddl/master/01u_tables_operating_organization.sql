-- ============================================================================
-- master/01u_tables_operating_organization.sql
-- Operating Organization foundation for cross-company orchestration.
-- Domains: procurement and sales.
-- Depends on: master.tenant, master.company_code, master.principal.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.operating_organization (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    domain              text        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    display_name        text,
    description         text,
    parent_id           uuid,

    effective_from      date,
    effective_until     date,
    scope_version       bigint      NOT NULL DEFAULT 1,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

    status              text        NOT NULL DEFAULT 'draft',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT operating_organization_pkey PRIMARY KEY (id),
    CONSTRAINT operating_organization_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT operating_organization_tenant_domain_code_uq
        UNIQUE (tenant_id, domain, code),
    CONSTRAINT operating_organization_domain_chk
        CHECK (domain IN ('procurement', 'sales')),
    CONSTRAINT operating_organization_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT operating_organization_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT operating_organization_code_fmt
        CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,62}$'),
    CONSTRAINT operating_organization_status_chk
        CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
    CONSTRAINT operating_organization_no_self_parent
        CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT operating_organization_effective_order_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until >= effective_from),
    CONSTRAINT operating_organization_scope_version_chk CHECK (scope_version > 0),
    CONSTRAINT operating_organization_metadata_obj_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT operating_organization_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.operating_organization IS
    'ARCHETYPE=B;SCOPE=T. Tenant-owned cross-company orchestration boundary. '
    'The domain distinguishes procurement and sales behavior. Company codes '
    'retain legal, financial, and accounting ownership.';
COMMENT ON COLUMN master.operating_organization.domain IS
    'Sealed domain: procurement or sales. Domain is immutable after creation.';
COMMENT ON COLUMN master.operating_organization.parent_id IS
    'Optional same-tenant navigation hierarchy. Does not imply RBAC inheritance in v1.';
COMMENT ON COLUMN master.operating_organization.scope_version IS
    'Monotonic version bumped by authorization-relevant organization or membership changes.';


CREATE TABLE IF NOT EXISTS master.operating_organization_company (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    operating_organization_id   uuid        NOT NULL,
    company_code_id             uuid        NOT NULL,
    participation_role          text        NOT NULL DEFAULT 'participant',

    effective_from              date        NOT NULL DEFAULT current_date,
    effective_until             date,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,

    status                      text        NOT NULL DEFAULT 'active',
    status_changed_at           timestamptz,
    status_changed_by           uuid,

    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT operating_organization_company_pkey PRIMARY KEY (id),
    CONSTRAINT operating_organization_company_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT operating_organization_company_membership_uq
        UNIQUE (tenant_id, operating_organization_id, company_code_id),
    CONSTRAINT operating_organization_company_role_nonempty
        CHECK (btrim(participation_role) <> ''),
    CONSTRAINT operating_organization_company_status_chk
        CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
    CONSTRAINT operating_organization_company_effective_order_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT operating_organization_company_metadata_obj_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT operating_organization_company_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.operating_organization_company IS
    'ARCHETYPE=B_LITE;SCOPE=T. Effective-dated Company Code membership in an '
    'Operating Organization. Participation roles are validated against the parent domain.';


CREATE TABLE IF NOT EXISTS master.procurement_organization_profile (
    tenant_id                   uuid        NOT NULL,
    operating_organization_id   uuid        NOT NULL,
    organization_type           text        NOT NULL,
    buying_model_default        text        NOT NULL DEFAULT 'federated',
    default_currency            char(3),
    default_lead_company_id     uuid,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT procurement_organization_profile_pkey
        PRIMARY KEY (tenant_id, operating_organization_id),
    CONSTRAINT procurement_organization_profile_type_chk
        CHECK (organization_type IN (
            'central_procurement', 'shared_services', 'category_management',
            'regional_procurement', 'project_procurement'
        )),
    CONSTRAINT procurement_organization_profile_buying_model_chk
        CHECK (buying_model_default IN ('federated', 'central_buyer')),
    CONSTRAINT procurement_organization_profile_currency_chk
        CHECK (default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT procurement_organization_profile_metadata_obj_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT procurement_organization_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.procurement_organization_profile IS
    'ARCHETYPE=B_LITE;SCOPE=T. Procurement behavior for an Operating Organization '
    'whose domain is procurement.';


CREATE TABLE IF NOT EXISTS master.sales_organization_profile (
    tenant_id                    uuid        NOT NULL,
    operating_organization_id    uuid        NOT NULL,
    organization_type            text        NOT NULL,
    selling_model_default        text        NOT NULL DEFAULT 'federated',
    default_currency             char(3),
    default_booking_company_id   uuid,
    default_invoicing_company_id uuid,
    metadata                     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid        NOT NULL,
    updated_at                   timestamptz,
    updated_by                   uuid,

    CONSTRAINT sales_organization_profile_pkey
        PRIMARY KEY (tenant_id, operating_organization_id),
    CONSTRAINT sales_organization_profile_type_chk
        CHECK (organization_type IN (
            'central_sales', 'regional_sales', 'enterprise_sales',
            'channel_sales', 'project_sales'
        )),
    CONSTRAINT sales_organization_profile_selling_model_chk
        CHECK (selling_model_default IN ('federated', 'principal_seller')),
    CONSTRAINT sales_organization_profile_currency_chk
        CHECK (default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT sales_organization_profile_metadata_obj_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_organization_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.sales_organization_profile IS
    'ARCHETYPE=B_LITE;SCOPE=T. Sales behavior for an Operating Organization '
    'whose domain is sales.';

