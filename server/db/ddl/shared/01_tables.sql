-- ============================================================================
-- shared/01_tables.sql
-- Concept: Reference Data — ISO codes, platform entities, RBAC base types
-- Depends on: 01_schemas, 02_types_domains, 03_bootstrap_functions/001_shared.sql
-- Shared schema tables: ISO/code-list references + global platform entities.
-- No tenant_id. Column order: Identity → Table-specific → Metadata → Lifecycle → Audit.
-- Seed principal: systemadmin (id = '00000000-0000-0000-0000-000000000000').
-- ============================================================================

-- §1 country
CREATE TABLE IF NOT EXISTS shared.country (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            character(2)      NOT NULL,
    name            text              NOT NULL,

    -- Table-specific (ISO)
    code3           character(3),
    numeric3        character(3),
    official_name   text,
    region          text,
    subregion       text,

    -- Table-specific (phone / calling code)
    calling_code            text,           -- ITU-T E.164 prefix without +  e.g. '60'
    phone_trunk_prefix      text,           -- trunk digit for domestic dial  e.g. '0'
    phone_national_pattern  text,           -- POSIX regex for national number
    phone_example           text,           -- display hint  e.g. '+60 12-345 6789'

    -- Table-specific (postal code)
    has_postal_codes        boolean         NOT NULL DEFAULT true,
    postal_code_pattern     text,           -- POSIX regex  e.g. '^\d{5}$'
    postal_code_label       text            NOT NULL DEFAULT 'Postal code',
    postal_code_example     text,           -- display hint  e.g. '50450'

    -- Table-specific (address rendering hints)
    region_label            text            NOT NULL DEFAULT 'Region',
    postal_position         text            NOT NULL DEFAULT 'after_city',
    address_format          text,           -- ordered field list for rendering

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            shared.ref_status_d DEFAULT 'active' NOT NULL,
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       DEFAULT now() NOT NULL,
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT country_pkey          PRIMARY KEY (id),
    CONSTRAINT country_code_uq       UNIQUE (code),
    CONSTRAINT country_code_fmt      CHECK (code::text ~ '^[A-Z]{2}$'),
    CONSTRAINT country_code3_fmt     CHECK (code3 IS NULL OR code3::text ~ '^[A-Z]{3}$'),
    CONSTRAINT country_numeric3_fmt  CHECK (numeric3 IS NULL OR numeric3::text ~ '^[0-9]{3}$'),
    CONSTRAINT country_name_nonempty CHECK (btrim(name) <> ''),
    -- Phone constraints
    CONSTRAINT country_calling_code_fmt_chk
        CHECK (calling_code IS NULL OR calling_code ~ '^[1-9][0-9]{0,3}$'),
    CONSTRAINT country_phone_trunk_prefix_chk
        CHECK (phone_trunk_prefix IS NULL OR phone_trunk_prefix ~ '^\d{1,3}$'),
    -- Postal constraints
    CONSTRAINT country_no_postal_pattern_chk
        CHECK (has_postal_codes = true OR postal_code_pattern IS NULL),
    CONSTRAINT country_postal_position_chk
        CHECK (postal_position IN ('before_city', 'after_city', 'after_region', 'none')),
    CONSTRAINT country_postal_position_consistency_chk
        CHECK (
            (has_postal_codes = false AND postal_position = 'none')
         OR (has_postal_codes = true  AND postal_position <> 'none')
        )
);

COMMENT ON TABLE shared.country IS
  'ARCHETYPE=A;SCOPE=N. ISO 3166-1 country register. PK: uuidv7 id. Natural key: alpha-2 code. '
  'Extended with phone dialing, postal validation, and address rendering metadata.';

COMMENT ON COLUMN shared.country.calling_code IS
  'ITU-T E.164 calling code without the + prefix. e.g. 60 (MY), 1 (US), 44 (GB). '
  'Used by fn_validate_phone() and to populate contact_phone.calling_code.';
COMMENT ON COLUMN shared.country.phone_trunk_prefix IS
  'Trunk digit prepended to national numbers for domestic dialling. '
  'Stripped when converting to E.164. e.g. 0 (MY, GB, DE), NULL (US, SG).';
COMMENT ON COLUMN shared.country.phone_national_pattern IS
  'POSIX regex for the national number portion (after calling code and trunk prefix).';
COMMENT ON COLUMN shared.country.phone_example IS
  'Human-readable example in international format. Shown in UI placeholder.';
COMMENT ON COLUMN shared.country.has_postal_codes IS
  'FALSE for countries with no postal code system (HK, AE, MO). '
  'When FALSE: postal_code_pattern must be NULL and postal_position = none.';
COMMENT ON COLUMN shared.country.postal_code_pattern IS
  'POSIX regex validated against master.address.postal_code. '
  'NULL when has_postal_codes=false or pattern not yet catalogued.';
COMMENT ON COLUMN shared.country.postal_code_label IS
  'UI label for the postal code field. e.g. Postcode (MY/GB), ZIP code (US), PLZ (DE), PIN (IN).';
COMMENT ON COLUMN shared.country.postal_code_example IS
  'Display example for UI placeholder. e.g. 50450 (MY), SW1A 1AA (GB).';
COMMENT ON COLUMN shared.country.region_label IS
  'UI label for the region/state/province field. e.g. State (MY/US), Province (CA), County (GB).';
COMMENT ON COLUMN shared.country.postal_position IS
  'Controls address block rendering order: before_city (DE, JP), after_city (MY, GB), '
  'after_region (US, AU), none (HK, AE).';
COMMENT ON COLUMN shared.country.address_format IS
  'Comma-separated ordered field list for address block rendering. NULL = application default.';

-- §2 currency
CREATE TABLE IF NOT EXISTS shared.currency (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            character(3)      NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    symbol          text,
    minor_units     integer,
    numeric3        character(3),

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            shared.ref_status_d DEFAULT 'active' NOT NULL,
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       DEFAULT now() NOT NULL,
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT currency_pkey            PRIMARY KEY (id),
    CONSTRAINT currency_code_uq         UNIQUE (code),
    CONSTRAINT currency_code_fmt        CHECK (code::text ~ '^[A-Z]{3}$'),
    CONSTRAINT currency_numeric3_fmt    CHECK (numeric3 IS NULL OR numeric3::text ~ '^[0-9]{3}$'),
    CONSTRAINT currency_minor_units_chk CHECK (minor_units IS NULL OR (minor_units >= 0 AND minor_units <= 6)),
    CONSTRAINT currency_name_nonempty   CHECK (btrim(name) <> '')
);

COMMENT ON TABLE shared.currency IS
  'ARCHETYPE=A;SCOPE=N. ISO 4217 currency register. PK: uuidv7 id. Natural key: alpha-3 code. minor_units = decimal precision.';

-- §3 language
CREATE TABLE IF NOT EXISTS shared.language (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    native_name     text,
    iso639_2        text,
    direction       text              DEFAULT 'ltr' NOT NULL,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            shared.ref_status_d DEFAULT 'active' NOT NULL,
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       DEFAULT now() NOT NULL,
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT language_pkey           PRIMARY KEY (id),
    CONSTRAINT language_code_uq        UNIQUE (code),
    CONSTRAINT language_code_fmt       CHECK (code ~ '^[a-z]{2,3}$'),
    CONSTRAINT language_iso639_2_fmt   CHECK (iso639_2 IS NULL OR iso639_2 ~ '^[a-z]{3}$'),
    CONSTRAINT language_dir_chk        CHECK (direction = ANY (ARRAY['ltr', 'rtl'])),
    CONSTRAINT language_name_nonempty  CHECK (btrim(name) <> '')
);

COMMENT ON TABLE shared.language IS
  'ARCHETYPE=A;SCOPE=N. ISO 639 language register. PK: uuidv7 id. Natural key: lowercase 2-or-3-char code.';

-- §4 locale
CREATE TABLE IF NOT EXISTS shared.locale (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    language_code   text              NOT NULL,
    country_code    character(2),
    script          text,
    direction       text,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            shared.ref_status_d DEFAULT 'active' NOT NULL,
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       DEFAULT now() NOT NULL,
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT locale_pkey           PRIMARY KEY (id),
    CONSTRAINT locale_code_uq        UNIQUE (code),
    CONSTRAINT locale_code_fmt       CHECK (code ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2}|-[0-9]{3})?$'),
    CONSTRAINT locale_script_fmt     CHECK (script IS NULL OR script ~ '^[A-Z][a-z]{3}$'),
    CONSTRAINT locale_dir_chk        CHECK (direction IS NULL OR direction = ANY (ARRAY['ltr', 'rtl'])),
    CONSTRAINT locale_name_nonempty  CHECK (btrim(name) <> '')
);

COMMENT ON TABLE shared.locale IS
  'ARCHETYPE=A;SCOPE=N. BCP 47 locale register. PK: uuidv7 id. Natural key: normalised locale tag (e.g. en-US). Subtags cross-validated by trigger.';

-- §5 timezone
CREATE TABLE IF NOT EXISTS shared.timezone (
    -- Identity
    id                  uuid          NOT NULL DEFAULT shared.uuidv7(),
    code                text          NOT NULL,
    name                text,

    -- Table-specific
    utc_offset_minutes  integer,
    is_alias            boolean       DEFAULT false NOT NULL,
    canonical_code      text,

    -- Metadata
    metadata            jsonb         DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            shared.ref_status_d DEFAULT 'active' NOT NULL,
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at        timestamptz     DEFAULT now() NOT NULL,
    created_by        uuid            NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT timezone_pkey               PRIMARY KEY (id),
    CONSTRAINT timezone_code_uq            UNIQUE (code),
    CONSTRAINT timezone_code_nonempty      CHECK (btrim(code) <> ''),
    CONSTRAINT timezone_code_no_whitespace CHECK (code !~ '\s'),
    CONSTRAINT timezone_canonical_not_self CHECK (canonical_code IS NULL OR canonical_code <> code),
    CONSTRAINT timezone_alias_consistency  CHECK (is_alias = (canonical_code IS NOT NULL)),
    CONSTRAINT timezone_offset_range       CHECK (utc_offset_minutes IS NULL OR utc_offset_minutes BETWEEN -840 AND 840)
);

COMMENT ON TABLE shared.timezone IS
  'ARCHETYPE=A;SCOPE=N. IANA timezone register. PK: uuidv7 id. Natural key: IANA tzid as code. Alias entries self-ref via canonical_code.';

-- §6 uom
CREATE TABLE IF NOT EXISTS shared.uom (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    symbol          text,
    quantity_type   text,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            shared.ref_status_d DEFAULT 'active' NOT NULL,
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       DEFAULT now() NOT NULL,
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT uom_pkey           PRIMARY KEY (id),
    CONSTRAINT uom_code_uq        UNIQUE (code),
    CONSTRAINT uom_code_fmt       CHECK (code ~ '^[A-Z0-9]{1,4}$'),
    CONSTRAINT uom_name_nonempty  CHECK (btrim(name) <> '')
);

COMMENT ON TABLE shared.uom IS
  'ARCHETYPE=A;SCOPE=N. UN/ECE Rec 20 unit-of-measure register. PK: uuidv7 id. Natural key: 1-4 char code. quantity_type CHECK → control.fn_valid_lookup.';

-- §7 state_region
CREATE TABLE IF NOT EXISTS shared.state_region (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    country_code    character(2)      NOT NULL,
    category        text,
    parent_code     text,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            shared.ref_status_d DEFAULT 'active' NOT NULL,
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       DEFAULT now() NOT NULL,
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT state_region_pkey             PRIMARY KEY (id),
    CONSTRAINT state_region_country_code_uq  UNIQUE (country_code, code),
    CONSTRAINT state_region_code_fmt         CHECK (code ~ '^[A-Z]{2}-[A-Z0-9]{1,6}$'),
    CONSTRAINT state_region_name_nonempty    CHECK (btrim(name) <> '')
);

COMMENT ON TABLE shared.state_region IS
  'ARCHETYPE=A;SCOPE=N. ISO 3166-2 subdivision register. PK: uuidv7 id. Natural key: (country_code, code). Code prefix validated by trigger.';

-- §8 commodity_code
CREATE TABLE IF NOT EXISTS shared.commodity_code (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    domain_code     text              NOT NULL,
    description     text,
    parent_code     text,
    level_no        integer,
    keywords        text[],
    is_leaf         boolean           DEFAULT false NOT NULL,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            shared.ref_status_d DEFAULT 'active' NOT NULL,
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       DEFAULT now() NOT NULL,
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT commodity_code_pkey            PRIMARY KEY (id),
    CONSTRAINT commodity_code_domain_code_uq  UNIQUE (domain_code, code),
    CONSTRAINT commodity_code_fmt             CHECK (code ~ '^[A-Z0-9._-]+$'),
    CONSTRAINT commodity_code_no_self_parent  CHECK (parent_code IS NULL OR parent_code <> code),
    CONSTRAINT commodity_code_level_chk       CHECK (level_no IS NULL OR level_no >= 1),
    CONSTRAINT commodity_code_root_chk        CHECK (
        (parent_code IS NULL AND level_no = 1)
        OR (parent_code IS NOT NULL AND (level_no IS NULL OR level_no > 1))
    ),
    CONSTRAINT commodity_code_name_nonempty   CHECK (btrim(name) <> '')
);

COMMENT ON TABLE shared.commodity_code IS
  'ARCHETYPE=A;SCOPE=N. Hierarchical commodity classification (UNSPSC, HS, etc.). PK: uuidv7 id. Natural key: (domain_code, code). Cycle detection via triggers.';

-- §9 industry_code
CREATE TABLE IF NOT EXISTS shared.industry_code (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    domain_code     text              NOT NULL,
    description     text,
    parent_code     text,
    level_no        integer,
    keywords        text[],
    is_leaf         boolean           DEFAULT false NOT NULL,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            shared.ref_status_d DEFAULT 'active' NOT NULL,
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       DEFAULT now() NOT NULL,
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT industry_code_pkey            PRIMARY KEY (id),
    CONSTRAINT industry_code_domain_code_uq  UNIQUE (domain_code, code),
    CONSTRAINT industry_code_fmt             CHECK (code ~ '^[A-Z0-9._-]+$'),
    CONSTRAINT industry_code_no_self_parent  CHECK (parent_code IS NULL OR parent_code <> code),
    CONSTRAINT industry_code_level_chk       CHECK (level_no IS NULL OR level_no >= 1),
    CONSTRAINT industry_code_root_chk        CHECK (
        (parent_code IS NULL AND level_no = 1)
        OR (parent_code IS NOT NULL AND (level_no IS NULL OR level_no > 1))
    ),
    CONSTRAINT industry_code_name_nonempty   CHECK (btrim(name) <> '')
);

COMMENT ON TABLE shared.industry_code IS
  'ARCHETYPE=A;SCOPE=N. Hierarchical industry classification (ISIC, NAICS, etc.). PK: uuidv7 id. Natural key: (domain_code, code).';

-- §10 workspace
CREATE TABLE IF NOT EXISTS shared.workspace (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    description     text,
    sort_order      smallint          NOT NULL DEFAULT 0,
    is_shared_infrastructure boolean  NOT NULL DEFAULT false,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active         boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT workspace_pkey          PRIMARY KEY (id),
    CONSTRAINT workspace_code_uq       UNIQUE (code),
    CONSTRAINT workspace_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT workspace_name_nonempty CHECK (btrim(name) <> '')
);

COMMENT ON TABLE shared.workspace IS
  'ARCHETYPE=A;SCOPE=N. Global workspace containers for product modules. No tenant_id.';
COMMENT ON COLUMN shared.workspace.is_shared_infrastructure IS
  'When true, descriptor reads (compiled-entity, runtime-options reference targets) bypass the module-access gate for any module in this workspace. Records APIs, writes, navigation, and admin consoles still enforce normal module access. Used for CORE-class workspaces whose modules expose shared dictionaries (address, country, currency, etc.) that any tenant principal must be able to resolve as reference targets.';

-- §11 module
CREATE TABLE IF NOT EXISTS shared.module (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    description     text,
    workspace_id    uuid,
    config          jsonb,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active         boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT module_pkey          PRIMARY KEY (id),
    CONSTRAINT module_code_uq       UNIQUE (code),
    CONSTRAINT module_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT module_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT module_workspace_fk  FOREIGN KEY (workspace_id)
        REFERENCES shared.workspace (id) ON DELETE RESTRICT
);

COMMENT ON TABLE shared.module IS
  'ARCHETYPE=A;SCOPE=N. Product module definitions scoped to a workspace. FK workspace_id → shared.workspace.';
COMMENT ON COLUMN shared.module.config IS
  'Runtime configuration specific to this module (e.g. feature flags, limits). Schema validated by application layer.';
COMMENT ON COLUMN shared.module.metadata IS
  'Generic audit/tagging key-value blob. Use for labels, tags, and operational notes only. Never store module config here.';

-- §12 persona
CREATE TABLE IF NOT EXISTS shared.persona (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    description     text,
    scope_mode      text              NOT NULL DEFAULT 'tenant',
    priority        integer           NOT NULL DEFAULT 0,
    is_system       boolean           NOT NULL DEFAULT false,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active         boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT persona_pkey          PRIMARY KEY (id),
    CONSTRAINT persona_code_uq       UNIQUE (code),
    CONSTRAINT persona_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT persona_name_nonempty CHECK (btrim(name) <> '')
    -- persona_scope_mode_chk: deferred to 06_constraints via control.fn_valid_lookup
);

COMMENT ON TABLE shared.persona IS
  'ARCHETYPE=A;SCOPE=N. Permission role templates. System personas (is_system = true) have immutable structural fields.';


-- ============================================================================
-- §13  enterprise_feature — feature registry for Special Ops
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared.enterprise_feature (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    description     text,
    view_key        text              NOT NULL,
    edit_key        text              NOT NULL,
    sort_order      smallint          NOT NULL DEFAULT 0,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active       boolean           GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT enterprise_feature_pkey     PRIMARY KEY (id),
    CONSTRAINT enterprise_feature_code_uq  UNIQUE (code),
    CONSTRAINT enterprise_feature_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT enterprise_feature_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT enterprise_feature_view_key_chk CHECK (btrim(view_key) <> ''),
    CONSTRAINT enterprise_feature_edit_key_chk CHECK (btrim(edit_key) <> '')
);

COMMENT ON TABLE shared.enterprise_feature IS
  'ARCHETYPE=A;SCOPE=N. Feature registry for Special Ops toggles. Each feature has a view_key and edit_key '
  'used for permission checks. Plan-gated via shared.plan_feature_access.';


-- ============================================================================
-- §14  subscription_plan — plan tiers
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared.subscription_plan (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    max_users       integer,
    sort_order      smallint          NOT NULL DEFAULT 0,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active       boolean           GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT subscription_plan_pkey    PRIMARY KEY (id),
    CONSTRAINT subscription_plan_code_uq UNIQUE (code),
    CONSTRAINT subscription_plan_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT subscription_plan_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT subscription_plan_max_users_chk CHECK (max_users IS NULL OR max_users > 0)
);

COMMENT ON TABLE shared.subscription_plan IS
  'ARCHETYPE=A;SCOPE=N. Subscription plan tiers. max_users NULL = unlimited. Controls module/permission/feature availability.';


-- ============================================================================
-- §14b  subscription_plan_version — versioned plan configuration
-- Each plan has exactly one active version (valid_to IS NULL AND status=active).
-- A new version INSERT fires fn_close_prior_plan_version() to close the current.
-- Access rows (plan_*_access) are keyed to plan_version_id, not plan_id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared.subscription_plan_version (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    plan_id         uuid        NOT NULL,

    -- Versioning
    version_number  integer     GENERATED ALWAYS AS IDENTITY,
    valid_from      date        NOT NULL DEFAULT CURRENT_DATE,
    valid_to        date,

    -- Configuration (mirrors or overrides plan-level defaults)
    max_users       integer,

    -- Metadata
    metadata        jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status          text        NOT NULL DEFAULT 'active',

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT spv_pkey           PRIMARY KEY (id),
    CONSTRAINT spv_plan_fk        FOREIGN KEY (plan_id) REFERENCES shared.subscription_plan(id),
    CONSTRAINT spv_version_uq     UNIQUE (plan_id, version_number),
    CONSTRAINT spv_status_chk     CHECK (status IN ('active', 'archived')),
    CONSTRAINT spv_max_users_chk  CHECK (max_users IS NULL OR max_users > 0),
    CONSTRAINT spv_date_order_chk CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- Partial unique index: only one active version per plan at any time
CREATE UNIQUE INDEX IF NOT EXISTS spv_active_uq
  ON shared.subscription_plan_version (plan_id)
  WHERE valid_to IS NULL AND status = 'active';

-- Idempotent: if the table already existed without GENERATED ALWAYS AS IDENTITY
-- (e.g. created on a prior failed migration run), promote the column now.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'shared'
      AND table_name   = 'subscription_plan_version'
      AND column_name  = 'version_number'
      AND is_identity  = 'NO'
  ) THEN
    ALTER TABLE shared.subscription_plan_version
      ALTER COLUMN version_number ADD GENERATED ALWAYS AS IDENTITY;
  END IF;
END $$;

COMMENT ON TABLE shared.subscription_plan_version IS
  'ARCHETYPE=A;SCOPE=N. Versioned configuration snapshot for a subscription plan. '
  'Exactly one active version per plan_id at any time (enforced by spv_active_uq partial index). '
  'access rows reference plan_version_id FK. fn_close_prior_plan_version trigger closes prior active row on INSERT.';


-- ============================================================================
-- §15  permission_category — grouping for 40 atomic permissions (36 operational + 4 special)
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared.permission_category (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    sort_order      smallint          NOT NULL DEFAULT 0,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active       boolean           GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT permission_category_pkey    PRIMARY KEY (id),
    CONSTRAINT permission_category_code_uq UNIQUE (code),
    CONSTRAINT permission_category_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT permission_category_name_chk CHECK (btrim(name) <> '')
);

COMMENT ON TABLE shared.permission_category IS
  'ARCHETYPE=A;SCOPE=N. Grouping for atomic permissions: entity, workflow, finance, utility, bulk, delegation, collaboration, special.';


-- ============================================================================
-- §16  permission — 40 atomic permission definitions (36 operational + 4 special)
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared.permission (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    category_id     uuid              NOT NULL,
    scope_type      text              NOT NULL DEFAULT 'record',
    risk_level      text              NOT NULL DEFAULT 'low',
    is_plan_restricted boolean        NOT NULL DEFAULT false,
    sort_order      smallint          NOT NULL DEFAULT 0,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status          shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active       boolean           GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT permission_pkey            PRIMARY KEY (id),
    CONSTRAINT permission_code_uq         UNIQUE (code),
    CONSTRAINT permission_code_chk        CHECK (btrim(code) <> ''),
    CONSTRAINT permission_name_chk        CHECK (btrim(name) <> ''),
    CONSTRAINT perm_scope_type_chk        CHECK (scope_type IN ('record','tenant','special')),
    CONSTRAINT perm_risk_chk              CHECK (risk_level IN ('low','medium','high','critical'))
);

COMMENT ON TABLE shared.permission IS
  'ARCHETYPE=A;SCOPE=N. Atomic permission definitions. scope_type governs evaluation granularity. '
  'is_plan_restricted gates behind subscription_plan. FK category_id deferred to 06_constraints.';


-- ============================================================================
-- §16a permission_scope_policy — authoritative permission scope contract
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared.permission_scope_policy (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    permission_id           uuid        NOT NULL,
    assignment_scope_type   text        NOT NULL,
    organization_domain     text,
    propagation_mode        text        NOT NULL DEFAULT 'none',
    requires_resource_scope boolean     NOT NULL DEFAULT false,
    status                  text        NOT NULL DEFAULT 'active',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT permission_scope_policy_pkey PRIMARY KEY (id),
    CONSTRAINT permission_scope_policy_uq UNIQUE NULLS NOT DISTINCT
        (permission_id, assignment_scope_type, organization_domain),
    CONSTRAINT permission_scope_policy_scope_chk CHECK (
        assignment_scope_type IN ('tenant', 'legal_entity', 'company_code', 'operating_organization', 'network_membership')
    ),
    CONSTRAINT permission_scope_policy_domain_chk CHECK (
        (assignment_scope_type = 'operating_organization' AND organization_domain IN ('procurement', 'sales'))
        OR (assignment_scope_type <> 'operating_organization' AND organization_domain IS NULL)
    ),
    CONSTRAINT permission_scope_policy_propagation_chk CHECK (
        propagation_mode IN ('none', 'member_companies', 'resource_only')
    ),
    CONSTRAINT permission_scope_policy_resource_chk CHECK (
        propagation_mode <> 'resource_only' OR requires_resource_scope = true
    ),
    CONSTRAINT permission_scope_policy_status_chk CHECK (status IN ('active', 'inactive', 'deprecated'))
);

COMMENT ON TABLE shared.permission_scope_policy IS
  'Authoritative permission-to-assignment-scope policy. Operating Organization domain is explicit and must never be inferred from a permission-code prefix.';

-- ============================================================================
-- §17  persona_permission — binary grant matrix (persona × permission)
-- ============================================================================
-- No scope_constraint column. Scope lives exclusively on master.auth_group_role.

CREATE TABLE IF NOT EXISTS shared.persona_permission (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),

    -- Table-specific
    persona_id      uuid              NOT NULL,
    permission_id   uuid              NOT NULL,
    is_granted      boolean           NOT NULL DEFAULT false,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,

    CONSTRAINT persona_permission_pkey PRIMARY KEY (id),
    CONSTRAINT persona_permission_uq   UNIQUE (persona_id, permission_id)
);

COMMENT ON TABLE shared.persona_permission IS
  'ARCHETYPE=C;SCOPE=N;SUBTYPE=APPEND_ONLY. Binary grant matrix: persona × permission. is_granted = true means the persona '
  'has the permission by default. No scope column — scope lives on master.auth_group_role.';


-- §18  ou_type — REMOVED: migrated to control.lookup_domain / control.lookup_value
--       Domain code: 'ou_type'. See 900_seed_data/001_shared/018_ou_type.sql.


-- ============================================================================
-- §19  plan_module_access — module availability per subscription plan
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared.plan_module_access (
    -- Identity
    id                  uuid              NOT NULL DEFAULT shared.uuidv7(),

    -- Table-specific
    plan_version_id     uuid              NOT NULL,
    module_id           uuid              NOT NULL,
    is_included         boolean           NOT NULL DEFAULT false,
    is_addon            boolean           NOT NULL DEFAULT false,
    addon_price_monthly numeric(10,2),
    user_limit          integer,

    -- Audit
    created_at          timestamptz       NOT NULL DEFAULT now(),
    created_by          uuid              NOT NULL,

    CONSTRAINT plan_module_access_pkey  PRIMARY KEY (id),
    CONSTRAINT plan_module_access_uq    UNIQUE (plan_version_id, module_id),
    CONSTRAINT pma_mutex                CHECK (NOT (is_included AND is_addon)),
    CONSTRAINT pma_user_limit_chk       CHECK (user_limit IS NULL OR user_limit > 0)
);

COMMENT ON TABLE shared.plan_module_access IS
  'ARCHETYPE=C;SCOPE=N;SUBTYPE=APPEND_ONLY. Module availability per subscription plan version. is_included XOR is_addon (pma_mutex). '
  'FK plan_version_id → subscription_plan_version, module_id → module deferred to 06_constraints.';


-- ============================================================================
-- §20  plan_permission_access — plan-gated permissions
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared.plan_permission_access (
    -- Identity
    id                  uuid              NOT NULL DEFAULT shared.uuidv7(),

    -- Table-specific
    plan_version_id     uuid              NOT NULL,
    permission_id       uuid              NOT NULL,
    is_included         boolean           NOT NULL DEFAULT false,
    is_addon            boolean           NOT NULL DEFAULT false,
    addon_price_monthly numeric(10,2),
    usage_limit         integer,

    -- Audit
    created_at          timestamptz       NOT NULL DEFAULT now(),
    created_by          uuid              NOT NULL,

    CONSTRAINT plan_permission_access_pkey  PRIMARY KEY (id),
    CONSTRAINT plan_permission_access_uq    UNIQUE (plan_version_id, permission_id),
    CONSTRAINT ppa_mutex                    CHECK (NOT (is_included AND is_addon)),
    CONSTRAINT ppa_usage_limit_chk          CHECK (usage_limit IS NULL OR usage_limit > 0)
);

COMMENT ON TABLE shared.plan_permission_access IS
  'ARCHETYPE=C;SCOPE=N;SUBTYPE=APPEND_ONLY. Plan-version-gated permission overrides. Checked by check_permission() for is_plan_restricted permissions.';


-- ============================================================================
-- §21  plan_feature_access — feature availability per subscription plan
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared.plan_feature_access (
    -- Identity
    id                  uuid              NOT NULL DEFAULT shared.uuidv7(),

    -- Table-specific
    plan_version_id     uuid              NOT NULL,
    feature_id          uuid              NOT NULL,
    is_included         boolean           NOT NULL DEFAULT false,
    is_addon            boolean           NOT NULL DEFAULT false,
    addon_price_monthly numeric(10,2),
    max_users           integer,

    -- Audit
    created_at          timestamptz       NOT NULL DEFAULT now(),
    created_by          uuid              NOT NULL,

    CONSTRAINT plan_feature_access_pkey  PRIMARY KEY (id),
    CONSTRAINT plan_feature_access_uq    UNIQUE (plan_version_id, feature_id),
    CONSTRAINT pfa_mutex                 CHECK (NOT (is_included AND is_addon)),
    CONSTRAINT pfa_max_users_chk         CHECK (max_users IS NULL OR max_users > 0)
);

COMMENT ON TABLE shared.plan_feature_access IS
  'ARCHETYPE=C;SCOPE=N;SUBTYPE=APPEND_ONLY. Feature availability per subscription plan version. FK plan_version_id → subscription_plan_version, '
  'feature_id → enterprise_feature deferred to 06_constraints.';


-- =============================================================================
-- Schema migration: plan_*_access — rename plan_id → plan_version_id
--
-- On an existing database the CREATE TABLE IF NOT EXISTS blocks above are
-- skipped, so the new column doesn't exist yet. These DO blocks are idempotent:
-- they only run when the OLD column is still present.  All rows are deleted
-- before the column is replaced; the seed file re-inserts them via the new FK.
-- On a fresh database the CREATE TABLE IF NOT EXISTS already used plan_version_id
-- so these blocks are no-ops.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'shared' AND table_name = 'plan_module_access' AND column_name = 'plan_id'
  ) THEN
    ALTER TABLE shared.plan_module_access DROP CONSTRAINT IF EXISTS plan_module_access_uq;
    ALTER TABLE shared.plan_module_access DROP CONSTRAINT IF EXISTS pma_plan_fk;
    DELETE FROM shared.plan_module_access;
    ALTER TABLE shared.plan_module_access DROP COLUMN plan_id;
    ALTER TABLE shared.plan_module_access ADD COLUMN plan_version_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'shared' AND table_name = 'plan_permission_access' AND column_name = 'plan_id'
  ) THEN
    ALTER TABLE shared.plan_permission_access DROP CONSTRAINT IF EXISTS plan_permission_access_uq;
    ALTER TABLE shared.plan_permission_access DROP CONSTRAINT IF EXISTS ppa_plan_fk;
    DELETE FROM shared.plan_permission_access;
    ALTER TABLE shared.plan_permission_access DROP COLUMN plan_id;
    ALTER TABLE shared.plan_permission_access ADD COLUMN plan_version_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'shared' AND table_name = 'plan_feature_access' AND column_name = 'plan_id'
  ) THEN
    ALTER TABLE shared.plan_feature_access DROP CONSTRAINT IF EXISTS plan_feature_access_uq;
    ALTER TABLE shared.plan_feature_access DROP CONSTRAINT IF EXISTS pfa_plan_fk;
    DELETE FROM shared.plan_feature_access;
    ALTER TABLE shared.plan_feature_access DROP COLUMN plan_id;
    ALTER TABLE shared.plan_feature_access ADD COLUMN plan_version_id uuid;
  END IF;
END $$;

-- =============================================================================
-- §22  shared.commodity_crosswalk — cross-domain commodity code mapping
-- =============================================================================
-- Answers: "UNSPSC code 43211503 maps to HS code 8471.30."
-- Reverse of this direction lives in control.commodity_code_to_category_rule.
-- FKs to shared.commodity_code (source + target) → 06_constraints/001_shared.sql
-- Indexes → 07_indexes/001_shared.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.commodity_crosswalk (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),

    -- Source
    source_domain_code  text        NOT NULL,
    source_code         text        NOT NULL,

    -- Target
    target_domain_code  text        NOT NULL,
    target_code         text        NOT NULL,

    -- Mapping quality
    mapping_type        shared.mapping_type_d NOT NULL,
    confidence          numeric(5,2),
    provenance          shared.provenance_d NOT NULL DEFAULT 'MANUAL',

    -- Verification
    is_verified         boolean     NOT NULL DEFAULT false,
    verified_by         uuid,
    verified_at         timestamptz,

    -- Notes
    notes               text,

    -- Metadata
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT ccw_pkey              PRIMARY KEY (id),
    CONSTRAINT ccw_mapping_uq        UNIQUE (source_domain_code, source_code,
                                             target_domain_code, target_code),
    CONSTRAINT ccw_no_self_domain    CHECK (source_domain_code <> target_domain_code),
    CONSTRAINT ccw_confidence_chk    CHECK (confidence IS NULL
        OR (confidence >= 0 AND confidence <= 100)),
    CONSTRAINT ccw_verified_chk      CHECK (
        NOT is_verified OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

COMMENT ON TABLE shared.commodity_crosswalk IS
    'ARCHETYPE=A;SCOPE=N. Cross-domain commodity code mapping (e.g. UNSPSC → HS). '
    'source/target FKs to shared.commodity_code via (domain_code, code) composite key. '
    'confidence 0–100. provenance tracks origin of the mapping.';


-- =============================================================================
-- §23  shared.industry_crosswalk — cross-domain industry code mapping
-- =============================================================================
-- Same pattern as commodity_crosswalk but for industry classification codes
-- (e.g. NACE → SIC, GICS → NAICS).
-- FKs to shared.industry_code → 06_constraints/001_shared.sql
-- Indexes → 07_indexes/001_shared.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.industry_crosswalk (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),

    -- Source
    source_domain_code  text        NOT NULL,
    source_code         text        NOT NULL,

    -- Target
    target_domain_code  text        NOT NULL,
    target_code         text        NOT NULL,

    -- Mapping quality
    mapping_type        shared.mapping_type_d NOT NULL,
    confidence          numeric(5,2),
    provenance          shared.provenance_d NOT NULL DEFAULT 'MANUAL',

    -- Verification
    is_verified         boolean     NOT NULL DEFAULT false,
    verified_by         uuid,
    verified_at         timestamptz,

    notes               text,

    -- Metadata
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              shared.ref_status_d NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT icw_pkey              PRIMARY KEY (id),
    CONSTRAINT icw_mapping_uq        UNIQUE (source_domain_code, source_code,
                                             target_domain_code, target_code),
    CONSTRAINT icw_no_self_domain    CHECK (source_domain_code <> target_domain_code),
    CONSTRAINT icw_confidence_chk    CHECK (confidence IS NULL
        OR (confidence >= 0 AND confidence <= 100)),
    CONSTRAINT icw_verified_chk      CHECK (
        NOT is_verified OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

COMMENT ON TABLE shared.industry_crosswalk IS
    'ARCHETYPE=A;SCOPE=N. Cross-domain industry code mapping (e.g. NACE → SIC, GICS → NAICS). '
    'source/target FKs to shared.industry_code via (domain_code, code) composite key. '
    'confidence 0–100. provenance tracks origin of the mapping.';


-- ============================================================================
-- shared.role — Platform RBAC role = Persona × Module (shared, not per-tenant)
-- ============================================================================
-- Moved from master.role. Removed: tenant_id, is_system.
-- One row per (persona × module). Scope lives on master.auth_group_role exclusively.

CREATE TABLE IF NOT EXISTS shared.role (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Classification
    persona_id      uuid              NOT NULL,
    module_id       uuid,
    workspace_id    uuid,

    -- KC mapping
    kc_role_code    text,

    -- Metadata
    metadata        jsonb             NOT NULL DEFAULT '{}'::jsonb,

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

    CONSTRAINT shared_role_pkey         PRIMARY KEY (id),
    CONSTRAINT shared_role_code_uq      UNIQUE (code),
    CONSTRAINT shared_role_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT shared_role_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT shared_role_status_chk   CHECK (status IN ('active','suspended','deprecated')),
    -- Either module OR workspace, not both
    CONSTRAINT shared_role_scope_chk    CHECK (num_nonnulls(module_id, workspace_id) <= 1)
);

COMMENT ON TABLE shared.role IS
  'ARCHETYPE=A;SCOPE=N. Platform RBAC role = Persona × Module or Persona × Workspace. '
  'Shared across all tenants — no tenant_id. '
  'Scope lives on master.auth_group_role exclusively.';
