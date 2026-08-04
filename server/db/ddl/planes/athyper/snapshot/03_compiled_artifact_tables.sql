CREATE TABLE snapshot.compiled_artifact (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid        NOT NULL,
    source_snapshot_id   uuid        NOT NULL,
    entity_type          text        NOT NULL,
    entity_id            uuid        NOT NULL,
    artifact_kind        text        NOT NULL,
    artifact_scope       text        NOT NULL,
    plane_key            text,
    overlay_set_hash     text,
    source_contract_hash text        NOT NULL,
    compiled_json        jsonb       NOT NULL,
    compiled_hash        text        NOT NULL,
    compliance_report    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    compliance_score     numeric(5,2),
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,

    CONSTRAINT compiled_artifact_pkey PRIMARY KEY (id),
    CONSTRAINT compiled_artifact_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT compiled_artifact_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id,
        source_snapshot_id,
        artifact_kind,
        artifact_scope,
        plane_key,
        overlay_set_hash
    ),
    CONSTRAINT compiled_artifact_entity_type_chk
        CHECK (entity_type ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT compiled_artifact_kind_chk
        CHECK (artifact_kind ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT compiled_artifact_scope_chk CHECK (
        (artifact_scope = 'base'
            AND plane_key IS NULL
            AND overlay_set_hash IS NULL)
        OR (artifact_scope = 'overlay'
            AND plane_key IS NULL
            AND overlay_set_hash IS NOT NULL)
        OR (artifact_scope = 'plane'
            AND plane_key IS NOT NULL
            AND overlay_set_hash IS NULL)
    ),
    CONSTRAINT compiled_artifact_plane_chk CHECK (
        plane_key IS NULL OR plane_key IN ('athyper', 'neon', 'mesh')
    ),
    CONSTRAINT compiled_artifact_overlay_hash_chk CHECK (
        overlay_set_hash IS NULL OR overlay_set_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT compiled_artifact_contract_hash_chk
        CHECK (source_contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT compiled_artifact_compiled_hash_chk
        CHECK (compiled_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT compiled_artifact_json_chk
        CHECK (jsonb_typeof(compiled_json) = 'object'),
    CONSTRAINT compiled_artifact_compliance_chk
        CHECK (jsonb_typeof(compliance_report) = 'object'),
    CONSTRAINT compiled_artifact_score_chk
        CHECK (
            compliance_score IS NULL
            OR compliance_score BETWEEN 0 AND 100
        )
);

COMMENT ON TABLE snapshot.compiled_artifact IS
  'Admin-authored immutable compiled output for one source entity snapshot. Base, overlay, and plane artifacts share one canonical contract.';
