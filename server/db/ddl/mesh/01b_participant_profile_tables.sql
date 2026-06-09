-- ============================================================================
-- mesh/01b_participant_profile_tables.sql
-- Mesh participant profile satellite tables.
-- Depends on: mesh/01_tables.sql, mesh/01a_foundation_tables.sql, shared/01_tables.sql
-- ============================================================================
-- Scope rule:
--   These are Mesh-owned account profile satellites. participant_profile has been
--   merged into network_account (see 09_streamline.sql). party_contact_person,
--   party_contact_role, and party_tax_profile are owned by master.* and removed.
--   Remaining tables (address, contact_link, bank, certification) stay in Mesh.


CREATE TABLE IF NOT EXISTS mesh.address (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    code                text,
    name                text,
    address_type        text,
    attention_line      text,
    line1               text,
    line2               text,
    line3               text,
    city                text,
    region              text,
    postal_code         text,
    country_code        character(2),
    latitude            numeric(9,6),
    longitude           numeric(9,6),
    formatted_address   text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_address_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_address_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_address_code_fmt_chk CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_-]*$'),
    CONSTRAINT mesh_address_country_chk CHECK (country_code IS NULL OR country_code::text ~ '^[A-Z]{2}$'),
    CONSTRAINT mesh_address_lat_chk CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT mesh_address_lon_chk CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT mesh_address_status_chk CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT mesh_address_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_address_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_address_country_fk FOREIGN KEY (country_code)
        REFERENCES shared.country (code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mesh_address_account_idx
    ON mesh.address (account_code);
CREATE INDEX IF NOT EXISTS mesh_address_country_idx
    ON mesh.address (country_code)
    WHERE country_code IS NOT NULL;

COMMENT ON TABLE mesh.address IS
    'Mesh-owned participant postal address. Derived from selected master.address fields and scoped by BNA account_code.';

CREATE TABLE IF NOT EXISTS mesh.address_link (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    address_id          uuid        NOT NULL,
    purpose             text        NOT NULL DEFAULT 'default',
    is_primary          boolean     NOT NULL DEFAULT false,
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_address_link_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_address_link_uq UNIQUE (account_code, purpose, address_id),
    CONSTRAINT mesh_address_link_purpose_chk CHECK (btrim(purpose) <> ''),
    CONSTRAINT mesh_address_link_temporal_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT mesh_address_link_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_address_link_address_fk FOREIGN KEY (account_code, address_id)
        REFERENCES mesh.address (account_code, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_address_link_current_primary_uq
    ON mesh.address_link (account_code, purpose)
    WHERE is_primary = true AND effective_until IS NULL;

CREATE INDEX IF NOT EXISTS mesh_address_link_account_idx
    ON mesh.address_link (account_code, purpose);

COMMENT ON TABLE mesh.address_link IS
    'Mesh-owned address purpose bridge. One current primary address per account and purpose.';

-- party_contact_person and party_contact_role removed — master.* owns these for BPs.

CREATE TABLE IF NOT EXISTS mesh.contact_link (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    code                text,
    name                text,
    channel_type        text        NOT NULL,
    value               text        NOT NULL,
    purpose             text,
    is_primary          boolean     NOT NULL DEFAULT false,
    is_verified         boolean     NOT NULL DEFAULT false,
    verified_at         timestamptz,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_contact_link_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_contact_link_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_contact_link_value_chk CHECK (btrim(value) <> ''),
    CONSTRAINT mesh_contact_link_channel_chk CHECK (channel_type IN ('email', 'phone', 'sms', 'whatsapp', 'website', 'portal')),
    CONSTRAINT mesh_contact_link_verified_chk CHECK (is_verified = false OR verified_at IS NOT NULL),
    CONSTRAINT mesh_contact_link_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_contact_link_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mesh_contact_link_account_idx
    ON mesh.contact_link (account_code, channel_type, purpose);
CREATE UNIQUE INDEX IF NOT EXISTS mesh_contact_link_primary_uq
    ON mesh.contact_link (account_code, channel_type, COALESCE(purpose, 'default'))
    WHERE is_primary = true AND status = 'active';

COMMENT ON TABLE mesh.contact_link IS
    'Mesh-owned participant contact channel. Derived from master.contact_link and scoped by BNA account_code.';

CREATE TABLE IF NOT EXISTS mesh.contact_email (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    contact_link_id     uuid        NOT NULL,
    local_part          text,
    domain              text,
    is_disposable       boolean     NOT NULL DEFAULT false,
    mx_checked_at       timestamptz,
    mx_valid            boolean,
    bounce_count        integer     NOT NULL DEFAULT 0,
    last_bounce_at      timestamptz,
    last_bounce_reason  text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_contact_email_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_contact_email_link_uq UNIQUE (account_code, contact_link_id),
    CONSTRAINT mesh_contact_email_local_chk CHECK (local_part IS NULL OR local_part = lower(local_part)),
    CONSTRAINT mesh_contact_email_domain_chk CHECK (domain IS NULL OR domain = lower(domain)),
    CONSTRAINT mesh_contact_email_bounce_chk CHECK (bounce_count >= 0),
    CONSTRAINT mesh_contact_email_bounce_reason_chk CHECK (
        last_bounce_reason IS NULL OR last_bounce_reason IN ('hard', 'soft', 'complaint')
    ),
    CONSTRAINT mesh_contact_email_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_contact_email_link_fk FOREIGN KEY (account_code, contact_link_id)
        REFERENCES mesh.contact_link (account_code, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mesh.contact_phone (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    contact_link_id     uuid        NOT NULL,
    e164                text,
    calling_code        text,
    national_number     text,
    carrier_hint        text,
    line_type           text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_contact_phone_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_contact_phone_link_uq UNIQUE (account_code, contact_link_id),
    CONSTRAINT mesh_contact_phone_e164_chk CHECK (e164 IS NULL OR e164 ~ '^\+[1-9]\d{1,14}$'),
    CONSTRAINT mesh_contact_phone_calling_code_chk CHECK (calling_code IS NULL OR calling_code ~ '^[1-9]\d{0,3}$'),
    CONSTRAINT mesh_contact_phone_line_type_chk CHECK (line_type IS NULL OR line_type IN ('mobile', 'landline', 'voip', 'unknown')),
    CONSTRAINT mesh_contact_phone_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_contact_phone_link_fk FOREIGN KEY (account_code, contact_link_id)
        REFERENCES mesh.contact_link (account_code, id) ON DELETE CASCADE
);

-- party_tax_profile removed — master.party_tax_profile owns country-specific tax for BPs.

CREATE TABLE IF NOT EXISTS mesh.bank_party (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    country_code            character(2) NOT NULL,
    institution_type        text        NOT NULL DEFAULT 'BANK',
    bic                     text,
    national_bank_code_type text,
    national_bank_code      text,
    branch_code             text,
    branch_name             text,
    supports_swift          boolean     NOT NULL DEFAULT false,
    supports_local_clearing boolean     NOT NULL DEFAULT false,
    supports_sepa           boolean     NOT NULL DEFAULT false,
    supports_ach            boolean     NOT NULL DEFAULT false,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_bank_party_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bank_party_scope_code_uq UNIQUE NULLS NOT DISTINCT (account_code, code),
    CONSTRAINT mesh_bank_party_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_bank_party_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_bank_party_country_chk CHECK (country_code::text ~ '^[A-Z]{2}$'),
    CONSTRAINT mesh_bank_party_bic_chk CHECK (bic IS NULL OR bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
    CONSTRAINT mesh_bank_party_nat_code_pair_chk CHECK (
        (national_bank_code_type IS NULL AND national_bank_code IS NULL)
        OR (national_bank_code_type IS NOT NULL AND national_bank_code IS NOT NULL)
    ),
    CONSTRAINT mesh_bank_party_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT mesh_bank_party_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_bank_party_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_bank_party_country_fk FOREIGN KEY (country_code)
        REFERENCES shared.country (code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mesh_bank_party_account_idx
    ON mesh.bank_party (account_code)
    WHERE account_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_bank_party_country_idx
    ON mesh.bank_party (country_code);

COMMENT ON TABLE mesh.bank_party IS
    'Bank institution/branch registry visible to Mesh profile banking. account_code NULL means platform/global entry.';

CREATE TABLE IF NOT EXISTS mesh.bank_account (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code                text        NOT NULL,
    code                        text,
    name                        text,
    bank_party_id               uuid,
    account_holder_name         text        NOT NULL,
    account_id_type             text        NOT NULL,
    account_id_value            text        NOT NULL,
    account_last4               text,
    currency_code               character(3) NOT NULL,
    bic_override                text,
    bank_name_override          text,
    bank_country_override       character(2),
    account_nature              text        NOT NULL DEFAULT 'direct',
    provider_account_ref        text,
    correspondent_bank_party_id uuid,
    is_verified                 boolean     NOT NULL DEFAULT false,
    verified_at                 timestamptz,
    verified_by                 text,
    verification_method         text,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      text        NOT NULL DEFAULT 'active',
    is_active                   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text        NOT NULL DEFAULT 'system',
    updated_at                  timestamptz,
    updated_by                  text,

    CONSTRAINT mesh_bank_account_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bank_account_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_bank_account_holder_chk CHECK (btrim(account_holder_name) <> ''),
    CONSTRAINT mesh_bank_account_id_value_chk CHECK (btrim(account_id_value) <> ''),
    CONSTRAINT mesh_bank_account_last4_chk CHECK (account_last4 IS NULL OR account_last4 ~ '^[A-Z0-9]{4}$'),
    CONSTRAINT mesh_bank_account_currency_chk CHECK (currency_code::text ~ '^[A-Z]{3}$'),
    CONSTRAINT mesh_bank_account_bic_chk CHECK (bic_override IS NULL OR bic_override ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
    CONSTRAINT mesh_bank_account_bank_country_chk CHECK (
        bank_country_override IS NULL OR bank_country_override::text ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT mesh_bank_account_verified_chk CHECK (is_verified = false OR verified_at IS NOT NULL),
    CONSTRAINT mesh_bank_account_bank_identity_chk CHECK (
        bank_party_id IS NOT NULL OR (bank_name_override IS NOT NULL AND bank_country_override IS NOT NULL)
    ),
    CONSTRAINT mesh_bank_account_code_chk CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_-]*$'),
    CONSTRAINT mesh_bank_account_correspondent_chk CHECK (
        correspondent_bank_party_id IS NULL OR correspondent_bank_party_id <> bank_party_id
    ),
    CONSTRAINT mesh_bank_account_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT mesh_bank_account_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_bank_account_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_bank_account_bank_party_fk FOREIGN KEY (bank_party_id)
        REFERENCES mesh.bank_party (id) ON DELETE RESTRICT,
    CONSTRAINT mesh_bank_account_correspondent_fk FOREIGN KEY (correspondent_bank_party_id)
        REFERENCES mesh.bank_party (id) ON DELETE RESTRICT,
    CONSTRAINT mesh_bank_account_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT,
    CONSTRAINT mesh_bank_account_bank_country_fk FOREIGN KEY (bank_country_override)
        REFERENCES shared.country (code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mesh_bank_account_account_idx
    ON mesh.bank_account (account_code);
CREATE INDEX IF NOT EXISTS mesh_bank_account_bank_party_idx
    ON mesh.bank_account (bank_party_id)
    WHERE bank_party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_bank_account_currency_idx
    ON mesh.bank_account (currency_code);

COMMENT ON TABLE mesh.bank_account IS
    'Participant bank account record scoped to a Mesh account. Ownership/purpose is expressed by mesh.bank_account_link.';

CREATE TABLE IF NOT EXISTS mesh.bank_account_link (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    bank_account_id     uuid        NOT NULL,
    purpose             text        NOT NULL DEFAULT 'default',
    is_primary          boolean     NOT NULL DEFAULT false,
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_bank_account_link_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bank_account_link_uq UNIQUE (account_code, purpose, bank_account_id),
    CONSTRAINT mesh_bank_account_link_purpose_chk CHECK (btrim(purpose) <> ''),
    CONSTRAINT mesh_bank_account_link_temporal_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT mesh_bank_account_link_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_bank_account_link_account_fk FOREIGN KEY (account_code, bank_account_id)
        REFERENCES mesh.bank_account (account_code, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_bank_account_link_current_primary_uq
    ON mesh.bank_account_link (account_code, purpose)
    WHERE is_primary = true AND effective_until IS NULL;
CREATE INDEX IF NOT EXISTS mesh_bank_account_link_account_idx
    ON mesh.bank_account_link (account_code, purpose);

CREATE TABLE IF NOT EXISTS mesh.certification_type (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code    text,
    code            text        NOT NULL,
    name            text        NOT NULL,
    issuing_body    text,
    category        text,
    description     text,
    is_custom       boolean     NOT NULL DEFAULT false,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text        NOT NULL DEFAULT 'system',
    updated_at      timestamptz,
    updated_by      text,

    CONSTRAINT mesh_certification_type_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_certification_type_scope_code_uq UNIQUE NULLS NOT DISTINCT (account_code, code),
    CONSTRAINT mesh_certification_type_code_chk CHECK (code ~ '^[a-z][a-z0-9_-]*$'),
    CONSTRAINT mesh_certification_type_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_certification_type_status_chk CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT mesh_certification_type_custom_chk CHECK (NOT is_custom OR account_code IS NOT NULL),
    CONSTRAINT mesh_certification_type_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_certification_type_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mesh_certification_type_account_idx
    ON mesh.certification_type (account_code)
    WHERE account_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS mesh.certification (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text        NOT NULL,
    certification_type_id   uuid,
    custom_name             text,
    certificate_number      text,
    certified_by            text,
    certified_location      text,
    additional_info         text,
    document_uri            text,
    effective_from          date,
    effective_until         date,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_certification_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_certification_type_xor_chk CHECK (
        (certification_type_id IS NOT NULL AND custom_name IS NULL)
        OR (certification_type_id IS NULL AND custom_name IS NOT NULL)
    ),
    CONSTRAINT mesh_certification_validity_chk CHECK (
        effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from
    ),
    CONSTRAINT mesh_certification_status_chk CHECK (status IN ('active', 'expired', 'revoked', 'superseded')),
    CONSTRAINT mesh_certification_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_certification_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_certification_type_fk FOREIGN KEY (certification_type_id)
        REFERENCES mesh.certification_type (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mesh_certification_account_idx
    ON mesh.certification (account_code);
CREATE INDEX IF NOT EXISTS mesh_certification_type_idx
    ON mesh.certification (certification_type_id)
    WHERE certification_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_certification_expiry_idx
    ON mesh.certification (account_code, effective_until)
    WHERE effective_until IS NOT NULL AND status = 'active';

-- Participant-owned external reference table. Renamed from participant_external_reference.
-- Distinct from mesh.external_reference, which tracks migration batch mappings.
CREATE TABLE IF NOT EXISTS mesh.network_account_reference (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code    text        NOT NULL,
    source_system   text        NOT NULL,
    external_id     text        NOT NULL,
    external_code   text,
    payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    valid_from      date,
    valid_until     date,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text        NOT NULL DEFAULT 'system',
    updated_at      timestamptz,
    updated_by      text,

    CONSTRAINT mesh_network_account_reference_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_network_account_reference_source_uq UNIQUE (account_code, source_system, external_id),
    CONSTRAINT mesh_network_account_reference_source_chk CHECK (btrim(source_system) <> ''),
    CONSTRAINT mesh_network_account_reference_external_chk CHECK (btrim(external_id) <> ''),
    CONSTRAINT mesh_network_account_reference_valid_chk CHECK (
        valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from
    ),
    CONSTRAINT mesh_network_account_reference_payload_chk CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT mesh_network_account_reference_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT mesh_network_account_reference_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mesh_network_account_reference_account_idx
    ON mesh.network_account_reference (account_code);
