CREATE TABLE snapshot.template_version (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL,
    template_id        uuid        NOT NULL,
    version            integer     NOT NULL,
    locale_code        text        NOT NULL DEFAULT 'en',
    content_html       text,
    content_json       jsonb,
    styles_css         text,
    variables_schema   jsonb,
    assets_manifest    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    checksum           text        NOT NULL,
    effective_from     date,
    effective_to       date,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL,

    CONSTRAINT template_version_pkey PRIMARY KEY (id),
    CONSTRAINT template_version_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT template_version_template_id_uq
        UNIQUE (tenant_id, template_id, id),
    CONSTRAINT template_version_number_uq
        UNIQUE (tenant_id, template_id, locale_code, version),
    CONSTRAINT template_version_checksum_uq
        UNIQUE (tenant_id, template_id, locale_code, checksum),
    CONSTRAINT template_version_number_chk CHECK (version >= 1),
    CONSTRAINT template_version_locale_fmt_chk
        CHECK (locale_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
    CONSTRAINT template_version_content_chk
        CHECK (
            (content_html IS NOT NULL)::integer
            + (content_json IS NOT NULL)::integer = 1
        ),
    CONSTRAINT template_version_content_html_chk
        CHECK (content_html IS NULL OR btrim(content_html) <> ''),
    CONSTRAINT template_version_content_json_chk
        CHECK (
            content_json IS NULL
            OR jsonb_typeof(content_json) IN ('object', 'array')
        ),
    CONSTRAINT template_version_variables_schema_chk
        CHECK (
            variables_schema IS NULL
            OR jsonb_typeof(variables_schema) = 'object'
        ),
    CONSTRAINT template_version_assets_manifest_chk
        CHECK (jsonb_typeof(assets_manifest) = 'object'),
    CONSTRAINT template_version_checksum_fmt_chk
        CHECK (checksum ~ '^[a-f0-9]{64}$'),
    CONSTRAINT template_version_effective_range_chk
        CHECK (
            effective_to IS NULL
            OR effective_from IS NULL
            OR effective_to >= effective_from
        )
);

COMMENT ON TABLE snapshot.template_version IS
  'Immutable locale-specific template content version. UPDATE and DELETE are rejected by a database trigger.';

COMMENT ON COLUMN snapshot.template_version.checksum IS
  'Lowercase SHA-256 checksum of the canonical content payload.';

CREATE TABLE snapshot.content_item_version (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    content_item_id uuid        NOT NULL,
    version         integer     NOT NULL,
    body_json       jsonb       NOT NULL,
    body_format     text        NOT NULL DEFAULT 'slate',
    change_summary  text,
    checksum        text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT content_item_version_pkey PRIMARY KEY (id),
    CONSTRAINT content_item_version_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT content_item_version_item_id_uq
        UNIQUE (tenant_id, content_item_id, id),
    CONSTRAINT content_item_version_number_uq
        UNIQUE (tenant_id, content_item_id, version),
    CONSTRAINT content_item_version_checksum_uq
        UNIQUE (tenant_id, content_item_id, checksum),
    CONSTRAINT content_item_version_number_chk CHECK (version >= 1),
    CONSTRAINT content_item_version_body_chk
        CHECK (jsonb_typeof(body_json) IN ('object', 'array')),
    CONSTRAINT content_item_version_format_chk
        CHECK (body_format IN ('slate', 'prosemirror', 'html', 'markdown')),
    CONSTRAINT content_item_version_summary_chk
        CHECK (change_summary IS NULL OR length(change_summary) <= 2048),
    CONSTRAINT content_item_version_checksum_chk
        CHECK (checksum ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE snapshot.content_item_version IS
  'Immutable content body snapshot. UPDATE and DELETE are rejected by trigger.';

CREATE TABLE snapshot.business_partner_definition_revision (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    bundle_code text NOT NULL,
    semantic_version text NOT NULL,
    bundle_schema_version text NOT NULL DEFAULT '1.0.0',
    bundle_json jsonb NOT NULL,
    bundle_hash text NOT NULL,
    target_planes text[] NOT NULL,
    idempotency_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by uuid NOT NULL,
    CONSTRAINT business_partner_definition_revision_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_definition_revision_tenant_id_uq UNIQUE (tenant_id,id),
    CONSTRAINT business_partner_definition_revision_version_uq UNIQUE (tenant_id,bundle_code,semantic_version),
    CONSTRAINT business_partner_definition_revision_idempotency_uq UNIQUE (tenant_id,idempotency_key),
    CONSTRAINT business_partner_definition_revision_code_chk CHECK (bundle_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT business_partner_definition_revision_semver_chk CHECK (semantic_version ~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.-]+)?$'),
    CONSTRAINT business_partner_definition_revision_schema_chk CHECK (bundle_schema_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
    CONSTRAINT business_partner_definition_revision_hash_chk CHECK (bundle_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT business_partner_definition_revision_bundle_chk CHECK (
      jsonb_typeof(bundle_json)='object'
      AND bundle_json->>'schema'='athyper.business-partner-definition-bundle.v1'
      AND bundle_json->>'bundleCode'=bundle_code
      AND bundle_json->>'semanticVersion'=semantic_version
      AND bundle_json ?& ARRAY['requestSchemas','validationDeclarations','formDescriptors','viewDescriptors','mappingContracts','workflowDefinitions','compatibilityRules','sourceContractHashes']
    ),
    CONSTRAINT business_partner_definition_revision_targets_chk CHECK (
      cardinality(target_planes)>0 AND target_planes <@ ARRAY['studio','neon','mesh']::text[]
    ),
    CONSTRAINT business_partner_definition_revision_idempotency_chk CHECK (btrim(idempotency_key)<>'')
);

COMMENT ON TABLE snapshot.business_partner_definition_revision IS
  'Immutable STUDIO-authored schemas, mappings, UI descriptors, and workflow definitions. Contains no partner instance or approval data.';

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
        plane_key IS NULL OR plane_key IN ('studio', 'neon', 'mesh')
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

CREATE TABLE snapshot.entity_contract_test_run (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    source_tenant_id uuid,
    entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL,
    revision_id uuid,
    source_lock_version bigint NOT NULL,
    contract_schema_code text NOT NULL,
    contract_schema_version text NOT NULL,
    source_contract_json jsonb NOT NULL,
    source_contract_hash text NOT NULL,
    runner_code text NOT NULL,
    runner_version text NOT NULL,
    status snapshot.entity_contract_test_run_status_d NOT NULL,
    total_count integer NOT NULL,
    passed_count integer NOT NULL,
    failed_count integer NOT NULL,
    error_count integer NOT NULL,
    duration_ms integer NOT NULL,
    run_hash text NOT NULL,
    audit_event_id uuid,
    correlation_id uuid,
    executed_at timestamptz NOT NULL DEFAULT now(),
    executed_by uuid NOT NULL,
    CONSTRAINT entity_contract_test_run_pkey PRIMARY KEY (id),
    CONSTRAINT entity_contract_test_run_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT entity_contract_test_run_schema_code_chk CHECK (contract_schema_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_contract_test_run_schema_version_chk CHECK (contract_schema_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?$'),
    CONSTRAINT entity_contract_test_run_source_chk CHECK (jsonb_typeof(source_contract_json) = 'object'),
    CONSTRAINT entity_contract_test_run_source_hash_chk CHECK (source_contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_contract_test_run_runner_code_chk CHECK (runner_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_contract_test_run_runner_version_chk CHECK (runner_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?$'),
    CONSTRAINT entity_contract_test_run_counts_chk CHECK (
        total_count >= 0 AND passed_count >= 0 AND failed_count >= 0 AND error_count >= 0
        AND total_count = passed_count + failed_count + error_count
    ),
    CONSTRAINT entity_contract_test_run_duration_chk CHECK (duration_ms >= 0),
    CONSTRAINT entity_contract_test_run_hash_chk CHECK (run_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE snapshot.entity_contract_test_result (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    test_run_id uuid NOT NULL,
    ordinal integer NOT NULL,
    test_case_id uuid NOT NULL,
    test_key text NOT NULL,
    test_kind metadata.entity_contract_test_kind_d NOT NULL,
    target_plane text,
    definition_json jsonb NOT NULL,
    definition_hash text NOT NULL,
    expected_outcome metadata.entity_contract_test_outcome_d NOT NULL,
    actual_outcome snapshot.entity_contract_test_actual_outcome_d NOT NULL,
    assertion_passed boolean NOT NULL,
    diagnostic_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
    diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
    actual_output jsonb NOT NULL DEFAULT '{}'::jsonb,
    duration_ms integer NOT NULL,
    result_hash text NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT entity_contract_test_result_pkey PRIMARY KEY (id),
    CONSTRAINT entity_contract_test_result_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT entity_contract_test_result_coordinate_uq UNIQUE (tenant_id, test_run_id, ordinal),
    CONSTRAINT entity_contract_test_result_case_uq UNIQUE (tenant_id, test_run_id, test_case_id),
    CONSTRAINT entity_contract_test_result_ordinal_chk CHECK (ordinal >= 0),
    CONSTRAINT entity_contract_test_result_key_chk CHECK (test_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_contract_test_result_plane_chk CHECK (target_plane IS NULL OR target_plane IN ('studio', 'neon', 'mesh')),
    CONSTRAINT entity_contract_test_result_definition_chk CHECK (jsonb_typeof(definition_json) = 'object'),
    CONSTRAINT entity_contract_test_result_definition_hash_chk CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_contract_test_result_diagnostics_chk CHECK (jsonb_typeof(diagnostics) = 'array' AND array_position(diagnostic_codes, NULL) IS NULL),
    CONSTRAINT entity_contract_test_result_output_chk CHECK (jsonb_typeof(actual_output) = 'object'),
    CONSTRAINT entity_contract_test_result_duration_chk CHECK (duration_ms >= 0),
    CONSTRAINT entity_contract_test_result_hash_chk CHECK (result_hash ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE snapshot.entity_contract_test_run IS 'Immutable execution envelope containing the exact canonical Entity contract evaluated by the contract-test runner.';
COMMENT ON TABLE snapshot.entity_contract_test_result IS 'Immutable per-case assertion evidence; it preserves the test definition and output independently of mutable metadata fixtures.';

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
        CHECK (plane_key IN ('studio', 'neon', 'mesh')),
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
  'Immutable Studio/Neon/Mesh artifact compiled from one normalized Meta Entity release. Supports both global package releases and tenant-owned releases without overloading business-record snapshots.';
