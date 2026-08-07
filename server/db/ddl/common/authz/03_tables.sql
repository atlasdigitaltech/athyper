CREATE TABLE authz.application_projection (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,realm_key text NOT NULL,
 external_organization_id text NOT NULL,organization_alias text,organization_name text NOT NULL,
 source_projection_id uuid NOT NULL,source_version bigint NOT NULL,source_hash text NOT NULL,
 status authz.application_projection_status_d NOT NULL DEFAULT 'pending',effective_from timestamptz,effective_until timestamptz,
 reconciled_at timestamptz,reconciliation_error_code text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 status_changed_at timestamptz,status_changed_by uuid,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT application_projection_pkey PRIMARY KEY(id),CONSTRAINT application_projection_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT application_projection_source_version_uq UNIQUE(source_projection_id,source_version),
 CONSTRAINT application_projection_realm_chk CHECK(realm_key~'^[a-z][a-z0-9_.-]{1,62}$'),
 CONSTRAINT application_projection_external_chk CHECK(btrim(external_organization_id)<>''),
 CONSTRAINT application_projection_name_chk CHECK(btrim(organization_name)<>''),
 CONSTRAINT application_projection_source_version_chk CHECK(source_version>0),
 CONSTRAINT application_projection_source_hash_chk CHECK(source_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT application_projection_range_chk CHECK(effective_until IS NULL OR (effective_from IS NOT NULL AND effective_until>effective_from)),
 CONSTRAINT application_projection_active_chk CHECK(status<>'active' OR effective_from IS NOT NULL),
 CONSTRAINT application_projection_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
 CONSTRAINT application_projection_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
 CONSTRAINT application_projection_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE TABLE authz.projection_provider (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,projection_id uuid NOT NULL,
 provider_code text NOT NULL,protocol text NOT NULL,external_provider_id text,
 source_provider_id uuid NOT NULL,source_version bigint NOT NULL,status authz.projection_provider_status_d NOT NULL DEFAULT 'pending',
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT projection_provider_pkey PRIMARY KEY(id),CONSTRAINT projection_provider_coordinate_uq UNIQUE(projection_id,provider_code),
 CONSTRAINT projection_provider_code_chk CHECK(provider_code~'^[a-z][a-z0-9_.-]{1,62}$'),
 CONSTRAINT projection_provider_protocol_chk CHECK(protocol IN ('native','oidc','saml')),
 CONSTRAINT projection_provider_version_chk CHECK(source_version>0),
 CONSTRAINT projection_provider_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE TABLE authz.projection_scope (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,projection_id uuid NOT NULL,scope_target_id uuid NOT NULL,
 ceiling_mode authz.projection_ceiling_mode_d NOT NULL DEFAULT 'exact',network_role_ceiling text,
 source_scope_id uuid NOT NULL,source_version bigint NOT NULL,status shared.ref_status_d NOT NULL DEFAULT 'active',
 effective_from timestamptz NOT NULL,effective_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT projection_scope_pkey PRIMARY KEY(id),CONSTRAINT projection_scope_coordinate_uq UNIQUE(projection_id,scope_target_id),
 CONSTRAINT projection_scope_network_role_chk CHECK(network_role_ceiling IS NULL OR network_role_ceiling IN ('buyer','supplier','both')),
 CONSTRAINT projection_scope_version_chk CHECK(source_version>0),
 CONSTRAINT projection_scope_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
 CONSTRAINT projection_scope_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE authz.application_projection IS 'Plane-local reconciled TrustIAM organization projection. It limits admission ceilings but grants no membership, role, permission, or scope assignment.';
COMMENT ON COLUMN authz.application_projection.organization_alias IS 'Safe display snapshot only; never a tenant identifier or authorization key.';

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
