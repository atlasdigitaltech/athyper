-- Mesh-owned participant profile and bank foundation.
-- Cross-plane publication/projection/onboarding is intentionally parked.

CREATE TABLE mesh.network_account_profile (
    id                       uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                          NOT NULL,
    network_account_id       uuid                          NOT NULL,
    legal_form               text,
    incorporation_date       date,
    website_url              text,
    description              text,
    preferred_language_code  text,
    profile_completeness_pct smallint                      NOT NULL DEFAULT 0,
    metadata                 jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status                   mesh.network_profile_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                   NOT NULL DEFAULT now(),
    created_by               uuid                          NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT network_account_profile_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT network_account_profile_account_uq UNIQUE (tenant_id, network_account_id),
    CONSTRAINT network_account_profile_legal_form_chk
        CHECK (legal_form IS NULL OR btrim(legal_form) <> ''),
    CONSTRAINT network_account_profile_website_chk
        CHECK (website_url IS NULL OR (
            length(website_url) <= 2048 AND website_url ~* '^https?://'
        )),
    CONSTRAINT network_account_profile_description_chk
        CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT network_account_profile_language_chk
        CHECK (preferred_language_code IS NULL OR
               preferred_language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
    CONSTRAINT network_account_profile_completeness_chk
        CHECK (profile_completeness_pct BETWEEN 0 AND 100),
    CONSTRAINT network_account_profile_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 16384),
    CONSTRAINT network_account_profile_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_account_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.network_account_commodity_capability (
    id                  uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                         NOT NULL,
    network_account_id  uuid                         NOT NULL,
    commodity_code_id   uuid                         NOT NULL,
    trade_role          mesh.trade_role_d            NOT NULL,
    effective_from      date                         NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    notes               text,
    metadata            jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status              mesh.profile_record_status_d NOT NULL DEFAULT 'active',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                  NOT NULL DEFAULT now(),
    created_by          uuid                         NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT network_account_commodity_capability_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_commodity_capability_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT network_account_commodity_capability_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT network_account_commodity_capability_notes_chk
        CHECK (notes IS NULL OR length(notes) <= 2000),
    CONSTRAINT network_account_commodity_capability_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT network_account_commodity_capability_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_account_commodity_capability_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.network_account_tax_registration (
    id                     uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                         NOT NULL,
    network_account_id     uuid                         NOT NULL,
    country_code           character(2)                 NOT NULL,
    registration_type_code text                         NOT NULL,
    registration_number    text                         NOT NULL,
    issuing_authority      text,
    effective_from         date,
    effective_until        date,
    is_primary             boolean                      NOT NULL DEFAULT false,
    verified_at            timestamptz,
    verified_by            uuid,
    metadata               jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                 mesh.profile_record_status_d NOT NULL DEFAULT 'active',
    is_active              boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz                  NOT NULL DEFAULT now(),
    created_by             uuid                         NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT network_account_tax_registration_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_tax_registration_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT network_account_tax_registration_type_chk
        CHECK (registration_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT network_account_tax_registration_number_chk
        CHECK (btrim(registration_number) <> '' AND length(registration_number) <= 128),
    CONSTRAINT network_account_tax_registration_authority_chk
        CHECK (issuing_authority IS NULL OR btrim(issuing_authority) <> ''),
    CONSTRAINT network_account_tax_registration_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until > effective_from),
    CONSTRAINT network_account_tax_registration_verification_pair_chk
        CHECK ((verified_at IS NULL) = (verified_by IS NULL)),
    CONSTRAINT network_account_tax_registration_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT network_account_tax_registration_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_account_tax_registration_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.bank_party (
    id                       uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                         NOT NULL,
    code                     text                         NOT NULL,
    name                     text                         NOT NULL,
    country_code             character(2)                 NOT NULL,
    institution_type         mesh.bank_institution_type_d NOT NULL DEFAULT 'bank',
    bic                      text,
    national_bank_code_type  text,
    national_bank_code       text,
    branch_code              text,
    branch_name              text,
    supports_swift           boolean                      NOT NULL DEFAULT false,
    supports_local_clearing  boolean                      NOT NULL DEFAULT false,
    supports_sepa            boolean                      NOT NULL DEFAULT false,
    supports_ach             boolean                      NOT NULL DEFAULT false,
    metadata                 jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                   mesh.profile_record_status_d NOT NULL DEFAULT 'active',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                  NOT NULL DEFAULT now(),
    created_by               uuid                         NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT mesh_bank_party_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bank_party_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_bank_party_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT mesh_bank_party_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT mesh_bank_party_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_bank_party_bic_chk
        CHECK (bic IS NULL OR bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
    CONSTRAINT mesh_bank_party_national_code_pair_chk
        CHECK ((national_bank_code_type IS NULL) = (national_bank_code IS NULL)),
    CONSTRAINT mesh_bank_party_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_bank_party_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT mesh_bank_party_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.bank_account (
    id                   uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                            NOT NULL,
    network_account_id   uuid                            NOT NULL,
    code                 text,
    name                 text,
    bank_party_id        uuid,
    account_holder_name  text                            NOT NULL,
    account_id_type      mesh.bank_account_id_type_d     NOT NULL,
    account_id_value     text                            NOT NULL,
    account_last4        text                            NOT NULL,
    currency_code        character(3)                    NOT NULL,
    bic_override         text,
    bank_name_override   text,
    bank_country_override character(2),
    provider_account_ref text,
    is_verified          boolean                         NOT NULL DEFAULT false,
    verified_at          timestamptz,
    verified_by          uuid,
    verification_method  mesh.bank_verification_method_d,
    metadata             jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    status               mesh.bank_account_status_d      NOT NULL DEFAULT 'pending_verification',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                     NOT NULL DEFAULT now(),
    created_by           uuid                            NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT mesh_bank_account_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bank_account_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_bank_account_owner_id_uq UNIQUE (tenant_id, network_account_id, id),
    CONSTRAINT mesh_bank_account_code_chk
        CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT mesh_bank_account_name_chk CHECK (name IS NULL OR btrim(name) <> ''),
    CONSTRAINT mesh_bank_account_holder_chk CHECK (btrim(account_holder_name) <> ''),
    CONSTRAINT mesh_bank_account_identifier_chk
        CHECK (account_id_value ~ '^[A-Z0-9]{4,64}$'),
    CONSTRAINT mesh_bank_account_last4_chk
        CHECK (account_last4 ~ '^[A-Z0-9]{4}$'
               AND account_last4 = right(account_id_value, 4)),
    CONSTRAINT mesh_bank_account_bank_identity_chk CHECK (
        (bank_party_id IS NOT NULL
         AND bank_name_override IS NULL AND bank_country_override IS NULL)
        OR
        (bank_party_id IS NULL
         AND nullif(btrim(bank_name_override), '') IS NOT NULL
         AND bank_country_override IS NOT NULL)
    ),
    CONSTRAINT mesh_bank_account_bic_chk
        CHECK (bic_override IS NULL
               OR bic_override ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
    CONSTRAINT mesh_bank_account_verification_chk CHECK (
        (NOT is_verified AND verified_at IS NULL AND verified_by IS NULL
         AND verification_method IS NULL)
        OR
        (is_verified AND verified_at IS NOT NULL AND verified_by IS NOT NULL
         AND verification_method IS NOT NULL)
    ),
    CONSTRAINT mesh_bank_account_active_chk CHECK (status <> 'active' OR is_verified),
    CONSTRAINT mesh_bank_account_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_bank_account_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT mesh_bank_account_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON COLUMN mesh.bank_account.account_id_value IS
  'Sensitive normalized identifier. athyperapp receives no direct SELECT privilege on this column.';

CREATE TABLE mesh.bank_account_link (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL,
    network_account_id uuid        NOT NULL,
    bank_account_id    uuid        NOT NULL,
    purpose            text        NOT NULL DEFAULT 'settlement',
    is_primary         boolean     NOT NULL DEFAULT false,
    effective_from     date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until    date,
    metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT mesh_bank_account_link_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bank_account_link_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_bank_account_link_purpose_chk
        CHECK (purpose IN ('settlement', 'refund')),
    CONSTRAINT mesh_bank_account_link_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT mesh_bank_account_link_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_bank_account_link_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.bank_account_disclosure (
    id                       uuid                          NOT NULL DEFAULT shared.uuidv7(),
    owner_tenant_id          uuid                          NOT NULL,
    owner_account_id         uuid                          NOT NULL,
    bank_account_id          uuid                          NOT NULL,
    network_relationship_id  uuid                          NOT NULL,
    recipient_tenant_id      uuid                          NOT NULL,
    recipient_account_id     uuid                          NOT NULL,
    purpose                  text                          NOT NULL DEFAULT 'settlement',
    disclosed_at             timestamptz                   NOT NULL DEFAULT now(),
    disclosed_by             uuid                          NOT NULL,
    expires_at               timestamptz,
    revoked_at               timestamptz,
    revoked_by               uuid,
    revocation_reason        text,
    metadata                 jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status                   mesh.bank_disclosure_status_d NOT NULL DEFAULT 'active',
    created_at               timestamptz                   NOT NULL DEFAULT now(),
    created_by               uuid                          NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT bank_account_disclosure_pkey PRIMARY KEY (id),
    CONSTRAINT bank_account_disclosure_parties_chk
        CHECK (owner_account_id <> recipient_account_id),
    CONSTRAINT bank_account_disclosure_purpose_chk
        CHECK (purpose IN ('settlement', 'refund')),
    CONSTRAINT bank_account_disclosure_expiry_chk
        CHECK (expires_at IS NULL OR expires_at > disclosed_at),
    CONSTRAINT bank_account_disclosure_revocation_chk CHECK (
        (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
        OR
        (revoked_at IS NOT NULL AND revoked_by IS NOT NULL
         AND nullif(btrim(revocation_reason), '') IS NOT NULL)
    ),
    CONSTRAINT bank_account_disclosure_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 4096),
    CONSTRAINT bank_account_disclosure_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);
