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
