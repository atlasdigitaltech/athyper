-- ============================================================================
-- onboarding/03_tables.sql
-- Canonical onboarding saga and execution artifacts.
-- This plane stores journey state only; identity, projections, and execution
-- evidence are linked through existing master/authz/snapshot/event/audit rows.
-- ============================================================================

CREATE TABLE onboarding.onboarding_case (
    id                          uuid                        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid                        NOT NULL,
    case_code                   text                        NOT NULL,
    canonical_party_id           uuid                        NOT NULL,
    requested_plan_id            uuid,
    requested_workspace_id       uuid,
    requested_module_id          uuid,
    requested_flow_id            uuid,
    source_onboarding_mode       onboarding.entry_mode_d      NOT NULL DEFAULT 'self_service',
    requested_by_principal_id    uuid                        NOT NULL,
    subject_principal_id         uuid,
    activation_criticality       onboarding.activation_criticality_d NOT NULL DEFAULT 'independent',
    target_product_code          text,
    request_metadata             jsonb                       NOT NULL DEFAULT '{}'::jsonb,
    request_payload              jsonb                       NOT NULL DEFAULT '{}'::jsonb,
    status                      onboarding.case_status_d      NOT NULL DEFAULT 'draft',
    desired_version             integer                     NOT NULL DEFAULT 1,
    desired_hash                text,
    decision_status             onboarding.decision_status_d  NOT NULL DEFAULT 'pending',
    decision_reason              text,
    priority                    text                        NOT NULL DEFAULT 'normal',
    snapshot_identity_id         uuid,
    command_execution_id         uuid,
    outbox_id                   uuid,
    audit_log_id                uuid,
    security_event_id            uuid,
    submitted_at                 timestamptz,
    decision_at                  timestamptz,
    decided_by                   uuid,
    activated_at                 timestamptz,
    offboarded_at                timestamptz,
    status_changed_at            timestamptz,
    status_changed_by            uuid,
    created_at                   timestamptz                  NOT NULL DEFAULT now(),
    created_by                   uuid                        NOT NULL,
    updated_at                   timestamptz,
    updated_by                   uuid,
    CONSTRAINT onboarding_case_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_case_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT onboarding_case_code_uq UNIQUE (tenant_id, case_code),
    CONSTRAINT onboarding_case_code_chk CHECK (case_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT onboarding_case_priority_chk CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    CONSTRAINT onboarding_case_desired_state_chk CHECK (
        desired_version > 0
        AND (desired_hash IS NULL OR desired_hash ~ '^[0-9a-f]{64}$')
    ),
    CONSTRAINT onboarding_case_decision_reason_chk
        CHECK (
            decision_status IN ('pending', 'waived')
            OR btrim(decision_reason) IS NOT NULL
        ),
    CONSTRAINT onboarding_case_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT onboarding_case_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT onboarding_case_dates_chk
        CHECK (
            (submitted_at IS NULL OR submitted_at >= created_at)
            AND (decision_at IS NULL OR decision_at >= coalesce(submitted_at, created_at))
            AND (activated_at IS NULL OR activated_at >= coalesce(decision_at, submitted_at, created_at))
            AND (offboarded_at IS NULL OR offboarded_at >= coalesce(activated_at, decision_at, submitted_at, created_at))
        ),
    CONSTRAINT onboarding_case_metadata_chk CHECK (jsonb_typeof(request_metadata) = 'object' AND jsonb_typeof(request_payload) = 'object')
);

CREATE TABLE onboarding.onboarding_case_target (
    id                        uuid                        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                        NOT NULL,
    onboarding_case_id         uuid                        NOT NULL,
    target_plane              shared.application_plane_d   NOT NULL,
    target_tenant_id          uuid                        NOT NULL,
    requested_projection_id    uuid,
    requested_plan_id          uuid,
    requested_workspace_id     uuid,
    requested_module_id        uuid,
    requested_scope_target_id  uuid,
    status                    onboarding.case_status_d      NOT NULL DEFAULT 'draft',
    criticality               onboarding.activation_criticality_d NOT NULL DEFAULT 'independent',
    decided_at                timestamptz,
    decided_by                uuid,
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    created_at                timestamptz                  NOT NULL DEFAULT now(),
    created_by                uuid                        NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,
    CONSTRAINT onboarding_case_target_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_case_target_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT onboarding_case_target_uq UNIQUE (onboarding_case_id, target_plane, target_tenant_id),
    CONSTRAINT onboarding_case_target_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT onboarding_case_target_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT onboarding_case_target_scope_or_plan_chk
        CHECK (
            requested_scope_target_id IS NOT NULL
            OR requested_workspace_id IS NOT NULL
            OR requested_plan_id IS NOT NULL
            OR requested_projection_id IS NOT NULL
        )
);

CREATE TABLE onboarding.onboarding_case_step (
    id                        uuid                        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                        NOT NULL,
    onboarding_case_id         uuid                        NOT NULL,
    onboarding_case_target_id  uuid,
    source_flow_step_id        uuid,
    step_code                 text                        NOT NULL,
    step_title                text                        NOT NULL,
    step_description          text,
    status                    onboarding.step_status_d     NOT NULL DEFAULT 'pending',
    criticality               onboarding.activation_criticality_d NOT NULL DEFAULT 'independent',
    execution_priority         smallint                    NOT NULL DEFAULT 0,
    snapshot_identity_id       uuid,
    command_execution_id       uuid,
    outbox_id                 uuid,
    audit_log_id              uuid,
    security_event_id         uuid,
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    started_at                timestamptz,
    completed_at              timestamptz,
    skipped_at                timestamptz,
    created_at                timestamptz                  NOT NULL DEFAULT now(),
    created_by                uuid                        NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,
    CONSTRAINT onboarding_case_step_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_case_step_tenant_uq UNIQUE (tenant_id, id),
    CONSTRAINT onboarding_case_step_code_uq UNIQUE (tenant_id, onboarding_case_id, step_code),
    CONSTRAINT onboarding_case_step_code_chk CHECK (step_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT onboarding_case_step_title_chk CHECK (btrim(step_title) <> ''),
    CONSTRAINT onboarding_case_step_priority_chk CHECK (execution_priority >= 0),
    CONSTRAINT onboarding_case_step_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT onboarding_case_step_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT onboarding_case_step_evidence_chk
        CHECK (
            snapshot_identity_id IS NOT NULL
            OR command_execution_id IS NOT NULL
            OR outbox_id IS NOT NULL
            OR audit_log_id IS NOT NULL
            OR security_event_id IS NOT NULL
        ),
    CONSTRAINT onboarding_case_step_timing_chk
        CHECK (
            (started_at IS NULL OR started_at >= created_at)
            AND (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at))
            AND (skipped_at IS NULL OR skipped_at >= created_at)
        )
);

CREATE TABLE onboarding.onboarding_step_dependency (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    onboarding_case_id          uuid        NOT NULL,
    depends_on_step_id          uuid        NOT NULL,
    depends_on_this_step_id     uuid        NOT NULL,
    dependency_kind            text        NOT NULL DEFAULT 'hard',
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    CONSTRAINT onboarding_step_dependency_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_step_dependency_uq UNIQUE (tenant_id, depends_on_step_id, depends_on_this_step_id),
    CONSTRAINT onboarding_step_dependency_step_chk
        CHECK (depends_on_step_id <> depends_on_this_step_id),
    CONSTRAINT onboarding_step_dependency_kind_chk
        CHECK (dependency_kind IN ('hard', 'soft'))
);

CREATE TABLE onboarding.onboarding_case_check (
    id                        uuid                        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                        NOT NULL,
    onboarding_case_id         uuid                        NOT NULL,
    onboarding_case_step_id    uuid,
    onboarding_case_target_id   uuid        NOT NULL,
    resource_type             text                        NOT NULL,
    resource_id               uuid,
    check_code                text                        NOT NULL,
    check_name                text                        NOT NULL,
    snapshot_identity_id       uuid,
    command_execution_id       uuid,
    outbox_id                 uuid,
    audit_log_id              uuid,
    security_event_id         uuid,
    result                    onboarding.check_result_d    NOT NULL DEFAULT 'pending',
    result_reason             text,
    check_metadata            jsonb                       NOT NULL DEFAULT '{}'::jsonb,
    result_changed_at         timestamptz,
    result_changed_by         uuid,
    created_at                timestamptz                  NOT NULL DEFAULT now(),
    created_by                uuid                        NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,
    CONSTRAINT onboarding_case_check_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_case_check_uq UNIQUE (tenant_id, onboarding_case_id, check_code),
    CONSTRAINT onboarding_case_check_code_chk CHECK (check_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT onboarding_case_check_resource_chk CHECK (resource_type ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT onboarding_case_check_name_chk CHECK (btrim(check_name) <> ''),
    CONSTRAINT onboarding_case_check_result_pair_chk
        CHECK ((result_changed_at IS NULL) = (result_changed_by IS NULL)),
    CONSTRAINT onboarding_case_check_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT onboarding_case_check_evidence_chk
        CHECK (
            snapshot_identity_id IS NOT NULL
            OR command_execution_id IS NOT NULL
            OR outbox_id IS NOT NULL
            OR audit_log_id IS NOT NULL
            OR security_event_id IS NOT NULL
        ),
    CONSTRAINT onboarding_case_check_name_pairs_chk
        CHECK (
            (result = 'pending' AND result_changed_at IS NULL)
            OR (result <> 'pending' AND result_changed_at IS NOT NULL)
            OR (result = 'waived' AND btrim(result_reason) <> '')
        ),
    CONSTRAINT onboarding_case_check_metadata_chk CHECK (jsonb_typeof(check_metadata) = 'object')
);

CREATE TABLE onboarding.onboarding_case_resource (
    id                        uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid        NOT NULL,
    onboarding_case_id         uuid        NOT NULL,
    onboarding_case_target_id   uuid,
    resource_kind             text        NOT NULL,
    resource_key              text        NOT NULL,
    remote_resource_id        text,
    source_resource           text,
    desired_version           integer     NOT NULL,
    desired_hash              text        NOT NULL,
    applied_version           integer,
    applied_hash              text,
    last_attempt_at           timestamptz,
    last_error_code           text,
    resource_status           onboarding.resource_status_d NOT NULL DEFAULT 'planned',
    metadata                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    snapshot_identity_id       uuid,
    command_execution_id       uuid,
    outbox_id                 uuid,
    audit_log_id              uuid,
    security_event_id          uuid,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid        NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,
    CONSTRAINT onboarding_case_resource_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_case_resource_uq UNIQUE (tenant_id, onboarding_case_target_id, resource_key),
    CONSTRAINT onboarding_case_resource_key_chk CHECK (resource_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT onboarding_case_resource_kind_chk CHECK (resource_kind ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT onboarding_case_resource_versions_chk CHECK (
        desired_version > 0
        AND desired_hash ~ '^[0-9a-f]{64}$'
        AND (applied_version IS NULL) = (applied_hash IS NULL)
        AND (applied_version IS NULL OR applied_version > 0)
        AND (applied_hash IS NULL OR applied_hash ~ '^[0-9a-f]{64}$')
    ),
    CONSTRAINT onboarding_case_resource_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT onboarding_case_resource_status_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT onboarding_case_resource_evidence_chk
        CHECK (
            resource_status = 'planned'
            OR snapshot_identity_id IS NOT NULL
            OR command_execution_id IS NOT NULL
            OR outbox_id IS NOT NULL
            OR audit_log_id IS NOT NULL
            OR security_event_id IS NOT NULL
        )
);

CREATE TABLE onboarding.onboarding_compilation_decision (
    id                        uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid        NOT NULL,
    onboarding_case_id         uuid        NOT NULL,
    onboarding_case_target_id   uuid,
    decision_status           onboarding.decision_status_d NOT NULL DEFAULT 'pending',
    approved_plan_id           uuid,
    approved_workspace_id      uuid,
    approved_module_id         uuid,
    approved_projection_id     uuid,
    decision_payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    decided_by                uuid,
    decided_at                timestamptz,
    decision_note             text,
    snapshot_identity_id       uuid,
    command_execution_id       uuid,
    outbox_id                 uuid,
    audit_log_id              uuid,
    security_event_id         uuid,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid        NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,
    CONSTRAINT onboarding_compilation_decision_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_compilation_decision_case_uq UNIQUE (onboarding_case_id, onboarding_case_target_id),
    CONSTRAINT onboarding_compilation_decision_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT onboarding_compilation_decision_payload_chk CHECK (jsonb_typeof(decision_payload) = 'object'),
    CONSTRAINT onboarding_compilation_decision_evidence_chk
        CHECK (
            snapshot_identity_id IS NOT NULL
            OR command_execution_id IS NOT NULL
            OR outbox_id IS NOT NULL
            OR audit_log_id IS NOT NULL
            OR security_event_id IS NOT NULL
        ),
    CONSTRAINT onboarding_compilation_decision_timing_chk
        CHECK (
            (decided_at IS NULL) = (decided_by IS NULL)
        )
);

CREATE TABLE onboarding.onboarding_case_revision (
    id                        uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid        NOT NULL,
    onboarding_case_id         uuid        NOT NULL,
    revision_no               integer     NOT NULL,
    from_status               onboarding.case_status_d,
    to_status                 onboarding.case_status_d NOT NULL,
    changed_by                uuid        NOT NULL,
    changed_at                timestamptz  NOT NULL DEFAULT now(),
    change_reason             text,
    change_context            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT onboarding_case_revision_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_case_revision_case_uq UNIQUE (tenant_id, onboarding_case_id, revision_no),
    CONSTRAINT onboarding_case_revision_no_chk CHECK (revision_no >= 1),
    CONSTRAINT onboarding_case_revision_reason_chk CHECK (change_reason IS NULL OR btrim(change_reason) <> ''),
    CONSTRAINT onboarding_case_revision_context_chk CHECK (jsonb_typeof(change_context) = 'object'),
    CONSTRAINT onboarding_case_revision_transition_chk
        CHECK ((from_status IS NULL AND revision_no = 1) OR (from_status IS NOT NULL AND revision_no > 1))
);

CREATE TABLE onboarding.onboarding_case_work_item (
    id                        uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid        NOT NULL,
    onboarding_case_id         uuid        NOT NULL,
    work_item_id              uuid        NOT NULL,
    work_type                 text        NOT NULL DEFAULT 'approval',
    correlation_code          text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid        NOT NULL,
    CONSTRAINT onboarding_case_work_item_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_case_work_item_uq UNIQUE (tenant_id, onboarding_case_id, work_item_id),
    CONSTRAINT onboarding_case_work_item_type_chk CHECK (work_type ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT onboarding_case_work_item_code_chk CHECK (correlation_code IS NULL OR btrim(correlation_code) <> '')
);

CREATE TABLE onboarding.onboarding_case_guest_access (
    id                        uuid                        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                        NOT NULL,
    onboarding_case_id         uuid                        NOT NULL,
    token_hash                text                        NOT NULL,
    token_subject             text,
    token_audience            text,
    scopes                    text[]                      NOT NULL,
    issued_at                 timestamptz                  NOT NULL DEFAULT now(),
    expires_at                timestamptz                  NOT NULL,
    revoked_at                timestamptz,
    revoked_by_principal_id    uuid,
    created_at                timestamptz                  NOT NULL DEFAULT now(),
    created_by                uuid                        NOT NULL,
    updated_at                timestamptz                  NOT NULL DEFAULT now(),
    updated_by                uuid                        NOT NULL,
    metadata                  jsonb                       NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT onboarding_case_guest_access_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_case_guest_access_uq UNIQUE (tenant_id, onboarding_case_id, token_hash),
    CONSTRAINT onboarding_case_guest_access_token_hash_chk
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT onboarding_case_guest_access_scopes_chk
        CHECK (
            cardinality(scopes) > 0
            AND scopes <@ ARRAY['case:read', 'case:update', 'evidence:upload']::text[]
        ),
    CONSTRAINT onboarding_case_guest_access_timing_chk
        CHECK (expires_at > issued_at),
    CONSTRAINT onboarding_case_guest_access_revoke_audit_pair_chk
        CHECK ((revoked_at IS NULL) = (revoked_by_principal_id IS NULL)),
    CONSTRAINT onboarding_case_guest_access_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT onboarding_case_guest_access_updated_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE onboarding.onboarding_case IS
  'Canonical onboarding case for legal entities, legal-principal onboarding, and cross-plane subscriptions.';

COMMENT ON COLUMN onboarding.onboarding_case.target_product_code IS
  'Fast product hint for UI filtering when no explicit workspace/module is selected.';
