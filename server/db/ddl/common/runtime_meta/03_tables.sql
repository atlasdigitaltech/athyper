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
