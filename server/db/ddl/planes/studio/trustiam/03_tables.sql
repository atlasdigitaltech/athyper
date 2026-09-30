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

CREATE TABLE trustiam.identity_provisioning_request (
 id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL,
 subject_key char(64) NOT NULL, idempotency_key text NOT NULL, request_fingerprint char(64) NOT NULL,
 realm_key text NOT NULL, normalized_identifier text NOT NULL, display_identifier text NOT NULL,
 target_planes text[] NOT NULL, status text NOT NULL DEFAULT 'requested', provider_subject text,
 failure_reason text, row_version bigint NOT NULL DEFAULT 1,
 status_changed_at timestamptz, status_changed_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
 updated_at timestamptz, updated_by uuid,
 CONSTRAINT trustiam_identity_provisioning_request_pkey PRIMARY KEY(id),
 CONSTRAINT trustiam_identity_provisioning_request_tenant_id_uq UNIQUE(authority_tenant_id,id),
 CONSTRAINT trustiam_identity_provisioning_request_idempotency_uq UNIQUE(authority_tenant_id,idempotency_key),
 CONSTRAINT trustiam_identity_provisioning_request_subject_uq UNIQUE(authority_tenant_id,subject_key),
 CONSTRAINT trustiam_identity_provisioning_request_hash_chk CHECK(subject_key~'^[a-f0-9]{64}$' AND request_fingerprint~'^[a-f0-9]{64}$'),
 CONSTRAINT trustiam_identity_provisioning_request_key_chk CHECK(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9._~:/+\-]{15,127}$'),
 CONSTRAINT trustiam_identity_provisioning_request_realm_chk CHECK(realm_key~'^[a-z][a-z0-9_.-]{1,62}$'),
 CONSTRAINT trustiam_identity_provisioning_request_identifier_chk CHECK(btrim(normalized_identifier)<>'' AND length(normalized_identifier)<=320 AND btrim(display_identifier)<>''),
 CONSTRAINT trustiam_identity_provisioning_request_planes_chk CHECK(cardinality(target_planes)>0 AND target_planes<@ARRAY['studio','neon','mesh']::text[] AND array_position(target_planes,NULL) IS NULL),
 CONSTRAINT trustiam_identity_provisioning_request_status_chk CHECK(status IN ('requested','provisioning','invited','active','suspended','failed','deprovisioning','deprovisioned')),
 CONSTRAINT trustiam_identity_provisioning_request_failure_chk CHECK((status='failed' AND btrim(failure_reason)<>'') OR (status<>'failed' AND failure_reason IS NULL)),
 CONSTRAINT trustiam_identity_provisioning_request_version_chk CHECK(row_version>0),
 CONSTRAINT trustiam_identity_provisioning_request_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
 CONSTRAINT trustiam_identity_provisioning_request_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE trustiam.identity_provisioning_request IS 'Idempotent desired-state request for Keycloak identity and plane-local principal projection; credentials remain provider-owned.';

CREATE TABLE trustiam.identity_provisioning_attempt (
 id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL, request_id uuid NOT NULL,
 attempt_no integer NOT NULL, worker_id text NOT NULL, claim_token_hash char(64) NOT NULL,
 status text NOT NULL DEFAULT 'claimed', lease_expires_at timestamptz NOT NULL,
 started_at timestamptz, terminal_at timestamptz, error_code text, receipt jsonb NOT NULL DEFAULT '{}'::jsonb,
 row_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
 updated_at timestamptz, updated_by uuid,
 CONSTRAINT trustiam_identity_provisioning_attempt_pkey PRIMARY KEY(id),
 CONSTRAINT trustiam_identity_provisioning_attempt_tenant_id_uq UNIQUE(authority_tenant_id,id),
 CONSTRAINT trustiam_identity_provisioning_attempt_no_uq UNIQUE(authority_tenant_id,request_id,attempt_no),
 CONSTRAINT trustiam_identity_provisioning_attempt_no_chk CHECK(attempt_no>0),
 CONSTRAINT trustiam_identity_provisioning_attempt_worker_chk CHECK(btrim(worker_id)<>'' AND octet_length(worker_id)<=128),
 CONSTRAINT trustiam_identity_provisioning_attempt_token_chk CHECK(claim_token_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT trustiam_identity_provisioning_attempt_status_chk CHECK(status IN ('claimed','started','applied','failed','cancelled')),
 CONSTRAINT trustiam_identity_provisioning_attempt_time_chk CHECK(lease_expires_at>created_at AND (started_at IS NULL OR started_at>=created_at) AND (terminal_at IS NULL OR terminal_at>=coalesce(started_at,created_at))),
 CONSTRAINT trustiam_identity_provisioning_attempt_terminal_chk CHECK((status IN ('claimed','started') AND terminal_at IS NULL AND error_code IS NULL) OR (status='applied' AND terminal_at IS NOT NULL AND error_code IS NULL) OR (status IN ('failed','cancelled') AND terminal_at IS NOT NULL AND btrim(error_code)<>'')),
 CONSTRAINT trustiam_identity_provisioning_attempt_receipt_chk CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=32768),
 CONSTRAINT trustiam_identity_provisioning_attempt_version_chk CHECK(row_version>0),
 CONSTRAINT trustiam_identity_provisioning_attempt_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE trustiam.identity_provisioning_attempt IS 'Durable worker claim and bounded content-free receipt for one identity provisioning attempt. Terminal attempts are immutable; retry creates the next attempt.';

CREATE TABLE trustiam.projection_reconciliation_attempt (
 id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL,
 projection_id uuid NOT NULL, desired_version bigint NOT NULL, desired_hash char(64) NOT NULL,
 target_plane shared.application_plane_d NOT NULL, target_tenant_id uuid NOT NULL,
 attempt_no integer NOT NULL, job_identity_hash char(64) NOT NULL,
 worker_id text NOT NULL, claim_token_hash char(64) NOT NULL, fencing_token bigint NOT NULL,
 status text NOT NULL DEFAULT 'claimed', failure_class text, error_code text,
 lease_expires_at timestamptz NOT NULL, next_attempt_at timestamptz,
 started_at timestamptz, terminal_at timestamptz,
 receipt jsonb NOT NULL DEFAULT '{}'::jsonb, manual_replay_of uuid,
 replay_requested_at timestamptz, replay_requested_by uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL,
 updated_at timestamptz, updated_by uuid,
 CONSTRAINT trustiam_projection_reconciliation_attempt_pkey PRIMARY KEY(id),
 CONSTRAINT trustiam_projection_reconciliation_attempt_tenant_id_uq UNIQUE(authority_tenant_id,id),
 CONSTRAINT trustiam_projection_reconciliation_attempt_no_uq UNIQUE(authority_tenant_id,projection_id,desired_version,desired_hash,attempt_no),
 CONSTRAINT trustiam_projection_reconciliation_attempt_job_uq UNIQUE(job_identity_hash),
 CONSTRAINT trustiam_projection_reconciliation_attempt_version_chk CHECK(desired_version>0 AND attempt_no>0 AND fencing_token>0),
 CONSTRAINT trustiam_projection_reconciliation_attempt_hash_chk CHECK(desired_hash~'^[a-f0-9]{64}$' AND job_identity_hash~'^[a-f0-9]{64}$' AND claim_token_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT trustiam_projection_reconciliation_attempt_worker_chk CHECK(btrim(worker_id)<>'' AND octet_length(worker_id)<=128),
 CONSTRAINT trustiam_projection_reconciliation_attempt_status_chk CHECK(status IN ('claimed','running','retrying','succeeded','failed','dead_letter','cancelled')),
 CONSTRAINT trustiam_projection_reconciliation_attempt_failure_chk CHECK(failure_class IS NULL OR failure_class IN ('transient','permanent','stale')),
 CONSTRAINT trustiam_projection_reconciliation_attempt_time_chk CHECK(lease_expires_at>created_at AND (started_at IS NULL OR started_at>=created_at) AND (terminal_at IS NULL OR terminal_at>=coalesce(started_at,created_at))),
 CONSTRAINT trustiam_projection_reconciliation_attempt_terminal_chk CHECK(
   (status IN ('claimed','running') AND terminal_at IS NULL AND failure_class IS NULL AND error_code IS NULL)
   OR (status='retrying' AND terminal_at IS NULL AND failure_class='transient' AND btrim(error_code)<>'' AND next_attempt_at IS NOT NULL)
   OR (status='succeeded' AND terminal_at IS NOT NULL AND failure_class IS NULL AND error_code IS NULL)
   OR (status IN ('failed','dead_letter','cancelled') AND terminal_at IS NOT NULL AND failure_class IS NOT NULL AND btrim(error_code)<>'')
 ),
 CONSTRAINT trustiam_projection_reconciliation_attempt_receipt_chk CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=32768),
 CONSTRAINT trustiam_projection_reconciliation_attempt_replay_chk CHECK((replay_requested_at IS NULL)=(replay_requested_by IS NULL) AND (replay_requested_at IS NULL OR status='dead_letter')),
 CONSTRAINT trustiam_projection_reconciliation_attempt_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE trustiam.projection_reconciliation_attempt IS 'Studio-owned durable claim, fencing, retry, dead-letter, and replay evidence for one exact desired projection version/hash. It never changes desired business lifecycle status.';

CREATE TABLE trustiam.identity_projection (
 id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL,
 source_plane shared.application_plane_d NOT NULL, source_tenant_id uuid NOT NULL, person_id uuid NOT NULL,
 organization_id uuid NOT NULL, relationship_kind text NOT NULL, source_ref text NOT NULL,
 realm_key text NOT NULL, normalized_identifier text NOT NULL, display_name text NOT NULL,
 desired_version bigint NOT NULL, desired_hash char(64) NOT NULL, desired_status text NOT NULL,
 desired_applications jsonb NOT NULL, reconciliation_status trustiam.reconciliation_status_d NOT NULL DEFAULT 'pending',
 provider_subject text, provider_sequence bigint, observed_status text, observed_version bigint, observed_hash char(64), observed_at timestamptz,
 last_error_code text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL,
 updated_at timestamptz, updated_by uuid,
 CONSTRAINT trustiam_identity_projection_pkey PRIMARY KEY(id),
 CONSTRAINT trustiam_identity_projection_tenant_id_uq UNIQUE(authority_tenant_id,id),
 CONSTRAINT trustiam_identity_projection_person_uq UNIQUE(authority_tenant_id,source_plane,source_tenant_id,person_id),
 CONSTRAINT trustiam_identity_projection_source_uq UNIQUE(authority_tenant_id,source_plane,source_tenant_id,relationship_kind,source_ref),
 CONSTRAINT trustiam_identity_projection_identifier_uq UNIQUE(authority_tenant_id,realm_key,normalized_identifier),
 CONSTRAINT trustiam_identity_projection_version_chk CHECK(desired_version>0 AND (provider_sequence IS NULL OR provider_sequence>0) AND (observed_version IS NULL OR observed_version>0)),
 CONSTRAINT trustiam_identity_projection_hash_chk CHECK(desired_hash~'^[a-f0-9]{64}$' AND (observed_hash IS NULL OR observed_hash~'^[a-f0-9]{64}$')),
 CONSTRAINT trustiam_identity_projection_relationship_chk CHECK(relationship_kind IN('employer','contact','external_worker')),
 CONSTRAINT trustiam_identity_projection_source_ref_chk CHECK((relationship_kind='employer' AND source_ref LIKE 'employment:%') OR (relationship_kind='contact' AND source_ref LIKE 'business_partner_contact:%') OR (relationship_kind='external_worker' AND source_ref LIKE 'worker_engagement:%')),
 CONSTRAINT trustiam_identity_projection_realm_chk CHECK(realm_key~'^[a-z][a-z0-9_.-]{1,62}$'),
 CONSTRAINT trustiam_identity_projection_identifier_chk CHECK(btrim(normalized_identifier)<>'' AND length(normalized_identifier)<=320 AND btrim(display_name)<>''),
 CONSTRAINT trustiam_identity_projection_status_chk CHECK(desired_status IN('invited','active','suspended','deprovisioned') AND (observed_status IS NULL OR observed_status IN('invited','active','suspended','deprovisioned'))),
 CONSTRAINT trustiam_identity_projection_applications_chk CHECK(jsonb_typeof(desired_applications)='array' AND (desired_status IN('suspended','deprovisioned') OR jsonb_array_length(desired_applications)>0)),
 CONSTRAINT trustiam_identity_projection_observation_chk CHECK(
   (provider_subject IS NULL AND provider_sequence IS NULL AND observed_status IS NULL AND observed_version IS NULL AND observed_hash IS NULL AND observed_at IS NULL)
   OR (provider_subject IS NOT NULL AND observed_status IS NOT NULL AND observed_version IS NOT NULL AND observed_hash IS NOT NULL AND observed_at IS NOT NULL)
 ),
 CONSTRAINT trustiam_identity_projection_error_chk CHECK((reconciliation_status='failed')=(last_error_code IS NOT NULL)),
 CONSTRAINT trustiam_identity_projection_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE trustiam.identity_projection IS 'Desired and safely fenced observed identity projection, uniquely correlated to its employment, BP-contact, or worker-engagement authority. desired_applications is transport input only; plane-local principal, membership, role and scope tables remain authoritative.';

CREATE TABLE trustiam.identity_saga_attempt (
 id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL, identity_projection_id uuid NOT NULL,
 desired_version bigint NOT NULL, desired_hash char(64) NOT NULL, attempt_no integer NOT NULL,
 worker_id text NOT NULL, claim_token_hash char(64) NOT NULL, fencing_token bigint NOT NULL,
 status text NOT NULL DEFAULT 'claimed', failure_class text, error_code text,
 lease_expires_at timestamptz NOT NULL, next_attempt_at timestamptz, started_at timestamptz, terminal_at timestamptz,
 receipt jsonb NOT NULL DEFAULT '{}'::jsonb, manual_replay_of uuid,
 replay_requested_at timestamptz, replay_requested_by uuid, replay_approved_by uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
 CONSTRAINT trustiam_identity_saga_attempt_pkey PRIMARY KEY(id),
 CONSTRAINT trustiam_identity_saga_attempt_tenant_id_uq UNIQUE(authority_tenant_id,id),
 CONSTRAINT trustiam_identity_saga_attempt_no_uq UNIQUE(authority_tenant_id,identity_projection_id,desired_version,desired_hash,attempt_no),
 CONSTRAINT trustiam_identity_saga_attempt_version_chk CHECK(desired_version>0 AND attempt_no>0 AND fencing_token>0),
 CONSTRAINT trustiam_identity_saga_attempt_hash_chk CHECK(desired_hash~'^[a-f0-9]{64}$' AND claim_token_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT trustiam_identity_saga_attempt_worker_chk CHECK(btrim(worker_id)<>'' AND octet_length(worker_id)<=128),
 CONSTRAINT trustiam_identity_saga_attempt_status_chk CHECK(status IN('claimed','running','succeeded','failed','dead_letter','cancelled')),
 CONSTRAINT trustiam_identity_saga_attempt_failure_chk CHECK(failure_class IS NULL OR failure_class IN('transient','permanent','stale')),
 CONSTRAINT trustiam_identity_saga_attempt_terminal_chk CHECK(
   (status IN('claimed','running') AND terminal_at IS NULL AND failure_class IS NULL AND error_code IS NULL)
   OR (status='succeeded' AND terminal_at IS NOT NULL AND failure_class IS NULL AND error_code IS NULL)
   OR (status IN('failed','dead_letter','cancelled') AND terminal_at IS NOT NULL AND failure_class IS NOT NULL AND btrim(error_code)<>'')
 ),
 CONSTRAINT trustiam_identity_saga_attempt_time_chk CHECK(lease_expires_at>created_at AND (started_at IS NULL OR started_at>=created_at) AND (terminal_at IS NULL OR terminal_at>=coalesce(started_at,created_at))),
 CONSTRAINT trustiam_identity_saga_attempt_receipt_chk CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=32768),
 CONSTRAINT trustiam_identity_saga_attempt_replay_chk CHECK(
   (replay_requested_at IS NULL AND replay_requested_by IS NULL AND replay_approved_by IS NULL)
   OR (status='dead_letter' AND replay_requested_at IS NOT NULL AND replay_requested_by IS NOT NULL AND replay_approved_by IS NOT NULL AND replay_requested_by<>replay_approved_by)
 ),
 CONSTRAINT trustiam_identity_saga_attempt_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE trustiam.identity_saga_attempt IS 'Fenced retry/dead-letter evidence for identity, membership, application, suspension and deprovisioning convergence. Replay requires distinct MFA-authorized requester and SoD approver.';

CREATE TABLE trustiam.provider_identity_callback_inbox (
 id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL, event_id text NOT NULL,
 identity_projection_id uuid NOT NULL, desired_version bigint NOT NULL, desired_hash char(64) NOT NULL,
 provider_sequence bigint NOT NULL, provider_subject text NOT NULL, observed_status text NOT NULL,
 disposition text NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(), processed_at timestamptz,
 created_by uuid NOT NULL,
 CONSTRAINT trustiam_provider_identity_callback_inbox_pkey PRIMARY KEY(id),
 CONSTRAINT trustiam_provider_identity_callback_event_uq UNIQUE(authority_tenant_id,event_id),
 CONSTRAINT trustiam_provider_identity_callback_version_chk CHECK(desired_version>0 AND provider_sequence>0),
 CONSTRAINT trustiam_provider_identity_callback_hash_chk CHECK(desired_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT trustiam_provider_identity_callback_subject_chk CHECK(btrim(provider_subject)<>''),
 CONSTRAINT trustiam_provider_identity_callback_status_chk CHECK(observed_status IN('invited','active','suspended','deprovisioned')),
 CONSTRAINT trustiam_provider_identity_callback_disposition_chk CHECK(disposition IN('received','applied','stale','out_of_order') AND (disposition='received')=(processed_at IS NULL))
);
COMMENT ON TABLE trustiam.provider_identity_callback_inbox IS 'Immutable callback receipt. Exact desired version/hash and monotonic provider_sequence gate observation updates; payload attributes are intentionally not stored.';
