CREATE TABLE document.bank_statement (
    id                  uuid                                   NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                                   NOT NULL,
    company_code_id     uuid                                   NOT NULL,
    bank_account_id     uuid                                   NOT NULL,
    statement_ref       text,
    period_start_date   date                                   NOT NULL,
    period_end_date     date                                   NOT NULL,
    opening_balance     numeric(20,4)                           NOT NULL,
    closing_balance     numeric(20,4)                           NOT NULL,
    currency_code       character(3)                           NOT NULL,
    source_format       document.bank_statement_source_format_d NOT NULL,
    source_hash         text,
    signed_off_at       timestamptz,
    signed_off_by       uuid,
    notes               text,
    metadata            jsonb                                  NOT NULL DEFAULT '{}'::jsonb,
    status              document.bank_statement_status_d       NOT NULL DEFAULT 'imported',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                            NOT NULL DEFAULT now(),
    created_by          uuid                                   NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT bank_statement_pkey PRIMARY KEY (id),
    CONSTRAINT bank_statement_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_statement_period_chk CHECK (period_end_date >= period_start_date),
    CONSTRAINT bank_statement_reference_chk CHECK (statement_ref IS NULL OR btrim(statement_ref) <> ''),
    CONSTRAINT bank_statement_source_hash_chk CHECK (
        (source_format = 'manual' AND (source_hash IS NULL OR btrim(source_hash) <> ''))
        OR (source_format <> 'manual' AND source_hash IS NOT NULL AND btrim(source_hash) <> '')
    ),
    CONSTRAINT bank_statement_signoff_pair_chk CHECK ((signed_off_at IS NULL) = (signed_off_by IS NULL)),
    CONSTRAINT bank_statement_signoff_status_chk CHECK (
        (status IN ('signed_off', 'archived')) = (signed_off_at IS NOT NULL)
    ),
    CONSTRAINT bank_statement_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bank_statement_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bank_statement_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.bank_statement_line (
    id                  uuid                                 NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                                 NOT NULL,
    bank_statement_id   uuid                                 NOT NULL,
    line_no             integer                              NOT NULL,
    transaction_date    date                                 NOT NULL,
    value_date          date,
    description         text                                 NOT NULL,
    reference_number    text,
    counterparty_name   text,
    counterparty_account text,
    amount              numeric(20,4)                        NOT NULL,
    running_balance     numeric(20,4),
    currency_code       character(3)                         NOT NULL,
    transaction_type    document.bank_transaction_type_d     NOT NULL DEFAULT 'other',
    idempotency_key     text                                 NOT NULL,
    recon_status        document.bank_reconciliation_status_d NOT NULL DEFAULT 'unmatched',
    raw_data            jsonb                                NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz                          NOT NULL DEFAULT now(),
    created_by          uuid                                 NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT bank_statement_line_pkey PRIMARY KEY (id),
    CONSTRAINT bank_statement_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_statement_line_no_uq UNIQUE (tenant_id, bank_statement_id, line_no),
    CONSTRAINT bank_statement_line_idempotency_uq UNIQUE (tenant_id, bank_statement_id, idempotency_key),
    CONSTRAINT bank_statement_line_no_chk CHECK (line_no >= 1),
    CONSTRAINT bank_statement_line_description_chk CHECK (btrim(description) <> ''),
    CONSTRAINT bank_statement_line_amount_chk CHECK (amount <> 0),
    CONSTRAINT bank_statement_line_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT bank_statement_line_reference_chk CHECK (reference_number IS NULL OR btrim(reference_number) <> ''),
    CONSTRAINT bank_statement_line_raw_object_chk CHECK (jsonb_typeof(raw_data) = 'object'),
    CONSTRAINT bank_statement_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.bank_recon_case (
    id                  uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                                  NOT NULL,
    company_code_id     uuid                                  NOT NULL,
    bank_account_id     uuid                                  NOT NULL,
    case_number         text                                  NOT NULL,
    case_type           document.bank_recon_case_type_d        NOT NULL,
    confidence_score    numeric(5,4)                          NOT NULL DEFAULT 1,
    book_amount         numeric(20,4)                         NOT NULL DEFAULT 0,
    bank_amount         numeric(20,4)                         NOT NULL DEFAULT 0,
    difference_amount   numeric(20,4) GENERATED ALWAYS AS (book_amount - bank_amount) STORED,
    currency_code       character(3)                          NOT NULL,
    sign_off_journal_entry_id uuid,
    matched_at          timestamptz,
    signed_off_at       timestamptz,
    signed_off_by       uuid,
    voided_at           timestamptz,
    voided_by           uuid,
    void_reason         text,
    notes               text,
    metadata            jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    status              document.bank_recon_case_status_d      NOT NULL DEFAULT 'open',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                           NOT NULL DEFAULT now(),
    created_by          uuid                                  NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT bank_recon_case_pkey PRIMARY KEY (id),
    CONSTRAINT bank_recon_case_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_recon_case_number_uq UNIQUE (tenant_id, company_code_id, case_number),
    CONSTRAINT bank_recon_case_number_chk CHECK (case_number ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT bank_recon_case_confidence_chk CHECK (confidence_score BETWEEN 0 AND 1),
    CONSTRAINT bank_recon_case_amounts_chk CHECK (book_amount >= 0 AND bank_amount >= 0),
    CONSTRAINT bank_recon_case_matched_chk CHECK ((status IN ('matched', 'signed_off')) = (matched_at IS NOT NULL)),
    CONSTRAINT bank_recon_case_signoff_pair_chk CHECK ((signed_off_at IS NULL) = (signed_off_by IS NULL)),
    CONSTRAINT bank_recon_case_signoff_status_chk CHECK ((status = 'signed_off') = (signed_off_at IS NOT NULL)),
    CONSTRAINT bank_recon_case_void_pair_chk CHECK ((voided_at IS NULL) = (voided_by IS NULL)),
    CONSTRAINT bank_recon_case_void_status_chk CHECK (
        (status = 'voided' AND voided_at IS NOT NULL AND void_reason IS NOT NULL AND btrim(void_reason) <> '')
        OR (status <> 'voided' AND voided_at IS NULL AND void_reason IS NULL)
    ),
    CONSTRAINT bank_recon_case_adjustment_journal_chk CHECK (
        sign_off_journal_entry_id IS NULL OR case_type IN ('exception', 'bank_charge', 'fx_difference')
    ),
    CONSTRAINT bank_recon_case_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bank_recon_case_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bank_recon_case_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.bank_recon_case_line (
    id                     uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                         NOT NULL,
    bank_recon_case_id     uuid                         NOT NULL,
    side                   document.bank_recon_side_d    NOT NULL,
    payment_entry_id       uuid,
    bank_statement_line_id uuid,
    amount                 numeric(20,4)                NOT NULL,
    notes                  text,
    created_at             timestamptz                  NOT NULL DEFAULT now(),
    created_by             uuid                         NOT NULL,
    CONSTRAINT bank_recon_case_line_pkey PRIMARY KEY (id),
    CONSTRAINT bank_recon_case_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_recon_case_line_source_uq UNIQUE NULLS NOT DISTINCT
        (tenant_id, bank_recon_case_id, side, payment_entry_id, bank_statement_line_id),
    CONSTRAINT bank_recon_case_line_side_chk CHECK (
        (side = 'payment' AND payment_entry_id IS NOT NULL AND bank_statement_line_id IS NULL)
        OR (side = 'statement' AND bank_statement_line_id IS NOT NULL AND payment_entry_id IS NULL)
    ),
    CONSTRAINT bank_recon_case_line_amount_chk CHECK (amount > 0),
    CONSTRAINT bank_recon_case_line_notes_chk CHECK (notes IS NULL OR btrim(notes) <> '')
);

CREATE TABLE document.depreciation_run (
    id                   uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                               NOT NULL,
    company_code_id      uuid                               NOT NULL,
    ledger_book_id       uuid                               NOT NULL,
    fiscal_period_id     uuid                               NOT NULL,
    code                 text                               NOT NULL,
    name                 text                               NOT NULL,
    currency_code        character(3)                       NOT NULL,
    idempotency_key      text                               NOT NULL,
    reversal_of_run_id   uuid,
    reference_journal_entry_id uuid,
    started_at           timestamptz,
    started_by           uuid,
    completed_at         timestamptz,
    completed_by         uuid,
    posted_at            timestamptz,
    posted_by            uuid,
    failure_summary      jsonb,
    metadata             jsonb                              NOT NULL DEFAULT '{}'::jsonb,
    status               document.depreciation_run_status_d NOT NULL DEFAULT 'planned',
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                        NOT NULL DEFAULT now(),
    created_by           uuid                               NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,
    CONSTRAINT depreciation_run_pkey PRIMARY KEY (id),
    CONSTRAINT depreciation_run_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_run_code_uq UNIQUE (tenant_id, company_code_id, ledger_book_id, code),
    CONSTRAINT depreciation_run_period_direction_uq UNIQUE NULLS NOT DISTINCT
        (tenant_id, company_code_id, ledger_book_id, fiscal_period_id, reversal_of_run_id),
    CONSTRAINT depreciation_run_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT depreciation_run_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT depreciation_run_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT depreciation_run_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT depreciation_run_self_chk CHECK (reversal_of_run_id IS DISTINCT FROM id),
    CONSTRAINT depreciation_run_start_pair_chk CHECK ((started_at IS NULL) = (started_by IS NULL)),
    CONSTRAINT depreciation_run_complete_pair_chk CHECK ((completed_at IS NULL) = (completed_by IS NULL)),
    CONSTRAINT depreciation_run_post_pair_chk CHECK ((posted_at IS NULL) = (posted_by IS NULL)),
    CONSTRAINT depreciation_run_state_evidence_chk CHECK (
        (status NOT IN ('running', 'calculated', 'posted', 'failed') OR started_at IS NOT NULL)
        AND (status NOT IN ('calculated', 'posted', 'failed') OR completed_at IS NOT NULL)
        AND (status <> 'posted' OR posted_at IS NOT NULL)
        AND (status <> 'failed' OR failure_summary IS NOT NULL)
    ),
    CONSTRAINT depreciation_run_failure_object_chk CHECK (failure_summary IS NULL OR jsonb_typeof(failure_summary) = 'object'),
    CONSTRAINT depreciation_run_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT depreciation_run_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT depreciation_run_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.depreciation_run_line (
    id                    uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                  NOT NULL,
    run_id                uuid                                  NOT NULL,
    asset_id              uuid                                  NOT NULL,
    asset_book_id         uuid                                  NOT NULL,
    depreciation_schedule_id uuid,
    reversal_of_line_id   uuid,
    depreciation_amount   numeric(20,4)                         NOT NULL,
    currency_code         character(3)                          NOT NULL,
    cost_basis_at_run     numeric(20,4)                         NOT NULL,
    accumulated_depreciation_before numeric(20,4)               NOT NULL,
    accumulated_depreciation_after  numeric(20,4)               NOT NULL,
    net_book_value_after  numeric(20,4)                         NOT NULL,
    depreciation_method   master.depreciation_method_d          NOT NULL,
    useful_life_months    integer                               NOT NULL,
    remaining_life_months integer                               NOT NULL,
    error_message         text,
    status                document.depreciation_line_status_d    NOT NULL DEFAULT 'calculated',
    posted_at             timestamptz,
    posted_by             uuid,
    created_at            timestamptz                           NOT NULL DEFAULT now(),
    created_by            uuid                                  NOT NULL,
    CONSTRAINT depreciation_run_line_pkey PRIMARY KEY (id),
    CONSTRAINT depreciation_run_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_run_line_asset_uq UNIQUE (tenant_id, run_id, asset_book_id),
    CONSTRAINT depreciation_run_line_amount_chk CHECK (depreciation_amount > 0),
    CONSTRAINT depreciation_run_line_values_chk CHECK (
        cost_basis_at_run >= 0 AND accumulated_depreciation_before >= 0
        AND accumulated_depreciation_after >= 0 AND net_book_value_after >= 0
        AND (
            (reversal_of_line_id IS NULL AND accumulated_depreciation_after = accumulated_depreciation_before + depreciation_amount)
            OR (reversal_of_line_id IS NOT NULL AND accumulated_depreciation_after = accumulated_depreciation_before - depreciation_amount)
        )
        AND accumulated_depreciation_after + net_book_value_after <= cost_basis_at_run
    ),
    CONSTRAINT depreciation_run_line_life_chk CHECK (useful_life_months >= 0 AND remaining_life_months >= 0 AND remaining_life_months <= useful_life_months),
    CONSTRAINT depreciation_run_line_self_chk CHECK (reversal_of_line_id IS DISTINCT FROM id),
    CONSTRAINT depreciation_run_line_error_chk CHECK (
        (status = 'error' AND error_message IS NOT NULL AND btrim(error_message) <> '')
        OR (status <> 'error' AND error_message IS NULL)
    ),
    CONSTRAINT depreciation_run_line_post_pair_chk CHECK ((posted_at IS NULL) = (posted_by IS NULL)),
    CONSTRAINT depreciation_run_line_post_status_chk CHECK ((status = 'posted') = (posted_at IS NOT NULL))
);

CREATE TABLE document.depreciation_schedule (
    id                    uuid                                      NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                      NOT NULL,
    asset_id              uuid                                      NOT NULL,
    asset_book_id         uuid                                      NOT NULL,
    fiscal_period_id      uuid                                      NOT NULL,
    planned_amount        numeric(20,4)                             NOT NULL,
    cumulative_planned_amount numeric(20,4)                         NOT NULL,
    opening_net_book_value numeric(20,4)                            NOT NULL,
    closing_net_book_value numeric(20,4) GENERATED ALWAYS AS (opening_net_book_value - planned_amount) STORED,
    currency_code         character(3)                              NOT NULL,
    actual_run_line_id    uuid,
    actual_amount         numeric(20,4),
    variance_amount       numeric(20,4) GENERATED ALWAYS AS
        (CASE WHEN actual_amount IS NULL THEN NULL ELSE actual_amount - planned_amount END) STORED,
    is_final_period       boolean                                   NOT NULL DEFAULT false,
    notes                 text,
    metadata              jsonb                                     NOT NULL DEFAULT '{}'::jsonb,
    status                document.depreciation_schedule_status_d    NOT NULL DEFAULT 'planned',
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                               NOT NULL DEFAULT now(),
    created_by            uuid                                      NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT depreciation_schedule_pkey PRIMARY KEY (id),
    CONSTRAINT depreciation_schedule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_schedule_period_uq UNIQUE (tenant_id, asset_book_id, fiscal_period_id),
    CONSTRAINT depreciation_schedule_amounts_chk CHECK (
        planned_amount >= 0 AND cumulative_planned_amount >= planned_amount
        AND opening_net_book_value >= planned_amount
        AND (actual_amount IS NULL OR actual_amount >= 0)
    ),
    CONSTRAINT depreciation_schedule_actual_pair_chk CHECK ((actual_run_line_id IS NULL) = (actual_amount IS NULL)),
    CONSTRAINT depreciation_schedule_actual_status_chk CHECK (
        (status = 'posted') = (actual_run_line_id IS NOT NULL)
    ),
    CONSTRAINT depreciation_schedule_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT depreciation_schedule_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT depreciation_schedule_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.bank_recon_case_line IS
  'Append-only canonical M:N match bridge. Split reconciliation uses multiple payment or statement rows within one case; voiding the case releases the sources.';
COMMENT ON COLUMN document.bank_statement_line.recon_status IS
  'Database-maintained operational projection of active reconciliation case coverage; no recon_case_id shortcut is stored.';
COMMENT ON TABLE document.depreciation_run IS
  'One company, ledger-book and fiscal-period depreciation execution. Ambiguous legacy book_type/book_id and duplicated fiscal coordinates are removed.';
COMMENT ON TABLE document.depreciation_schedule IS
  'Current planned schedule per asset book and fiscal period. Historical versions are captured by snapshot.entity_snapshot rather than schedule_version.';
