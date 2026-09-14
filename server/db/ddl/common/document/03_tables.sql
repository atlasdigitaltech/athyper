CREATE TABLE document.work_item (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    work_type_code text NOT NULL,
    title text NOT NULL,
    description text,
    source_entity_code text NOT NULL,
    source_entity_id uuid NOT NULL,
    source_action_code text,
    cycle_task_id uuid,
    assignee_principal_id uuid,
    assignee_team_id uuid,
    claimant_principal_id uuid,
    claimed_at timestamptz,
    available_at timestamptz NOT NULL DEFAULT now(),
    due_at timestamptz,
    completed_at timestamptz,
    priority document.work_item_priority_d NOT NULL DEFAULT 'normal',
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    outcome jsonb,
    status document.work_item_status_d NOT NULL DEFAULT 'open',
    row_version bigint NOT NULL DEFAULT 1,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT work_item_pkey PRIMARY KEY (id),
    CONSTRAINT work_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT work_item_type_chk
        CHECK (work_type_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT work_item_source_chk
        CHECK (source_entity_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT work_item_claim_chk CHECK (
        (claimant_principal_id IS NULL) = (claimed_at IS NULL)
    ),
    CONSTRAINT work_item_due_chk CHECK (due_at IS NULL OR due_at >= available_at),
    CONSTRAINT work_item_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT work_item_payload_chk CHECK (
        jsonb_typeof(payload) = 'object'
        AND (outcome IS NULL OR jsonb_typeof(outcome) = 'object')
    ),
    CONSTRAINT work_item_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT work_item_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- G1 governed entity lifecycle: payloads remain exclusively in immutable snapshots.
CREATE TABLE document.entity_case (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    case_code text NOT NULL, entity_code text NOT NULL, operation_code text NOT NULL,
    owner_company_code_id uuid,
    target_entity_id uuid, pre_materialization_ref text,
    entity_contract_id uuid NOT NULL, entity_contract_hash char(64) NOT NULL,
    form_template_release_id uuid, form_template_release_no bigint, form_template_hash char(64),
    current_snapshot_id uuid NOT NULL, submitted_snapshot_id uuid, decision_snapshot_id uuid, result_snapshot_id uuid,
    status text NOT NULL DEFAULT 'draft', row_version bigint NOT NULL DEFAULT 1,
    idempotency_key text NOT NULL, status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_case_pkey PRIMARY KEY(id), CONSTRAINT entity_case_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT entity_case_code_uq UNIQUE(tenant_id,case_code), CONSTRAINT entity_case_idempotency_uq UNIQUE(tenant_id,idempotency_key),
    CONSTRAINT entity_case_code_chk CHECK(case_code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT entity_case_entity_chk CHECK(entity_code ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND operation_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_case_target_chk CHECK((target_entity_id IS NOT NULL) OR (pre_materialization_ref IS NOT NULL AND btrim(pre_materialization_ref)<>'' AND length(pre_materialization_ref)<=256)),
    CONSTRAINT entity_case_contract_hash_chk CHECK(entity_contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_case_form_release_chk CHECK((form_template_release_id IS NULL AND form_template_release_no IS NULL AND form_template_hash IS NULL) OR (form_template_release_id IS NOT NULL AND form_template_release_no>=1 AND form_template_hash ~ '^[a-f0-9]{64}$')),
    CONSTRAINT entity_case_status_chk CHECK(status IN('draft','submitted','in_review','approved','rejected','materializing','materialized','cancelled','conflicted')),
    CONSTRAINT entity_case_version_chk CHECK(row_version>=1), CONSTRAINT entity_case_idempotency_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT entity_case_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)), CONSTRAINT entity_case_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
    CONSTRAINT entity_case_company_pilot_owner_chk CHECK ((entity_code='master.business_partner_company_setup_request') = (owner_company_code_id IS NOT NULL)),
    CONSTRAINT entity_case_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id),
    CONSTRAINT entity_case_contract_fk FOREIGN KEY(tenant_id,entity_contract_id) REFERENCES runtime_meta.entity_contract(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_current_snapshot_fk FOREIGN KEY(tenant_id,current_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_submitted_snapshot_fk FOREIGN KEY(tenant_id,submitted_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_decision_snapshot_fk FOREIGN KEY(tenant_id,decision_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_result_snapshot_fk FOREIGN KEY(tenant_id,result_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id),
    CONSTRAINT entity_case_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id),
    CONSTRAINT entity_case_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id)
);

CREATE TABLE document.entity_case_command_evidence (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, entity_case_id uuid NOT NULL,
    command_code text NOT NULL, idempotency_key text NOT NULL, request_fingerprint char(64) NOT NULL,
    expected_version bigint NOT NULL, before_version bigint NOT NULL, after_version bigint NOT NULL,
    before_status text NOT NULL, after_status text NOT NULL, outcome text NOT NULL, result_code text NOT NULL,
    result_snapshot_id uuid, result_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamptz NOT NULL DEFAULT now(), recorded_by uuid NOT NULL,
    CONSTRAINT entity_case_command_evidence_pkey PRIMARY KEY(id), CONSTRAINT entity_case_command_evidence_tenant_uq UNIQUE(tenant_id,id),
    CONSTRAINT entity_case_command_evidence_idem_uq UNIQUE(tenant_id,entity_case_id,command_code,idempotency_key),
    CONSTRAINT entity_case_command_evidence_code_chk CHECK(command_code ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND result_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT entity_case_command_evidence_hash_chk CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_case_command_evidence_version_chk CHECK(expected_version>=0 AND before_version>=0 AND after_version>=before_version),
    CONSTRAINT entity_case_command_evidence_outcome_chk CHECK(outcome IN('accepted','rejected','replayed','conflict')),
    CONSTRAINT entity_case_command_evidence_json_chk CHECK(jsonb_typeof(result_evidence)='object' AND pg_column_size(result_evidence)<=16384),
    CONSTRAINT entity_case_command_evidence_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_command_evidence_snapshot_fk FOREIGN KEY(tenant_id,result_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_command_evidence_actor_fk FOREIGN KEY(tenant_id,recorded_by) REFERENCES master.principal(tenant_id,id)
);

CREATE TABLE document.entity_case_validation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, entity_case_id uuid NOT NULL,
    evaluation_id uuid NOT NULL, ordinal integer NOT NULL, evaluated_snapshot_id uuid NOT NULL,
    ruleset_code text NOT NULL, ruleset_release text NOT NULL, ruleset_hash char(64) NOT NULL,
    finding_code text NOT NULL, field_path text, severity text NOT NULL, message text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb, evaluated_at timestamptz NOT NULL DEFAULT now(), evaluated_by uuid NOT NULL,
    CONSTRAINT entity_case_validation_pkey PRIMARY KEY(id), CONSTRAINT entity_case_validation_tenant_uq UNIQUE(tenant_id,id),
    CONSTRAINT entity_case_validation_ordinal_uq UNIQUE(tenant_id,entity_case_id,evaluation_id,ordinal),
    CONSTRAINT entity_case_validation_code_chk CHECK(ruleset_code ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND finding_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT entity_case_validation_release_chk CHECK(btrim(ruleset_release)<>'' AND length(ruleset_release)<=64 AND ruleset_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_case_validation_finding_chk CHECK(ordinal>=0 AND severity IN('info','warning','error') AND length(message) BETWEEN 1 AND 2000 AND (field_path IS NULL OR length(field_path)<=512)),
    CONSTRAINT entity_case_validation_details_chk CHECK(jsonb_typeof(details)='object' AND pg_column_size(details)<=16384),
    CONSTRAINT entity_case_validation_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_validation_snapshot_fk FOREIGN KEY(tenant_id,evaluated_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_validation_actor_fk FOREIGN KEY(tenant_id,evaluated_by) REFERENCES master.principal(tenant_id,id)
);

CREATE TABLE document.entity_case_materialization (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, entity_case_id uuid NOT NULL,
    attempt_no integer NOT NULL, source_snapshot_id uuid NOT NULL, result_snapshot_id uuid,
    materializer_code text NOT NULL, materializer_version text NOT NULL, request_fingerprint char(64) NOT NULL,
    expected_target_version bigint, status text NOT NULL DEFAULT 'requested', result_code text,
    requested_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, completed_at timestamptz,
    requested_by uuid NOT NULL, completed_by uuid,
    CONSTRAINT entity_case_materialization_pkey PRIMARY KEY(id), CONSTRAINT entity_case_materialization_tenant_uq UNIQUE(tenant_id,id),
    CONSTRAINT entity_case_materialization_attempt_uq UNIQUE(tenant_id,entity_case_id,attempt_no),
    CONSTRAINT entity_case_materialization_fingerprint_uq UNIQUE(tenant_id,entity_case_id,request_fingerprint),
    CONSTRAINT entity_case_materialization_code_chk CHECK(materializer_code ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND btrim(materializer_version)<>'' AND length(materializer_version)<=64),
    CONSTRAINT entity_case_materialization_hash_chk CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_case_materialization_state_chk CHECK(attempt_no>=1 AND (expected_target_version IS NULL OR expected_target_version>=1) AND status IN('requested','running','succeeded','failed','conflict')),
    CONSTRAINT entity_case_materialization_completion_chk CHECK((status IN('succeeded','failed','conflict'))=(completed_at IS NOT NULL) AND (completed_at IS NULL)=(completed_by IS NULL) AND (status<>'succeeded' OR result_snapshot_id IS NOT NULL)),
    CONSTRAINT entity_case_materialization_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_materialization_source_fk FOREIGN KEY(tenant_id,source_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_materialization_result_fk FOREIGN KEY(tenant_id,result_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT entity_case_materialization_requested_by_fk FOREIGN KEY(tenant_id,requested_by) REFERENCES master.principal(tenant_id,id),
    CONSTRAINT entity_case_materialization_completed_by_fk FOREIGN KEY(tenant_id,completed_by) REFERENCES master.principal(tenant_id,id)
);
