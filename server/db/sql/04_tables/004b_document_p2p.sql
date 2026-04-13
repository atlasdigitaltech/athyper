-- =============================================================================
-- 004b_document_p2p.sql  –  Procure-to-Pay (P2P) document tables
-- =============================================================================
-- Design ref : scc_p2p_final_merged.md  v4.0
-- Schema     : document  (all 27 tables)
-- Depends on : document.commitment, ledger.commitment_schedule,
--              ledger.commitment_fulfillment, ledger.inventory_movement,
--              document.journal_entry, document.workflow_request,
--              master.supplier, master.payment_term, master.payment_method,
--              master.spend_category, master.business_intent, master.gl_account,
--              master.site, master.warehouse, master.item, master.bank_account,
--              master.bank_account_link, master.company_code, master.tenant
-- =============================================================================
--
-- ENGINEERING NOTE – Foreign-key cardinality convention
-- ─────────────────────────────────────────────────────────────────────────────
-- Two FK shapes are used deliberately and must not be "unified" by future work:
--
--   Single-column UUID FK  (e.g. je_id, workflow_request_id, approval_instance_id)
--     Used for globally-unique orchestration and posting roots.  These IDs are
--     assigned by platform services that guarantee uniqueness across the whole
--     platform, so tenant_id is redundant in the FK.  Indexes on these columns
--     are also single-column for the same reason.
--
--   Tenant-scoped composite FK  (tenant_id, <entity_id>)
--     Used for all business records and transaction records (supplier, commitment,
--     purchase_invoice, goods_receipt, payment_entry, etc.).  Tenant scoping in
--     the FK is required here because the referenced tables are multi-tenant and
--     the composite enforces row-level isolation at the database layer.
--
-- The asymmetry between je_id (single) and supplier_id (composite) is intentional.
-- Do not add tenant_id to JE / workflow / approval FKs, and do not remove it
-- from business-record FKs.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.1  PURCHASE REQUISITION  (approvable)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.purchase_requisition (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL DEFAULT '',
    name                    text            NOT NULL DEFAULT '',
    company_code_id         uuid            NOT NULL,
    requisition_number      text            NOT NULL,

    requisition_type        text            NOT NULL DEFAULT 'STANDARD',
    description             text,
    priority                text            NOT NULL DEFAULT 'normal',

    requested_by            uuid            NOT NULL,
    requested_for           uuid,

    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    required_by_date        date,

    suggested_supplier_id   uuid,

    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    total_estimated_amount  numeric(18,4)   NOT NULL DEFAULT 0,

    budget_allocation_id    uuid,
    budget_check_result     text,

    encumbrance_type        text            NOT NULL DEFAULT 'PRE_ENCUMBRANCE',
    is_encumbered           boolean         NOT NULL DEFAULT false,
    encumbrance_je_id       uuid,

    fiscal_year             smallint        NOT NULL,
    period_number           smallint,

    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    is_fully_converted      boolean         NOT NULL DEFAULT false,
    converted_po_count      smallint        NOT NULL DEFAULT 0,

    approved_at             timestamptz,
    approved_by             uuid,
    workflow_request_id     uuid,

    line_count              smallint        NOT NULL DEFAULT 0,

    closed_at               timestamptz,
    closed_by               uuid,
    close_reason            text,

    notes                   text,
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','partially_converted')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

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

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.2  PURCHASE REQUISITION LINE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.purchase_requisition_line (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    purchase_requisition_id uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    item_id                 uuid,
    item_description        text            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'goods',
    spend_category_id       uuid,
    business_intent_id      uuid,

    uom_code                text            NOT NULL,
    quantity                numeric(18,4)   NOT NULL,
    estimated_unit_price    numeric(18,4)   NOT NULL DEFAULT 0,
    currency_code           character(3)    NOT NULL,
    estimated_amount        numeric(18,4)   GENERATED ALWAYS AS (
                                quantity * estimated_unit_price
                            ) STORED,

    tax_group_id            uuid,

    required_by_date        date,
    delivery_site_id        uuid,
    delivery_warehouse_id   uuid,

    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    suggested_supplier_id   uuid,

    converted_quantity      numeric(18,4)   NOT NULL DEFAULT 0,
    remaining_quantity      numeric(18,4)   GENERATED ALWAYS AS (
                                quantity - converted_quantity
                            ) STORED,

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

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

-- ─────────────────────────────────────────────────────────────────────────────
-- §4.1  COMMITMENT PROCUREMENT EXTENSION  (1:1 child of document.commitment)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.commitment_procurement (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    commitment_id           uuid            NOT NULL,

    requisition_id          uuid,

    parent_contract_id      uuid,
    is_release_order        boolean         NOT NULL DEFAULT false,
    release_sequence_no     smallint,

    supplier_id             uuid            NOT NULL,
    supplier_contact_name   text,
    buyer_id                uuid,

    incoterms_code          text,
    incoterms_location      text,
    freight_terms           text,

    delivery_address_id     uuid,
    billing_address_id      uuid,

    payment_term_id         uuid,
    payment_method_id       uuid,

    tax_treatment           text            DEFAULT 'STANDARD',
    withholding_tax_applicable boolean      NOT NULL DEFAULT false,

    gr_based_iv             boolean         NOT NULL DEFAULT true,
    service_based_iv        boolean         NOT NULL DEFAULT false,
    evaluated_receipt       boolean         NOT NULL DEFAULT false,

    -- Running totals (trigger-synced caches; source of truth in ledger/document children)
    line_count              smallint        NOT NULL DEFAULT 0,
    total_received_amount   numeric(18,4)   NOT NULL DEFAULT 0,
    total_invoiced_amount   numeric(18,4)   NOT NULL DEFAULT 0,
    total_paid_amount       numeric(18,4)   NOT NULL DEFAULT 0,

    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cp_pkey              PRIMARY KEY (id),
    CONSTRAINT cp_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT cp_commitment_uq     UNIQUE (commitment_id),
    CONSTRAINT cp_tax_treatment_chk CHECK (tax_treatment IS NULL OR tax_treatment IN (
        'STANDARD','ZERO_RATED','EXEMPT','REVERSE_CHARGE','OUT_OF_SCOPE')),
    CONSTRAINT cp_no_self_parent    CHECK (parent_contract_id IS DISTINCT FROM commitment_id),
    CONSTRAINT cp_received_nonneg   CHECK (total_received_amount >= 0),
    CONSTRAINT cp_invoiced_nonneg   CHECK (total_invoiced_amount >= 0),
    CONSTRAINT cp_paid_nonneg       CHECK (total_paid_amount >= 0)
);

COMMENT ON TABLE document.commitment_procurement IS
    'Procurement-commercial extension of document.commitment. 1:1 child. '
    'Running totals are derived caches, not source of truth. '
    'Source: ledger.commitment_fulfillment (receipts), document.purchase_invoice (invoices), '
    'document.payment_entry (payments).';

-- ─────────────────────────────────────────────────────────────────────────────
-- §4.2  COMMITMENT LINE  (PO / contract line items)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.commitment_line (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    commitment_id           uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    requisition_line_id     uuid,
    parent_contract_line_id uuid,

    item_id                 uuid,
    item_code               text,
    item_description        text            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'goods',
    spend_category_id       uuid,
    business_intent_id      uuid,

    uom_code                text            NOT NULL,
    quantity                numeric(18,4)   NOT NULL,
    over_delivery_tolerance  numeric(5,2)   DEFAULT 0,
    under_delivery_tolerance numeric(5,2)   DEFAULT 0,

    unit_price              numeric(18,4)   NOT NULL DEFAULT 0,
    price_unit              numeric(18,4)   NOT NULL DEFAULT 1,
    currency_code           character(3)    NOT NULL,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                (quantity * unit_price) / NULLIF(price_unit, 0)
                            ) STORED,
    discount_pct            numeric(5,2)    DEFAULT 0,
    discount_amount         numeric(18,4)   DEFAULT 0,

    tax_group_id            uuid,
    withholding_tax_group_id uuid,

    required_by_date        date,
    promised_date           date,
    delivery_site_id        uuid,
    delivery_warehouse_id   uuid,
    storage_location        text,

    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    is_asset                boolean         NOT NULL DEFAULT false,
    asset_category_id       uuid,

    -- Derived caches (trigger-synced)
    received_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    invoiced_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    remaining_quantity      numeric(18,4)   GENERATED ALWAYS AS (
                                quantity - received_quantity
                            ) STORED,

    -- Release caches (trigger-synced from commitment_release_allocation)
    released_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    released_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    remaining_release_qty   numeric(18,4)   GENERATED ALWAYS AS (
                                quantity - released_quantity
                            ) STORED,
    remaining_release_amt   numeric(18,4)   GENERATED ALWAYS AS (
                                (quantity * unit_price) / NULLIF(price_unit, 0) - released_amount
                            ) STORED,

    is_fully_received       boolean         NOT NULL DEFAULT false,
    is_fully_invoiced       boolean         NOT NULL DEFAULT false,
    is_closed               boolean         NOT NULL DEFAULT false,

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cl_pkey              PRIMARY KEY (id),
    CONSTRAINT cl_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT cl_line_no_uq        UNIQUE (commitment_id, line_no),
    CONSTRAINT cl_line_no_chk       CHECK (line_no > 0),
    CONSTRAINT cl_qty_pos           CHECK (quantity > 0),
    CONSTRAINT cl_price_nonneg      CHECK (unit_price >= 0),
    CONSTRAINT cl_price_unit_pos    CHECK (price_unit > 0),
    CONSTRAINT cl_proc_type_chk     CHECK (procurement_type IN ('goods','services','mixed')),
    CONSTRAINT cl_status_chk        CHECK (status IN (
        'open','partially_received','fully_received',
        'partially_invoiced','fully_invoiced','closed','cancelled')),
    CONSTRAINT cl_received_nonneg   CHECK (received_quantity >= 0),
    CONSTRAINT cl_invoiced_nonneg   CHECK (invoiced_quantity >= 0),
    CONSTRAINT cl_released_nonneg   CHECK (released_quantity >= 0),
    CONSTRAINT cl_tolerance_chk     CHECK (
        (over_delivery_tolerance IS NULL OR over_delivery_tolerance >= 0)
        AND (under_delivery_tolerance IS NULL OR under_delivery_tolerance >= 0)),
    CONSTRAINT cl_discount_chk      CHECK (discount_pct IS NULL OR discount_pct BETWEEN 0 AND 100),
    CONSTRAINT cl_no_self_parent    CHECK (parent_contract_line_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.commitment_line IS
    'PO / contract line items. Mutable operational detail – document schema, not ledger. '
    'received_quantity, invoiced_quantity, released_quantity are derived caches. '
    'Source of truth: ledger.commitment_fulfillment (receipts), '
    'document.commitment_release_allocation (blanket/framework releases).';

-- ─────────────────────────────────────────────────────────────────────────────
-- §4.3  COMMITMENT RELEASE ALLOCATION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.commitment_release_allocation (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    parent_commitment_id    uuid            NOT NULL,
    parent_line_id          uuid            NOT NULL,

    release_commitment_id   uuid            NOT NULL,
    release_line_id         uuid            NOT NULL,

    released_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    released_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    currency_code           character(3)    NOT NULL,

    released_at             timestamptz     NOT NULL DEFAULT now(),
    released_by             uuid            NOT NULL,

    status                  text            NOT NULL DEFAULT 'active',
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cra_pkey             PRIMARY KEY (id),
    CONSTRAINT cra_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT cra_release_line_uq  UNIQUE (release_commitment_id, release_line_id),
    CONSTRAINT cra_qty_nonneg       CHECK (released_quantity >= 0),
    CONSTRAINT cra_amt_nonneg       CHECK (released_amount >= 0),
    CONSTRAINT cra_status_chk       CHECK (status IN ('active','cancelled','superseded')),
    CONSTRAINT cra_no_self_release  CHECK (parent_commitment_id <> release_commitment_id)
);

COMMENT ON TABLE document.commitment_release_allocation IS
    'Tracks qty/amount drawn from parent BLANKET_PO or FRAMEWORK_AGREEMENT line '
    'by each release PO line. Source of truth for release exhaustion checks.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §5.1  COMMITMENT PARTY SNAPSHOT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.commitment_party_snapshot (
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,
    commitment_id       uuid            NOT NULL,
    snapshot_type       text            NOT NULL DEFAULT 'SUPPLIER',

    party_id            uuid            NOT NULL,
    party_code          text            NOT NULL,
    party_name          text            NOT NULL,
    tax_registration_no text,
    legal_entity_name   text,
    country_code        character(2),

    contact_name        text,
    contact_email       text,
    contact_phone       text,

    captured_at         timestamptz     NOT NULL DEFAULT now(),
    captured_by         uuid            NOT NULL,
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT cps_pkey                 PRIMARY KEY (id),
    CONSTRAINT cps_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT cps_commitment_type_uq   UNIQUE (commitment_id, snapshot_type),
    CONSTRAINT cps_type_chk             CHECK (snapshot_type IN ('SUPPLIER','BUYER'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §5.2  COMMITMENT ADDRESS SNAPSHOT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.commitment_address_snapshot (
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,
    commitment_id       uuid            NOT NULL,
    address_type        text            NOT NULL,

    address_line_1      text            NOT NULL,
    address_line_2      text,
    city                text,
    state_province      text,
    postal_code         text,
    country_code        character(2)    NOT NULL,

    captured_at         timestamptz     NOT NULL DEFAULT now(),
    captured_by         uuid            NOT NULL,

    CONSTRAINT cas_pkey                 PRIMARY KEY (id),
    CONSTRAINT cas_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT cas_commitment_type_uq   UNIQUE (commitment_id, address_type),
    CONSTRAINT cas_type_chk             CHECK (address_type IN ('DELIVERY','BILLING','SHIP_FROM'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §6  PURCHASE ORDER CONFIRMATION  (supplier artifact – not approvable)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.purchase_order_confirmation (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,
    confirmation_number     text            NOT NULL,

    commitment_id           uuid            NOT NULL,
    supplier_id             uuid            NOT NULL,

    vendor_reference_number text,
    vendor_confirmation_date date,
    confirmation_type       text            NOT NULL DEFAULT 'FULL_CONFIRM',

    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    currency_code           character(3)    NOT NULL,
    confirmed_total_amount  numeric(18,4)   NOT NULL DEFAULT 0,

    amendment_commitment_id uuid,

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'received',

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

-- ─────────────────────────────────────────────────────────────────────────────
-- §6  PURCHASE ORDER CONFIRMATION LINE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.purchase_order_confirmation_line (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    confirmation_id         uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    commitment_line_id      uuid            NOT NULL,

    confirmed_quantity      numeric(18,4)   NOT NULL,
    confirmed_unit_price    numeric(18,4)   NOT NULL,
    confirmed_delivery_date date,

    quantity_variance       numeric(18,4)   NOT NULL DEFAULT 0,
    price_variance          numeric(18,4)   NOT NULL DEFAULT 0,

    line_status             text            NOT NULL DEFAULT 'confirmed',
    vendor_notes            text,

    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- §7  DELIVERY NOTE  (logistics artifact – not approvable)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.delivery_note (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,
    delivery_note_number    text            NOT NULL,

    commitment_id           uuid            NOT NULL,
    supplier_id             uuid            NOT NULL,

    vendor_delivery_note_no text,
    vendor_dispatch_date    date,
    bill_of_lading_no       text,
    tracking_number         text,

    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    expected_arrival_date   date,
    actual_arrival_date     date,
    delivery_site_id        uuid            NOT NULL,
    delivery_warehouse_id   uuid,

    carrier_name            text,
    transport_mode          text,

    requires_inspection     boolean         NOT NULL DEFAULT false,
    inspection_status       text,

    is_fully_receipted      boolean         NOT NULL DEFAULT false,

    currency_code           character(3)    NOT NULL,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'draft',

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

-- ─────────────────────────────────────────────────────────────────────────────
-- §7  DELIVERY NOTE LINE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.delivery_note_line (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    delivery_note_id        uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    commitment_line_id      uuid            NOT NULL,

    item_id                 uuid,
    item_description        text            NOT NULL,

    uom_code                text            NOT NULL,
    shipped_quantity        numeric(18,4)   NOT NULL,
    received_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    damaged_quantity        numeric(18,4)   NOT NULL DEFAULT 0,
    rejected_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    accepted_quantity       numeric(18,4)   GENERATED ALWAYS AS (
                                received_quantity - damaged_quantity - rejected_quantity
                            ) STORED,

    lot_number              text,
    serial_numbers          text[],
    batch_number            text,
    expiry_date             date,

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

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

-- ─────────────────────────────────────────────────────────────────────────────
-- §8  GOODS RECEIPT  (approvable – triggers inventory + accrual)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.goods_receipt (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,
    receipt_number          text            NOT NULL,

    commitment_id           uuid            NOT NULL,
    delivery_note_id        uuid,
    supplier_id             uuid            NOT NULL,

    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,

    receiving_site_id       uuid            NOT NULL,
    receiving_warehouse_id  uuid            NOT NULL,

    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    accrual_je_id           uuid,
    is_posted               boolean         NOT NULL DEFAULT false,
    posted_at               timestamptz,
    posted_by               uuid,

    is_reversal             boolean         NOT NULL DEFAULT false,
    reversal_of_id          uuid,

    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','posted')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

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

-- ─────────────────────────────────────────────────────────────────────────────
-- §8.1  GOODS RECEIPT LINE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.goods_receipt_line (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    goods_receipt_id        uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    commitment_line_id      uuid            NOT NULL,
    delivery_note_line_id   uuid,

    item_id                 uuid            NOT NULL,
    item_description        text            NOT NULL,

    uom_code                text            NOT NULL,
    received_quantity       numeric(18,4)   NOT NULL,
    accepted_quantity       numeric(18,4)   NOT NULL,
    rejected_quantity       numeric(18,4)   NOT NULL DEFAULT 0,

    unit_price              numeric(18,4)   NOT NULL,
    currency_code           character(3)    NOT NULL,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                accepted_quantity * unit_price
                            ) STORED,

    warehouse_id            uuid            NOT NULL,
    storage_location        text,

    lot_number              text,
    serial_number           text,
    batch_number            text,
    expiry_date             date,

    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,

    -- Populated at posting time
    inventory_movement_id   uuid,
    fulfillment_id          uuid,

    is_asset                boolean         NOT NULL DEFAULT false,
    asset_transaction_id    uuid,

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

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

-- ─────────────────────────────────────────────────────────────────────────────
-- §8.2  SERVICE ENTRY SHEET  (approvable – two-step: acceptance then approval)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.service_entry_sheet (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,
    ses_number              text            NOT NULL,

    commitment_id           uuid            NOT NULL,
    supplier_id             uuid            NOT NULL,

    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,
    service_period_from     date            NOT NULL,
    service_period_to       date            NOT NULL,

    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    accrual_je_id           uuid,
    is_posted               boolean         NOT NULL DEFAULT false,
    posted_at               timestamptz,
    posted_by               uuid,

    accepted_by             uuid,
    accepted_at             timestamptz,

    is_reversal             boolean         NOT NULL DEFAULT false,
    reversal_of_id          uuid,

    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_acceptance','accepted',
                                           'pending_approval','approved','posted')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

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

-- ─────────────────────────────────────────────────────────────────────────────
-- §8.3  SERVICE ENTRY SHEET LINE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.service_entry_sheet_line (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    service_entry_sheet_id  uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    commitment_line_id      uuid            NOT NULL,

    item_id                 uuid,
    service_description     text            NOT NULL,
    spend_category_id       uuid,
    business_intent_id      uuid,

    uom_code                text            NOT NULL,
    quantity                numeric(18,4)   NOT NULL,
    unit_price              numeric(18,4)   NOT NULL,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                quantity * unit_price
                            ) STORED,

    completion_pct          numeric(5,2),
    milestone_name          text,

    tax_group_id            uuid,
    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,

    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,

    -- Populated at posting time
    fulfillment_id          uuid,

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

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

-- ─────────────────────────────────────────────────────────────────────────────
-- §9  PURCHASE INVOICE  (approvable)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.purchase_invoice (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,
    invoice_number          text            NOT NULL,
    fiscal_document_number  text,

    invoice_source          text            NOT NULL DEFAULT 'PO_BASED',
    invoice_type            text            NOT NULL DEFAULT 'STANDARD',
    description             text,

    supplier_id             uuid,
    supplier_invoice_number text            NOT NULL,
    supplier_invoice_date   date            NOT NULL,

    commitment_id           uuid,

    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,
    received_date           date            NOT NULL DEFAULT CURRENT_DATE,
    baseline_date           date,
    due_date                date,

    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),

    subtotal_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    discount_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    freight_amount          numeric(18,4)   NOT NULL DEFAULT 0,
    misc_charges_amount     numeric(18,4)   NOT NULL DEFAULT 0,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,

    payable_amount          numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - withholding_tax_amount
                            ) STORED,

    payment_term_id         uuid,
    term_snapshot           jsonb,
    payment_method_id       uuid,

    advance_deduction_amount numeric(18,4)  NOT NULL DEFAULT 0,

    -- Retention: AP Retention Payable (liability – NOT a receivable asset)
    retention_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    retention_pct           numeric(5,2),

    paid_amount             numeric(18,4)   NOT NULL DEFAULT 0,
    outstanding_amount      numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - withholding_tax_amount
                                - advance_deduction_amount - retention_amount - paid_amount
                            ) STORED,

    budget_allocation_id    uuid,
    budget_check_result     text,

    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    ap_je_id                uuid,
    is_posted               boolean         NOT NULL DEFAULT false,
    posted_at               timestamptz,
    posted_by               uuid,

    match_type              text            NOT NULL DEFAULT 'THREE_WAY',
    match_status            text            NOT NULL DEFAULT 'unmatched',

    is_reversal             boolean         NOT NULL DEFAULT false,
    reversal_of_id          uuid,
    is_credit_note          boolean         NOT NULL DEFAULT false,

    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    is_on_hold              boolean         NOT NULL DEFAULT false,
    hold_reason             text,

    line_count              smallint        NOT NULL DEFAULT 0,
    notes                   text,
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','posted',
                                           'partially_paid','on_hold')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pi_pkey              PRIMARY KEY (id),
    CONSTRAINT pi_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT pi_tenant_number_uq  UNIQUE (tenant_id, company_code_id, invoice_number),
    CONSTRAINT pi_number_nonempty   CHECK (btrim(invoice_number) <> ''),
    CONSTRAINT pi_status_chk        CHECK (status IN (
        'draft','pending_approval','approved','posted','partially_paid',
        'fully_paid','on_hold','reversed','cancelled','rejected')),
    CONSTRAINT pi_source_chk        CHECK (invoice_source IN (
        'PO_BASED','CONTRACT_BASED','NON_PO','ONE_TIME_VENDOR')),
    CONSTRAINT pi_type_chk          CHECK (invoice_type IN (
        'STANDARD','CREDIT_NOTE','DEBIT_NOTE','ADVANCE','RETENTION_RELEASE',
        'PROFORMA','SELF_BILLED','DOWN_PAYMENT','FINAL')),
    CONSTRAINT pi_match_type_chk    CHECK (match_type IN (
        'THREE_WAY','TWO_WAY','NO_MATCH','EVALUATED_RECEIPT')),
    CONSTRAINT pi_match_status_chk  CHECK (match_status IN (
        'unmatched','partially_matched','fully_matched','match_exception')),
    CONSTRAINT pi_commitment_req    CHECK (
        invoice_source NOT IN ('PO_BASED','CONTRACT_BASED')
        OR commitment_id IS NOT NULL),
    CONSTRAINT pi_amount_chk        CHECK (total_amount >= 0 OR is_credit_note),
    CONSTRAINT pi_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT pi_budget_chk        CHECK (budget_check_result IS NULL OR budget_check_result IN (
        'PASSED','WARNED','OVERRIDE','BLOCKED','EXEMPT')),
    CONSTRAINT pi_no_self_reversal  CHECK (reversal_of_id IS DISTINCT FROM id),
    CONSTRAINT pi_retention_chk     CHECK (
        retention_pct IS NULL OR retention_pct BETWEEN 0 AND 100),
    CONSTRAINT pi_posting_pair_chk  CHECK ((posted_at IS NULL) = (posted_by IS NULL))
);

COMMENT ON TABLE document.purchase_invoice IS
    'Approvable AP invoice. Four sources: PO_BASED, CONTRACT_BASED, NON_PO, ONE_TIME_VENDOR. '
    'Vendor identity frozen in invoice_party_snapshot + invoice_address_snapshot + invoice_bank_snapshot. '
    'Tax determined by existing engine; tax_amount is a display cache. '
    'Retention creates AP Retention Payable (liability), not a receivable asset.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §9.1  PURCHASE INVOICE LINE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.purchase_invoice_line (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    purchase_invoice_id     uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    commitment_line_id      uuid,
    goods_receipt_line_id   uuid,
    ses_line_id             uuid,

    item_id                 uuid,
    item_description        text            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'goods',
    spend_category_id       uuid,
    business_intent_id      uuid,

    uom_code                text            NOT NULL,
    quantity                numeric(18,4)   NOT NULL,
    unit_price              numeric(18,4)   NOT NULL,
    price_unit              numeric(18,4)   NOT NULL DEFAULT 1,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                (quantity * unit_price) / NULLIF(price_unit, 0)
                            ) STORED,

    discount_pct            numeric(5,2)    DEFAULT 0,
    discount_amount         numeric(18,4)   DEFAULT 0,

    tax_group_id            uuid,
    tax_amount              numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_group_id uuid,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,

    gross_amount            numeric(18,4)   NOT NULL DEFAULT 0,

    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    is_asset                boolean         NOT NULL DEFAULT false,
    asset_category_id       uuid,

    matched_quantity        numeric(18,4)   NOT NULL DEFAULT 0,
    match_status            text            NOT NULL DEFAULT 'unmatched',

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pil_pkey             PRIMARY KEY (id),
    CONSTRAINT pil_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT pil_line_uq          UNIQUE (purchase_invoice_id, line_no),
    CONSTRAINT pil_line_no_chk      CHECK (line_no > 0),
    CONSTRAINT pil_qty_nonzero      CHECK (quantity <> 0),
    CONSTRAINT pil_price_nonneg     CHECK (unit_price >= 0),
    CONSTRAINT pil_price_unit_pos   CHECK (price_unit > 0),
    CONSTRAINT pil_proc_type_chk    CHECK (procurement_type IN (
        'goods','services','mixed','freight','misc')),
    CONSTRAINT pil_match_status_chk CHECK (match_status IN (
        'unmatched','partially_matched','fully_matched','match_exception')),
    CONSTRAINT pil_tax_nonneg       CHECK (tax_amount >= 0),
    CONSTRAINT pil_wht_nonneg       CHECK (withholding_tax_amount >= 0),
    CONSTRAINT pil_discount_chk     CHECK (discount_pct IS NULL OR discount_pct BETWEEN 0 AND 100)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §5.3  INVOICE PARTY SNAPSHOT  (identity only; address is separate)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.invoice_party_snapshot (
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,
    purchase_invoice_id uuid            NOT NULL,

    supplier_id         uuid,
    party_name          text            NOT NULL,
    tax_registration_no text,
    legal_entity_name   text,
    country_code        character(2),

    is_one_time_vendor  boolean         NOT NULL DEFAULT false,

    contact_name        text,
    contact_email       text,
    contact_phone       text,

    captured_at         timestamptz     NOT NULL DEFAULT now(),
    captured_by         uuid            NOT NULL,
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT ips_pkey         PRIMARY KEY (id),
    CONSTRAINT ips_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT ips_invoice_uq   UNIQUE (purchase_invoice_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §5.4  INVOICE ADDRESS SNAPSHOT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.invoice_address_snapshot (
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,
    purchase_invoice_id uuid            NOT NULL,
    address_type        text            NOT NULL,

    address_line_1      text            NOT NULL,
    address_line_2      text,
    city                text,
    state_province      text,
    postal_code         text,
    country_code        character(2)    NOT NULL,

    captured_at         timestamptz     NOT NULL DEFAULT now(),
    captured_by         uuid            NOT NULL,

    CONSTRAINT ias_pkey             PRIMARY KEY (id),
    CONSTRAINT ias_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT ias_invoice_type_uq  UNIQUE (purchase_invoice_id, address_type),
    CONSTRAINT ias_type_chk         CHECK (address_type IN (
        'SUPPLIER','REMIT_TO','BILLING','DELIVERY'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §5.5  INVOICE BANK SNAPSHOT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.invoice_bank_snapshot (
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,
    purchase_invoice_id uuid            NOT NULL,

    bank_name           text            NOT NULL,
    bank_country_code   character(2),
    account_holder_name text            NOT NULL,
    account_number      text,
    iban                text,
    swift_bic           text,
    routing_number      text,
    bank_branch         text,

    captured_at         timestamptz     NOT NULL DEFAULT now(),
    captured_by         uuid            NOT NULL,

    CONSTRAINT ibs_pkey         PRIMARY KEY (id),
    CONSTRAINT ibs_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT ibs_invoice_uq   UNIQUE (purchase_invoice_id),
    CONSTRAINT ibs_account_chk  CHECK (account_number IS NOT NULL OR iban IS NOT NULL)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §5.6  INVOICE TAX SNAPSHOT  (only where legally required; otherwise use ledger.tax_calculation)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.invoice_tax_snapshot (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    purchase_invoice_id     uuid            NOT NULL,
    invoice_line_id         uuid,

    tax_group_id            uuid            NOT NULL,
    tax_component_code      text            NOT NULL,
    tax_rate_schedule_id    uuid,
    tax_base_amount         numeric(18,4)   NOT NULL,
    tax_rate                numeric(7,4)    NOT NULL,
    tax_amount              numeric(18,4)   NOT NULL,
    currency_code           character(3)    NOT NULL,

    is_recoverable          boolean         NOT NULL DEFAULT true,
    is_withholding          boolean         NOT NULL DEFAULT false,

    captured_at             timestamptz     NOT NULL DEFAULT now(),
    captured_by             uuid            NOT NULL,

    CONSTRAINT its_pkey             PRIMARY KEY (id),
    CONSTRAINT its_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT its_tax_rate_nonneg  CHECK (tax_rate >= 0),
    CONSTRAINT its_base_nonneg      CHECK (tax_base_amount >= 0)
);

COMMENT ON TABLE document.invoice_tax_snapshot IS
    'Frozen tax determination at invoice time. '
    'Create only where legal/regulatory requirements mandate it. '
    'Otherwise posted tax facts in ledger.tax_calculation are authoritative.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §10.1  INVOICE MATCH CASE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.invoice_match_case (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    purchase_invoice_id     uuid            NOT NULL,
    commitment_id           uuid,

    match_type              text            NOT NULL DEFAULT 'THREE_WAY',
    match_result            text            NOT NULL DEFAULT 'pending',

    total_quantity_variance numeric(18,4)   NOT NULL DEFAULT 0,
    total_price_variance    numeric(18,4)   NOT NULL DEFAULT 0,
    total_amount_variance   numeric(18,4)   NOT NULL DEFAULT 0,

    has_exceptions          boolean         NOT NULL DEFAULT false,
    exception_count         smallint        NOT NULL DEFAULT 0,

    matched_at              timestamptz,
    matched_by              uuid,

    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'pending',

    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT imc_pkey         PRIMARY KEY (id),
    CONSTRAINT imc_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT imc_invoice_uq   UNIQUE (tenant_id, purchase_invoice_id),
    CONSTRAINT imc_type_chk     CHECK (match_type IN (
        'THREE_WAY','TWO_WAY','NO_MATCH','EVALUATED_RECEIPT')),
    CONSTRAINT imc_result_chk   CHECK (match_result IN (
        'pending','matched','matched_with_tolerance',
        'exception','force_matched','rejected')),
    CONSTRAINT imc_status_chk   CHECK (status IN (
        'pending','in_progress','completed','exception','resolved','cancelled')),
    CONSTRAINT imc_exception_nonneg CHECK (exception_count >= 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §10.2  MATCH EXCEPTION  (per-line; independent workflow routing)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.match_exception (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    invoice_match_case_id   uuid            NOT NULL,
    invoice_line_id         uuid            NOT NULL,

    exception_type          text            NOT NULL,
    exception_subtype       text,

    expected_value          numeric(18,4),
    actual_value            numeric(18,4),
    variance_amount         numeric(18,4)   NOT NULL,
    variance_pct            numeric(7,4),
    currency_code           character(3)    NOT NULL,

    tolerance_pct           numeric(5,2),
    tolerance_amount        numeric(18,4),
    is_within_tolerance     boolean         NOT NULL DEFAULT false,

    resolution_type         text,
    resolution_notes        text,
    resolved_by             uuid,
    resolved_at             timestamptz,

    workflow_request_id     uuid,

    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT me_pkey          PRIMARY KEY (id),
    CONSTRAINT me_tenant_id_uq  UNIQUE (tenant_id, id),
    CONSTRAINT me_type_chk      CHECK (exception_type IN (
        'PRICE_VARIANCE','QUANTITY_VARIANCE','AMOUNT_VARIANCE',
        'MISSING_RECEIPT','DUPLICATE_INVOICE','TAX_VARIANCE',
        'FX_VARIANCE','RETENTION_VARIANCE','ADVANCE_RECOVERY_MISMATCH')),
    CONSTRAINT me_status_chk    CHECK (status IN (
        'open','pending_approval','approved','rejected',
        'force_matched','written_off','cancelled')),
    CONSTRAINT me_resolution_chk CHECK (resolution_type IS NULL OR resolution_type IN (
        'ACCEPTED','FORCE_MATCHED','CREDIT_NOTE_REQUESTED','WRITTEN_OFF',
        'PRICE_ADJUSTMENT','QUANTITY_ADJUSTMENT','REJECTED')),
    CONSTRAINT me_resolved_pair_chk CHECK (
        (resolved_by IS NULL) = (resolved_at IS NULL))
);

COMMENT ON TABLE document.match_exception IS
    'Per-line match variances requiring resolution. Clean matches are tracked on '
    'purchase_invoice_line.match_status + matched_quantity only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §11  PAYMENT ENTRY  (approvable)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.payment_entry (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,
    payment_number          text            NOT NULL,

    payment_type            text            NOT NULL DEFAULT 'STANDARD',
    payment_direction       text            NOT NULL DEFAULT 'OUTBOUND',

    supplier_id             uuid,
    supplier_name           text            NOT NULL,

    payment_method_id       uuid            NOT NULL,
    bank_account_id         uuid,
    supplier_bank_link_id   uuid,

    payment_reference       text,
    bank_reference          text,
    check_number            text,

    document_date           date            NOT NULL DEFAULT CURRENT_DATE,
    posting_date            date            NOT NULL DEFAULT CURRENT_DATE,
    value_date              date            NOT NULL DEFAULT CURRENT_DATE,

    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    exchange_rate           numeric(18,10),
    payment_amount          numeric(18,4)   NOT NULL,
    base_amount             numeric(18,4),

    payment_currency_code   character(3),
    payment_exchange_rate   numeric(18,10),
    payment_currency_amount numeric(18,4),

    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,

    payment_je_id           uuid,
    is_posted               boolean         NOT NULL DEFAULT false,
    posted_at               timestamptz,
    posted_by               uuid,

    is_reversal             boolean         NOT NULL DEFAULT false,
    reversal_of_id          uuid,
    reversal_reason         text,

    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    payment_run_id          uuid,
    is_batch_payment        boolean         NOT NULL DEFAULT false,

    is_printed              boolean         NOT NULL DEFAULT false,
    is_transmitted          boolean         NOT NULL DEFAULT false,
    transmission_status     text,

    is_voided               boolean         NOT NULL DEFAULT false,
    voided_at               timestamptz,
    voided_by               uuid,
    void_reason             text,

    line_count              smallint        NOT NULL DEFAULT 0,
    notes                   text,
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','posted',
                                           'transmitted','printed')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pe_pkey              PRIMARY KEY (id),
    CONSTRAINT pe_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT pe_tenant_number_uq  UNIQUE (tenant_id, company_code_id, payment_number),
    CONSTRAINT pe_number_nonempty   CHECK (btrim(payment_number) <> ''),
    CONSTRAINT pe_status_chk        CHECK (status IN (
        'draft','pending_approval','approved','posted','transmitted',
        'printed','cleared','reversed','voided','cancelled','rejected')),
    CONSTRAINT pe_type_chk          CHECK (payment_type IN (
        'STANDARD','ADVANCE','RETENTION_RELEASE','PARTIAL','FINAL',
        'DOWN_PAYMENT','URGENT','NETTING')),
    CONSTRAINT pe_direction_chk     CHECK (payment_direction IN ('OUTBOUND','INBOUND')),
    CONSTRAINT pe_amount_pos        CHECK (payment_amount > 0),
    CONSTRAINT pe_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT pe_no_self_reversal  CHECK (reversal_of_id IS DISTINCT FROM id),
    CONSTRAINT pe_void_chk          CHECK (NOT is_voided OR voided_at IS NOT NULL),
    CONSTRAINT pe_posting_pair_chk  CHECK ((posted_at IS NULL) = (posted_by IS NULL))
);

COMMENT ON TABLE document.payment_entry IS
    'Approvable AP payment. Accounting driven by control.payment_settlement_rule posting roles. '
    'Settlement posting: Dr AP Trade Payable → Cr Bank + optional Cr Discount Income + Dr/Cr FX.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §11.1  PAYMENT ENTRY ALLOCATION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.payment_entry_allocation (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    payment_entry_id        uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    purchase_invoice_id     uuid,
    commitment_id           uuid,

    currency_code           character(3)    NOT NULL,
    allocated_amount        numeric(18,4)   NOT NULL,
    discount_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    withholding_tax_amount  numeric(18,4)   NOT NULL DEFAULT 0,
    advance_recovery_amount numeric(18,4)   NOT NULL DEFAULT 0,
    retention_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    net_payment_amount      numeric(18,4)   GENERATED ALWAYS AS (
                                allocated_amount - discount_amount - withholding_tax_amount
                                - advance_recovery_amount - retention_amount
                            ) STORED,

    base_currency_code      character(3),
    exchange_rate           numeric(18,10),
    base_amount             numeric(18,4),
    fx_gain_loss            numeric(18,4)   NOT NULL DEFAULT 0,

    is_discount_taken       boolean         NOT NULL DEFAULT false,
    discount_due_date       date,
    payment_term_application_id uuid,

    notes                   text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,

    CONSTRAINT pea_pkey                     PRIMARY KEY (id),
    CONSTRAINT pea_tenant_id_uq             UNIQUE (tenant_id, id),
    CONSTRAINT pea_line_uq                  UNIQUE (payment_entry_id, line_no),
    CONSTRAINT pea_line_no_chk              CHECK (line_no > 0),
    CONSTRAINT pea_allocated_pos            CHECK (allocated_amount > 0),
    CONSTRAINT pea_invoice_or_cmt           CHECK (
        purchase_invoice_id IS NOT NULL OR commitment_id IS NOT NULL),
    CONSTRAINT pea_deductions_lte_allocated CHECK (
        discount_amount + withholding_tax_amount
        + advance_recovery_amount + retention_amount
        <= allocated_amount),
    CONSTRAINT pea_deductions_nonneg        CHECK (
        discount_amount >= 0
        AND withholding_tax_amount >= 0
        AND advance_recovery_amount >= 0
        AND retention_amount >= 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §11.2  PAYMENT REMITTANCE OUTPUT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.payment_remittance_output (
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,
    company_code_id     uuid            NOT NULL,
    remittance_number   text            NOT NULL,

    payment_entry_id    uuid            NOT NULL,
    supplier_id         uuid            NOT NULL,

    currency_code       character(3)    NOT NULL,
    total_amount        numeric(18,4)   NOT NULL,
    net_remitted        numeric(18,4)   NOT NULL,

    delivery_method     text            NOT NULL DEFAULT 'EMAIL',
    delivered_at        timestamptz,
    delivery_status     text            NOT NULL DEFAULT 'pending',

    render_output_id    uuid,

    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status              text            NOT NULL DEFAULT 'draft',

    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT pro_pkey             PRIMARY KEY (id),
    CONSTRAINT pro_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT pro_tenant_number_uq UNIQUE (tenant_id, company_code_id, remittance_number),
    CONSTRAINT pro_delivery_chk     CHECK (delivery_method IN (
        'EMAIL','PORTAL','EDI','FAX','PRINT','API')),
    CONSTRAINT pro_delivery_status_chk CHECK (delivery_status IN (
        'pending','sent','delivered','failed','bounced')),
    CONSTRAINT pro_status_chk       CHECK (status IN (
        'draft','generated','sent','delivered','failed','cancelled'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §12  ACCOUNTING DISTRIBUTION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document.accounting_distribution (
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    source_doc_type         text            NOT NULL,
    source_doc_id           uuid            NOT NULL,
    source_line_id          uuid            NOT NULL,

    distribution_no         smallint        NOT NULL,

    distribution_basis      text            NOT NULL DEFAULT 'PERCENT',
    split_pct               numeric(7,4),
    split_amount            numeric(18,4),
    split_quantity          numeric(18,4),

    distributed_amount      numeric(18,4)   NOT NULL,
    currency_code           character(3)    NOT NULL,

    -- Engine-aligned resolution inputs (drives control.resolve_entry_account())
    account_source          text            NOT NULL DEFAULT 'FROM_CATEGORY',
    posting_role_code       text,
    account_code            text,
    account_lookup_key      text,
    account_fallback        text,
    gl_account_id           uuid,
    business_intent_id      uuid,
    spend_category_id       uuid,

    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    is_capex                boolean         NOT NULL DEFAULT false,
    asset_class_id          uuid,

    tax_treatment_override  text,

    budget_allocation_id    uuid,
    budget_check_result     text,

    encumbrance_je_id       uuid,

    description             text,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ad_pkey              PRIMARY KEY (id),
    CONSTRAINT ad_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ad_line_dist_uq      UNIQUE (
        source_doc_type, source_doc_id, source_line_id, distribution_no),
    CONSTRAINT ad_dist_no_chk       CHECK (distribution_no > 0),
    CONSTRAINT ad_basis_chk         CHECK (distribution_basis IN (
        'PERCENT','AMOUNT','QUANTITY')),
    CONSTRAINT ad_pct_chk           CHECK (
        distribution_basis <> 'PERCENT'
        OR (split_pct IS NOT NULL AND split_pct > 0)),
    CONSTRAINT ad_amount_chk        CHECK (
        distribution_basis <> 'AMOUNT' OR split_amount IS NOT NULL),
    CONSTRAINT ad_qty_chk           CHECK (
        distribution_basis <> 'QUANTITY' OR split_quantity IS NOT NULL),
    CONSTRAINT ad_distributed_nonneg CHECK (distributed_amount >= 0),
    CONSTRAINT ad_source_type_chk   CHECK (source_doc_type IN (
        'PURCHASE_REQUISITION_LINE',
        'COMMITMENT_LINE',
        'PURCHASE_INVOICE_LINE',
        'GOODS_RECEIPT_LINE',
        'SERVICE_ENTRY_SHEET_LINE')),
    CONSTRAINT ad_source_chk        CHECK (account_source IN (
        'POSTING_ROLE','FIXED','FROM_INTENT','FROM_CATEGORY')),
    CONSTRAINT ad_posting_role_req  CHECK (
        account_source <> 'POSTING_ROLE' OR posting_role_code IS NOT NULL),
    CONSTRAINT ad_fixed_req         CHECK (
        account_source <> 'FIXED'
        OR gl_account_id IS NOT NULL OR account_code IS NOT NULL),
    CONSTRAINT ad_intent_req        CHECK (
        account_source <> 'FROM_INTENT' OR business_intent_id IS NOT NULL),
    CONSTRAINT ad_category_req      CHECK (
        account_source <> 'FROM_CATEGORY' OR spend_category_id IS NOT NULL),
    CONSTRAINT ad_budget_chk        CHECK (budget_check_result IS NULL OR budget_check_result IN (
        'PASSED','WARNED','OVERRIDE','BLOCKED','EXEMPT')),
    CONSTRAINT ad_tax_override_chk  CHECK (tax_treatment_override IS NULL OR
        tax_treatment_override IN (
            'STANDARD','ZERO_RATED','EXEMPT','REVERSE_CHARGE','OUT_OF_SCOPE'))
);

COMMENT ON TABLE document.accounting_distribution IS
    'Split-charge distribution. account_source drives control.resolve_entry_account() at posting time. '
    'Default: FROM_CATEGORY (spend_category → intent → GL). '
    'POSTING_ROLE for system rows (GRIR_CLEARING, PRICE_VARIANCE, ADVANCE_PREPAID, AP_TRADE, AP_RETENTION). '
    'PAYMENT_ENTRY excluded – payments allocate AP liabilities, not P&L charges.';
