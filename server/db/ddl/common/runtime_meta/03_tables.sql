-- Mutable, plane-local enforcement state. It is updated only by the local
-- content/attachment services; commercial limits remain in control.
CREATE TABLE runtime_meta.tenant_usage_counter (
    tenant_id       uuid        NOT NULL,
    usage_metric_id uuid        NOT NULL,
    dimension_code  text        NOT NULL DEFAULT '*',
    consumed_value  bigint      NOT NULL DEFAULT 0,
    reserved_value  bigint      NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    reconciled_at   timestamptz,

    CONSTRAINT tenant_usage_counter_pkey
        PRIMARY KEY (tenant_id, usage_metric_id, dimension_code),
    CONSTRAINT tenant_usage_counter_dimension_chk
        CHECK (dimension_code = '*' OR dimension_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT tenant_usage_counter_consumed_chk CHECK (consumed_value >= 0),
    CONSTRAINT tenant_usage_counter_reserved_chk CHECK (reserved_value >= 0),
    CONSTRAINT tenant_usage_counter_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE runtime_meta.tenant_usage_counter IS
  'Plane-local current usage and short-lived reservations. It is not the commercial entitlement source of truth.';

CREATE TABLE runtime_meta.usage_reservation (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    usage_metric_id uuid        NOT NULL,
    dimension_code  text        NOT NULL DEFAULT '*',
    resource_type   text        NOT NULL,
    resource_id     uuid        NOT NULL,
    reserved_value  bigint      NOT NULL,
    actual_value    bigint,
    status          text        NOT NULL DEFAULT 'reserved',
    expires_at      timestamptz NOT NULL,
    committed_at    timestamptz,
    released_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT usage_reservation_pkey PRIMARY KEY (id),
    CONSTRAINT usage_reservation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT usage_reservation_resource_uq
        UNIQUE (tenant_id, usage_metric_id, dimension_code, resource_type, resource_id),
    CONSTRAINT usage_reservation_dimension_chk
        CHECK (dimension_code = '*' OR dimension_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT usage_reservation_resource_type_chk
        CHECK (resource_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT usage_reservation_values_chk
        CHECK (reserved_value >= 0 AND (actual_value IS NULL OR actual_value >= 0)),
    CONSTRAINT usage_reservation_status_chk
        CHECK (status IN ('reserved', 'committed', 'released', 'expired')),
    CONSTRAINT usage_reservation_terminal_chk CHECK (
        (status = 'reserved' AND committed_at IS NULL AND released_at IS NULL)
        OR (status = 'committed' AND committed_at IS NOT NULL AND released_at IS NULL)
        OR (status IN ('released', 'expired') AND released_at IS NOT NULL)
    ),
    CONSTRAINT usage_reservation_expiry_chk CHECK (expires_at > created_at),
    CONSTRAINT usage_reservation_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE runtime_meta.usage_reservation IS
  'Idempotent plane-local resource reservations. One resource may reserve multiple metrics atomically through one row per metric.';

-- Local cache-version coordinates for the authorization evaluator.
CREATE TABLE runtime_meta.authorization_epoch (
    id          uuid        NOT NULL DEFAULT shared.uuidv7(),
    scope_kind  text        NOT NULL,
    tenant_id   uuid,
    plane_code  text,
    epoch       bigint      NOT NULL DEFAULT 0,
    updated_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by  text        NOT NULL DEFAULT session_user,
    CONSTRAINT authorization_epoch_pkey PRIMARY KEY (id),
    CONSTRAINT authorization_epoch_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE runtime_meta.authorization_epoch IS
  'Plane-local, monotonic authorization cache versions. Authority remains in authz; delivery work remains in event.';

CREATE TABLE runtime_meta.entity_number_counter (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    numbering_policy_id   uuid        NOT NULL,
    scope_key             text        NOT NULL,
    reset_bucket          text        NOT NULL,
    next_value            bigint      NOT NULL,
    allocation_count      bigint      NOT NULL DEFAULT 0,
    row_version           bigint      NOT NULL DEFAULT 0,
    last_allocated_value  bigint,
    last_allocation_id    uuid,
    last_allocated_at     timestamptz,
    last_allocated_by     uuid,
    last_correlation_id   uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT entity_number_counter_pkey PRIMARY KEY (id),
    CONSTRAINT entity_number_counter_tenant_id_uq UNIQUE (tenant_id,id),
    CONSTRAINT entity_number_counter_partition_uq
        UNIQUE (tenant_id,numbering_policy_id,scope_key,reset_bucket),
    CONSTRAINT entity_number_counter_scope_key_chk
        CHECK (btrim(scope_key) <> '' AND length(scope_key) <= 512),
    CONSTRAINT entity_number_counter_reset_bucket_chk
        CHECK (reset_bucket ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'),
    CONSTRAINT entity_number_counter_next_value_chk CHECK (next_value BETWEEN 0 AND 9007199254740991),
    CONSTRAINT entity_number_counter_allocation_count_chk CHECK (allocation_count >= 0),
    CONSTRAINT entity_number_counter_row_version_chk CHECK (row_version >= 0),
    CONSTRAINT entity_number_counter_last_allocation_chk CHECK (
        (last_allocated_value IS NULL AND last_allocation_id IS NULL AND last_allocated_at IS NULL
            AND last_allocated_by IS NULL AND last_correlation_id IS NULL)
        OR (last_allocated_value IS NOT NULL AND last_allocation_id IS NOT NULL AND last_allocated_at IS NOT NULL
            AND last_allocated_by IS NOT NULL)
    ),
    CONSTRAINT entity_number_counter_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE runtime_meta.entity_number_counter IS
  'Mutable plane-local numbering state. One row is one tenant, policy revision, scope, and reset bucket; only the allocation service may advance it.';
COMMENT ON COLUMN runtime_meta.entity_number_counter.next_value IS
  'Value reserved for the next successful allocation. Preview never reads or mutates this column.';
COMMENT ON COLUMN runtime_meta.entity_number_counter.reset_bucket IS
  'Immutable rollover partition: never, YYYY, YYYY-MM, YYYY-MM-DD, or the caller-resolved fiscal-year code.';

CREATE TABLE runtime_meta.entity_number_allocation (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    allocation_id uuid NOT NULL,
    numbering_policy_id uuid NOT NULL,
    counter_id uuid NOT NULL,
    policy_code text NOT NULL,
    policy_revision integer NOT NULL,
    policy_source text NOT NULL,
    scope_key text NOT NULL,
    reset_bucket text NOT NULL,
    allocated_value bigint NOT NULL,
    following_value bigint NOT NULL,
    formatted_number text NOT NULL,
    correlation_id uuid,
    context jsonb NOT NULL DEFAULT '{}'::jsonb,
    allocated_at timestamptz NOT NULL,
    allocated_by uuid NOT NULL,
    CONSTRAINT entity_number_allocation_pkey PRIMARY KEY (id),
    CONSTRAINT entity_number_allocation_id_uq UNIQUE (tenant_id,allocation_id),
    CONSTRAINT entity_number_allocation_tenant_id_uq UNIQUE (tenant_id,id),
    CONSTRAINT entity_number_allocation_policy_chk CHECK (policy_code ~ '^[a-z][a-z0-9_.-]{1,126}$' AND policy_revision > 0),
    CONSTRAINT entity_number_allocation_source_chk CHECK (policy_source IN ('tenant','global')),
    CONSTRAINT entity_number_allocation_scope_chk CHECK (btrim(scope_key) <> '' AND btrim(reset_bucket) <> ''),
    CONSTRAINT entity_number_allocation_value_chk CHECK (allocated_value >= 0 AND following_value > allocated_value),
    CONSTRAINT entity_number_allocation_number_chk CHECK (btrim(formatted_number) <> '' AND length(formatted_number) <= 512),
    CONSTRAINT entity_number_allocation_context_chk CHECK (jsonb_typeof(context) = 'object')
);
COMMENT ON TABLE runtime_meta.entity_number_allocation IS
  'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Durable idempotency and audit receipt for a committed numbering allocation.';

CREATE TABLE runtime_meta.applied_release (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    publication_key text NOT NULL,
    source_release_id uuid NOT NULL,
    source_release_no bigint NOT NULL,
    deployment_id uuid NOT NULL,
    artifact_hash text NOT NULL,
    manifest jsonb NOT NULL,
    status runtime_meta.applied_release_status_d NOT NULL DEFAULT 'staged',
    staged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    verified_at timestamptz,
    activated_at timestamptz,
    rejected_at timestamptz,
    verification_evidence jsonb,
    failure_code text,
    created_by text NOT NULL DEFAULT session_user,
    CONSTRAINT runtime_applied_release_pkey PRIMARY KEY(id),
    CONSTRAINT runtime_applied_release_source_uq UNIQUE(publication_key,source_release_id),
    CONSTRAINT runtime_applied_release_deployment_uq UNIQUE(deployment_id),
    CONSTRAINT runtime_applied_release_key_chk CHECK(publication_key ~ '^[a-z][a-z0-9_.:-]{1,190}$'),
    CONSTRAINT runtime_applied_release_no_chk CHECK(source_release_no >= 1),
    CONSTRAINT runtime_applied_release_hash_chk CHECK(artifact_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT runtime_applied_release_manifest_chk CHECK(jsonb_typeof(manifest)='object')
);

CREATE TABLE runtime_meta.release_activation_head (
    publication_key text PRIMARY KEY,
    applied_release_id uuid NOT NULL UNIQUE,
    source_release_no bigint NOT NULL,
    artifact_hash text NOT NULL,
    activated_at timestamptz NOT NULL,
    row_version bigint NOT NULL DEFAULT 1,
    CONSTRAINT runtime_release_head_key_chk CHECK(publication_key ~ '^[a-z][a-z0-9_.:-]{1,190}$'),
    CONSTRAINT runtime_release_head_version_chk CHECK(row_version >= 1)
);

CREATE TABLE runtime_meta.release_activation_event (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    publication_key text NOT NULL,
    previous_applied_release_id uuid,
    applied_release_id uuid NOT NULL,
    activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    activated_by text NOT NULL DEFAULT session_user,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT runtime_release_activation_event_pkey PRIMARY KEY(id),
    CONSTRAINT runtime_release_activation_event_evidence_chk CHECK(jsonb_typeof(evidence)='object')
);

COMMENT ON TABLE runtime_meta.release_activation_head IS 'Plane-local availability boundary. Runtime reads this head and continues using it when Athyper publication authority is unreachable.';
COMMENT ON TABLE runtime_meta.applied_release IS 'Durable local stage/verify/activate state; source UUIDs are coordinates, not cross-database foreign keys.';

-- Immutable, portable Entity contract received from Athyper publication.
-- Source UUIDs are trust coordinates and deliberately have no cross-database FKs.
CREATE TABLE runtime_meta.entity_contract (
    id                       uuid        NOT NULL,
    tenant_id                uuid,
    entity_id                uuid        NOT NULL,
    entity_code              text        NOT NULL,
    release_id               uuid        NOT NULL,
    revision_id              uuid        NOT NULL,
    release_no               bigint      NOT NULL,
    contract_schema_code     text        NOT NULL,
    contract_schema_version  text        NOT NULL,
    entity_contract_hash     text        NOT NULL,
    contract_json            jsonb       NOT NULL,
    publication_key          text        NOT NULL,
    signature_algorithm      text        NOT NULL,
    signing_key_id           text        NOT NULL,
    signature                text        NOT NULL,
    published_at             timestamptz NOT NULL,
    received_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
    status                   runtime_meta.entity_contract_status_d NOT NULL DEFAULT 'staged',
    status_changed_at        timestamptz,

    CONSTRAINT runtime_entity_contract_pkey PRIMARY KEY (id),
    CONSTRAINT runtime_entity_contract_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT runtime_entity_contract_release_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_id, release_id),
    CONSTRAINT runtime_entity_contract_release_no_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_id, release_no),
    -- Compatibility coordinate retained for Mesh document envelopes.
    CONSTRAINT runtime_entity_contract_legacy_coordinate_uq
        UNIQUE (entity_id, id, entity_contract_hash),
    CONSTRAINT runtime_entity_contract_code_chk
        CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT runtime_entity_contract_release_no_chk CHECK (release_no >= 1),
    CONSTRAINT runtime_entity_contract_schema_code_chk
        CHECK (contract_schema_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT runtime_entity_contract_schema_version_chk
        CHECK (contract_schema_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?$'),
    CONSTRAINT runtime_entity_contract_hash_chk
        CHECK (entity_contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT runtime_entity_contract_json_chk CHECK (jsonb_typeof(contract_json) = 'object'),
    CONSTRAINT runtime_entity_contract_publication_key_chk
        CHECK (publication_key ~ '^[a-z][a-z0-9_.:-]{1,190}$'),
    CONSTRAINT runtime_entity_contract_signature_chk CHECK (
        btrim(signature_algorithm) <> '' AND btrim(signing_key_id) <> '' AND btrim(signature) <> ''
    ),
    CONSTRAINT runtime_entity_contract_time_chk CHECK (received_at >= published_at),
    CONSTRAINT runtime_entity_contract_status_time_chk CHECK (
        (status = 'staged' AND status_changed_at IS NULL)
        OR (status <> 'staged' AND status_changed_at IS NOT NULL)
    )
);

CREATE TABLE runtime_meta.entity_descriptor (
    id                         uuid        NOT NULL,
    tenant_id                  uuid,
    entity_contract_id         uuid        NOT NULL,
    entity_id                  uuid        NOT NULL,
    release_id                 uuid        NOT NULL,
    revision_id                uuid        NOT NULL,
    plane_code                 text        NOT NULL,
    descriptor_kind            text        NOT NULL,
    descriptor_schema_version  text        NOT NULL,
    source_contract_hash       text        NOT NULL,
    compiled_hash              text        NOT NULL,
    compiled_json              jsonb       NOT NULL,
    compiler_version           text        NOT NULL,
    compatibility_level        text        NOT NULL,
    applied_release_id         uuid        NOT NULL,
    generated_at               timestamptz NOT NULL,
    received_at                timestamptz NOT NULL DEFAULT clock_timestamp(),
    status                     runtime_meta.entity_descriptor_status_d NOT NULL DEFAULT 'staged',
    activated_at               timestamptz,
    retired_at                 timestamptz,

    CONSTRAINT runtime_entity_descriptor_pkey PRIMARY KEY (id),
    CONSTRAINT runtime_entity_descriptor_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT runtime_entity_descriptor_release_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_id, release_id, plane_code, descriptor_kind),
    CONSTRAINT runtime_entity_descriptor_plane_chk CHECK (plane_code IN ('studio','neon','mesh')),
    CONSTRAINT runtime_entity_descriptor_kind_chk
        CHECK (descriptor_kind ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT runtime_entity_descriptor_schema_version_chk
        CHECK (descriptor_schema_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?$'),
    CONSTRAINT runtime_entity_descriptor_contract_hash_chk
        CHECK (source_contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT runtime_entity_descriptor_compiled_hash_chk
        CHECK (compiled_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT runtime_entity_descriptor_json_chk CHECK (jsonb_typeof(compiled_json) = 'object'),
    CONSTRAINT runtime_entity_descriptor_compiler_version_chk CHECK (btrim(compiler_version) <> ''),
    CONSTRAINT runtime_entity_descriptor_compatibility_chk
        CHECK (compatibility_level IN ('breaking','backward_compatible','forward_compatible','fully_compatible')),
    CONSTRAINT runtime_entity_descriptor_time_chk CHECK (received_at >= generated_at),
    CONSTRAINT runtime_entity_descriptor_status_time_chk CHECK (
        (status = 'staged' AND activated_at IS NULL AND retired_at IS NULL)
        OR (status = 'active' AND activated_at IS NOT NULL AND retired_at IS NULL)
        OR (status = 'retired' AND activated_at IS NOT NULL AND retired_at IS NOT NULL AND retired_at >= activated_at)
    )
);

COMMENT ON TABLE runtime_meta.entity_contract IS
  'Immutable all-plane projection of an Athyper-authored Entity release. Status is the only mutable contract state.';
COMMENT ON TABLE runtime_meta.entity_descriptor IS
  'Immutable plane-local compiler output. Athyper uses admin_preview descriptors; Neon and Mesh use executable descriptors.';

CREATE TABLE runtime_meta.applied_release_payload (
    id                     uuid        NOT NULL,
    applied_release_id     uuid        NOT NULL,
    tenant_id              uuid,
    artifact_kind          text        NOT NULL,
    payload_schema_version text        NOT NULL,
    payload_hash           text        NOT NULL,
    payload_json           jsonb       NOT NULL,
    coordinates            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    generated_at           timestamptz NOT NULL,
    received_at            timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT runtime_applied_release_payload_pkey PRIMARY KEY (id),
    CONSTRAINT runtime_applied_release_payload_release_uq UNIQUE (applied_release_id),
    CONSTRAINT runtime_applied_release_payload_kind_chk
        CHECK (artifact_kind ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT runtime_applied_release_payload_schema_chk
        CHECK (payload_schema_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?$'),
    CONSTRAINT runtime_applied_release_payload_hash_chk CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT runtime_applied_release_payload_json_chk CHECK (jsonb_typeof(payload_json) = 'object'),
    CONSTRAINT runtime_applied_release_payload_coordinates_chk CHECK (jsonb_typeof(coordinates) = 'object'),
    CONSTRAINT runtime_applied_release_payload_time_chk CHECK (received_at >= generated_at)
);

COMMENT ON TABLE runtime_meta.applied_release_payload IS
  'Immutable offline-safe payload for a locally applied non-Entity publication artifact. Release lifecycle and activation are owned only by applied_release and release_activation_head.';


-- BEGIN ATLAS EXPERIENCE FOUNDATION: runtime_meta.experience_surface_projection
CREATE TABLE runtime_meta.experience_surface_projection (
    id uuid DEFAULT shared.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    plane_code text NOT NULL,
    surface_key text NOT NULL,
    layer text NOT NULL,
    source_release_id uuid NOT NULL,
    source_revision bigint NOT NULL,
    definition jsonb NOT NULL,
    content_hash character(64) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_by uuid NOT NULL,
    retired_at timestamp with time zone,
    retired_by uuid,
    CONSTRAINT experience_surface_projection_definition_chk CHECK ((((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'athyper-experience-surface/1'::text) AND ((definition ->> 'id'::text) = surface_key) AND (octet_length((definition)::text) <= 262144))) IS TRUE),
    CONSTRAINT experience_surface_projection_hash_chk CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT experience_surface_projection_key_chk CHECK ((surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'::text)),
    CONSTRAINT experience_surface_projection_layer_chk CHECK ((layer = ANY (ARRAY['shared'::text, 'tenant'::text]))),
    CONSTRAINT experience_surface_projection_local_plane_chk CHECK (((plane_code = current_setting('app.database_plane'::text, true)) AND (plane_code = substring(current_database() from 9))) IS TRUE),
    CONSTRAINT experience_surface_projection_plane_chk CHECK ((plane_code = ANY (ARRAY['studio'::text, 'neon'::text, 'mesh'::text]))),
    CONSTRAINT experience_surface_projection_retirement_chk CHECK ((((status = 'active'::text) AND (retired_at IS NULL) AND (retired_by IS NULL)) OR ((status = 'retired'::text) AND (retired_at IS NOT NULL) AND (retired_by IS NOT NULL)))),
    CONSTRAINT experience_surface_projection_revision_chk CHECK ((source_revision > 0)),
    CONSTRAINT experience_surface_projection_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);

COMMENT ON TABLE runtime_meta.experience_surface_projection IS 'Verified plane-local experience projection. Application planes never read Studio authoring tables at request time.';
-- END ATLAS EXPERIENCE FOUNDATION: runtime_meta.experience_surface_projection
