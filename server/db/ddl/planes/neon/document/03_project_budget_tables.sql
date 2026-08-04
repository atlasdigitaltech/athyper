CREATE TABLE document.project_task (
    id                       uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                           NOT NULL,
    project_id               uuid                           NOT NULL,
    project_wbs_id           uuid                           NOT NULL,
    code                     text                           NOT NULL,
    title                    text                           NOT NULL,
    description              text,
    task_type                document.project_task_type_d   NOT NULL DEFAULT 'task',
    assignee_principal_id    uuid,
    assignee_team_id         uuid,
    planned_start_at         timestamptz,
    planned_end_at           timestamptz,
    actual_start_at          timestamptz,
    actual_end_at            timestamptz,
    planned_effort_hours     numeric(12,2),
    actual_effort_hours      numeric(12,2),
    completion_pct           numeric(5,2)                   NOT NULL DEFAULT 0,
    metadata                 jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                   document.project_task_status_d NOT NULL DEFAULT 'draft',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                    NOT NULL DEFAULT now(),
    created_by               uuid                           NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT project_task_pkey PRIMARY KEY (id),
    CONSTRAINT project_task_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_task_project_id_uq UNIQUE (tenant_id, project_id, id),
    CONSTRAINT project_task_code_uq UNIQUE (tenant_id, project_id, code),
    CONSTRAINT project_task_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT project_task_title_chk CHECK (btrim(title) <> ''),
    CONSTRAINT project_task_planned_range_chk CHECK (
        planned_end_at IS NULL OR planned_start_at IS NULL OR planned_end_at >= planned_start_at
    ),
    CONSTRAINT project_task_actual_range_chk CHECK (
        actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at >= actual_start_at
    ),
    CONSTRAINT project_task_effort_chk CHECK (
        (planned_effort_hours IS NULL OR planned_effort_hours >= 0)
        AND (actual_effort_hours IS NULL OR actual_effort_hours >= 0)
    ),
    CONSTRAINT project_task_completion_pct_chk CHECK (completion_pct BETWEEN 0 AND 100),
    CONSTRAINT project_task_completion_chk CHECK (
        status <> 'completed'
        OR (completion_pct = 100 AND actual_start_at IS NOT NULL AND actual_end_at IS NOT NULL)
    ),
    CONSTRAINT project_task_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT project_task_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT project_task_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.project_task_requirement (
    id                   uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                                  NOT NULL,
    project_id           uuid                                  NOT NULL,
    project_task_id      uuid                                  NOT NULL,
    project_item_id      uuid                                  NOT NULL,
    quantity_planned     numeric(18,6)                         NOT NULL,
    quantity_reserved    numeric(18,6)                         NOT NULL DEFAULT 0,
    quantity_issued      numeric(18,6)                         NOT NULL DEFAULT 0,
    quantity_consumed    numeric(18,6)                         NOT NULL DEFAULT 0,
    quantity_returned    numeric(18,6)                         NOT NULL DEFAULT 0,
    uom_code             text                                  NOT NULL,
    metadata             jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    status               document.project_requirement_status_d NOT NULL DEFAULT 'planned',
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                           NOT NULL DEFAULT now(),
    created_by           uuid                                  NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT project_task_requirement_pkey PRIMARY KEY (id),
    CONSTRAINT project_task_requirement_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_task_requirement_coordinate_uq
        UNIQUE (tenant_id, project_task_id, project_item_id),
    CONSTRAINT project_task_requirement_quantity_chk CHECK (
        quantity_planned > 0
        AND quantity_reserved >= 0
        AND quantity_issued >= 0
        AND quantity_consumed >= 0
        AND quantity_returned >= 0
        AND quantity_consumed + quantity_returned <= quantity_issued
    ),
    CONSTRAINT project_task_requirement_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT project_task_requirement_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT project_task_requirement_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.budget_profile (
    id                       uuid                             NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                             NOT NULL,
    project_id               uuid                             NOT NULL,
    company_code_id          uuid                             NOT NULL,
    ledger_book_id           uuid                             NOT NULL,
    code                     text                             NOT NULL,
    name                     text                             NOT NULL,
    description              text,
    budget_type              document.budget_type_d           NOT NULL,
    version_number           integer                          NOT NULL DEFAULT 1,
    supersedes_profile_id    uuid,
    fiscal_year_from         smallint                         NOT NULL,
    fiscal_year_to           smallint                         NOT NULL,
    currency_code            character(3)                     NOT NULL,
    authorized_amount        numeric(18,4)                    NOT NULL,
    approved_at              timestamptz,
    approved_by              uuid,
    metadata                 jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    status                   document.budget_profile_status_d NOT NULL DEFAULT 'draft',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                      NOT NULL DEFAULT now(),
    created_by               uuid                             NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT budget_profile_pkey PRIMARY KEY (id),
    CONSTRAINT budget_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT budget_profile_project_id_uq UNIQUE (tenant_id, project_id, id),
    CONSTRAINT budget_profile_code_version_uq
        UNIQUE (tenant_id, project_id, ledger_book_id, code, version_number),
    CONSTRAINT budget_profile_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT budget_profile_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT budget_profile_version_chk CHECK (version_number >= 1),
    CONSTRAINT budget_profile_fiscal_range_chk CHECK (
        fiscal_year_from BETWEEN 1900 AND 9999
        AND fiscal_year_to BETWEEN fiscal_year_from AND 9999
    ),
    CONSTRAINT budget_profile_amount_chk CHECK (authorized_amount >= 0),
    CONSTRAINT budget_profile_approval_pair_chk
        CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT budget_profile_approval_status_chk CHECK (
        status NOT IN ('approved', 'active', 'closed')
        OR approved_at IS NOT NULL
    ),
    CONSTRAINT budget_profile_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT budget_profile_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT budget_profile_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.budget_allocation (
    id                     uuid                                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                                NOT NULL,
    budget_profile_id      uuid                                NOT NULL,
    project_id             uuid                                NOT NULL,
    project_wbs_id         uuid                                NOT NULL,
    fiscal_year            smallint                            NOT NULL,
    period_from            smallint                            NOT NULL DEFAULT 1,
    period_to              smallint                            NOT NULL DEFAULT 16,
    allocated_amount       numeric(18,4)                       NOT NULL,
    overspend_policy       document.overspend_policy_d         NOT NULL DEFAULT 'block',
    tolerance_pct          numeric(7,4)                        NOT NULL DEFAULT 0,
    requires_approval      boolean                             NOT NULL DEFAULT false,
    approval_threshold     numeric(18,4),
    metadata               jsonb                               NOT NULL DEFAULT '{}'::jsonb,
    status                 document.budget_allocation_status_d NOT NULL DEFAULT 'draft',
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz                         NOT NULL DEFAULT now(),
    created_by             uuid                                NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT budget_allocation_pkey PRIMARY KEY (id),
    CONSTRAINT budget_allocation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT budget_allocation_profile_id_uq
        UNIQUE (tenant_id, budget_profile_id, id),
    CONSTRAINT budget_allocation_coordinate_uq
        UNIQUE (tenant_id, budget_profile_id, project_wbs_id, fiscal_year, period_from, period_to),
    CONSTRAINT budget_allocation_fiscal_year_chk CHECK (fiscal_year BETWEEN 1900 AND 9999),
    CONSTRAINT budget_allocation_period_chk CHECK (
        period_from BETWEEN 1 AND 16 AND period_to BETWEEN period_from AND 16
    ),
    CONSTRAINT budget_allocation_amount_chk CHECK (allocated_amount >= 0),
    CONSTRAINT budget_allocation_tolerance_chk CHECK (tolerance_pct BETWEEN 0 AND 100),
    CONSTRAINT budget_allocation_approval_chk CHECK (
        (NOT requires_approval AND approval_threshold IS NULL)
        OR (requires_approval AND approval_threshold IS NOT NULL AND approval_threshold >= 0)
    ),
    CONSTRAINT budget_allocation_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT budget_allocation_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT budget_allocation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.budget_profile IS
  'Governed project budget version for one company, ledger book, fiscal range, and currency.';
COMMENT ON TABLE document.budget_allocation IS
  'Authorized WBS allocation. Reserved, consumed, released, and available balances are ledger-derived and intentionally absent.';
