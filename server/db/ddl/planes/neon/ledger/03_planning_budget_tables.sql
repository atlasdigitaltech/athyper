CREATE TABLE ledger.budget_transaction (
    id                   uuid                             NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                             NOT NULL,
    budget_profile_id    uuid                             NOT NULL,
    budget_allocation_id uuid                             NOT NULL,
    project_id           uuid                             NOT NULL,
    project_wbs_id       uuid                             NOT NULL,
    transaction_type     ledger.budget_transaction_type_d NOT NULL,
    direction            ledger.budget_direction_d        NOT NULL,
    amount               numeric(18,4)                    NOT NULL,
    currency_code        character(3)                     NOT NULL,
    fiscal_year          smallint                         NOT NULL,
    period_number        smallint                         NOT NULL,
    effective_date       date                             NOT NULL,
    source_document_type text                             NOT NULL,
    source_document_id   uuid                             NOT NULL,
    idempotency_key      text                             NOT NULL,
    previous_state       jsonb                            NOT NULL,
    resulting_state      jsonb                            NOT NULL,
    reason               text,
    performed_at         timestamptz                      NOT NULL DEFAULT now(),
    performed_by         uuid                             NOT NULL,
    metadata             jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz                      NOT NULL DEFAULT now(),
    created_by           uuid                             NOT NULL,

    CONSTRAINT budget_transaction_pkey PRIMARY KEY (id),
    CONSTRAINT budget_transaction_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT budget_transaction_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT budget_transaction_amount_chk CHECK (amount > 0),
    CONSTRAINT budget_transaction_fiscal_year_chk CHECK (fiscal_year BETWEEN 1900 AND 9999),
    CONSTRAINT budget_transaction_period_chk CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT budget_transaction_source_type_chk CHECK (btrim(source_document_type) <> ''),
    CONSTRAINT budget_transaction_idempotency_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT budget_transaction_state_chk CHECK (
        jsonb_typeof(previous_state) = 'object'
        AND jsonb_typeof(resulting_state) = 'object'
    ),
    CONSTRAINT budget_transaction_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE ledger.budget_balance (
    id                   uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid          NOT NULL,
    budget_allocation_id uuid          NOT NULL,
    fiscal_year          smallint      NOT NULL,
    period_number        smallint      NOT NULL,
    opening_amount       numeric(18,4) NOT NULL DEFAULT 0,
    reserved_amount      numeric(18,4) NOT NULL DEFAULT 0,
    consumed_amount      numeric(18,4) NOT NULL DEFAULT 0,
    released_amount      numeric(18,4) NOT NULL DEFAULT 0,
    adjusted_amount      numeric(18,4) NOT NULL DEFAULT 0,
    available_amount     numeric(18,4) GENERATED ALWAYS AS (
        opening_amount - reserved_amount - consumed_amount
        + released_amount + adjusted_amount
    ) STORED,
    version_number       integer       NOT NULL DEFAULT 1,
    created_at           timestamptz   NOT NULL DEFAULT now(),
    created_by           uuid          NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT budget_balance_pkey PRIMARY KEY (id),
    CONSTRAINT budget_balance_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT budget_balance_period_uq
        UNIQUE (tenant_id, budget_allocation_id, fiscal_year, period_number),
    CONSTRAINT budget_balance_fiscal_year_chk CHECK (fiscal_year BETWEEN 1900 AND 9999),
    CONSTRAINT budget_balance_period_chk CHECK (period_number BETWEEN 0 AND 16),
    CONSTRAINT budget_balance_amount_chk CHECK (
        opening_amount >= 0
        AND reserved_amount >= 0
        AND consumed_amount >= 0
        AND released_amount >= 0
    ),
    CONSTRAINT budget_balance_version_chk CHECK (version_number >= 1),
    CONSTRAINT budget_balance_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE ledger.planning_run (
    id                   uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                         NOT NULL,
    planning_model_id    uuid                         NOT NULL,
    planning_scenario_id uuid                         NOT NULL,
    company_code_id      uuid                         NOT NULL,
    ledger_book_id       uuid                         NOT NULL,
    model_version_number integer                      NOT NULL,
    input_hash           text                         NOT NULL,
    correlation_id       uuid,
    started_at           timestamptz,
    completed_at         timestamptz,
    approved_at          timestamptz,
    approved_by          uuid,
    error_message        text,
    metadata             jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status               ledger.planning_run_status_d NOT NULL DEFAULT 'pending',
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                  NOT NULL DEFAULT now(),
    created_by           uuid                         NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT planning_run_pkey PRIMARY KEY (id),
    CONSTRAINT planning_run_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_run_model_id_uq UNIQUE (tenant_id, planning_model_id, id),
    CONSTRAINT planning_run_version_chk CHECK (model_version_number >= 1),
    CONSTRAINT planning_run_hash_chk CHECK (input_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT planning_run_range_chk CHECK (
        completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at
    ),
    CONSTRAINT planning_run_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT planning_run_status_contract_chk CHECK (
        (status NOT IN ('completed', 'approved') OR completed_at IS NOT NULL)
        AND (status <> 'approved' OR approved_at IS NOT NULL)
        AND (status <> 'failed' OR error_message IS NOT NULL)
    ),
    CONSTRAINT planning_run_error_chk CHECK (error_message IS NULL OR btrim(error_message) <> ''),
    CONSTRAINT planning_run_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT planning_run_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT planning_run_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE ledger.planning_output (
    id                 uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid          NOT NULL,
    planning_run_id    uuid          NOT NULL,
    planning_model_id  uuid          NOT NULL,
    planning_driver_id uuid,
    ledger_book_id     uuid          NOT NULL,
    gl_account_id      uuid,
    cost_center_id     uuid,
    profit_center_id   uuid,
    project_id         uuid,
    project_wbs_id     uuid,
    fiscal_year        smallint      NOT NULL,
    period_number      smallint      NOT NULL,
    currency_code      character(3)  NOT NULL,
    planned_amount     numeric(18,4) NOT NULL,
    baseline_amount    numeric(18,4),
    variance_amount    numeric(18,4) GENERATED ALWAYS AS (
        planned_amount - COALESCE(baseline_amount, 0)
    ) STORED,
    driver_values      jsonb         NOT NULL DEFAULT '{}'::jsonb,
    metadata           jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    created_by         uuid          NOT NULL,

    CONSTRAINT planning_output_pkey PRIMARY KEY (id),
    CONSTRAINT planning_output_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_output_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, planning_run_id, planning_driver_id, ledger_book_id,
        gl_account_id, cost_center_id, profit_center_id,
        project_id, project_wbs_id, fiscal_year, period_number
    ),
    CONSTRAINT planning_output_fiscal_year_chk CHECK (fiscal_year BETWEEN 1900 AND 9999),
    CONSTRAINT planning_output_period_chk CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT planning_output_wbs_project_chk CHECK (
        project_wbs_id IS NULL OR project_id IS NOT NULL
    ),
    CONSTRAINT planning_output_driver_values_chk CHECK (jsonb_typeof(driver_values) = 'object'),
    CONSTRAINT planning_output_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE ledger.budget_transaction IS
  'Append-only budget movement evidence. Budget allocation balances are projections of this ledger.';
COMMENT ON TABLE ledger.budget_balance IS
  'Concurrency-safe period balance projection derived from ledger.budget_transaction.';
COMMENT ON TABLE ledger.planning_run IS
  'Planning calculation and approval header preserving model version and input hash.';
COMMENT ON TABLE ledger.planning_output IS
  'Immutable dimensional planning result for one planning run; recalculation creates a new run.';
