CREATE TABLE master.canonical_party (
  id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL,
  party_kind master.canonical_party_kind_d NOT NULL, legal_name text NOT NULL,
  display_name text NOT NULL, incorporation_country_code character(2),
  verification_status master.party_verification_status_d NOT NULL DEFAULT 'unverified',
  status master.party_lifecycle_status_d NOT NULL DEFAULT 'draft', merged_into_party_id uuid,
  record_version bigint NOT NULL DEFAULT 1, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_changed_at timestamptz, status_changed_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
  CONSTRAINT canonical_party_pkey PRIMARY KEY(id),
  CONSTRAINT canonical_party_tenant_id_uq UNIQUE(authority_tenant_id,id),
  CONSTRAINT canonical_party_names_chk CHECK (btrim(legal_name)<>'' AND btrim(display_name)<>''),
  CONSTRAINT canonical_party_merge_state_chk CHECK ((status='merged')=(merged_into_party_id IS NOT NULL)),
  CONSTRAINT canonical_party_no_self_merge_chk CHECK (merged_into_party_id IS NULL OR merged_into_party_id<>id),
  CONSTRAINT canonical_party_version_chk CHECK(record_version>0),
  CONSTRAINT canonical_party_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
  CONSTRAINT canonical_party_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
  CONSTRAINT canonical_party_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE master.canonical_party_identifier (
  id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL, party_id uuid NOT NULL,
  scheme text NOT NULL, issuer_country_code character(2), issuer_authority text,
  normalized_value text NOT NULL, value_hash text NOT NULL, masked_display text,
  claim_status master.party_identifier_claim_status_d NOT NULL DEFAULT 'claimed',
  verification_status master.party_verification_status_d NOT NULL DEFAULT 'unverified',
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, verified_at timestamptz, verified_by uuid,
  effective_from timestamptz NOT NULL DEFAULT now(), effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
  CONSTRAINT canonical_party_identifier_pkey PRIMARY KEY(id),
  CONSTRAINT canonical_party_identifier_scheme_chk CHECK(scheme~'^[a-z][a-z0-9_.:-]{1,62}$'),
  CONSTRAINT canonical_party_identifier_hash_chk CHECK(value_hash~'^[a-f0-9]{64}$'),
  CONSTRAINT canonical_party_identifier_value_chk CHECK(btrim(normalized_value)<>''),
  CONSTRAINT canonical_party_identifier_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT canonical_party_identifier_evidence_chk CHECK(jsonb_typeof(evidence_snapshot)='object'),
  CONSTRAINT canonical_party_identifier_verify_pair_chk CHECK((verified_at IS NULL)=(verified_by IS NULL)),
  CONSTRAINT canonical_party_identifier_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE master.canonical_party_relationship (
  id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL,
  from_party_id uuid NOT NULL, to_party_id uuid NOT NULL, relationship_kind text NOT NULL,
  verification_status master.party_verification_status_d NOT NULL DEFAULT 'unverified',
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status master.party_relationship_status_d NOT NULL DEFAULT 'pending',
  effective_from timestamptz NOT NULL, effective_until timestamptz,
  status_changed_at timestamptz, status_changed_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
  CONSTRAINT canonical_party_relationship_pkey PRIMARY KEY(id),
  CONSTRAINT canonical_party_relationship_kind_chk CHECK(relationship_kind~'^[a-z][a-z0-9_.:-]{1,62}$'),
  CONSTRAINT canonical_party_relationship_no_self_chk CHECK(from_party_id<>to_party_id),
  CONSTRAINT canonical_party_relationship_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT canonical_party_relationship_evidence_chk CHECK(jsonb_typeof(evidence_snapshot)='object'),
  CONSTRAINT canonical_party_relationship_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
  CONSTRAINT canonical_party_relationship_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE master.canonical_party_merge (
  id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL,
  losing_party_id uuid NOT NULL, surviving_party_id uuid NOT NULL, approved_case_id uuid,
  reason text NOT NULL, before_snapshot jsonb NOT NULL, after_snapshot jsonb NOT NULL,
  effective_at timestamptz NOT NULL, approved_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  CONSTRAINT canonical_party_merge_pkey PRIMARY KEY(id),
  CONSTRAINT canonical_party_merge_loser_uq UNIQUE(losing_party_id),
  CONSTRAINT canonical_party_merge_no_self_chk CHECK(losing_party_id<>surviving_party_id),
  CONSTRAINT canonical_party_merge_reason_chk CHECK(btrim(reason)<>''),
  CONSTRAINT canonical_party_merge_snapshots_chk CHECK(jsonb_typeof(before_snapshot)='object' AND jsonb_typeof(after_snapshot)='object')
);

COMMENT ON TABLE master.canonical_party IS 'Admin authority for deduplicated real-world parties. A party is not a tenant, identity organization, legal entity record, business partner, or network account.';
COMMENT ON COLUMN master.canonical_party.id IS 'Stable opaque reconciliation coordinate copied to application planes; it creates no cross-database foreign key.';

-- Plane-local workspace and module catalog.
-- The same desired-state definition is used by Athyper, Neon, and Mesh.

CREATE TABLE master.tenant (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    code                  text        NOT NULL,
    name                  text        NOT NULL,
    display_name          text        NOT NULL,
    realm_key             text        NOT NULL,
    canonical_party_id    uuid,
    subscription_plan_id  uuid,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'provisioning',
    is_active             boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT tenant_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_realm_code_uq UNIQUE (realm_key, code),
    CONSTRAINT tenant_code_fmt
        CHECK (code ~ '^[a-z][a-z0-9_-]{1,62}$'),
    CONSTRAINT tenant_name_nonempty
        CHECK (btrim(name) <> ''),
    CONSTRAINT tenant_display_name_nonempty
        CHECK (btrim(display_name) <> ''),
    CONSTRAINT tenant_realm_key_fmt
        CHECK (realm_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
    CONSTRAINT tenant_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tenant_status_chk
        CHECK (status IN ('provisioning', 'active', 'suspended', 'terminated')),
    CONSTRAINT tenant_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tenant_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.tenant IS
  'Plane-local application tenant and RLS root. It is a projection of a canonical business party, not a TrustIAM identity organization; organization aliases never identify tenants.';

COMMENT ON COLUMN master.tenant.canonical_party_id IS
  'Opaque Admin canonical-party coordinate. NULL is transitional and permitted for documented infrastructure tenants; it grants no identity or authorization rights.';

COMMENT ON COLUMN master.tenant.subscription_plan_id IS
  'Current plane-local commercial plan. References control.subscription_plan; NULL is allowed during provisioning and for system tenants.';

COMMENT ON COLUMN master.tenant.metadata IS
  'Non-authoritative extension metadata only. Must not contain secrets, permissions, or configuration authority.';

CREATE TABLE master.tenant_profile (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    country_code    character(2),
    locale_code     text,
    timezone_code   text,
    language_code   text,
    date_format     text,
    number_format   text,
    week_start      smallint,
    weekend_days    smallint[],
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT tenant_profile_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_profile_tenant_uq UNIQUE (tenant_id),
    CONSTRAINT tenant_profile_date_format_nonempty
        CHECK (
            date_format IS NULL
            OR (btrim(date_format) <> '' AND length(date_format) <= 64)
        ),
    CONSTRAINT tenant_profile_number_format_nonempty
        CHECK (
            number_format IS NULL
            OR (btrim(number_format) <> '' AND length(number_format) <= 64)
        ),
    CONSTRAINT tenant_profile_week_start_chk
        CHECK (week_start IS NULL OR week_start BETWEEN 0 AND 6),
    CONSTRAINT tenant_profile_weekend_days_chk
        CHECK (
            weekend_days IS NULL
            OR (
                cardinality(weekend_days) BETWEEN 1 AND 7
                AND weekend_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
            )
        ),
    CONSTRAINT tenant_profile_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tenant_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.tenant_profile IS
  'One-to-one tenant regional and presentation defaults. NULL means inherit the plane or platform default.';

COMMENT ON COLUMN master.tenant_profile.country_code IS
  'Default operating and presentation country; not legal-entity or tax authority.';

COMMENT ON COLUMN master.tenant_profile.weekend_days IS
  'Tenant calendar default only. Formal working calendars remain capability-owned.';

CREATE TABLE master.tenant_relationship (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    from_tenant_id        uuid        NOT NULL,
    to_tenant_id          uuid        NOT NULL,
    relationship_type     text        NOT NULL,
    activated_at          timestamptz,
    effective_from        timestamptz,
    effective_until       timestamptz,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'pending',
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT tenant_relationship_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_relationship_pair_type_uq
        UNIQUE (from_tenant_id, to_tenant_id, relationship_type),
    CONSTRAINT tenant_relationship_distinct_tenants_chk
        CHECK (from_tenant_id <> to_tenant_id),
    CONSTRAINT tenant_relationship_type_fmt_chk
        CHECK (relationship_type ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT tenant_relationship_effective_range_chk
        CHECK (
            effective_until IS NULL
            OR (
                effective_from IS NOT NULL
                AND effective_until > effective_from
            )
        ),
    CONSTRAINT tenant_relationship_activation_chk
        CHECK (
            (status = 'pending' AND activated_at IS NULL)
            OR (
                status IN ('active', 'suspended')
                AND activated_at IS NOT NULL
                AND effective_from IS NOT NULL
            )
            OR status = 'revoked'
        ),
    CONSTRAINT tenant_relationship_activated_after_create_chk
        CHECK (activated_at IS NULL OR activated_at >= created_at),
    CONSTRAINT tenant_relationship_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tenant_relationship_status_chk
        CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
    CONSTRAINT tenant_relationship_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT tenant_relationship_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.tenant_relationship IS
  'Directed plane-local tenant relationship anchor. It never grants membership, permissions, delegation, or Mesh trading-network access.';

COMMENT ON COLUMN master.tenant_relationship.relationship_type IS
  'Controlled platform relationship meaning. from_tenant_id and to_tenant_id already encode direction.';

COMMENT ON COLUMN master.tenant_relationship.metadata IS
  'Non-authoritative descriptive metadata only. Authorization scopes and secrets are prohibited.';

CREATE TABLE master.workspace (
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

    CONSTRAINT workspace_pkey PRIMARY KEY (id),
    CONSTRAINT workspace_code_uq UNIQUE (code),
    CONSTRAINT workspace_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT workspace_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT workspace_icon_key_chk
        CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT workspace_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT workspace_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT workspace_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.workspace IS
  'Plane-local workspace catalog. A workspace groups the modules available in one application plane.';

CREATE TABLE master.module (
    id                uuid                NOT NULL DEFAULT shared.uuidv7(),
    code              text                NOT NULL,
    name              text                NOT NULL,
    description       text,
    icon_key          text,
    workspace_id      uuid                NOT NULL,
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

    CONSTRAINT module_pkey PRIMARY KEY (id),
    CONSTRAINT module_code_uq UNIQUE (code),
    CONSTRAINT module_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT module_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT module_icon_key_chk
        CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT module_config_object_chk
        CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT module_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT module_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT module_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.module IS
  'Plane-local module catalog. Every module belongs to exactly one workspace.';

CREATE TABLE master.address (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    address_type        text,
    line1               text,
    line2               text,
    line3               text,
    city                text,
    region              text,
    postal_code         text,
    country_code        character(2),
    latitude            numeric(9,6),
    longitude           numeric(9,6),
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT address_pkey PRIMARY KEY (id),
    CONSTRAINT address_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT address_type_nonempty_chk
        CHECK (address_type IS NULL OR btrim(address_type) <> ''),
    CONSTRAINT address_text_nonempty_chk
        CHECK (
            (line1 IS NULL OR btrim(line1) <> '')
            AND (line2 IS NULL OR btrim(line2) <> '')
            AND (line3 IS NULL OR btrim(line3) <> '')
            AND (city IS NULL OR btrim(city) <> '')
            AND (region IS NULL OR btrim(region) <> '')
            AND (postal_code IS NULL OR btrim(postal_code) <> '')
        ),
    CONSTRAINT address_content_chk
        CHECK (
            status <> 'active'
            OR country_code IS NOT NULL
            OR nullif(btrim(line1), '') IS NOT NULL
            OR nullif(btrim(city), '') IS NOT NULL
            OR nullif(btrim(postal_code), '') IS NOT NULL
        ),
    CONSTRAINT address_country_code_chk
        CHECK (country_code IS NULL OR country_code::text ~ '^[A-Z]{2}$'),
    CONSTRAINT address_latitude_chk
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT address_longitude_chk
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT address_coordinates_pair_chk
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT address_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT address_status_chk
        CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT address_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT address_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.address IS
  'Plane-local canonical postal or physical address. Ownership and usage purpose are represented by master.address_link.';

CREATE TABLE master.address_link (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    owner_type_id       uuid        NOT NULL,
    owner_id            uuid        NOT NULL,
    address_id          uuid        NOT NULL,
    purpose             text        NOT NULL DEFAULT 'default',
    role_qualifier      text,
    attention_line      text,
    is_primary          boolean     NOT NULL DEFAULT false,
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT address_link_pkey PRIMARY KEY (id),
    CONSTRAINT address_link_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT address_link_purpose_fmt_chk
        CHECK (purpose ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT address_link_role_qualifier_chk
        CHECK (role_qualifier IS NULL OR btrim(role_qualifier) <> ''),
    CONSTRAINT address_link_attention_line_chk
        CHECK (attention_line IS NULL OR btrim(attention_line) <> ''),
    CONSTRAINT address_link_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT address_link_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT address_link_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.address_link IS
  'Tenant-safe polymorphic owner-to-address link with purpose, addressee, and temporal primary selection.';

CREATE TABLE master.contact_link (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    owner_type_id       uuid        NOT NULL,
    owner_id            uuid        NOT NULL,
    channel_type        text        NOT NULL,
    value               text        NOT NULL,
    purpose             text        NOT NULL DEFAULT 'default',
    role_qualifier      text,
    is_primary          boolean     NOT NULL DEFAULT false,
    is_verified         boolean     NOT NULL DEFAULT false,
    verified_at         timestamptz,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT contact_link_pkey PRIMARY KEY (id),
    CONSTRAINT contact_link_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT contact_link_channel_type_chk
        CHECK (channel_type IN (
            'email', 'phone', 'fax', 'sms', 'whatsapp', 'website'
        )),
    CONSTRAINT contact_link_value_nonempty_chk CHECK (btrim(value) <> ''),
    CONSTRAINT contact_link_purpose_fmt_chk
        CHECK (purpose ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT contact_link_role_qualifier_chk
        CHECK (role_qualifier IS NULL OR btrim(role_qualifier) <> ''),
    CONSTRAINT contact_link_verification_chk
        CHECK (
            (is_verified AND verified_at IS NOT NULL)
            OR (NOT is_verified AND verified_at IS NULL)
        ),
    CONSTRAINT contact_link_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT contact_link_status_chk
        CHECK (status IN ('active', 'inactive', 'deprecated')),
    CONSTRAINT contact_link_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT contact_link_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.contact_link IS
  'Canonical owner contact channel. value is the only writable email, phone, messaging, or website value.';

CREATE TABLE master.contact_email (
    contact_link_id     uuid        NOT NULL,
    tenant_id           uuid        NOT NULL,
    is_disposable       boolean     NOT NULL DEFAULT false,
    mx_checked_at       timestamptz,
    mx_valid            boolean,
    bounce_count        integer     NOT NULL DEFAULT 0,
    last_bounce_at      timestamptz,
    last_bounce_reason  text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT contact_email_pkey PRIMARY KEY (contact_link_id),
    CONSTRAINT contact_email_bounce_count_chk CHECK (bounce_count >= 0),
    CONSTRAINT contact_email_bounce_reason_chk
        CHECK (
            last_bounce_reason IS NULL
            OR last_bounce_reason IN ('hard', 'soft', 'complaint')
        ),
    CONSTRAINT contact_email_mx_evidence_chk
        CHECK (mx_valid IS NULL OR mx_checked_at IS NOT NULL),
    CONSTRAINT contact_email_bounce_evidence_chk
        CHECK (
            (
                bounce_count = 0
                AND last_bounce_at IS NULL
                AND last_bounce_reason IS NULL
            )
            OR (
                bounce_count > 0
                AND last_bounce_at IS NOT NULL
                AND last_bounce_reason IS NOT NULL
            )
        ),
    CONSTRAINT contact_email_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT contact_email_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.contact_email IS
  'One-to-one email quality and deliverability summary for an email contact_link; the email value remains in contact_link.';

CREATE TABLE master.contact_phone (
    contact_link_id uuid        NOT NULL,
    tenant_id       uuid        NOT NULL,
    carrier_hint    text,
    line_type       text,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT contact_phone_pkey PRIMARY KEY (contact_link_id),
    CONSTRAINT contact_phone_line_type_chk
        CHECK (
            line_type IS NULL
            OR line_type IN ('mobile', 'landline', 'voip', 'unknown')
        ),
    CONSTRAINT contact_phone_carrier_hint_chk
        CHECK (carrier_hint IS NULL OR btrim(carrier_hint) <> ''),
    CONSTRAINT contact_phone_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT contact_phone_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.contact_phone IS
  'One-to-one phone enrichment for a phone-family contact_link; canonical E.164 remains in contact_link.value.';

-- ============================================================================
-- Principal foundation
-- ============================================================================

CREATE TABLE master.principal (
    id                    uuid                                    NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                    NOT NULL,
    code                  text                                    NOT NULL,
    name                  text                                    NOT NULL,
    principal_type        master.principal_type_d                 NOT NULL,
    auth_epoch            integer                                 NOT NULL DEFAULT 0,
    external_ref          text,
    provisioning_source   master.principal_provisioning_source_d NOT NULL DEFAULT 'internal',
    metadata              jsonb                                   NOT NULL DEFAULT '{}'::jsonb,
    status                master.principal_status_d               NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                             NOT NULL DEFAULT now(),
    created_by            uuid                                    NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT principal_pkey PRIMARY KEY (id),
    CONSTRAINT principal_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT principal_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT principal_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_.@-]{1,126}$'),
    CONSTRAINT principal_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 256),
    CONSTRAINT principal_auth_epoch_chk CHECK (auth_epoch >= 0),
    CONSTRAINT principal_external_ref_chk
        CHECK (
            external_ref IS NULL
            OR (btrim(external_ref) <> '' AND length(external_ref) <= 512)
        ),
    CONSTRAINT principal_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT principal_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT principal_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.principal IS
  'Tenant-local provider-neutral application actor. Authentication identities are mapped by master.principal_identity_binding.';

COMMENT ON COLUMN master.principal.auth_epoch IS
  'Monotonic authorization/session-cache revision. Updates may only increment it by one.';

COMMENT ON COLUMN master.principal.external_ref IS
  'Optional opaque upstream business correlation key; never an IAM subject identifier.';

CREATE TABLE master.principal_profile (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    principal_id      uuid        NOT NULL,
    given_name        text,
    family_name       text,
    preferred_name    text,
    display_name      text,
    avatar_url        text,
    attributes        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT principal_profile_pkey PRIMARY KEY (id),
    CONSTRAINT principal_profile_tenant_principal_uq
        UNIQUE (tenant_id, principal_id),
    CONSTRAINT principal_profile_name_fields_chk
        CHECK (
            (given_name IS NULL OR (btrim(given_name) <> '' AND length(given_name) <= 128))
            AND (family_name IS NULL OR (btrim(family_name) <> '' AND length(family_name) <= 128))
            AND (preferred_name IS NULL OR (btrim(preferred_name) <> '' AND length(preferred_name) <= 128))
            AND (display_name IS NULL OR (btrim(display_name) <> '' AND length(display_name) <= 256))
        ),
    CONSTRAINT principal_profile_avatar_url_chk
        CHECK (
            avatar_url IS NULL
            OR (
                btrim(avatar_url) <> ''
                AND length(avatar_url) <= 2048
                AND avatar_url ~ '^(https?://|asset:)'
            )
        ),
    CONSTRAINT principal_profile_attributes_object_chk
        CHECK (jsonb_typeof(attributes) = 'object'),
    CONSTRAINT principal_profile_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT principal_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.principal_profile IS
  'One-to-one application-facing display profile. It contains no IAM shadow, employee, ERP, or UI-default fields.';

CREATE TABLE master.principal_identity_binding (
    id                    uuid                             NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                             NOT NULL,
    principal_id          uuid                             NOT NULL,
    provider_code         master.identity_provider_d       NOT NULL DEFAULT 'keycloak',
    realm_key             text                             NOT NULL,
    subject_id            text                             NOT NULL,
    issuer                text,
    audience              text,
    username              text,
    service_client_id     text,
    is_primary            boolean                          NOT NULL DEFAULT true,
    status                master.identity_binding_status_d NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    last_verified_at      timestamptz,
    synced_at             timestamptz,
    sync_status           shared.idp_sync_status_d         NOT NULL DEFAULT 'pending',
    sync_error_message    text,
    sync_retry_count      integer                          NOT NULL DEFAULT 0,
    provider_attributes   jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    metadata              jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                      NOT NULL DEFAULT now(),
    created_by            uuid                             NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT principal_identity_binding_pkey PRIMARY KEY (id),
    CONSTRAINT principal_identity_binding_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT principal_identity_binding_subject_uq
        UNIQUE (tenant_id, provider_code, realm_key, subject_id),
    CONSTRAINT principal_identity_binding_realm_chk
        CHECK (realm_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT principal_identity_binding_subject_chk
        CHECK (btrim(subject_id) <> '' AND length(subject_id) <= 512),
    CONSTRAINT principal_identity_binding_optional_text_chk
        CHECK (
            (issuer IS NULL OR (btrim(issuer) <> '' AND length(issuer) <= 2048))
            AND (audience IS NULL OR (btrim(audience) <> '' AND length(audience) <= 512))
            AND (username IS NULL OR (btrim(username) <> '' AND length(username) <= 320))
            AND (
                service_client_id IS NULL
                OR (btrim(service_client_id) <> '' AND length(service_client_id) <= 255)
            )
        ),
    CONSTRAINT principal_identity_binding_service_type_chk
        CHECK (
            service_client_id IS NULL
            OR provider_code = 'keycloak'
        ),
    CONSTRAINT principal_identity_binding_primary_active_chk
        CHECK (NOT is_primary OR status = 'active'),
    CONSTRAINT principal_identity_binding_sync_retry_chk
        CHECK (sync_retry_count >= 0),
    CONSTRAINT principal_identity_binding_sync_error_chk
        CHECK (
            (sync_status = 'error' AND sync_error_message IS NOT NULL)
            OR (sync_status <> 'error' AND sync_error_message IS NULL)
        ),
    CONSTRAINT principal_identity_binding_sync_evidence_chk
        CHECK (sync_status <> 'synced' OR synced_at IS NOT NULL),
    CONSTRAINT principal_identity_binding_provider_attributes_object_chk
        CHECK (jsonb_typeof(provider_attributes) = 'object'),
    CONSTRAINT principal_identity_binding_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT principal_identity_binding_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT principal_identity_binding_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.principal_identity_binding IS
  'Canonical external-IAM-to-application-principal mapping. Keycloak or another trusted provider remains authoritative for authentication state.';

COMMENT ON COLUMN master.principal_identity_binding.subject_id IS
  'Opaque provider subject, normally the validated JWT sub claim. It is case-sensitive and must not be rewritten.';

COMMENT ON COLUMN master.principal_identity_binding.provider_attributes IS
  'Restricted minimal provider extensions required by IAM adapters; never a full user snapshot or credential store.';

CREATE TABLE master.principal_ui_profile (
    id                uuid                        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid                        NOT NULL,
    principal_id      uuid                        NOT NULL,
    locale_code       text,
    language_code     text,
    timezone_code     text,
    date_format       text,
    number_format     text,
    week_start        smallint,
    appearance_mode   master.ui_appearance_mode_d,
    density_code      master.ui_density_d,
    metadata          jsonb                       NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz                 NOT NULL DEFAULT now(),
    created_by        uuid                        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT principal_ui_profile_pkey PRIMARY KEY (id),
    CONSTRAINT principal_ui_profile_tenant_principal_uq
        UNIQUE (tenant_id, principal_id),
    CONSTRAINT principal_ui_profile_date_format_chk
        CHECK (
            date_format IS NULL
            OR (btrim(date_format) <> '' AND length(date_format) <= 64)
        ),
    CONSTRAINT principal_ui_profile_number_format_chk
        CHECK (
            number_format IS NULL
            OR (btrim(number_format) <> '' AND length(number_format) <= 64)
        ),
    CONSTRAINT principal_ui_profile_week_start_chk
        CHECK (week_start IS NULL OR week_start BETWEEN 0 AND 6),
    CONSTRAINT principal_ui_profile_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT principal_ui_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.principal_ui_profile IS
  'One-to-one typed UI defaults. NULL means inherit the tenant or platform default.';

CREATE TABLE master.principal_ui_preference (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    principal_id      uuid        NOT NULL,
    preference_code   text        NOT NULL,
    surface_code      text,
    preference_value  jsonb       NOT NULL,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT principal_ui_preference_pkey PRIMARY KEY (id),
    CONSTRAINT principal_ui_preference_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT principal_ui_preference_code_fmt_chk
        CHECK (preference_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT principal_ui_preference_surface_fmt_chk
        CHECK (
            surface_code IS NULL
            OR surface_code ~ '^[a-z][a-z0-9_.-]{1,126}$'
        ),
    CONSTRAINT principal_ui_preference_value_size_chk
        CHECK (pg_column_size(preference_value) <= 8192),
    CONSTRAINT principal_ui_preference_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT principal_ui_preference_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.principal_ui_preference IS
  'Small registered UI override. It must not store saved views, layouts, recents, history, documents, or other large payloads.';

CREATE TABLE master.principal_notification_preference (
    id                  uuid                                   NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                                   NOT NULL,
    principal_id        uuid                                   NOT NULL,
    event_code          text                                   NOT NULL,
    channel             master.notification_channel_d          NOT NULL,
    is_enabled          boolean,
    frequency_code      master.notification_digest_frequency_d,
    metadata            jsonb                                  NOT NULL DEFAULT '{}'::jsonb,
    status              shared.ref_status_d                    NOT NULL DEFAULT 'active',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                            NOT NULL DEFAULT now(),
    created_by          uuid                                   NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT principal_notification_preference_pkey PRIMARY KEY (id),
    CONSTRAINT principal_notification_preference_tenant_id_uq
        UNIQUE (tenant_id, id),
    CONSTRAINT principal_notification_preference_event_fmt_chk
        CHECK (event_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT principal_notification_preference_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT principal_notification_preference_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT principal_notification_preference_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.principal_notification_preference IS
  'Principal-specific notification routing override. NULL is_enabled inherits the routing default; NULL frequency_code means immediate/default.';

CREATE TABLE master.saved_view (
    id                  uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                              NOT NULL,
    owner_principal_id  uuid,
    scope               master.saved_view_scope_d         NOT NULL DEFAULT 'personal',
    surface_code        text                              NOT NULL,
    entity_code         text                              NOT NULL,
    code                text                              NOT NULL,
    name                text                              NOT NULL,
    description         text,
    state_json          jsonb                             NOT NULL,
    metadata            jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status              shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                       NOT NULL DEFAULT now(),
    created_by          uuid                              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT saved_view_pkey PRIMARY KEY (id),
    CONSTRAINT saved_view_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT saved_view_scope_owner_chk
        CHECK (
            (scope = 'personal' AND owner_principal_id IS NOT NULL)
            OR (scope IN ('shared', 'system') AND owner_principal_id IS NULL)
        ),
    CONSTRAINT saved_view_surface_code_fmt_chk
        CHECK (surface_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT saved_view_entity_code_fmt_chk
        CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT saved_view_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT saved_view_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 160),
    CONSTRAINT saved_view_description_chk
        CHECK (
            description IS NULL
            OR (btrim(description) <> '' AND length(description) <= 2048)
        ),
    CONSTRAINT saved_view_state_object_chk
        CHECK (jsonb_typeof(state_json) = 'object'),
    CONSTRAINT saved_view_state_size_chk
        CHECK (pg_column_size(state_json) <= 262144),
    CONSTRAINT saved_view_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT saved_view_metadata_size_chk
        CHECK (pg_column_size(metadata) <= 8192),
    CONSTRAINT saved_view_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT saved_view_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.saved_view IS
  'Plane-local named UI state for one entity surface. Filters, sort, columns, density, grouping, and viewMode live only in state_json.';

COMMENT ON COLUMN master.saved_view.scope IS
  'Personal rows are principal-owned; shared rows are tenant-visible; system rows are seed-managed and application read-only.';

COMMENT ON COLUMN master.saved_view.state_json IS
  'Canonical versioned EntityListQueryState payload. Plane, target, pin/default flags, hashes, and a separate view-kind discriminator are intentionally absent.';

CREATE TABLE master.record_bookmark (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    principal_id    uuid        NOT NULL,
    entity_code     text        NOT NULL,
    record_id       uuid        NOT NULL,
    label_snapshot  text,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT record_bookmark_pkey PRIMARY KEY (id),
    CONSTRAINT record_bookmark_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT record_bookmark_natural_uq
        UNIQUE (tenant_id, principal_id, entity_code, record_id),
    CONSTRAINT record_bookmark_entity_code_fmt_chk
        CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT record_bookmark_label_snapshot_chk
        CHECK (
            label_snapshot IS NULL
            OR (btrim(label_snapshot) <> '' AND length(label_snapshot) <= 240)
        )
);

COMMENT ON TABLE master.record_bookmark IS
  'Immutable principal-owned bookmark for a plane-local entity record. Rows are removed and recreated rather than updated.';

COMMENT ON COLUMN master.record_bookmark.label_snapshot IS
  'Optional display fallback captured when the bookmark is created; it is not an authoritative record name.';

CREATE TABLE master.external_reference (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    owner_type_id           uuid        NOT NULL,
    owner_id                uuid        NOT NULL,
    source_system_code      text        NOT NULL,
    external_entity_code    text        NOT NULL,
    external_id             text        NOT NULL,
    external_code           text,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT external_reference_pkey PRIMARY KEY (id),
    CONSTRAINT external_reference_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_reference_source_system_fmt_chk
        CHECK (source_system_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT external_reference_external_entity_fmt_chk
        CHECK (external_entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT external_reference_external_id_chk
        CHECK (btrim(external_id) <> '' AND length(external_id) <= 512),
    CONSTRAINT external_reference_external_code_chk
        CHECK (
            external_code IS NULL
            OR (btrim(external_code) <> '' AND length(external_code) <= 256)
        ),
    CONSTRAINT external_reference_metadata_chk
        CHECK (
            jsonb_typeof(metadata) = 'object'
            AND pg_column_size(metadata) <= 16384
        ),
    CONSTRAINT external_reference_status_chk
        CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT external_reference_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT external_reference_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.external_reference IS
  'Tenant-safe mapping from a plane-owned record to an identifier in an external system. It supports synchronization and reconciliation; it does not store a copy of the external business object.';

COMMENT ON COLUMN master.external_reference.external_entity_code IS
  'External-system entity namespace, such as worker, supplier, customer, or product. It prevents identifier collisions between entity types in one source system.';

COMMENT ON COLUMN master.external_reference.metadata IS
  'Small integration metadata only. External business payloads belong in integration/event storage.';

CREATE TABLE master.team (
    id                  uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                              NOT NULL,
    code                text                              NOT NULL,
    name                text                              NOT NULL,
    description         text,
    team_type           text                              NOT NULL DEFAULT 'functional',
    effective_from      date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    metadata            jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status              shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                       NOT NULL DEFAULT now(),
    created_by          uuid                              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT team_pkey PRIMARY KEY (id),
    CONSTRAINT team_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT team_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT team_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 160),
    CONSTRAINT team_description_chk
        CHECK (description IS NULL OR length(description) <= 2000),
    CONSTRAINT team_type_chk
        CHECK (team_type IN ('functional', 'project', 'virtual')),
    CONSTRAINT team_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT team_metadata_chk
        CHECK (
            jsonb_typeof(metadata) = 'object'
            AND pg_column_size(metadata) <= 8192
        ),
    CONSTRAINT team_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT team_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.team IS
  'Tenant-owned operational collaboration and work-assignment unit. Teams do not grant authorization roles; authz.principal_group remains the authorization grouping model.';

CREATE TABLE master.team_member (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    team_id         uuid        NOT NULL,
    principal_id    uuid        NOT NULL,
    role_code       text        NOT NULL DEFAULT 'member',
    joined_at       timestamptz NOT NULL DEFAULT now(),
    left_at         timestamptz,
    left_by         uuid,
    leave_reason    text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT team_member_pkey PRIMARY KEY (id),
    CONSTRAINT team_member_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT team_member_role_fmt_chk
        CHECK (role_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT team_member_effective_range_chk
        CHECK (left_at IS NULL OR left_at > joined_at),
    CONSTRAINT team_member_exit_actor_pair_chk
        CHECK ((left_at IS NULL) = (left_by IS NULL)),
    CONSTRAINT team_member_exit_reason_chk
        CHECK (
            leave_reason IS NULL
            OR (
                left_at IS NOT NULL
                AND btrim(leave_reason) <> ''
                AND length(leave_reason) <= 1000
            )
        )
);

COMMENT ON TABLE master.team_member IS
  'Interval-based operational team membership. Identity, role, join time, and creation evidence are immutable; ending a membership records left_at and left_by once.';

CREATE TABLE master.brand_profile (
    id                  uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                              NOT NULL,
    code                text                              NOT NULL,
    name                text                              NOT NULL,
    palette             jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    typography          jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    is_default          boolean                           NOT NULL DEFAULT false,
    metadata            jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status              shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                       NOT NULL DEFAULT now(),
    created_by          uuid                              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT brand_profile_pkey PRIMARY KEY (id),
    CONSTRAINT brand_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT brand_profile_code_fmt_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT brand_profile_name_chk CHECK (btrim(name) <> '' AND length(name) <= 160),
    CONSTRAINT brand_profile_palette_chk
        CHECK (jsonb_typeof(palette) = 'object' AND pg_column_size(palette) <= 32768),
    CONSTRAINT brand_profile_typography_chk
        CHECK (jsonb_typeof(typography) = 'object' AND pg_column_size(typography) <= 32768),
    CONSTRAINT brand_profile_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
    CONSTRAINT brand_profile_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT brand_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.letterhead (
    id                  uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                              NOT NULL,
    code                text                              NOT NULL,
    name                text                              NOT NULL,
    logo_asset_ref      text,
    header_html         text,
    footer_html         text,
    watermark_text      text,
    watermark_opacity   numeric(3,2)                      NOT NULL DEFAULT 0.15,
    is_default          boolean                           NOT NULL DEFAULT false,
    metadata            jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status              shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                       NOT NULL DEFAULT now(),
    created_by          uuid                              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT letterhead_pkey PRIMARY KEY (id),
    CONSTRAINT letterhead_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT letterhead_code_fmt_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT letterhead_name_chk CHECK (btrim(name) <> '' AND length(name) <= 160),
    CONSTRAINT letterhead_content_chk
        CHECK (
            header_html IS NOT NULL OR footer_html IS NOT NULL
            OR logo_asset_ref IS NOT NULL OR watermark_text IS NOT NULL
        ),
    CONSTRAINT letterhead_logo_ref_chk
        CHECK (logo_asset_ref IS NULL OR (btrim(logo_asset_ref) <> '' AND length(logo_asset_ref) <= 1024)),
    CONSTRAINT letterhead_watermark_chk
        CHECK (
            watermark_opacity BETWEEN 0 AND 1
            AND (watermark_text IS NULL OR length(watermark_text) <= 240)
        ),
    CONSTRAINT letterhead_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
    CONSTRAINT letterhead_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT letterhead_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.print_profile (
    id                  uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                              NOT NULL,
    code                text                              NOT NULL,
    name                text                              NOT NULL,
    paper_size          master.print_paper_size_d         NOT NULL DEFAULT 'A4',
    orientation         master.print_orientation_d        NOT NULL DEFAULT 'portrait',
    margins             master.print_margin_d             NOT NULL DEFAULT 'normal',
    header_footer       boolean                           NOT NULL DEFAULT true,
    background_graphics boolean                           NOT NULL DEFAULT true,
    is_default          boolean                           NOT NULL DEFAULT false,
    metadata            jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status              shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                       NOT NULL DEFAULT now(),
    created_by          uuid                              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT print_profile_pkey PRIMARY KEY (id),
    CONSTRAINT print_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT print_profile_code_fmt_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT print_profile_name_chk CHECK (btrim(name) <> '' AND length(name) <= 160),
    CONSTRAINT print_profile_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
    CONSTRAINT print_profile_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT print_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.template (
    id                      uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid                     NOT NULL,
    code                    text                     NOT NULL,
    name                    text                     NOT NULL,
    kind                    text                     NOT NULL,
    engine                  master.template_engine_d NOT NULL DEFAULT 'handlebars',
    current_version_id      uuid,
    is_rtl_supported        boolean                  NOT NULL DEFAULT false,
    is_letterhead_required  boolean                  NOT NULL DEFAULT false,
    metadata                jsonb                    NOT NULL DEFAULT '{}'::jsonb,
    status                  master.template_status_d NOT NULL DEFAULT 'draft',
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz              NOT NULL DEFAULT now(),
    created_by              uuid                     NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT template_pkey PRIMARY KEY (id),
    CONSTRAINT template_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT template_code_fmt_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT template_kind_fmt_chk CHECK (kind ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT template_name_chk CHECK (btrim(name) <> '' AND length(name) <= 160),
    CONSTRAINT template_published_version_chk
        CHECK (status <> 'published' OR current_version_id IS NOT NULL),
    CONSTRAINT template_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
    CONSTRAINT template_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT template_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.template_binding (
    id                  uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                              NOT NULL,
    template_id         uuid                              NOT NULL,
    entity_code         text                              NOT NULL,
    operation_code      text                              NOT NULL,
    variant_code        text                              NOT NULL DEFAULT 'default',
    locale_code         text                              NOT NULL DEFAULT 'en',
    brand_profile_id    uuid,
    letterhead_id       uuid,
    print_profile_id    uuid,
    metadata            jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status              shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                       NOT NULL DEFAULT now(),
    created_by          uuid                              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT template_binding_pkey PRIMARY KEY (id),
    CONSTRAINT template_binding_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT template_binding_entity_fmt_chk CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT template_binding_operation_fmt_chk CHECK (operation_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT template_binding_variant_fmt_chk CHECK (variant_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT template_binding_locale_fmt_chk CHECK (locale_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
    CONSTRAINT template_binding_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
    CONSTRAINT template_binding_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT template_binding_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);
