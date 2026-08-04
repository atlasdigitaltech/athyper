CREATE TABLE master.project (
    id                       uuid                    NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                    NOT NULL,
    company_code_id          uuid                    NOT NULL,
    customer_id              uuid,
    code                     text                    NOT NULL,
    name                     text                    NOT NULL,
    description              text,
    project_type             master.project_type_d   NOT NULL,
    responsible_principal_id uuid,
    default_cost_center_id   uuid,
    currency_code            character(3)            NOT NULL,
    planned_start            date,
    planned_end              date,
    actual_start             date,
    actual_end               date,
    metadata                 jsonb                   NOT NULL DEFAULT '{}'::jsonb,
    status                   master.project_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz             NOT NULL DEFAULT now(),
    created_by               uuid                    NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT project_pkey PRIMARY KEY (id),
    CONSTRAINT project_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_company_id_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT project_company_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT project_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT project_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT project_description_chk CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT project_planned_range_chk CHECK (
        planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start
    ),
    CONSTRAINT project_actual_range_chk CHECK (
        actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start
    ),
    CONSTRAINT project_completion_chk CHECK (
        status NOT IN ('completed', 'closed')
        OR (actual_start IS NOT NULL AND actual_end IS NOT NULL)
    ),
    CONSTRAINT project_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT project_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT project_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.project_wbs (
    id                       uuid                      NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                      NOT NULL,
    project_id               uuid                      NOT NULL,
    parent_wbs_id            uuid,
    wbs_code                 text                      NOT NULL,
    name                     text                      NOT NULL,
    description              text,
    wbs_type                 master.project_wbs_type_d NOT NULL,
    level_no                 smallint                  NOT NULL DEFAULT 1,
    is_postable              boolean                   NOT NULL DEFAULT false,
    responsible_principal_id uuid,
    default_cost_center_id   uuid,
    planned_start            date,
    planned_end              date,
    sort_order               integer                   NOT NULL DEFAULT 0,
    metadata                 jsonb                     NOT NULL DEFAULT '{}'::jsonb,
    status                   master.project_record_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz               NOT NULL DEFAULT now(),
    created_by               uuid                      NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT project_wbs_pkey PRIMARY KEY (id),
    CONSTRAINT project_wbs_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_wbs_project_id_uq UNIQUE (tenant_id, project_id, id),
    CONSTRAINT project_wbs_code_uq UNIQUE (tenant_id, project_id, wbs_code),
    CONSTRAINT project_wbs_code_fmt_chk CHECK (wbs_code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,126}$'),
    CONSTRAINT project_wbs_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT project_wbs_no_self_parent_chk CHECK (parent_wbs_id IS NULL OR parent_wbs_id <> id),
    CONSTRAINT project_wbs_level_chk CHECK (level_no >= 1),
    CONSTRAINT project_wbs_postable_chk CHECK (
        NOT is_postable OR wbs_type IN ('control_account', 'work_package')
    ),
    CONSTRAINT project_wbs_range_chk CHECK (
        planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start
    ),
    CONSTRAINT project_wbs_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT project_wbs_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT project_wbs_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.project_item (
    id                  uuid                       NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                       NOT NULL,
    project_id          uuid                       NOT NULL,
    project_wbs_id      uuid,
    item_id             uuid,
    code                text                       NOT NULL,
    name                text                       NOT NULL,
    description         text,
    item_type           master.project_item_type_d NOT NULL,
    uom_code            text                       NOT NULL,
    planned_quantity    numeric(18,6),
    estimated_unit_cost numeric(18,6),
    currency_code       character(3),
    metadata            jsonb                      NOT NULL DEFAULT '{}'::jsonb,
    status              master.project_record_status_d NOT NULL DEFAULT 'draft',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                NOT NULL DEFAULT now(),
    created_by          uuid                       NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT project_item_pkey PRIMARY KEY (id),
    CONSTRAINT project_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_item_project_id_uq UNIQUE (tenant_id, project_id, id),
    CONSTRAINT project_item_code_uq UNIQUE (tenant_id, project_id, code),
    CONSTRAINT project_item_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT project_item_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT project_item_quantity_chk CHECK (
        planned_quantity IS NULL OR planned_quantity > 0
    ),
    CONSTRAINT project_item_cost_chk CHECK (
        (estimated_unit_cost IS NULL AND currency_code IS NULL)
        OR (estimated_unit_cost IS NOT NULL AND estimated_unit_cost >= 0 AND currency_code IS NOT NULL)
    ),
    CONSTRAINT project_item_catalog_kind_chk CHECK (
        item_id IS NULL OR item_type IN ('material', 'service', 'asset')
    ),
    CONSTRAINT project_item_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT project_item_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT project_item_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.project IS
  'Company-specific accounting/project identity. WBS owns hierarchy; budgets and ledger own financial amounts.';
COMMENT ON TABLE master.project_wbs IS
  'Project financial and scope hierarchy. Only postable control-account/work-package rows may be used by accounting.';
COMMENT ON TABLE master.project_item IS
  'Project requirement catalog. Work execution and quantities consumed belong to document.project_task_requirement.';
