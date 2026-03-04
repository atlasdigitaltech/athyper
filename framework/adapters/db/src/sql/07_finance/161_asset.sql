-- ============================================================
-- 161_asset.sql — Asset Engine DDL
-- Athyper v2.1 Business Operating Platform — Phase 2
-- ============================================================

-- Ensure fin schema exists (created in earlier migrations)
CREATE SCHEMA IF NOT EXISTS fin;

-- ------------------------------------------------------------
-- 1. fin.asset — Fixed Asset Register
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin.asset (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL,
    entity_code         VARCHAR(20)     NOT NULL,
    asset_number        VARCHAR(40)     NOT NULL,
    name                VARCHAR(255)    NOT NULL,
    description         TEXT,
    asset_class         VARCHAR(30)     NOT NULL
        CHECK (asset_class IN (
            'LAND', 'BUILDING', 'MACHINERY', 'VEHICLE',
            'FURNITURE', 'IT_EQUIPMENT', 'INTANGIBLE', 'LEASED'
        )),
    status              VARCHAR(20)     NOT NULL DEFAULT 'WIP'
        CHECK (status IN (
            'WIP', 'CAPITALIZED', 'ACTIVE', 'IMPAIRED', 'RETIRED', 'DISPOSED'
        )),
    acquisition_date    DATE            NOT NULL,
    acquisition_cost    DECIMAL(18, 4)  NOT NULL,
    currency_code       VARCHAR(3)      NOT NULL DEFAULT 'USD',
    residual_value      DECIMAL(18, 4)  NOT NULL DEFAULT 0,
    useful_life_months  INT             NOT NULL,
    ou_id               UUID,
    cost_center_id      UUID,
    location            VARCHAR(255),
    vendor_id           UUID            REFERENCES ent.supplier(id),
    commitment_id       UUID,           -- FK added in 180_commitment.sql (forward dependency)
    capitalized_from_wip BOOLEAN        NOT NULL DEFAULT FALSE,
    parent_asset_id     UUID            REFERENCES fin.asset(id),
    tags                JSONB           DEFAULT '[]'::jsonb,
    metadata            JSONB           DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_asset_number UNIQUE (tenant_id, entity_code, asset_number)
);

COMMENT ON TABLE fin.asset IS 'Fixed asset register — master record for every capitalised or WIP asset';

-- ------------------------------------------------------------
-- 2. fin.asset_book — Multi-Book Depreciation
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin.asset_book (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID            NOT NULL,
    asset_id                UUID            NOT NULL REFERENCES fin.asset(id),
    book_type               VARCHAR(20)     NOT NULL
        CHECK (book_type IN ('STATUTORY', 'TAX', 'MANAGEMENT', 'INSURANCE')),
    depreciation_method     VARCHAR(30)     NOT NULL
        CHECK (depreciation_method IN (
            'STRAIGHT_LINE', 'REDUCING_BALANCE', 'UNITS_OF_PRODUCTION',
            'ACCELERATED', 'MACRS'
        )),
    useful_life_months      INT             NOT NULL,
    residual_value          DECIMAL(18, 4)  NOT NULL DEFAULT 0,
    cost_basis              DECIMAL(18, 4)  NOT NULL,
    accumulated_depreciation DECIMAL(18, 4) NOT NULL DEFAULT 0,
    net_book_value          DECIMAL(18, 4)  GENERATED ALWAYS AS (cost_basis - accumulated_depreciation) STORED,
    last_depreciation_date  DATE,
    next_depreciation_date  DATE,
    currency_code           VARCHAR(3)      NOT NULL DEFAULT 'USD',
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_asset_book UNIQUE (tenant_id, asset_id, book_type)
);

COMMENT ON TABLE fin.asset_book IS 'Per-book depreciation parameters and running totals for each asset';

-- ------------------------------------------------------------
-- 3. fin.asset_transaction — Asset Lifecycle Events
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin.asset_transaction (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL,
    asset_id        UUID            NOT NULL REFERENCES fin.asset(id),
    book_type       VARCHAR(20)     NOT NULL
        CHECK (book_type IN ('STATUTORY', 'TAX', 'MANAGEMENT', 'INSURANCE')),
    txn_type        VARCHAR(20)     NOT NULL
        CHECK (txn_type IN (
            'CAPITALIZE', 'DEPRECIATE', 'REVALUE_UP', 'REVALUE_DOWN',
            'IMPAIR', 'TRANSFER', 'RETIRE', 'DISPOSE'
        )),
    amount          DECIMAL(18, 4)  NOT NULL,
    currency_code   VARCHAR(3)      NOT NULL DEFAULT 'USD',
    from_values     JSONB,
    to_values       JSONB,
    reference_je_id UUID,           -- FK added in 190_posting.sql (forward dependency)
    performed_by    UUID            NOT NULL,
    performed_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
    notes           TEXT
);

COMMENT ON TABLE fin.asset_transaction IS 'Immutable log of every asset lifecycle event (capitalize, depreciate, revalue, dispose, etc.)';

-- ------------------------------------------------------------
-- 4. fin.depreciation_run — Batch Depreciation Runs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin.depreciation_run (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL,
    entity_code     VARCHAR(20)     NOT NULL,
    book_type       VARCHAR(20)     NOT NULL
        CHECK (book_type IN ('STATUTORY', 'TAX', 'MANAGEMENT', 'INSURANCE')),
    fiscal_year     INT             NOT NULL,
    period_number   INT             NOT NULL,
    status          VARCHAR(20)     NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED', 'RUNNING', 'COMPLETED', 'FAILED')),
    asset_count     INT             NOT NULL DEFAULT 0,
    total_amount    DECIMAL(18, 4)  NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    run_by          UUID            NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE fin.depreciation_run IS 'Batch depreciation run header — one per entity / book / period';

-- ============================================================
-- INDEXES
-- ============================================================

-- fin.asset
CREATE INDEX IF NOT EXISTS idx_asset_tenant
    ON fin.asset (tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_tenant_entity
    ON fin.asset (tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_asset_status
    ON fin.asset (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_asset_class
    ON fin.asset (tenant_id, asset_class);
CREATE INDEX IF NOT EXISTS idx_asset_parent
    ON fin.asset (parent_asset_id) WHERE parent_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_vendor
    ON fin.asset (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_commitment
    ON fin.asset (commitment_id) WHERE commitment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_ou
    ON fin.asset (tenant_id, ou_id) WHERE ou_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_cost_center
    ON fin.asset (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_tags
    ON fin.asset USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_asset_metadata
    ON fin.asset USING gin (metadata);

-- fin.asset_book
CREATE INDEX IF NOT EXISTS idx_asset_book_tenant
    ON fin.asset_book (tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_book_asset
    ON fin.asset_book (asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_book_next_depr
    ON fin.asset_book (next_depreciation_date) WHERE next_depreciation_date IS NOT NULL;

-- fin.asset_transaction
CREATE INDEX IF NOT EXISTS idx_asset_txn_tenant
    ON fin.asset_transaction (tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_txn_asset
    ON fin.asset_transaction (asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_txn_asset_book
    ON fin.asset_transaction (asset_id, book_type);
CREATE INDEX IF NOT EXISTS idx_asset_txn_type
    ON fin.asset_transaction (tenant_id, txn_type);
CREATE INDEX IF NOT EXISTS idx_asset_txn_performed_at
    ON fin.asset_transaction (tenant_id, performed_at);
CREATE INDEX IF NOT EXISTS idx_asset_txn_je_ref
    ON fin.asset_transaction (reference_je_id) WHERE reference_je_id IS NOT NULL;

-- fin.depreciation_run
CREATE INDEX IF NOT EXISTS idx_depr_run_tenant
    ON fin.depreciation_run (tenant_id);
CREATE INDEX IF NOT EXISTS idx_depr_run_entity_period
    ON fin.depreciation_run (tenant_id, entity_code, book_type, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_depr_run_status
    ON fin.depreciation_run (tenant_id, status);
