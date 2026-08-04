CREATE TABLE snapshot.entity_release_artifact (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid,
    source_release_id     uuid        NOT NULL,
    source_revision_id    uuid        NOT NULL,
    entity_id             uuid        NOT NULL,
    plane_key             text        NOT NULL,
    release_hash          text        NOT NULL,
    contract_hash         text        NOT NULL,
    compiled_json         jsonb       NOT NULL,
    compiled_hash         text        NOT NULL,
    compliance_report     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT entity_release_artifact_pkey PRIMARY KEY (id),
    CONSTRAINT entity_release_artifact_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_release_artifact_coordinate_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, source_release_id, plane_key),
    CONSTRAINT entity_release_artifact_plane_chk
        CHECK (plane_key IN ('neon', 'mesh')),
    CONSTRAINT entity_release_artifact_release_hash_chk
        CHECK (release_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_release_artifact_contract_hash_chk
        CHECK (contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_release_artifact_compiled_hash_chk
        CHECK (compiled_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_release_artifact_json_chk
        CHECK (jsonb_typeof(compiled_json) = 'object'),
    CONSTRAINT entity_release_artifact_compliance_chk
        CHECK (jsonb_typeof(compliance_report) = 'object')
);

COMMENT ON TABLE snapshot.entity_release_artifact IS
  'Immutable Neon/Mesh artifact compiled from one normalized Meta Entity release. Supports both global package releases and tenant-owned releases without overloading business-record snapshots.';
