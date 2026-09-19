-- Generic publication authority. Product-specific releases connect through link
-- tables; delivery and acknowledgement remain product-neutral.
CREATE TABLE publication.release (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    release_key text NOT NULL,
    release_no bigint NOT NULL,
    release_kind publication.release_kind_d NOT NULL DEFAULT 'publish',
    status publication.release_status_d NOT NULL DEFAULT 'preparing',
    compatibility_level publication.compatibility_level_d NOT NULL,
    release_hash text NOT NULL,
    manifest_hash text NOT NULL,
    minimum_runtime_version text,
    approved_at timestamptz,
    approved_by uuid,
    published_at timestamptz,
    published_by uuid,
    withdrawn_at timestamptz,
    withdrawn_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT publication_release_pkey PRIMARY KEY (id),
    CONSTRAINT publication_release_coordinate_uq UNIQUE (release_key, release_no),
    CONSTRAINT publication_release_key_chk CHECK (release_key ~ '^[a-z][a-z0-9_.:-]{1,190}$'),
    CONSTRAINT publication_release_no_chk CHECK (release_no >= 1),
    CONSTRAINT publication_release_hash_chk CHECK (release_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT publication_manifest_hash_chk CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT publication_release_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT publication_release_publish_pair_chk CHECK ((published_at IS NULL) = (published_by IS NULL)),
    CONSTRAINT publication_release_withdraw_pair_chk CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL)),
    CONSTRAINT publication_release_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE publication.entity_release_link (
    publication_release_id uuid NOT NULL,
    entity_release_id uuid NOT NULL,
    CONSTRAINT publication_entity_release_link_pkey PRIMARY KEY (publication_release_id),
    CONSTRAINT publication_entity_release_link_entity_uq UNIQUE (entity_release_id)
);

CREATE TABLE publication.business_partner_definition_release_link (
    publication_release_id uuid NOT NULL,
    definition_revision_id uuid NOT NULL,
    publish_idempotency_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by uuid NOT NULL,
    CONSTRAINT publication_bp_definition_release_link_pkey PRIMARY KEY (publication_release_id),
    CONSTRAINT publication_bp_definition_release_link_revision_uq UNIQUE (definition_revision_id),
    CONSTRAINT publication_bp_definition_release_link_idempotency_uq UNIQUE (publish_idempotency_key),
    CONSTRAINT publication_bp_definition_release_link_key_chk CHECK (btrim(publish_idempotency_key)<>'')
);

CREATE TABLE publication.artifact (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    publication_release_id uuid NOT NULL,
    plane_code text NOT NULL,
    artifact_kind text NOT NULL,
    artifact_uri text NOT NULL,
    content_hash text NOT NULL,
    signature_algorithm text,
    signing_key_id text,
    signature text,
    validated_at timestamptz,
    signed_at timestamptz,
    status publication.artifact_status_d NOT NULL DEFAULT 'compiled',
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    CONSTRAINT publication_artifact_pkey PRIMARY KEY (id),
    CONSTRAINT publication_artifact_coordinate_uq UNIQUE (publication_release_id, plane_code, artifact_kind),
    CONSTRAINT publication_artifact_plane_chk CHECK (plane_code IN ('studio','neon','mesh')),
    CONSTRAINT publication_artifact_kind_chk CHECK (artifact_kind ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT publication_artifact_hash_chk CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT publication_artifact_signature_chk CHECK (
      (status IN ('compiled','validated') AND signature_algorithm IS NULL AND signing_key_id IS NULL AND signature IS NULL AND signed_at IS NULL)
      OR (status='signed' AND btrim(signature_algorithm)<>'' AND btrim(signing_key_id)<>'' AND btrim(signature)<>'' AND signed_at IS NOT NULL)
      OR status='withdrawn'
    ),
    CONSTRAINT publication_artifact_validation_chk CHECK ((status='compiled') = (validated_at IS NULL))
);

-- Durable unsigned boundary between compilation and signing. Rows are immutable;
-- signing materializes a separate final artifact and never rewrites this evidence.
CREATE TABLE publication.artifact_compilation (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    publication_release_id uuid NOT NULL,
    plane_code text NOT NULL,
    artifact_kind text NOT NULL,
    unsigned_document jsonb NOT NULL,
    unsigned_hash text NOT NULL,
    compiler_name text NOT NULL,
    compiler_version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    CONSTRAINT publication_artifact_compilation_pkey PRIMARY KEY (id),
    CONSTRAINT publication_artifact_compilation_coordinate_uq UNIQUE (publication_release_id,plane_code,artifact_kind),
    CONSTRAINT publication_artifact_compilation_plane_chk CHECK (plane_code IN ('studio','neon','mesh')),
    CONSTRAINT publication_artifact_compilation_kind_chk CHECK (artifact_kind ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT publication_artifact_compilation_document_chk CHECK (jsonb_typeof(unsigned_document)='object' AND NOT unsigned_document ? 'signature'),
    CONSTRAINT publication_artifact_compilation_hash_chk CHECK (unsigned_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT publication_artifact_compilation_compiler_chk CHECK (btrim(compiler_name)<>'' AND btrim(compiler_version)<>'')
);

CREATE TABLE publication.deployment (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    command_id uuid NOT NULL,
    artifact_id uuid NOT NULL,
    target_plane text NOT NULL,
    target_environment text NOT NULL,
    target_instance text NOT NULL DEFAULT '*',
    status publication.deployment_status_d NOT NULL DEFAULT 'pending',
    attempt_no integer NOT NULL DEFAULT 1,
    correlation_id uuid,
    dispatched_at timestamptz,
    received_at timestamptz,
    staged_at timestamptz,
    verified_at timestamptz,
    activated_at timestamptz,
    failed_at timestamptz,
    failure_code text,
    failure_detail text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    CONSTRAINT publication_deployment_pkey PRIMARY KEY (id),
    CONSTRAINT publication_deployment_command_uq UNIQUE (command_id),
    CONSTRAINT publication_deployment_coordinate_uq UNIQUE (artifact_id, target_environment, target_instance, attempt_no),
    CONSTRAINT publication_deployment_plane_chk CHECK (target_plane IN ('studio','neon','mesh')),
    CONSTRAINT publication_deployment_environment_chk CHECK (target_environment ~ '^[a-z][a-z0-9_-]{0,62}$'),
    CONSTRAINT publication_deployment_instance_chk CHECK (target_instance = '*' OR target_instance ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'),
    CONSTRAINT publication_deployment_attempt_chk CHECK (attempt_no >= 1),
    CONSTRAINT publication_deployment_failure_chk CHECK ((status = 'failed') = (failed_at IS NOT NULL))
);

CREATE TABLE publication.deployment_event (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    deployment_id uuid NOT NULL,
    from_status publication.deployment_status_d,
    to_status publication.deployment_status_d NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    occurred_by text NOT NULL DEFAULT session_user,
    CONSTRAINT publication_deployment_event_pkey PRIMARY KEY (id),
    CONSTRAINT publication_deployment_event_evidence_chk CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE TABLE publication.deployment_acknowledgement (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    deployment_id uuid NOT NULL,
    target_instance text NOT NULL,
    active_release_hash text NOT NULL,
    local_applied_release_id uuid NOT NULL,
    acknowledged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    acknowledged_by text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT publication_deployment_ack_pkey PRIMARY KEY (id),
    CONSTRAINT publication_deployment_ack_once_uq UNIQUE (deployment_id, target_instance),
    CONSTRAINT publication_deployment_ack_hash_chk CHECK (active_release_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT publication_deployment_ack_evidence_chk CHECK (jsonb_typeof(evidence) = 'object')
);

COMMENT ON TABLE publication.release IS 'Generic append-only release coordinate independent of metadata, policy, workflow, or future publisher type.';
COMMENT ON TABLE publication.artifact_compilation IS 'Immutable canonical unsigned envelope/manifest evidence used to resume compile-to-sign after crashes.';
COMMENT ON TABLE publication.entity_release_link IS 'Strict one-to-one connection between the generic publication ledger and metadata.entity_release.';
COMMENT ON TABLE publication.business_partner_definition_release_link IS 'Immutable link from the generic signed publication ledger to a STUDIO Business Partner definition revision.';
COMMENT ON TABLE publication.deployment IS 'Per-target delivery head. Every state change is retained in deployment_event.';
COMMENT ON TABLE publication.deployment_acknowledgement IS 'Plane acknowledgement of the exact locally active release; it is not required for the plane to keep serving its prior active release.';

CREATE TABLE publication.business_partner_case_contract_release_link (
    tenant_id uuid NOT NULL,
    publication_release_id uuid PRIMARY KEY,
    revision_id uuid NOT NULL UNIQUE,
    publish_idempotency_key text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, publish_idempotency_key)
);
