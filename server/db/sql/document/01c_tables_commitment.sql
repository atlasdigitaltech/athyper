-- ============================================================================
-- document/01c_tables_commitment.sql
-- Concept: Commitments — purchase commitments, obligation horizons, forecast scenarios
-- Depends on: 04_tables/004_document.sql, 04_tables/003b_master_finance.sql
-- Scope: Commitment Engine document tables
-- Domain: commitment (header), commitment_procurement (1:1 P2P ext),
--         commitment_line, commitment_release_allocation,
--         commitment_party_snapshot, commitment_address_snapshot,
--         obligation_horizon, forecast_scenario
-- Load order: 004b (after 004_document.sql, 004a_document_journal.sql)
-- ============================================================================

-- ============================================================================
-- §CMT1  document.commitment — commitment header
-- ============================================================================
-- Legal/financial obligation: PO, contract, lease, subscription, standing order.
-- Draws budget from master.budget_allocation. Children: commitment_schedule,
-- commitment_fulfillment. Tracks encumbrance JE linkage.

CREATE TABLE IF NOT EXISTS document.commitment (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL DEFAULT '',
    name                    text            NOT NULL DEFAULT '',

    -- Company scope
    company_code_id         uuid            NOT NULL,

    -- Numbering
    commitment_number       text            NOT NULL,

    -- Classification
    commitment_type         text            NOT NULL DEFAULT 'PURCHASE_ORDER',
    commitment_subtype      text,
    description             text,

    -- Counterparty (polymorphic)
    party_type              text,
    party_id                uuid,
    party_name              text,

    -- Dates
    document_date           date            NOT NULL,
    effective_date          date            NOT NULL,
    expiry_date             date,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,
    scheduled_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    fulfilled_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    released_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    outstanding_amount      numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - fulfilled_amount - released_amount
                            ) STORED,
    exchange_rate           numeric(18,10),

    -- Budget linkage
    budget_allocation_id    uuid,
    intent_id               uuid,
    budget_check_result     text,

    -- Encumbrance
    encumbrance_type        text            NOT NULL DEFAULT 'STANDARD',
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

    -- Organisational
    requested_by            uuid,

    -- Advance / Retention
    advance_pct             numeric(5,2),
    advance_amount          numeric(18,4),
    retention_pct           numeric(5,2),
    retention_amount        numeric(18,4),

    -- Payment Terms (linked term + frozen snapshot at time of selection)
    payment_term_id             uuid,
    payment_term_version        smallint,
    payment_term_snapshot       jsonb,
    payment_term_selected_at    timestamptz,
    payment_term_selected_by    uuid,

    -- Renewal
    is_auto_renew           boolean         NOT NULL DEFAULT false,
    renewal_terms           jsonb,
    renewal_count           smallint        NOT NULL DEFAULT 0,
    renewed_from_id         uuid,

    -- Amendment tracking
    amendment_count         smallint        NOT NULL DEFAULT 0,
    original_amount         numeric(18,4),
    variance_to_original    numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - COALESCE(original_amount, total_amount)
                            ) STORED,

    -- Line count (trigger-synced)
    schedule_count          smallint        NOT NULL DEFAULT 0,

    -- Approval
    approved_at             timestamptz,
    approved_by             uuid,
    workflow_request_id     uuid,

    -- Close / Cancellation
    closed_at               timestamptz,
    closed_by               uuid,
    close_reason            text,

    -- Tags & Metadata
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','active','partially_fulfilled')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cmt_pkey                 PRIMARY KEY (id),
    CONSTRAINT cmt_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT cmt_tenant_number_uq     UNIQUE (tenant_id, company_code_id, commitment_number),
    CONSTRAINT cmt_number_nonempty      CHECK (btrim(commitment_number) <> ''),
    CONSTRAINT cmt_status_chk           CHECK (status IN (
        'draft','pending_approval','approved','active','partially_fulfilled',
        'fully_fulfilled','closed','cancelled','expired','suspended')),
    CONSTRAINT cmt_type_chk             CHECK (commitment_type IN (
        'PURCHASE_ORDER','CONTRACT','LEASE','SUBSCRIPTION','STANDING_ORDER',
        'BLANKET_PO','FRAMEWORK_AGREEMENT','GRANT_AWARD','INTERNAL_ORDER')),
    CONSTRAINT cmt_encumbrance_chk      CHECK (encumbrance_type IN (
        'NONE','STANDARD','PRE_ENCUMBRANCE','STATISTICAL_ONLY')),
    CONSTRAINT cmt_check_chk            CHECK (budget_check_result IS NULL OR budget_check_result IN (
        'passed','warned','override','blocked','exempt')),
    CONSTRAINT cmt_amount_nonneg        CHECK (total_amount >= 0),
    CONSTRAINT cmt_fulfilled_nonneg     CHECK (fulfilled_amount >= 0),
    CONSTRAINT cmt_released_nonneg      CHECK (released_amount >= 0),
    CONSTRAINT cmt_fulfilled_lte_total  CHECK (fulfilled_amount <= total_amount),
    CONSTRAINT cmt_date_chk             CHECK (expiry_date IS NULL OR expiry_date >= effective_date),
    CONSTRAINT cmt_advance_chk          CHECK (advance_pct IS NULL OR advance_pct BETWEEN 0 AND 100),
    CONSTRAINT cmt_retention_chk        CHECK (retention_pct IS NULL OR retention_pct BETWEEN 0 AND 100),
    CONSTRAINT cmt_period_chk           CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 16),
    CONSTRAINT cmt_amendment_chk        CHECK (amendment_count >= 0),
    CONSTRAINT cmt_renewal_chk          CHECK (renewal_count >= 0),
    CONSTRAINT cmt_party_chk            CHECK (
        (party_type IS NULL AND party_id IS NULL)
        OR (party_type IS NOT NULL AND party_id IS NOT NULL)),
    CONSTRAINT cmt_no_self_renew        CHECK (renewed_from_id IS DISTINCT FROM id),
    CONSTRAINT cmt_pt_snapshot_chk      CHECK (
        payment_term_snapshot IS NULL OR jsonb_typeof(payment_term_snapshot) = 'object'),
    CONSTRAINT cmt_pt_all_req_chk       CHECK (
        payment_term_id IS NULL OR (
            payment_term_version     IS NOT NULL AND
            payment_term_snapshot    IS NOT NULL AND
            payment_term_selected_at IS NOT NULL AND
            payment_term_selected_by IS NOT NULL))
);

COMMENT ON TABLE document.commitment IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_approval'',''approved'',''active'',''partially_fulfilled'')). Commitment header: PO, contract, lease, subscription, standing order. '
    'outstanding_amount = GENERATED (total - fulfilled - released). '
    'Draws budget from master.budget_allocation (budget_allocation_id). '
    'budget_check_result: PASSED | WARNED | OVERRIDE | BLOCKED | EXEMPT. '
    'Status lifecycle: draft → pending_approval → approved → active → '
    'partially_fulfilled → fully_fulfilled → closed | cancelled | expired. '
    'Children: ledger.commitment_schedule, ledger.commitment_fulfillment.';


-- ============================================================================
-- §4.1  document.commitment_procurement — 1:1 procurement extension
-- ============================================================================
-- Procurement-commercial child of document.commitment. One row per PO-type
-- commitment. Holds supplier, terms, running total caches.

CREATE TABLE IF NOT EXISTS document.commitment_procurement (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent link (1:1)
    commitment_id           uuid            NOT NULL,

    -- Source requisition
    requisition_id          uuid,

    -- Release order linkage
    parent_contract_id      uuid,
    is_release_order        boolean         NOT NULL DEFAULT false,
    release_sequence_no     smallint,

    -- Supplier
    supplier_id             uuid            NOT NULL,
    supplier_contact_name   text,
    buyer_id                uuid,

    -- Shipping terms
    incoterms_code          text,
    incoterms_location      text,
    freight_terms           text,

    -- Address linkage
    delivery_address_id     uuid,
    billing_address_id      uuid,

    -- Payment terms
    payment_term_id         uuid,
    payment_method_id       uuid,

    -- Tax
    tax_treatment           text            DEFAULT 'STANDARD',
    withholding_tax_applicable boolean      NOT NULL DEFAULT false,

    -- Receipt basis flags
    gr_based_iv             boolean         NOT NULL DEFAULT true,
    service_based_iv        boolean         NOT NULL DEFAULT false,
    evaluated_receipt       boolean         NOT NULL DEFAULT false,

    -- Running totals (trigger-synced caches; source of truth in ledger/document children)
    line_count              smallint        NOT NULL DEFAULT 0,
    total_received_amount   numeric(18,4)   NOT NULL DEFAULT 0,
    total_invoiced_amount   numeric(18,4)   NOT NULL DEFAULT 0,
    total_paid_amount       numeric(18,4)   NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
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
    'ARCHETYPE=C;SCOPE=T. Procurement-commercial extension of document.commitment. 1:1 child. '
    'Running totals are derived caches, not source of truth. '
    'Source: ledger.commitment_fulfillment (receipts), document.purchase_invoice (invoices), '
    'document.payment_entry (payments).';


-- ============================================================================
-- §4.2  document.commitment_line — PO / contract line items
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.commitment_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent commitment
    commitment_id           uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Source line links
    requisition_line_id     uuid,
    parent_contract_line_id uuid,

    -- Item description
    item_id                 uuid,
    item_code               text,
    item_description        text            NOT NULL,
    procurement_type        text            NOT NULL DEFAULT 'goods',
    spend_category_id       uuid,
    business_intent_id      uuid,

    -- Quantity / price
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

    -- Tax
    tax_group_id            uuid,
    withholding_tax_group_id uuid,

    -- Delivery
    required_by_date        date,
    promised_date           date,
    delivery_site_id        uuid,
    delivery_warehouse_id   uuid,
    storage_location        text,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    -- Asset flag
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

    -- Narrative
    notes                   text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                  text            NOT NULL DEFAULT 'open',

    -- Audit
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
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. PO / contract line items. Mutable operational detail – document schema, not ledger. '
    'received_quantity, invoiced_quantity, released_quantity are derived caches. '
    'Source of truth: ledger.commitment_fulfillment (receipts), '
    'document.commitment_release_allocation (blanket/framework releases).';


-- ============================================================================
-- §4.3  document.commitment_release_allocation
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.commitment_release_allocation (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent / release links
    parent_commitment_id    uuid            NOT NULL,
    parent_line_id          uuid            NOT NULL,
    release_commitment_id   uuid            NOT NULL,
    release_line_id         uuid            NOT NULL,

    -- Amounts
    released_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    released_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    currency_code           character(3)    NOT NULL,

    -- Release event
    released_at             timestamptz     NOT NULL DEFAULT now(),
    released_by             uuid            NOT NULL,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
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
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Tracks qty/amount drawn from parent BLANKET_PO or FRAMEWORK_AGREEMENT line '
    'by each release PO line. Source of truth for release exhaustion checks.';


-- ============================================================================
-- §5.1  document.commitment_party_snapshot
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.commitment_party_snapshot (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Parent commitment
    commitment_id       uuid            NOT NULL,
    snapshot_type       text            NOT NULL DEFAULT 'SUPPLIER',

    -- Party identity
    party_id            uuid            NOT NULL,
    party_code          text            NOT NULL,
    party_name          text            NOT NULL,
    tax_registration_no text,
    legal_entity_name   text,
    country_code        character(2),

    -- Contact
    contact_name        text,
    contact_email       text,
    contact_phone       text,

    -- Capture audit (append-only)
    captured_at         timestamptz     NOT NULL DEFAULT now(),
    captured_by         uuid            NOT NULL,
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT cps_pkey                 PRIMARY KEY (id),
    CONSTRAINT cps_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT cps_commitment_type_uq   UNIQUE (commitment_id, snapshot_type),
    CONSTRAINT cps_type_chk             CHECK (snapshot_type IN ('SUPPLIER','BUYER'))
);

COMMENT ON TABLE document.commitment_party_snapshot IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Immutable supplier/buyer party snapshot captured at commitment approval. '
    'One row per (commitment_id, snapshot_type). Append-only — delete and re-capture to update.';


-- ============================================================================
-- §5.2  document.commitment_address_snapshot
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.commitment_address_snapshot (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Parent commitment
    commitment_id       uuid            NOT NULL,
    address_type        text            NOT NULL,

    -- Address
    address_line_1      text            NOT NULL,
    address_line_2      text,
    city                text,
    state_province      text,
    postal_code         text,
    country_code        character(2)    NOT NULL,

    -- Capture audit (append-only)
    captured_at         timestamptz     NOT NULL DEFAULT now(),
    captured_by         uuid            NOT NULL,

    CONSTRAINT cas_pkey                 PRIMARY KEY (id),
    CONSTRAINT cas_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT cas_commitment_type_uq   UNIQUE (commitment_id, address_type),
    CONSTRAINT cas_type_chk             CHECK (address_type IN ('DELIVERY','BILLING','SHIP_FROM'))
);

COMMENT ON TABLE document.commitment_address_snapshot IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Immutable delivery/billing/ship-from address snapshot at commitment approval. '
    'One row per (commitment_id, address_type). Append-only.';


-- ============================================================================
-- §13  document.obligation_horizon — multi-year demand signal
-- ============================================================================
-- obligation_tier = lifecycle progression (PLANNED → FORECAST → RESERVED → COMMITTED → CONSUMED).
-- status = operational state (active | cancelled | superseded).
-- variance_to_original = computed delta from baseline; NULL when original_amount not yet set.
-- Child of document.commitment.

CREATE TABLE IF NOT EXISTS document.obligation_horizon (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Parent document
    commitment_id           uuid        NOT NULL,
    schedule_id             uuid,

    -- Fiscal scope
    fiscal_year             smallint    NOT NULL,
    period_from             smallint    NOT NULL DEFAULT 1,
    period_to               smallint    NOT NULL DEFAULT 12,

    -- Obligation state
    obligation_tier         text        NOT NULL DEFAULT 'PLANNED',
    amount                  numeric(18,4) NOT NULL,
    original_amount         numeric(18,4),
    currency_code           text        NOT NULL,

    -- Budget linkage
    fp_id                   uuid,
    intent_id               uuid,
    company_code_id         uuid,

    -- Spread
    spread_method           text        NOT NULL DEFAULT 'EVEN',
    period_amounts          jsonb,
    confidence              numeric(3,2) NOT NULL DEFAULT 1.00,
    source_type             text        NOT NULL DEFAULT 'CONTRACT',

    -- Escalation
    escalation_formula      jsonb,
    escalation_applied_at   timestamptz,

    -- FX
    contract_currency_code  text,
    contract_amount         numeric(18,4),
    exchange_rate           numeric(12,6),
    rate_type               text,

    -- Retention
    retention_pct           numeric(5,2),
    retention_release_date  date,

    -- Amendment tracking
    amendment_count         smallint    NOT NULL DEFAULT 0,
    variance_to_original    numeric(18,4) GENERATED ALWAYS AS (amount - original_amount) STORED,

    -- Lifecycle events (timestamps; not replacements for status)
    promoted_at             timestamptz,
    reserved_at             timestamptz,
    funding_txn_id          uuid,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            text             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT oh_pkey              PRIMARY KEY (id),
    CONSTRAINT oh_status_chk        CHECK (status IN ('active','cancelled','superseded')),
    CONSTRAINT oh_tier_chk          CHECK (obligation_tier IN (
        'PLANNED','FORECAST','RESERVED','COMMITTED','CONSUMED')),
    CONSTRAINT oh_spread_chk        CHECK (spread_method IN (
        'EVEN','FRONT_LOADED','BACK_LOADED','MILESTONE','CUSTOM')),
    CONSTRAINT oh_source_chk        CHECK (source_type IN (
        'CONTRACT','PO','SUBSCRIPTION','LEASE','FORECAST_MODEL','MANUAL')),
    CONSTRAINT oh_period_range_chk  CHECK (
        period_from BETWEEN 1 AND 12
        AND period_to BETWEEN 1 AND 12
        AND period_from <= period_to),
    CONSTRAINT oh_confidence_chk    CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT oh_amount_chk        CHECK (amount >= 0),
    CONSTRAINT oh_retention_chk     CHECK (retention_pct IS NULL OR retention_pct BETWEEN 0 AND 100),
    CONSTRAINT oh_amendment_chk     CHECK (amendment_count >= 0)
);

COMMENT ON TABLE document.obligation_horizon IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: multi-year demand signal. '
    'obligation_tier: PLANNED → FORECAST → RESERVED → COMMITTED → CONSUMED. '
    'Created on contract signing; advanced by budget lifecycle events. '
    'Child of document.commitment. variance_to_original = GENERATED (amount - original_amount).';


-- ============================================================================
-- §CMT2  document.forecast_scenario — what-if forecast scenario envelope
-- ============================================================================
-- Contains forecast_line items for one version of a forward-looking projection.
-- Multiple scenarios enable side-by-side comparison (best/worst/expected).

CREATE TABLE IF NOT EXISTS document.forecast_scenario (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,

    -- Company scope
    company_code_id         uuid            NOT NULL,

    -- Classification
    description             text,
    scenario_type           text            NOT NULL DEFAULT 'EXPECTED',
    scenario_purpose        text            NOT NULL DEFAULT 'BUDGET',

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_from             smallint        NOT NULL DEFAULT 1,
    period_to               smallint        NOT NULL DEFAULT 12,

    -- Model linkage (optional — for driver-based forecasts)
    planning_model_id       uuid,

    -- Ownership
    responsible_person_id   uuid,

    -- Currency
    base_currency_code      character(3)    NOT NULL,

    -- Totals (trigger-synced from lines)
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,
    line_count              smallint        NOT NULL DEFAULT 0,

    -- Versioning
    version                 integer         NOT NULL DEFAULT 1,
    based_on_scenario_id    uuid,
    is_baseline             boolean         NOT NULL DEFAULT false,

    -- Comparison
    variance_to_baseline    numeric(18,4),
    confidence_level        numeric(3,2),

    -- Approval
    approved_at             timestamptz,
    approved_by             uuid,
    published_at            timestamptz,
    published_by            uuid,

    -- Tags & Metadata
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','in_review','approved','published')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT fs_pkey                  PRIMARY KEY (id),
    CONSTRAINT fs_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT fs_tenant_code_ver_uq    UNIQUE (tenant_id, company_code_id, code, version),
    CONSTRAINT fs_code_nonempty         CHECK (btrim(code) <> ''),
    CONSTRAINT fs_name_nonempty         CHECK (btrim(name) <> ''),
    CONSTRAINT fs_status_chk            CHECK (status IN (
        'draft','in_review','approved','published','superseded','archived','cancelled')),
    CONSTRAINT fs_type_chk              CHECK (scenario_type IN (
        'EXPECTED','BEST_CASE','WORST_CASE','STRETCH','CONSERVATIVE',
        'BASELINE','WHAT_IF','SENSITIVITY')),
    CONSTRAINT fs_purpose_chk           CHECK (scenario_purpose IN (
        'BUDGET','FORECAST','REFORECAST','PROJECTION','STRATEGIC','SCENARIO_ANALYSIS')),
    CONSTRAINT fs_period_range_chk      CHECK (
        period_from BETWEEN 1 AND 16
        AND period_to BETWEEN 1 AND 16
        AND period_from <= period_to),
    CONSTRAINT fs_version_chk           CHECK (version >= 1),
    CONSTRAINT fs_confidence_chk        CHECK (confidence_level IS NULL OR confidence_level BETWEEN 0 AND 1),
    CONSTRAINT fs_no_self_base          CHECK (based_on_scenario_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.forecast_scenario IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''in_review'',''approved'',''published'')). What-if forecast scenario envelope. Contains control.forecast_line items. '
    'scenario_type: EXPECTED, BEST_CASE, WORST_CASE, etc. for side-by-side comparison. '
    'Versioned per (tenant, company, code). Links to master.planning_model for driver-based forecasts. '
    'Status lifecycle: draft → in_review → approved → published → superseded | archived.';
