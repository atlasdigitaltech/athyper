-- 04_tables/004i_document_p2p.sql
-- Scope: Procure-to-Pay (P2P) procurement document tables
-- Domain: purchase_requisition, purchase_requisition_line,
--         purchase_order_confirmation, purchase_order_confirmation_line,
--         delivery_note, delivery_note_line,
--         goods_receipt, goods_receipt_line,
--         service_entry_sheet, service_entry_sheet_line
-- Depends on: 01_schemas, 04_tables/003_master.sql,
--             04_tables/004_document.sql (workflow_request),
--             04_tables/004b_document_commitment.sql (commitment, commitment_line)
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
    requisition_type        text            NOT NULL DEFAULT 'STANDARD',
    description             text,
    priority                text            NOT NULL DEFAULT 'normal',

    -- Requestor
    requested_by            uuid            NOT NULL,
    requested_for           uuid,

    -- Dates
    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    required_by_date        date,

    -- Suggested supplier
    suggested_supplier_id   uuid,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    total_estimated_amount  numeric(18,4)   NOT NULL DEFAULT 0,

    -- Budget
    budget_allocation_id    uuid,
    budget_check_result     text,

    -- Encumbrance
    encumbrance_type        text            NOT NULL DEFAULT 'PRE_ENCUMBRANCE',
    is_encumbered           boolean         NOT NULL DEFAULT false,
    encumbrance_je_id       uuid,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_number           smallint,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    -- Conversion tracking
    is_fully_converted      boolean         NOT NULL DEFAULT false,
    converted_po_count      smallint        NOT NULL DEFAULT 0,

    -- Approval
    approved_at             timestamptz,
    approved_by             uuid,
    workflow_request_id     uuid,

    -- Line count
    line_count              smallint        NOT NULL DEFAULT 0,

    -- Close
    closed_at               timestamptz,
    closed_by               uuid,
    close_reason            text,

    -- Notes
    notes                   text,

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
        'STANDARD','URGENT','BLANKET','FRAMEWORK_CALL_OFF','CAPEX')),
    CONSTRAINT pr_check_chk         CHECK (budget_check_result IS NULL OR budget_check_result IN (
        'PASSED','WARNED','OVERRIDE','BLOCKED','EXEMPT')),
    CONSTRAINT pr_encumbrance_chk   CHECK (encumbrance_type IN (
        'NONE','PRE_ENCUMBRANCE','STATISTICAL_ONLY')),
    CONSTRAINT pr_amount_nonneg     CHECK (total_estimated_amount >= 0),
    CONSTRAINT pr_period_chk        CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 16)
);

COMMENT ON TABLE document.purchase_requisition IS
    'Internal purchase request. Approvable document. '
    'Pre-encumbrance at approval reserves budget before PO. '
    'Status: draft → pending_approval → approved → partially_converted → fully_converted.';


-- ============================================================================
-- §3.2  document.purchase_requisition_line
-- ============================================================================

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
    spend_category_id       uuid,
    business_intent_id      uuid,

    -- Quantity / price
    uom_code                text            NOT NULL,
    quantity                numeric(18,4)   NOT NULL,
    estimated_unit_price    numeric(18,4)   NOT NULL DEFAULT 0,
    currency_code           character(3)    NOT NULL,
    estimated_amount        numeric(18,4)   GENERATED ALWAYS AS (
                                quantity * estimated_unit_price
                            ) STORED,

    -- Tax
    tax_group_id            uuid,

    -- Delivery
    required_by_date        date,
    delivery_site_id        uuid,
    delivery_warehouse_id   uuid,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    -- Suggested supplier
    suggested_supplier_id   uuid,

    -- Conversion tracking
    converted_quantity      numeric(18,4)   NOT NULL DEFAULT 0,
    remaining_quantity      numeric(18,4)   GENERATED ALWAYS AS (
                                quantity - converted_quantity
                            ) STORED,

    -- Notes & metadata
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
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
    CONSTRAINT prl_price_nonneg     CHECK (estimated_unit_price >= 0),
    CONSTRAINT prl_proc_type_chk    CHECK (procurement_type IN ('goods','services','mixed')),
    CONSTRAINT prl_status_chk       CHECK (status IN (
        'open','partially_converted','converted','cancelled')),
    CONSTRAINT prl_converted_chk    CHECK (converted_quantity >= 0 AND converted_quantity <= quantity)
);


-- ============================================================================
-- §6  document.purchase_order_confirmation  (supplier artifact – not approvable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.purchase_order_confirmation (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Natural key
    confirmation_number     text            NOT NULL,

    -- Parent commitment + supplier
    commitment_id           uuid            NOT NULL,
    supplier_id             uuid            NOT NULL,

    -- Vendor details
    vendor_reference_number text,
    vendor_confirmation_date date,
    confirmation_type       text            NOT NULL DEFAULT 'FULL_CONFIRM',

    -- Document date + amounts
    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    currency_code           character(3)    NOT NULL,
    confirmed_total_amount  numeric(18,4)   NOT NULL DEFAULT 0,

    -- Amendment
    amendment_commitment_id uuid,

    -- Notes & metadata
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'received',

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
        'FULL_CONFIRM','PARTIAL_CONFIRM','CHANGE_PROPOSAL','REJECTION'))
);

COMMENT ON TABLE document.purchase_order_confirmation IS
    'Supplier acknowledgement of a PO. Not approvable. '
    'Vendor change proposals route approval through a commitment amendment, not this table.';


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

    -- Confirmed values
    confirmed_quantity      numeric(18,4)   NOT NULL,
    confirmed_unit_price    numeric(18,4)   NOT NULL,
    confirmed_delivery_date date,

    -- Variances
    quantity_variance       numeric(18,4)   NOT NULL DEFAULT 0,
    price_variance          numeric(18,4)   NOT NULL DEFAULT 0,

    -- Line status
    line_status             text            NOT NULL DEFAULT 'confirmed',
    vendor_notes            text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit (append-only)
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,

    CONSTRAINT pocl_pkey            PRIMARY KEY (id),
    CONSTRAINT pocl_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT pocl_line_uq         UNIQUE (confirmation_id, line_no),
    CONSTRAINT pocl_line_no_chk     CHECK (line_no > 0),
    CONSTRAINT pocl_qty_pos         CHECK (confirmed_quantity > 0),
    CONSTRAINT pocl_price_nonneg    CHECK (confirmed_unit_price >= 0),
    CONSTRAINT pocl_line_status_chk CHECK (line_status IN (
        'confirmed','changed','rejected','partial'))
);


-- ============================================================================
-- §7  document.delivery_note  (logistics artifact – not approvable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.delivery_note (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Natural key
    delivery_note_number    text            NOT NULL,

    -- Commitment + supplier
    commitment_id           uuid            NOT NULL,
    supplier_id             uuid            NOT NULL,

    -- Vendor references
    vendor_delivery_note_no text,
    vendor_dispatch_date    date,
    bill_of_lading_no       text,
    tracking_number         text,

    -- Dates
    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
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
        'fully_receipted','returned','cancelled'))
);


-- ============================================================================
-- §7  document.delivery_note_line
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.delivery_note_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent
    delivery_note_id        uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Commitment line
    commitment_line_id      uuid            NOT NULL,

    -- Item
    item_id                 uuid,
    item_description        text            NOT NULL,

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

    -- Notes & metadata
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

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
    CONSTRAINT dnl_qty_chk          CHECK (
        damaged_quantity + rejected_quantity <= received_quantity),
    CONSTRAINT dnl_status_chk       CHECK (status IN (
        'open','partially_receipted','receipted','returned','cancelled'))
);


-- ============================================================================
-- §8  document.goods_receipt  (approvable – triggers inventory + accrual)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.goods_receipt (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Natural key
    receipt_number          text            NOT NULL,

    -- Commitment + delivery
    commitment_id           uuid            NOT NULL,
    delivery_note_id        uuid,
    supplier_id             uuid            NOT NULL,

    -- Dates
    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,

    -- Location
    receiving_site_id       uuid            NOT NULL,
    receiving_warehouse_id  uuid            NOT NULL,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    -- Posting
    accrual_je_id           uuid,
    is_posted               boolean         NOT NULL DEFAULT false,
    posted_at               timestamptz,
    posted_by               uuid,

    -- Reversal
    is_reversal             boolean         NOT NULL DEFAULT false,
    reversal_of_id          uuid,

    -- Workflow
    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    -- Notes & metadata
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','posted')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT gr_pkey              PRIMARY KEY (id),
    CONSTRAINT gr_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT gr_tenant_number_uq  UNIQUE (tenant_id, company_code_id, receipt_number),
    CONSTRAINT gr_status_chk        CHECK (status IN (
        'draft','pending_approval','approved','posted','reversed','cancelled')),
    CONSTRAINT gr_posting_pair_chk  CHECK ((posted_at IS NULL) = (posted_by IS NULL)),
    CONSTRAINT gr_no_self_reversal  CHECK (reversal_of_id IS DISTINCT FROM id),
    CONSTRAINT gr_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT gr_amount_nonneg     CHECK (total_amount >= 0)
);

COMMENT ON TABLE document.goods_receipt IS
    'Approvable GR. On posting: ledger.inventory_movement (RECEIPT), '
    'ledger.inventory_valuation_layer, GR/IR accrual JE, ledger.commitment_fulfillment. '
    'Updates commitment_line.received_quantity cache via trigger.';


-- ============================================================================
-- §8.1  document.goods_receipt_line
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.goods_receipt_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent
    goods_receipt_id        uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Commitment + delivery links
    commitment_line_id      uuid            NOT NULL,
    delivery_note_line_id   uuid,

    -- Item
    item_id                 uuid            NOT NULL,
    item_description        text            NOT NULL,

    -- Quantity
    uom_code                text            NOT NULL,
    received_quantity       numeric(18,4)   NOT NULL,
    accepted_quantity       numeric(18,4)   NOT NULL,
    rejected_quantity       numeric(18,4)   NOT NULL DEFAULT 0,

    -- Price
    unit_price              numeric(18,4)   NOT NULL,
    currency_code           character(3)    NOT NULL,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                accepted_quantity * unit_price
                            ) STORED,

    -- Storage location
    warehouse_id            uuid            NOT NULL,
    storage_location        text,

    -- Lot / batch / serial tracking
    lot_number              text,
    serial_number           text,
    batch_number            text,
    expiry_date             date,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,

    -- Populated at posting time
    inventory_movement_id   uuid,
    fulfillment_id          uuid,

    -- Asset
    is_asset                boolean         NOT NULL DEFAULT false,
    asset_transaction_id    uuid,

    -- Notes & metadata
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT grl_pkey             PRIMARY KEY (id),
    CONSTRAINT grl_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT grl_line_uq          UNIQUE (goods_receipt_id, line_no),
    CONSTRAINT grl_line_no_chk      CHECK (line_no > 0),
    CONSTRAINT grl_qty_pos          CHECK (received_quantity > 0),
    CONSTRAINT grl_accepted_nonneg  CHECK (accepted_quantity >= 0),
    CONSTRAINT grl_rejected_nonneg  CHECK (rejected_quantity >= 0),
    CONSTRAINT grl_qty_chk          CHECK (
        accepted_quantity + rejected_quantity <= received_quantity),
    CONSTRAINT grl_price_nonneg     CHECK (unit_price >= 0),
    CONSTRAINT grl_status_chk       CHECK (status IN (
        'open','posted','reversed','cancelled'))
);


-- ============================================================================
-- §8.2  document.service_entry_sheet  (approvable – two-step)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.service_entry_sheet (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Natural key
    ses_number              text            NOT NULL,

    -- Commitment + supplier
    commitment_id           uuid            NOT NULL,
    supplier_id             uuid            NOT NULL,

    -- Dates
    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,
    service_period_from     date            NOT NULL,
    service_period_to       date            NOT NULL,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    -- Posting
    accrual_je_id           uuid,
    is_posted               boolean         NOT NULL DEFAULT false,
    posted_at               timestamptz,
    posted_by               uuid,

    -- Acceptance
    accepted_by             uuid,
    accepted_at             timestamptz,

    -- Reversal
    is_reversal             boolean         NOT NULL DEFAULT false,
    reversal_of_id          uuid,

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

    -- Notes & metadata
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ses_pkey              PRIMARY KEY (id),
    CONSTRAINT ses_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ses_tenant_number_uq  UNIQUE (tenant_id, company_code_id, ses_number),
    CONSTRAINT ses_status_chk        CHECK (status IN (
        'draft','pending_acceptance','accepted','pending_approval',
        'approved','posted','reversed','cancelled')),
    CONSTRAINT ses_period_range_chk  CHECK (service_period_to >= service_period_from),
    CONSTRAINT ses_no_self_reversal  CHECK (reversal_of_id IS DISTINCT FROM id),
    CONSTRAINT ses_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT ses_amount_nonneg     CHECK (total_amount >= 0)
);

COMMENT ON TABLE document.service_entry_sheet IS
    'Approvable SES. Two-step: acceptance by requestor (pending_acceptance→accepted), '
    'then finance approval (pending_approval→approved). '
    'On posting: accrual JE (Dr Expense, Cr GR/IR Clearing) + ledger.commitment_fulfillment.';


-- ============================================================================
-- §8.3  document.service_entry_sheet_line
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.service_entry_sheet_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent
    service_entry_sheet_id  uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Commitment line
    commitment_line_id      uuid            NOT NULL,

    -- Service description
    item_id                 uuid,
    service_description     text            NOT NULL,
    spend_category_id       uuid,
    business_intent_id      uuid,

    -- Quantity / price
    uom_code                text            NOT NULL,
    quantity                numeric(18,4)   NOT NULL,
    unit_price              numeric(18,4)   NOT NULL,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                quantity * unit_price
                            ) STORED,

    -- Milestone
    completion_pct          numeric(5,2),
    milestone_name          text,

    -- Tax
    tax_group_id            uuid,
    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,

    -- Populated at posting time
    fulfillment_id          uuid,

    -- Notes & metadata
    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT sesl_pkey            PRIMARY KEY (id),
    CONSTRAINT sesl_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT sesl_line_uq         UNIQUE (service_entry_sheet_id, line_no),
    CONSTRAINT sesl_line_no_chk     CHECK (line_no > 0),
    CONSTRAINT sesl_qty_pos         CHECK (quantity > 0),
    CONSTRAINT sesl_price_nonneg    CHECK (unit_price >= 0),
    CONSTRAINT sesl_tax_nonneg      CHECK (tax_amount >= 0),
    CONSTRAINT sesl_pct_chk         CHECK (
        completion_pct IS NULL OR completion_pct BETWEEN 0 AND 100),
    CONSTRAINT sesl_status_chk      CHECK (status IN (
        'open','posted','reversed','cancelled'))
);
