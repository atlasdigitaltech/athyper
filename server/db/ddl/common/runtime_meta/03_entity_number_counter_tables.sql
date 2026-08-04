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
