-- =============================================================================
-- 162_inventory.sql — Inventory Subledger Engine
-- Athyper v2.1 Business Operating Platform
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. fin.warehouse
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin.warehouse (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,
    code            VARCHAR(20) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_warehouse_tenant_entity_code
        UNIQUE (tenant_id, entity_code, code)
);

-- ---------------------------------------------------------------------------
-- 2. fin.item_master
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE fin.valuation_method AS ENUM (
        'FIFO', 'LIFO', 'WEIGHTED_AVG', 'STANDARD', 'SPECIFIC'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fin.item_master (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(20) NOT NULL,
    product_id          UUID NOT NULL REFERENCES ent.product(id),
    valuation_method    fin.valuation_method NOT NULL,
    standard_cost       DECIMAL(18,4),
    currency_code       VARCHAR(3) NOT NULL,
    reorder_point       DECIMAL(18,4),
    reorder_qty         DECIMAL(18,4),
    safety_stock        DECIMAL(18,4),
    lot_tracking        BOOLEAN NOT NULL DEFAULT false,
    serial_tracking     BOOLEAN NOT NULL DEFAULT false,
    uom_code            VARCHAR(20) NOT NULL REFERENCES ref.uom(code),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_item_master_tenant_entity_product
        UNIQUE (tenant_id, entity_code, product_id)
);

-- ---------------------------------------------------------------------------
-- 3. fin.inventory_balance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin.inventory_balance (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(20) NOT NULL,
    item_id             UUID NOT NULL REFERENCES fin.item_master(id),
    warehouse_id        UUID NOT NULL REFERENCES fin.warehouse(id),
    lot_number          VARCHAR(100),
    serial_number       VARCHAR(100),
    quantity_on_hand    DECIMAL(18,4) NOT NULL DEFAULT 0,
    unit_cost           DECIMAL(18,4) NOT NULL DEFAULT 0,
    total_value         DECIMAL(18,4) GENERATED ALWAYS AS (quantity_on_hand * unit_cost) STORED,
    currency_code       VARCHAR(3) NOT NULL,
    last_movement_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    -- Note: uniqueness enforced via unique index below (handles NULLs)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_balance_composite
    ON fin.inventory_balance (
        tenant_id, entity_code, item_id, warehouse_id,
        COALESCE(lot_number, ''), COALESCE(serial_number, '')
    );

-- ---------------------------------------------------------------------------
-- 4. fin.inventory_movement
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE fin.movement_type AS ENUM (
        'RECEIPT', 'ISSUE_SALES', 'ISSUE_PRODUCTION', 'TRANSFER_OUT',
        'TRANSFER_IN', 'ADJUSTMENT', 'SCRAP', 'RETURN'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fin.inventory_movement (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES core.tenant(id),
    entity_code             VARCHAR(20) NOT NULL,
    item_id                 UUID NOT NULL REFERENCES fin.item_master(id),
    warehouse_id            UUID NOT NULL REFERENCES fin.warehouse(id),
    movement_type           fin.movement_type NOT NULL,
    quantity                DECIMAL(18,4) NOT NULL,
    unit_cost               DECIMAL(18,4) NOT NULL,
    total_value             DECIMAL(18,4) NOT NULL,
    currency_code           VARCHAR(3) NOT NULL,
    lot_number              VARCHAR(100),
    serial_number           VARCHAR(100),
    reference_doc_type      VARCHAR(50),
    reference_doc_id        UUID,
    source_warehouse_id     UUID REFERENCES fin.warehouse(id),
    dest_warehouse_id       UUID REFERENCES fin.warehouse(id),
    reference_je_id         UUID,   -- FK added in 190_posting.sql (forward dependency)
    performed_by            UUID NOT NULL,
    performed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. fin.inventory_valuation_layer
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin.inventory_valuation_layer (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES core.tenant(id),
    entity_code             VARCHAR(20) NOT NULL,
    item_id                 UUID NOT NULL REFERENCES fin.item_master(id),
    warehouse_id            UUID NOT NULL REFERENCES fin.warehouse(id),
    layer_date              DATE NOT NULL,
    receipt_movement_id     UUID NOT NULL REFERENCES fin.inventory_movement(id),
    original_qty            DECIMAL(18,4) NOT NULL,
    remaining_qty           DECIMAL(18,4) NOT NULL,
    unit_cost               DECIMAL(18,4) NOT NULL,
    currency_code           VARCHAR(3) NOT NULL,
    is_consumed             BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. fin.stocktake
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE fin.stocktake_status AS ENUM (
        'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fin.stocktake (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(20) NOT NULL,
    warehouse_id        UUID NOT NULL REFERENCES fin.warehouse(id),
    stocktake_date      DATE NOT NULL,
    status              fin.stocktake_status NOT NULL DEFAULT 'PLANNED',
    counted_by          UUID,
    approved_by         UUID,
    variance_je_id      UUID,       -- FK added in 190_posting.sql (forward dependency)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 7. fin.stocktake_line
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin.stocktake_line (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    stocktake_id        UUID NOT NULL REFERENCES fin.stocktake(id),
    item_id             UUID NOT NULL REFERENCES fin.item_master(id),
    lot_number          VARCHAR(100),
    serial_number       VARCHAR(100),
    system_qty          DECIMAL(18,4) NOT NULL,
    counted_qty         DECIMAL(18,4) NOT NULL,
    variance_qty        DECIMAL(18,4) GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
    unit_cost           DECIMAL(18,4) NOT NULL,
    variance_value      DECIMAL(18,4),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================================
-- INDEXES
-- ===========================================================================

-- warehouse
CREATE INDEX IF NOT EXISTS idx_warehouse_tenant_entity
    ON fin.warehouse (tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_warehouse_active
    ON fin.warehouse (tenant_id, entity_code, is_active)
    WHERE is_active = true;

-- item_master
CREATE INDEX IF NOT EXISTS idx_item_master_tenant_entity
    ON fin.item_master (tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_item_master_product
    ON fin.item_master (product_id);
CREATE INDEX IF NOT EXISTS idx_item_master_valuation
    ON fin.item_master (tenant_id, entity_code, valuation_method);

-- inventory_balance
CREATE INDEX IF NOT EXISTS idx_inventory_balance_tenant_entity
    ON fin.inventory_balance (tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_inventory_balance_item
    ON fin.inventory_balance (item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balance_warehouse
    ON fin.inventory_balance (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balance_item_warehouse
    ON fin.inventory_balance (item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balance_lot
    ON fin.inventory_balance (lot_number)
    WHERE lot_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_balance_serial
    ON fin.inventory_balance (serial_number)
    WHERE serial_number IS NOT NULL;

-- inventory_movement
CREATE INDEX IF NOT EXISTS idx_inventory_movement_tenant_entity
    ON fin.inventory_movement (tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_item
    ON fin.inventory_movement (item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_warehouse
    ON fin.inventory_movement (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_type
    ON fin.inventory_movement (movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_performed_at
    ON fin.inventory_movement (performed_at);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_reference
    ON fin.inventory_movement (reference_doc_type, reference_doc_id)
    WHERE reference_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movement_je
    ON fin.inventory_movement (reference_je_id)
    WHERE reference_je_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movement_lot
    ON fin.inventory_movement (lot_number)
    WHERE lot_number IS NOT NULL;

-- inventory_valuation_layer
CREATE INDEX IF NOT EXISTS idx_valuation_layer_tenant_entity
    ON fin.inventory_valuation_layer (tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_valuation_layer_item_warehouse
    ON fin.inventory_valuation_layer (item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_valuation_layer_remaining
    ON fin.inventory_valuation_layer (item_id, warehouse_id, remaining_qty)
    WHERE is_consumed = false;
CREATE INDEX IF NOT EXISTS idx_valuation_layer_date
    ON fin.inventory_valuation_layer (layer_date);
CREATE INDEX IF NOT EXISTS idx_valuation_layer_receipt
    ON fin.inventory_valuation_layer (receipt_movement_id);

-- stocktake
CREATE INDEX IF NOT EXISTS idx_stocktake_tenant_entity
    ON fin.stocktake (tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_stocktake_warehouse
    ON fin.stocktake (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_status
    ON fin.stocktake (tenant_id, entity_code, status);
CREATE INDEX IF NOT EXISTS idx_stocktake_date
    ON fin.stocktake (stocktake_date);

-- stocktake_line
CREATE INDEX IF NOT EXISTS idx_stocktake_line_stocktake
    ON fin.stocktake_line (stocktake_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_line_item
    ON fin.stocktake_line (item_id);
