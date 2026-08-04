CREATE TABLE snapshot.entity_numbering_test_artifact (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    source_tenant_id      uuid,
    entity_id             uuid        NOT NULL,
    change_set_id         uuid        NOT NULL,
    source_lock_version   bigint      NOT NULL,
    numbering_binding_id  uuid        NOT NULL,
    binding_key           text        NOT NULL,
    target_plane          text        NOT NULL,
    field_key             text        NOT NULL,
    operation_key         text,
    policy_code           text        NOT NULL,
    policy_revision       integer     NOT NULL,
    policy_source         text,
    binding_contract_json jsonb       NOT NULL,
    policy_contract_json  jsonb,
    preview_input_json    jsonb       NOT NULL,
    actual_output_json    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    diagnostic_codes      text[]      NOT NULL DEFAULT ARRAY[]::text[],
    diagnostics           jsonb       NOT NULL DEFAULT '[]'::jsonb,
    status                text        NOT NULL,
    binding_contract_hash text        NOT NULL,
    policy_contract_hash  text,
    preview_input_hash    text        NOT NULL,
    actual_output_hash    text        NOT NULL,
    artifact_hash         text        NOT NULL,
    audit_event_id        uuid,
    correlation_id        uuid,
    executed_at           timestamptz NOT NULL DEFAULT now(),
    executed_by           uuid        NOT NULL,

    CONSTRAINT entity_numbering_test_artifact_pkey PRIMARY KEY (id),
    CONSTRAINT entity_numbering_test_artifact_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT entity_numbering_test_artifact_binding_key_chk CHECK (binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_numbering_test_artifact_plane_chk CHECK (target_plane IN ('neon','mesh')),
    CONSTRAINT entity_numbering_test_artifact_field_key_chk CHECK (field_key ~ '^[a-z][a-z0-9_]{1,126}$'),
    CONSTRAINT entity_numbering_test_artifact_operation_key_chk CHECK (operation_key IS NULL OR operation_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_numbering_test_artifact_policy_code_chk CHECK (policy_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_numbering_test_artifact_policy_revision_chk CHECK (policy_revision >= 1),
    CONSTRAINT entity_numbering_test_artifact_policy_source_chk CHECK (policy_source IS NULL OR policy_source IN ('tenant','global')),
    CONSTRAINT entity_numbering_test_artifact_status_chk CHECK (status IN ('passed','failed')),
    CONSTRAINT entity_numbering_test_artifact_json_chk CHECK (
        jsonb_typeof(binding_contract_json) = 'object'
        AND (policy_contract_json IS NULL OR jsonb_typeof(policy_contract_json) = 'object')
        AND jsonb_typeof(preview_input_json) = 'object'
        AND jsonb_typeof(actual_output_json) = 'object'
        AND jsonb_typeof(diagnostics) = 'array'
    ),
    CONSTRAINT entity_numbering_test_artifact_outcome_chk CHECK (
        (status = 'passed' AND policy_contract_json IS NOT NULL AND policy_source IS NOT NULL AND cardinality(diagnostic_codes) = 0)
        OR status = 'failed'
    ),
    CONSTRAINT entity_numbering_test_artifact_hashes_chk CHECK (
        binding_contract_hash ~ '^[a-f0-9]{64}$'
        AND (policy_contract_hash IS NULL OR policy_contract_hash ~ '^[a-f0-9]{64}$')
        AND preview_input_hash ~ '^[a-f0-9]{64}$'
        AND actual_output_hash ~ '^[a-f0-9]{64}$'
        AND artifact_hash ~ '^[a-f0-9]{64}$'
    )
);

COMMENT ON TABLE snapshot.entity_numbering_test_artifact IS
  'Immutable evidence for an Admin Studio numbering-policy preview. It preserves the exact metadata binding, resolved consumer policy, inputs, output, and diagnostics without advancing a runtime counter.';

