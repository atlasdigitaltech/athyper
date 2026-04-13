-- 04_tables/003a_master_identity.sql
-- Depends on: 01_schemas, 02_types_domains
-- Master schema tables (Part A): tenant, identity, RBAC, teams, delegation, collaboration, and document/branding.
-- Seed principal: systemadmin (id = '00000000-0000-0000-0000-000000000000').

-- §1 tenant
CREATE TABLE IF NOT EXISTS master.tenant (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    display_name    text              NOT NULL,
    realm_key       text              NOT NULL DEFAULT 'athyper',
    region          text,
    subscription    text              NOT NULL DEFAULT 'base',

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            text            NOT NULL DEFAULT 'provisioning',
    is_active         boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT tenant_pkey              PRIMARY KEY (id),
    CONSTRAINT tenant_realm_code_uq     UNIQUE (realm_key, code),
    CONSTRAINT tenant_code_fmt          CHECK (code ~ '^[a-z][a-z0-9_-]{1,62}$'),
    CONSTRAINT tenant_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT tenant_display_nonempty  CHECK (btrim(display_name) <> ''),
    CONSTRAINT tenant_realm_key_fmt     CHECK (realm_key ~ '^[a-z][a-z0-9_-]{1,62}$')
);

COMMENT ON TABLE master.tenant IS
  'Multi-tenant root entity. PK: uuidv7 id. '
  'Natural key: (realm_key, code) — code is unique per realm only. '
  'Different realms may share the same code.';

-- §2 principal — universal actor: users, service accounts, bots
CREATE TABLE IF NOT EXISTS master.principal (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific (identity classification)
    principal_type      text          NOT NULL,

    -- Table-specific (operational flags)
    is_active           boolean       GENERATED ALWAYS AS (status = 'active') STORED,
    is_locked           boolean       NOT NULL DEFAULT false,
    is_service_account  boolean       NOT NULL DEFAULT false,

    -- Table-specific (auth cache — trigger-maintained, never write directly)
    login_email         text,

    -- Table-specific (identity correlation)
    external_ref        text,
    principal_source    text,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            text            NOT NULL DEFAULT 'active',
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT principal_pkey                PRIMARY KEY (id),
    CONSTRAINT principal_tenant_code_uq      UNIQUE (tenant_id, code),
    CONSTRAINT principal_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT principal_code_nonempty       CHECK (btrim(code) <> ''),
    CONSTRAINT principal_name_nonempty       CHECK (btrim(name) <> ''),
    CONSTRAINT principal_login_email_norm_chk CHECK (login_email IS NULL OR login_email = lower(trim(login_email))),
    -- Sealed platform vocabulary — inline CHECK only, no lookup domain
    CONSTRAINT principal_source_chk          CHECK (principal_source IS NULL
        OR principal_source IN ('internal', 'scim', 'saml_jit', 'oidc_jit', 'import', 'api'))
);

COMMENT ON TABLE  master.principal IS
  'Universal actor: users, service accounts, bots. Core identity only — see principal_profile for display data, contact_link for addresses.';
COMMENT ON COLUMN master.principal.login_email IS
  'Trigger-maintained cache of verified primary login email. Source of truth: contact_link. Never write directly.';
COMMENT ON COLUMN master.principal.external_ref IS
    'Opaque correlation key from upstream HR/IAM system. '
    'Unique per tenant when populated. Used for identity reconciliation.';
COMMENT ON COLUMN master.principal.principal_source IS
    'How this principal was created. Sealed platform enum (inline CHECK). '
    'Values: internal, scim, saml_jit, oidc_jit, import, api.';

-- §3 principal_profile — 1:1 with principal (display, Keycloak binding, IdP snapshot)
CREATE TABLE IF NOT EXISTS master.principal_profile (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (link)
    principal_id    uuid              NOT NULL,

    -- Table-specific (display / profile)
    given_name      text,
    family_name     text,
    preferred_name  text,
    display_name    text,
    avatar_url      text,

    -- Table-specific (locale overrides)
    locale          text,
    timezone        text,

    -- Table-specific (Keycloak binding)
    keycloak_id                     text,
    keycloak_username               text,
    keycloak_created_at_millis      bigint,
    keycloak_federation_link        text,
    keycloak_not_before             bigint,
    keycloak_required_actions       text[]      NOT NULL DEFAULT '{}',
    keycloak_service_client_id      text,

    -- Table-specific (Keycloak sync health)
    keycloak_synced_at              timestamptz,
    keycloak_sync_status            text        NOT NULL DEFAULT 'pending',

    -- Table-specific (account lifecycle)
    enabled_date    timestamptz,
    disabled_date   timestamptz,

    -- Table-specific (IdP snapshot — audit only, non-canonical)
    -- DEPRECATED (Phase 4): keycloak_* and idp_snapshot migrated to principal_identity_binding
    idp_snapshot    jsonb,
    attributes      jsonb,

    -- Table-specific (working-context defaults — extend default_company_code_id/supervisor_id/supervisor_source added in 06_constraints)
    default_company_code_id      uuid,
    default_cost_center_id       uuid,
    default_profit_center_id     uuid,
    default_project_id           uuid,
    default_dimension_set_id     uuid,
    default_budget_allocation_id uuid,
    employee_id                  uuid,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT principal_profile_pkey             PRIMARY KEY (id),
    CONSTRAINT principal_profile_principal_uq     UNIQUE (tenant_id, principal_id),
    CONSTRAINT principal_profile_keycloak_uq      UNIQUE NULLS NOT DISTINCT (keycloak_id),
    -- Intentionally a sealed inline CHECK — not lookup-backed. Keycloak sync status
    -- values are protocol-defined, not business-extensible. Same pattern on mfa_config.
    CONSTRAINT principal_profile_sync_status_chk  CHECK (keycloak_sync_status IN ('pending', 'synced', 'drift', 'error')),
    CONSTRAINT principal_profile_lifecycle_chk    CHECK ((disabled_date IS NULL) OR (enabled_date IS NOT NULL AND disabled_date >= enabled_date))
);

COMMENT ON TABLE  master.principal_profile IS
  '1:1 with principal. Display profile, Keycloak binding, IdP snapshot (audit only). '
  'Working-context defaults (company, cost center, etc.) pre-populate document headers.';
COMMENT ON COLUMN master.principal_profile.default_company_code_id IS
    'Working-context default company code. Pre-populates document headers. '
    'NULL = user must always choose.';
COMMENT ON COLUMN master.principal_profile.default_cost_center_id IS
    'Working-context default cost center for expense allocation.';
COMMENT ON COLUMN master.principal_profile.default_profit_center_id IS
    'Working-context default profit center for revenue allocation.';
COMMENT ON COLUMN master.principal_profile.default_project_id IS
    'Working-context default project for line-item dimensioning.';
COMMENT ON COLUMN master.principal_profile.default_dimension_set_id IS
    'Composite dimension default. FK to master.dimension_set. '
    'Supplies additional dimension axes beyond CC/PC/project.';
COMMENT ON COLUMN master.principal_profile.default_budget_allocation_id IS
    'FUTURE ANCHOR — no FK target yet. Default budget envelope for '
    'commitment creation. FK will be added when budget allocation entity is created.';
COMMENT ON COLUMN master.principal_profile.employee_id IS
    'Optional FK bridge to master.employee. Allows principal -> employee '
    'navigation without joining through principal_id. NULL for non-employees.';

-- §3b principal_identity_binding — dedicated IdP/Keycloak shadow (Phase 4)
-- One row per (principal, provider). Multi-IdP ready.
-- Separated from principal_profile: "who is this person in the product"
-- vs "how is this actor represented in IAM".
CREATE TABLE IF NOT EXISTS master.principal_identity_binding (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Link to principal
    principal_id            uuid            NOT NULL,

    -- Provider identity (sealed platform/protocol vocabulary — inline CHECK only)
    provider_code           text            NOT NULL,

    -- Subject / external identity
    subject_id              text            NOT NULL,
    username                text,

    -- Federation details
    federation_link         text,
    created_at_millis       bigint,
    not_before              bigint,

    -- Service client binding (for service accounts — trigger-only enforcement)
    service_client_id       text,

    -- Required actions pending on IdP side
    required_actions        text[]          NOT NULL DEFAULT '{}',

    -- Sync health (sealed protocol enum — inline CHECK only)
    synced_at               timestamptz,
    sync_status             text            NOT NULL DEFAULT 'pending',
    sync_error_message      text,
    sync_retry_count        smallint        NOT NULL DEFAULT 0,

    -- Raw provider snapshot (audit trail — non-canonical)
    idp_snapshot            jsonb,
    provider_attributes     jsonb,

    -- Account lifecycle (as seen by IdP)
    idp_enabled             boolean         NOT NULL DEFAULT true,
    idp_email_verified      boolean         NOT NULL DEFAULT false,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pib_pkey                 PRIMARY KEY (id),
    CONSTRAINT pib_principal_provider_uq UNIQUE (tenant_id, principal_id, provider_code),
    CONSTRAINT pib_subject_provider_uq  UNIQUE (tenant_id, provider_code, subject_id),
    CONSTRAINT pib_provider_code_chk    CHECK (provider_code IN (
        'keycloak', 'azure_ad', 'okta', 'google',
        'saml_generic', 'oidc_generic'
    )),
    CONSTRAINT pib_sync_status_chk      CHECK (sync_status IN (
        'pending', 'synced', 'drift', 'error', 'disabled'
    )),
    CONSTRAINT pib_subject_nonempty     CHECK (btrim(subject_id) <> ''),
    CONSTRAINT pib_sync_retry_chk       CHECK (sync_retry_count >= 0)
);

COMMENT ON TABLE master.principal_identity_binding IS
    'IdP/Keycloak shadow table. One row per (principal, provider). '
    'Separated from principal_profile: "who is this person in the product" '
    'vs "how is this actor represented in IAM". Multi-IdP ready.';
COMMENT ON COLUMN master.principal_identity_binding.provider_code IS
    'Identity provider code. Sealed enum (inline CHECK). Adding a new IdP '
    'requires code changes in the sync adapter — not business-extensible.';
COMMENT ON COLUMN master.principal_identity_binding.subject_id IS
    'IdP-specific principal identifier (Keycloak UUID, Azure OID, etc.).';
COMMENT ON COLUMN master.principal_identity_binding.idp_snapshot IS
    'Full user representation JSON from provider API. Non-canonical — audit only.';
COMMENT ON COLUMN master.principal_identity_binding.sync_status IS
    'Sync health. Sealed protocol enum (inline CHECK): '
    'pending, synced, drift, error, disabled.';


-- §4 contact_link — polymorphic canonical address store
CREATE TABLE IF NOT EXISTS master.contact_link (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,
    code            text,
    name            text,

    -- Table-specific (ownership — polymorphic)
    owner_type      text              NOT NULL,
    owner_id        uuid              NOT NULL,

    -- Table-specific (channel)
    channel_type    text              NOT NULL,
    value           text              NOT NULL,
    purpose         text,

    -- Table-specific (state)
    is_primary      boolean           NOT NULL DEFAULT false,
    is_verified     boolean           NOT NULL DEFAULT false,
    verified_at     timestamptz,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            text            NOT NULL DEFAULT 'active',
    is_active         boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT contact_link_pkey              PRIMARY KEY (id),
    CONSTRAINT contact_link_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT contact_link_value_nonempty    CHECK (btrim(value) <> ''),
    CONSTRAINT contact_link_verified_at_chk   CHECK (is_verified = false OR verified_at IS NOT NULL)
);

COMMENT ON TABLE  master.contact_link IS
  'Polymorphic canonical address store. One row per owner+channel+purpose. Detail in contact_email/contact_phone.';

-- §5 contact_email — 1:1 extension of contact_link for channel_type=email
CREATE TABLE IF NOT EXISTS master.contact_email (
    -- Identity
    id                  uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid          NOT NULL,

    -- Table-specific (link)
    contact_link_id    uuid          NOT NULL,

    -- Table-specific (parsed components)
    local_part          text,
    domain              text,

    -- Table-specific (deliverability)
    is_disposable       boolean       NOT NULL DEFAULT false,
    mx_checked_at       timestamptz,
    mx_valid            boolean,

    -- Table-specific (bounce tracking)
    bounce_count        integer       NOT NULL DEFAULT 0,
    last_bounce_at      timestamptz,
    last_bounce_reason  text,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT contact_email_pkey              PRIMARY KEY (id),
    CONSTRAINT contact_email_contact_link_uq  UNIQUE (tenant_id, contact_link_id),
    CONSTRAINT contact_email_local_lower_chk   CHECK (local_part IS NULL OR local_part = lower(local_part)),
    CONSTRAINT contact_email_domain_lower_chk  CHECK (domain IS NULL OR domain = lower(domain)),
    CONSTRAINT contact_email_bounce_count_chk  CHECK (bounce_count >= 0),
    CONSTRAINT contact_email_bounce_reason_chk CHECK (last_bounce_reason IS NULL OR last_bounce_reason IN ('hard', 'soft', 'complaint'))
);

COMMENT ON TABLE  master.contact_email IS
  '1:1 extension of contact_link for channel_type=email. Deliverability metadata and parsed components.';

-- §6 contact_phone — 1:1 extension of contact_link for phone/sms/whatsapp
CREATE TABLE IF NOT EXISTS master.contact_phone (
    -- Identity
    id                  uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid          NOT NULL,

    -- Table-specific (link)
    contact_link_id    uuid          NOT NULL,

    -- Table-specific (E.164 decomposition)
    e164                text,
    calling_code        text,
    national_number     text,

    -- Table-specific (carrier enrichment)
    carrier_hint        text,
    line_type           text,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT contact_phone_pkey              PRIMARY KEY (id),
    CONSTRAINT contact_phone_contact_link_uq  UNIQUE (tenant_id, contact_link_id),
    CONSTRAINT contact_phone_e164_chk          CHECK (e164 IS NULL OR e164 ~ '^\+[1-9]\d{1,14}$'),
    CONSTRAINT contact_phone_calling_code_fmt  CHECK (calling_code IS NULL OR calling_code ~ '^[1-9]\d{0,3}$'),
    CONSTRAINT contact_phone_line_type_chk     CHECK (line_type IS NULL OR line_type IN ('mobile', 'landline', 'voip', 'unknown'))
);

COMMENT ON TABLE  master.contact_phone IS
  '1:1 extension of contact_link for phone/sms/whatsapp. E.164 decomposition and carrier metadata.';

-- §7 label — localisation labels keyed by (entity, code, locale_code)
CREATE TABLE IF NOT EXISTS master.label (
    -- Identity (surrogate PK; natural key via UNIQUE below)
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    entity          text              NOT NULL,
    code            text              NOT NULL,
    locale_code     text              NOT NULL,
    tenant_id       uuid,                           -- NULL = global / platform-wide label

    -- Table-specific
    name            text              NOT NULL,
    description     text,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active       boolean           GENERATED ALWAYS AS (status = 'active') STORED,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT label_pkey              PRIMARY KEY (id),
    -- Global labels (tenant_id IS NULL) and tenant overrides coexist for the
    -- same (entity, code, locale_code). NULLS NOT DISTINCT treats NULL
    -- tenant_id as a single value, preventing duplicate global labels.
    CONSTRAINT label_natural_uq        UNIQUE NULLS NOT DISTINCT (entity, code, locale_code, tenant_id),
    CONSTRAINT label_name_nonempty     CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.label IS
  'Localisation labels keyed by (entity, code, locale_code). '
  'Replaces hardcoded name/description columns across reference tables. '
  'locale_code references shared.locale(code). '
  'Entity/code pair validity enforced by master.trg_label_validate() '
  'via master.label_entity_type.';

COMMENT ON COLUMN master.label.entity      IS 'Logical entity identifier; must have a row in master.label_entity_type.';
COMMENT ON COLUMN master.label.code        IS 'PK value of the source row in the registered source table.';
COMMENT ON COLUMN master.label.locale_code IS 'BCP 47 locale tag; normalised by fn_trg_label_validate() on write.';
COMMENT ON COLUMN master.label.status      IS 'active = in use; deprecated = soft-removed.';
COMMENT ON COLUMN master.label.metadata    IS 'Reserved for future extension (e.g. translator notes, source flags).';

-- §8 label_entity_type — maps entity identifiers to source tables
CREATE TABLE IF NOT EXISTS master.label_entity_type (
    -- Identity
    entity          text              NOT NULL,

    -- Table-specific
    source_schema   text              NOT NULL,
    source_table    text              NOT NULL,
    pk_column       text              NOT NULL DEFAULT 'code',
    name_column     text              NOT NULL DEFAULT 'name',
    description     text,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT label_entity_type_pkey            PRIMARY KEY (entity),
    CONSTRAINT label_entity_type_entity_fmt      CHECK (entity        ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT label_entity_type_schema_fmt      CHECK (source_schema ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT label_entity_type_table_fmt       CHECK (source_table  ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT label_entity_type_pk_col_fmt      CHECK (pk_column     ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT label_entity_type_name_col_fmt    CHECK (name_column   ~ '^[a-z][a-z0-9_]*$')
);

COMMENT ON TABLE master.label_entity_type IS
  'Registry mapping entity identifiers to their source table and label columns. '
  'Enables generic label synchronisation without hard-coding table paths.';


-- ============================================================================
-- §9  owner_type — polymorphic routing contract per entity type
-- ============================================================================
-- Central routing contract for every polymorphic table that uses owner_type.
-- A single row describes one entity type: which schema/table backs it,
-- which purposes are valid for addresses and contacts for that type, and
-- whether tenants may define custom extensions.
--
-- Design:
--   • code is the natural key stored in contact_link.owner_type and
--     address_link.owner_type. Must be lowercase snake_case.
--   • tenant_id IS NULL → system row (is_system = true).
--   • tenant_id IS NOT NULL → tenant extension row (is_system = false).
--   • schema_name + table_name + pk_column encode the routing contract.
--   • allowed_address_purposes / allowed_contact_purposes are advisory
--     arrays used by the UI to filter dropdowns (not enforced by DB).
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.owner_type (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    tenant_id       uuid,                           -- NULL = global/system row

    -- Table-specific (display)
    name            text              NOT NULL,
    description     text,
    category        text,                           -- 'identity'|'party'|'structure'|'asset'|'custom'
    sort_order      smallint          NOT NULL DEFAULT 0,

    -- Table-specific (routing contract)
    schema_name     text,                           -- NULL only for tenant custom types
    table_name      text,                           -- NULL only for tenant custom types
    pk_column       text              NOT NULL DEFAULT 'id',

    -- Table-specific (capability flags)
    supports_address  boolean         NOT NULL DEFAULT true,
    supports_contact  boolean         NOT NULL DEFAULT true,

    -- Table-specific (advisory purpose filters — UI only, not enforced by DB)
    allowed_address_purposes  text[]  NOT NULL DEFAULT '{}',
    allowed_contact_purposes  text[]  NOT NULL DEFAULT '{}',

    -- Table-specific (extensibility)
    is_system                 boolean NOT NULL DEFAULT true,
    is_extensible_by_tenant   boolean NOT NULL DEFAULT false,

    -- Table-specific (tenant ownership validation for owner_id references)
    is_tenant_scoped          boolean NOT NULL DEFAULT true,
    tenant_column             text    NOT NULL DEFAULT 'tenant_id',

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            text            NOT NULL DEFAULT 'active',
    is_active         boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT owner_type_pkey
        PRIMARY KEY (id),
    CONSTRAINT owner_type_code_fmt
        CHECK (code ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT owner_type_name_nonempty
        CHECK (btrim(name) <> ''),
    CONSTRAINT owner_type_status_chk
        CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT owner_type_system_consistency
        CHECK (
            (is_system = true  AND tenant_id IS NULL)
         OR (is_system = false AND tenant_id IS NOT NULL)
        ),
    CONSTRAINT owner_type_routing_chk
        CHECK (
            is_system = false
         OR (schema_name IS NOT NULL AND table_name IS NOT NULL)
        ),
    -- Intentionally a sealed enum (not lookup-backed). Adding a new category
    -- requires a DDL migration — this is by design to prevent uncontrolled
    -- proliferation of owner type categories.
    CONSTRAINT owner_type_category_chk
        CHECK (category IS NULL OR
               category IN ('identity', 'party', 'structure', 'asset', 'custom'))
);

COMMENT ON TABLE master.owner_type IS
  'Polymorphic routing contract. One row per entity type that can own addresses '
  'and contact links. Encodes the schema/table backing each owner_type code, '
  'plus advisory allowed_*_purposes arrays used by UI to filter dropdowns. '
  'PK is surrogate uuid (id). Uniqueness of code is per-namespace: '
  'system codes (tenant_id IS NULL) are globally unique; '
  'tenant codes (tenant_id IS NOT NULL) are unique per tenant. '
  'Two tenants CAN register the same code independently. '
  'fn_valid_owner_type() resolves by code + session tenant at runtime. '
  'System rows (is_system=true) map to real master.* tables. '
  'Tenant rows (is_system=false) allow custom entity types without schema changes.';

COMMENT ON COLUMN master.owner_type.code IS
  'Logical key. System rows: globally unique. Tenant rows: unique per tenant. '
  'Stored as-is in contact_link.owner_type and address_link.owner_type. '
  'Lowercase snake_case.';
COMMENT ON COLUMN master.owner_type.schema_name IS
  'PostgreSQL schema that contains the backing table (e.g. master).';
COMMENT ON COLUMN master.owner_type.table_name IS
  'PostgreSQL table that stores entities of this type (e.g. customer).';
COMMENT ON COLUMN master.owner_type.allowed_address_purposes IS
  'Advisory: purpose codes from master.address_purpose valid for this owner type. '
  'Used by UI to filter purpose dropdown. Not enforced by DB.';
COMMENT ON COLUMN master.owner_type.allowed_contact_purposes IS
  'Advisory: purpose codes from master.contact_link_purpose valid for contact_link '
  'rows of this owner type. Used by UI. Not enforced by DB.';


-- ============================================================================
-- §10  address — normalised postal address record
-- ============================================================================
-- Has no owner — ownership is expressed by address_link rows.
-- One physical address can be shared across multiple owners without
-- duplicating address data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.address (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,
    code            text,
    name            text,

    -- Table-specific (classification)
    address_type    text,                           -- lookup: master.address_type

    -- Table-specific (postal components)
    attention_line  text,                           -- "Attn: Accounts Payable"
    line1           text,
    line2           text,
    line3           text,                           -- building/floor/unit (APAC)
    city            text,
    region          text,                           -- state / province / county
    postal_code     text,
    country_code    text,                           -- ISO 3166-1 alpha-2 (uppercase)

    -- Table-specific (geocoding — populated async)
    latitude        numeric(9,6),
    longitude       numeric(9,6),

    -- Table-specific (display cache)
    formatted_address text,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            text            NOT NULL DEFAULT 'active',
    is_active         boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT address_pkey                 PRIMARY KEY (id),
    CONSTRAINT address_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT address_status_chk           CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT address_code_fmt             CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_-]*$'),
    CONSTRAINT address_line1_nonempty_chk   CHECK (line1 IS NULL OR btrim(line1) <> ''),
    CONSTRAINT address_postal_nonempty_chk  CHECK (postal_code IS NULL OR btrim(postal_code) <> ''),
    CONSTRAINT address_country_upper_chk    CHECK (country_code IS NULL OR country_code = upper(country_code)),
    CONSTRAINT address_lat_range_chk        CHECK (latitude  IS NULL OR latitude  BETWEEN -90  AND 90),
    CONSTRAINT address_lon_range_chk        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
    -- address_type_chk: deferred to 06_constraints via control.fn_valid_lookup
    -- address_country_fk: deferred to 06_constraints
    -- address_tenant_fk: deferred to 06_constraints
);

COMMENT ON TABLE master.address IS
  'Normalised postal address record. Owns no owner — ownership is expressed by '
  'master.address_link rows. One address can be shared across multiple owners '
  'without duplication. address_type = what the place physically is. '
  'Business purpose (billing, shipping…) lives on address_link, not here.';

COMMENT ON COLUMN master.address.attention_line IS
  'Addressee line printed before line1. E.g. "Attn: Accounts Payable".';
COMMENT ON COLUMN master.address.line3 IS
  'Third address line. Used in APAC addressing for building name, floor, unit number.';
COMMENT ON COLUMN master.address.address_type IS
  'Physical classification of the location. Lookup: master.address_type. '
  'Independent of the business purpose the address serves (see address_link.purpose).';
COMMENT ON COLUMN master.address.formatted_address IS
  'Single-string cache for display, print labels, and map rendering.';
COMMENT ON COLUMN master.address.latitude IS
  'WGS84 decimal degrees. Populated asynchronously by geocoding.';
COMMENT ON COLUMN master.address.longitude IS
  'WGS84 decimal degrees. Populated asynchronously by geocoding.';


-- ============================================================================
-- §11  address_link — polymorphic M:N bridge: owner → address with purpose
-- ============================================================================
-- Design:
--   • owner_type + owner_id: polymorphic ownership (FK to owner_type).
--   • purpose: business intent, uses master.address_purpose lookup domain.
--     Shares vocabulary conceptually with contact_link.purpose — the implicit
--     linking key that pairs a physical address with a contact channel.
--   • is_primary: canonical link when multiple exist for same owner+purpose.
--   • effective_from / effective_until: temporal validity window.
--   • btree_gist EXCLUDE prevents overlapping primaries per owner+purpose.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.address_link (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (polymorphic ownership)
    owner_type      text              NOT NULL,     -- FK → owner_type.code
    owner_id        uuid              NOT NULL,

    -- Table-specific (address reference)
    address_id      uuid              NOT NULL,

    -- Table-specific (classification)
    purpose         text              NOT NULL,     -- lookup: master.address_purpose

    -- Table-specific (state)
    is_primary      boolean           NOT NULL DEFAULT false,

    -- Table-specific (temporal validity)
    effective_from  date              NOT NULL DEFAULT CURRENT_DATE,
    effective_until date,                           -- NULL = open-ended / currently active

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT address_link_pkey
        PRIMARY KEY (id),
    CONSTRAINT address_link_owner_purpose_address_uq
        UNIQUE (tenant_id, owner_type, owner_id, purpose, address_id),
    CONSTRAINT address_link_temporal_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    -- address_link_default_is_primary_chk REMOVED — the invariant "default purpose
    -- must be primary" is enforced by fn_set_primary_address_link / fn_create_owner_contact_address
    -- which always promote after insert. The CHECK blocked the safe is_primary=false
    -- insert path needed to avoid address_link_one_primary_excl EXCLUDE collisions.

    -- Temporal primary exclusion: at most one is_primary=true per
    -- (tenant, owner, purpose) at any point in time.
    CONSTRAINT address_link_one_primary_excl
        EXCLUDE USING gist (
            tenant_id  WITH =,
            owner_type WITH =,
            owner_id   WITH =,
            purpose    WITH =,
            daterange(effective_from, COALESCE(effective_until, '9999-12-31'::date), '[)') WITH &&
        )
        WHERE (is_primary = true)

    -- address_link_address_fk: deferred to 06_constraints (composite FK)
    -- address_link_owner_type_chk: deferred to 06_constraints
    -- address_link_purpose_chk: deferred to 06_constraints
    -- address_link_tenant_fk: deferred to 06_constraints
);

COMMENT ON TABLE master.address_link IS
  'Polymorphic M:N bridge: owner → address with business purpose and temporal validity. '
  'One address row can be shared by multiple owners without duplication. '
  'purpose is conceptually correlated with contact_link.purpose — joining on '
  'owner_type + owner_id + purpose pairs a delivery address with the relevant contact.';

COMMENT ON COLUMN master.address_link.owner_type IS
  'Polymorphic discriminator. FK to master.owner_type.code.';
COMMENT ON COLUMN master.address_link.purpose IS
  'Business intent of this owner → address relationship. '
  'Lookup: master.address_purpose. Reserved ''default'' = catch-all fallback.';
COMMENT ON COLUMN master.address_link.is_primary IS
  'Canonical link when multiple addresses exist for the same owner+purpose. '
  'Enforced: at most one is_primary=true per owner+purpose per time period.';
COMMENT ON COLUMN master.address_link.effective_from IS
  'Inclusive start date of validity. DEFAULT CURRENT_DATE.';
COMMENT ON COLUMN master.address_link.effective_until IS
  'Exclusive end date. NULL = open-ended (currently active).';


-- §12  operating_unit — REMOVED (company_code migration)
-- Table dropped. See 13_patches/002_drop_operating_unit.sql.
-- ou_type lookup domain and 19 seed values removed alongside it.
DROP TABLE IF EXISTS master.operating_unit CASCADE;


-- ============================================================================
-- §13  tenant_module_subscription — tenant activated modules
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.tenant_module_subscription (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific
    module_id       uuid              NOT NULL,
    status          text              NOT NULL DEFAULT 'active',
    status_at       timestamptz,
    subscribed_at   timestamptz       NOT NULL DEFAULT now(),
    expires_at      timestamptz,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT tenant_module_subscription_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_module_subscription_uq   UNIQUE (tenant_id, module_id),
    CONSTRAINT tms_status_chk CHECK (status IN ('active','suspended','trial'))
);

COMMENT ON TABLE master.tenant_module_subscription IS
  'Tenant activated modules. Controls which product modules a tenant has access to.';


-- ============================================================================
-- §14  tenant_feature_entitlement — tenant activated features
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.tenant_feature_entitlement (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific
    feature_id      uuid              NOT NULL,
    status          text              NOT NULL DEFAULT 'active',
    activated_at    timestamptz       NOT NULL DEFAULT now(),
    expires_at      timestamptz,
    activated_by    uuid,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,

    CONSTRAINT tenant_feature_entitlement_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_feature_entitlement_uq   UNIQUE (tenant_id, feature_id),
    CONSTRAINT tfe_status_chk CHECK (status IN ('active','suspended','trial'))
);

COMMENT ON TABLE master.tenant_feature_entitlement IS
  'Tenant activated enterprise features. Checked alongside plan_feature_access for feature gate.';


-- ============================================================================
-- §15  tenant_permission_override — tenant-level permission overrides
-- ============================================================================
-- Referenced by check_permission() for plan-restricted permission bypasses.

CREATE TABLE IF NOT EXISTS master.tenant_permission_override (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific
    permission_id   uuid              NOT NULL,
    is_granted      boolean           NOT NULL DEFAULT true,
    reason          text,
    expires_at      timestamptz,
    granted_by      uuid,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,

    CONSTRAINT tenant_permission_override_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_permission_override_uq   UNIQUE (tenant_id, permission_id)
);

COMMENT ON TABLE master.tenant_permission_override IS
  'Tenant-level permission overrides. Allows granting plan-restricted permissions '
  'without upgrading the subscription plan. Checked by check_permission().';


-- ============================================================================
-- §16  company_code_access — polymorphic company-code ACL for master data
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.company_code_access (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (polymorphic target)
    entity_type     text              NOT NULL,
    entity_id       uuid              NOT NULL,

    -- Table-specific (company code reference)
    company_code_id uuid              NOT NULL,
    inherit_subtree boolean           NOT NULL DEFAULT true,

    -- Table-specific (provenance)
    granted_by      uuid,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,

    CONSTRAINT company_code_access_pkey PRIMARY KEY (id),
    CONSTRAINT company_code_access_uq   UNIQUE (tenant_id, entity_type, entity_id, company_code_id)
    -- entity_type validated by trg_cca_entity_type_lookup trigger (§9 in 09_triggers/)
    -- using lookup domain master.company_code_access_entity_type (extensible)
);

COMMENT ON TABLE master.company_code_access IS
  'Polymorphic company-code ACL for master data entities (supplier, customer, etc.). '
  'inherit_subtree=true means access extends to child company codes.';


-- ============================================================================
-- §17  role — moved to shared.role (see 001_shared.sql)
-- master.role is dropped; shared.role is the canonical table (no tenant_id, no is_system).


-- ============================================================================
-- §18  auth_group — RBAC groups (replaces association schema groups)
-- ============================================================================
-- Reuses the existing auth_group table name from the codebase.
-- This is the GROUP entity itself (not membership).

CREATE TABLE IF NOT EXISTS master.auth_group (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    description     text,
    is_system       boolean           NOT NULL DEFAULT false,
    is_self_service_eligible boolean  NOT NULL DEFAULT false,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          text              NOT NULL DEFAULT 'active',
    is_active       boolean           GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT auth_group_pkey           PRIMARY KEY (id),
    CONSTRAINT auth_group_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT auth_group_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT auth_group_code_nonempty  CHECK (btrim(code) <> ''),
    CONSTRAINT auth_group_name_nonempty  CHECK (btrim(name) <> ''),
    CONSTRAINT auth_group_status_chk     CHECK (status IN ('active','suspended','deprecated'))
);

COMMENT ON TABLE master.auth_group IS
  'RBAC group entity. Groups aggregate roles via auth_group_role. '
  'Principals are members via auth_group_member. '
  'is_system = true means standard group, immutable by tenant.';

COMMENT ON COLUMN master.auth_group.is_self_service_eligible IS
  'When true, principals may request membership in this group via a self-service '
  'profile update request (UPUPR). False by default — tenant admins explicitly '
  'flag groups as self-service eligible. Checked by UPUPR iam_group scope validation.';


-- ============================================================================
-- §19  auth_group_role — role assignments to groups (two-dimension scope lives here)
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.auth_group_role (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (links)
    group_id        uuid              NOT NULL,
    role_id         uuid              NOT NULL,

    -- Table-specific (visibility scope — row-level data filtering)
    visibility_scope text             NOT NULL,

    -- Table-specific (assignment scope — organizational boundary)
    assignment_scope_type    text     NOT NULL DEFAULT 'tenant',
    assignment_scope_ref_id  uuid,
    include_descendants      boolean  NOT NULL DEFAULT true,

    -- Table-specific (lifecycle)
    expires_at      timestamptz,
    assigned_by     uuid,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          text              NOT NULL DEFAULT 'active',
    is_active       boolean           GENERATED ALWAYS AS (status = 'active') STORED,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT auth_group_role_pkey     PRIMARY KEY (id),

    -- Uniqueness: same role can appear at different assignment scopes on one group
    CONSTRAINT auth_group_role_uq       UNIQUE NULLS NOT DISTINCT (
        tenant_id, group_id, role_id,
        assignment_scope_type, assignment_scope_ref_id, include_descendants
    ),

    -- Visibility scope: row-level filtering
    CONSTRAINT agr_visibility_scope_chk CHECK (visibility_scope IN ('all', 'own', 'team')),

    -- Assignment scope: organizational boundary
    CONSTRAINT agr_assignment_scope_chk CHECK (
        assignment_scope_type IN ('tenant', 'company_code', 'legal_entity')
    ),

    -- Ref consistency: tenant → NULL, company_code/legal_entity → NOT NULL
    CONSTRAINT agr_assignment_ref_chk CHECK (
        (assignment_scope_type = 'tenant'        AND assignment_scope_ref_id IS NULL)
     OR (assignment_scope_type = 'company_code'  AND assignment_scope_ref_id IS NOT NULL)
     OR (assignment_scope_type = 'legal_entity'  AND assignment_scope_ref_id IS NOT NULL)
    ),

    -- include_descendants only meaningful for legal_entity;
    -- must be true for tenant and company_code (irrelevant but enforced)
    CONSTRAINT agr_descendants_chk CHECK (
        assignment_scope_type = 'legal_entity'
        OR include_descendants = true
    ),

    CONSTRAINT agr_status_chk       CHECK (status IN ('active', 'suspended'))
);

COMMENT ON TABLE master.auth_group_role IS
    'Links roles to groups with two orthogonal scope dimensions: '
    'visibility_scope (all/own/team) controls row-level data filtering. '
    'assignment_scope_type + assignment_scope_ref_id controls the organizational '
    'boundary (tenant/company_code/legal_entity) in which the role applies. '
    'include_descendants controls legal_entity subtree traversal.';
COMMENT ON COLUMN master.auth_group_role.visibility_scope IS
    'Row-level data visibility: all (every record), own (created_by = principal), '
    'team (created_by in principal''s team).';
COMMENT ON COLUMN master.auth_group_role.assignment_scope_type IS
    'Organizational boundary: tenant (all CCs), company_code (single CC), '
    'legal_entity (CCs under an LE, subtree per include_descendants).';
COMMENT ON COLUMN master.auth_group_role.assignment_scope_ref_id IS
    'FK to master.company_code.id or master.legal_entity.id depending on '
    'assignment_scope_type. NULL when assignment_scope_type = tenant. '
    'Validated by trg_validate_assignment_scope trigger (tenant-safe).';
COMMENT ON COLUMN master.auth_group_role.include_descendants IS
    'Only meaningful for legal_entity scope. true = full descendant subtree, '
    'false = direct LE companies only. Must be true for tenant and company_code.';


-- ============================================================================
-- §20  auth_group_member — principal membership in groups
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.auth_group_member (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (links)
    principal_id    uuid              NOT NULL,
    group_id        uuid              NOT NULL,

    -- Table-specific (lifecycle)
    joined_at       timestamptz       NOT NULL DEFAULT now(),
    added_by        uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,

    CONSTRAINT auth_group_member_pkey PRIMARY KEY (id),
    CONSTRAINT auth_group_member_uq   UNIQUE (tenant_id, principal_id, group_id)
);

COMMENT ON TABLE master.auth_group_member IS
  'Links principals to groups. A principal inherits all roles (and their scopes) '
  'from every group they belong to.';


-- ============================================================================
-- §21  principal_persona — one persona per principal per tenant
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.principal_persona (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (links)
    principal_id    uuid              NOT NULL,
    persona_id      uuid              NOT NULL,

    -- Table-specific (lifecycle)
    expires_at      timestamptz,
    assigned_by     uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,

    CONSTRAINT principal_persona_pkey              PRIMARY KEY (id),
    -- ONE persona per principal per tenant — enforced at DB level
    CONSTRAINT principal_persona_one_per_tenant     UNIQUE (tenant_id, principal_id)
);

COMMENT ON TABLE master.principal_persona IS
  'Assigns exactly one persona per principal per tenant. '
  'Persona determines base permission set via shared.persona_permission.';


-- ============================================================================
-- §22  team — data scope resolver
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.team (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    leader_id       uuid              NOT NULL,
    team_type       text              NOT NULL DEFAULT 'functional',
    effective_from  date              NOT NULL DEFAULT CURRENT_DATE,
    effective_to    date,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          text              NOT NULL DEFAULT 'active',
    is_active       boolean           GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT team_pkey           PRIMARY KEY (id),
    CONSTRAINT team_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT team_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT team_code_nonempty  CHECK (btrim(code) <> ''),
    CONSTRAINT team_name_nonempty  CHECK (btrim(name) <> ''),
    CONSTRAINT team_type_chk       CHECK (team_type IN ('functional','project','virtual')),
    CONSTRAINT team_status_chk     CHECK (status IN ('active','suspended','closed')),
    CONSTRAINT team_temporal_chk   CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE master.team IS
  'Data scope resolver for scope=team permission evaluation. '
  'team_type: functional (permanent), project (time-bound), virtual (cross-functional).';


-- ============================================================================
-- §23  team_member — team membership
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.team_member (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (links)
    team_id         uuid              NOT NULL,
    principal_id    uuid              NOT NULL,

    -- Table-specific
    role_in_team    text,
    joined_at       timestamptz       NOT NULL DEFAULT now(),
    left_at         timestamptz,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,

    CONSTRAINT team_member_pkey       PRIMARY KEY (id)
    -- Patch 001 Fix 2: UNIQUE (tenant_id, team_id, principal_id) DEFERRABLE removed.
    -- Replaced by team_member_active_uidx partial unique index (left_at IS NULL only)
    -- so members who leave and re-join are not blocked by historical rows.
);

-- Patch 002 Fix 2: updated to reflect patch 001 change — DEFERRABLE UNIQUE removed,
-- replaced by partial index team_member_active_uidx (WHERE left_at IS NULL).
COMMENT ON TABLE master.team_member IS
    'Team membership. left_at preserved for history. '
    'Active members: left_at IS NULL. '
    'Uniqueness enforced by partial index team_member_active_uidx '
    '(WHERE left_at IS NULL) — allows re-joining after leaving.';


-- ============================================================================
-- §24  access_grant — runtime allow/deny overrides
-- ============================================================================
-- Exactly ONE subject (role OR group OR principal).
-- Deny targets principal only (SoD enforcement).

CREATE TABLE IF NOT EXISTS master.access_grant (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (subject — exactly ONE must be set)
    role_id         uuid,
    group_id        uuid,
    principal_id    uuid,

    -- Table-specific (what)
    permission_id   uuid              NOT NULL,
    effect          text              NOT NULL,

    -- Table-specific (optional visibility scope — allow grants only)
    visibility_scope text,

    -- Table-specific (optional assignment scope)
    assignment_scope_type    text,
    assignment_scope_ref_id  uuid,

    -- Table-specific (resource-level grant — optional)
    resource_type   text,
    resource_id     uuid,

    -- Table-specific (lifecycle)
    expires_at      timestamptz,
    request_id      uuid,
    revoked_at      timestamptz,
    revoked_by      uuid,
    granted_by      uuid,
    notes           text,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          text              NOT NULL DEFAULT 'active',
    is_active       boolean           GENERATED ALWAYS AS (status = 'active') STORED,

    -- Audit
    created_at          timestamptz       NOT NULL DEFAULT now(),
    created_by          uuid              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    CONSTRAINT access_grant_pkey PRIMARY KEY (id),
    CONSTRAINT ag_effect_chk     CHECK (effect IN ('allow', 'deny')),
    CONSTRAINT ag_visibility_scope_chk CHECK (
        visibility_scope IS NULL OR visibility_scope IN ('all', 'own', 'team')
    ),
    CONSTRAINT ag_assignment_scope_chk CHECK (
        assignment_scope_type IS NULL
     OR assignment_scope_type IN ('tenant', 'company_code', 'legal_entity')
    ),
    CONSTRAINT ag_assignment_ref_chk CHECK (
        assignment_scope_type IS NULL
     OR (assignment_scope_type = 'tenant'        AND assignment_scope_ref_id IS NULL)
     OR (assignment_scope_type = 'company_code'  AND assignment_scope_ref_id IS NOT NULL)
     OR (assignment_scope_type = 'legal_entity'  AND assignment_scope_ref_id IS NOT NULL)
    ),
    CONSTRAINT ag_status_chk     CHECK (status IN ('active', 'revoked', 'expired')),
    -- Exactly one subject
    CONSTRAINT ag_one_subject_chk
        CHECK (num_nonnulls(role_id, group_id, principal_id) = 1),
    -- Deny must target a specific principal only (prevents broad accidental denials)
    CONSTRAINT ag_deny_principal_only_chk
        CHECK (effect = 'allow' OR principal_id IS NOT NULL)
);

COMMENT ON TABLE master.access_grant IS
    'Runtime allow/deny overrides. Deny always beats allow (SoD enforcement). '
    'visibility_scope: optional row-level filter for allow grants. '
    'assignment_scope_type: optional org boundary. NULL = unscoped (applies regardless of CC). '
    'legal_entity scope on access_grant always means full descendant subtree '
    '(no include_descendants column — keeps override table simpler). '
    'updated_at/by stamped by trg_access_grant_updated_at; '
    'status_changed_at/by stamped by trg_access_grant_status_changed.';


-- ============================================================================
-- §25  group_feature_grant — feature grants to groups
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.group_feature_grant (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (links)
    group_id        uuid              NOT NULL,
    feature_id      uuid              NOT NULL,
    access_type     text              NOT NULL DEFAULT 'view',

    -- Table-specific (lifecycle)
    expires_at      timestamptz,
    granted_by      uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,

    CONSTRAINT group_feature_grant_pkey PRIMARY KEY (id),
    CONSTRAINT group_feature_grant_uq   UNIQUE (tenant_id, group_id, feature_id, access_type),
    CONSTRAINT gfg_access_chk           CHECK (access_type IN ('view','edit'))
);

COMMENT ON TABLE master.group_feature_grant IS
  'Enterprise feature access grants to groups. access_type: view or edit.';


-- ============================================================================
-- §26  principal_feature_grant — feature grants to individuals
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.principal_feature_grant (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (links)
    principal_id    uuid              NOT NULL,
    feature_id      uuid              NOT NULL,
    access_type     text              NOT NULL DEFAULT 'view',

    -- Table-specific (lifecycle)
    expires_at      timestamptz,
    granted_by      uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,

    CONSTRAINT principal_feature_grant_pkey PRIMARY KEY (id),
    CONSTRAINT principal_feature_grant_uq   UNIQUE (tenant_id, principal_id, feature_id, access_type),
    CONSTRAINT pfg_access_chk               CHECK (access_type IN ('view','edit'))
);

COMMENT ON TABLE master.principal_feature_grant IS
  'Enterprise feature access grants to individual principals. access_type: view or edit.';


-- ============================================================================
-- §27  notification — per-recipient inbox entry
-- ============================================================================
-- One row per (message, recipient, channel).
-- Mutable: is_read, is_dismissed flags updated by principal actions.
-- Partitioned monthly — highest-volume table in the schema.

CREATE TABLE IF NOT EXISTS master.notification (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,

    -- Origin
    message_id      uuid,
    sender_id       uuid,

    -- Recipient
    recipient_id    uuid            NOT NULL,

    -- Content (denormalised at dispatch time — survives template retirement)
    channel         text            NOT NULL DEFAULT 'in_app',
    category        text,
    priority        text            NOT NULL DEFAULT 'normal',
    title           text            NOT NULL,
    body            text,
    icon            text,
    action_url      text,

    -- Entity context
    entity_type     text,
    entity_id       uuid,

    -- Read / dismiss state (mutable)
    is_read         boolean         NOT NULL DEFAULT false,
    read_at         timestamptz,
    is_dismissed    boolean         NOT NULL DEFAULT false,
    dismissed_at    timestamptz,

    -- Lifecycle
    expires_at      timestamptz,

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT notif_pkey               PRIMARY KEY (id, created_at),
    CONSTRAINT notif_title_chk          CHECK (btrim(title) <> ''),
    CONSTRAINT notif_read_chk           CHECK (
        (is_read = false AND read_at IS NULL)
        OR (is_read = true AND read_at IS NOT NULL)
    ),
    CONSTRAINT notif_dismiss_chk        CHECK (
        (is_dismissed = false AND dismissed_at IS NULL)
        OR (is_dismissed = true AND dismissed_at IS NOT NULL)
    ),
    CONSTRAINT notif_expiry_chk         CHECK (expires_at IS NULL OR expires_at > created_at)
    -- channel:   09_triggers — control.trg_validate_lookup_columns('notification.channel')
    -- priority:  09_triggers — control.trg_validate_lookup_columns('notification.priority')
    -- category:  09_triggers — control.trg_validate_lookup_columns('notification.category')
) PARTITION BY RANGE (created_at);

-- Patch 002 Fix 5: corrected dedup guarantee — index includes created_at (partition key
-- required by PG partitioned tables). Cross-partition dedup is application responsibility.
COMMENT ON TABLE  master.notification IS
    'Per-recipient inbox entry. Intended grain: one row per (message_id, recipient_id, channel). '
    'DB enforces within each partition via notif_msg_recipient_channel_uidx '
    '(includes created_at as required by PG partitioned-table rules). '
    'Cross-partition dedup is an application responsibility (INSERT ... ON CONFLICT DO NOTHING). '
    'is_read / is_dismissed are mutable — updated by the recipient only (RLS-enforced). '
    'channel, priority, category all lookup-validated (extensible). '
    'Partitioned monthly.';
COMMENT ON COLUMN master.notification.title IS
    'Denormalised at dispatch time — survives template retirement.';

CREATE TABLE IF NOT EXISTS master.notification_default
    PARTITION OF master.notification DEFAULT;



-- ============================================================================
-- §1  master.tenant_profile — per-tenant locale and fiscal defaults
-- ============================================================================
-- 1:1 extension of master.tenant. Holds operational defaults used when
-- rendering documents, computing fiscal periods, and formatting numbers.
-- NULL on any column = "use platform default" (never inherit from another tenant).

CREATE TABLE IF NOT EXISTS master.tenant_profile (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Locale defaults (all nullable — NULL = use platform default)
    country_code            char(2),
    currency_code           char(3),
    locale_code             text,
    timezone_code           text,

    -- Fiscal year
    fiscal_year_start_month smallint,

    -- Extended defaults (document generation, number formatting)
    date_format             text,
    number_format           text,
    week_start              smallint,

    -- Platform behavior + presentation defaults
    language_code             text,
    reporting_currency_code   char(3),
    weekend_days              smallint[],
    default_brand_profile_id  uuid,
    default_letterhead_id     uuid,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tp_pkey              PRIMARY KEY (id),
    CONSTRAINT tp_tenant_uq         UNIQUE (tenant_id),
    CONSTRAINT tp_fiscal_month_chk  CHECK (
        fiscal_year_start_month IS NULL
        OR fiscal_year_start_month BETWEEN 1 AND 12
    ),
    CONSTRAINT tp_week_start_chk    CHECK (
        week_start IS NULL
        OR week_start BETWEEN 0 AND 6  -- 0=Sunday … 6=Saturday
    ),
    CONSTRAINT tp_country_fmt_chk   CHECK (
        country_code IS NULL
        OR country_code::text ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT tp_currency_fmt_chk  CHECK (
        currency_code IS NULL
        OR currency_code::text ~ '^[A-Z]{3}$'
    ),
    CONSTRAINT tp_reporting_currency_fmt_chk CHECK (
        reporting_currency_code IS NULL
        OR reporting_currency_code::text ~ '^[A-Z]{3}$'
    ),
    CONSTRAINT tp_weekend_days_range_chk CHECK (
        weekend_days IS NULL
        OR (
            cardinality(weekend_days) BETWEEN 1 AND 3
            AND weekend_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
        )
    )
);

COMMENT ON TABLE  master.tenant_profile IS
    '1:1 extension of master.tenant. Per-tenant locale and fiscal defaults. '
    'All columns nullable — NULL means "use platform default". '
    'country_code / currency_code / locale_code / timezone_code '
    'FK-validated against shared.* reference tables.';
COMMENT ON COLUMN master.tenant_profile.country_code IS
    'ISO 3166-1 alpha-2. FK: shared.country(code). '
    'Drives default address format, tax jurisdiction inference.';
COMMENT ON COLUMN master.tenant_profile.currency_code IS
    'ISO 4217 alpha-3. FK: shared.currency(code). '
    'Default currency for document creation and reporting.';
COMMENT ON COLUMN master.tenant_profile.locale_code IS
    'IETF BCP-47 locale code. FK: shared.locale(code). '
    'Drives number, date, and currency formatting in UI and exports.';
COMMENT ON COLUMN master.tenant_profile.timezone_code IS
    'IANA timezone. FK: shared.timezone(code). '
    'Used for fiscal period boundary calculations and notification scheduling.';
COMMENT ON COLUMN master.tenant_profile.fiscal_year_start_month IS
    '1=January … 12=December. NULL = January (calendar year). '
    'Used by ledger.fiscal_period generation.';
COMMENT ON COLUMN master.tenant_profile.week_start IS
    '0=Sunday, 1=Monday … 6=Saturday. NULL = Monday (ISO week). '
    'Affects weekly digest scheduling and calendar display.';
COMMENT ON COLUMN master.tenant_profile.date_format IS
    'strftime-style format string e.g. ''%d/%m/%Y''. '
    'NULL = ISO 8601 (YYYY-MM-DD).';
COMMENT ON COLUMN master.tenant_profile.number_format IS
    'Decimal/thousands separator style e.g. ''1,234.56'' or ''1.234,56''. '
    'NULL = system default derived from locale_code.';
COMMENT ON COLUMN master.tenant_profile.language_code IS
    'FK to shared.language(code). Primary tenant language for UI and '
    'document generation. NULL = platform default (en).';
COMMENT ON COLUMN master.tenant_profile.reporting_currency_code IS
    'Group/management reporting currency. Distinct from currency_code which '
    'is the default transaction currency. NULL = same as currency_code.';
COMMENT ON COLUMN master.tenant_profile.weekend_days IS
    'Days of the week that are non-working. 0=Sun ... 6=Sat. '
    'GCC example: {4,5} (Fri+Sat). ISO example: {0,6} (Sat+Sun). '
    'Trigger-normalized to sorted unique. NULL = {0,6}.';
COMMENT ON COLUMN master.tenant_profile.default_brand_profile_id IS
    'FK to master.brand_profile. Tenant-wide default brand for document rendering. '
    'NULL = no branding applied.';
COMMENT ON COLUMN master.tenant_profile.default_letterhead_id IS
    'FK to master.letterhead. Tenant-wide default page header/footer. '
    'NULL = plain letterhead.';


-- ============================================================================
-- §2  master.delegation_grant — active authority delegation
-- ============================================================================
-- Records an active grant where delegator_id has authorised delegate_id to
-- act on their behalf within a defined scope.
-- Lifecycle: INSERT (active) → is_revoked=true (revoked) or expires_at passed (expired).
-- scope_type validated via control.lookup_domain 'master.delegation_scope' (extensible).
-- permissions[] aligns with shared.permission.code values.

CREATE TABLE IF NOT EXISTS master.delegation_grant (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Principals
    delegator_id    uuid        NOT NULL,
    delegate_id     uuid        NOT NULL,

    -- Scope
    scope_type      text        NOT NULL,
    scope_ref       text,

    -- Permissions delegated (references shared.permission.code values)
    permissions     text[]      NOT NULL DEFAULT '{}',

    -- Context
    reason          text,
    request_id      uuid,

    -- Lifecycle
    expires_at      timestamptz NOT NULL,
    is_revoked      boolean     NOT NULL DEFAULT false,
    revoked_at      timestamptz,
    revoked_by      uuid,
    revoke_reason   text,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT dg_pkey              PRIMARY KEY (id),
    CONSTRAINT dg_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT dg_self_delegate_chk CHECK (delegator_id <> delegate_id),
    CONSTRAINT dg_expiry_chk        CHECK (expires_at > created_at),
    CONSTRAINT dg_revoke_chk        CHECK (
        (is_revoked = false AND revoked_at IS NULL  AND revoked_by IS NULL)
        OR
        (is_revoked = true  AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
    ),
    CONSTRAINT dg_scope_ref_chk     CHECK (
        scope_ref IS NULL OR btrim(scope_ref) <> ''
    )
    -- scope_type: 09_triggers — control.trg_validate_lookup_columns('master.delegation_scope')
);

COMMENT ON TABLE  master.delegation_grant IS
    'Active authority delegation. delegator_id authorises delegate_id to act '
    'on their behalf within scope_type + scope_ref. '
    'expires_at is mandatory — open-ended delegation is not permitted. '
    'Revocation: set is_revoked=true + revoked_at + revoked_by. '
    'scope_type validated via master.delegation_scope lookup (extensible). '
    'permissions[] references shared.permission.code values. '
    'request_id links to event.delegation_request that created this grant.';
COMMENT ON COLUMN master.delegation_grant.delegator_id IS
    'Principal who is delegating their authority. '
    'The delegate acts ON BEHALF OF this principal.';
COMMENT ON COLUMN master.delegation_grant.delegate_id IS
    'Principal who receives the delegated authority. '
    'Cannot equal delegator_id (self-delegation not permitted).';
COMMENT ON COLUMN master.delegation_grant.scope_type IS
    'Delegation scope class. Lookup: master.delegation_scope (extensible). '
    'e.g. task, entity, workflow, module, company_code.';
COMMENT ON COLUMN master.delegation_grant.scope_ref IS
    'Optional scope qualifier. Interpretation depends on scope_type: '
    'task — task.id, entity — entity_type:entity_id, module — module.code.';
COMMENT ON COLUMN master.delegation_grant.permissions IS
    'Array of shared.permission.code values the delegate may exercise. '
    'Empty array = all permissions the delegator has within the scope.';
COMMENT ON COLUMN master.delegation_grant.request_id IS
    'FK to event.delegation_request.id. NULL if grant was created directly '
    '(admin override) rather than through the approval workflow.';
COMMENT ON COLUMN master.delegation_grant.expires_at IS
    'Mandatory expiry. Grants without expiry are a security anti-pattern. '
    'The delegation worker marks grants as expired when expires_at < now().';


-- 04_tables/013_collab.sql
-- Collaboration cluster — attachment, comment, conversation
-- Depends on: 01_schemas, 04_tables/003_master.sql, 04_tables/002_control.sql
--
-- Tables span three schemas:
--   master.*     — persistent entities owned by principals
--   event.*      — actionable occurrences demanding a response
--   governance.* — aggregated moderation state (outcome of moderation process)
--
-- Column order: Identity — Table-specific — Audit
-- Mutable tables: updated_at / updated_by (shared.trg_set_updated_at)
-- Soft-delete tables: deleted_at / deleted_by (master.comment, master.comment_draft)
--
-- Lookup-validated columns (trigger-based):
--   context_type    — master.comment_type      (master.comment, comment_mention,
--                                                comment_reaction, event.comment_flag,
--                                                governance.comment_moderation)
--   reaction_type   — master.reaction_type      (master.comment_reaction)
--   flag_reason     — master.flag_reason          (event.comment_flag)
--   type            — master.conversation_type   (master.conversation)
--
-- Sealed inline CHECK:
--   comment.visibility      (public / internal / private)
--   comment_draft.visibility (public / internal / private)
--   comment_flag.status     (pending / reviewed / dismissed / actioned)
--   attachment_acl.permission (read / download / delete / share)
--   multipart_upload.status (initiated / uploading / completed / aborted / failed)
--
-- ——————————————————————————————————————————————————————————————————————————
-- |  TABLE INDEX                                                              |
-- |                                                                           |
-- |  ATTACHMENT CLUSTER (master.*)                                            |
-- |   §1  master.attachment          — file / blob metadata & storage coords  |
-- |   §2  master.multipart_upload    — S3 multipart upload tracker            |
-- |   §3  master.attachment_acl      — per-attachment access control grants   |
-- |                                                                           |
-- |  COMMENT CLUSTER (master.*)                                               |
-- |   §4  master.comment             — threaded comments on any entity        |
-- |                                    (renamed from entity_comment,          |
-- |                                     absorbs attachment_comment)           |
-- |   §5  master.comment_draft       — auto-saved pre-submit drafts           |
-- |   §6  master.comment_mention     — @-mention extraction per comment       |
-- |   §7  master.comment_reaction    — emoji reactions per comment            |
-- |                                                                           |
-- |  CONVERSATION CLUSTER (master.*)                                          |
-- |   §8  master.conversation        — messaging conversation envelope        |
-- |   §9  master.conversation_participant — membership roster + read cursor   |
-- |                                                                           |
-- |  MODERATION (event.* + governance.*)                                      |
-- |  §10  event.comment_flag         — abuse report (demands response)        |
-- |  §11  governance.comment_moderation — aggregated moderation state         |
-- ——————————————————————————————————————————————————————————————————————————


-- ============================================================================
-- §1  master.attachment — file / blob metadata and storage coordinates
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.attachment (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- File identity
    file_name                   text        NOT NULL,
    original_filename           text,
    content_type                text,
    size_bytes                  bigint,
    sha256                      text,
    kind                        text        NOT NULL DEFAULT 'attachment',

    -- Storage coordinates
    storage_bucket              text        NOT NULL,
    storage_key                 text        NOT NULL,
    shard                       smallint,

    -- Preview / thumbnail (async populated)
    thumbnail_key               text,
    preview_key                 text,
    preview_generated_at        timestamptz,
    is_preview_generation_failed boolean    NOT NULL DEFAULT false,

    -- Security scanning
    is_virus_scanned            boolean     NOT NULL DEFAULT false,

    -- Versioning
    version_no                  smallint    NOT NULL DEFAULT 1,
    parent_attachment_id        uuid,
    reference_count             integer     NOT NULL DEFAULT 1,
    is_current                  boolean     NOT NULL DEFAULT true,

    -- Lifecycle
    is_active                   boolean     NOT NULL DEFAULT true,
    is_auto_delete_on_expiry    boolean     NOT NULL DEFAULT false,
    expires_at                  timestamptz,
    retention_until             timestamptz,

    -- Actor
    uploaded_by                 uuid,

    -- Metadata
    metadata                    jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle status
    status                      text        NOT NULL DEFAULT 'active',
    status_changed_at           timestamptz,
    status_changed_by           uuid,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT attachment_pkey              PRIMARY KEY (id),
    CONSTRAINT attachment_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT attachment_size_chk          CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT attachment_version_chk       CHECK (version_no >= 1),
    CONSTRAINT attachment_ref_count_chk     CHECK (reference_count >= 0),
    CONSTRAINT attachment_shard_chk         CHECK (shard IS NULL OR shard >= 0),
    CONSTRAINT attachment_file_name_chk     CHECK (btrim(file_name) <> ''),
    CONSTRAINT attachment_bucket_chk        CHECK (btrim(storage_bucket) <> ''),
    CONSTRAINT attachment_key_chk           CHECK (btrim(storage_key) <> ''),
    CONSTRAINT attachment_expiry_chk        CHECK (expires_at IS NULL
                                                OR retention_until IS NULL
                                                OR expires_at <= retention_until),
    CONSTRAINT attachment_status_chk        CHECK (status IN (
        'active', 'archived', 'quarantined', 'deleted'
    ))
    -- kind: 09_triggers — control.trg_validate_lookup_columns('master.attachment_kind')
);

COMMENT ON TABLE  master.attachment IS
    'File / blob metadata and S3 storage coordinates. Content-addressable via sha256. '
    'Ownership via entity_document_link (not inline owner columns). '
    'ACL via master.attachment_acl. kind validated via master.attachment_kind lookup.';
COMMENT ON COLUMN master.attachment.sha256 IS
    'SHA-256 hex digest for content-addressable dedup. '
    'reference_count incremented when a duplicate is detected.';
COMMENT ON COLUMN master.attachment.storage_key IS
    'S3 object key. Stable across dedup — multiple attachment rows may share '
    'the same storage_key when reference_count > 1.';
COMMENT ON COLUMN master.attachment.kind IS
    'Functional classification. Lookup: master.attachment_kind. '
    'e.g. attachment, letterhead, template_asset, avatar, evidence.';


-- ============================================================================
-- §2  master.multipart_upload — S3 multipart upload tracker
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.multipart_upload (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- S3 multipart context
    upload_id           text        NOT NULL,
    storage_bucket      text        NOT NULL,
    storage_key         text        NOT NULL,

    -- File context
    file_name           text        NOT NULL,
    content_type        text,
    size_bytes          bigint,

    -- Part tracking (array of {part_number, etag} objects)
    part_etags          jsonb       NOT NULL DEFAULT '[]',

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'initiated',
    expires_at          timestamptz NOT NULL,
    completed_at        timestamptz,
    aborted_at          timestamptz,

    -- Resulting attachment (set on completion)
    attachment_id       uuid,

    -- Actor
    initiated_by        uuid        NOT NULL,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT mpu_pkey             PRIMARY KEY (id),
    CONSTRAINT mpu_upload_id_uq     UNIQUE (tenant_id, upload_id),
    CONSTRAINT mpu_status_chk       CHECK (status IN (
        'initiated', 'uploading', 'completed', 'aborted', 'failed'
    )),
    CONSTRAINT mpu_bucket_chk       CHECK (btrim(storage_bucket) <> ''),
    CONSTRAINT mpu_key_chk          CHECK (btrim(storage_key) <> ''),
    CONSTRAINT mpu_file_chk         CHECK (btrim(file_name) <> ''),
    CONSTRAINT mpu_upload_id_chk    CHECK (btrim(upload_id) <> ''),
    CONSTRAINT mpu_part_etags_chk   CHECK (jsonb_typeof(part_etags) = 'array'),
    CONSTRAINT mpu_expiry_chk       CHECK (expires_at > created_at),
    CONSTRAINT mpu_size_chk         CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

COMMENT ON TABLE  master.multipart_upload IS
    'S3 multipart upload tracker. One row per in-flight upload. '
    'part_etags is jsonb array of {part_number: N, etag: "..."} objects. '
    'On completion: attachment row is created, attachment_id is set, status=completed. '
    'Cleanup job removes expired aborted/failed rows.';
COMMENT ON COLUMN master.multipart_upload.part_etags IS
    'Array of {part_number: integer, etag: text} objects. '
    'Validated by trg_validate_part_etags trigger (array with required keys).';


-- ============================================================================
-- §3  master.attachment_acl — per-attachment access control grants
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.attachment_acl (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Subject (exactly one)
    attachment_id   uuid        NOT NULL,
    principal_id    uuid,
    role_id         uuid,

    -- Grant
    permission      text        NOT NULL,
    is_granted      boolean     NOT NULL DEFAULT true,
    granted_by      uuid        NOT NULL,
    granted_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT acl_pkey             PRIMARY KEY (id),
    CONSTRAINT acl_permission_chk   CHECK (permission IN (
        'read', 'download', 'delete', 'share'
    )),
    CONSTRAINT acl_subject_chk      CHECK (
        (principal_id IS NOT NULL AND role_id IS NULL)
        OR (principal_id IS NULL AND role_id IS NOT NULL)
    ),
    CONSTRAINT acl_expiry_chk       CHECK (expires_at IS NULL OR expires_at > granted_at)
);

COMMENT ON TABLE  master.attachment_acl IS
    'Per-attachment access control grants. Exactly one of principal_id / role_id. '
    'Supplements master.access_grant (entity-level) for file-level ACL needs. '
    'permission: read (metadata), download (content), delete, share.';


-- ============================================================================
-- §4  master.comment — threaded comments on any entity
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.comment (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Comment surface discriminator
    context_type        text        NOT NULL DEFAULT 'entity',
    entity_type         text        NOT NULL,
    entity_id           uuid        NOT NULL,

    -- Content
    commenter_id        uuid        NOT NULL,
    comment_text        text        NOT NULL,
    mentions            jsonb,

    -- Threading
    parent_comment_id   uuid,
    thread_depth        smallint    NOT NULL DEFAULT 0,

    -- Visibility
    visibility          text        NOT NULL DEFAULT 'public',

    -- Soft-delete
    deleted_at          timestamptz,
    deleted_by          uuid,

    -- Archival / retention
    archived_at         timestamptz,
    archived_by         uuid,
    retention_until     timestamptz,
    retention_policy_id uuid,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT comment_pkey             PRIMARY KEY (id),
    CONSTRAINT comment_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT comment_depth_chk        CHECK (thread_depth BETWEEN 0 AND 5),
    CONSTRAINT comment_text_len_chk     CHECK (char_length(comment_text) <= 5000),
    CONSTRAINT comment_text_chk         CHECK (btrim(comment_text) <> ''),
    CONSTRAINT comment_entity_chk       CHECK (btrim(entity_type) <> ''),
    CONSTRAINT comment_visibility_chk   CHECK (visibility IN ('public', 'internal', 'private')),
    CONSTRAINT comment_delete_chk       CHECK (
        (deleted_at IS NULL AND deleted_by IS NULL)
        OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
    ),
    CONSTRAINT comment_mentions_chk     CHECK (
        mentions IS NULL OR jsonb_typeof(mentions) = 'array'
    )
    -- context_type: 09_triggers — control.trg_validate_lookup_columns('master.comment_type')
);

COMMENT ON TABLE  master.comment IS
    'Threaded comments on any entity. Renamed from entity_comment. '
    'Absorbs attachment_comment via context_type=''attachment''. '
    'context_type validated via master.comment_type lookup (extensible). '
    'Soft-delete: filter deleted_at IS NULL in all production queries. '
    'Thread depth capped at 5 (CHECK + hierarchy trigger).';
COMMENT ON COLUMN master.comment.context_type IS
    'Comment surface discriminator. Lookup: master.comment_type. '
    'entity=any business entity, attachment=file, approval=approval instance, '
    'chat_message=conversation message.';
COMMENT ON COLUMN master.comment.mentions IS
    'JSON array of @-mention objects: [{user_id: uuid, display_name: text}]. '
    'Validated by trg_validate_comment_mentions trigger.';
COMMENT ON COLUMN master.comment.thread_depth IS
    'Nesting depth. 0=root, 1=reply, max 5. '
    'Enforced by CHECK constraint AND trg_comment_hierarchy_guard trigger.';


-- ============================================================================
-- §5  master.comment_draft — auto-saved pre-submit comment drafts
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.comment_draft (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Author
    principal_id        uuid        NOT NULL,

    -- Target entity
    context_type        text        NOT NULL DEFAULT 'entity',
    entity_type         text        NOT NULL,
    entity_id           uuid        NOT NULL,

    -- Threading context (if replying)
    parent_comment_id   uuid,

    -- Draft content
    draft_text          text        NOT NULL,
    visibility          text        NOT NULL DEFAULT 'public',

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT cd_pkey              PRIMARY KEY (id),
    CONSTRAINT cd_one_per_target_uq UNIQUE NULLS NOT DISTINCT (tenant_id, principal_id, entity_type,
                                            entity_id, parent_comment_id),
    CONSTRAINT cd_text_chk          CHECK (btrim(draft_text) <> ''),
    CONSTRAINT cd_text_len_chk      CHECK (char_length(draft_text) <= 5000),
    CONSTRAINT cd_entity_chk        CHECK (btrim(entity_type) <> ''),
    CONSTRAINT cd_visibility_chk    CHECK (visibility IN ('public', 'internal', 'private'))
    -- context_type: 09_triggers — control.trg_validate_lookup_columns('master.comment_type')
);

COMMENT ON TABLE  master.comment_draft IS
    'Auto-saved pre-submit comment drafts. One row per '
    '(principal, entity, parent_comment_id). Deleted on submit or discard. '
    'Not a comment — never referenced by other tables. '
    'context_type validated via master.comment_type lookup.';


-- ============================================================================
-- §6  master.comment_mention — @-mention records per comment
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.comment_mention (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Comment reference (polymorphic via context_type)
    context_type        text        NOT NULL,
    comment_id          uuid        NOT NULL,

    -- Mention target
    mentioned_id        uuid        NOT NULL,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT cm_pkey              PRIMARY KEY (id),
    CONSTRAINT cm_unique            UNIQUE (tenant_id, context_type, comment_id, mentioned_id)
    -- context_type: 09_triggers — control.trg_validate_lookup_columns('master.comment_type')
);

COMMENT ON TABLE  master.comment_mention IS
    '@-mention extraction table. One row per (comment, mentioned principal). '
    'Populated by trigger on master.comment INSERT/UPDATE. '
    'Enables O(1) "who was mentioned in this comment" queries. '
    'context_type mirrors master.comment.context_type.';


-- ============================================================================
-- §7  master.comment_reaction — emoji reactions on comments
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.comment_reaction (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Comment reference (polymorphic)
    context_type    text        NOT NULL,
    comment_id      uuid        NOT NULL,

    -- Reaction
    principal_id    uuid        NOT NULL,
    reaction_type   text        NOT NULL,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT cr_pkey      PRIMARY KEY (id),
    CONSTRAINT cr_unique    UNIQUE (tenant_id, context_type, comment_id,
                                    principal_id, reaction_type)
    -- context_type:  09_triggers — control.trg_validate_lookup_columns('master.comment_type')
    -- reaction_type: 09_triggers — control.trg_validate_lookup_columns('master.reaction_type')
);

COMMENT ON TABLE  master.comment_reaction IS
    'Emoji reactions on comments. One row per (principal, comment, reaction_type). '
    'Unique constraint prevents duplicate reactions. '
    'reaction_type in master.reaction_type lookup (extensible — tenants add custom emoji). '
    'context_type mirrors master.comment.context_type.';


-- ============================================================================
-- §8  master.conversation — messaging conversation envelope
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.conversation (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Classification
    type            text        NOT NULL DEFAULT 'dm',
    title           text,

    -- Entity context (optional — conversations can be anchored to an entity)
    entity_type     text,
    entity_id       uuid,

    -- Metadata
    metadata        jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status          text        NOT NULL DEFAULT 'active',
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Soft-delete
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT conv_pkey        PRIMARY KEY (id),
    CONSTRAINT conv_status_chk  CHECK (status IN ('active', 'archived', 'deleted')),
    CONSTRAINT conv_delete_chk  CHECK (
        (deleted_at IS NULL AND deleted_by IS NULL)
        OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
    )
    -- type: 09_triggers — control.trg_validate_lookup_columns('master.conversation_type')
);

COMMENT ON TABLE  master.conversation IS
    'Messaging conversation envelope. type validated via master.conversation_type lookup. '
    'entity_type + entity_id optionally anchor a conversation to a business entity. '
    'Participants tracked in master.conversation_participant.';


-- ============================================================================
-- §9  master.conversation_participant — membership roster and read cursor
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.conversation_participant (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Links
    conversation_id         uuid        NOT NULL,
    principal_id            uuid        NOT NULL,

    -- Role in conversation
    role                    text        NOT NULL DEFAULT 'member',

    -- Read cursor
    last_read_message_id    uuid,
    last_read_at            timestamptz,

    -- Membership lifecycle
    joined_at               timestamptz NOT NULL DEFAULT now(),
    left_at                 timestamptz,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cp_pkey          PRIMARY KEY (id),
    CONSTRAINT cp_unique        UNIQUE (tenant_id, conversation_id, principal_id),
    CONSTRAINT cp_role_chk      CHECK (role IN ('owner', 'admin', 'member', 'observer')),
    CONSTRAINT cp_read_chk      CHECK (
        (last_read_message_id IS NULL AND last_read_at IS NULL)
        OR (last_read_message_id IS NOT NULL AND last_read_at IS NOT NULL)
    ),
    CONSTRAINT cp_leave_chk     CHECK (left_at IS NULL OR left_at >= joined_at)
);

COMMENT ON TABLE  master.conversation_participant IS
    'Conversation membership roster with read cursor. '
    'One row per (conversation, principal). '
    'last_read_message_id + last_read_at enable unread message counts. '
    'left_at IS NULL = currently active member.';


-- =============================================================================
-- §10  master.lifecycle_instance — entity current state tracking
-- =============================================================================
-- One row per (entity, lifecycle). Tracks which state the entity is currently in.
-- L06: UNIQUE(tenant_id, entity_name, entity_id, lifecycle_id) — no duplicate rows.
-- L11: entity_id = TEXT (polymorphic key — consistent with timer_schedule).
-- Renamed from: control.entity_lifecycle_instance (backup).
-- Lightweight — used by simple entities. Complex entities use document.workflow_instance.

CREATE TABLE IF NOT EXISTS master.lifecycle_instance (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Subject (L11: entity_id = TEXT throughout engine)
    entity_name     text        NOT NULL,
    entity_id       text        NOT NULL,

    -- Lifecycle tracking
    lifecycle_id    uuid        NOT NULL,
    state_id        uuid        NOT NULL,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid        NOT NULL,

    CONSTRAINT li_pkey          PRIMARY KEY (id),
    -- L06: one lifecycle instance per (entity, lifecycle)
    CONSTRAINT li_entity_uq     UNIQUE (tenant_id, entity_name, entity_id, lifecycle_id),
    CONSTRAINT li_entity_chk    CHECK (btrim(entity_name) <> '' AND btrim(entity_id) <> '')
);

COMMENT ON TABLE  master.lifecycle_instance IS
    'Current state of a specific entity within a lifecycle. '
    'One row per (entity_name, entity_id, lifecycle_id). '
    'Updated atomically with log.entity_lifecycle_log on every state transition. '
    'Lightweight alternative to document.workflow_instance for simple entities. '
    'L06: UNIQUE constraint added. L11: entity_id=TEXT. '
    'Renamed from control.entity_lifecycle_instance + moved to master.*.';
COMMENT ON COLUMN master.lifecycle_instance.entity_id IS
    'TEXT — polymorphic entity key. May be a UUID string, composite key, '
    'or external reference. Consistent with event.lifecycle_timer_schedule.entity_id.';


-- =============================================================================
-- §12  DOCUMENT · PRINT · BRANDING  —  master tables
-- =============================================================================
-- 7 tables: document, brand_profile, letterhead, template,
--           attachment_comment, template_binding, entity_document_link
-- Depends on: master.tenant, master.principal, master.operating_unit,
--             master.attachment (with UNIQUE tenant_id, id)

-- ── §12.1  master.document ─────────────────────────────────────────────────
-- Lightweight document envelope — code, name, tags.
-- Registry master entity. No financial data.

CREATE TABLE IF NOT EXISTS master.document (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Natural key
    code            text        NOT NULL,
    name            text        NOT NULL,

    -- Content
    tags            text[],
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'active',
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT document_pkey            PRIMARY KEY (id),
    CONSTRAINT document_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT document_tenant_code_uq  UNIQUE (tenant_id, code),
    CONSTRAINT document_code_chk        CHECK (btrim(code) <> ''),
    CONSTRAINT document_name_chk        CHECK (btrim(name) <> ''),
    CONSTRAINT document_status_chk      CHECK (status IN (
        'active', 'archived', 'deleted'
    ))
);

COMMENT ON TABLE master.document IS
    'Document envelope registry. Lightweight master entity — code + tags. '
    'No financial data. Referenced by document.* tables and master.entity_document_link.';


-- ── §12.2  master.brand_profile ────────────────────────────────────────────
-- Tenant-level colour palette, typography, spacing, and locale defaults.
-- Exactly one active default per tenant enforced by partial unique index
-- and fn_enforce_single_default() trigger.

CREATE TABLE IF NOT EXISTS master.brand_profile (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Natural key
    code            text        NOT NULL,
    name            text        NOT NULL,

    -- Branding content
    palette             jsonb,
    typography          jsonb,
    spacing_scale       jsonb,
    direction           text        NOT NULL DEFAULT 'LTR',
    default_locale      text        NOT NULL DEFAULT 'en',
    supported_locales   text[],

    -- Flags
    is_default      boolean     NOT NULL DEFAULT false,
    is_active       boolean     NOT NULL DEFAULT true,

    -- Metadata
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'active',
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT brand_profile_pkey               PRIMARY KEY (id),
    CONSTRAINT brand_profile_tenant_id_uq       UNIQUE (tenant_id, id),
    CONSTRAINT brand_profile_tenant_code_uq     UNIQUE (tenant_id, code),
    CONSTRAINT brand_profile_code_chk           CHECK (btrim(code) <> ''),
    CONSTRAINT brand_profile_direction_chk      CHECK (direction IN ('LTR', 'RTL')),
    CONSTRAINT brand_profile_locale_chk         CHECK (btrim(default_locale) <> ''),
    CONSTRAINT brand_profile_status_chk         CHECK (status IN (
        'active', 'archived'
    ))
);

COMMENT ON TABLE  master.brand_profile IS
    'Tenant colour palette, typography, and locale settings. '
    'fn_enforce_single_default() ensures at most one active default per tenant.';
COMMENT ON COLUMN master.brand_profile.palette IS
    'Design-token colour map: primary, secondary, accent, surface, on-surface, etc.';
COMMENT ON COLUMN master.brand_profile.typography IS
    'Font families, sizes, weights, and line-heights.';
COMMENT ON COLUMN master.brand_profile.is_default IS
    'Partial unique index (is_default=true AND is_active=true) enforces single default.';


-- ── §12.3  master.letterhead ───────────────────────────────────────────────
-- Reusable page header / footer / watermark definition.
-- Optionally scoped to an operating_unit.

CREATE TABLE IF NOT EXISTS master.letterhead (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,

    -- Natural key
    code            text            NOT NULL,
    name            text            NOT NULL,

    -- Scope (optional company code restriction)
    company_code_id    uuid,

    -- Content
    logo_storage_key    text,
    header_html         text,
    footer_html         text,
    watermark_text      text,
    watermark_opacity   numeric(3,2)    NOT NULL DEFAULT 0.15,
    default_fonts       jsonb,
    page_margins        jsonb,

    -- Flags
    is_default          boolean         NOT NULL DEFAULT false,
    is_active           boolean         NOT NULL DEFAULT true,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text            NOT NULL DEFAULT 'active',
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT letterhead_pkey              PRIMARY KEY (id),
    CONSTRAINT letterhead_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT letterhead_tenant_code_uq    UNIQUE (tenant_id, code),
    CONSTRAINT letterhead_code_chk          CHECK (btrim(code) <> ''),
    CONSTRAINT letterhead_opacity_chk       CHECK (watermark_opacity BETWEEN 0.00 AND 1.00),
    CONSTRAINT letterhead_status_chk        CHECK (status IN (
        'active', 'archived'
    ))
);

-- Idempotent backfill: add company_code_id if letterhead already existed without it
ALTER TABLE master.letterhead ADD COLUMN IF NOT EXISTS company_code_id uuid;

COMMENT ON TABLE  master.letterhead IS
    'Reusable page header/footer/watermark definitions for PDF rendering. '
    'NULL company_code_id = applies to all company codes in tenant. '
    'page_margins validated by document.trg_validate_page_margins() trigger.';
COMMENT ON COLUMN master.letterhead.company_code_id IS
    'Scope restriction. NULL = tenant-wide default. '
    'References master.company_code.';


-- ── §12.4  master.template ────────────────────────────────────────────────
-- Template registry with full lifecycle.
-- current_version_id is a DEFERRABLE circular FK to snapshot.template_version
-- — added in 06_constraints (cross-schema FKs) not here.

CREATE TABLE IF NOT EXISTS master.template (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Natural key
    code            text        NOT NULL,
    name            text        NOT NULL,

    -- Template classification
    kind            text        NOT NULL,
    engine          text        NOT NULL DEFAULT 'HANDLEBARS',

    -- Current published version (circular FK — see 06_constraints)
    current_version_id  uuid,

    -- Capabilities
    is_rtl_supported        boolean NOT NULL DEFAULT false,
    is_letterhead_required  boolean NOT NULL DEFAULT false,
    allowed_operations      text[],
    supported_locales       text[],

    -- Metadata
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text    NOT NULL DEFAULT 'DRAFT',
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT template_pkey            PRIMARY KEY (id),
    CONSTRAINT template_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT template_tenant_code_uq  UNIQUE (tenant_id, code),
    CONSTRAINT template_code_chk        CHECK (btrim(code) <> ''),
    CONSTRAINT template_engine_chk      CHECK (engine IN (
        'HANDLEBARS', 'MJML', 'REACT_PDF'
    )),
    CONSTRAINT template_status_chk      CHECK (status IN (
        'DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'
    ))
    -- current_version_id FK added in 06_constraints: DEFERRABLE INITIALLY DEFERRED
    -- to break circular dependency with snapshot.template_version
);

COMMENT ON TABLE  master.template IS
    'Template registry. Tracks engine, lifecycle status, and current live version. '
    'current_version_id → snapshot.template_version via DEFERRABLE FK (06_constraints).';
COMMENT ON COLUMN master.template.current_version_id IS
    'Points to the currently active template version. '
    'FK is DEFERRABLE INITIALLY DEFERRED — template + first version can be '
    'inserted atomically in a single transaction.';
COMMENT ON COLUMN master.template.kind IS
    'Template functional category. e.g. INVOICE, STATEMENT, REPORT, NOTIFICATION.';


-- ── §12.5  master.attachment_comment ───────────────────────────────────────
-- Threaded comments on attachments.
-- Parent/child thread integrity enforced by fn_comment_parent_same_attachment().

CREATE TABLE IF NOT EXISTS master.attachment_comment (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Thread context
    attachment_id   uuid        NOT NULL,
    parent_id       uuid,

    -- Content
    author_id       uuid        NOT NULL,
    content         text        NOT NULL,
    mentions        jsonb,

    -- Edit tracking
    edited_at       timestamptz,
    edited_by       uuid,

    -- Soft delete
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT att_comment_pkey             PRIMARY KEY (id),
    CONSTRAINT att_comment_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT att_comment_content_chk      CHECK (btrim(content) <> ''),
    CONSTRAINT att_comment_mentions_chk     CHECK (
        mentions IS NULL OR jsonb_typeof(mentions) = 'array'
    ),

    CONSTRAINT att_comment_parent_fk
        FOREIGN KEY (parent_id)
        REFERENCES master.attachment_comment (id)
);

COMMENT ON TABLE  master.attachment_comment IS
    'Threaded comments on attachments. '
    'Satellite of master.attachment — follows master.comment family pattern. '
    'fn_comment_parent_same_attachment() enforces thread integrity.';
COMMENT ON COLUMN master.attachment_comment.mentions IS
    'JSON array of {user_id: uuid, ...} mention objects. '
    'Validated by document.fn_doc_validate_mentions() trigger.';


-- ── §12.6  master.template_binding ─────────────────────────────────────────
-- Maps (entity_name, operation, variant) → template with priority ordering.
-- Multiple bindings per combo allowed; highest priority wins at resolution time.

CREATE TABLE IF NOT EXISTS master.template_binding (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Binding key
    template_id     uuid        NOT NULL,
    entity_name     text        NOT NULL,
    operation       text        NOT NULL,
    variant         text        NOT NULL DEFAULT 'default',

    -- Resolution ordering
    priority        integer     NOT NULL DEFAULT 0,

    -- State
    is_active       boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT template_binding_pkey            PRIMARY KEY (id),
    CONSTRAINT template_binding_entity_chk      CHECK (btrim(entity_name) <> ''),
    CONSTRAINT template_binding_operation_chk   CHECK (btrim(operation) <> ''),
    CONSTRAINT template_binding_variant_chk     CHECK (btrim(variant) <> '')
);

COMMENT ON TABLE  master.template_binding IS
    'Maps (entity_name, operation, variant) to a template with priority-based resolution. '
    'resolve_template_binding() returns highest-priority active binding.';
COMMENT ON COLUMN master.template_binding.priority IS
    'Higher value = wins resolution when multiple active bindings match the same key. '
    'Partial unique index prevents duplicate (template, entity, op, variant) per active binding.';
COMMENT ON COLUMN master.template_binding.entity_name IS
    'Polymorphic entity type string. e.g. ''document.purchase_invoice'', ''document.credit_note''.';


-- ── §12.7  master.entity_document_link ─────────────────────────────────────
-- Polymorphic many-to-many link between any entity and an attachment.
-- Canonical sole model for entity-to-document associations.
-- Pattern: master.address_link / master.contact_link.

CREATE TABLE IF NOT EXISTS master.entity_document_link (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Polymorphic entity reference
    entity_type     text        NOT NULL,
    entity_id       text        NOT NULL,   -- text, not uuid — supports any PK type

    -- Link target
    attachment_id   uuid        NOT NULL,
    link_kind       text        NOT NULL DEFAULT 'related',
    display_order   integer     NOT NULL DEFAULT 0,

    -- Metadata
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT edl_pkey             PRIMARY KEY (id),
    CONSTRAINT edl_link_kind_chk    CHECK (link_kind IN (
        'primary', 'related', 'supporting', 'compliance', 'audit'
    )),
    CONSTRAINT edl_entity_type_chk  CHECK (btrim(entity_type) <> ''),
    CONSTRAINT edl_entity_id_chk    CHECK (btrim(entity_id) <> ''),
    CONSTRAINT edl_display_order_chk CHECK (display_order >= 0)
);

COMMENT ON TABLE  master.entity_document_link IS
    'Polymorphic many-to-many: any entity type → attachment. '
    'Canonical sole model for entity-to-document associations. '
    'Pattern: master.address_link. entity_id is text for polymorphic PK support.';
COMMENT ON COLUMN master.entity_document_link.entity_type IS
    'Fully-qualified entity type string. e.g. ''document.purchase_invoice''.';
COMMENT ON COLUMN master.entity_document_link.entity_id IS
    'Entity PK as text — cast to uuid where applicable. '
    'text type allows linking to composite-key or non-uuid entities.';


-- ============================================================================
-- CORE FINANCE MASTER TABLES (lookup-governed)
-- ============================================================================
-- 12 tables: legal_entity, company_code, cost_center, profit_center, site,
--            warehouse, chart_of_account, gl_account,
--            company_code_chart_assignment, company_code_gl_account,
--            project, project_item
-- ============================================================================
-- ZERO hardcoded CHECK enumerations — all governed by control.lookup_domain
-- ZERO inline address columns — use master.address + master.address_link
-- ============================================================================
-- FKs → 06_constraints/003_master.sql
-- Indexes → 07_indexes/003_master.sql
-- Triggers → 09_triggers/003_master.sql
-- Lookup validation → 09_triggers/003_master.sql via control.trg_validate_lookup_columns()
-- ============================================================================

