-- ============================================================================
-- mesh/01_tables.sql
-- Minimal Athyper Mesh document-exchange schema.
--
-- Boundary rule:
--   Mesh owns network accounts, network relationships, document envelopes, and
--   exchange events. Neon stores only local business meaning of BNA codes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS mesh.network_account (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code                text        NOT NULL,
    provider_code               text        NOT NULL DEFAULT 'athyper_mesh',
    display_name                text        NOT NULL,

    -- Participant identity (merged from former participant aggregate)
    participant_type            text        NOT NULL DEFAULT 'partner_org',
    source_plane                text,
    source_ref                  text,

    -- Profile core (merged from former participant_profile)
    legal_name                  text,
    tax_id                      text,
    tax_country                 character(2),
    vat_number                  text,
    legal_form                  text,
    registration_no             text,
    registration_country_code   character(2),
    tax_residence_country_code  character(2),
    profile_authority           text        NOT NULL DEFAULT 'neon',
    verification_status         text        NOT NULL DEFAULT 'unverified',
    verified_at                 timestamptz,
    verified_by                 text,
    published_at                timestamptz,
    website_url                 text,
    description                 text,
    aliases                     text[]      NOT NULL DEFAULT '{}'::text[],
    business_types              text[]      NOT NULL DEFAULT '{}'::text[],
    founded_year                smallint,
    employee_count_band         text,
    annual_revenue_band         text,
    incorporation_date          date,
    effective_from              date,
    effective_until             date,
    profile_hash                text,
    last_verified_at            timestamptz,
    profile_snapshot            jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Exchange flags
    network_role                text        NOT NULL DEFAULT 'buyer',
    capabilities                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      text        NOT NULL DEFAULT 'active',
    is_active                   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_network_account_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_network_account_code_uq UNIQUE (account_code),
    CONSTRAINT mesh_network_account_id_code_uq UNIQUE (id, account_code),
    CONSTRAINT mesh_network_account_code_chk CHECK (account_code ~ '^BNA-[0-9]{10}$'),
    CONSTRAINT mesh_network_account_display_chk CHECK (btrim(display_name) <> ''),
    CONSTRAINT mesh_network_account_participant_type_chk CHECK (participant_type IN (
        'tenant_legal_entity', 'partner_org', 'platform', 'external'
    )),
    CONSTRAINT mesh_network_account_source_plane_chk CHECK (
        source_plane IS NULL OR source_plane IN ('neon', 'mesh', 'admin', 'external')
    ),
    CONSTRAINT mesh_network_account_tax_country_chk CHECK (
        tax_country IS NULL OR tax_country::text ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT mesh_network_account_reg_country_chk CHECK (
        registration_country_code IS NULL OR registration_country_code::text ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT mesh_network_account_tax_res_country_chk CHECK (
        tax_residence_country_code IS NULL OR tax_residence_country_code::text ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT mesh_network_account_profile_authority_chk CHECK (
        profile_authority IN ('neon', 'mesh', 'self', 'admin')
    ),
    CONSTRAINT mesh_network_account_verification_status_chk CHECK (
        verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'expired')
    ),
    CONSTRAINT mesh_network_account_verified_pair_chk CHECK (
        (verified_at IS NULL) = (verified_by IS NULL)
    ),
    CONSTRAINT mesh_network_account_website_chk CHECK (
        website_url IS NULL OR website_url ~ '^https?://'
    ),
    CONSTRAINT mesh_network_account_founded_year_chk CHECK (
        founded_year IS NULL OR founded_year BETWEEN 1800 AND 2200
    ),
    CONSTRAINT mesh_network_account_effective_order_chk CHECK (
        effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from
    ),
    CONSTRAINT mesh_network_account_profile_snapshot_obj_chk CHECK (jsonb_typeof(profile_snapshot) = 'object'),
    CONSTRAINT mesh_network_account_network_role_chk CHECK (
        network_role IN ('buyer', 'supplier', 'both', 'carrier', 'broker', 'service_provider', 'platform')
    ),
    CONSTRAINT mesh_network_account_capabilities_obj_chk CHECK (jsonb_typeof(capabilities) = 'object'),
    CONSTRAINT mesh_network_account_status_chk CHECK (status IN ('active', 'inactive', 'suspended', 'retired')),
    CONSTRAINT mesh_network_account_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_network_account_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE INDEX IF NOT EXISTS mesh_network_account_provider_idx
    ON mesh.network_account (provider_code, account_code);
CREATE INDEX IF NOT EXISTS mesh_network_account_source_idx
    ON mesh.network_account (source_plane, source_ref)
    WHERE source_plane IS NOT NULL AND source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_network_account_legal_name_idx
    ON mesh.network_account (legal_name)
    WHERE legal_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_network_account_profile_hash_idx
    ON mesh.network_account (account_code, profile_hash)
    WHERE profile_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_network_account_verification_idx
    ON mesh.network_account (verification_status, verified_at)
    WHERE verification_status IN ('pending', 'verified');
CREATE INDEX IF NOT EXISTS mesh_network_account_participant_type_idx
    ON mesh.network_account (participant_type, status);
CREATE INDEX IF NOT EXISTS mesh_network_account_network_role_idx
    ON mesh.network_account (network_role, status);

COMMENT ON TABLE mesh.network_account IS
    'Stable BNA address on the Mesh network. Owns exchange address, participant identity, and profile data.';

CREATE TABLE IF NOT EXISTS mesh.account_grant (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_id          uuid        NOT NULL,
    principal_id        uuid        NOT NULL,
    role_code           text        NOT NULL,
    status              text        NOT NULL DEFAULT 'active',
    granted_at          timestamptz NOT NULL DEFAULT now(),
    granted_by          text        NOT NULL DEFAULT 'system',
    revoked_at          timestamptz,
    revoked_by          text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_account_grant_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_account_grant_role_chk CHECK (role_code IN ('account_owner', 'account_admin', 'account_user')),
    CONSTRAINT mesh_account_grant_status_chk CHECK (status IN ('active', 'inactive', 'suspended', 'revoked')),
    CONSTRAINT mesh_account_grant_revoked_pair_chk CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
    CONSTRAINT mesh_account_grant_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_account_grant_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_account_grant_active_uq
    ON mesh.account_grant (account_id, principal_id, role_code)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS mesh_account_grant_principal_idx
    ON mesh.account_grant (principal_id, status);
CREATE INDEX IF NOT EXISTS mesh_account_grant_account_idx
    ON mesh.account_grant (account_id, status);

-- Buyer–supplier pairing. Replaces the former network_connection table.
CREATE TABLE IF NOT EXISTS mesh.network_relationship (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    buyer_account_code    text        NOT NULL,
    supplier_account_code text        NOT NULL,
    relationship_code     text        NOT NULL,
    status                text        NOT NULL DEFAULT 'pending',
    capability_set        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    terms_snapshot        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    activated_at          timestamptz,
    suspended_at          timestamptz,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            text        NOT NULL DEFAULT 'system',
    updated_at            timestamptz,
    updated_by            text,

    CONSTRAINT mesh_network_relationship_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_network_relationship_code_uq UNIQUE (relationship_code),
    CONSTRAINT mesh_network_relationship_pair_uq UNIQUE (buyer_account_code, supplier_account_code),
    CONSTRAINT mesh_network_relationship_distinct_chk CHECK (buyer_account_code <> supplier_account_code),
    CONSTRAINT mesh_network_relationship_status_chk CHECK (status IN ('pending', 'active', 'suspended', 'terminated', 'rejected')),
    CONSTRAINT mesh_network_relationship_capability_obj_chk CHECK (jsonb_typeof(capability_set) = 'object'),
    CONSTRAINT mesh_network_relationship_terms_obj_chk CHECK (jsonb_typeof(terms_snapshot) = 'object'),
    CONSTRAINT mesh_network_relationship_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_network_relationship_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT mesh_network_relationship_buyer_fk FOREIGN KEY (buyer_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE RESTRICT,
    CONSTRAINT mesh_network_relationship_supplier_fk FOREIGN KEY (supplier_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mesh_network_relationship_buyer_idx
    ON mesh.network_relationship (buyer_account_code, status);
CREATE INDEX IF NOT EXISTS mesh_network_relationship_supplier_idx
    ON mesh.network_relationship (supplier_account_code, status);

CREATE TABLE IF NOT EXISTS mesh.document_envelope (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    connection_id         uuid        NOT NULL,   -- FK → network_relationship.id (column kept for legacy compat)
    envelope_code         text        NOT NULL,
    document_type         text        NOT NULL,
    document_direction    text        NOT NULL,
    sender_account_code   text        NOT NULL,
    receiver_account_code text        NOT NULL,
    business_key          text,
    correlation_id        text,
    idempotency_key       text,
    payload_uri           text,
    payload_hash          text,
    payload_content_type  text,
    payload_size_bytes    bigint,
    status                text        NOT NULL DEFAULT 'received',
    received_at           timestamptz NOT NULL DEFAULT now(),
    processed_at          timestamptz,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            text        NOT NULL DEFAULT 'system',
    updated_at            timestamptz,
    updated_by            text,

    CONSTRAINT mesh_document_envelope_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_document_envelope_code_uq UNIQUE (envelope_code),
    CONSTRAINT mesh_document_envelope_idempotency_uq UNIQUE (sender_account_code, idempotency_key),
    CONSTRAINT mesh_document_envelope_type_chk CHECK (document_type IN ('purchase_order', 'invoice', 'credit_note', 'debit_note', 'remittance_advice', 'acknowledgement')),
    CONSTRAINT mesh_document_envelope_direction_chk CHECK (document_direction IN ('buyer_to_supplier', 'supplier_to_buyer')),
    CONSTRAINT mesh_document_envelope_status_chk CHECK (status IN ('received', 'validated', 'accepted', 'rejected', 'routed', 'failed', 'archived')),
    CONSTRAINT mesh_document_envelope_size_chk CHECK (payload_size_bytes IS NULL OR payload_size_bytes >= 0),
    CONSTRAINT mesh_document_envelope_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_document_envelope_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT mesh_document_envelope_relationship_fk FOREIGN KEY (connection_id)
        REFERENCES mesh.network_relationship (id) ON DELETE RESTRICT,
    CONSTRAINT mesh_document_envelope_sender_fk FOREIGN KEY (sender_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE RESTRICT,
    CONSTRAINT mesh_document_envelope_receiver_fk FOREIGN KEY (receiver_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mesh_document_envelope_connection_idx
    ON mesh.document_envelope (connection_id, received_at DESC);
CREATE INDEX IF NOT EXISTS mesh_document_envelope_receiver_status_idx
    ON mesh.document_envelope (receiver_account_code, status, received_at DESC);
CREATE INDEX IF NOT EXISTS mesh_document_envelope_business_key_idx
    ON mesh.document_envelope (document_type, business_key);

CREATE TABLE IF NOT EXISTS mesh.document_event (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    envelope_id        uuid        NOT NULL,
    event_type         text        NOT NULL,
    actor_account_code text,
    actor_subject_id   text,
    event_payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at        timestamptz NOT NULL DEFAULT now(),
    created_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_document_event_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_document_event_type_chk CHECK (event_type IN ('received', 'validated', 'accepted', 'rejected', 'routed', 'failed', 'archived', 'acknowledged')),
    CONSTRAINT mesh_document_event_payload_obj_chk CHECK (jsonb_typeof(event_payload) = 'object'),
    CONSTRAINT mesh_document_event_envelope_fk FOREIGN KEY (envelope_id)
        REFERENCES mesh.document_envelope (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mesh_document_event_envelope_idx
    ON mesh.document_event (envelope_id, occurred_at);

CREATE TABLE IF NOT EXISTS mesh.idempotency_key (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code    text        NOT NULL,
    idempotency_key text        NOT NULL,
    request_hash    text        NOT NULL,
    response_status integer,
    response_body   jsonb,
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_idempotency_key_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_idempotency_key_uq UNIQUE (account_code, idempotency_key),
    CONSTRAINT mesh_idempotency_key_status_chk CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
    CONSTRAINT mesh_idempotency_key_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mesh_idempotency_key_expiry_idx
    ON mesh.idempotency_key (expires_at);
