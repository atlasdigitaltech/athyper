CREATE TABLE ledger.cross_book_posting_execution (
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,
    company_code_id                 uuid        NOT NULL,
    source_journal_entry_id         uuid        NOT NULL,
    cross_book_posting_policy_id    uuid        NOT NULL,
    posting_policy_effective_from   date        NOT NULL,
    target_journal_entry_id         uuid,
    idempotency_key                 text        NOT NULL,
    status                          ledger.cross_book_execution_status_d NOT NULL DEFAULT 'pending',
    attempt_count                   integer     NOT NULL DEFAULT 0,
    last_attempt_at                 timestamptz,
    completed_at                    timestamptz,
    error_code                      text,
    error_detail                    jsonb,
    evidence_payload                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    correlation_id                  uuid,
    status_changed_at               timestamptz,
    status_changed_by               uuid,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT cross_book_posting_execution_pkey PRIMARY KEY (id),
    CONSTRAINT cross_book_posting_execution_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cross_book_posting_execution_source_policy_uq
        UNIQUE (tenant_id, source_journal_entry_id, cross_book_posting_policy_id, posting_policy_effective_from),
    CONSTRAINT cross_book_posting_execution_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT cross_book_posting_execution_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT cross_book_posting_execution_attempt_chk CHECK (attempt_count >= 0),
    CONSTRAINT cross_book_posting_execution_json_chk CHECK (
        jsonb_typeof(evidence_payload) = 'object'
        AND (error_detail IS NULL OR jsonb_typeof(error_detail) = 'object')
    ),
    CONSTRAINT cross_book_posting_execution_target_chk CHECK (
        (status = 'succeeded' AND target_journal_entry_id IS NOT NULL)
        OR status <> 'succeeded'
    ),
    CONSTRAINT cross_book_posting_execution_error_chk CHECK (
        (status = 'failed' AND error_code IS NOT NULL)
        OR (status <> 'failed' AND error_code IS NULL AND error_detail IS NULL)
    ),
    CONSTRAINT cross_book_posting_execution_completion_chk CHECK (
        (status IN ('succeeded','failed','cancelled')) = (completed_at IS NOT NULL)
    ),
    CONSTRAINT cross_book_posting_execution_attempt_time_chk CHECK (
        last_attempt_at IS NULL OR last_attempt_at >= created_at
    ),
    CONSTRAINT cross_book_posting_execution_complete_time_chk CHECK (
        completed_at IS NULL OR (last_attempt_at IS NOT NULL AND completed_at >= last_attempt_at)
    ),
    CONSTRAINT cross_book_posting_execution_status_pair_chk CHECK (
        (status_changed_at IS NULL) = (status_changed_by IS NULL)
    ),
    CONSTRAINT cross_book_posting_execution_audit_pair_chk CHECK (
        (updated_at IS NULL) = (updated_by IS NULL)
    )
);

COMMENT ON TABLE ledger.cross_book_posting_execution IS
  'Durable Neon cross-book posting execution, idempotency, retry, outcome, and policy-revision evidence. Business audit events remain in audit.audit_log.';

CREATE TABLE ledger.gl_balance (
    id                       uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid          NOT NULL,
    company_code_id          uuid          NOT NULL,
    ledger_book_id           uuid          NOT NULL,
    fiscal_period_id         uuid          NOT NULL,
    gl_account_id            uuid          NOT NULL,
    currency_code            character(3)  NOT NULL,
    cost_center_id           uuid,
    profit_center_id         uuid,
    project_id               uuid,
    dimension_set_id         uuid,
    opening_debit            numeric(20,4) NOT NULL DEFAULT 0,
    opening_credit           numeric(20,4) NOT NULL DEFAULT 0,
    period_debit             numeric(20,4) NOT NULL DEFAULT 0,
    period_credit            numeric(20,4) NOT NULL DEFAULT 0,
    closing_debit            numeric(20,4) GENERATED ALWAYS AS (opening_debit + period_debit) STORED,
    closing_credit           numeric(20,4) GENERATED ALWAYS AS (opening_credit + period_credit) STORED,
    last_applied_sequence    bigint        NOT NULL,
    last_idempotency_key     text          NOT NULL,
    last_journal_entry_id    uuid,
    last_posted_at           timestamptz   NOT NULL,
    version_number           bigint        NOT NULL DEFAULT 1,
    created_at               timestamptz   NOT NULL DEFAULT now(),
    created_by               uuid          NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT gl_balance_pkey PRIMARY KEY (id),
    CONSTRAINT gl_balance_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT gl_balance_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, company_code_id, ledger_book_id, fiscal_period_id,
        gl_account_id, currency_code, cost_center_id, profit_center_id,
        project_id, dimension_set_id
    ),
    CONSTRAINT gl_balance_amount_chk CHECK (
        opening_debit >= 0 AND opening_credit >= 0
        AND period_debit >= 0 AND period_credit >= 0
    ),
    CONSTRAINT gl_balance_sequence_chk CHECK (last_applied_sequence >= 1),
    CONSTRAINT gl_balance_key_chk CHECK (btrim(last_idempotency_key) <> ''),
    CONSTRAINT gl_balance_version_chk CHECK (version_number >= 1),
    CONSTRAINT gl_balance_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE ledger.commitment_fulfillment (
    id                       uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid          NOT NULL,
    company_code_id          uuid          NOT NULL,
    commitment_id            uuid          NOT NULL,
    commitment_line_id       uuid          NOT NULL,
    fulfillment_type         ledger.fulfillment_type_d NOT NULL,
    fulfillment_date         date          NOT NULL,
    fiscal_period_id         uuid          NOT NULL,
    quantity                 numeric(20,6),
    uom_code                 text,
    amount                   numeric(20,4) NOT NULL,
    currency_code            character(3)  NOT NULL,
    base_amount              numeric(20,4) NOT NULL,
    base_currency_code       character(3)  NOT NULL,
    exchange_rate            numeric(20,10) NOT NULL,
    source_entity_type       text          NOT NULL,
    source_entity_id         uuid          NOT NULL,
    source_line_id           uuid,
    reverses_fulfillment_id  uuid,
    idempotency_key          text          NOT NULL,
    notes                    text,
    metadata                 jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz   NOT NULL DEFAULT now(),
    created_by               uuid          NOT NULL,
    CONSTRAINT commitment_fulfillment_pkey PRIMARY KEY (id),
    CONSTRAINT commitment_fulfillment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT commitment_fulfillment_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT commitment_fulfillment_amount_chk CHECK (amount <> 0 AND base_amount <> 0),
    CONSTRAINT commitment_fulfillment_quantity_chk CHECK (
        (quantity IS NULL) = (uom_code IS NULL) AND (quantity IS NULL OR quantity <> 0)
    ),
    CONSTRAINT commitment_fulfillment_fx_chk CHECK (
        exchange_rate > 0
        AND ((currency_code = base_currency_code AND exchange_rate = 1)
             OR currency_code <> base_currency_code)
    ),
    CONSTRAINT commitment_fulfillment_reversal_chk CHECK (
        (reverses_fulfillment_id IS NULL AND amount > 0 AND base_amount > 0)
        OR (reverses_fulfillment_id IS NOT NULL AND amount < 0 AND base_amount < 0)
    ),
    CONSTRAINT commitment_fulfillment_self_chk CHECK (reverses_fulfillment_id IS DISTINCT FROM id),
    CONSTRAINT commitment_fulfillment_source_chk CHECK (
        source_entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT commitment_fulfillment_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT commitment_fulfillment_json_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE ledger.inventory_movement (
    id                       uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid          NOT NULL,
    company_code_id          uuid          NOT NULL,
    item_id                  uuid          NOT NULL,
    warehouse_id             uuid          NOT NULL,
    movement_type            ledger.inventory_movement_type_d NOT NULL,
    valuation_method         ledger.inventory_valuation_method_d NOT NULL,
    quantity                 numeric(20,6) NOT NULL,
    uom_code                 text          NOT NULL,
    unit_cost                numeric(20,6) NOT NULL DEFAULT 0,
    inventory_value          numeric(20,4) NOT NULL,
    currency_code            character(3)  NOT NULL,
    lot_number               text,
    serial_number            text,
    source_entity_type       text          NOT NULL,
    source_entity_id         uuid          NOT NULL,
    source_line_id           uuid,
    source_warehouse_id      uuid,
    destination_warehouse_id uuid,
    reverses_movement_id     uuid,
    journal_entry_id         uuid,
    idempotency_key          text          NOT NULL,
    performed_at             timestamptz   NOT NULL,
    performed_by             uuid          NOT NULL,
    metadata                 jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz   NOT NULL DEFAULT now(),
    created_by               uuid          NOT NULL,
    CONSTRAINT inventory_movement_pkey PRIMARY KEY (id),
    CONSTRAINT inventory_movement_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT inventory_movement_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT inventory_movement_quantity_chk CHECK (quantity <> 0),
    CONSTRAINT inventory_movement_cost_chk CHECK (unit_cost >= 0),
    CONSTRAINT inventory_movement_value_sign_chk CHECK (
        inventory_value = 0 OR sign(inventory_value) = sign(quantity)
    ),
    CONSTRAINT inventory_movement_type_sign_chk CHECK (
        (movement_type IN ('receipt','transfer_in','return','opening_balance','reversal_in') AND quantity > 0)
        OR (movement_type IN ('sales_issue','production_issue','transfer_out','scrap','reversal_out') AND quantity < 0)
        OR movement_type = 'adjustment'
    ),
    CONSTRAINT inventory_movement_transfer_chk CHECK (
        (movement_type NOT IN ('transfer_in','transfer_out')
         AND source_warehouse_id IS NULL AND destination_warehouse_id IS NULL)
        OR (movement_type IN ('transfer_in','transfer_out')
            AND source_warehouse_id IS NOT NULL AND destination_warehouse_id IS NOT NULL
            AND source_warehouse_id IS DISTINCT FROM destination_warehouse_id)
    ),
    CONSTRAINT inventory_movement_reversal_chk CHECK (
        (movement_type NOT IN ('reversal_in','reversal_out') AND reverses_movement_id IS NULL)
        OR (movement_type IN ('reversal_in','reversal_out') AND reverses_movement_id IS NOT NULL)
    ),
    CONSTRAINT inventory_movement_self_chk CHECK (reverses_movement_id IS DISTINCT FROM id),
    CONSTRAINT inventory_movement_source_chk CHECK (source_entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT inventory_movement_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT inventory_movement_lot_chk CHECK (lot_number IS NULL OR btrim(lot_number) <> ''),
    CONSTRAINT inventory_movement_serial_chk CHECK (serial_number IS NULL OR btrim(serial_number) <> ''),
    CONSTRAINT inventory_movement_json_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE ledger.inventory_balance (
    id                       uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid          NOT NULL,
    company_code_id          uuid          NOT NULL,
    item_id                  uuid          NOT NULL,
    warehouse_id             uuid          NOT NULL,
    lot_number               text,
    serial_number            text,
    quantity_on_hand         numeric(20,6) NOT NULL DEFAULT 0,
    inventory_value          numeric(20,4) NOT NULL DEFAULT 0,
    average_unit_cost        numeric(20,6) GENERATED ALWAYS AS (
        CASE WHEN quantity_on_hand = 0 THEN 0
             ELSE abs(inventory_value / quantity_on_hand) END
    ) STORED,
    currency_code            character(3)  NOT NULL,
    last_movement_id         uuid          NOT NULL,
    last_movement_at         timestamptz   NOT NULL,
    last_applied_sequence    bigint        NOT NULL,
    last_idempotency_key     text          NOT NULL,
    version_number           bigint        NOT NULL DEFAULT 1,
    created_at               timestamptz   NOT NULL DEFAULT now(),
    created_by               uuid          NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT inventory_balance_pkey PRIMARY KEY (id),
    CONSTRAINT inventory_balance_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT inventory_balance_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, company_code_id, item_id, warehouse_id, lot_number, serial_number
    ),
    CONSTRAINT inventory_balance_value_chk CHECK (
        quantity_on_hand <> 0 OR inventory_value = 0
    ),
    CONSTRAINT inventory_balance_sequence_chk CHECK (last_applied_sequence >= 1),
    CONSTRAINT inventory_balance_key_chk CHECK (btrim(last_idempotency_key) <> ''),
    CONSTRAINT inventory_balance_version_chk CHECK (version_number >= 1),
    CONSTRAINT inventory_balance_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE ledger.inventory_valuation_layer (
    id                            uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                     uuid          NOT NULL,
    company_code_id               uuid          NOT NULL,
    item_id                       uuid          NOT NULL,
    warehouse_id                  uuid          NOT NULL,
    valuation_method              ledger.inventory_layer_method_d NOT NULL,
    receipt_movement_id           uuid          NOT NULL,
    layer_date                    date          NOT NULL,
    original_quantity             numeric(20,6) NOT NULL,
    remaining_quantity            numeric(20,6) NOT NULL,
    consumed_quantity             numeric(20,6) GENERATED ALWAYS AS (original_quantity - remaining_quantity) STORED,
    original_value                numeric(20,4) NOT NULL,
    remaining_value               numeric(20,4) NOT NULL,
    consumed_value                numeric(20,4) GENERATED ALWAYS AS (original_value - remaining_value) STORED,
    currency_code                 character(3)  NOT NULL,
    lot_number                    text,
    serial_number                 text,
    last_consumption_movement_id  uuid,
    last_consumed_at              timestamptz,
    version_number                bigint        NOT NULL DEFAULT 1,
    created_at                    timestamptz   NOT NULL DEFAULT now(),
    created_by                    uuid          NOT NULL,
    updated_at                    timestamptz,
    updated_by                    uuid,
    CONSTRAINT inventory_valuation_layer_pkey PRIMARY KEY (id),
    CONSTRAINT inventory_valuation_layer_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT inventory_valuation_layer_receipt_uq UNIQUE (tenant_id, receipt_movement_id),
    CONSTRAINT inventory_valuation_layer_quantity_chk CHECK (
        original_quantity > 0 AND remaining_quantity >= 0
        AND remaining_quantity <= original_quantity
    ),
    CONSTRAINT inventory_valuation_layer_value_chk CHECK (
        original_value >= 0 AND remaining_value >= 0 AND remaining_value <= original_value
    ),
    CONSTRAINT inventory_valuation_layer_consumption_pair_chk CHECK (
        (last_consumption_movement_id IS NULL) = (last_consumed_at IS NULL)
    ),
    CONSTRAINT inventory_valuation_layer_version_chk CHECK (version_number >= 1),
    CONSTRAINT inventory_valuation_layer_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE ledger.tax_calculation (
    id                          uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid          NOT NULL,
    company_code_id             uuid          NOT NULL,
    ledger_book_id              uuid          NOT NULL,
    fiscal_period_id            uuid          NOT NULL,
    source_entity_type          text          NOT NULL,
    source_entity_id            uuid          NOT NULL,
    source_line_id              uuid,
    jurisdiction_id             uuid          NOT NULL,
    tax_type_id                 uuid          NOT NULL,
    tax_group_id                uuid,
    tax_rate_schedule_id        uuid,
    component_code              text,
    tax_direction               ledger.tax_direction_d NOT NULL,
    tax_treatment               ledger.tax_treatment_d NOT NULL,
    rate_kind                   ledger.tax_rate_kind_d NOT NULL,
    rate_value                  numeric(20,8) NOT NULL,
    calculation_basis_code      text          NOT NULL,
    taxable_base_amount         numeric(20,4) NOT NULL,
    tax_amount                  numeric(20,4) NOT NULL,
    rounding_adjustment         numeric(20,4) NOT NULL DEFAULT 0,
    recoverability              ledger.tax_recoverability_d NOT NULL DEFAULT 'none',
    recoverable_amount          numeric(20,4) NOT NULL DEFAULT 0,
    nonrecoverable_amount       numeric(20,4) NOT NULL DEFAULT 0,
    currency_code               character(3)  NOT NULL,
    base_currency_amount        numeric(20,4) NOT NULL,
    exchange_rate               numeric(20,10) NOT NULL,
    rule_snapshot               jsonb         NOT NULL,
    rate_snapshot               jsonb         NOT NULL,
    basis_snapshot              jsonb         NOT NULL,
    evidence_hash               text          NOT NULL,
    journal_entry_id            uuid,
    journal_line_id             uuid,
    reverses_calculation_id     uuid,
    idempotency_key             text          NOT NULL,
    posted_at                   timestamptz   NOT NULL,
    posted_by                   uuid          NOT NULL,
    created_at                  timestamptz   NOT NULL DEFAULT now(),
    created_by                  uuid          NOT NULL,
    CONSTRAINT tax_calculation_pkey PRIMARY KEY (id),
    CONSTRAINT tax_calculation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_calculation_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT tax_calculation_rate_chk CHECK (rate_value >= 0 AND exchange_rate > 0),
    CONSTRAINT tax_calculation_amount_chk CHECK (
        taxable_base_amount <> 0 AND tax_amount <> 0
        AND recoverable_amount >= 0 AND nonrecoverable_amount >= 0
        AND recoverable_amount + nonrecoverable_amount <= abs(tax_amount + rounding_adjustment)
    ),
    CONSTRAINT tax_calculation_reversal_chk CHECK (
        (reverses_calculation_id IS NULL AND taxable_base_amount > 0)
        OR (reverses_calculation_id IS NOT NULL AND taxable_base_amount < 0)
    ),
    CONSTRAINT tax_calculation_self_chk CHECK (reverses_calculation_id IS DISTINCT FROM id),
    CONSTRAINT tax_calculation_source_chk CHECK (source_entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT tax_calculation_basis_chk CHECK (calculation_basis_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT tax_calculation_evidence_chk CHECK (
        jsonb_typeof(rule_snapshot) = 'object'
        AND jsonb_typeof(rate_snapshot) = 'object'
        AND jsonb_typeof(basis_snapshot) = 'object'
        AND evidence_hash ~ '^[a-f0-9]{64}$'
        AND evidence_hash = encode(
            digest(
                convert_to(
                    rule_snapshot::text || '|' || rate_snapshot::text || '|' || basis_snapshot::text,
                    'UTF8'
                ),
                'sha256'
            ),
            'hex'
        )
    ),
    CONSTRAINT tax_calculation_key_chk CHECK (btrim(idempotency_key) <> '')
);

CREATE TABLE ledger.tax_credit_movement (
    id                          uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid          NOT NULL,
    company_code_id             uuid          NOT NULL,
    ledger_book_id              uuid          NOT NULL,
    fiscal_period_id            uuid          NOT NULL,
    jurisdiction_id             uuid          NOT NULL,
    tax_type_id                 uuid          NOT NULL,
    tax_bucket                  ledger.tax_credit_bucket_d NOT NULL,
    movement_type               ledger.tax_credit_movement_type_d NOT NULL,
    amount                      numeric(20,4) NOT NULL,
    currency_code               character(3)  NOT NULL,
    source_tax_calculation_id   uuid,
    reverses_movement_id        uuid,
    idempotency_key             text          NOT NULL,
    reason                      text,
    created_at                  timestamptz   NOT NULL DEFAULT now(),
    created_by                  uuid          NOT NULL,
    CONSTRAINT tax_credit_movement_pkey PRIMARY KEY (id),
    CONSTRAINT tax_credit_movement_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tax_credit_movement_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT tax_credit_movement_amount_chk CHECK (amount <> 0),
    CONSTRAINT tax_credit_movement_reversal_chk CHECK (
        (movement_type <> 'reversal' AND reverses_movement_id IS NULL)
        OR (movement_type = 'reversal' AND reverses_movement_id IS NOT NULL)
    ),
    CONSTRAINT tax_credit_movement_self_chk CHECK (reverses_movement_id IS DISTINCT FROM id),
    CONSTRAINT tax_credit_movement_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT tax_credit_movement_reason_chk CHECK (reason IS NULL OR btrim(reason) <> '')
);

CREATE TABLE ledger.asset_revaluation_reserve (
    id                          uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid          NOT NULL,
    company_code_id             uuid          NOT NULL,
    ledger_book_id              uuid          NOT NULL,
    fiscal_period_id            uuid          NOT NULL,
    asset_id                    uuid          NOT NULL,
    asset_book_id               uuid          NOT NULL,
    reserve_type                ledger.asset_reserve_type_d NOT NULL,
    movement_amount             numeric(20,4) NOT NULL,
    currency_code               character(3)  NOT NULL,
    effective_date              date          NOT NULL,
    carrying_amount_before      numeric(20,4) NOT NULL,
    carrying_amount_after       numeric(20,4) NOT NULL,
    fair_value                  numeric(20,4),
    recoverable_amount          numeric(20,4),
    valuation_method            text,
    appraiser_reference         text,
    source_entity_type          text          NOT NULL,
    source_entity_id            uuid          NOT NULL,
    journal_entry_id            uuid,
    reverses_reserve_id         uuid,
    idempotency_key             text          NOT NULL,
    notes                       text,
    posted_at                   timestamptz   NOT NULL,
    posted_by                   uuid          NOT NULL,
    created_at                  timestamptz   NOT NULL DEFAULT now(),
    created_by                  uuid          NOT NULL,
    CONSTRAINT asset_revaluation_reserve_pkey PRIMARY KEY (id),
    CONSTRAINT asset_revaluation_reserve_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT asset_revaluation_reserve_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT asset_revaluation_reserve_amount_chk CHECK (movement_amount <> 0),
    CONSTRAINT asset_revaluation_reserve_carrying_chk CHECK (
        carrying_amount_before >= 0 AND carrying_amount_after >= 0
        AND (fair_value IS NULL OR fair_value >= 0)
    ),
    CONSTRAINT asset_revaluation_reserve_recoverable_chk CHECK (
        recoverable_amount IS NULL OR recoverable_amount >= 0
    ),
    CONSTRAINT asset_revaluation_reserve_reversal_chk CHECK (
        reserve_type NOT IN ('impairment_reversal','disposal_release')
        OR reverses_reserve_id IS NOT NULL
    ),
    CONSTRAINT asset_revaluation_reserve_self_chk CHECK (reverses_reserve_id IS DISTINCT FROM id),
    CONSTRAINT asset_revaluation_reserve_source_chk CHECK (source_entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT asset_revaluation_reserve_key_chk CHECK (btrim(idempotency_key) <> '')
);

CREATE TABLE ledger.fx_revaluation_line (
    id                          uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid          NOT NULL,
    run_id                      uuid          NOT NULL,
    line_no                     integer       NOT NULL,
    company_code_id             uuid          NOT NULL,
    ledger_book_id              uuid          NOT NULL,
    fiscal_period_id            uuid          NOT NULL,
    gl_account_id               uuid          NOT NULL,
    transaction_currency_code   character(3)  NOT NULL,
    functional_currency_code    character(3)  NOT NULL,
    balance_type                ledger.fx_balance_type_d NOT NULL,
    source_entity_type          text          NOT NULL,
    source_entity_id            uuid          NOT NULL,
    source_line_id              uuid,
    business_partner_id         uuid,
    original_currency_balance   numeric(20,4) NOT NULL,
    original_functional_balance numeric(20,4) NOT NULL,
    original_rate               numeric(20,10) NOT NULL,
    closing_rate                numeric(20,10) NOT NULL,
    revalued_functional_balance numeric(20,4) NOT NULL,
    unrealized_gain_loss        numeric(20,4) GENERATED ALWAYS AS (
        revalued_functional_balance - original_functional_balance
    ) STORED,
    cost_center_id              uuid,
    profit_center_id            uuid,
    project_id                  uuid,
    dimension_set_id            uuid,
    journal_entry_id            uuid,
    idempotency_key             text          NOT NULL,
    created_at                  timestamptz   NOT NULL DEFAULT now(),
    created_by                  uuid          NOT NULL,
    CONSTRAINT fx_revaluation_line_pkey PRIMARY KEY (id),
    CONSTRAINT fx_revaluation_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fx_revaluation_line_run_line_uq UNIQUE (tenant_id, run_id, line_no),
    CONSTRAINT fx_revaluation_line_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fx_revaluation_line_line_chk CHECK (line_no > 0),
    CONSTRAINT fx_revaluation_line_rate_chk CHECK (original_rate > 0 AND closing_rate > 0),
    CONSTRAINT fx_revaluation_line_currency_chk CHECK (
        transaction_currency_code <> functional_currency_code
    ),
    CONSTRAINT fx_revaluation_line_source_chk CHECK (source_entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT fx_revaluation_line_key_chk CHECK (btrim(idempotency_key) <> '')
);

CREATE TABLE ledger.ic_elimination_line (
    id                           uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                    uuid          NOT NULL,
    elimination_id              uuid          NOT NULL,
    line_no                      integer       NOT NULL,
    elimination_type            ledger.ic_elimination_type_d NOT NULL,
    consolidation_company_id     uuid          NOT NULL,
    source_company_code_id       uuid          NOT NULL,
    counterparty_company_code_id uuid          NOT NULL,
    ledger_book_id               uuid          NOT NULL,
    fiscal_period_id             uuid          NOT NULL,
    gl_account_id                uuid          NOT NULL,
    currency_code                character(3)  NOT NULL,
    functional_currency_code     character(3)  NOT NULL,
    debit_amount                 numeric(20,4) NOT NULL DEFAULT 0,
    credit_amount                numeric(20,4) NOT NULL DEFAULT 0,
    functional_debit             numeric(20,4) NOT NULL DEFAULT 0,
    functional_credit            numeric(20,4) NOT NULL DEFAULT 0,
    cost_center_id               uuid,
    profit_center_id             uuid,
    project_id                   uuid,
    site_id                      uuid,
    dimension_set_id             uuid,
    journal_entry_id             uuid,
    idempotency_key              text          NOT NULL,
    description                  text,
    created_at                   timestamptz   NOT NULL DEFAULT now(),
    created_by                   uuid          NOT NULL,
    CONSTRAINT ic_elimination_line_pkey PRIMARY KEY (id),
    CONSTRAINT ic_elimination_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT ic_elimination_line_group_line_uq UNIQUE (tenant_id, elimination_id, line_no),
    CONSTRAINT ic_elimination_line_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT ic_elimination_line_company_chk CHECK (
        source_company_code_id IS DISTINCT FROM counterparty_company_code_id
    ),
    CONSTRAINT ic_elimination_line_line_chk CHECK (line_no > 0),
    CONSTRAINT ic_elimination_line_polarity_chk CHECK (
        (debit_amount > 0 AND credit_amount = 0)
        OR (debit_amount = 0 AND credit_amount > 0)
    ),
    CONSTRAINT ic_elimination_line_functional_polarity_chk CHECK (
        (functional_debit > 0 AND functional_credit = 0)
        OR (functional_debit = 0 AND functional_credit > 0)
    ),
    CONSTRAINT ic_elimination_line_side_chk CHECK (
        (debit_amount > 0) = (functional_debit > 0)
    ),
    CONSTRAINT ic_elimination_line_key_chk CHECK (btrim(idempotency_key) <> '')
);

COMMENT ON TABLE ledger.gl_balance IS
  'Mutable fiscal-period GL projection. Monotonic application sequence and idempotency key guard replay.';
COMMENT ON TABLE ledger.commitment_fulfillment IS
  'Append-only quantity and amount drawdown evidence against a specific commitment line.';
COMMENT ON TABLE ledger.inventory_movement IS
  'Append-only signed inventory movement evidence linked to the authoritative tenant warehouse master.';
COMMENT ON TABLE ledger.inventory_balance IS
  'Mutable inventory projection; quantity and inventory value are independent authoritative measures.';
COMMENT ON TABLE ledger.inventory_valuation_layer IS
  'Controlled layer projection for FIFO, LIFO and specific-identification only.';
COMMENT ON TABLE ledger.tax_calculation IS
  'Append-only posted tax evidence with frozen rule, rate and basis snapshots.';
COMMENT ON TABLE ledger.tax_credit_movement IS
  'Append-only normalized tax movement: exactly one tax bucket and one amount per row.';
COMMENT ON TABLE ledger.asset_revaluation_reserve IS
  'Append-only reserve movement evidence; running balance is deliberately excluded.';
COMMENT ON TABLE ledger.fx_revaluation_line IS
  'Append-only FX revaluation result with explicit company, book, period and account identity.';
COMMENT ON TABLE ledger.ic_elimination_line IS
  'Append-only intercompany elimination lines; group consistency and balance are deferred until transaction commit.';
