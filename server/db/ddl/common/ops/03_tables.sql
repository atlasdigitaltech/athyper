CREATE TABLE ops.authorization_parity_certification (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    plane_code                 text        NOT NULL,
    entity_code                text        NOT NULL,
    source_entity_operation_id uuid        NOT NULL,
    source_release_hash        text        NOT NULL,
    source_artifact_hash       text        NOT NULL,
    sample_count               bigint      NOT NULL,
    mismatch_count             bigint      NOT NULL,
    candidate_error_count      bigint      NOT NULL,
    required_cohort_count      integer     NOT NULL,
    covered_cohort_count       integer     NOT NULL,
    observed_from              timestamptz NOT NULL,
    observed_through           timestamptz NOT NULL,
    status                     text        NOT NULL,
    evidence_fingerprint       text        NOT NULL,
    certified_at               timestamptz NOT NULL DEFAULT now(),
    certified_by               uuid        NOT NULL,
    CONSTRAINT authorization_parity_certification_pkey PRIMARY KEY (id),
    CONSTRAINT authorization_parity_certification_plane_chk CHECK (plane_code IN ('neon','mesh')),
    CONSTRAINT authorization_parity_certification_entity_chk CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT authorization_parity_certification_hash_chk CHECK (
      source_release_hash ~ '^[a-f0-9]{64}$' AND source_artifact_hash ~ '^[a-f0-9]{64}$'
      AND evidence_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT authorization_parity_certification_counts_chk CHECK (
      sample_count >= 0 AND mismatch_count >= 0 AND candidate_error_count >= 0
      AND mismatch_count + candidate_error_count <= sample_count
      AND required_cohort_count >= 0 AND covered_cohort_count >= 0
      AND covered_cohort_count <= required_cohort_count),
    CONSTRAINT authorization_parity_certification_window_chk CHECK (observed_through >= observed_from),
    CONSTRAINT authorization_parity_certification_status_chk CHECK (status IN ('qualified','rejected')),
    CONSTRAINT authorization_parity_certification_truth_chk CHECK (
      (status='qualified' AND sample_count >= 1000 AND mismatch_count=0 AND candidate_error_count=0
       AND required_cohort_count>0
       AND covered_cohort_count=required_cohort_count
       AND observed_through-observed_from >= interval '24 hours') OR status='rejected')
);

COMMENT ON TABLE ops.authorization_parity_certification IS
  'Append-only database-derived certification for one exact operation/release/artifact coordinate. It cannot manufacture or reuse evidence across coordinates.';

CREATE TABLE ops.authorization_qualification_cohort_requirement (
    plane_code                 text        NOT NULL,
    entity_code                text        NOT NULL,
    source_entity_operation_id uuid        NOT NULL,
    source_release_hash        text        NOT NULL,
    source_artifact_hash       text        NOT NULL,
    cohort_code                text        NOT NULL,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    CONSTRAINT authorization_qualification_cohort_requirement_pkey PRIMARY KEY
      (plane_code,source_entity_operation_id,source_release_hash,source_artifact_hash,cohort_code),
    CONSTRAINT authorization_qualification_cohort_requirement_plane_chk CHECK (plane_code IN ('neon','mesh')),
    CONSTRAINT authorization_qualification_cohort_requirement_cohort_chk CHECK (cohort_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT authorization_qualification_cohort_requirement_hash_chk CHECK (
      source_release_hash ~ '^[a-f0-9]{64}$' AND source_artifact_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE ops.authorization_operation_rollout (
    plane_code                 text        NOT NULL,
    entity_code                text        NOT NULL,
    source_entity_operation_id uuid        NOT NULL,
    source_release_hash        text        NOT NULL,
    source_artifact_hash       text        NOT NULL,
    mode                       text        NOT NULL DEFAULT 'legacy',
    certification_id           uuid,
    change_reason              text        NOT NULL,
    change_ticket              text,
    activated_at               timestamptz,
    activated_by               uuid,
    rolled_back_at             timestamptz,
    rolled_back_by             uuid,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    updated_by                 uuid        NOT NULL,
    CONSTRAINT authorization_operation_rollout_pkey PRIMARY KEY (plane_code,source_entity_operation_id),
    CONSTRAINT authorization_operation_rollout_plane_chk CHECK (plane_code IN ('neon','mesh')),
    CONSTRAINT authorization_operation_rollout_mode_chk CHECK (mode IN ('legacy','shadow','active')),
    CONSTRAINT authorization_operation_rollout_hash_chk CHECK (
      source_release_hash ~ '^[a-f0-9]{64}$' AND source_artifact_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT authorization_operation_rollout_reason_chk CHECK (btrim(change_reason) <> ''),
    CONSTRAINT authorization_operation_rollout_active_chk CHECK (
      (mode='active' AND certification_id IS NOT NULL AND activated_at IS NOT NULL AND activated_by IS NOT NULL)
      OR mode <> 'active'),
    CONSTRAINT authorization_operation_rollout_audit_pair_chk CHECK (
      (created_at IS NULL)=(created_by IS NULL) AND (updated_at IS NULL)=(updated_by IS NULL)),
    CONSTRAINT authorization_operation_rollout_certification_fk FOREIGN KEY (certification_id)
      REFERENCES ops.authorization_parity_certification(id) ON DELETE RESTRICT
);

COMMENT ON TABLE ops.authorization_operation_rollout IS
  'Fail-closed per-operation rollout switch. Missing rows resolve to legacy; active rows require exact-coordinate parity certification.';

CREATE TABLE ops.authorization_operation_cutover_drill (
    id uuid NOT NULL DEFAULT shared.uuidv7(), plane_code text NOT NULL, entity_code text NOT NULL,
    source_entity_operation_id uuid NOT NULL, source_release_hash text NOT NULL, source_artifact_hash text NOT NULL,
    certification_id uuid NOT NULL, activation_request_id text NOT NULL, activation_audit_evidence_id uuid NOT NULL,
    activated_observed_at timestamptz NOT NULL, rolled_back_observed_at timestamptz NOT NULL,
    legacy_observed_at timestamptz NOT NULL, reactivated_observed_at timestamptz NOT NULL,
    legacy_fallback_count integer NOT NULL DEFAULT 0, outcome text NOT NULL, ticket_reference text NOT NULL,
    performed_at timestamptz NOT NULL DEFAULT now(), performed_by uuid NOT NULL,
    CONSTRAINT authorization_operation_cutover_drill_pkey PRIMARY KEY(id),
    CONSTRAINT authorization_operation_cutover_drill_plane_chk CHECK(plane_code IN('neon','mesh')),
    CONSTRAINT authorization_operation_cutover_drill_hash_chk CHECK(source_release_hash~'^[a-f0-9]{64}$' AND source_artifact_hash~'^[a-f0-9]{64}$'),
    CONSTRAINT authorization_operation_cutover_drill_outcome_chk CHECK(outcome IN('passed','failed')),
    CONSTRAINT authorization_operation_cutover_drill_fallback_chk CHECK(legacy_fallback_count>=0 AND (outcome='failed' OR legacy_fallback_count=0)),
    CONSTRAINT authorization_operation_cutover_drill_time_chk CHECK(activated_observed_at<=rolled_back_observed_at AND rolled_back_observed_at<=legacy_observed_at AND legacy_observed_at<=reactivated_observed_at AND reactivated_observed_at<=performed_at+interval '5 minutes'),
    CONSTRAINT authorization_operation_cutover_drill_ticket_chk CHECK(btrim(ticket_reference)<>'')
    ,CONSTRAINT authorization_operation_cutover_drill_certification_fk FOREIGN KEY(certification_id)
      REFERENCES ops.authorization_parity_certification(id) ON DELETE RESTRICT
);

COMMENT ON TABLE ops.authorization_operation_cutover_drill IS
  'Append-only proof that one qualified exact operation coordinate was activated, audited, rolled back, observed on legacy, and reactivated without fallback.';

CREATE TABLE ops.authorization_legacy_retirement_approval (
 id uuid NOT NULL DEFAULT shared.uuidv7(),plane_code text NOT NULL,activation_manifest_sha256 text NOT NULL,
 covered_operation_count integer NOT NULL,approval_action text NOT NULL,ticket_reference text NOT NULL,
 decision_reason text NOT NULL,decided_at timestamptz NOT NULL DEFAULT now(),decided_by uuid NOT NULL,
 CONSTRAINT authorization_legacy_retirement_approval_pkey PRIMARY KEY(id),
 CONSTRAINT authorization_legacy_retirement_approval_plane_chk CHECK(plane_code IN('neon','mesh')),
 CONSTRAINT authorization_legacy_retirement_approval_hash_chk CHECK(activation_manifest_sha256~'^[a-f0-9]{64}$'),
 CONSTRAINT authorization_legacy_retirement_approval_count_chk CHECK(covered_operation_count>0),
 CONSTRAINT authorization_legacy_retirement_approval_action_chk CHECK(approval_action IN('approve','revoke')),
 CONSTRAINT authorization_legacy_retirement_approval_text_chk CHECK(btrim(ticket_reference)<>'' AND btrim(decision_reason)<>'')
);
COMMENT ON TABLE ops.authorization_legacy_retirement_approval IS
 'Append-only human approval/revocation ledger bound to one exact activation-manifest hash.';

CREATE TABLE ops.authorization_shadow_comparison (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    plane_code                 text        NOT NULL,
    entity_code                text        NOT NULL,
    source_entity_operation_id uuid        NOT NULL,
    source_release_hash        text        NOT NULL,
    source_artifact_hash       text        NOT NULL,
    request_id                 text        NOT NULL,
    cohort_code               text        NOT NULL DEFAULT 'legacy_baseline',
    correlation_id             uuid,
    principal_id               uuid        NOT NULL,
    comparison_status          text        NOT NULL,
    legacy_decision            text        NOT NULL,
    legacy_reason              text        NOT NULL,
    legacy_fingerprint         text        NOT NULL,
    candidate_decision         text,
    candidate_reason           text,
    candidate_fingerprint      text,
    candidate_error            text,
    observed_at                timestamptz NOT NULL,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,

    CONSTRAINT authorization_shadow_comparison_pkey PRIMARY KEY (id),
    CONSTRAINT authorization_shadow_comparison_tenant_id_uq UNIQUE (tenant_id,id),
    CONSTRAINT authorization_shadow_comparison_plane_chk CHECK (plane_code IN ('neon','mesh')),
    CONSTRAINT authorization_shadow_comparison_entity_chk CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT authorization_shadow_comparison_release_hash_chk CHECK (source_release_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT authorization_shadow_comparison_artifact_hash_chk CHECK (source_artifact_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT authorization_shadow_comparison_request_chk CHECK (btrim(request_id) <> '' AND length(request_id) <= 256),
    CONSTRAINT authorization_shadow_comparison_cohort_chk CHECK (cohort_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT authorization_shadow_comparison_status_chk CHECK (comparison_status IN ('match','mismatch','candidate_error')),
    CONSTRAINT authorization_shadow_comparison_decision_chk CHECK (
        legacy_decision IN ('allow','deny') AND (candidate_decision IS NULL OR candidate_decision IN ('allow','deny'))),
    CONSTRAINT authorization_shadow_comparison_reason_chk CHECK (
        btrim(legacy_reason) <> '' AND length(legacy_reason) <= 128
        AND (candidate_reason IS NULL OR (btrim(candidate_reason) <> '' AND length(candidate_reason) <= 128))),
    CONSTRAINT authorization_shadow_comparison_fingerprint_chk CHECK (
        legacy_fingerprint ~ '^[a-f0-9]{64}$'
        AND (candidate_fingerprint IS NULL OR candidate_fingerprint ~ '^[a-f0-9]{64}$')),
    CONSTRAINT authorization_shadow_comparison_shape_chk CHECK (
        (comparison_status IN ('match','mismatch')
          AND candidate_decision IS NOT NULL AND candidate_reason IS NOT NULL
          AND candidate_fingerprint IS NOT NULL AND candidate_error IS NULL)
        OR (comparison_status='candidate_error'
          AND candidate_decision IS NULL AND candidate_reason IS NULL
          AND candidate_fingerprint IS NULL AND candidate_error IS NOT NULL
          AND btrim(candidate_error) <> '' AND length(candidate_error) <= 1000)),
    CONSTRAINT authorization_shadow_comparison_semantics_chk CHECK (
        comparison_status <> 'match'
        OR (legacy_decision=candidate_decision AND legacy_reason=candidate_reason)),
    CONSTRAINT authorization_shadow_comparison_time_chk CHECK (observed_at <= created_at + interval '5 minutes'),
    CONSTRAINT authorization_shadow_comparison_actor_chk CHECK (created_by=principal_id)
);

COMMENT ON TABLE ops.authorization_shadow_comparison IS
  'Append-only, non-authorizing comparison evidence between legacy and candidate authorization decisions. Plane/release/artifact coordinates prevent cross-release qualification.';

CREATE TABLE ops.identity_admission_shadow_comparison (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    plane_code text NOT NULL,
    workflow text NOT NULL,
    request_id text NOT NULL,
    realm_key text NOT NULL,
    subject_fingerprint text NOT NULL,
    comparison_status text NOT NULL,
    mismatch_areas text[] NOT NULL DEFAULT '{}'::text[],
    severity text NOT NULL,
    legacy_result jsonb NOT NULL,
    candidate_result jsonb,
    candidate_error text,
    legacy_fingerprint text NOT NULL,
    candidate_fingerprint text,
    resolver_revision text NOT NULL,
    observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    observed_by text NOT NULL DEFAULT session_user,
    CONSTRAINT identity_admission_shadow_pkey PRIMARY KEY(id),
    CONSTRAINT identity_admission_shadow_plane_chk CHECK(plane_code IN ('studio','neon','mesh')),
    CONSTRAINT identity_admission_shadow_workflow_chk CHECK(workflow IN ('login','session','logout','provisioning')),
    CONSTRAINT identity_admission_shadow_request_chk CHECK(btrim(request_id)<>'' AND length(request_id)<=256),
    CONSTRAINT identity_admission_shadow_realm_chk CHECK(btrim(realm_key)<>'' AND length(realm_key)<=256),
    CONSTRAINT identity_admission_shadow_subject_chk CHECK(subject_fingerprint~'^[a-f0-9]{64}$'),
    CONSTRAINT identity_admission_shadow_status_chk CHECK(comparison_status IN ('match','mismatch','candidate_error')),
    CONSTRAINT identity_admission_shadow_area_chk CHECK(array_position(mismatch_areas,NULL) IS NULL AND mismatch_areas <@ ARRAY['tenant','principal','binding','membership','scope','permission']::text[]),
    CONSTRAINT identity_admission_shadow_severity_chk CHECK(severity IN ('none','low','high','critical')),
    CONSTRAINT identity_admission_shadow_legacy_json_chk CHECK(jsonb_typeof(legacy_result)='object'),
    CONSTRAINT identity_admission_shadow_candidate_json_chk CHECK(candidate_result IS NULL OR jsonb_typeof(candidate_result)='object'),
    CONSTRAINT identity_admission_shadow_hash_chk CHECK(legacy_fingerprint~'^[a-f0-9]{64}$' AND (candidate_fingerprint IS NULL OR candidate_fingerprint~'^[a-f0-9]{64}$')),
    CONSTRAINT identity_admission_shadow_shape_chk CHECK(
      (comparison_status IN ('match','mismatch') AND candidate_result IS NOT NULL AND candidate_fingerprint IS NOT NULL AND candidate_error IS NULL)
      OR (comparison_status='candidate_error' AND candidate_result IS NULL AND candidate_fingerprint IS NULL AND candidate_error IS NOT NULL)),
    CONSTRAINT identity_admission_shadow_match_chk CHECK(comparison_status<>'match' OR (cardinality(mismatch_areas)=0 AND legacy_fingerprint=candidate_fingerprint AND severity='none'))
);
COMMENT ON TABLE ops.identity_admission_shadow_comparison IS 'Append-only, pre-session-safe comparison evidence. Subject identifiers are stored only as SHA-256 fingerprints and the candidate never authorizes shadow traffic.';

CREATE TABLE ops.authorization_session_shadow_comparison (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    plane_code text NOT NULL,
    principal_id uuid NOT NULL,
    request_id text NOT NULL,
    comparison_status text NOT NULL,
    mismatch_areas text[] NOT NULL DEFAULT '{}'::text[],
    legacy_result jsonb NOT NULL,
    candidate_result jsonb,
    candidate_error text,
    legacy_fingerprint text NOT NULL,
    candidate_fingerprint text,
    resolver_revision text NOT NULL,
    observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    observed_by text NOT NULL DEFAULT session_user,
    CONSTRAINT authorization_session_shadow_pkey PRIMARY KEY(id),
    CONSTRAINT authorization_session_shadow_plane_chk CHECK(plane_code IN ('studio','neon','mesh')),
    CONSTRAINT authorization_session_shadow_status_chk CHECK(comparison_status IN ('match','mismatch','candidate_error')),
    CONSTRAINT authorization_session_shadow_area_chk CHECK(mismatch_areas <@ ARRAY['tenant','principal','binding','catalog','scope','permission']::text[]),
    CONSTRAINT authorization_session_shadow_json_chk CHECK(jsonb_typeof(legacy_result)='object' AND (candidate_result IS NULL OR jsonb_typeof(candidate_result)='object')),
    CONSTRAINT authorization_session_shadow_hash_chk CHECK(legacy_fingerprint~'^[a-f0-9]{64}$' AND (candidate_fingerprint IS NULL OR candidate_fingerprint~'^[a-f0-9]{64}$')),
    CONSTRAINT authorization_session_shadow_shape_chk CHECK(
      (comparison_status IN ('match','mismatch') AND candidate_result IS NOT NULL AND candidate_fingerprint IS NOT NULL AND candidate_error IS NULL)
      OR (comparison_status='candidate_error' AND candidate_result IS NULL AND candidate_fingerprint IS NULL AND candidate_error IS NOT NULL))
);
COMMENT ON TABLE ops.authorization_session_shadow_comparison IS 'Canonical session parity evidence including permission results and organizational scope ceilings; never used to authorize shadow traffic.';

CREATE TABLE ops.job_execution (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid,
    cron_schedule_id      uuid,
    parent_execution_id   uuid,
    execution_key         text        NOT NULL,
    job_code              text        NOT NULL,
    job_type              text,
    run_id                uuid,
    correlation_id        uuid,
    trace_id              text,
    span_id               text,
    worker_id             text,
    status                text        NOT NULL DEFAULT 'queued',
    attempt_no            smallint    NOT NULL DEFAULT 1,
    max_attempts          smallint    NOT NULL DEFAULT 1,
    input_payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    result_payload        jsonb,
    error_code            text,
    error_message         text,
    error_detail          jsonb,
    scheduled_at          timestamptz,
    started_at            timestamptz,
    completed_at          timestamptz,
    duration_ms           bigint,
    purge_after           timestamptz,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT job_execution_pkey PRIMARY KEY (id),
    CONSTRAINT job_execution_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_execution_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, execution_key),
    CONSTRAINT job_execution_key_chk CHECK (btrim(execution_key) <> ''),
    CONSTRAINT job_execution_code_chk CHECK (job_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT job_execution_status_chk CHECK (
        status IN ('queued','running','retrying','succeeded','failed','cancelled','timed_out','dead_letter')
    ),
    CONSTRAINT job_execution_attempt_chk CHECK (
        attempt_no > 0 AND max_attempts > 0 AND attempt_no <= max_attempts
    ),
    CONSTRAINT job_execution_json_chk CHECK (
        jsonb_typeof(input_payload) = 'object'
        AND (result_payload IS NULL OR jsonb_typeof(result_payload) = 'object')
        AND (error_detail IS NULL OR jsonb_typeof(error_detail) = 'object')
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT job_execution_time_chk CHECK (
        (started_at IS NULL OR started_at >= COALESCE(scheduled_at, created_at))
        AND (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
        AND (purge_after IS NULL OR purge_after > created_at)
    ),
    CONSTRAINT job_execution_terminal_chk CHECK (
        (status IN ('succeeded','failed','cancelled','timed_out','dead_letter') AND completed_at IS NOT NULL)
        OR (status NOT IN ('succeeded','failed','cancelled','timed_out','dead_letter') AND completed_at IS NULL)
    ),
    CONSTRAINT job_execution_error_chk CHECK (
        status NOT IN ('failed','timed_out','dead_letter') OR error_code IS NOT NULL
    ),
    CONSTRAINT job_execution_duration_chk CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT job_execution_parent_chk CHECK (parent_execution_id IS NULL OR parent_execution_id <> id),
    CONSTRAINT job_execution_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE ops.job_execution IS
  'Plane-local durable job execution and retry history replacing legacy log.job_log. Global executions use NULL tenant_id.';

CREATE TABLE ops.job_execution_attempt (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid,
    execution_id          uuid        NOT NULL,
    attempt_no            smallint    NOT NULL,
    worker_id             text,
    status                text        NOT NULL,
    started_at            timestamptz NOT NULL,
    completed_at          timestamptz NOT NULL,
    duration_ms           bigint      NOT NULL,
    error_code            text,
    error_message         text,
    error_detail          jsonb,
    trace_id              text,
    span_id               text,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT job_execution_attempt_pkey PRIMARY KEY (id),
    CONSTRAINT job_execution_attempt_uq UNIQUE (execution_id, attempt_no),
    CONSTRAINT job_execution_attempt_no_chk CHECK (attempt_no > 0),
    CONSTRAINT job_execution_attempt_status_chk CHECK (
        status IN ('succeeded','retrying','failed','cancelled','timed_out','dead_letter')
    ),
    CONSTRAINT job_execution_attempt_time_chk CHECK (
        completed_at >= started_at AND duration_ms >= 0
    ),
    CONSTRAINT job_execution_attempt_error_chk CHECK (
        status NOT IN ('retrying','failed','timed_out','dead_letter') OR error_code IS NOT NULL
    ),
    CONSTRAINT job_execution_attempt_json_chk CHECK (
        (error_detail IS NULL OR jsonb_typeof(error_detail) = 'object')
        AND jsonb_typeof(metadata) = 'object'
    )
);

COMMENT ON TABLE ops.job_execution_attempt IS
  'Append-only terminal evidence for each attempt of a logical job execution.';

CREATE TABLE ops.job_execution_command (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid,
    execution_id             uuid        NOT NULL,
    command                  text        NOT NULL,
    reason                   text        NOT NULL,
    requested_at             timestamptz NOT NULL DEFAULT now(),
    requested_by             uuid        NOT NULL,
    status                   text        NOT NULL,
    applied_at               timestamptz,
    replacement_execution_id uuid,
    detail                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT job_execution_command_pkey PRIMARY KEY (id),
    CONSTRAINT job_execution_command_type_chk CHECK (command IN ('cancel','retry','replay')),
    CONSTRAINT job_execution_command_reason_chk CHECK (btrim(reason) <> ''),
    CONSTRAINT job_execution_command_status_chk CHECK (status IN ('applied','rejected')),
    CONSTRAINT job_execution_command_applied_chk CHECK (applied_at IS NOT NULL),
    CONSTRAINT job_execution_command_replacement_chk CHECK (
        replacement_execution_id IS NULL OR command IN ('retry','replay')
    ),
    CONSTRAINT job_execution_command_json_chk CHECK (jsonb_typeof(detail) = 'object')
);

COMMENT ON TABLE ops.job_execution_command IS
  'Append-only, actor-attributed cancel/retry/replay command and outcome evidence.';

CREATE TABLE ops.record_edit_lock (
    tenant_id          uuid        NOT NULL,
    entity_code        text        NOT NULL,
    record_id          uuid        NOT NULL,
    owner_principal_id uuid        NOT NULL,
    lock_token         uuid        NOT NULL,
    fencing_token      bigint      NOT NULL,
    acquired_at        timestamptz NOT NULL,
    expires_at         timestamptz NOT NULL,
    CONSTRAINT record_edit_lock_pkey PRIMARY KEY (tenant_id, entity_code, record_id),
    CONSTRAINT record_edit_lock_entity_chk CHECK (entity_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT record_edit_lock_fencing_chk CHECK (fencing_token > 0),
    CONSTRAINT record_edit_lock_expiry_chk CHECK (expires_at >= acquired_at)
);

COMMENT ON TABLE ops.record_edit_lock IS 'Database-time edit leases. Rows are retained so fencing tokens remain monotonic across release and reacquisition.';
CREATE TABLE ops.record_import_session (
    id uuid NOT NULL, tenant_id uuid NOT NULL, entity_code text NOT NULL,
    status text NOT NULL, staged_row_count integer NOT NULL DEFAULT 0,
    valid_row_count integer NOT NULL DEFAULT 0, invalid_row_count integer NOT NULL DEFAULT 0,
    checksum text NOT NULL, next_chunk_index integer NOT NULL DEFAULT 0,
    validation_rows jsonb, validation_summary jsonb, error_report_key text,
    created_at timestamptz NOT NULL, created_by uuid NOT NULL,
    cancelled_at timestamptz, completed_at timestamptz, updated_at timestamptz,
    CONSTRAINT record_import_session_pkey PRIMARY KEY (tenant_id,id),
    CONSTRAINT record_import_session_entity_chk CHECK(entity_code~'^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT record_import_session_status_chk CHECK(status IN('uploading','staged','validated','previewed','commit_queued','running','committed','cancelled','failed')),
    CONSTRAINT record_import_session_count_chk CHECK(staged_row_count>=0 AND valid_row_count>=0 AND invalid_row_count>=0 AND next_chunk_index>=0),
    CONSTRAINT record_import_session_checksum_chk CHECK(checksum~'^[a-f0-9]{64}$'),
    CONSTRAINT record_import_session_validation_chk CHECK((validation_rows IS NULL OR jsonb_typeof(validation_rows)='array') AND (validation_summary IS NULL OR jsonb_typeof(validation_summary)='object'))
);

CREATE TABLE ops.record_import_chunk (
    tenant_id uuid NOT NULL, session_id uuid NOT NULL, chunk_index integer NOT NULL,
    row_count integer NOT NULL, rows jsonb NOT NULL, chunk_checksum text NOT NULL,
    cumulative_checksum text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT record_import_chunk_pkey PRIMARY KEY(tenant_id,session_id,chunk_index),
    CONSTRAINT record_import_chunk_session_fk FOREIGN KEY(tenant_id,session_id) REFERENCES ops.record_import_session(tenant_id,id) ON DELETE CASCADE,
    CONSTRAINT record_import_chunk_index_chk CHECK(chunk_index>=0 AND row_count>0),
    CONSTRAINT record_import_chunk_rows_chk CHECK(jsonb_typeof(rows)='array' AND jsonb_array_length(rows)=row_count),
    CONSTRAINT record_import_chunk_hash_chk CHECK(chunk_checksum~'^[a-f0-9]{64}$' AND cumulative_checksum~'^[a-f0-9]{64}$')
);

CREATE TABLE ops.record_export_request (
    id uuid NOT NULL, tenant_id uuid NOT NULL, entity_code text NOT NULL,
    exact_filter jsonb NOT NULL, actor_principal_id uuid NOT NULL, status text NOT NULL,
    artifact_key text, row_count integer, error_code text,
    requested_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
    completed_at timestamptz, cancelled_at timestamptz,
    CONSTRAINT record_export_request_pkey PRIMARY KEY(tenant_id,id),
    CONSTRAINT record_export_request_entity_chk CHECK(entity_code~'^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT record_export_request_filter_chk CHECK(jsonb_typeof(exact_filter)='object'),
    CONSTRAINT record_export_request_status_chk CHECK(status IN('queued','running','completed','cancelled','failed')),
    CONSTRAINT record_export_request_count_chk CHECK(row_count IS NULL OR row_count>=0)
);
CREATE TABLE ops.control_runtime_command_submission (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    plane_code          text        NOT NULL,
    command_id          text        NOT NULL,
    idempotency_key     text        NOT NULL,
    fingerprint         text        NOT NULL,
    outcome             text        NOT NULL,
    submission          jsonb       NOT NULL,
    occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by          uuid        NOT NULL,
    CONSTRAINT control_runtime_command_submission_pkey PRIMARY KEY (id),
    CONSTRAINT control_runtime_command_submission_idempotency_uq UNIQUE (tenant_id,idempotency_key,outcome),
    CONSTRAINT control_runtime_command_submission_plane_chk CHECK (plane_code IN ('studio','neon','mesh')),
    CONSTRAINT control_runtime_command_submission_outcome_chk CHECK (outcome IN ('approval_required','pending','applied','failed')),
    CONSTRAINT control_runtime_command_submission_hash_chk CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT control_runtime_command_submission_text_chk CHECK (
      btrim(command_id)<>'' AND btrim(idempotency_key)<>'' AND jsonb_typeof(submission)='object')
);
COMMENT ON TABLE ops.control_runtime_command_submission IS
  'Append-only runtime command state events. Pending claims are persisted before external apply; terminal states are immutable follow-up rows.';

CREATE TABLE ops.control_runtime_command_approval_request (
    id                  uuid        NOT NULL,
    tenant_id           uuid        NOT NULL,
    plane_code          text        NOT NULL,
    command_id          text        NOT NULL,
    kind                text        NOT NULL,
    command_fingerprint text        NOT NULL,
    requested_by        uuid        NOT NULL,
    requested_at        timestamptz NOT NULL,
    CONSTRAINT control_runtime_command_approval_request_pkey PRIMARY KEY (id),
    CONSTRAINT control_runtime_command_approval_request_plane_chk CHECK (plane_code IN ('studio','neon','mesh')),
    CONSTRAINT control_runtime_command_approval_request_kind_chk CHECK (kind ~ '^[a-z][a-z0-9_.-]{2,127}$'),
    CONSTRAINT control_runtime_command_approval_request_hash_chk CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT control_runtime_command_approval_request_text_chk CHECK (btrim(command_id)<>'')
);
COMMENT ON TABLE ops.control_runtime_command_approval_request IS
  'Immutable high-risk runtime command approval request bound to an exact command fingerprint.';

CREATE TABLE ops.control_runtime_command_approval_decision (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    approval_id         uuid        NOT NULL,
    decision            text        NOT NULL,
    reason              text        NOT NULL,
    decided_by          uuid        NOT NULL,
    decided_at          timestamptz NOT NULL,
    CONSTRAINT control_runtime_command_approval_decision_pkey PRIMARY KEY (id),
    CONSTRAINT control_runtime_command_approval_decision_approval_uq UNIQUE (approval_id),
    CONSTRAINT control_runtime_command_approval_decision_value_chk CHECK (decision IN ('approved','rejected')),
    CONSTRAINT control_runtime_command_approval_decision_reason_chk CHECK (btrim(reason)<>''),
    CONSTRAINT control_runtime_command_approval_decision_request_fk FOREIGN KEY (approval_id)
      REFERENCES ops.control_runtime_command_approval_request(id) ON DELETE RESTRICT
);
COMMENT ON TABLE ops.control_runtime_command_approval_decision IS
  'Append-only two-person approval decision; at most one decision exists per request.';

CREATE TABLE ops.control_runtime_command_history (
    sequence_no         bigint GENERATED ALWAYS AS IDENTITY,
    id                  uuid        NOT NULL,
    tenant_id           uuid        NOT NULL,
    plane_code          text        NOT NULL,
    command_id          text        NOT NULL,
    kind                text        NOT NULL,
    event               text        NOT NULL,
    actor_id            uuid        NOT NULL,
    reason              text        NOT NULL,
    fingerprint         text        NOT NULL,
    detail              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at         timestamptz NOT NULL,
    previous_hash       text,
    entry_hash          text        NOT NULL,
    CONSTRAINT control_runtime_command_history_pkey PRIMARY KEY (id),
    CONSTRAINT control_runtime_command_history_sequence_uq UNIQUE (sequence_no),
    CONSTRAINT control_runtime_command_history_plane_chk CHECK (plane_code IN ('studio','neon','mesh')),
    CONSTRAINT control_runtime_command_history_kind_chk CHECK (kind ~ '^[a-z][a-z0-9_.-]{2,127}$'),
    CONSTRAINT control_runtime_command_history_event_chk CHECK (event IN ('submitted','approval_requested','approved','rejected','applied')),
    CONSTRAINT control_runtime_command_history_reason_chk CHECK (btrim(reason)<>''),
    CONSTRAINT control_runtime_command_history_hash_chk CHECK (
      fingerprint ~ '^[a-f0-9]{64}$' AND entry_hash ~ '^[a-f0-9]{64}$'
      AND (previous_hash IS NULL OR previous_hash ~ '^[a-f0-9]{64}$')),
    CONSTRAINT control_runtime_command_history_detail_chk CHECK (jsonb_typeof(detail)='object')
);
COMMENT ON TABLE ops.control_runtime_command_history IS
  'Append-only per-tenant/per-plane hash chain for runtime command and approval events.';
