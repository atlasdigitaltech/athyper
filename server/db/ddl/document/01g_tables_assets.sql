-- ============================================================================
-- document/01g_tables_assets.sql
-- Concept: Asset Transactions — asset movements, depreciation runs and schedules
-- Depends on: 04_tables/004_document.sql, 04_tables/003c_master_extended.sql
-- Scope: Fixed Asset Transaction document tables
-- Domain: asset_transaction, depreciation_run, depreciation_run_line,
--         depreciation_schedule
-- Load order: 004f (after 004a_document_journal.sql)
-- ============================================================================

-- =============================================================================
-- §AT1  document.asset_transaction — asset lifecycle events
-- =============================================================================
-- Capitalize, depreciate, revalue, impair, dispose, transfer, retire, adjust.
-- asset_book_id is the authoritative book link. book_type is denormalized
-- convenience. Consistency enforced by document.trg_asset_txn_book_guard().

CREATE TABLE IF NOT EXISTS document.asset_transaction (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL DEFAULT '',
    name             text         NOT NULL DEFAULT '',

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Asset + book linkage
    asset_id                 uuid         NOT NULL,
    asset_book_id            uuid,
    book_type                text,
    txn_type                 text         NOT NULL,

    -- Amounts
    amount                   numeric(18,4) NOT NULL,
    currency_code            character(3) NOT NULL DEFAULT 'USD',

    -- Period alignment
    effective_date           date         NOT NULL,
    fiscal_year              smallint     NOT NULL,
    period_number            smallint     NOT NULL,

    -- State capture
    from_values              jsonb,
    to_values                jsonb,

    -- Linkage
    reference_je_id          uuid,
    depreciation_run_id      uuid,
    depreciation_run_line_id uuid,

    -- Reversal support
    reversal_of_id           uuid,
    is_reversal              boolean      NOT NULL DEFAULT false,

    -- Actor tracking
    performed_by             uuid         NOT NULL,
    performed_at             timestamptz  NOT NULL DEFAULT now(),
    notes                    text,

    -- Posting
    posted_at                timestamptz,
    posted_by                uuid,

    -- Tags & Metadata
    tags             jsonb        NOT NULL DEFAULT '[]'::jsonb,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status IN ('draft', 'posted')) STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT asset_txn_pkey           PRIMARY KEY (id),
    CONSTRAINT asset_txn_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT asset_txn_reversal_chk   CHECK (
        (is_reversal = false AND reversal_of_id IS NULL)
        OR (is_reversal = true AND reversal_of_id IS NOT NULL)
    )
);

COMMENT ON TABLE document.asset_transaction IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''posted'')). Asset lifecycle events. Links to asset_book_id (authoritative) and retains '
    'book_type as denormalized convenience. Consistency enforced by trigger.';


-- =============================================================================
-- §AT2  document.depreciation_run — batch depreciation run header
-- =============================================================================
-- Idempotency enforced via conditional unique index on idempotency_key.

CREATE TABLE IF NOT EXISTS document.depreciation_run (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL DEFAULT '',
    name             text         NOT NULL DEFAULT '',

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Book + period
    book_type                text         NOT NULL,
    book_id                  uuid,
    fiscal_year              smallint     NOT NULL,
    period_number            smallint     NOT NULL,

    -- Run metrics
    asset_count              integer      NOT NULL DEFAULT 0,
    total_amount             numeric(18,4) NOT NULL DEFAULT 0,
    currency_code            character(3) NOT NULL DEFAULT 'USD',
    error_count              integer      NOT NULL DEFAULT 0,
    error_log                jsonb,

    -- Timing
    started_at               timestamptz,
    completed_at             timestamptz,

    -- Linkage
    reference_je_id          uuid,

    -- Reversal
    reversal_of_id           uuid,
    is_reversal              boolean      NOT NULL DEFAULT false,

    -- Actor
    run_by                   uuid         NOT NULL,

    -- Idempotency
    idempotency_key          text,

    -- Posting
    posted_at                timestamptz,
    posted_by                uuid,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'planned',
    is_active        boolean      GENERATED ALWAYS AS (status IN ('planned', 'running')) STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT depreciation_run_pkey           PRIMARY KEY (id),
    CONSTRAINT depreciation_run_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_run_period_book_uq
        UNIQUE (tenant_id, company_code_id, book_type, fiscal_year, period_number, is_reversal),
    CONSTRAINT depreciation_run_reversal_chk   CHECK (
        (is_reversal = false AND reversal_of_id IS NULL)
        OR (is_reversal = true AND reversal_of_id IS NOT NULL)
    ),
    CONSTRAINT depreciation_run_error_count_pos CHECK (error_count >= 0)
);

COMMENT ON TABLE document.depreciation_run IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''planned'',''running'')). Batch depreciation run header. Idempotency enforced via conditional '
    'unique index on (tenant_id, company_code_id, idempotency_key).';


-- =============================================================================
-- §AT3  document.depreciation_run_line — per-asset run detail
-- =============================================================================
-- Asset/book mismatch prevented by composite FK (tenant_id, asset_book_id, asset_id)
-- referencing master.asset_book (tenant_id, id, asset_id).
-- This table is immutable after creation (log.trg_prevent_mutation).

CREATE TABLE IF NOT EXISTS document.depreciation_run_line (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Parent run + asset
    run_id                   uuid         NOT NULL,
    asset_id                 uuid         NOT NULL,
    asset_book_id            uuid         NOT NULL,

    -- Calculated amounts
    depreciation_amount      numeric(18,4) NOT NULL,
    currency_code            character(3) NOT NULL DEFAULT 'USD',

    -- Book values at time of calculation (snapshot)
    cost_basis_at_run        numeric(18,4) NOT NULL,
    accum_depr_before        numeric(18,4) NOT NULL,
    accum_depr_after         numeric(18,4) NOT NULL,
    nbv_after                numeric(18,4) NOT NULL,

    -- Method applied
    depreciation_method      text         NOT NULL,
    useful_life_months       integer      NOT NULL,
    remaining_life_months    integer      NOT NULL,

    -- Linkage to asset_transaction
    asset_transaction_id     uuid,

    -- Line status
    line_status              text         NOT NULL DEFAULT 'calculated',
    error_message            text,

    -- Audit (immutable — no updated_at)
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,

    CONSTRAINT depreciation_run_line_pkey           PRIMARY KEY (id),
    CONSTRAINT depreciation_run_line_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_run_line_run_asset_uq   UNIQUE (run_id, asset_book_id),
    CONSTRAINT depreciation_run_line_amount_pos     CHECK (depreciation_amount >= 0)
);

COMMENT ON TABLE document.depreciation_run_line IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Per-asset line detail within a depreciation run. Reconcilable to run header total. '
    'Asset/book mismatch prevented by composite FK (tenant_id, asset_book_id, asset_id). '
    'Immutable after creation — log.trg_prevent_mutation blocks UPDATE/DELETE.';


-- =============================================================================
-- §AT4  document.depreciation_schedule — planned month-by-month projection
-- =============================================================================
-- Supports versioning and plan-vs-actual via generated variance_amount.

CREATE TABLE IF NOT EXISTS document.depreciation_schedule (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Asset book + version
    asset_book_id            uuid         NOT NULL,
    schedule_version         smallint     NOT NULL DEFAULT 1,

    -- Period identification
    fiscal_year              smallint     NOT NULL,
    period_number            smallint     NOT NULL,
    period_date              date         NOT NULL,

    -- Planned amounts
    schedule_amount          numeric(18,4) NOT NULL,
    cumulative_amount        numeric(18,4) NOT NULL,
    opening_nbv              numeric(18,4) NOT NULL,
    closing_nbv              numeric(18,4) NOT NULL,
    currency_code            character(3) NOT NULL DEFAULT 'USD',

    -- Actual (populated after depreciation run)
    actual_amount            numeric(18,4),
    actual_run_line_id       uuid,
    variance_amount          numeric(18,4) GENERATED ALWAYS AS
                                 (CASE WHEN actual_amount IS NOT NULL
                                       THEN actual_amount - schedule_amount
                                       ELSE NULL END) STORED,

    -- Flags
    is_final_period          boolean      NOT NULL DEFAULT false,
    notes                    text,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT depreciation_schedule_pkey PRIMARY KEY (id),
    CONSTRAINT depreciation_schedule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_schedule_book_ver_period_uq
        UNIQUE (asset_book_id, schedule_version, fiscal_year, period_number),
    CONSTRAINT depreciation_schedule_amount_pos CHECK (schedule_amount >= 0),
    CONSTRAINT depreciation_schedule_cum_pos   CHECK (cumulative_amount >= 0)
);

COMMENT ON TABLE document.depreciation_schedule IS
    'ARCHETYPE=C;SCOPE=T. Planned month-by-month depreciation projection per asset_book. '
    'Supports versioning and plan-vs-actual via generated variance_amount.';
