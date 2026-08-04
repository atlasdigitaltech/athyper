CREATE TABLE authz.entity_operation_scope_binding (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,
    plane_code                  text        NOT NULL,
    source_entity_id            uuid        NOT NULL,
    source_entity_operation_id  uuid        NOT NULL,
    source_release_id           uuid        NOT NULL,
    source_release_hash         text        NOT NULL,
    source_compiled_artifact_id uuid        NOT NULL,
    source_compiled_hash        text        NOT NULL,
    entity_code                 text        NOT NULL,
    operation_key               text        NOT NULL,
    permission_id               uuid        NOT NULL,
    decision_mode               authz.operation_decision_mode_d NOT NULL,
    scope_kind                  authz.scope_kind_d NOT NULL,
    coordinate_source           authz.scope_coordinate_source_d NOT NULL,
    coordinate_key              text,
    resolver_key                text,
    missing_value_behavior      text        NOT NULL DEFAULT 'deny',
    status                      authz.operation_scope_binding_status_d NOT NULL DEFAULT 'draft',
    effective_from              timestamptz,
    effective_until             timestamptz,
    published_at                timestamptz,
    published_by                uuid,
    retired_at                  timestamptz,
    retired_by                  uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT entity_operation_scope_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_operation_scope_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id,id),
    CONSTRAINT entity_operation_scope_binding_coordinate_uq UNIQUE NULLS NOT DISTINCT
        (tenant_id,source_release_hash,source_entity_operation_id,scope_kind),
    CONSTRAINT entity_operation_scope_binding_plane_chk CHECK (plane_code IN ('neon','mesh')),
    CONSTRAINT entity_operation_scope_binding_release_hash_chk CHECK (source_release_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_operation_scope_binding_compiled_hash_chk CHECK (source_compiled_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_operation_scope_binding_entity_code_chk CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_scope_binding_operation_key_chk CHECK (operation_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_scope_binding_coordinate_key_chk CHECK (
        coordinate_key IS NULL OR coordinate_key ~ '^[a-z][a-z0-9_]{0,126}$'),
    CONSTRAINT entity_operation_scope_binding_resolver_key_chk CHECK (
        resolver_key IS NULL OR resolver_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_operation_scope_binding_fail_closed_chk CHECK (missing_value_behavior = 'deny'),
    CONSTRAINT entity_operation_scope_binding_source_shape_chk CHECK (
        (coordinate_source IN ('request_field','record_field','collection_field') AND coordinate_key IS NOT NULL AND resolver_key IS NULL)
        OR (coordinate_source = 'relation_resolver' AND coordinate_key IS NULL AND resolver_key IS NOT NULL)
        OR (coordinate_source = 'tenant_context' AND coordinate_key IS NULL AND resolver_key IS NULL)
    ),
    CONSTRAINT entity_operation_scope_binding_scope_source_chk CHECK (
        (scope_kind = 'tenant' AND coordinate_source = 'tenant_context')
        OR (scope_kind <> 'tenant' AND coordinate_source <> 'tenant_context')
    ),
    CONSTRAINT entity_operation_scope_binding_mode_source_chk CHECK (
        (decision_mode = 'collection' AND coordinate_source IN ('tenant_context','collection_field','relation_resolver'))
        OR (decision_mode = 'entity_resource' AND coordinate_source <> 'collection_field')
    ),
    CONSTRAINT entity_operation_scope_binding_publication_chk CHECK (
        (status = 'draft' AND effective_from IS NULL AND effective_until IS NULL
          AND published_at IS NULL AND published_by IS NULL AND retired_at IS NULL AND retired_by IS NULL)
        OR (status = 'published' AND effective_from IS NOT NULL AND effective_until IS NULL
          AND published_at IS NOT NULL AND published_by IS NOT NULL AND retired_at IS NULL AND retired_by IS NULL)
        OR (status = 'retired' AND effective_from IS NOT NULL AND effective_until IS NOT NULL
          AND published_at IS NOT NULL AND published_by IS NOT NULL AND retired_at IS NOT NULL AND retired_by IS NOT NULL)
    ),
    CONSTRAINT entity_operation_scope_binding_time_chk CHECK (
        (effective_until IS NULL OR effective_until >= effective_from)
        AND (published_at IS NULL OR published_at >= created_at)
        AND (retired_at IS NULL OR retired_at >= published_at)
    ),
    CONSTRAINT entity_operation_scope_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.entity_operation_scope_binding IS
  'Compiler-owned, plane-local mapping from one immutable Entity operation release to one canonical authorization scope coordinate. It grants no authority and missing coordinates always deny.';
COMMENT ON COLUMN authz.entity_operation_scope_binding.permission_id IS
  'Local published entity-operation permission. Grant, role, deny, delegation, and scope-assignment ownership remain in the existing authz tables.';
COMMENT ON COLUMN authz.entity_operation_scope_binding.coordinate_key IS
  'Canonical field key only; executable SQL, JSONPath, and caller-supplied expressions are prohibited.';

