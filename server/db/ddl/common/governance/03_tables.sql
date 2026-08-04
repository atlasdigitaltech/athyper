CREATE TABLE governance.comment_moderation (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    comment_flag_id uuid NOT NULL,
    moderator_principal_id uuid,
    decision_code text,
    decision_note text,
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
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    status governance.cycle_run_status_d NOT NULL DEFAULT 'draft',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT cycle_run_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_run_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_run_type_id_uq UNIQUE (tenant_id, cycle_type_id, id),
    CONSTRAINT cycle_run_code_uq UNIQUE (tenant_id, cycle_type_id, code),
    CONSTRAINT cycle_run_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_run_period_chk CHECK (period_end IS NULL OR period_start IS NOT NULL AND period_end >= period_start),
    CONSTRAINT cycle_run_data_chk CHECK (jsonb_typeof(data) = 'object'),
    CONSTRAINT cycle_run_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cycle_run_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE governance.cycle_task (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    cycle_run_id uuid NOT NULL,
    cycle_type_id uuid NOT NULL,
    task_template_id uuid NOT NULL,
    phase_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
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
    CONSTRAINT cycle_task_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_task_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_task_run_template_uq
        UNIQUE (tenant_id, cycle_run_id, task_template_id),
    CONSTRAINT cycle_task_code_chk CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_task_evidence_chk CHECK (jsonb_typeof(completion_evidence) = 'object'),
    CONSTRAINT cycle_task_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cycle_task_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE governance.cycle_deviation (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    cycle_run_id uuid NOT NULL,
    cycle_task_id uuid,
    deviation_type control.cycle_deviation_type_d NOT NULL,
    description text NOT NULL,
    severity_code text NOT NULL DEFAULT 'medium',
    resolution text,
    carried_to_cycle_run_id uuid,
    resolved_at timestamptz,
    resolved_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    CONSTRAINT cycle_deviation_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_deviation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_deviation_severity_chk CHECK (severity_code IN ('low','medium','high','critical')),
    CONSTRAINT cycle_deviation_resolution_chk CHECK ((resolved_at IS NULL) = (resolved_by IS NULL))
);

CREATE TABLE governance.cycle_certification (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    cycle_run_id uuid NOT NULL,
    certification_type_code text NOT NULL,
    statement text NOT NULL,
    certified_by uuid,
    certified_at timestamptz,
    evidence_snapshot_id uuid,
    status governance.certification_status_d NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    CONSTRAINT cycle_certification_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_certification_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cycle_certification_coordinate_uq
        UNIQUE (tenant_id, cycle_run_id, certification_type_code),
    CONSTRAINT cycle_certification_type_chk
        CHECK (certification_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT cycle_certification_evidence_chk
        CHECK ((certified_by IS NULL) = (certified_at IS NULL))
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
    parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    artifact_uri text,
    artifact_hash text,
    generated_at timestamptz,
    expires_at timestamptz,
    supersedes_report_pack_id uuid,
    status governance.report_pack_status_d NOT NULL DEFAULT 'draft',
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
    CONSTRAINT report_pack_expiry_chk CHECK (expires_at IS NULL OR generated_at IS NOT NULL AND expires_at > generated_at),
    CONSTRAINT report_pack_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);
