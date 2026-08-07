CREATE TABLE trustiam.organization (
 id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL, canonical_party_id uuid NOT NULL,
 realm_key text NOT NULL, external_organization_id text NOT NULL, organization_alias text, display_name text NOT NULL,
 status trustiam.organization_status_d NOT NULL DEFAULT 'draft', observed_adapter_version text, observed_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb, status_changed_at timestamptz,status_changed_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT trustiam_organization_pkey PRIMARY KEY(id), CONSTRAINT trustiam_organization_tenant_id_uq UNIQUE(authority_tenant_id,id),
 CONSTRAINT trustiam_organization_external_uq UNIQUE(realm_key,external_organization_id),
 CONSTRAINT trustiam_organization_realm_chk CHECK(realm_key~'^[a-z][a-z0-9_.-]{1,62}$'),
 CONSTRAINT trustiam_organization_external_chk CHECK(btrim(external_organization_id)<>''),
 CONSTRAINT trustiam_organization_name_chk CHECK(btrim(display_name)<>''),
 CONSTRAINT trustiam_organization_observation_chk CHECK((observed_adapter_version IS NULL)=(observed_at IS NULL)),
 CONSTRAINT trustiam_organization_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
 CONSTRAINT trustiam_organization_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
 CONSTRAINT trustiam_organization_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE TABLE trustiam.organization_provider (
 id uuid NOT NULL DEFAULT shared.uuidv7(),authority_tenant_id uuid NOT NULL,organization_id uuid NOT NULL,
 protocol trustiam.provider_protocol_d NOT NULL,provider_code text NOT NULL,external_provider_id text,
 approved_domains text[] NOT NULL DEFAULT '{}',routing_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
 status trustiam.provider_status_d NOT NULL DEFAULT 'draft',observed_adapter_version text,observed_at timestamptz,
 status_changed_at timestamptz,status_changed_by uuid,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT trustiam_organization_provider_pkey PRIMARY KEY(id),CONSTRAINT trustiam_organization_provider_tenant_id_uq UNIQUE(authority_tenant_id,id),
 CONSTRAINT trustiam_organization_provider_code_uq UNIQUE(organization_id,provider_code),
 CONSTRAINT trustiam_organization_provider_code_chk CHECK(provider_code~'^[a-z][a-z0-9_.-]{1,62}$'),
 CONSTRAINT trustiam_organization_provider_domains_chk CHECK(array_position(approved_domains,NULL) IS NULL),
 CONSTRAINT trustiam_organization_provider_routing_chk CHECK(jsonb_typeof(routing_contract)='object'),
 CONSTRAINT trustiam_organization_provider_observation_chk CHECK((observed_adapter_version IS NULL)=(observed_at IS NULL)),
 CONSTRAINT trustiam_organization_provider_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
 CONSTRAINT trustiam_organization_provider_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE TABLE trustiam.application_projection (
 id uuid NOT NULL DEFAULT shared.uuidv7(),authority_tenant_id uuid NOT NULL,organization_id uuid NOT NULL,
 target_plane shared.application_plane_d NOT NULL,target_tenant_id uuid NOT NULL,
 desired_version bigint NOT NULL,desired_hash text NOT NULL,source_onboarding_case_id uuid,
 source_resource_kind text,source_resource_id uuid,status trustiam.projection_status_d NOT NULL DEFAULT 'draft',
 reconciliation_status trustiam.reconciliation_status_d NOT NULL DEFAULT 'pending',effective_from timestamptz,effective_until timestamptz,
 last_reconciled_at timestamptz,last_error_code text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 status_changed_at timestamptz,status_changed_by uuid,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT trustiam_application_projection_pkey PRIMARY KEY(id),CONSTRAINT trustiam_application_projection_tenant_id_uq UNIQUE(authority_tenant_id,id),
 CONSTRAINT trustiam_application_projection_version_chk CHECK(desired_version>0),
 CONSTRAINT trustiam_application_projection_hash_chk CHECK(desired_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT trustiam_application_projection_source_chk CHECK((source_resource_kind IS NULL)=(source_resource_id IS NULL)),
 CONSTRAINT trustiam_application_projection_range_chk CHECK(effective_until IS NULL OR (effective_from IS NOT NULL AND effective_until>effective_from)),
 CONSTRAINT trustiam_application_projection_active_chk CHECK(status<>'active' OR effective_from IS NOT NULL),
 CONSTRAINT trustiam_application_projection_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
 CONSTRAINT trustiam_application_projection_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
 CONSTRAINT trustiam_application_projection_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE TABLE trustiam.projection_scope (
 id uuid NOT NULL DEFAULT shared.uuidv7(),authority_tenant_id uuid NOT NULL,projection_id uuid NOT NULL,
 scope_kind trustiam.projection_scope_kind_d NOT NULL,target_id uuid NOT NULL,
 ceiling_mode trustiam.scope_ceiling_mode_d NOT NULL DEFAULT 'exact',network_role_ceiling trustiam.network_role_ceiling_d,
 desired_version bigint NOT NULL,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,status shared.ref_status_d NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT trustiam_projection_scope_pkey PRIMARY KEY(id),CONSTRAINT trustiam_projection_scope_coordinate_uq UNIQUE(projection_id,scope_kind,target_id),
 CONSTRAINT trustiam_projection_scope_version_chk CHECK(desired_version>0),
 CONSTRAINT trustiam_projection_scope_mesh_role_chk CHECK((scope_kind='network_account') OR network_role_ceiling IS NULL),
 CONSTRAINT trustiam_projection_scope_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
 CONSTRAINT trustiam_projection_scope_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE trustiam.organization IS 'Desired-state identity administration boundary linked to one canonical party. Alias is descriptive and never a tenant key.';
COMMENT ON TABLE trustiam.organization_provider IS 'Approved identity route without credentials or secrets; external adapters such as Keycloak materialize this desired state.';
COMMENT ON TABLE trustiam.application_projection IS 'Admin desired projection into one application plane. It does not itself grant application access.';
