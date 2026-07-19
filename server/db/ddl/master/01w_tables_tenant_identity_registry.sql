-- master/01w_tables_tenant_identity_registry.sql
-- Tenant-aware identity routing metadata.
--
-- This registry contains only operational references and policy metadata. It
-- must never contain OIDC client secrets, SAML signing keys, access tokens, or
-- provider assertions. Keycloak/secret-manager remains authoritative for
-- sensitive provider configuration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.tenant_identity_provider (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    keycloak_alias          text            NOT NULL,
    realm_key               text            NOT NULL DEFAULT 'athyper',
    protocol                text            NOT NULL,
    provider_type           text            NOT NULL,
    display_name            text            NOT NULL,
    configuration_ref       text            NOT NULL,
    feature_gate            text            NOT NULL DEFAULT 'core',
    login_mode              text            NOT NULL DEFAULT 'optional',
    first_login_policy      text            NOT NULL DEFAULT 'existing-users-only',
    mfa_trust_policy        text            NOT NULL DEFAULT 'never',
    allowed_planes          text[]          NOT NULL DEFAULT ARRAY['neon']::text[],
    enabled                 boolean         NOT NULL DEFAULT false,
    configuration_version   integer         NOT NULL DEFAULT 1,
    activated_at            timestamptz,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tenant_identity_provider_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_identity_provider_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    CONSTRAINT tenant_identity_provider_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tenant_identity_provider_tenant_alias_uq UNIQUE (tenant_id, keycloak_alias),
    CONSTRAINT tenant_identity_provider_realm_key_chk CHECK (realm_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
    CONSTRAINT tenant_identity_provider_protocol_chk CHECK (protocol IN ('saml', 'oidc', 'kerberos')),
    CONSTRAINT tenant_identity_provider_type_chk CHECK (provider_type IN (
        'generic', 'entra-id', 'google-workspace', 'linkedin', 'okta', 'adfs',
        'ping', 'sap-identity', 'windows-kerberos'
    )),
    CONSTRAINT tenant_identity_provider_policy_chk CHECK (
        (provider_type <> 'google-workspace' OR protocol = 'oidc')
        AND (provider_type <> 'linkedin' OR (protocol = 'oidc' AND allowed_planes <@ ARRAY['mesh']::text[] AND mfa_trust_policy = 'never'))
        AND (provider_type <> 'adfs' OR protocol = 'saml')
        AND (provider_type <> 'windows-kerberos' OR protocol = 'kerberos')
    ),
    CONSTRAINT tenant_identity_provider_configuration_ref_chk CHECK (
        configuration_ref ~ '^[a-zA-Z0-9._:/-]{1,256}$'
    ),
    CONSTRAINT tenant_identity_provider_feature_gate_chk CHECK (
        feature_gate IN ('core', 'windows-kerberos')
        AND ((provider_type = 'windows-kerberos' AND protocol = 'kerberos' AND feature_gate = 'windows-kerberos')
          OR (provider_type <> 'windows-kerberos' AND feature_gate = 'core'))
    ),
    CONSTRAINT tenant_identity_provider_login_mode_chk CHECK (login_mode IN ('optional', 'preferred', 'exclusive')),
    CONSTRAINT tenant_identity_provider_first_login_chk CHECK (first_login_policy IN ('invite-only', 'jit', 'existing-users-only')),
    CONSTRAINT tenant_identity_provider_mfa_trust_chk CHECK (mfa_trust_policy IN ('never', 'conditional', 'trusted-assurance')),
    CONSTRAINT tenant_identity_provider_planes_chk CHECK (
        cardinality(allowed_planes) > 0
        AND allowed_planes <@ ARRAY['neon', 'mesh', 'admin']::text[]
    ),
    CONSTRAINT tenant_identity_provider_display_name_chk CHECK (btrim(display_name) <> ''),
    CONSTRAINT tenant_identity_provider_alias_chk CHECK (keycloak_alias ~ '^[a-zA-Z0-9._-]{1,128}$')
);

CREATE TABLE IF NOT EXISTS master.tenant_identity_domain (
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,
    provider_id         uuid            NOT NULL,
    domain              text            NOT NULL,
    verification_status text            NOT NULL DEFAULT 'pending',
    verification_method text,
    verified_at         timestamptz,
    enabled             boolean         NOT NULL DEFAULT false,
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT tenant_identity_domain_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_identity_domain_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    CONSTRAINT tenant_identity_domain_tenant_domain_uq UNIQUE (tenant_id, domain),
    CONSTRAINT tenant_identity_domain_provider_fk
        FOREIGN KEY (tenant_id, provider_id)
        REFERENCES master.tenant_identity_provider (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT tenant_identity_domain_status_chk CHECK (verification_status IN ('pending', 'verified', 'revoked')),
    CONSTRAINT tenant_identity_domain_domain_chk CHECK (
        domain = lower(btrim(domain))
        AND domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:[.][a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    ),
    CONSTRAINT tenant_identity_domain_verified_chk CHECK (
        (verification_status = 'verified' AND verified_at IS NOT NULL)
        OR verification_status <> 'verified'
    )
);

CREATE INDEX IF NOT EXISTS tenant_identity_domain_lookup_idx
    ON master.tenant_identity_domain (domain)
    WHERE verification_status = 'verified' AND enabled = true;

CREATE INDEX IF NOT EXISTS tenant_identity_provider_plane_idx
    ON master.tenant_identity_provider USING gin (allowed_planes)
    WHERE enabled = true;

COMMENT ON TABLE master.tenant_identity_provider IS
    'Tenant IdP routing metadata. Secrets and provider credentials remain in Keycloak or the secret manager.';

COMMENT ON TABLE master.tenant_identity_domain IS
    'Verified email-domain routing hints. A domain match selects an authentication route only; it never grants tenant membership.';

-- Existing installations may have created the Phase 3 registry before the
-- provider foundation fields were introduced.
ALTER TABLE master.tenant_identity_provider
    ADD COLUMN IF NOT EXISTS configuration_ref text;
ALTER TABLE master.tenant_identity_provider
    ADD COLUMN IF NOT EXISTS provider_type text NOT NULL DEFAULT 'generic';
ALTER TABLE master.tenant_identity_provider
    ADD COLUMN IF NOT EXISTS feature_gate text NOT NULL DEFAULT 'core';

UPDATE master.tenant_identity_provider
SET configuration_ref = COALESCE(NULLIF(configuration_ref, ''), 'keycloak/' || keycloak_alias)
WHERE configuration_ref IS NULL OR configuration_ref = '';

ALTER TABLE master.tenant_identity_provider
    ALTER COLUMN configuration_ref SET NOT NULL;

DO $$ BEGIN
    ALTER TABLE master.tenant_identity_provider
        ADD CONSTRAINT tenant_identity_provider_type_chk CHECK (provider_type IN (
            'generic', 'entra-id', 'google-workspace', 'linkedin', 'okta', 'adfs',
            'ping', 'sap-identity', 'windows-kerberos'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.tenant_identity_provider
        ADD CONSTRAINT tenant_identity_provider_configuration_ref_chk CHECK (
            configuration_ref ~ '^[a-zA-Z0-9._:/-]{1,256}$'
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.tenant_identity_provider
        ADD CONSTRAINT tenant_identity_provider_feature_gate_chk CHECK (
            feature_gate IN ('core', 'windows-kerberos')
            AND ((provider_type = 'windows-kerberos' AND protocol = 'kerberos' AND feature_gate = 'windows-kerberos')
              OR (provider_type <> 'windows-kerberos' AND feature_gate = 'core'))
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.tenant_identity_provider
        ADD CONSTRAINT tenant_identity_provider_policy_chk CHECK (
            (provider_type <> 'google-workspace' OR protocol = 'oidc')
            AND (provider_type <> 'linkedin' OR (protocol = 'oidc' AND allowed_planes <@ ARRAY['mesh']::text[] AND mfa_trust_policy = 'never'))
            AND (provider_type <> 'adfs' OR protocol = 'saml')
            AND (provider_type <> 'windows-kerberos' OR protocol = 'kerberos')
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
