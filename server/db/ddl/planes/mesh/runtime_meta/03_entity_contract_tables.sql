-- Read-only projection of Entity Studio publications required by the Mesh
-- runtime. Authoring and compilation remain exclusively in Athyper.
CREATE TABLE runtime_meta.entity_contract (
    id                          uuid                                  NOT NULL,
    entity_id                   uuid                                  NOT NULL,
    entity_code                 text                                  NOT NULL,
    version_no                  bigint                                NOT NULL,
    entity_contract_hash        text                                  NOT NULL,
    source_compiled_artifact_id uuid                                  NOT NULL,
    source_compiled_hash        text                                  NOT NULL,
    contract_json               jsonb                                 NOT NULL,
    published_at                timestamptz                           NOT NULL,
    received_at                 timestamptz                           NOT NULL DEFAULT now(),
    status                      runtime_meta.entity_contract_status_d NOT NULL DEFAULT 'published',
    status_changed_at           timestamptz,

    CONSTRAINT entity_contract_pkey PRIMARY KEY (id),
    CONSTRAINT entity_contract_entity_version_uq UNIQUE (entity_id, version_no),
    CONSTRAINT entity_contract_coordinate_uq
        UNIQUE (entity_id, id, entity_contract_hash),
    CONSTRAINT entity_contract_code_chk
        CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_contract_version_chk CHECK (version_no > 0),
    CONSTRAINT entity_contract_hash_chk
        CHECK (entity_contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_contract_compiled_hash_chk
        CHECK (source_compiled_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_contract_json_object_chk
        CHECK (jsonb_typeof(contract_json) = 'object'),
    CONSTRAINT entity_contract_time_chk CHECK (received_at >= published_at),
    CONSTRAINT entity_contract_status_time_chk CHECK (
        (status = 'published' AND status_changed_at IS NULL)
        OR (status <> 'published' AND status_changed_at IS NOT NULL)
    )
);

COMMENT ON TABLE runtime_meta.entity_contract IS
  'Immutable Mesh runtime projection of Athyper Entity Studio publications. It is a trust anchor, not a second metadata authoring authority.';
