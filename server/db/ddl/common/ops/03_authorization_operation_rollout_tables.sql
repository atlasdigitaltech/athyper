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
