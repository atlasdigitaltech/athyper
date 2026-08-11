-- Keycloak is authoritative. This table is a non-secret local projection used
-- by Admin IAM APIs and drift detection.
CREATE TABLE runtime_meta.mfa_credential_projection (
    id                     uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid        NOT NULL,
    principal_id           uuid        NOT NULL,
    authority              text        NOT NULL DEFAULT 'keycloak',
    external_credential_id text        NOT NULL,
    method_type            text        NOT NULL,
    user_label             text,
    is_enabled             boolean     NOT NULL DEFAULT true,
    is_verified            boolean     NOT NULL DEFAULT false,
    is_primary             boolean     NOT NULL DEFAULT false,
    enrolled_at            timestamptz,
    verified_at            timestamptz,
    last_used_at           timestamptz,
    source_updated_at      timestamptz,
    synchronized_at        timestamptz NOT NULL DEFAULT now(),
    sync_status            text        NOT NULL DEFAULT 'current',
    sync_error_code        text,
    sync_error_message     text,
    metadata               jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid        NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT mfa_credential_projection_pkey PRIMARY KEY (id),
    CONSTRAINT mfa_credential_projection_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mfa_credential_projection_external_uq
        UNIQUE (authority, external_credential_id),
    CONSTRAINT mfa_credential_projection_method_chk
        CHECK (method_type IN ('totp','webauthn','sms','email','recovery_code')),
    CONSTRAINT mfa_credential_projection_authority_chk
        CHECK (authority ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT mfa_credential_projection_external_chk
        CHECK (btrim(external_credential_id) <> ''),
    CONSTRAINT mfa_credential_projection_verified_chk CHECK (
        (is_verified AND verified_at IS NOT NULL)
        OR (NOT is_verified AND verified_at IS NULL)
    ),
    CONSTRAINT mfa_credential_projection_primary_chk
        CHECK (NOT is_primary OR (is_enabled AND is_verified)),
    CONSTRAINT mfa_credential_projection_time_chk CHECK (
        (verified_at IS NULL OR enrolled_at IS NULL OR verified_at >= enrolled_at)
        AND (last_used_at IS NULL OR enrolled_at IS NULL OR last_used_at >= enrolled_at)
    ),
    CONSTRAINT mfa_credential_projection_sync_chk
        CHECK (sync_status IN ('current','stale','missing','error')),
    CONSTRAINT mfa_credential_projection_error_chk CHECK (
        sync_status = 'error' OR (sync_error_code IS NULL AND sync_error_message IS NULL)
    ),
    CONSTRAINT mfa_credential_projection_metadata_chk CHECK (
        jsonb_typeof(metadata) = 'object'
        AND NOT (metadata ?| ARRAY['secret','password','credential','token','private_key'])
    ),
    CONSTRAINT mfa_credential_projection_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE runtime_meta.mfa_credential_projection IS
  'Admin-local non-secret projection of external MFA credential state. Authentication secrets remain exclusively in the identity provider.';
