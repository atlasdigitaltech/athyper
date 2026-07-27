-- ============================================================================
-- Meta Entity Contract M3: atomic publication evidence and plane artifacts.
-- ============================================================================

ALTER TABLE control.entity_publish_state
    ADD COLUMN IF NOT EXISTS contract_hash text,
    ADD COLUMN IF NOT EXISTS materialized_hash text,
    ADD COLUMN IF NOT EXISTS admin_compiled_hash text,
    ADD COLUMN IF NOT EXISTS neon_compiled_hash text,
    ADD COLUMN IF NOT EXISTS mesh_compiled_hash text,
    ADD COLUMN IF NOT EXISTS readiness_status text NOT NULL DEFAULT 'NOT_READY',
    ADD COLUMN IF NOT EXISTS readiness_diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ready_at timestamptz;

CREATE TABLE IF NOT EXISTS control.entity_contract_transition (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid,
    entity_id           uuid        NOT NULL,
    entity_version_id   uuid        NOT NULL,
    transition          text        NOT NULL,
    principal_id        uuid        NOT NULL,
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    before_hash         text,
    after_hash          text,
    contract_diff       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    reason              text,
    ticket_reference    text,
    request_key         text,
    source_version_id   uuid,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT ect_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS snapshot.entity_plane_compiled (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid,
    entity_version_id   uuid        NOT NULL,
    plane_key           text        NOT NULL,
    contract_hash       text        NOT NULL,
    materialized_hash   text        NOT NULL,
    compiled_json       jsonb       NOT NULL,
    compiled_hash       text        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    CONSTRAINT epc_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE control.entity_contract_transition IS
    'Append-only evidence for every Contract workflow transition, including principal, hashes and canonical diff.';
COMMENT ON TABLE snapshot.entity_plane_compiled IS
    'Immutable Admin, Neon and Mesh descriptor artifacts produced inside the metadata publication transaction.';

