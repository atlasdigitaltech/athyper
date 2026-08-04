-- Plane-local workspace and module catalog.
-- The same desired-state definition is used by Athyper, Neon, and Mesh.

CREATE TABLE master.tenant (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    code                  text        NOT NULL,
    name                  text        NOT NULL,
    display_name          text        NOT NULL,
    realm_key             text        NOT NULL,
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
  'Plane-local tenant root and RLS authority. Keycloak organization alias equals tenant id; authentication configuration remains in Keycloak.';

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

-- ============================================================================
-- Neon organization foundation
-- ============================================================================

CREATE TABLE master.legal_entity (
    id                    uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                         NOT NULL,
    code                  text                         NOT NULL,
    name                  text                         NOT NULL,
    display_name          text,
    legal_name            text                         NOT NULL,
    entity_type           master.legal_entity_type_d   NOT NULL DEFAULT 'company',
    parent_legal_entity_id uuid,
    registration_number   text,
    registration_country_code character(2),
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
  'Neon statutory organization. Keycloak organizations remain tenant-level and never map to this table.';

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
    domain                master.operating_organization_domain_d NOT NULL,
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
    organization_type        text                  NOT NULL,
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
    CONSTRAINT procurement_organization_profile_type_chk
        CHECK (btrim(organization_type) <> ''),
    CONSTRAINT procurement_organization_profile_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT procurement_organization_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.sales_organization_profile (
    tenant_id                uuid                   NOT NULL,
    operating_organization_id uuid                  NOT NULL,
    organization_type        text                   NOT NULL,
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
    CONSTRAINT sales_organization_profile_type_chk
        CHECK (btrim(organization_type) <> ''),
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
        CHECK (btrim(participation_role) <> ''),
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

CREATE TABLE master.bank_party (
    id                    uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                           NOT NULL,
    code                  text                           NOT NULL,
    name                  text                           NOT NULL,
    country_code          character(2)                   NOT NULL,
    institution_type      master.bank_institution_type_d NOT NULL DEFAULT 'bank',
    bic                   text,
    national_bank_code_type text,
    national_bank_code    text,
    branch_code           text,
    branch_name           text,
    supports_swift        boolean                        NOT NULL DEFAULT false,
    supports_local_clearing boolean                      NOT NULL DEFAULT false,
    supports_sepa         boolean                        NOT NULL DEFAULT false,
    supports_ach          boolean                        NOT NULL DEFAULT false,
    metadata              jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                master.finance_setup_status_d  NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                    NOT NULL DEFAULT now(),
    created_by            uuid                           NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT bank_party_pkey PRIMARY KEY (id),
    CONSTRAINT bank_party_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_party_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT bank_party_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT bank_party_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT bank_party_country_chk CHECK (country_code::text ~ '^[A-Z]{2}$'),
    CONSTRAINT bank_party_bic_chk
        CHECK (bic IS NULL OR bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
    CONSTRAINT bank_party_national_code_pair_chk CHECK (
        (national_bank_code_type IS NULL) = (national_bank_code IS NULL)
    ),
    CONSTRAINT bank_party_branch_chk CHECK (
        branch_code IS NULL OR btrim(branch_code) <> ''
    ),
    CONSTRAINT bank_party_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bank_party_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bank_party_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.bank_account (
    id                    uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                           NOT NULL,
    code                  text,
    name                  text,
    bank_party_id         uuid,
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
    correspondent_bank_party_id uuid,
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
    CONSTRAINT bank_account_last4_chk
        CHECK (account_last4 ~ '^[A-Z0-9]{4}$'
               AND account_last4 = right(account_id_value, 4)),
    CONSTRAINT bank_account_currency_chk CHECK (currency_code::text ~ '^[A-Z]{3}$'),
    CONSTRAINT bank_account_bank_identity_chk CHECK (
        (
            bank_party_id IS NOT NULL
            AND bank_name_override IS NULL
            AND bank_country_override IS NULL
        )
        OR (
            bank_party_id IS NULL
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
            correspondent_bank_party_id IS NULL
            OR correspondent_bank_party_id IS DISTINCT FROM bank_party_id
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
  'Sensitive normalized account identifier. Application roles receive no direct SELECT grant; use masked views or an audited reveal command.';

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
    code                       text                             NOT NULL,
    name                       text                             NOT NULL,
    display_name               text,
    legal_name                 text,
    partner_category           master.business_partner_category_d NOT NULL DEFAULT 'organization',
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
    CONSTRAINT business_partner_name_nonempty_chk
        CHECK (btrim(name) <> '' AND length(name) <= 240),
    CONSTRAINT business_partner_display_name_chk
        CHECK (
            display_name IS NULL
            OR (btrim(display_name) <> '' AND length(display_name) <= 240)
        ),
    CONSTRAINT business_partner_legal_name_chk
        CHECK (
            legal_name IS NULL
            OR (btrim(legal_name) <> '' AND length(legal_name) <= 320)
        ),
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
                AND website_url ~* '^https?://'
            )
        ),
    CONSTRAINT business_partner_parent_not_self_chk
        CHECK (parent_business_partner_id IS DISTINCT FROM id),
    CONSTRAINT business_partner_description_chk
        CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT business_partner_aliases_chk
        CHECK (cardinality(aliases) <= 50),
    CONSTRAINT business_partner_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.business_partner IS
  'Neon canonical commercial counterparty identity. Supplier and customer are optional thin roles; registration identifiers, tax profiles, addresses, contacts, and banking remain capability-owned.';
COMMENT ON COLUMN master.business_partner.display_name IS
  'Optional canonical UI label for this identity. Supplier and customer do not carry role-level display-name duplicates.';
COMMENT ON COLUMN master.business_partner.partner_category IS
  'Stable semantic class. Internal identifies a tenant-owned or intercompany counterparty; supplier/customer are roles, not categories.';
COMMENT ON COLUMN master.business_partner.aliases IS
  'Alternate legal or trading names used for search and duplicate detection. It is not a tag or classification array.';
COMMENT ON COLUMN master.business_partner.metadata IS
  'Non-authoritative integration metadata only; legal identifiers, tax facts, permissions, and workflow state are prohibited.';

CREATE TABLE master.supplier (
    id                  uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                     NOT NULL,
    business_partner_id uuid                     NOT NULL,
    supplier_code       text                     NOT NULL,
    supplier_type       master.supplier_type_d   NOT NULL DEFAULT 'general',
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
    CONSTRAINT supplier_business_partner_uq
        UNIQUE (tenant_id, business_partner_id),
    CONSTRAINT supplier_code_fmt_chk
        CHECK (supplier_code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT supplier_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT supplier_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT supplier_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.supplier IS
  'Thin Neon procurement/AP role of one business partner. Identity, legal name, addresses, contacts, identifiers and canonical bank ownership resolve through business_partner_id.';
COMMENT ON COLUMN master.supplier.metadata IS
  'Non-authoritative integration metadata only. Payment configuration, readiness, qualification, risk, block state, and commodity assignments are prohibited.';

CREATE TABLE master.customer (
    id                  uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                     NOT NULL,
    business_partner_id uuid                     NOT NULL,
    customer_code       text                     NOT NULL,
    customer_type       master.customer_type_d   NOT NULL DEFAULT 'corporate',
    is_key_account      boolean                  NOT NULL DEFAULT false,
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
    CONSTRAINT customer_business_partner_uq
        UNIQUE (tenant_id, business_partner_id),
    CONSTRAINT customer_code_fmt_chk
        CHECK (customer_code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT customer_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT customer_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT customer_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.customer IS
  'Thin Neon sales/AR role of one business partner. Identity and legal facts resolve through business_partner_id; company-specific credit and payment configuration remain outside this role.';
COMMENT ON COLUMN master.customer.is_key_account IS
  'Tenant-wide strategic-account designation. Company-specific credit or collection priority does not belong here.';
COMMENT ON COLUMN master.customer.metadata IS
  'Non-authoritative integration metadata only. Credit rating, qualification, block state, payment behavior, and ledger analytics are prohibited.';

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
