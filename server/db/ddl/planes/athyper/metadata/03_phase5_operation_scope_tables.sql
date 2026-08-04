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
