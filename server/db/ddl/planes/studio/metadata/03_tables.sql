-- Stable Entity identity. Editable contract properties belong to rows keyed by
-- entity_change_set in subsequent authoring phases, never on this table.
CREATE TABLE metadata.entity (
    id                  uuid                        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid,
    module_id           uuid                        NOT NULL,
    entity_code         text                        NOT NULL,
    entity_class        metadata.entity_class_d     NOT NULL,
    ownership_model     metadata.entity_ownership_d NOT NULL,
    status              metadata.entity_status_d    NOT NULL DEFAULT 'draft',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                  NOT NULL DEFAULT now(),
    created_by          uuid                         NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT entity_pkey PRIMARY KEY (id),
    CONSTRAINT entity_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_scope_code_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_code),
    CONSTRAINT entity_code_chk
        CHECK (entity_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT entity_ownership_scope_chk CHECK (
        (ownership_model IN ('system', 'package') AND tenant_id IS NULL)
        OR
        (ownership_model IN ('tenant', 'overlay') AND tenant_id IS NOT NULL)
    ),
    CONSTRAINT entity_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT entity_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity IS
  'Stable Entity identity. Labels, fields, storage, surfaces, operations, policies, and version state are deliberately excluded.';
COMMENT ON COLUMN metadata.entity.tenant_id IS
  'NULL for system/package definitions; populated for tenant definitions and overlays.';

-- Mutable authoring workspace. The normalized authoring graph added in later
-- phases is owned by this identifier.
CREATE TABLE metadata.entity_change_set (
    id                    uuid                                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid,
    entity_id             uuid                                NOT NULL,
    change_set_code       text                                NOT NULL,
    branch_code           text                                NOT NULL DEFAULT 'main',
    base_release_id       uuid,
    parent_change_set_id  uuid,
    status                metadata.entity_change_set_status_d NOT NULL DEFAULT 'draft',
    lock_version          bigint                              NOT NULL DEFAULT 0,
    title                 text                                NOT NULL,
    change_summary        text,
    change_reason_code    text,
    ticket_reference      text,
    submitted_at          timestamptz,
    submitted_by          uuid,
    reviewed_at           timestamptz,
    reviewed_by           uuid,
    approved_at           timestamptz,
    approved_by           uuid,
    rejected_at           timestamptz,
    rejected_by           uuid,
    rejection_reason      text,
    published_at          timestamptz,
    published_by          uuid,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                         NOT NULL DEFAULT now(),
    created_by            uuid                                NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT entity_change_set_pkey PRIMARY KEY (id),
    CONSTRAINT entity_change_set_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_change_set_entity_code_uq
        UNIQUE (entity_id, change_set_code),
    CONSTRAINT entity_change_set_code_chk
        CHECK (change_set_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_change_set_branch_chk
        CHECK (branch_code ~ '^[a-z][a-z0-9_./-]{0,126}$'),
    CONSTRAINT entity_change_set_lock_version_chk CHECK (lock_version >= 0),
    CONSTRAINT entity_change_set_title_chk
        CHECK (btrim(title) <> '' AND length(title) <= 256),
    CONSTRAINT entity_change_set_summary_chk CHECK (
        change_summary IS NULL
        OR (btrim(change_summary) <> '' AND length(change_summary) <= 4000)
    ),
    CONSTRAINT entity_change_set_reason_code_chk CHECK (
        change_reason_code IS NULL
        OR change_reason_code ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT entity_change_set_ticket_chk CHECK (
        ticket_reference IS NULL
        OR (btrim(ticket_reference) <> '' AND length(ticket_reference) <= 256)
    ),
    CONSTRAINT entity_change_set_submitted_pair_chk
        CHECK ((submitted_at IS NULL) = (submitted_by IS NULL)),
    CONSTRAINT entity_change_set_reviewed_pair_chk
        CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CONSTRAINT entity_change_set_approved_pair_chk
        CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT entity_change_set_rejected_pair_chk
        CHECK ((rejected_at IS NULL) = (rejected_by IS NULL)),
    CONSTRAINT entity_change_set_published_pair_chk
        CHECK ((published_at IS NULL) = (published_by IS NULL)),
    CONSTRAINT entity_change_set_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT entity_change_set_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT entity_change_set_decision_chk CHECK (
        (status = 'draft'
            AND approved_at IS NULL
            AND rejected_at IS NULL
            AND published_at IS NULL)
        OR (status = 'in_review'
            AND submitted_at IS NOT NULL
            AND approved_at IS NULL
            AND rejected_at IS NULL
            AND published_at IS NULL)
        OR (status = 'approved'
            AND submitted_at IS NOT NULL
            AND reviewed_at IS NOT NULL
            AND approved_at IS NOT NULL
            AND rejected_at IS NULL
            AND published_at IS NULL)
        OR (status = 'rejected'
            AND submitted_at IS NOT NULL
            AND reviewed_at IS NOT NULL
            AND rejected_at IS NOT NULL
            AND rejection_reason IS NOT NULL
            AND approved_at IS NULL
            AND published_at IS NULL)
        OR status = 'abandoned'
        OR (status = 'published'
            AND approved_at IS NOT NULL
            AND published_at IS NOT NULL)
    ),
    CONSTRAINT entity_change_set_rejection_reason_chk CHECK (
        rejection_reason IS NULL
        OR (btrim(rejection_reason) <> '' AND length(rejection_reason) <= 4000)
    ),
    CONSTRAINT entity_change_set_no_self_parent_chk
        CHECK (parent_change_set_id IS DISTINCT FROM id)
);

COMMENT ON TABLE metadata.entity_change_set IS
  'Mutable Entity authoring workspace. Only draft/rejected work may be edited; approved/published work is sealed by triggers.';
COMMENT ON COLUMN metadata.entity_change_set.lock_version IS
  'Optimistic-concurrency token incremented by the database on substantive updates.';

-- Append-only publication header. Contract JSON remains in the referenced
-- snapshot.entity_contract_revision.
CREATE TABLE metadata.entity_release (
    id                       uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid,
    entity_id                uuid                           NOT NULL,
    change_set_id            uuid                           NOT NULL,
    revision_id              uuid                           NOT NULL,
    release_no               bigint                         NOT NULL,
    version_label            text,
    release_kind             metadata.entity_release_kind_d NOT NULL DEFAULT 'publish',
    supersedes_release_id    uuid,
    rollback_of_release_id   uuid,
    contract_schema_code     text                           NOT NULL,
    contract_schema_version  text                           NOT NULL,
    contract_hash            text                           NOT NULL,
    revision_hash            text                           NOT NULL,
    release_hash             text                           NOT NULL,
    compatibility_level      metadata.compatibility_level_d NOT NULL,
    target_planes            text[]                         NOT NULL,
    minimum_runtime_version  text,
    signature_algorithm      text,
    signing_key_id           text,
    contract_signature       text,
    audit_event_id           uuid,
    publication_reason       text,
    ticket_reference         text,
    correlation_id           uuid,
    published_at             timestamptz                    NOT NULL DEFAULT now(),
    published_by             uuid                           NOT NULL,

    CONSTRAINT entity_release_pkey PRIMARY KEY (id),
    CONSTRAINT entity_release_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_release_coordinate_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_id, release_no),
    CONSTRAINT entity_release_no_chk CHECK (release_no >= 1),
    CONSTRAINT entity_release_version_label_chk CHECK (
        version_label IS NULL
        OR version_label ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$'
    ),
    CONSTRAINT entity_release_schema_code_chk
        CHECK (contract_schema_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_release_schema_version_chk
        CHECK (contract_schema_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?$'),
    CONSTRAINT entity_release_contract_hash_chk
        CHECK (contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_release_revision_hash_chk
        CHECK (revision_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_release_hash_chk
        CHECK (release_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_release_target_planes_chk CHECK (
        cardinality(target_planes) BETWEEN 1 AND 3
        AND array_position(target_planes, NULL) IS NULL
        AND target_planes <@ ARRAY['studio', 'neon', 'mesh']::text[]
    ),
    CONSTRAINT entity_release_minimum_runtime_chk CHECK (
        minimum_runtime_version IS NULL
        OR minimum_runtime_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[0-9A-Za-z.-]+)?$'
    ),
    CONSTRAINT entity_release_signature_chk CHECK (
        (signature_algorithm IS NULL
            AND signing_key_id IS NULL
            AND contract_signature IS NULL)
        OR (signature_algorithm IS NOT NULL
            AND btrim(signature_algorithm) <> ''
            AND signing_key_id IS NOT NULL
            AND btrim(signing_key_id) <> ''
            AND contract_signature IS NOT NULL
            AND btrim(contract_signature) <> '')
    ),
    CONSTRAINT entity_release_reason_chk CHECK (
        publication_reason IS NULL
        OR (btrim(publication_reason) <> '' AND length(publication_reason) <= 4000)
    ),
    CONSTRAINT entity_release_ticket_chk CHECK (
        ticket_reference IS NULL
        OR (btrim(ticket_reference) <> '' AND length(ticket_reference) <= 256)
    ),
    CONSTRAINT entity_release_kind_chk CHECK (
        (release_kind = 'publish' AND rollback_of_release_id IS NULL)
        OR (release_kind = 'rollback' AND rollback_of_release_id IS NOT NULL)
        OR (release_kind = 'retire' AND rollback_of_release_id IS NULL)
    ),
    CONSTRAINT entity_release_first_or_successor_chk CHECK (
        (release_no = 1 AND supersedes_release_id IS NULL AND release_kind = 'publish')
        OR (release_no > 1 AND supersedes_release_id IS NOT NULL)
    ),
    CONSTRAINT entity_release_no_self_reference_chk CHECK (
        supersedes_release_id IS DISTINCT FROM id
        AND rollback_of_release_id IS DISTINCT FROM id
    )
);

COMMENT ON TABLE metadata.entity_release IS
  'Append-only official Entity publication, rollback, or retirement event. The latest release row derives current publication status.';
COMMENT ON COLUMN metadata.entity_release.audit_event_id IS
  'Canonical audit.audit_log identifier. No FK is possible because audit evidence uses a time-partitioned composite primary key.';
COMMENT ON COLUMN metadata.entity_release.contract_signature IS
  'Optional detached signature of release_hash using signature_algorithm and signing_key_id.';

-- Immutable platform defaults. Values are copied into a new runtime profile;
-- they are never resolved through live inheritance after authoring begins.
CREATE TABLE metadata.entity_class_profile (
    entity_class                 metadata.entity_class_d            NOT NULL,
    profile_version              integer                            NOT NULL DEFAULT 1,
    fallback_name                text                               NOT NULL,
    description                  text                               NOT NULL,
    default_backing_kind         metadata.entity_backing_kind_d     NOT NULL,
    default_api_exposure         metadata.entity_api_exposure_d     NOT NULL,
    default_read_mode            metadata.entity_read_mode_d        NOT NULL,
    default_write_mode           metadata.entity_write_mode_d       NOT NULL,
    default_concurrency_mode     metadata.entity_concurrency_mode_d NOT NULL,
    default_change_policy        metadata.entity_change_policy_d    NOT NULL,
    created_at                   timestamptz                        NOT NULL DEFAULT now(),
    created_by                   uuid                               NOT NULL,

    CONSTRAINT entity_class_profile_pkey PRIMARY KEY (entity_class),
    CONSTRAINT entity_class_profile_version_chk CHECK (profile_version >= 1),
    CONSTRAINT entity_class_profile_name_chk
        CHECK (btrim(fallback_name) <> '' AND length(fallback_name) <= 128),
    CONSTRAINT entity_class_profile_description_chk
        CHECK (btrim(description) <> '' AND length(description) <= 2000)
);

COMMENT ON TABLE metadata.entity_class_profile IS
  'Immutable seeded defaults for one canonical Entity class. Defaults are copied explicitly; no runtime inheritance or property precedence is permitted.';

CREATE TABLE metadata.entity_runtime_profile (
    id                         uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid                               NOT NULL,
    change_set_id              uuid                               NOT NULL,
    profile_key                text                               NOT NULL DEFAULT 'default',
    backing_kind               metadata.entity_backing_kind_d     NOT NULL,
    storage_plane              text,
    storage_schema             text,
    storage_object             text,
    api_exposure               metadata.entity_api_exposure_d     NOT NULL,
    read_mode                  metadata.entity_read_mode_d        NOT NULL,
    write_mode                 metadata.entity_write_mode_d       NOT NULL,
    read_handler_key           text,
    write_handler_key          text,
    create_mode                metadata.entity_create_mode_d      NOT NULL DEFAULT 'form_only',
    concurrency_mode           metadata.entity_concurrency_mode_d NOT NULL DEFAULT 'none',
    record_version_field_key   text,
    tenant_field_key           text,
    soft_delete_field_key      text,
    draft_ttl_hours            integer,
    created_at                 timestamptz                        NOT NULL DEFAULT now(),
    created_by                 uuid                               NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT entity_runtime_profile_pkey PRIMARY KEY (id),
    CONSTRAINT entity_runtime_profile_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_runtime_profile_change_set_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id),
    CONSTRAINT entity_runtime_profile_key_chk CHECK (profile_key = 'default'),
    CONSTRAINT entity_runtime_profile_plane_chk
        CHECK (storage_plane IS NULL OR storage_plane IN ('studio', 'neon', 'mesh')),
    CONSTRAINT entity_runtime_profile_schema_chk CHECK (
        storage_schema IS NULL OR storage_schema ~ '^[a-z_][a-z0-9_]{0,62}$'
    ),
    CONSTRAINT entity_runtime_profile_object_chk CHECK (
        storage_object IS NULL OR storage_object ~ '^[a-z_][a-z0-9_]{0,62}$'
    ),
    CONSTRAINT entity_runtime_profile_storage_chk CHECK (
        (backing_kind IN ('table', 'view', 'materialized_view')
            AND storage_plane IS NOT NULL
            AND storage_schema IS NOT NULL
            AND storage_object IS NOT NULL)
        OR (backing_kind = 'external'
            AND storage_plane IS NOT NULL
            AND storage_schema IS NULL
            AND storage_object IS NULL)
        OR (backing_kind = 'virtual'
            AND storage_plane IS NULL
            AND storage_schema IS NULL
            AND storage_object IS NULL)
    ),
    CONSTRAINT entity_runtime_profile_api_chk CHECK (
        api_exposure = 'api' OR (read_mode = 'none' AND write_mode = 'none')
    ),
    CONSTRAINT entity_runtime_profile_read_handler_chk CHECK (
        (read_mode = 'facade'
            AND read_handler_key ~ '^[a-z][a-z0-9_.:-]{1,126}$')
        OR (read_mode <> 'facade' AND read_handler_key IS NULL)
    ),
    CONSTRAINT entity_runtime_profile_write_handler_chk CHECK (
        (write_mode = 'facade'
            AND write_handler_key ~ '^[a-z][a-z0-9_.:-]{1,126}$')
        OR (write_mode <> 'facade' AND write_handler_key IS NULL)
    ),
    CONSTRAINT entity_runtime_profile_generic_backing_chk CHECK (
        (read_mode <> 'generic' OR backing_kind IN ('table', 'view', 'materialized_view'))
        AND (write_mode <> 'generic' OR backing_kind = 'table')
    ),
    CONSTRAINT entity_runtime_profile_append_only_chk CHECK (
        (concurrency_mode = 'append_only') = (write_mode = 'append_only')
    ),
    CONSTRAINT entity_runtime_profile_version_field_chk CHECK (
        (concurrency_mode = 'optimistic' AND record_version_field_key IS NOT NULL)
        OR (concurrency_mode <> 'optimistic' AND record_version_field_key IS NULL)
    ),
    CONSTRAINT entity_runtime_profile_draft_ttl_chk CHECK (
        (create_mode = 'early_draft' AND draft_ttl_hours BETWEEN 1 AND 8760)
        OR (create_mode <> 'early_draft' AND draft_ttl_hours IS NULL)
    ),
    CONSTRAINT entity_runtime_profile_write_create_chk CHECK (
        write_mode <> 'none' OR create_mode = 'form_only'
    ),
    CONSTRAINT entity_runtime_profile_field_keys_chk CHECK (
        (record_version_field_key IS NULL OR record_version_field_key ~ '^[a-z][a-z0-9_]{0,62}$')
        AND (tenant_field_key IS NULL OR tenant_field_key ~ '^[a-z][a-z0-9_]{0,62}$')
        AND (soft_delete_field_key IS NULL OR soft_delete_field_key ~ '^[a-z][a-z0-9_]{0,62}$')
    ),
    CONSTRAINT entity_runtime_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_runtime_profile IS
  'One explicit storage and execution contract per Entity change set. Search, policy, presentation, publication, and runtime state are deliberately excluded.';

CREATE TABLE metadata.entity_field (
    id                            uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                     uuid,
    entity_id                     uuid                                  NOT NULL,
    change_set_id                 uuid                                  NOT NULL,
    field_key                     text                                  NOT NULL,
    description                   text,
    data_type                     metadata.entity_field_data_type_d      NOT NULL,
    type_config                   jsonb                                 NOT NULL,
    cardinality                   metadata.entity_field_cardinality_d    NOT NULL DEFAULT 'one',
    value_origin                  metadata.entity_field_value_origin_d   NOT NULL DEFAULT 'stored',
    write_mode                    metadata.entity_field_write_mode_d     NOT NULL DEFAULT 'mutable',
    storage_path                  text,
    default_spec                  jsonb,
    computation_spec              jsonb,
    validation_spec               jsonb,
    data_classification           text                                  NOT NULL DEFAULT 'internal',
    retention_policy_code         text,
    status                        metadata.entity_member_status_d        NOT NULL DEFAULT 'active',
    replacement_field_key         text,
    deprecated_since_release_no   bigint,
    planned_removal_release_no    bigint,
    created_at                    timestamptz                           NOT NULL DEFAULT now(),
    created_by                    uuid                                  NOT NULL,
    updated_at                    timestamptz,
    updated_by                    uuid,

    CONSTRAINT entity_field_pkey PRIMARY KEY (id),
    CONSTRAINT entity_field_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_field_key_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, field_key),
    CONSTRAINT entity_field_key_chk
        CHECK (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
    CONSTRAINT entity_field_description_chk CHECK (
        description IS NULL OR (btrim(description) <> '' AND length(description) <= 2000)
    ),
    CONSTRAINT entity_field_type_config_chk CHECK (
        jsonb_typeof(type_config) = 'object'
        AND type_config ->> 'kind' = data_type::text
    ),
    CONSTRAINT entity_field_optional_specs_chk CHECK (
        (default_spec IS NULL OR jsonb_typeof(default_spec) = 'object')
        AND (computation_spec IS NULL OR jsonb_typeof(computation_spec) = 'object')
        AND (validation_spec IS NULL OR jsonb_typeof(validation_spec) = 'object')
    ),
    CONSTRAINT entity_field_classification_chk CHECK (
        data_classification IN ('public','internal','confidential','pii','sensitive_pii')
    ),
    CONSTRAINT entity_field_retention_policy_chk CHECK (
        retention_policy_code IS NULL OR retention_policy_code ~ '^[a-z][a-z0-9_.-]{1,62}$'
    ),
    CONSTRAINT entity_field_storage_chk CHECK (
        (value_origin IN ('stored', 'projected')
            AND storage_path ~ '^[A-Za-z_][A-Za-z0-9_.]{0,126}$')
        OR (value_origin IN ('computed', 'runtime') AND storage_path IS NULL)
    ),
    CONSTRAINT entity_field_computation_chk CHECK (
        (value_origin = 'computed' AND write_mode = 'computed' AND computation_spec IS NOT NULL)
        OR (value_origin <> 'computed' AND write_mode <> 'computed' AND computation_spec IS NULL)
    ),
    CONSTRAINT entity_field_default_chk CHECK (
        default_spec IS NULL
        OR (value_origin = 'stored' AND write_mode IN ('mutable', 'write_once'))
    ),
    CONSTRAINT entity_field_projected_write_chk CHECK (
        value_origin <> 'projected' OR write_mode = 'read_only'
    ),
    CONSTRAINT entity_field_replacement_chk CHECK (
        replacement_field_key IS NULL
        OR (replacement_field_key ~ '^[a-z][a-z0-9_]{0,62}$'
            AND replacement_field_key <> field_key)
    ),
    CONSTRAINT entity_field_lifecycle_chk CHECK (
        (status = 'active'
            AND replacement_field_key IS NULL
            AND deprecated_since_release_no IS NULL
            AND planned_removal_release_no IS NULL)
        OR (status = 'deprecated'
            AND deprecated_since_release_no >= 1
            AND (planned_removal_release_no IS NULL
                OR planned_removal_release_no > deprecated_since_release_no))
    ),
    CONSTRAINT entity_field_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_field IS
  'Intrinsic field value, storage, write, default, computation, validation, and deprecation semantics. UI, search membership, uniqueness, and relation targets have normalized owners.';

CREATE TABLE metadata.entity_key (
    id                            uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                     uuid,
    entity_id                     uuid                               NOT NULL,
    change_set_id                 uuid                               NOT NULL,
    key_key                       text                               NOT NULL,
    key_kind                      metadata.entity_key_kind_d         NOT NULL,
    uniqueness_scope              metadata.entity_uniqueness_scope_d NOT NULL,
    null_semantics                metadata.entity_null_semantics_d   NOT NULL DEFAULT 'not_allowed',
    status                        metadata.entity_member_status_d    NOT NULL DEFAULT 'active',
    replacement_key_key           text,
    deprecated_since_release_no   bigint,
    planned_removal_release_no    bigint,
    created_at                    timestamptz                        NOT NULL DEFAULT now(),
    created_by                    uuid                               NOT NULL,
    updated_at                    timestamptz,
    updated_by                    uuid,

    CONSTRAINT entity_key_pkey PRIMARY KEY (id),
    CONSTRAINT entity_key_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_key_key_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, key_key),
    CONSTRAINT entity_key_key_chk CHECK (key_key ~ '^[a-z][a-z0-9_]{0,62}$'),
    CONSTRAINT entity_key_primary_null_chk CHECK (
        key_kind <> 'primary' OR null_semantics = 'not_allowed'
    ),
    CONSTRAINT entity_key_replacement_chk CHECK (
        replacement_key_key IS NULL
        OR (replacement_key_key ~ '^[a-z][a-z0-9_]{0,62}$'
            AND replacement_key_key <> key_key)
    ),
    CONSTRAINT entity_key_lifecycle_chk CHECK (
        (status = 'active'
            AND replacement_key_key IS NULL
            AND deprecated_since_release_no IS NULL
            AND planned_removal_release_no IS NULL)
        OR (status = 'deprecated'
            AND deprecated_since_release_no >= 1
            AND (planned_removal_release_no IS NULL
                OR planned_removal_release_no > deprecated_since_release_no))
    ),
    CONSTRAINT entity_key_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_key_field (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid,
    entity_id         uuid        NOT NULL,
    change_set_id     uuid        NOT NULL,
    entity_key_id     uuid        NOT NULL,
    entity_field_id   uuid        NOT NULL,
    position          smallint    NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT entity_key_field_pkey PRIMARY KEY (id),
    CONSTRAINT entity_key_field_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_key_field_member_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_key_id, entity_field_id),
    CONSTRAINT entity_key_field_position_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_key_id, position),
    CONSTRAINT entity_key_field_position_chk CHECK (position BETWEEN 1 AND 64),
    CONSTRAINT entity_key_field_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_search_profile (
    id                            uuid                                   NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                     uuid,
    entity_id                     uuid                                   NOT NULL,
    change_set_id                 uuid                                   NOT NULL,
    search_key                    text                                   NOT NULL,
    search_kind                   metadata.entity_search_kind_d          NOT NULL,
    query_operator                metadata.entity_search_operator_d      NOT NULL DEFAULT 'and',
    minimum_query_length          smallint                               NOT NULL DEFAULT 2,
    language_code                 text,
    normalization_mode            metadata.entity_search_normalization_d NOT NULL DEFAULT 'casefold',
    is_default                    boolean                                NOT NULL DEFAULT false,
    status                        metadata.entity_member_status_d         NOT NULL DEFAULT 'active',
    replacement_search_key        text,
    deprecated_since_release_no   bigint,
    planned_removal_release_no    bigint,
    created_at                    timestamptz                            NOT NULL DEFAULT now(),
    created_by                    uuid                                   NOT NULL,
    updated_at                    timestamptz,
    updated_by                    uuid,

    CONSTRAINT entity_search_profile_pkey PRIMARY KEY (id),
    CONSTRAINT entity_search_profile_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_search_profile_key_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, search_key),
    CONSTRAINT entity_search_profile_key_chk
        CHECK (search_key ~ '^[a-z][a-z0-9_]{0,62}$'),
    CONSTRAINT entity_search_profile_min_length_chk
        CHECK (minimum_query_length BETWEEN 1 AND 64),
    CONSTRAINT entity_search_profile_language_chk CHECK (
        language_code IS NULL OR language_code ~ '^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$'
    ),
    CONSTRAINT entity_search_profile_replacement_chk CHECK (
        replacement_search_key IS NULL
        OR (replacement_search_key ~ '^[a-z][a-z0-9_]{0,62}$'
            AND replacement_search_key <> search_key)
    ),
    CONSTRAINT entity_search_profile_lifecycle_chk CHECK (
        (status = 'active'
            AND replacement_search_key IS NULL
            AND deprecated_since_release_no IS NULL
            AND planned_removal_release_no IS NULL)
        OR (status = 'deprecated'
            AND is_default = false
            AND deprecated_since_release_no >= 1
            AND (planned_removal_release_no IS NULL
                OR planned_removal_release_no > deprecated_since_release_no))
    ),
    CONSTRAINT entity_search_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_search_field (
    id                         uuid                                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid                                NOT NULL,
    change_set_id              uuid                                NOT NULL,
    entity_search_profile_id   uuid                                NOT NULL,
    entity_field_id            uuid                                NOT NULL,
    position                   smallint                            NOT NULL,
    match_mode                 metadata.entity_search_match_mode_d NOT NULL,
    weight                     numeric(6,3)                        NOT NULL DEFAULT 1.000,
    created_at                 timestamptz                         NOT NULL DEFAULT now(),
    created_by                 uuid                                NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT entity_search_field_pkey PRIMARY KEY (id),
    CONSTRAINT entity_search_field_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_search_field_member_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_search_profile_id, entity_field_id),
    CONSTRAINT entity_search_field_position_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_search_profile_id, position),
    CONSTRAINT entity_search_field_position_chk CHECK (position BETWEEN 1 AND 256),
    CONSTRAINT entity_search_field_weight_chk CHECK (weight > 0 AND weight <= 100),
    CONSTRAINT entity_search_field_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_relation (
    id                            uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                     uuid,
    entity_id                     uuid                                  NOT NULL,
    change_set_id                 uuid                                  NOT NULL,
    relation_key                  text                                  NOT NULL,
    relation_kind                 metadata.entity_relation_kind_d        NOT NULL,
    resolution_kind               metadata.entity_relation_resolution_d  NOT NULL,
    ownership_mode                metadata.entity_relation_ownership_d   NOT NULL DEFAULT 'reference',
    mutation_mode                 metadata.entity_relation_mutation_d    NOT NULL DEFAULT 'read_only',
    on_delete                     metadata.entity_relation_delete_action_d NOT NULL DEFAULT 'restrict',
    on_update                     metadata.entity_relation_update_action_d NOT NULL DEFAULT 'restrict',
    inverse_relation_key          text,
    status                        metadata.entity_member_status_d         NOT NULL DEFAULT 'active',
    replacement_relation_key      text,
    deprecated_since_release_no   bigint,
    planned_removal_release_no    bigint,
    created_at                    timestamptz                            NOT NULL DEFAULT now(),
    created_by                    uuid                                   NOT NULL,
    updated_at                    timestamptz,
    updated_by                    uuid,

    CONSTRAINT entity_relation_pkey PRIMARY KEY (id),
    CONSTRAINT entity_relation_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_relation_key_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, relation_key),
    CONSTRAINT entity_relation_key_chk
        CHECK (relation_key ~ '^[a-z][a-z0-9_]{0,62}$'),
    CONSTRAINT entity_relation_inverse_chk CHECK (
        inverse_relation_key IS NULL
        OR (inverse_relation_key ~ '^[a-z][a-z0-9_]{0,62}$'
            AND inverse_relation_key <> relation_key)
    ),
    CONSTRAINT entity_relation_set_null_chk CHECK (
        on_delete <> 'set_null' OR relation_kind IN ('one_to_one', 'many_to_one')
    ),
    CONSTRAINT entity_relation_aggregate_chk CHECK (
        ownership_mode <> 'aggregate_child'
        OR (
            relation_kind <> 'many_to_many'
            AND mutation_mode IN ('source_owned', 'target_owned', 'coordinated')
        )
    ),
    CONSTRAINT entity_relation_replacement_chk CHECK (
        replacement_relation_key IS NULL
        OR (replacement_relation_key ~ '^[a-z][a-z0-9_]{0,62}$'
            AND replacement_relation_key <> relation_key)
    ),
    CONSTRAINT entity_relation_lifecycle_chk CHECK (
        (status = 'active'
            AND replacement_relation_key IS NULL
            AND deprecated_since_release_no IS NULL
            AND planned_removal_release_no IS NULL)
        OR (status = 'deprecated'
            AND deprecated_since_release_no >= 1
            AND (planned_removal_release_no IS NULL
                OR planned_removal_release_no > deprecated_since_release_no))
    ),
    CONSTRAINT entity_relation_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_relation_target (
    id                        uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid,
    entity_id                 uuid        NOT NULL,
    change_set_id             uuid        NOT NULL,
    entity_relation_id        uuid        NOT NULL,
    relation_target_key       text        NOT NULL,
    target_entity_id          uuid        NOT NULL,
    target_key_key            text        NOT NULL,
    discriminator_value       text,
    is_default                boolean     NOT NULL DEFAULT false,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid        NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,

    CONSTRAINT entity_relation_target_pkey PRIMARY KEY (id),
    CONSTRAINT entity_relation_target_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_relation_target_key_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_relation_id, relation_target_key),
    CONSTRAINT entity_relation_target_discriminator_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_relation_id, discriminator_value),
    CONSTRAINT entity_relation_target_key_chk CHECK (
        relation_target_key ~ '^[a-z][a-z0-9_]{0,62}$'
        AND target_key_key ~ '^[a-z][a-z0-9_]{0,62}$'
    ),
    CONSTRAINT entity_relation_target_discriminator_chk CHECK (
        discriminator_value IS NULL
        OR (btrim(discriminator_value) <> '' AND length(discriminator_value) <= 128)
    ),
    CONSTRAINT entity_relation_target_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_relation_field (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,
    entity_id                   uuid        NOT NULL,
    change_set_id               uuid        NOT NULL,
    entity_relation_target_id   uuid        NOT NULL,
    source_field_id             uuid        NOT NULL,
    target_field_key            text        NOT NULL,
    position                    smallint    NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT entity_relation_field_pkey PRIMARY KEY (id),
    CONSTRAINT entity_relation_field_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_relation_field_source_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_relation_target_id, source_field_id),
    CONSTRAINT entity_relation_field_target_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_relation_target_id, target_field_key),
    CONSTRAINT entity_relation_field_position_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_relation_target_id, position),
    CONSTRAINT entity_relation_field_target_key_chk
        CHECK (target_field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
    CONSTRAINT entity_relation_field_position_chk CHECK (position BETWEEN 1 AND 64),
    CONSTRAINT entity_relation_field_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_relation_target IS
  'Normalized concrete target variant for a relation. Polymorphic discriminator values and target key coordinates are never embedded in relation JSON.';
COMMENT ON TABLE metadata.entity_relation_field IS
  'Ordered source-to-target field mapping for one relation target, including composite-key joins without field arrays.';

-- Phase 3 presentation and operation graph. Rows remain mutable only inside an
-- Entity change set and become immutable through the existing revision/release model.
CREATE TABLE metadata.entity_surface (
    id                         uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid                           NOT NULL,
    change_set_id              uuid                           NOT NULL,
    surface_key                text                           NOT NULL,
    surface_kind               metadata.entity_surface_kind_d NOT NULL,
    title                      text                           NOT NULL,
    description                text,
    layout_kind                metadata.entity_surface_layout_d NOT NULL DEFAULT 'flow',
    layout_config              jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    is_default                 boolean                        NOT NULL DEFAULT false,
    status                     metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    replacement_surface_key    text,
    deprecated_since_release_no bigint,
    planned_removal_release_no bigint,
    created_at                 timestamptz                    NOT NULL DEFAULT now(),
    created_by                 uuid                           NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT entity_surface_pkey PRIMARY KEY (id),
    CONSTRAINT entity_surface_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_surface_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, surface_key),
    CONSTRAINT entity_surface_key_chk CHECK (surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_title_chk CHECK (btrim(title) <> '' AND length(title) <= 256),
    CONSTRAINT entity_surface_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_surface_layout_config_chk CHECK (jsonb_typeof(layout_config) = 'object'),
    CONSTRAINT entity_surface_replacement_chk CHECK (replacement_surface_key IS NULL OR replacement_surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_deprecation_chk CHECK (
        (status = 'active' AND replacement_surface_key IS NULL AND deprecated_since_release_no IS NULL AND planned_removal_release_no IS NULL)
        OR (status = 'deprecated' AND deprecated_since_release_no >= 1
            AND (planned_removal_release_no IS NULL OR planned_removal_release_no > deprecated_since_release_no))
    ),
    CONSTRAINT entity_surface_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_surface_section (
    id                         uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid                           NOT NULL,
    change_set_id              uuid                           NOT NULL,
    entity_surface_id          uuid                           NOT NULL,
    section_key                text                           NOT NULL,
    parent_section_id          uuid,
    section_kind               metadata.entity_surface_section_kind_d NOT NULL DEFAULT 'section',
    title                      text,
    description                text,
    position                   smallint                       NOT NULL,
    column_count               smallint                       NOT NULL DEFAULT 1,
    collapsible                boolean                        NOT NULL DEFAULT false,
    collapsed_by_default       boolean                        NOT NULL DEFAULT false,
    layout_config              jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    created_at                 timestamptz                    NOT NULL DEFAULT now(),
    created_by                 uuid                           NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT entity_surface_section_pkey PRIMARY KEY (id),
    CONSTRAINT entity_surface_section_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_surface_section_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, section_key),
    CONSTRAINT entity_surface_section_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, parent_section_id, position),
    CONSTRAINT entity_surface_section_key_chk CHECK (section_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_section_title_chk CHECK (title IS NULL OR (btrim(title) <> '' AND length(title) <= 256)),
    CONSTRAINT entity_surface_section_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_surface_section_position_chk CHECK (position >= 0),
    CONSTRAINT entity_surface_section_columns_chk CHECK (column_count BETWEEN 1 AND 12),
    CONSTRAINT entity_surface_section_collapse_chk CHECK (NOT collapsed_by_default OR collapsible),
    CONSTRAINT entity_surface_section_layout_config_chk CHECK (jsonb_typeof(layout_config) = 'object'),
    CONSTRAINT entity_surface_section_no_self_parent_chk CHECK (parent_section_id IS DISTINCT FROM id),
    CONSTRAINT entity_surface_section_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_surface_field_binding (
    id                         uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid                           NOT NULL,
    change_set_id              uuid                           NOT NULL,
    entity_surface_id          uuid                           NOT NULL,
    entity_surface_section_id  uuid,
    entity_field_id            uuid                           NOT NULL,
    binding_key                text                           NOT NULL,
    position                   smallint                       NOT NULL,
    label_override             text,
    help_text                  text,
    placeholder                text,
    widget_key                 text,
    column_span                smallint                       NOT NULL DEFAULT 12,
    show_required_indicator    boolean                        NOT NULL DEFAULT true,
    display_config             jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    visibility_rule            jsonb,
    editability_rule           jsonb,
    status                     metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at                 timestamptz                    NOT NULL DEFAULT now(),
    created_by                 uuid                           NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT entity_surface_field_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_surface_field_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_surface_field_binding_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, binding_key),
    CONSTRAINT entity_surface_field_binding_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, entity_surface_section_id, position),
    CONSTRAINT entity_surface_field_binding_key_chk CHECK (binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_field_binding_position_chk CHECK (position >= 0),
    CONSTRAINT entity_surface_field_binding_label_chk CHECK (label_override IS NULL OR (btrim(label_override) <> '' AND length(label_override) <= 256)),
    CONSTRAINT entity_surface_field_binding_help_chk CHECK (help_text IS NULL OR length(help_text) <= 4000),
    CONSTRAINT entity_surface_field_binding_placeholder_chk CHECK (placeholder IS NULL OR length(placeholder) <= 512),
    CONSTRAINT entity_surface_field_binding_widget_chk CHECK (widget_key IS NULL OR widget_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_surface_field_binding_span_chk CHECK (column_span BETWEEN 1 AND 12),
    CONSTRAINT entity_surface_field_binding_display_chk CHECK (jsonb_typeof(display_config) = 'object'),
    CONSTRAINT entity_surface_field_binding_visibility_chk CHECK (visibility_rule IS NULL OR jsonb_typeof(visibility_rule) = 'object'),
    CONSTRAINT entity_surface_field_binding_editability_chk CHECK (editability_rule IS NULL OR jsonb_typeof(editability_rule) = 'object'),
    CONSTRAINT entity_surface_field_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_surface_component_binding (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid,
    entity_id uuid NOT NULL, change_set_id uuid NOT NULL, entity_surface_id uuid NOT NULL,
    entity_surface_section_id uuid, component_surface_id uuid NOT NULL,
    binding_key text NOT NULL, position smallint NOT NULL, cardinality text NOT NULL,
    contract_slice_pointer text NOT NULL, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_surface_component_binding_pkey PRIMARY KEY(id),
    CONSTRAINT entity_surface_component_binding_tenant_uq UNIQUE NULLS NOT DISTINCT(tenant_id,id),
    CONSTRAINT entity_surface_component_binding_key_uq UNIQUE NULLS NOT DISTINCT(tenant_id,entity_surface_id,binding_key),
    CONSTRAINT entity_surface_component_binding_position_uq UNIQUE NULLS NOT DISTINCT(tenant_id,entity_surface_id,entity_surface_section_id,position),
    CONSTRAINT entity_surface_component_binding_key_chk CHECK(binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_component_binding_position_chk CHECK(position>=0),
    CONSTRAINT entity_surface_component_binding_cardinality_chk CHECK(cardinality IN('one','many')),
    CONSTRAINT entity_surface_component_binding_pointer_chk CHECK(contract_slice_pointer ~ '^/(?:[^/~]|~[01])+(?:/(?:[^/~]|~[01])+)*$' AND length(contract_slice_pointer)<=512),
    CONSTRAINT entity_surface_component_binding_no_self_chk CHECK(component_surface_id<>entity_surface_id),
    CONSTRAINT entity_surface_component_binding_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_operation (
    id                         uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid                           NOT NULL,
    change_set_id              uuid                           NOT NULL,
    operation_key              text                           NOT NULL,
    operation_kind             metadata.entity_operation_kind_d NOT NULL,
    label                      text                           NOT NULL,
    description                text,
    handler_key                text,
    permission_code            text,
    execution_mode             metadata.entity_operation_execution_d NOT NULL DEFAULT 'synchronous',
    idempotency_mode           metadata.entity_operation_idempotency_d NOT NULL DEFAULT 'none',
    input_surface_key          text,
    confirmation_surface_key   text,
    result_surface_key         text,
    requires_mfa               boolean                        NOT NULL DEFAULT false,
    audit_event_code           text                           NOT NULL,
    status                     metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    replacement_operation_key  text,
    deprecated_since_release_no bigint,
    planned_removal_release_no bigint,
    created_at                 timestamptz                    NOT NULL DEFAULT now(),
    created_by                 uuid                           NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT entity_operation_pkey PRIMARY KEY (id),
    CONSTRAINT entity_operation_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_operation_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, operation_key),
    CONSTRAINT entity_operation_key_chk CHECK (operation_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_label_chk CHECK (btrim(label) <> '' AND length(label) <= 256),
    CONSTRAINT entity_operation_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_operation_handler_chk CHECK (handler_key IS NULL OR handler_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_operation_permission_chk CHECK (
        permission_code IS NULL
        OR permission_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,7}$'
    ),
    CONSTRAINT entity_operation_surface_key_chk CHECK (
        (input_surface_key IS NULL OR input_surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$')
        AND (confirmation_surface_key IS NULL OR confirmation_surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$')
        AND (result_surface_key IS NULL OR result_surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$')
    ),
    CONSTRAINT entity_operation_audit_event_chk CHECK (audit_event_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,7}$'),
    CONSTRAINT entity_operation_handler_required_chk CHECK (operation_kind = 'read' OR handler_key IS NOT NULL),
    CONSTRAINT entity_operation_replacement_chk CHECK (replacement_operation_key IS NULL OR replacement_operation_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_deprecation_chk CHECK (
        (status = 'active' AND replacement_operation_key IS NULL AND deprecated_since_release_no IS NULL AND planned_removal_release_no IS NULL)
        OR (status = 'deprecated' AND deprecated_since_release_no >= 1
            AND (planned_removal_release_no IS NULL OR planned_removal_release_no > deprecated_since_release_no))
    ),
    CONSTRAINT entity_operation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_surface IS 'Change-set-owned named presentation surface. Field semantics remain in metadata.entity_field.';
COMMENT ON TABLE metadata.entity_surface_section IS 'Ordered and nestable layout region inside one Entity surface.';
COMMENT ON TABLE metadata.entity_surface_field_binding IS 'Presentation-only field binding; it cannot redefine type, validation, storage, default, computation, key, search, or relation semantics.';
COMMENT ON TABLE metadata.entity_operation IS 'Canonical operation identity and execution references. Permissions, handlers, lifecycle, audit contracts, and surfaces are referenced rather than embedded.';
COMMENT ON COLUMN metadata.entity_operation.permission_code IS
  'Compatibility projection only. New authoring uses metadata.entity_operation_permission so one operation can resolve independently per target plane.';

CREATE TABLE metadata.entity_operation_permission (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid,
    entity_id            uuid        NOT NULL,
    change_set_id        uuid        NOT NULL,
    entity_operation_id  uuid        NOT NULL,
    target_plane         text        NOT NULL,
    permission_code      text        NOT NULL,
    permission_kind      text        NOT NULL,
    status               metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,
    CONSTRAINT entity_operation_permission_pkey PRIMARY KEY (id),
    CONSTRAINT entity_operation_permission_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_operation_permission_plane_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_operation_id, target_plane),
    CONSTRAINT entity_operation_permission_plane_chk CHECK (target_plane IN ('neon', 'mesh')),
    CONSTRAINT entity_operation_permission_code_chk
        CHECK (permission_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,7}$'),
    CONSTRAINT entity_operation_permission_kind_chk
        CHECK (permission_kind IN ('entity_operation', 'capability')),
    CONSTRAINT entity_operation_permission_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_operation_permission IS
  'Plane-aware authorization binding for an Entity operation. It is independent of metadata.entity_surface_operation, so headless, scheduled, API, and UI-wired operations share the same authorization contract.';

-- Phase 4 composition graph. Flows reuse surfaces, policy bindings reference
-- canonical control policies, and test rows contain expectations but no results.
CREATE TABLE metadata.entity_surface_operation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_surface_id uuid NOT NULL, entity_operation_id uuid NOT NULL,
    entity_surface_section_id uuid, placement_key text NOT NULL,
    interaction_target metadata.entity_surface_operation_target_d NOT NULL DEFAULT 'secondary',
    selection_mode metadata.entity_surface_operation_selection_d NOT NULL DEFAULT 'none',
    position smallint NOT NULL, label_override text, icon_key text, presentation_variant text,
    confirmation_surface_id uuid, visibility_rule jsonb, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_surface_operation_pkey PRIMARY KEY (id),
    CONSTRAINT entity_surface_operation_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_surface_operation_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, placement_key),
    CONSTRAINT entity_surface_operation_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, entity_surface_section_id, interaction_target, position),
    CONSTRAINT entity_surface_operation_key_chk CHECK (placement_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_operation_position_chk CHECK (position >= 0),
    CONSTRAINT entity_surface_operation_label_chk CHECK (label_override IS NULL OR (btrim(label_override) <> '' AND length(label_override) <= 256)),
    CONSTRAINT entity_surface_operation_icon_chk CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_surface_operation_variant_chk CHECK (presentation_variant IS NULL OR presentation_variant ~ '^[a-z][a-z0-9_.-]{1,63}$'),
    CONSTRAINT entity_surface_operation_visibility_chk CHECK (visibility_rule IS NULL OR jsonb_typeof(visibility_rule) = 'object'),
    CONSTRAINT entity_surface_operation_selection_chk CHECK (interaction_target = 'selection' OR selection_mode = 'none'),
    CONSTRAINT entity_surface_operation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_surface_operation IS
  'Optional presentation binding from a surface to an operation. Absence of a row means the operation is headless, not undefined or unauthorized.';

CREATE TABLE metadata.entity_operation_rule (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_operation_id uuid NOT NULL, rule_key text NOT NULL,
    priority smallint NOT NULL DEFAULT 100, decision metadata.entity_operation_rule_decision_d NOT NULL,
    plane_code text, lifecycle_state_code text, lifecycle_transition_code text, required_capability_code text,
    reason_code text, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_operation_rule_pkey PRIMARY KEY (id),
    CONSTRAINT entity_operation_rule_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_operation_rule_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_operation_id, rule_key),
    CONSTRAINT entity_operation_rule_priority_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_operation_id, priority),
    CONSTRAINT entity_operation_rule_key_chk CHECK (rule_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_rule_priority_chk CHECK (priority BETWEEN 0 AND 32767),
    CONSTRAINT entity_operation_rule_plane_chk CHECK (plane_code IS NULL OR plane_code IN ('studio', 'neon', 'mesh')),
    CONSTRAINT entity_operation_rule_state_chk CHECK (lifecycle_state_code IS NULL OR lifecycle_state_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_rule_transition_chk CHECK (lifecycle_transition_code IS NULL OR lifecycle_transition_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_rule_capability_chk CHECK (required_capability_code IS NULL OR required_capability_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_operation_rule_reason_chk CHECK (reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_rule_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_flow (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, flow_key text NOT NULL, flow_kind metadata.entity_flow_kind_d NOT NULL,
    title text NOT NULL, description text, navigation_mode metadata.entity_flow_navigation_d NOT NULL DEFAULT 'linear',
    entry_operation_id uuid, completion_operation_id uuid, allow_draft_resume boolean NOT NULL DEFAULT true,
    status metadata.entity_member_status_d NOT NULL DEFAULT 'active', replacement_flow_key text,
    deprecated_since_release_no bigint, planned_removal_release_no bigint,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_flow_pkey PRIMARY KEY (id),
    CONSTRAINT entity_flow_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_flow_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, flow_key),
    CONSTRAINT entity_flow_key_chk CHECK (flow_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_flow_title_chk CHECK (btrim(title) <> '' AND length(title) <= 256),
    CONSTRAINT entity_flow_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_flow_replacement_chk CHECK (replacement_flow_key IS NULL OR replacement_flow_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_flow_deprecation_chk CHECK ((status = 'active' AND replacement_flow_key IS NULL AND deprecated_since_release_no IS NULL AND planned_removal_release_no IS NULL) OR (status = 'deprecated' AND deprecated_since_release_no >= 1 AND (planned_removal_release_no IS NULL OR planned_removal_release_no > deprecated_since_release_no))),
    CONSTRAINT entity_flow_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_flow_step (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_flow_id uuid NOT NULL, entity_surface_id uuid NOT NULL,
    step_key text NOT NULL, position smallint NOT NULL, title_override text, description text,
    entry_condition jsonb, completion_condition jsonb, is_optional boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_flow_step_pkey PRIMARY KEY (id),
    CONSTRAINT entity_flow_step_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_flow_step_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_flow_id, step_key),
    CONSTRAINT entity_flow_step_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_flow_id, position),
    CONSTRAINT entity_flow_step_key_chk CHECK (step_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_flow_step_position_chk CHECK (position >= 0),
    CONSTRAINT entity_flow_step_title_chk CHECK (title_override IS NULL OR (btrim(title_override) <> '' AND length(title_override) <= 256)),
    CONSTRAINT entity_flow_step_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_flow_step_entry_chk CHECK (entry_condition IS NULL OR jsonb_typeof(entry_condition) = 'object'),
    CONSTRAINT entity_flow_step_completion_chk CHECK (completion_condition IS NULL OR jsonb_typeof(completion_condition) = 'object'),
    CONSTRAINT entity_flow_step_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_policy_binding (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_operation_id uuid, policy_definition_id uuid NOT NULL,
    binding_key text NOT NULL, binding_stage metadata.entity_policy_binding_stage_d NOT NULL,
    enforcement metadata.entity_policy_enforcement_d NOT NULL DEFAULT 'enforce', priority smallint NOT NULL DEFAULT 100,
    input_mapping jsonb NOT NULL DEFAULT '{}'::jsonb, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_policy_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_policy_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_policy_binding_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, binding_key),
    CONSTRAINT entity_policy_binding_order_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, entity_operation_id, binding_stage, priority),
    CONSTRAINT entity_policy_binding_key_chk CHECK (binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_policy_binding_priority_chk CHECK (priority BETWEEN 0 AND 32767),
    CONSTRAINT entity_policy_binding_mapping_chk CHECK (jsonb_typeof(input_mapping) = 'object'),
    CONSTRAINT entity_policy_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_field_policy_binding (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_field_id uuid NOT NULL, entity_operation_id uuid,
    policy_definition_id uuid NOT NULL, binding_key text NOT NULL,
    binding_stage metadata.entity_policy_binding_stage_d NOT NULL,
    enforcement metadata.entity_policy_enforcement_d NOT NULL DEFAULT 'enforce', priority smallint NOT NULL DEFAULT 100,
    input_mapping jsonb NOT NULL DEFAULT '{}'::jsonb, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_field_policy_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_field_policy_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_field_policy_binding_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, binding_key),
    CONSTRAINT entity_field_policy_binding_order_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_field_id, entity_operation_id, binding_stage, priority),
    CONSTRAINT entity_field_policy_binding_key_chk CHECK (binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_field_policy_binding_priority_chk CHECK (priority BETWEEN 0 AND 32767),
    CONSTRAINT entity_field_policy_binding_mapping_chk CHECK (jsonb_typeof(input_mapping) = 'object'),
    CONSTRAINT entity_field_policy_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_contract_test_case (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, test_key text NOT NULL, test_kind metadata.entity_contract_test_kind_d NOT NULL,
    title text NOT NULL, description text, target_plane text, entity_operation_id uuid, entity_flow_id uuid,
    input_context jsonb NOT NULL DEFAULT '{}'::jsonb,
    expected_outcome metadata.entity_contract_test_outcome_d NOT NULL DEFAULT 'pass',
    expected_diagnostic_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
    status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_contract_test_case_pkey PRIMARY KEY (id),
    CONSTRAINT entity_contract_test_case_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_contract_test_case_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, test_key),
    CONSTRAINT entity_contract_test_case_key_chk CHECK (test_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_contract_test_case_title_chk CHECK (btrim(title) <> '' AND length(title) <= 256),
    CONSTRAINT entity_contract_test_case_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_contract_test_case_plane_chk CHECK (target_plane IS NULL OR target_plane IN ('studio', 'neon', 'mesh')),
    CONSTRAINT entity_contract_test_case_input_chk CHECK (jsonb_typeof(input_context) = 'object'),
    CONSTRAINT entity_contract_test_case_diagnostics_chk CHECK (array_position(expected_diagnostic_codes, NULL) IS NULL),
    CONSTRAINT entity_contract_test_case_target_chk CHECK (test_kind = 'operation' OR entity_operation_id IS NULL),
    CONSTRAINT entity_contract_test_case_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_flow_step IS 'Flow orchestration step referencing a reusable surface; it owns no field or layout graph.';
COMMENT ON TABLE metadata.entity_policy_binding IS 'Entity/operation composition reference to canonical control.policy_definition; no policy body is duplicated.';
COMMENT ON TABLE metadata.entity_contract_test_case IS 'Version-aware contract fixture and expectation. Execution results are immutable artifacts outside this table.';

CREATE TABLE metadata.entity_lifecycle_binding (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_field_id uuid NOT NULL, binding_key text NOT NULL,
    target_plane text NOT NULL, lifecycle_code text NOT NULL, lifecycle_revision integer NOT NULL,
    required boolean NOT NULL DEFAULT true, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_lifecycle_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_lifecycle_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_lifecycle_binding_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, binding_key),
    CONSTRAINT entity_lifecycle_binding_plane_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, target_plane),
    CONSTRAINT entity_lifecycle_binding_key_chk CHECK (binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_lifecycle_binding_plane_chk CHECK (target_plane IN ('studio','neon','mesh')),
    CONSTRAINT entity_lifecycle_binding_code_chk CHECK (lifecycle_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_lifecycle_binding_revision_chk CHECK (lifecycle_revision >= 1),
    CONSTRAINT entity_lifecycle_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_lifecycle_operation_binding (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_lifecycle_binding_id uuid NOT NULL, entity_operation_id uuid NOT NULL,
    mapping_key text NOT NULL, transition_code text NOT NULL,
    status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_lifecycle_operation_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_lifecycle_operation_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_lifecycle_operation_binding_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, mapping_key),
    CONSTRAINT entity_lifecycle_operation_binding_operation_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_lifecycle_binding_id, entity_operation_id),
    CONSTRAINT entity_lifecycle_operation_binding_key_chk CHECK (mapping_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_lifecycle_operation_binding_transition_chk CHECK (transition_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_lifecycle_operation_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_lifecycle_binding IS 'Portable Entity-to-lifecycle revision coordinate. The lifecycle body remains owned by its target plane.';
COMMENT ON TABLE metadata.entity_lifecycle_operation_binding IS 'Canonical operation-to-transition mapping. It replaces the former lifecycle_transition_code shortcut on metadata.entity_operation.';

CREATE TABLE metadata.entity_numbering_binding (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid,
    entity_id             uuid        NOT NULL,
    change_set_id         uuid        NOT NULL,
    entity_field_id       uuid        NOT NULL,
    entity_operation_id   uuid,
    binding_key           text        NOT NULL,
    target_plane          text        NOT NULL,
    policy_code           text        NOT NULL,
    policy_revision       integer     NOT NULL,
    assignment_mode       text        NOT NULL DEFAULT 'automatic',
    required              boolean     NOT NULL DEFAULT true,
    status                text        NOT NULL DEFAULT 'active',
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT entity_numbering_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_numbering_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_numbering_binding_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, binding_key),
    CONSTRAINT entity_numbering_binding_field_plane_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, entity_field_id, target_plane),
    CONSTRAINT entity_numbering_binding_key_chk CHECK (binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_numbering_binding_plane_chk CHECK (target_plane IN ('neon','mesh')),
    CONSTRAINT entity_numbering_binding_policy_code_chk CHECK (policy_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_numbering_binding_policy_revision_chk CHECK (policy_revision >= 1),
    CONSTRAINT entity_numbering_binding_assignment_mode_chk CHECK (assignment_mode IN ('automatic','manual')),
    CONSTRAINT entity_numbering_binding_operation_chk CHECK (
        (assignment_mode = 'automatic' AND entity_operation_id IS NOT NULL)
        OR (assignment_mode = 'manual' AND entity_operation_id IS NULL)
    ),
    CONSTRAINT entity_numbering_binding_status_chk CHECK (status IN ('active','deprecated')),
    CONSTRAINT entity_numbering_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_numbering_binding IS
  'Portable Entity field-to-numbering-policy revision coordinate. The policy is configured in target-plane control; mutable counters never belong in metadata.';
COMMENT ON COLUMN metadata.entity_numbering_binding.entity_operation_id IS
  'Canonical operation that requests automatic allocation. Manual bindings deliberately have no triggering operation.';

CREATE TABLE metadata.entity_operation_scope_binding (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid        NOT NULL,
    change_set_id              uuid        NOT NULL,
    entity_operation_id        uuid        NOT NULL,
    binding_key                text        NOT NULL,
    target_plane               text        NOT NULL,
    decision_mode              text        NOT NULL,
    scope_kind                 text        NOT NULL,
    coordinate_source          text        NOT NULL,
    coordinate_key             text,
    resolver_key               text,
    missing_value_behavior     text        NOT NULL DEFAULT 'deny',
    status                     metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT entity_operation_scope_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_operation_scope_binding_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_operation_scope_binding_key_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, binding_key),
    CONSTRAINT entity_operation_scope_binding_coordinate_uq
        UNIQUE NULLS NOT DISTINCT (
            tenant_id, change_set_id, entity_operation_id, target_plane, scope_kind
        ),
    CONSTRAINT entity_operation_scope_binding_key_chk
        CHECK (binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_scope_binding_plane_chk
        CHECK (target_plane IN ('neon', 'mesh')),
    CONSTRAINT entity_operation_scope_binding_decision_chk
        CHECK (decision_mode IN ('entity_resource', 'collection')),
    CONSTRAINT entity_operation_scope_binding_scope_chk
        CHECK (scope_kind IN (
            'tenant', 'workspace', 'module', 'company_code', 'legal_entity',
            'operating_organization', 'network_account',
            'network_relationship', 'resource'
        )),
    CONSTRAINT entity_operation_scope_binding_source_chk
        CHECK (coordinate_source IN (
            'tenant_context', 'request_field', 'record_field',
            'collection_field', 'relation_resolver'
        )),
    CONSTRAINT entity_operation_scope_binding_coordinate_key_chk CHECK (
        coordinate_key IS NULL OR coordinate_key ~ '^[a-z_][a-z0-9_]{0,126}$'
    ),
    CONSTRAINT entity_operation_scope_binding_resolver_key_chk CHECK (
        resolver_key IS NULL OR resolver_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'
    ),
    CONSTRAINT entity_operation_scope_binding_missing_chk
        CHECK (missing_value_behavior = 'deny'),
    CONSTRAINT entity_operation_scope_binding_source_pair_chk CHECK (
        ((coordinate_source IN ('request_field', 'record_field', 'collection_field'))
            = (coordinate_key IS NOT NULL))
        AND ((coordinate_source = 'relation_resolver') = (resolver_key IS NOT NULL))
    ),
    CONSTRAINT entity_operation_scope_binding_tenant_source_chk CHECK (
        (scope_kind = 'tenant' AND coordinate_source = 'tenant_context')
        OR (scope_kind <> 'tenant' AND coordinate_source <> 'tenant_context')
    ),
    CONSTRAINT entity_operation_scope_binding_mode_chk CHECK (
        NOT (decision_mode = 'collection'
             AND coordinate_source IN ('request_field', 'record_field'))
        AND NOT (decision_mode = 'entity_resource'
                 AND coordinate_source = 'collection_field')
    ),
    CONSTRAINT entity_operation_scope_binding_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_operation_scope_binding IS
  'Admin-authored, change-set-owned scope-coordinate recipe. Plane compilers freeze it into immutable artifacts; consumer authz tables are projections only.';
