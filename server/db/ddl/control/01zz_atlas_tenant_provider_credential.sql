-- Tenant-owned Atlas provider credentials. Ciphertext only.
CREATE TABLE IF NOT EXISTS control.atlas_tenant_provider_credential (
    id                  uuid PRIMARY KEY DEFAULT shared.uuidv7(),
    tenant_id           uuid NOT NULL,
    provider_id         text NOT NULL,
    encrypted_secret    text NOT NULL,
    key_version         integer NOT NULL,
    rotation_epoch      integer NOT NULL DEFAULT 1,
    status              text NOT NULL DEFAULT 'active',
    activated_at        timestamptz NOT NULL DEFAULT now(),
    revoked_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT atlas_tenant_provider_credential_scope_uq
      UNIQUE (tenant_id, provider_id, rotation_epoch),
    CONSTRAINT atlas_tenant_provider_credential_provider_chk
      CHECK (provider_id IN ('anthropic','openai','gemini')),
    CONSTRAINT atlas_tenant_provider_credential_epoch_chk
      CHECK (rotation_epoch >= 1 AND key_version >= 1),
    CONSTRAINT atlas_tenant_provider_credential_status_chk
      CHECK (status IN ('active','superseded','revoked')),
    CONSTRAINT atlas_tenant_provider_credential_revoke_chk
      CHECK ((status = 'revoked' AND revoked_at IS NOT NULL) OR status <> 'revoked'),
    CONSTRAINT atlas_tenant_provider_credential_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS control.atlas_tenant_provider_credential_epoch (
    tenant_id       uuid NOT NULL REFERENCES master.tenant(id) ON DELETE RESTRICT,
    provider_id     text NOT NULL,
    rotation_epoch  integer NOT NULL DEFAULT 1 CHECK (rotation_epoch >= 1),
    revoked         boolean NOT NULL DEFAULT false,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, provider_id),
    CONSTRAINT atlas_tenant_provider_epoch_provider_chk
      CHECK (provider_id IN ('anthropic','openai','gemini'))
);

CREATE TABLE IF NOT EXISTS log.atlas_byok_audit (
    id                      uuid PRIMARY KEY DEFAULT shared.uuidv7(),
    tenant_id               uuid NOT NULL,
    provider_id             text NOT NULL,
    event                   text NOT NULL,
    rotation_epoch          integer,
    reference_fingerprint   text,
    actor_principal_id      uuid,
    correlation_id          text,
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT atlas_byok_audit_event_chk CHECK (
      event IN ('created','resolved','unavailable','rotated','revoked','reencrypted','cache_evicted','recovery_verified')
    ),
    CONSTRAINT atlas_byok_audit_no_secret_chk CHECK (
      reference_fingerprint IS NULL OR reference_fingerprint ~ '^(ref|credential):hmac-sha256:v[0-9]+:[0-9a-f]{32}$'
    )
);

COMMENT ON COLUMN control.atlas_tenant_provider_credential.encrypted_secret IS
  'AES-256-GCM encrypted payload only. Plaintext provider credentials are forbidden.';
