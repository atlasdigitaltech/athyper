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
        CHECK (storage_plane IS NULL OR storage_plane IN ('athyper', 'neon', 'mesh')),
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
