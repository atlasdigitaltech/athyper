CREATE TABLE document.planning_scenario (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    planning_model_id     uuid        NOT NULL,
    code                  text        NOT NULL,
    version_no            integer     NOT NULL DEFAULT 1,
    name                  text        NOT NULL,
    description           text,
    based_on_scenario_id  uuid,
    probability_weight    numeric(7,6) NOT NULL DEFAULT 1,
    approved_at           timestamptz,
    approved_by           uuid,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                document.planning_scenario_status_d NOT NULL DEFAULT 'draft',
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT planning_scenario_pkey PRIMARY KEY (id),
    CONSTRAINT planning_scenario_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_scenario_model_id_uq UNIQUE (tenant_id, planning_model_id, id),
    CONSTRAINT planning_scenario_code_version_uq
        UNIQUE (tenant_id, planning_model_id, code, version_no),
    CONSTRAINT planning_scenario_code_chk
        CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT planning_scenario_version_chk CHECK (version_no > 0),
    CONSTRAINT planning_scenario_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT planning_scenario_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT planning_scenario_probability_chk
        CHECK (probability_weight BETWEEN 0 AND 1),
    CONSTRAINT planning_scenario_not_self_based_chk
        CHECK (based_on_scenario_id IS NULL OR based_on_scenario_id <> id),
    CONSTRAINT planning_scenario_approval_pair_chk
        CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT planning_scenario_approval_status_chk
        CHECK (status NOT IN ('approved', 'superseded') OR approved_at IS NOT NULL),
    CONSTRAINT planning_scenario_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT planning_scenario_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT planning_scenario_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.planning_scenario_line (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    planning_scenario_id  uuid        NOT NULL,
    planning_model_id     uuid        NOT NULL,
    line_no               integer     NOT NULL,
    planning_driver_id    uuid,
    gl_account_id         uuid,
    cost_center_id        uuid,
    profit_center_id      uuid,
    project_id            uuid,
    project_wbs_id        uuid,
    fiscal_year           smallint    NOT NULL,
    period_number         smallint    NOT NULL,
    currency_code         character(3) NOT NULL,
    planned_amount        numeric(18,4) NOT NULL,
    baseline_amount       numeric(18,4),
    source_type           document.planning_line_source_d NOT NULL DEFAULT 'manual',
    source_reference_id   uuid,
    confidence            numeric(7,6) NOT NULL DEFAULT 1,
    description           text,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT planning_scenario_line_pkey PRIMARY KEY (id),
    CONSTRAINT planning_scenario_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_scenario_line_number_uq
        UNIQUE (tenant_id, planning_scenario_id, line_no),
    CONSTRAINT planning_scenario_line_number_chk CHECK (line_no > 0),
    CONSTRAINT planning_scenario_line_fiscal_year_chk
        CHECK (fiscal_year BETWEEN 1900 AND 9999),
    CONSTRAINT planning_scenario_line_period_chk CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT planning_scenario_line_wbs_chk
        CHECK (project_wbs_id IS NULL OR project_id IS NOT NULL),
    CONSTRAINT planning_scenario_line_source_chk CHECK (
        source_type <> 'driver' OR planning_driver_id IS NOT NULL
    ),
    CONSTRAINT planning_scenario_line_confidence_chk CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT planning_scenario_line_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT planning_scenario_line_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT planning_scenario_line_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.planning_scenario IS
  'Editable and versioned planning document. Approval freezes its normalized period lines; calculation results are written to ledger.planning_output.';

COMMENT ON TABLE document.planning_scenario_line IS
  'One planning input coordinate for one fiscal period. Replaces legacy control.forecast_line and its period_amounts JSON.';
