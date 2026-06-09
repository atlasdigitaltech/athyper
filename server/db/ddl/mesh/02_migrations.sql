-- ============================================================================
-- mesh/02_migrations.sql
-- Additive column and index migrations for the Mesh schema.
--
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so this file
-- is safe to re-run against a database that already has these changes.
-- ============================================================================

-- network_account: multi-provider support + participant link
ALTER TABLE mesh.network_account
    ADD COLUMN IF NOT EXISTS provider_code  text NOT NULL DEFAULT 'athyper_mesh',
    ADD COLUMN IF NOT EXISTS participant_id uuid,
    ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS mesh_network_account_provider_idx
    ON mesh.network_account (provider_code, account_code);
CREATE INDEX IF NOT EXISTS mesh_network_account_participant_idx
    ON mesh.network_account (participant_id, status);

-- account_grant: canonical principal-to-account access relation.
CREATE TABLE IF NOT EXISTS mesh.account_grant (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    account_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    role_code text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by text NOT NULL DEFAULT 'system',
    revoked_at timestamptz,
    revoked_by text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL DEFAULT 'system',
    updated_at timestamptz,
    updated_by text,
    CONSTRAINT mesh_account_grant_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_account_grant_active_uq
    ON mesh.account_grant (account_id, principal_id, role_code)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS mesh_account_grant_principal_idx
    ON mesh.account_grant (principal_id, status);

-- document_envelope: document type registry link + AV scan tracking
ALTER TABLE mesh.document_envelope
    ADD COLUMN IF NOT EXISTS document_type_id    uuid,
    ADD COLUMN IF NOT EXISTS payload_scan_status text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS payload_scanned_at  timestamptz;
