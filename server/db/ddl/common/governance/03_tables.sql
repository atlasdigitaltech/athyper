CREATE TABLE governance.comment_moderation (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    comment_flag_id uuid NOT NULL,
    moderator_principal_id uuid,
    decision_code text,
    reason_code text,
    decision_note text,
    reviewer_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    status governance.moderation_status_d NOT NULL DEFAULT 'open',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT comment_moderation_pkey PRIMARY KEY (id),
    CONSTRAINT comment_moderation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT comment_moderation_flag_uq UNIQUE (tenant_id, comment_flag_id),
    CONSTRAINT comment_moderation_decision_chk CHECK (
        decision_code IS NULL OR decision_code ~ '^[a-z][a-z0-9_.-]{1,62}$'
    ),
    CONSTRAINT comment_moderation_reason_chk CHECK (
        reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_.-]{1,62}$'
    ),
    CONSTRAINT comment_moderation_evidence_chk CHECK (jsonb_typeof(reviewer_evidence) = 'object'),
    CONSTRAINT comment_moderation_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT comment_moderation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE governance.channel_consent (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    channel_code text NOT NULL,
    destination_hash text,
    is_consented boolean NOT NULL,
    effective_at timestamptz NOT NULL,
    expires_at timestamptz,
    last_event_id uuid NOT NULL,
    source_code text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz,
    CONSTRAINT channel_consent_pkey PRIMARY KEY (id),
    CONSTRAINT channel_consent_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT channel_consent_coordinate_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, subject_type, subject_id, channel_code, destination_hash),
    CONSTRAINT channel_consent_subject_chk
        CHECK (subject_type IN ('principal','person','contact_person','business_partner')),
    CONSTRAINT channel_consent_channel_chk CHECK (channel_code IN ('email','sms','whatsapp','push')),
    CONSTRAINT channel_consent_expiry_chk CHECK (expires_at IS NULL OR expires_at > effective_at),
    CONSTRAINT channel_consent_evidence_chk CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE TABLE governance.cycle_run (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    cycle_type_id uuid NOT NULL,
    template_revision_id uuid NOT NULL,
    template_revision_number integer NOT NULL,
    template_hash char(64) NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    period_start date,
    period_end date,
    scheduled_start_at timestamptz,
    started_at timestamptz,
    due_at timestamptz,
    completed_at timestamptz,
    parent_cycle_run_id uuid,
    owner_principal_id uuid,
    idempotency_key text NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    status governance.cycle_run_status_d NOT NULL DEFAULT 'draft',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT cycle_run_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_run_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_run_type_id_uq UNIQUE (tenant_id, cycle_type_id, id),
    CONSTRAINT cycle_run_code_uq UNIQUE (tenant_id, cycle_type_id, code),
    CONSTRAINT cycle_run_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT cycle_run_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_run_template_revision_chk CHECK (template_revision_number > 0 AND template_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT cycle_run_period_chk CHECK (period_end IS NULL OR period_start IS NOT NULL AND period_end >= period_start),
    CONSTRAINT cycle_run_data_chk CHECK (jsonb_typeof(data) = 'object'),
    CONSTRAINT cycle_run_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cycle_run_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT cycle_run_version_chk CHECK (version > 0)
);

CREATE TABLE governance.cycle_task (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    cycle_run_id uuid NOT NULL,
    cycle_type_id uuid NOT NULL,
    task_template_id uuid NOT NULL,
    process_attempt_id uuid,
    phase_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    completion_mode control.cycle_completion_mode_d NOT NULL,
    is_mandatory boolean NOT NULL DEFAULT true,
    is_waivable boolean NOT NULL DEFAULT false,
    owner_principal_id uuid,
    assigned_team_id uuid,
    due_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    completion_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    status governance.cycle_task_status_d NOT NULL DEFAULT 'pending',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT cycle_task_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_task_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_task_run_id_uq UNIQUE (tenant_id, cycle_run_id, id),
    CONSTRAINT cycle_task_run_template_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, cycle_run_id, task_template_id, process_attempt_id),
    CONSTRAINT cycle_task_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_task_evidence_chk CHECK (jsonb_typeof(completion_evidence) = 'object'),
    CONSTRAINT cycle_task_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cycle_task_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT cycle_task_version_chk CHECK (version > 0)
);

CREATE TABLE governance.cycle_subject (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    cycle_run_id uuid NOT NULL, cycle_task_id uuid, subject_role text NOT NULL,
    entity_case_id uuid, entity_code text, entity_id uuid, snapshot_id uuid, external_reference text,
    is_primary boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT cycle_subject_pkey PRIMARY KEY(id), CONSTRAINT cycle_subject_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT cycle_subject_coordinate_uq UNIQUE NULLS NOT DISTINCT(tenant_id,cycle_run_id,subject_role,entity_case_id,entity_code,entity_id,snapshot_id,external_reference),
    CONSTRAINT cycle_subject_role_chk CHECK(subject_role ~ '^[a-z][a-z0-9_.:-]{1,62}$'),
    CONSTRAINT cycle_subject_one_coordinate_chk CHECK(num_nonnulls(entity_case_id,snapshot_id,external_reference,(CASE WHEN entity_code IS NOT NULL AND entity_id IS NOT NULL THEN entity_id END))=1 AND (entity_code IS NULL)=(entity_id IS NULL)),
    CONSTRAINT cycle_subject_entity_code_chk CHECK(entity_code IS NULL OR entity_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT cycle_subject_external_chk CHECK(external_reference IS NULL OR (btrim(external_reference)<>'' AND length(external_reference)<=256)),
    CONSTRAINT cycle_subject_run_fk FOREIGN KEY(tenant_id,cycle_run_id) REFERENCES governance.cycle_run(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT cycle_subject_task_fk FOREIGN KEY(tenant_id,cycle_task_id) REFERENCES governance.cycle_task(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT cycle_subject_snapshot_fk FOREIGN KEY(tenant_id,snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT cycle_subject_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id)
);

CREATE TABLE governance.cycle_task_dependency (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    cycle_run_id uuid NOT NULL,
    predecessor_task_id uuid NOT NULL,
    successor_task_id uuid NOT NULL,
    dependency_type control.cycle_dependency_type_d NOT NULL DEFAULT 'finish_to_start',
    is_hard boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    CONSTRAINT cycle_task_dependency_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_task_dependency_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_task_dependency_edge_uq UNIQUE (tenant_id, cycle_run_id, predecessor_task_id, successor_task_id),
    CONSTRAINT cycle_task_dependency_self_chk CHECK (predecessor_task_id <> successor_task_id)
);

CREATE TABLE governance.cycle_deviation (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    cycle_run_id uuid NOT NULL,
    cycle_task_id uuid,
    deviation_type control.cycle_deviation_type_d NOT NULL,
    description text NOT NULL,
    severity_code text NOT NULL DEFAULT 'medium',
    status text NOT NULL DEFAULT 'open',
    resolution text,
    carried_from_deviation_id uuid,
    carried_to_cycle_run_id uuid,
    carry_count integer NOT NULL DEFAULT 0,
    carry_idempotency_key text,
    resolved_at timestamptz,
    resolved_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    CONSTRAINT cycle_deviation_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_deviation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_deviation_carry_idempotency_uq UNIQUE (tenant_id, carry_idempotency_key),
    CONSTRAINT cycle_deviation_severity_chk CHECK (severity_code IN ('low','medium','high','critical')),
    CONSTRAINT cycle_deviation_status_chk CHECK (status IN ('open','resolved','waived','carried')),
    CONSTRAINT cycle_deviation_carry_count_chk CHECK (carry_count >= 0),
    CONSTRAINT cycle_deviation_resolution_chk CHECK ((resolved_at IS NULL) = (resolved_by IS NULL))
);

CREATE TABLE governance.cycle_certification (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    cycle_run_id uuid NOT NULL,
    certification_type_code text NOT NULL,
    statement text NOT NULL,
    evidence_snapshot jsonb,
    submitted_by uuid,
    submitted_at timestamptz,
    certified_by uuid,
    certified_at timestamptz,
    evidence_snapshot_id uuid,
    signature text,
    rejected_by uuid,
    rejected_at timestamptz,
    rejection_reason text,
    status governance.certification_status_d NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT cycle_certification_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_certification_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_certification_coordinate_uq
        UNIQUE (tenant_id, cycle_run_id, certification_type_code),
    CONSTRAINT cycle_certification_type_chk
        CHECK (certification_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_certification_evidence_chk
        CHECK ((certified_by IS NULL) = (certified_at IS NULL)),
    CONSTRAINT cycle_certification_submission_chk CHECK ((submitted_by IS NULL) = (submitted_at IS NULL)),
    CONSTRAINT cycle_certification_rejection_chk CHECK ((rejected_by IS NULL) = (rejected_at IS NULL)),
    CONSTRAINT cycle_certification_snapshot_chk CHECK (evidence_snapshot IS NULL OR jsonb_typeof(evidence_snapshot) = 'object'),
    CONSTRAINT cycle_certification_approved_chk CHECK (
        status <> 'approved' OR evidence_snapshot_id IS NOT NULL AND evidence_snapshot IS NOT NULL
            AND certified_by IS NOT NULL AND certified_at IS NOT NULL AND nullif(btrim(signature), '') IS NOT NULL
    ),
    CONSTRAINT cycle_certification_version_chk CHECK (version > 0)
);

CREATE TABLE governance.legal_hold (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    legal_authority text,
    issued_at timestamptz,
    effective_at timestamptz,
    released_at timestamptz,
    owner_principal_id uuid,
    status governance.legal_hold_status_d NOT NULL DEFAULT 'draft',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT legal_hold_pkey PRIMARY KEY (id),
    CONSTRAINT legal_hold_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT legal_hold_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT legal_hold_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT legal_hold_release_chk CHECK (released_at IS NULL OR effective_at IS NOT NULL AND released_at >= effective_at),
    CONSTRAINT legal_hold_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT legal_hold_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE governance.legal_hold_manifest (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    legal_hold_id uuid NOT NULL,
    resource_kind text NOT NULL,
    resource_schema text,
    resource_entity text,
    resource_id uuid,
    resource_uri text,
    content_hash text,
    captured_at timestamptz NOT NULL DEFAULT now(),
    released_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    CONSTRAINT legal_hold_manifest_pkey PRIMARY KEY (id),
    CONSTRAINT legal_hold_manifest_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT legal_hold_manifest_resource_uq UNIQUE NULLS NOT DISTINCT
        (tenant_id, legal_hold_id, resource_kind, resource_id, resource_uri),
    CONSTRAINT legal_hold_manifest_resource_chk CHECK (
        resource_kind IN ('partition','table_record','document','snapshot','compiled_artifact',
                          'storage_object','backup_object','audit_export')
        AND ((resource_id IS NOT NULL) OR nullif(btrim(resource_uri), '') IS NOT NULL)
    )
);

CREATE TABLE governance.report_pack (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    report_type_code text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    source_entity_code text,
    source_entity_id uuid,
    source_revision jsonb,
    parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    artifact_uri text,
    artifact_hash text,
    generated_at timestamptz,
    expires_at timestamptz,
    supersedes_report_pack_id uuid,
    job_id text NOT NULL,
    status governance.report_pack_status_d NOT NULL DEFAULT 'draft',
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT report_pack_pkey PRIMARY KEY (id),
    CONSTRAINT report_pack_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT report_pack_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT report_pack_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT report_pack_type_chk CHECK (report_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT report_pack_source_chk CHECK ((source_entity_code IS NULL) = (source_entity_id IS NULL)),
    CONSTRAINT report_pack_parameters_chk CHECK (jsonb_typeof(parameters) = 'object'),
    CONSTRAINT report_pack_source_revision_chk CHECK ((source_revision IS NULL) = (source_entity_id IS NULL) AND (source_revision IS NULL OR jsonb_typeof(source_revision) = 'object')),
    CONSTRAINT report_pack_job_id_uq UNIQUE (tenant_id, job_id),
    CONSTRAINT report_pack_evidence_chk CHECK (jsonb_typeof(evidence) = 'object'),
    CONSTRAINT report_pack_artifact_hash_chk CHECK (artifact_hash IS NULL OR artifact_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT report_pack_ready_artifact_chk CHECK (status NOT IN ('ready','superseded') OR artifact_uri IS NOT NULL AND artifact_hash IS NOT NULL AND generated_at IS NOT NULL),
    CONSTRAINT report_pack_expiry_chk CHECK (expires_at IS NULL OR generated_at IS NOT NULL AND expires_at > generated_at),
    CONSTRAINT report_pack_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Accepted routing evidence; P2 inserts in the transaction that owns case/run/attempt creation.
CREATE TABLE governance.process_selection_evidence (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
    plane_key text NOT NULL CHECK (plane_key IN ('neon','studio','mesh')),
    process_family text NOT NULL CHECK (btrim(process_family)<>''),
    operating_organization_id uuid NOT NULL, company_code_id uuid,
    case_id uuid NOT NULL, cycle_run_id uuid NOT NULL, attempt_id uuid NOT NULL,
    attempt_number integer NOT NULL CHECK (attempt_number>0),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
    evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT process_selection_tenant_id_uq UNIQUE (tenant_id,id),
    CONSTRAINT process_selection_attempt_uq UNIQUE (tenant_id,case_id,attempt_id),
    CONSTRAINT process_selection_attempt_number_uq UNIQUE (tenant_id,case_id,attempt_number),
    CONSTRAINT process_selection_idempotency_uq UNIQUE (tenant_id,case_id,idempotency_key),
    CONSTRAINT process_selection_coordinate_chk CHECK ((
      evidence->'coordinate'->>'selectionId'=id::text
      AND evidence->'coordinate'->>'caseId'=case_id::text
      AND evidence->'coordinate'->>'cycleRunId'=cycle_run_id::text
      AND evidence->'coordinate'->>'attemptId'=attempt_id::text
      AND evidence->'coordinate'->'scope'->>'tenantId'=tenant_id::text
      AND evidence->'coordinate'->'scope'->>'planeKey'=plane_key
      AND evidence->'coordinate'->'scope'->>'processFamily'=process_family
      AND evidence->'coordinate'->'scope'->>'operatingOrganizationId'=operating_organization_id::text
      AND (evidence->'coordinate'->'scope'->>'companyCodeId') IS NOT DISTINCT FROM company_code_id::text
      AND (evidence->'coordinate'->>'attemptNumber')::integer=attempt_number
      AND evidence->>'idempotencyKey'=idempotency_key
    ) IS TRUE)
);

-- P2 immutable acceptance; runtime status belongs to tasks and document jobs.
CREATE TABLE governance.process_attempt (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, case_id uuid NOT NULL, cycle_run_id uuid NOT NULL,
 selection_id uuid NOT NULL, attempt_number integer NOT NULL CHECK(attempt_number>0),
 submission_snapshot_id uuid NOT NULL, submission_snapshot_version integer NOT NULL CHECK(submission_snapshot_version>0),
 submission_snapshot_hash text NOT NULL CHECK(submission_snapshot_hash ~ '^[a-f0-9]{64}$'),
 manifest_id uuid NOT NULL, manifest_version integer NOT NULL CHECK(manifest_version>0),
 manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 200),
 request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 expected_case_version bigint NOT NULL CHECK(expected_case_version>0),
 response jsonb NOT NULL CHECK(jsonb_typeof(response)='object'),
 review_pack_job_id uuid GENERATED ALWAYS AS ((response->'process'->>'reviewPackJobId')::uuid) STORED NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
 CONSTRAINT process_attempt_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT process_attempt_case_number_uq UNIQUE(tenant_id,case_id,attempt_number),
 CONSTRAINT process_attempt_replay_uq UNIQUE(tenant_id,idempotency_key),
 CONSTRAINT process_attempt_selection_uq UNIQUE(tenant_id,selection_id),
 CONSTRAINT process_attempt_coordinate_uq UNIQUE(tenant_id,id,case_id,cycle_run_id,selection_id),
 CONSTRAINT process_attempt_run_fk FOREIGN KEY(tenant_id,cycle_run_id) REFERENCES governance.cycle_run(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT process_attempt_selection_fk FOREIGN KEY(tenant_id,selection_id) REFERENCES governance.process_selection_evidence(tenant_id,id) ON DELETE RESTRICT
);

-- Committed intent is the durable dispatch boundary. P4 owns execution and gate results.
CREATE TABLE governance.process_document_job (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, attempt_id uuid NOT NULL, case_id uuid NOT NULL,
 cycle_run_id uuid NOT NULL, selection_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN('submitted_review_pack','decision_document','activation_confirmation')),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 200),
 intent_hash text NOT NULL CHECK(intent_hash ~ '^[a-f0-9]{64}$'), intent jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','ready','failed','cancelled')),
 result jsonb, claim_token uuid, lease_expires_at timestamptz, attempt_count integer NOT NULL DEFAULT 0,
 gate_status text NOT NULL DEFAULT 'pending' CHECK(gate_status IN('pending','succeeded','failed')), last_error text, updated_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
 CONSTRAINT process_document_job_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT process_document_job_coordinate_uq UNIQUE(tenant_id,id,attempt_id,case_id,cycle_run_id,selection_id),
 CONSTRAINT process_document_job_replay_uq UNIQUE(tenant_id,idempotency_key),
 CONSTRAINT process_document_job_purpose_uq UNIQUE(tenant_id,attempt_id,purpose),
 CONSTRAINT process_document_job_attempt_fk FOREIGN KEY(tenant_id,attempt_id,case_id,cycle_run_id,selection_id)
  REFERENCES governance.process_attempt(tenant_id,id,case_id,cycle_run_id,selection_id) DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT process_document_job_coordinate_chk CHECK((
  intent->'coordinate'->>'attemptId'=attempt_id::text AND intent->'coordinate'->>'caseId'=case_id::text
  AND intent->'coordinate'->>'cycleRunId'=cycle_run_id::text AND intent->'coordinate'->>'selectionId'=selection_id::text
  AND intent->'coordinate'->'scope'->>'tenantId'=tenant_id::text AND intent->'binding'->>'purpose'=purpose
  AND intent->>'idempotencyKey'=idempotency_key AND intent->>'requestedBy'=created_by::text) IS TRUE),
 CONSTRAINT process_document_job_ready_chk CHECK(status<>'ready' OR (
  result->>'status'='ready' AND result->>'scanStatus'='clean' AND result->>'sha256' ~ '^[a-f0-9]{64}$'
  AND result->>'attachmentId' IS NOT NULL AND result->>'attachmentVersionId' IS NOT NULL
  AND result->'coordinate'=intent->'coordinate' AND result->'template'=intent->'binding'->'template'
  AND result->'sourceSnapshot'=intent->'sourceSnapshot' AND result->>'jobId'=id::text) IS TRUE)
);
