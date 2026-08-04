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
    CONSTRAINT entity_lifecycle_binding_plane_chk CHECK (target_plane IN ('athyper','neon','mesh')),
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
