-- ============================================================================
-- document/01j_tables_p2p.sql
-- Concept: Procure-to-Pay — requisitions, purchase orders, delivery notes, receipts
-- Depends on: 04_tables/004b_document_commitment.sql, 04_tables/003b_master_finance.sql
-- Scope: Procure-to-Pay (P2P) procurement document tables
-- Domain: purchase_requisition, purchase_requisition_line,
--         purchase_order_confirmation, purchase_order_confirmation_line,
--         delivery_note, delivery_note_line,
--         receipt, receipt_line,
--         service_sheet, service_sheet_line
-- Load order: 004c (after 004b_document_commitment.sql)
-- Design ref: scc_p2p_final_merged.md v4.0
--
-- ENGINEERING NOTE – Foreign-key cardinality convention
-- ─────────────────────────────────────────────────────────────────────────────
-- Single-column UUID FK: globally-unique orchestration/posting roots (je_id,
--   workflow_request_id). tenant_id redundant. Indexes single-column.
-- Tenant-scoped composite FK: all business records (supplier, commitment, etc.).
--   Required for row-level isolation at DB layer.
-- ─────────────────────────────────────────────────────────────────────────────
-- ============================================================================

-- ============================================================================
-- §3.1  document.purchase_requisition  (approvable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.purchase_requisition (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL DEFAULT '',
    name                    text            NOT NULL DEFAULT '',
    company_code_id         uuid            NOT NULL,

    -- Natural key
    requisition_number      text            NOT NULL,

    -- Classification
    requisition_type        text            NOT NULL DEFAULT 'standard',
    description             text,
    priority                text            NOT NULL DEFAULT 'normal',

    -- Requestor
    requested_by            uuid            NOT NULL,
    responsible_person_id   uuid,

    -- Dates
    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    required_by_date        date,

    -- Suggested supplier
    suggested_supplier_ids  uuid[],

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    fx_rate_snapshot        jsonb,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    -- Budget
    budget_check_result     text,

    -- Encumbrance
    encumbrance_je_id       uuid,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_number           smallint,

    -- Approval
    approved_at             timestamptz,
    approved_by             uuid,
    workflow_request_id     uuid,

    -- Tags & Metadata
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','partially_converted')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Versioning (universal — see docs/architecture/p2p.md §Universal-Columns)
    row_version             bigint          NOT NULL DEFAULT 1,
    version_number          int             NOT NULL DEFAULT 1,
    previous_version_id     uuid,
    is_current_version      boolean         NOT NULL DEFAULT true,
    supersedes_at           timestamptz,

    -- Closure (universal)
    terminal_status         text,
    status_source           text            NOT NULL DEFAULT 'manual',

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pr_pkey              PRIMARY KEY (id),
    CONSTRAINT pr_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT pr_tenant_number_uq  UNIQUE (tenant_id, company_code_id, requisition_number),
    CONSTRAINT pr_number_nonempty   CHECK (btrim(requisition_number) <> ''),
    CONSTRAINT pr_status_chk        CHECK (status IN (
        'draft','pending_approval','approved','rejected',
        'partially_converted','fully_converted','closed','cancelled')),
    CONSTRAINT pr_type_chk          CHECK (requisition_type IN (
        'standard','urgent','blanket','framework_call_off','capex')),
    CONSTRAINT pr_check_chk         CHECK (budget_check_result IS NULL OR budget_check_result IN (
        'passed','warned','override','blocked','exempt')),
    CONSTRAINT pr_amount_nonneg     CHECK (total_amount >= 0),
    CONSTRAINT pr_currency_triad_chk CHECK (
        status = 'draft'
        OR (
            (currency_code = base_currency_code AND exchange_rate = 1.0)
            OR (currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0)
        )),
    CONSTRAINT pr_period_chk        CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 16),
    CONSTRAINT pr_terminal_status_chk CHECK (
        terminal_status IS NULL OR terminal_status IN ('CANCELED','REJECTED')),
    CONSTRAINT pr_status_source_chk CHECK (
        status_source IN ('manual','derived','system','terminal')),
    CONSTRAINT pr_version_self_chk  CHECK (previous_version_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.purchase_requisition IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_approval'',''approved'',''partially_converted'')). Internal purchase request. Approvable document. '
    'Pre-encumbrance at approval reserves budget before PO. '
    'Status: draft → pending_approval → approved → partially_converted → fully_converted.';


-- ============================================================================
-- §3.2  document.purchase_requisition_line
-- ============================================================================

COMMENT ON COLUMN document.purchase_requisition.fx_rate_snapshot IS
    'Explains how exchange_rate was resolved by fx.resolve_rate for request/base estimates.';

CREATE TABLE IF NOT EXISTS document.purchase_requisition_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent
    purchase_requisition_id uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Item
    item_id                 uuid,
    item_description        text            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'goods',
    line_type               text            NOT NULL DEFAULT 'noncatalog',
    commodity_category_id   uuid,
    business_intent_id      uuid,
    classification_decision jsonb,
    asset_class_id          uuid,

    -- Quantity / price
    uom_code                text            NOT NULL,
    quantity                numeric(18,4)   NOT NULL,
    unit_price              numeric(18,4)   NOT NULL DEFAULT 0,
    price_unit              numeric(18,4)   NOT NULL DEFAULT 1,
    currency_code           character(3)    NOT NULL,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                (quantity * unit_price) / NULLIF(price_unit, 0)
                            ) STORED,
    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,
    gross_amount            numeric(18,4)   GENERATED ALWAYS AS (
                                ((quantity * unit_price) / NULLIF(price_unit, 0))
                                + tax_amount - withholding_tax_amount
                            ) STORED,

    -- Tax
    tax_group_id            uuid,
    withholding_tax_group_id uuid,
    to_tax_jurisdiction_id  uuid,
    from_tax_jurisdiction_id uuid,

    -- Delivery
    required_by_date        date,
    site_id                 uuid,
    warehouse_id            uuid,
    storage_location        text,
    shipto_address_id       uuid,
    billto_address_id       uuid,
    billfrom_address_id     uuid,
    supplier_id             uuid,
    shipfrom_address_id     uuid,
    remitto_address_id      uuid,

    -- Suggested supplier
    suggested_supplier_ids  uuid[],
    over_delivery_tolerance  numeric(5,2)   DEFAULT 0,
    under_delivery_tolerance numeric(5,2)   DEFAULT 0,

    -- Conversion tracking
    committed_quantity      numeric(18,4)   NOT NULL DEFAULT 0,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'open',

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT prl_pkey             PRIMARY KEY (id),
    CONSTRAINT prl_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT prl_line_no_uq       UNIQUE (purchase_requisition_id, line_no),
    CONSTRAINT prl_line_no_chk      CHECK (line_no > 0),
    CONSTRAINT prl_qty_pos          CHECK (quantity > 0),
    CONSTRAINT prl_price_nonneg     CHECK (unit_price >= 0),
    CONSTRAINT prl_price_unit_pos   CHECK (price_unit > 0),
    CONSTRAINT prl_tax_nonneg       CHECK (tax_amount >= 0),
    CONSTRAINT prl_wht_nonneg       CHECK (withholding_tax_amount >= 0),
    CONSTRAINT prl_proc_type_chk    CHECK (procurement_type IN ('goods','services')),
    CONSTRAINT prl_line_type_chk    CHECK (line_type IN ('contract','catalog','marketplace','noncatalog')),
    CONSTRAINT prl_status_chk       CHECK (status IN (
        'open','partially_converted','converted','cancelled')),
    CONSTRAINT prl_committed_chk    CHECK (committed_quantity >= 0 AND committed_quantity <= quantity),
    CONSTRAINT prl_tolerance_chk    CHECK (
        (over_delivery_tolerance IS NULL OR over_delivery_tolerance >= 0)
        AND (under_delivery_tolerance IS NULL OR under_delivery_tolerance >= 0))
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'document' AND table_name = 'purchase_requisition_line'
          AND column_name = 'spend_category_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'document' AND table_name = 'purchase_requisition_line'
          AND column_name = 'commodity_category_id'
    ) THEN
        ALTER TABLE document.purchase_requisition_line RENAME COLUMN spend_category_id TO commodity_category_id;
    END IF;
END $$;

COMMENT ON TABLE document.purchase_requisition_line IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Purchase requisition line items. '
    'Phase 1 reset uses unit_price/net_amount and committed_quantity; remaining quantity is derived by views or services.';


-- ============================================================================
-- §6  document.purchase_order_confirmation  (supplier artifact – not approvable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.purchase_order_confirmation (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL DEFAULT '',
    name                    text            NOT NULL DEFAULT '',
    company_code_id         uuid            NOT NULL,

    -- Natural key
    confirmation_number     text            NOT NULL,

    -- Parent commitment + supplier
    commitment_id           uuid,
    supplier_id             uuid            NOT NULL,

    -- Supplier details
    supplier_reference_number text,
    supplier_confirmation_date date,
    confirmation_type       text            NOT NULL DEFAULT 'FULL_CONFIRM',

    -- Document date + amounts
    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    currency_code           character(3)    NOT NULL,
    confirmed_total_amount  numeric(18,4)   NOT NULL DEFAULT 0,

    -- Amendment
    amendment_commitment_id uuid,

    -- Notes & metadata
    notes                   text,
    source_summary          jsonb           NOT NULL DEFAULT '{}'::jsonb,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'received',

    -- Versioning (universal — see docs/architecture/p2p.md §Universal-Columns)
    row_version             bigint          NOT NULL DEFAULT 1,
    version_number          int             NOT NULL DEFAULT 1,
    previous_version_id     uuid,
    is_current_version      boolean         NOT NULL DEFAULT true,
    supersedes_at           timestamptz,

    -- Closure (universal)
    terminal_status         text,
    status_source           text            NOT NULL DEFAULT 'manual',

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT poc_pkey             PRIMARY KEY (id),
    CONSTRAINT poc_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT poc_tenant_number_uq UNIQUE (tenant_id, company_code_id, confirmation_number),
    CONSTRAINT poc_status_chk       CHECK (status IN (
        'received','confirmed','changes_proposed','changes_accepted',
        'changes_rejected','rejected','cancelled')),
    CONSTRAINT poc_type_chk         CHECK (confirmation_type IN (
        'FULL_CONFIRM','PARTIAL_CONFIRM','CHANGE_PROPOSAL','REJECTION')),
    CONSTRAINT poc_terminal_status_chk CHECK (
        terminal_status IS NULL OR terminal_status IN ('CANCELED','REJECTED')),
    CONSTRAINT poc_status_source_chk   CHECK (
        status_source IN ('manual','derived','system','terminal')),
    CONSTRAINT poc_version_self_chk    CHECK (previous_version_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.purchase_order_confirmation IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Supplier acknowledgement of a PO. Not approvable. '
    'Supplier change proposals route approval through a commitment amendment, not this table.';


-- ============================================================================
-- §6  document.purchase_order_confirmation_line
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.purchase_order_confirmation_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent
    confirmation_id         uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Commitment line reference
    commitment_line_id      uuid            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'goods',
    line_type               text            NOT NULL DEFAULT 'noncatalog',

    -- Confirmed values
    confirmed_quantity      numeric(18,4)   NOT NULL,
    confirmed_unit_price    numeric(18,4)   NOT NULL,
    confirmed_delivery_date date,

    -- Variances
    quantity_variance       numeric(18,4)   NOT NULL DEFAULT 0,
    price_variance          numeric(18,4)   NOT NULL DEFAULT 0,

    -- Line status
    line_status             text            NOT NULL DEFAULT 'confirmed',
    supplier_notes          text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Versioning (universal)
    row_version             bigint          NOT NULL DEFAULT 1,

    -- Audit (append-only)
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,

    CONSTRAINT pocl_pkey            PRIMARY KEY (id),
    CONSTRAINT pocl_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT pocl_line_uq         UNIQUE (confirmation_id, line_no),
    CONSTRAINT pocl_line_no_chk     CHECK (line_no > 0),
    CONSTRAINT pocl_qty_pos         CHECK (confirmed_quantity > 0),
    CONSTRAINT pocl_price_nonneg    CHECK (confirmed_unit_price >= 0),
    CONSTRAINT pocl_proc_type_chk   CHECK (procurement_type IN ('goods','services')),
    CONSTRAINT pocl_line_type_chk   CHECK (line_type IN ('contract','catalog','marketplace','noncatalog')),
    CONSTRAINT pocl_line_status_chk CHECK (line_status IN (
        'confirmed','changed','rejected','partial'))
);

COMMENT ON TABLE document.purchase_order_confirmation_line IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Per-line supplier confirmation values and variances. '
    'Append-only — new confirmation supersedes prior via parent confirmation_id.';


-- ============================================================================
-- §7  document.delivery_note  (logistics artifact – not approvable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.delivery_note (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL DEFAULT '',
    name                    text            NOT NULL DEFAULT '',
    company_code_id         uuid            NOT NULL,

    -- Natural key
    delivery_note_number    text            NOT NULL,

    -- Commitment + supplier
    commitment_id           uuid            NOT NULL,
    supplier_id             uuid            NOT NULL,

    -- Supplier references
    supplier_delivery_note_no text,
    supplier_dispatch_date    date,
    bill_of_lading_no       text,
    tracking_number         text,

    -- Dates
    delivery_date           date            NOT NULL DEFAULT CURRENT_DATE,
    expected_arrival_date   date,
    actual_arrival_date     date,

    -- Delivery location
    delivery_site_id        uuid            NOT NULL,
    delivery_warehouse_id   uuid,

    -- Carrier
    carrier_name            text,
    transport_mode          text,

    -- Inspection
    requires_inspection     boolean         NOT NULL DEFAULT false,
    inspection_status       text,

    -- Receipt status
    is_fully_receipted      boolean         NOT NULL DEFAULT false,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    -- Notes & metadata
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'draft',

    -- Versioning (universal — see docs/architecture/p2p.md §Universal-Columns)
    row_version             bigint          NOT NULL DEFAULT 1,
    version_number          int             NOT NULL DEFAULT 1,
    previous_version_id     uuid,
    is_current_version      boolean         NOT NULL DEFAULT true,
    supersedes_at           timestamptz,

    -- Closure (universal)
    terminal_status         text,
    status_source           text            NOT NULL DEFAULT 'manual',

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT dn_pkey              PRIMARY KEY (id),
    CONSTRAINT dn_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT dn_tenant_number_uq  UNIQUE (tenant_id, company_code_id, delivery_note_number),
    CONSTRAINT dn_amount_nonneg     CHECK (total_amount >= 0),
    CONSTRAINT dn_status_chk        CHECK (status IN (
        'draft','in_transit','arrived','partially_receipted',
        'fully_receipted','returned','cancelled')),
    CONSTRAINT dn_terminal_status_chk CHECK (
        terminal_status IS NULL OR terminal_status IN ('CANCELED','REJECTED')),
    CONSTRAINT dn_status_source_chk   CHECK (
        status_source IN ('manual','derived','system','terminal')),
    CONSTRAINT dn_version_self_chk    CHECK (previous_version_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.delivery_note IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Logistics delivery note from supplier. '
    'Not approvable. Drives receipt creation on arrival.';


-- ============================================================================
-- §7  document.delivery_note_line
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.delivery_note_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Parent
    delivery_note_id        uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Commitment line
    commitment_line_id      uuid            NOT NULL,

    -- Item
    item_id                 uuid,
    item_description        text            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'goods',
    line_type               text            NOT NULL DEFAULT 'noncatalog',

    -- Quantity
    uom_code                text            NOT NULL,
    shipped_quantity        numeric(18,4)   NOT NULL,
    received_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    damaged_quantity        numeric(18,4)   NOT NULL DEFAULT 0,
    rejected_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    accepted_quantity       numeric(18,4)   GENERATED ALWAYS AS (
                                received_quantity - damaged_quantity - rejected_quantity
                            ) STORED,

    -- Lot / batch / serial tracking
    lot_number              text,
    serial_numbers          text[],
    batch_number            text,
    expiry_date             date,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT dnl_pkey             PRIMARY KEY (id),
    CONSTRAINT dnl_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT dnl_line_uq          UNIQUE (delivery_note_id, line_no),
    CONSTRAINT dnl_line_no_chk      CHECK (line_no > 0),
    CONSTRAINT dnl_shipped_pos      CHECK (shipped_quantity > 0),
    CONSTRAINT dnl_received_nonneg  CHECK (received_quantity >= 0),
    CONSTRAINT dnl_damaged_nonneg   CHECK (damaged_quantity >= 0),
    CONSTRAINT dnl_rejected_nonneg  CHECK (rejected_quantity >= 0),
    CONSTRAINT dnl_proc_type_chk    CHECK (procurement_type IN ('goods','services')),
    CONSTRAINT dnl_line_type_chk    CHECK (line_type IN ('contract','catalog','marketplace','noncatalog')),
    CONSTRAINT dnl_qty_chk          CHECK (
        damaged_quantity + rejected_quantity <= received_quantity)
);

COMMENT ON TABLE document.delivery_note_line IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Delivery note line items. '
    'accepted_quantity GENERATED (received - damaged - rejected). Tracks lot/batch/serial.';


-- ============================================================================
-- §8  document.receipt  (approvable – triggers inventory + accrual)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.receipt (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL DEFAULT '',
    name                    text            NOT NULL DEFAULT '',
    company_code_id         uuid            NOT NULL,

    -- Request / approval
    requested_by            uuid            NOT NULL,

    -- Commitment + delivery
    commitment_id           uuid            NOT NULL,
    delivery_note_id        uuid,
    supplier_id             uuid            NOT NULL,

    -- Dates
    received_date           date            NOT NULL DEFAULT CURRENT_DATE,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    fx_rate_snapshot        jsonb,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    -- Posting
    accrual_je_id           uuid,

    -- Workflow
    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','posted')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Versioning (universal — see docs/architecture/p2p.md §Universal-Columns)
    row_version             bigint          NOT NULL DEFAULT 1,
    version_number          int             NOT NULL DEFAULT 1,
    previous_version_id     uuid,
    is_current_version      boolean         NOT NULL DEFAULT true,
    supersedes_at           timestamptz,

    -- Closure (universal)
    terminal_status         text,
    status_source           text            NOT NULL DEFAULT 'manual',

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT rcp_pkey             PRIMARY KEY (id),
    CONSTRAINT rcp_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT rcp_tenant_code_uq   UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT rcp_code_nonempty    CHECK (btrim(code) <> ''),
    CONSTRAINT rcp_status_chk       CHECK (status IN (
        'draft','pending_approval','approved','posted','reversed','cancelled')),
    CONSTRAINT rcp_period_chk       CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT rcp_amount_nonneg    CHECK (total_amount >= 0),
    CONSTRAINT rcp_currency_triad_chk CHECK (
        status = 'draft'
        OR (
            (currency_code = base_currency_code AND exchange_rate = 1.0)
            OR (currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0)
        )),
    CONSTRAINT rcp_terminal_status_chk CHECK (
        terminal_status IS NULL OR terminal_status IN ('CANCELED','REJECTED')),
    CONSTRAINT rcp_status_source_chk   CHECK (
        status_source IN ('manual','derived','system','terminal')),
    CONSTRAINT rcp_version_self_chk    CHECK (previous_version_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.receipt IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_approval'',''approved'',''posted'')). Approvable receipt (formerly goods_receipt). On posting: ledger.inventory_movement (RECEIPT), '
    'ledger.inventory_valuation_layer, GR/IR accrual JE, ledger.commitment_fulfillment. '
    'Updates commitment_line.received_quantity cache via trigger.';

ALTER TABLE document.receipt
    ALTER COLUMN commitment_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS source_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN document.receipt.commitment_id IS
    'Optional source hint for simple 1:1 PO receipts. Multi-PO receiving is modeled at receipt_line source columns.';
COMMENT ON COLUMN document.receipt.source_summary IS
    'Derived source summary for source-document creation flows, e.g. distinct source PO ids/supplier/delivery context. Not the source of truth.';


-- ============================================================================
-- §8.1  document.receipt_line
-- ============================================================================

COMMENT ON COLUMN document.receipt.fx_rate_snapshot IS
    'Explains how exchange_rate was resolved by fx.resolve_rate; fixed-rate commitments are inherited, otherwise posting-date spot is used.';

CREATE TABLE IF NOT EXISTS document.receipt_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Parent
    receipt_id              uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Commitment + delivery links
    commitment_line_id      uuid            NOT NULL,
    delivery_note_line_id   uuid,
    source_doc_entity       text            NOT NULL DEFAULT 'purchase_order',
    source_doc_id           uuid,
    source_line_id          uuid,
    source_schedule_id      uuid,
    source_line_version     bigint,

    -- Item
    item_id                 uuid            NOT NULL,
    item_description        text            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'goods',
    line_type               text            NOT NULL DEFAULT 'noncatalog',

    -- Quantity
    uom_code                text            NOT NULL,
    received_quantity       numeric(18,4)   NOT NULL,
    accepted_quantity       numeric(18,4)   NOT NULL,
    rejected_quantity       numeric(18,4)   NOT NULL DEFAULT 0,

    -- Price
    unit_price              numeric(18,4)   NOT NULL,
    price_unit              numeric(18,4)   NOT NULL DEFAULT 1,
    currency_code           character(3)    NOT NULL,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                (accepted_quantity * unit_price) / NULLIF(price_unit, 0)
                            ) STORED,
    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,
    gross_amount            numeric(18,4)   GENERATED ALWAYS AS (
                                ((accepted_quantity * unit_price) / NULLIF(price_unit, 0))
                                + tax_amount - withholding_tax_amount
                            ) STORED,

    -- Tax / address bundle
    tax_group_id            uuid,
    withholding_tax_group_id uuid,
    to_tax_jurisdiction_id  uuid,
    from_tax_jurisdiction_id uuid,
    site_id                 uuid,

    -- Storage location
    warehouse_id            uuid            NOT NULL,
    storage_location        text,
    shipto_address_id       uuid,
    billto_address_id       uuid,
    billfrom_address_id     uuid,
    supplier_id             uuid,
    shipfrom_address_id     uuid,
    remitto_address_id      uuid,

    -- Lot / batch / serial tracking
    lot_number              text,
    serial_numbers          jsonb,
    batch_number            text,
    expiry_date             date,

    -- Accounting dimensions live on document.accounting_distribution.

    -- Populated at posting time
    inventory_movement_id   uuid,

    -- Asset (NULL = non-asset line; non-NULL = line acquires an asset of this class)
    asset_class_id          uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT rcpl_pkey            PRIMARY KEY (id),
    CONSTRAINT rcpl_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT rcpl_line_uq         UNIQUE (receipt_id, line_no),
    CONSTRAINT rcpl_line_no_chk     CHECK (line_no > 0),
    CONSTRAINT rcpl_qty_pos         CHECK (received_quantity > 0),
    CONSTRAINT rcpl_accepted_nonneg CHECK (accepted_quantity >= 0),
    CONSTRAINT rcpl_rejected_nonneg CHECK (rejected_quantity >= 0),
    CONSTRAINT rcpl_qty_chk         CHECK (
        accepted_quantity + rejected_quantity <= received_quantity),
    CONSTRAINT rcpl_price_nonneg    CHECK (unit_price >= 0),
    CONSTRAINT rcpl_price_unit_pos  CHECK (price_unit > 0),
    CONSTRAINT rcpl_tax_nonneg      CHECK (tax_amount >= 0),
    CONSTRAINT rcpl_wht_nonneg      CHECK (withholding_tax_amount >= 0),
    CONSTRAINT rcpl_proc_type_chk   CHECK (procurement_type IN ('goods','services')),
    CONSTRAINT rcpl_line_type_chk   CHECK (line_type IN ('contract','catalog','marketplace','noncatalog'))
);

COMMENT ON TABLE document.receipt_line IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Receipt line items. '
    'net_amount GENERATED (accepted_quantity × unit_price). Populated with inventory_movement_id + fulfillment_id at posting.';
COMMENT ON COLUMN document.receipt_line.commitment_line_id IS
    'Legacy/canonical PO commitment-line source for PO-based receiving. Kept required for current PO receipt flow.';
COMMENT ON COLUMN document.receipt_line.source_doc_entity IS
    'Source entity code for source-document creation. Defaults to purchase_order; future flows may use polymorphic sources.';
COMMENT ON COLUMN document.receipt_line.source_doc_id IS
    'Source document id, e.g. purchase_order id. Line-level to support multi-PO receipts.';
COMMENT ON COLUMN document.receipt_line.source_line_id IS
    'Source line id, e.g. commitment_line id for PO receiving.';
COMMENT ON COLUMN document.receipt_line.source_schedule_id IS
    'Optional source schedule id when receiving against a delivery schedule.';
COMMENT ON COLUMN document.receipt_line.source_line_version IS
    'Optimistic concurrency token captured from source line during source selection and checked at receipt submit.';

ALTER TABLE document.receipt_line
    ADD COLUMN IF NOT EXISTS source_doc_entity text NOT NULL DEFAULT 'purchase_order',
    ADD COLUMN IF NOT EXISTS source_doc_id uuid,
    ADD COLUMN IF NOT EXISTS source_line_id uuid,
    ADD COLUMN IF NOT EXISTS source_schedule_id uuid,
    ADD COLUMN IF NOT EXISTS source_line_version bigint;


-- ============================================================================
-- §8.2  document.service_sheet  (approvable – two-step)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.service_sheet (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL DEFAULT '',
    name                    text            NOT NULL DEFAULT '',
    company_code_id         uuid            NOT NULL,

    -- Request / approval
    requested_by            uuid            NOT NULL,

    -- Natural key
    service_sheet_number    text            NOT NULL,

    -- Commitment + supplier
    commitment_id           uuid            NOT NULL,
    supplier_id             uuid            NOT NULL,

    -- Dates
    service_date            date            NOT NULL DEFAULT CURRENT_DATE,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,
    service_period_from     date            NOT NULL,
    service_period_to       date            NOT NULL,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    fx_rate_snapshot        jsonb,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    -- Posting
    accrual_je_id           uuid,

    -- Acceptance
    accepted_by             uuid,
    accepted_at             timestamptz,

    -- Workflow
    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_acceptance','accepted',
                                           'pending_approval','approved','posted')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Versioning (universal — see docs/architecture/p2p.md §Universal-Columns)
    row_version             bigint          NOT NULL DEFAULT 1,
    version_number          int             NOT NULL DEFAULT 1,
    previous_version_id     uuid,
    is_current_version      boolean         NOT NULL DEFAULT true,
    supersedes_at           timestamptz,

    -- Closure (universal)
    terminal_status         text,
    status_source           text            NOT NULL DEFAULT 'manual',
    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ssh_pkey              PRIMARY KEY (id),
    CONSTRAINT ssh_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ssh_tenant_number_uq  UNIQUE (tenant_id, company_code_id, service_sheet_number),
    CONSTRAINT ssh_status_chk        CHECK (status IN (
        'draft','pending_acceptance','accepted','pending_approval',
        'approved','posted','reversed','cancelled')),
    CONSTRAINT ssh_period_range_chk  CHECK (service_period_to >= service_period_from),
    CONSTRAINT ssh_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT ssh_amount_nonneg     CHECK (total_amount >= 0),
    CONSTRAINT ssh_currency_triad_chk CHECK (
        status = 'draft'
        OR (
            (currency_code = base_currency_code AND exchange_rate = 1.0)
            OR (currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0)
        )),
    CONSTRAINT ssh_terminal_status_chk CHECK (
        terminal_status IS NULL OR terminal_status IN ('CANCELED','REJECTED')),
    CONSTRAINT ssh_status_source_chk   CHECK (
        status_source IN ('manual','derived','system','terminal')),
    CONSTRAINT ssh_version_self_chk    CHECK (previous_version_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.service_sheet IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_acceptance'',''accepted'',''pending_approval'',''approved'',''posted'')). Approvable service sheet (formerly service_entry_sheet). Two-step: acceptance by requestor (pending_acceptance→accepted), '
    'then finance approval (pending_approval→approved). '
    'On posting: accrual JE (Dr Expense, Cr SES Clearing) + ledger.commitment_fulfillment.';


-- ============================================================================
-- §8.3  document.service_sheet_line
-- ============================================================================

COMMENT ON COLUMN document.service_sheet.fx_rate_snapshot IS
    'Explains how exchange_rate was resolved by fx.resolve_rate; fixed-rate commitments are inherited, otherwise posting-date spot is used.';

CREATE TABLE IF NOT EXISTS document.service_sheet_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Parent
    service_sheet_id        uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Commitment line
    commitment_line_id      uuid            NOT NULL,

    -- Service description
    item_id                 uuid,
    item_description        text            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'services',
    line_type               text            NOT NULL DEFAULT 'noncatalog',

    -- Quantity / price
    uom_code                text            NOT NULL,
    quantity                numeric(18,4)   NOT NULL,
    unit_price              numeric(18,4)   NOT NULL,
    price_unit              numeric(18,4)   NOT NULL DEFAULT 1,
    currency_code           character(3)    NOT NULL,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                (quantity * unit_price) / NULLIF(price_unit, 0)
                            ) STORED,

    -- Milestone
    completion_pct          numeric(5,2),
    milestone_name          text,

    -- Tax (line-level resolution + jurisdictions)
    tax_group_id            uuid,
    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_group_id uuid,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,
    to_tax_jurisdiction_id  uuid,
    from_tax_jurisdiction_id uuid,
    gross_amount            numeric(18,4)   GENERATED ALWAYS AS (
                                ((quantity * unit_price) / NULLIF(price_unit, 0))
                                + tax_amount - withholding_tax_amount
                            ) STORED,

    -- Line-level location + addresses (override header)
    site_id                 uuid,
    warehouse_id            uuid,
    storage_location        text,
    shipto_address_id       uuid,
    billto_address_id       uuid,
    billfrom_address_id     uuid,
    supplier_id             uuid,
    shipfrom_address_id     uuid,
    remitto_address_id      uuid,

    -- Accounting dimensions live on document.accounting_distribution.

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT sshl_pkey            PRIMARY KEY (id),
    CONSTRAINT sshl_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT sshl_line_uq         UNIQUE (service_sheet_id, line_no),
    CONSTRAINT sshl_line_no_chk     CHECK (line_no > 0),
    CONSTRAINT sshl_qty_pos         CHECK (quantity > 0),
    CONSTRAINT sshl_price_nonneg    CHECK (unit_price >= 0),
    CONSTRAINT sshl_price_unit_pos   CHECK (price_unit > 0),
    CONSTRAINT sshl_tax_nonneg      CHECK (tax_amount >= 0),
    CONSTRAINT sshl_wht_nonneg      CHECK (withholding_tax_amount >= 0),
    CONSTRAINT sshl_proc_type_chk   CHECK (procurement_type IN ('goods','services')),
    CONSTRAINT sshl_line_type_chk   CHECK (line_type IN ('contract','catalog','marketplace','noncatalog')),
    CONSTRAINT sshl_pct_chk         CHECK (
        completion_pct IS NULL OR completion_pct BETWEEN 0 AND 100)
);

COMMENT ON TABLE document.service_sheet_line IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Service sheet line items. '
    'net_amount GENERATED (quantity × unit_price). Populated with fulfillment_id at posting.';
