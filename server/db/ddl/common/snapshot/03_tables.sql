CREATE TABLE snapshot.entity_snapshot_identity (
    id                      uuid                       NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid                       NOT NULL,
    entity_type             text                       NOT NULL,
    entity_id               uuid                       NOT NULL,
    entity_code             text,
    version_number          integer                    NOT NULL,
    payload_schema_version  integer                    NOT NULL,
    entity_contract_hash    text                       NOT NULL,
    source_record_version   bigint,
    capture_event           text                       NOT NULL,
    capture_kind            snapshot.capture_kind_d    NOT NULL,
    payload_hash            text                       NOT NULL,
    previous_snapshot_id    uuid,
    previous_payload_hash   text,
    chain_seq               integer                    NOT NULL,
    correlation_id          uuid,
    audit_event_id          uuid,
    valid_from              timestamptz,
    valid_until             timestamptz,
    retention_class         snapshot.retention_class_d NOT NULL DEFAULT 'standard',
    payload_size_bytes      bigint                     NOT NULL,
    captured_at             timestamptz                NOT NULL DEFAULT now(),
    captured_by             uuid                       NOT NULL,
    capture_source          text                       NOT NULL DEFAULT 'application',

    CONSTRAINT entity_snapshot_identity_pkey PRIMARY KEY (tenant_id, id),
    CONSTRAINT entity_snapshot_identity_id_time_uq
        UNIQUE (tenant_id, id, captured_at),
    CONSTRAINT entity_snapshot_identity_entity_version_uq
        UNIQUE (tenant_id, entity_type, entity_id, version_number),
    CONSTRAINT entity_snapshot_identity_entity_hash_uq
        UNIQUE (tenant_id, entity_type, entity_id, payload_hash),
    CONSTRAINT entity_snapshot_identity_type_chk
        CHECK (entity_type ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_snapshot_identity_code_chk
        CHECK (entity_code IS NULL OR btrim(entity_code) <> ''),
    CONSTRAINT entity_snapshot_identity_version_chk
        CHECK (version_number >= 1),
    CONSTRAINT entity_snapshot_identity_payload_schema_chk
        CHECK (payload_schema_version >= 1),
    CONSTRAINT entity_snapshot_identity_contract_hash_chk
        CHECK (entity_contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_snapshot_identity_source_version_chk
        CHECK (source_record_version IS NULL OR source_record_version >= 1),
    CONSTRAINT entity_snapshot_identity_event_chk
        CHECK (capture_event ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_snapshot_identity_payload_hash_chk
        CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_snapshot_identity_previous_hash_chk
        CHECK (
            previous_payload_hash IS NULL
            OR previous_payload_hash ~ '^[a-f0-9]{64}$'
        ),
    CONSTRAINT entity_snapshot_identity_previous_pair_chk
        CHECK (
            (previous_snapshot_id IS NULL)
            = (previous_payload_hash IS NULL)
        ),
    CONSTRAINT entity_snapshot_identity_chain_chk
        CHECK (
            chain_seq >= 1
            AND (
                (chain_seq = 1 AND previous_snapshot_id IS NULL)
                OR (chain_seq > 1 AND previous_snapshot_id IS NOT NULL)
            )
        ),
    CONSTRAINT entity_snapshot_identity_no_self_previous_chk
        CHECK (previous_snapshot_id IS DISTINCT FROM id),
    CONSTRAINT entity_snapshot_identity_valid_range_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
    CONSTRAINT entity_snapshot_identity_payload_size_chk
        CHECK (payload_size_bytes > 0),
    CONSTRAINT entity_snapshot_identity_source_chk
        CHECK (capture_source ~ '^[a-z][a-z0-9_.:-]{1,126}$')
);

CREATE TABLE snapshot.entity_snapshot (
    tenant_id    uuid        NOT NULL,
    snapshot_id  uuid        NOT NULL,
    captured_at  timestamptz NOT NULL,
    payload_json jsonb       NOT NULL,

    CONSTRAINT entity_snapshot_pkey
        PRIMARY KEY (tenant_id, snapshot_id, captured_at),
    CONSTRAINT entity_snapshot_payload_object_chk
        CHECK (jsonb_typeof(payload_json) = 'object')
);

COMMENT ON TABLE snapshot.entity_snapshot_identity IS
  'Stable, compact identity and evidence header for every immutable business-entity version. Operational FKs target (tenant_id, id).';

COMMENT ON TABLE snapshot.entity_snapshot IS
  'Large immutable JSON payload for one entity_snapshot_identity. captured_at is duplicated intentionally so this table can be range-partitioned later without changing operational snapshot FKs.';

COMMENT ON COLUMN snapshot.entity_snapshot_identity.entity_type IS
  'Stable schema-qualified logical type such as master.template, document.purchase_order, control.lifecycle, or mesh.catalog.';

COMMENT ON COLUMN snapshot.entity_snapshot_identity.entity_contract_hash IS
  'SHA-256 of the entity payload contract used to create this version.';

COMMENT ON COLUMN snapshot.entity_snapshot_identity.payload_hash IS
  'SHA-256 of canonical snapshot coordinates, payload, and predecessor evidence.';

COMMENT ON COLUMN snapshot.entity_snapshot_identity.audit_event_id IS
  'Canonical audit.audit_log event that caused this snapshot. No FK is possible because audit evidence is time-partitioned with a composite key.';
