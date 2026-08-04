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
