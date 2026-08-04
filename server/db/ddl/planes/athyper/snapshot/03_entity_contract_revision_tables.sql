-- Athyper-only immutable Entity authoring checkpoint. This permits platform
-- definitions (tenant_id IS NULL), unlike the tenant-only business snapshot.
CREATE TABLE snapshot.entity_contract_revision (
    id                       uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid,
    entity_id                uuid                                  NOT NULL,
    change_set_id            uuid                                  NOT NULL,
    revision_no              integer                               NOT NULL,
    parent_revision_id       uuid,
    parent_revision_hash     text,
    base_release_id          uuid,
    contract_schema_code     text                                  NOT NULL,
    contract_schema_version  text                                  NOT NULL,
    contract_json            jsonb                                 NOT NULL,
    contract_hash            text                                  NOT NULL,
    revision_hash            text                                  NOT NULL,
    payload_size_bytes       bigint                                NOT NULL,
    changed_paths            text[]                                NOT NULL DEFAULT ARRAY[]::text[],
    compatibility_level      metadata.compatibility_level_d        NOT NULL DEFAULT 'backward_compatible',
    validation_status        metadata.contract_validation_status_d NOT NULL DEFAULT 'pending',
    validation_diagnostics   jsonb                                 NOT NULL DEFAULT '[]'::jsonb,
    audit_event_id           uuid,
    correlation_id           uuid,
    captured_at              timestamptz                           NOT NULL DEFAULT now(),
    captured_by              uuid                                  NOT NULL,

    CONSTRAINT entity_contract_revision_pkey PRIMARY KEY (id),
    CONSTRAINT entity_contract_revision_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_contract_revision_coordinate_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, revision_no),
    CONSTRAINT entity_contract_revision_no_chk CHECK (revision_no >= 1),
    CONSTRAINT entity_contract_revision_parent_pair_chk CHECK (
        (parent_revision_id IS NULL) = (parent_revision_hash IS NULL)
    ),
    CONSTRAINT entity_contract_revision_chain_chk CHECK (
        (revision_no = 1 AND parent_revision_id IS NULL)
        OR (revision_no > 1 AND parent_revision_id IS NOT NULL)
    ),
    CONSTRAINT entity_contract_revision_no_self_parent_chk
        CHECK (parent_revision_id IS DISTINCT FROM id),
    CONSTRAINT entity_contract_revision_parent_hash_chk CHECK (
        parent_revision_hash IS NULL
        OR parent_revision_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT entity_contract_revision_schema_code_chk
        CHECK (contract_schema_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_contract_revision_schema_version_chk
        CHECK (contract_schema_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?$'),
    CONSTRAINT entity_contract_revision_contract_object_chk
        CHECK (jsonb_typeof(contract_json) = 'object'),
    CONSTRAINT entity_contract_revision_contract_hash_chk
        CHECK (contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_contract_revision_hash_chk
        CHECK (revision_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_contract_revision_payload_size_chk
        CHECK (payload_size_bytes > 0),
    CONSTRAINT entity_contract_revision_changed_paths_chk CHECK (
        array_position(changed_paths, NULL) IS NULL
    ),
    CONSTRAINT entity_contract_revision_diagnostics_chk
        CHECK (jsonb_typeof(validation_diagnostics) = 'array')
);

COMMENT ON TABLE snapshot.entity_contract_revision IS
  'Immutable hash-chained checkpoint generated from one normalized metadata Entity change set. It is revision state, not audit evidence.';
COMMENT ON COLUMN snapshot.entity_contract_revision.audit_event_id IS
  'Canonical audit.audit_log event for the durable checkpoint. No FK is possible because audit evidence is time partitioned.';
