-- Plane-local commercial subscription catalog.
-- Plan version history is captured by the plane's snapshot schema.

CREATE TABLE control.subscription_plan (
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
