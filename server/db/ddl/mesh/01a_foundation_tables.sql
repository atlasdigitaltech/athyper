-- ============================================================================
-- mesh/01a_foundation_tables.sql
-- Comprehensive Mesh foundation around the minimal exchange graph.
--
-- Boundary rule:
--   Mesh owns provider catalog, participant profiles, invitations, network
--   events, projection checkpoints, payload metadata, and migration crosswalks.
--   Neon owns legal entity master data and stores only local mappings/projections.
--
-- Depends on:
--   mesh/01_tables.sql      existing network_account/network_connection/envelope
--   shared/00_bootstrap.sql shared.uuidv7()
-- ============================================================================

-- Provider catalog. "athyper_mesh" is the exchange/BNA provider code.
-- The legacy Neon buyer-network grouping code remains outside this Mesh
-- provider catalog during migration and is not treated as a provider alias here.
CREATE TABLE IF NOT EXISTS mesh.network_provider (
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    provider_kind           text        NOT NULL DEFAULT 'exchange',
    is_platform             boolean     NOT NULL DEFAULT false,
    participant_id_pattern  text,
    website_url             text,
    description             text,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_network_provider_pkey PRIMARY KEY (code),
    CONSTRAINT mesh_network_provider_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_network_provider_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_network_provider_kind_chk CHECK (provider_kind IN (
        'exchange', 'e_invoicing', 'procurement_network', 'payment_network', 'custom'
    )),
    CONSTRAINT mesh_network_provider_status_chk CHECK (status IN ('active', 'inactive', 'retired')),
    CONSTRAINT mesh_network_provider_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_network_provider_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

INSERT INTO mesh.network_provider (
    code, name, provider_kind, is_platform, participant_id_pattern, description
) VALUES
    ('athyper_mesh', 'Athyper Mesh Exchange', 'exchange', true, '^BNA-[0-9]{10}$',
        'Canonical Athyper Mesh BNA address space and document-exchange provider.'),
    ('peppol', 'Peppol e-Invoicing Network', 'e_invoicing', true, '^\d{4}:.+$',
        'External Peppol participant identifier registry.'),
    ('ariba', 'SAP Business Network (Ariba)', 'procurement_network', true, NULL,
        'External procurement network provider.'),
    ('tradeshift', 'Tradeshift Network', 'exchange', true, NULL,
        'External B2B document exchange provider.'),
    ('edi_x12', 'EDI X12 (ANSI ASC X12)', 'exchange', true, NULL,
        'External EDI X12 exchange channel.'),
    ('custom', 'Custom / Other Network', 'custom', false, NULL,
        'Tenant-defined external network provider.')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    provider_kind = EXCLUDED.provider_kind,
    is_platform = EXCLUDED.is_platform,
    participant_id_pattern = EXCLUDED.participant_id_pattern,
    description = EXCLUDED.description,
    updated_at = now(),
    updated_by = 'system';

COMMENT ON TABLE mesh.network_provider IS
    'Mesh-owned network provider catalog. Neon may keep a read-only shadow for FK compatibility during migration.';

-- Existing minimal Mesh tables may be missing provider_code on old installs.
ALTER TABLE mesh.network_account
    ADD COLUMN IF NOT EXISTS provider_code text NOT NULL DEFAULT 'athyper_mesh';

COMMENT ON COLUMN mesh.network_account.provider_code IS
    'Provider catalog code. Athyper Mesh BNA accounts use athyper_mesh.';

-- Catalog-driven document type registry. The legacy document_envelope.document_type
-- text column remains during transition and is backfilled to document_type_id.
CREATE TABLE IF NOT EXISTS mesh.network_document_type (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    code                text        NOT NULL,
    name                text        NOT NULL,
    direction_scope     text        NOT NULL DEFAULT 'both',
    payload_schema_uri  text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_network_document_type_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_network_document_type_code_uq UNIQUE (code),
    CONSTRAINT mesh_network_document_type_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_network_document_type_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_network_document_type_direction_chk CHECK (direction_scope IN (
        'buyer_to_supplier', 'supplier_to_buyer', 'both'
    )),
    CONSTRAINT mesh_network_document_type_status_chk CHECK (status IN ('active', 'inactive', 'retired')),
    CONSTRAINT mesh_network_document_type_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_network_document_type_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

INSERT INTO mesh.network_document_type (code, name, direction_scope) VALUES
    ('purchase_order', 'Purchase Order', 'buyer_to_supplier'),
    ('invoice', 'Invoice', 'supplier_to_buyer'),
    ('credit_note', 'Credit Note', 'supplier_to_buyer'),
    ('debit_note', 'Debit Note', 'supplier_to_buyer'),
    ('remittance_advice', 'Remittance Advice', 'buyer_to_supplier'),
    ('acknowledgement', 'Acknowledgement', 'both')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    direction_scope = EXCLUDED.direction_scope,
    updated_at = now(),
    updated_by = 'system';

ALTER TABLE mesh.document_envelope
    ADD COLUMN IF NOT EXISTS document_type_id uuid,
    ADD COLUMN IF NOT EXISTS payload_scan_status text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS payload_scanned_at timestamptz;

UPDATE mesh.document_envelope de
SET document_type_id = ndt.id
FROM mesh.network_document_type ndt
WHERE de.document_type_id IS NULL
  AND ndt.code = de.document_type;

DO $mesh_document_envelope_scan_status$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'mesh.document_envelope'::regclass
          AND conname = 'mesh_document_envelope_scan_status_chk'
    ) THEN
        ALTER TABLE mesh.document_envelope
            ADD CONSTRAINT mesh_document_envelope_scan_status_chk
            CHECK (payload_scan_status IN ('pending', 'clean', 'quarantined', 'error'));
    END IF;
END
$mesh_document_envelope_scan_status$;

COMMENT ON COLUMN mesh.document_envelope.document_type_id IS
    'Catalog FK to mesh.network_document_type. The legacy text document_type column remains during transition.';
COMMENT ON COLUMN mesh.document_envelope.payload_scan_status IS
    'Upload scanner state: pending, clean, quarantined, or error.';
COMMENT ON COLUMN mesh.document_envelope.payload_scanned_at IS
    'Timestamp of the last payload scan result.';

-- participant and participant_profile tables removed — data lives directly in
-- network_account columns (merged by 09_streamline.sql).

-- External identifier registry scoped to a BNA account.
CREATE TABLE IF NOT EXISTS mesh.network_account_identifier (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    scheme              text        NOT NULL,
    value               text        NOT NULL,
    is_verified         boolean     NOT NULL DEFAULT false,
    verified_at         timestamptz,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',

    CONSTRAINT mesh_network_account_identifier_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_network_account_identifier_uq UNIQUE (account_code, scheme, value),
    CONSTRAINT mesh_network_account_identifier_scheme_chk CHECK (btrim(scheme) <> ''),
    CONSTRAINT mesh_network_account_identifier_value_chk CHECK (btrim(value) <> ''),
    CONSTRAINT mesh_network_account_identifier_verified_chk CHECK (
        is_verified = false OR verified_at IS NOT NULL
    ),
    CONSTRAINT mesh_network_account_identifier_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

-- Mesh IAM actors. principal_identity_binding is the only table that owns
-- external IAM bindings such as Keycloak subject_id. account_grant links a
-- Mesh principal to a BNA account with an operational account role.
CREATE TABLE IF NOT EXISTS mesh.principal (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    principal_code      text        NOT NULL,
    display_name        text        NOT NULL,
    principal_type      text        NOT NULL,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_principal_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_principal_code_uq UNIQUE (principal_code),
    CONSTRAINT mesh_principal_code_nonempty CHECK (btrim(principal_code) <> ''),
    CONSTRAINT mesh_principal_display_nonempty CHECK (btrim(display_name) <> ''),
    CONSTRAINT mesh_principal_type_chk CHECK (principal_type IN (
        'participant_user', 'platform_staff', 'support_user', 'service_account', 'integration_user'
    )),
    CONSTRAINT mesh_principal_status_chk CHECK (status IN ('active', 'inactive', 'locked', 'retired')),
    CONSTRAINT mesh_principal_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_principal_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE IF NOT EXISTS mesh.principal_identity_binding (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    principal_id        uuid        NOT NULL,
    realm_key           text        NOT NULL DEFAULT 'athyper',
    provider_code       text        NOT NULL DEFAULT 'keycloak',
    subject_id          text        NOT NULL,
    username            text,
    issuer              text,
    client_id           text,
    synced_at           timestamptz,
    sync_status         text        NOT NULL DEFAULT 'pending',
    idp_snapshot        jsonb,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_principal_identity_binding_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_pib_principal_provider_uq UNIQUE (principal_id, realm_key, provider_code),
    CONSTRAINT mesh_pib_subject_provider_uq UNIQUE (realm_key, provider_code, subject_id),
    CONSTRAINT mesh_pib_realm_key_chk CHECK (realm_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
    CONSTRAINT mesh_pib_provider_code_chk CHECK (provider_code IN (
        'keycloak', 'azure_ad', 'okta', 'google', 'saml_generic', 'oidc_generic'
    )),
    CONSTRAINT mesh_pib_subject_nonempty CHECK (btrim(subject_id) <> ''),
    CONSTRAINT mesh_pib_sync_status_chk CHECK (sync_status IN ('pending', 'synced', 'drift', 'error', 'disabled')),
    CONSTRAINT mesh_pib_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_pib_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

ALTER TABLE mesh.principal_identity_binding
    ALTER COLUMN realm_key SET DEFAULT 'athyper';

-- Existing installs may still have legacy owner columns. Populate profile columns
-- directly and clean up the participant_id column if it still exists.
ALTER TABLE mesh.network_account
    ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $mesh_network_account_owner_cleanup$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'mesh'
          AND table_name = 'network_account'
          AND column_name = 'owner_kind'
    ) THEN
        EXECUTE $cleanup$
            UPDATE mesh.network_account
            SET
                participant_type = CASE
                    WHEN owner_kind IN ('tenant_legal_entity', 'partner_org', 'platform') THEN owner_kind
                    ELSE 'external'
                END,
                source_plane = CASE WHEN tenant_code IS NULL THEN 'mesh' ELSE 'neon' END,
                source_ref   = COALESCE(NULLIF(owner_ref, ''), account_code),
                updated_at   = now(),
                updated_by   = 'system'
            WHERE participant_type = 'partner_org'
        $cleanup$;
    END IF;

    -- Drop participant_id if it still exists from an earlier schema revision.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'mesh' AND table_name = 'network_account' AND column_name = 'participant_id'
    ) THEN
        ALTER TABLE mesh.network_account DROP CONSTRAINT IF EXISTS mesh_network_account_participant_fk;
        DROP INDEX IF EXISTS mesh_network_account_participant_idx;
        ALTER TABLE mesh.network_account DROP COLUMN IF EXISTS participant_id;
    END IF;
END
$mesh_network_account_owner_cleanup$;

DROP INDEX IF EXISTS mesh_network_account_owner_idx;
DROP INDEX IF EXISTS mesh_network_account_tenant_le_idx;
DROP POLICY IF EXISTS mesh_network_account_read ON mesh.network_account;
DROP POLICY IF EXISTS mesh_network_account_admin ON mesh.network_account;

ALTER TABLE mesh.network_account
    DROP CONSTRAINT IF EXISTS mesh_network_account_type_chk,
    DROP CONSTRAINT IF EXISTS mesh_network_account_owner_kind_chk,
    DROP COLUMN IF EXISTS account_type,
    DROP COLUMN IF EXISTS owner_kind,
    DROP COLUMN IF EXISTS owner_ref,
    DROP COLUMN IF EXISTS tenant_code,
    DROP COLUMN IF EXISTS legal_entity_code,
    DROP COLUMN IF EXISTS kc_org_alias;

DO $mesh_network_account_clean_checks$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'mesh.network_account'::regclass
          AND conname = 'mesh_network_account_display_chk'
    ) THEN
        ALTER TABLE mesh.network_account
            ADD CONSTRAINT mesh_network_account_display_chk CHECK (btrim(display_name) <> '');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'mesh.network_account'::regclass
          AND conname = 'mesh_network_account_capabilities_obj_chk'
    ) THEN
        ALTER TABLE mesh.network_account
            ADD CONSTRAINT mesh_network_account_capabilities_obj_chk CHECK (jsonb_typeof(capabilities) = 'object');
    END IF;
END
$mesh_network_account_clean_checks$;

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

DO $mesh_account_grant_backfill$
BEGIN
    IF to_regclass('mesh.network_account_member') IS NOT NULL THEN
        INSERT INTO mesh.account_grant (
            account_id, principal_id, role_code, status, granted_at, granted_by,
            metadata, created_at, created_by, updated_at, updated_by
        )
        SELECT
            nam.account_id,
            COALESCE(nam.principal_id, pib.principal_id),
            CASE nam.role_code
                WHEN 'buyer_owner' THEN 'account_owner'
                WHEN 'partner_owner' THEN 'account_owner'
                WHEN 'buyer_admin' THEN 'account_admin'
                WHEN 'partner_admin' THEN 'account_admin'
                ELSE 'account_user'
            END,
            CASE nam.status
                WHEN 'active' THEN 'active'
                WHEN 'suspended' THEN 'suspended'
                ELSE 'inactive'
            END,
            nam.created_at,
            nam.created_by,
            jsonb_strip_nulls(nam.metadata || jsonb_build_object(
                'legacy_role_code', nam.role_code,
                'legacy_realm_key', nam.realm_key,
                'legacy_provider_code', nam.provider_code,
                'legacy_subject_id', nam.subject_id
            )),
            nam.created_at,
            nam.created_by,
            nam.updated_at,
            nam.updated_by
        FROM mesh.network_account_member nam
        LEFT JOIN mesh.principal_identity_binding pib
               ON pib.realm_key = nam.realm_key
              AND pib.provider_code = nam.provider_code
              AND pib.subject_id = nam.subject_id
        WHERE COALESCE(nam.principal_id, pib.principal_id) IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM mesh.account_grant ag
              WHERE ag.account_id = nam.account_id
                AND ag.principal_id = COALESCE(nam.principal_id, pib.principal_id)
                AND ag.role_code = CASE nam.role_code
                    WHEN 'buyer_owner' THEN 'account_owner'
                    WHEN 'partner_owner' THEN 'account_owner'
                    WHEN 'buyer_admin' THEN 'account_admin'
                    WHEN 'partner_admin' THEN 'account_admin'
                    ELSE 'account_user'
                END
                AND ag.status = 'active'
          );

        IF to_regclass('mesh.network_account_member') IS NOT NULL THEN
            EXECUTE 'DROP POLICY IF EXISTS mesh_network_account_member_read ON mesh.network_account_member';
            EXECUTE 'DROP POLICY IF EXISTS mesh_network_account_member_admin ON mesh.network_account_member';
        END IF;

        IF to_regclass('mesh.principal_ui_profile') IS NOT NULL THEN
            EXECUTE 'DROP POLICY IF EXISTS mesh_principal_ui_profile_read ON mesh.principal_ui_profile';
        END IF;

        IF to_regclass('mesh.principal_ui_preference') IS NOT NULL THEN
            EXECUTE 'DROP POLICY IF EXISTS mesh_principal_ui_preference_read ON mesh.principal_ui_preference';
        END IF;

        IF to_regclass('mesh.principal_notification_preference') IS NOT NULL THEN
            EXECUTE 'DROP POLICY IF EXISTS mesh_principal_notification_pref_read ON mesh.principal_notification_preference';
        END IF;

        IF to_regclass('mesh.saved_view') IS NOT NULL THEN
            EXECUTE 'DROP POLICY IF EXISTS mesh_saved_view_read ON mesh.saved_view';
        END IF;

        DROP TABLE mesh.network_account_member;
    END IF;
END
$mesh_account_grant_backfill$;

CREATE UNIQUE INDEX IF NOT EXISTS mesh_account_grant_active_uq
    ON mesh.account_grant (account_id, principal_id, role_code)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS mesh_account_grant_principal_idx
    ON mesh.account_grant (principal_id, status);
CREATE INDEX IF NOT EXISTS mesh_account_grant_account_idx
    ON mesh.account_grant (account_id, status);

COMMENT ON TABLE mesh.account_grant IS
    'Operational grant from a Mesh principal to a BNA account. External IAM subject bindings live only in principal_identity_binding.';

-- Mesh auth uses network_account.network_role as the buyer/partner authority.

-- Invitation/request/acceptance state machine. Mesh owns token lifecycle.
CREATE TABLE IF NOT EXISTS mesh.network_invitation (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    invitation_code       text        NOT NULL,
    inviter_account_code  text        NOT NULL,
    invitee_account_code  text,
    invitee_email         text,
    token_hash            text        NOT NULL,
    token_expires_at      timestamptz NOT NULL,
    invitation_message    text,
    status                text        NOT NULL DEFAULT 'pending',
    accepted_at           timestamptz,
    rejected_at           timestamptz,
    expired_at            timestamptz,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            text        NOT NULL DEFAULT 'system',
    updated_at            timestamptz,
    updated_by            text,

    CONSTRAINT mesh_network_invitation_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_network_invitation_code_uq UNIQUE (invitation_code),
    CONSTRAINT mesh_network_invitation_code_nonempty CHECK (btrim(invitation_code) <> ''),
    CONSTRAINT mesh_network_invitation_invitee_chk CHECK (
        invitee_account_code IS NOT NULL OR invitee_email IS NOT NULL
    ),
    CONSTRAINT mesh_network_invitation_email_norm_chk CHECK (
        invitee_email IS NULL OR invitee_email = lower(trim(invitee_email))
    ),
    CONSTRAINT mesh_network_invitation_token_hash_chk CHECK (btrim(token_hash) <> ''),
    CONSTRAINT mesh_network_invitation_expiry_chk CHECK (token_expires_at > created_at),
    CONSTRAINT mesh_network_invitation_status_chk CHECK (status IN (
        'pending', 'accepted', 'rejected', 'expired', 'cancelled'
    )),
    CONSTRAINT mesh_network_invitation_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_network_invitation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE IF NOT EXISTS mesh.connection_request (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    request_code          text        NOT NULL,
    buyer_account_code    text        NOT NULL,
    supplier_account_code text        NOT NULL,
    invitation_id         uuid,
    status                text        NOT NULL DEFAULT 'requested',
    requested_at          timestamptz NOT NULL DEFAULT now(),
    responded_at          timestamptz,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            text        NOT NULL DEFAULT 'system',
    updated_at            timestamptz,
    updated_by            text,

    CONSTRAINT mesh_connection_request_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_connection_request_code_uq UNIQUE (request_code),
    CONSTRAINT mesh_connection_request_pair_uq UNIQUE (buyer_account_code, supplier_account_code, status),
    CONSTRAINT mesh_connection_request_distinct_chk CHECK (buyer_account_code <> supplier_account_code),
    CONSTRAINT mesh_connection_request_status_chk CHECK (status IN (
        'requested', 'accepted', 'rejected', 'cancelled', 'expired'
    )),
    CONSTRAINT mesh_connection_request_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_connection_request_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE IF NOT EXISTS mesh.connection_acceptance (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    request_id                  uuid        NOT NULL,
    connection_id               uuid,
    accepted_by_account_code    text        NOT NULL,
    accepted_by_subject_id      text,
    terms_snapshot              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    accepted_at                 timestamptz NOT NULL DEFAULT now(),
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text        NOT NULL DEFAULT 'system',

    CONSTRAINT mesh_connection_acceptance_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_connection_acceptance_request_uq UNIQUE (request_id),
    CONSTRAINT mesh_connection_acceptance_actor_chk CHECK (btrim(accepted_by_account_code) <> ''),
    CONSTRAINT mesh_connection_acceptance_terms_obj_chk CHECK (jsonb_typeof(terms_snapshot) = 'object'),
    CONSTRAINT mesh_connection_acceptance_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

-- Transactional outbox and consumer-facing ordered event log.
CREATE TABLE IF NOT EXISTS mesh.outbox_event (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    event_type          text        NOT NULL,
    aggregate_type      text        NOT NULL,
    aggregate_id        uuid        NOT NULL,
    aggregate_code      text,
    account_code        text,
    tenant_code         text,
    payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'pending',
    attempt_count       integer     NOT NULL DEFAULT 0,
    available_at        timestamptz NOT NULL DEFAULT now(),
    locked_at           timestamptz,
    locked_by           text,
    published_event_id  uuid,
    last_error          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz,

    CONSTRAINT mesh_outbox_event_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_outbox_event_type_chk CHECK (btrim(event_type) <> ''),
    CONSTRAINT mesh_outbox_aggregate_type_chk CHECK (btrim(aggregate_type) <> ''),
    CONSTRAINT mesh_outbox_payload_obj_chk CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT mesh_outbox_status_chk CHECK (status IN ('pending', 'locked', 'published', 'failed', 'cancelled')),
    CONSTRAINT mesh_outbox_attempt_count_chk CHECK (attempt_count >= 0)
);

CREATE SEQUENCE IF NOT EXISTS mesh.network_event_sequence AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE TABLE IF NOT EXISTS mesh.network_event (
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    sequence_no         bigint      NOT NULL DEFAULT nextval('mesh.network_event_sequence'),
    event_type          text        NOT NULL,
    aggregate_type      text        NOT NULL,
    aggregate_id        uuid        NOT NULL,
    aggregate_code      text,
    account_code        text,
    tenant_code         text,
    payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_network_event_pkey PRIMARY KEY (occurred_at, id),
    CONSTRAINT mesh_network_event_sequence_uq UNIQUE (occurred_at, sequence_no),
    CONSTRAINT mesh_network_event_type_chk CHECK (event_type IN (
        'account.created',
        'account.status_changed',
        'connection.requested',
        'connection.accepted',
        'connection.suspended',
        'connection.terminated',
        'connection.reactivated',
        'membership.added',
        'membership.removed',
        'invitation.created',
        'invitation.accepted',
        'invitation.rejected',
        'invitation.expired',
        'participant_profile.updated',
        'supplier_service_coverage.changed',
        'supplier_commodity_capability.changed',
        'catalog.published',
        'catalog.unpublished',
        'catalog_item.published',
        'catalog_price.updated',
        'logistics_rate.updated',
        'document.received',
        'document.accepted',
        'document.rejected'
    )),
    CONSTRAINT mesh_network_event_aggregate_type_chk CHECK (btrim(aggregate_type) <> ''),
    CONSTRAINT mesh_network_event_payload_obj_chk CHECK (jsonb_typeof(payload) = 'object')
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS mesh.network_event_default
    PARTITION OF mesh.network_event DEFAULT;

COMMENT ON TABLE mesh.network_event IS
    'Replayable Mesh network/document event log consumed by Neon projections. Partitioned by occurred_at; sequence_no is generated by mesh.network_event_sequence.';

CREATE TABLE IF NOT EXISTS mesh.sync_checkpoint (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    consumer_id         text        NOT NULL,
    stream_name         text        NOT NULL,
    last_sequence_no    bigint      NOT NULL DEFAULT 0,
    last_event_id       uuid,
    last_processed_at   timestamptz,
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_sync_checkpoint_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_sync_checkpoint_consumer_stream_uq UNIQUE (consumer_id, stream_name),
    CONSTRAINT mesh_sync_checkpoint_consumer_chk CHECK (btrim(consumer_id) <> ''),
    CONSTRAINT mesh_sync_checkpoint_stream_chk CHECK (btrim(stream_name) <> ''),
    CONSTRAINT mesh_sync_checkpoint_sequence_chk CHECK (last_sequence_no >= 0)
);

CREATE TABLE IF NOT EXISTS mesh.external_reference (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    migration_batch_id  uuid        NOT NULL,
    source_plane        text        NOT NULL,
    source_schema       text        NOT NULL,
    source_table        text        NOT NULL,
    source_id           text        NOT NULL,
    mesh_table          text        NOT NULL,
    mesh_id             uuid        NOT NULL,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_external_reference_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_external_reference_uq UNIQUE (
        source_plane, source_schema, source_table, source_id, mesh_table
    ),
    CONSTRAINT mesh_external_reference_source_plane_chk CHECK (source_plane IN ('neon', 'mesh', 'admin', 'external')),
    CONSTRAINT mesh_external_reference_source_schema_chk CHECK (btrim(source_schema) <> ''),
    CONSTRAINT mesh_external_reference_source_table_chk CHECK (btrim(source_table) <> ''),
    CONSTRAINT mesh_external_reference_source_id_chk CHECK (btrim(source_id) <> ''),
    CONSTRAINT mesh_external_reference_mesh_table_chk CHECK (btrim(mesh_table) <> ''),
    CONSTRAINT mesh_external_reference_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

-- Payload metadata is Mesh-owned. Object bytes are accessed through Mesh APIs,
-- not direct Neon object-store credentials.
CREATE TABLE IF NOT EXISTS mesh.document_payload (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    envelope_id           uuid        NOT NULL,
    storage_uri           text        NOT NULL,
    payload_hash          text        NOT NULL,
    payload_content_type  text,
    payload_size_bytes    bigint,
    scan_status           text        NOT NULL DEFAULT 'pending',
    scanned_at            timestamptz,
    retention_until       timestamptz,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'active',
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            text        NOT NULL DEFAULT 'system',
    updated_at            timestamptz,
    updated_by            text,

    CONSTRAINT mesh_document_payload_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_document_payload_envelope_uq UNIQUE (envelope_id),
    CONSTRAINT mesh_document_payload_storage_uri_chk CHECK (btrim(storage_uri) <> ''),
    CONSTRAINT mesh_document_payload_hash_chk CHECK (btrim(payload_hash) <> ''),
    CONSTRAINT mesh_document_payload_size_chk CHECK (payload_size_bytes IS NULL OR payload_size_bytes >= 0),
    CONSTRAINT mesh_document_payload_scan_status_chk CHECK (scan_status IN ('pending', 'clean', 'quarantined', 'error')),
    CONSTRAINT mesh_document_payload_status_chk CHECK (status IN ('active', 'archived', 'deleted')),
    CONSTRAINT mesh_document_payload_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_document_payload_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE IF NOT EXISTS mesh.document_acknowledgement (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    envelope_id             uuid        NOT NULL,
    acknowledgement_type    text        NOT NULL,
    status                  text        NOT NULL,
    message                 text,
    acknowledged_at         timestamptz NOT NULL DEFAULT now(),
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',

    CONSTRAINT mesh_document_acknowledgement_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_document_acknowledgement_type_chk CHECK (acknowledgement_type IN (
        'technical', 'business', 'delivery'
    )),
    CONSTRAINT mesh_document_acknowledgement_status_chk CHECK (status IN (
        'accepted', 'rejected', 'failed', 'delivered'
    )),
    CONSTRAINT mesh_document_acknowledgement_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS mesh.audit_event (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    event_type          text        NOT NULL,
    actor_account_code  text,
    actor_subject_id    text,
    target_type         text,
    target_id           text,
    event_payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_audit_event_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_audit_event_type_chk CHECK (btrim(event_type) <> ''),
    CONSTRAINT mesh_audit_event_payload_obj_chk CHECK (jsonb_typeof(event_payload) = 'object')
);

CREATE TABLE IF NOT EXISTS mesh.activity_log (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    activity_type       text        NOT NULL,
    message             text        NOT NULL,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_activity_log_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_activity_log_type_chk CHECK (btrim(activity_type) <> ''),
    CONSTRAINT mesh_activity_log_message_chk CHECK (btrim(message) <> ''),
    CONSTRAINT mesh_activity_log_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);
