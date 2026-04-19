-- ============================================================================
-- document/01i_tables_inventory.sql
-- Concept: Inventory — physical stocktake counts and line items
-- Depends on: 04_tables/004_document.sql, 04_tables/003b_master_finance.sql
-- Scope: Inventory Management document tables
-- Domain: stocktake, stocktake_line
-- Load order: 004h (after 004a_document_journal.sql)
-- ============================================================================

-- ============================================================================
-- §ST1  document.stocktake — physical inventory count header
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.stocktake (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Company scope
    company_code_id     uuid            NOT NULL,

    -- Scope
    warehouse_id        uuid            NOT NULL,

    -- Document header
    reference_no        text,
    stocktake_date      date            NOT NULL,

    -- Denormalised line aggregates (maintained by trg_stl_denorm_counts trigger)
    total_line_count    integer         NOT NULL DEFAULT 0,
    variance_line_count integer         NOT NULL DEFAULT 0,

    -- GL linkage (set on completion within posting transaction)
    variance_je_id      uuid,

    -- Completion audit
    completed_at        timestamptz,
    completed_by        uuid,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text            NOT NULL DEFAULT 'planned',
    is_active           boolean         GENERATED ALWAYS AS (status IN ('planned', 'in_progress')) STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT st_pkey              PRIMARY KEY (id),
    CONSTRAINT st_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT st_status_chk        CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT st_completed_chk     CHECK (
                                        status <> 'completed'
                                        OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)
                                    ),
    CONSTRAINT st_variance_je_chk   CHECK (variance_je_id IS NULL OR status = 'completed'),
    CONSTRAINT st_line_count_chk    CHECK (total_line_count >= 0 AND variance_line_count >= 0),
    CONSTRAINT st_reference_no_chk  CHECK (reference_no IS NULL OR btrim(reference_no) <> '')
);

COMMENT ON TABLE document.stocktake IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''planned'',''in_progress'')). Physical inventory count header. Lifecycle: planned → in_progress → completed | cancelled. '
    'Lines remain editable while status is planned/in_progress; immutable thereafter (app-layer). '
    'Financial impact recorded as ADJUSTMENT rows in ledger.inventory_movement at completion. '
    'total_line_count / variance_line_count maintained by trg_stl_denorm_counts trigger.';


-- ============================================================================
-- §ST2  document.stocktake_line — physical count lines
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.stocktake_line (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Parent linkage
    stocktake_id        uuid            NOT NULL,
    line_no             smallint        NOT NULL,

    -- Position key
    item_id             uuid            NOT NULL,
    warehouse_id        uuid            NOT NULL,   -- denormalised from header
    lot_number          text,
    serial_number       text,

    -- Count quantities
    system_qty          numeric(18,4)   NOT NULL,
    counted_qty         numeric(18,4)   NOT NULL,
    variance_qty        numeric(18,4)   GENERATED ALWAYS AS (counted_qty - system_qty) STORED,

    -- Valuation
    unit_cost           numeric(18,4)   NOT NULL,
    variance_value      numeric(18,4)   GENERATED ALWAYS AS ((counted_qty - system_qty) * unit_cost) STORED,
    currency_code       character(3)    NOT NULL,

    -- Posting linkage (set when parent stocktake completes)
    posted_at           timestamptz,
    posted_by           uuid,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT stl_pkey             PRIMARY KEY (id),
    CONSTRAINT stl_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT stl_line_uq          UNIQUE (stocktake_id, line_no),
    CONSTRAINT stl_line_no_chk      CHECK (line_no > 0),
    CONSTRAINT stl_system_qty_chk   CHECK (system_qty >= 0),
    CONSTRAINT stl_unit_cost_chk    CHECK (unit_cost >= 0),
    CONSTRAINT stl_currency_chk     CHECK (btrim(currency_code::text) <> ''),
    CONSTRAINT stl_posting_pair_chk CHECK ((posted_at IS NULL) = (posted_by IS NULL))
);

COMMENT ON TABLE document.stocktake_line IS
    'ARCHETYPE=C;SCOPE=T. Physical count lines for a stocktake document. Editable while parent status is '
    'planned/in_progress; immutable once parent reaches completed (enforced at app layer). '
    'variance_qty = GENERATED (counted - system). variance_value = GENERATED (variance × unit_cost). '
    'warehouse_id denormalised from parent header for direct indexed variance queries.';
