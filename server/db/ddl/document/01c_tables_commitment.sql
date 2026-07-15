-- ============================================================================
-- document/01c_tables_commitment.sql
-- Concept: Commitments — purchase commitments, obligation horizons, forecast scenarios
-- Depends on: 04_tables/004_document.sql, 04_tables/003b_master_finance.sql
-- Scope: Commitment Engine document tables
-- Domain: commitment (header), commitment_procurement (1:1 P2P ext),
--         commitment_line, commitment_release_allocation,
--         obligation_horizon, forecast_scenario
--
-- Commitment identity uses direct document fields and live master joins.
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

    -- Request / approval
    requested_by            uuid            NOT NULL,
    workflow_request_id     uuid,
    approved_at             timestamptz,
    approved_by             uuid,

    -- Classification
    commitment_type         text            NOT NULL DEFAULT 'purchase_order',
    order_type              text,

    -- Counterparty (polymorphic)
    party_type              text,
    party_id                uuid,
    parent_commitment_id    uuid,
    release_sequence_no     smallint,
    responsible_person_id   uuid,

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
    invoiced_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    paid_amount             numeric(18,4)   NOT NULL DEFAULT 0,
    exchange_rate           numeric(18,10),
    fx_rate_snapshot        jsonb,
    fx_policy               text            NOT NULL DEFAULT 'spot_on_event',

    -- Budget / posting linkage
    budget_check_result     text,
    encumbrance_je_id       uuid,

    -- Fiscal scope (advisory — derived from document_date by trigger;
    -- strict period-gate enforcement lives on finance.journal_entry, not here)
    fiscal_year             smallint,
    period_number           smallint,

    -- Payment Terms
    payment_term_id         uuid,

    -- Renewal
    renewal_terms           jsonb,
    renewal_count           smallint        NOT NULL DEFAULT 0,
    renewed_from_id         uuid,

    -- Versioning (universal — see docs/architecture/p2p.md §Universal-Columns)
    row_version             bigint          NOT NULL DEFAULT 1,
    version_number          int             NOT NULL DEFAULT 1,
    previous_version_id     uuid,
    is_current_version      boolean         NOT NULL DEFAULT true,
    supersedes_at           timestamptz,

    -- Provisional draft lifecycle (create_mode = EARLY_DRAFT)
    is_provisional          boolean         NOT NULL DEFAULT false,
    draft_expires_at        timestamptz,
    draft_started_at        timestamptz,
    draft_started_by        uuid,

    -- Closure (universal)
    terminal_status         text,
    status_source           text            NOT NULL DEFAULT 'manual',

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
    CONSTRAINT cmt_tenant_code_uq       UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT cmt_code_nonempty        CHECK (is_provisional OR btrim(code) <> ''),
    CONSTRAINT cmt_status_chk           CHECK (status IN (
        'draft','pending_approval','approved','active','partially_fulfilled',
        'fully_fulfilled','closed','cancelled','expired','suspended','rejected')),
    CONSTRAINT cmt_type_chk             CHECK (commitment_type IN (
        'purchase_order','contract','lease','subscription','standing_order',
        'framework_agreement','grant_award','internal_order')),
    CONSTRAINT cmt_order_type_scope_chk CHECK (
        order_type IS NULL OR commitment_type = 'purchase_order'),
    CONSTRAINT cmt_order_type_domain_chk CHECK (
        order_type IS NULL OR order_type IN (
            'standard','blanket','service','emergency')),
    CONSTRAINT cmt_check_chk            CHECK (budget_check_result IS NULL OR budget_check_result IN (
        'passed','warned','override','blocked','exempt')),
    CONSTRAINT cmt_amount_nonneg        CHECK (total_amount >= 0),
    CONSTRAINT cmt_scheduled_nonneg     CHECK (scheduled_amount >= 0),
    CONSTRAINT cmt_invoiced_nonneg      CHECK (invoiced_amount >= 0),
    CONSTRAINT cmt_paid_nonneg          CHECK (paid_amount >= 0),
    CONSTRAINT cmt_invoiced_lte_total   CHECK (invoiced_amount <= total_amount),
    CONSTRAINT cmt_paid_lte_invoiced    CHECK (paid_amount <= invoiced_amount),
    CONSTRAINT cmt_fx_policy_chk        CHECK (fx_policy IN (
        'spot_on_event','fixed_at_commitment','manual_contract_rate')),
    CONSTRAINT cmt_currency_triad_chk   CHECK (
        status = 'draft'
        OR (
            (currency_code = base_currency_code AND exchange_rate = 1.0)
            OR (currency_code <> base_currency_code AND exchange_rate IS NOT NULL AND exchange_rate > 0)
        )),
    CONSTRAINT cmt_fulfilled_nonneg     CHECK (fulfilled_amount >= 0),
    CONSTRAINT cmt_released_nonneg      CHECK (released_amount >= 0),
    CONSTRAINT cmt_fulfilled_lte_total  CHECK (fulfilled_amount <= total_amount),
    CONSTRAINT cmt_date_chk             CHECK (expiry_date IS NULL OR expiry_date > effective_date),
    CONSTRAINT cmt_period_chk           CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 16),
    CONSTRAINT cmt_renewal_chk          CHECK (renewal_count >= 0),
    CONSTRAINT cmt_party_chk            CHECK (
        (party_type IS NULL AND party_id IS NULL)
        OR (party_type IS NOT NULL AND party_id IS NOT NULL)),
    CONSTRAINT cmt_release_pair_chk     CHECK (
        (parent_commitment_id IS NULL AND release_sequence_no IS NULL)
        OR (parent_commitment_id IS NOT NULL AND release_sequence_no IS NOT NULL)),
    CONSTRAINT cmt_no_self_parent       CHECK (parent_commitment_id IS DISTINCT FROM id),
    CONSTRAINT cmt_no_self_renew        CHECK (renewed_from_id IS DISTINCT FROM id),
    CONSTRAINT cmt_terminal_status_chk  CHECK (
        terminal_status IS NULL OR terminal_status IN ('CANCELED','REJECTED')),
    CONSTRAINT cmt_status_source_chk    CHECK (
        status_source IN ('manual','derived','system','terminal')),
    CONSTRAINT cmt_version_self_chk     CHECK (previous_version_id IS DISTINCT FROM id),
    CONSTRAINT cmt_provisional_status_chk CHECK (
        is_provisional = false OR status = 'draft'),
    CONSTRAINT cmt_provisional_code_chk CHECK (
        is_provisional = false OR code = '')
);

COMMENT ON TABLE document.commitment IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_approval'',''approved'',''active'',''partially_fulfilled'')). Rejected records remain revisable but are not operationally active. Commitment header: PO, contract, lease, subscription, standing order. '
    'Phase 1 reset folds the former commitment_procurement extension into the commitment header. '
    'code is the PO/commitment business identifier. Money flow is total, scheduled, released, fulfilled, invoiced, paid. '
    'Children: commitment_line, ledger.commitment_schedule, ledger.commitment_fulfillment.';
ALTER TABLE document.commitment
    ADD COLUMN IF NOT EXISTS is_provisional boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS draft_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS draft_started_at timestamptz,
    ADD COLUMN IF NOT EXISTS draft_started_by uuid;

DO $$ BEGIN ALTER TABLE document.commitment DROP CONSTRAINT IF EXISTS cmt_code_nonempty; END $$;
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_code_nonempty
    CHECK (is_provisional OR btrim(code) <> '');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_provisional_status_chk
    CHECK (is_provisional = false OR status = 'draft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.commitment ADD CONSTRAINT cmt_provisional_code_chk
    CHECK (is_provisional = false OR code = '');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN document.commitment.is_provisional IS
    'True for create_mode=EARLY_DRAFT provisional rows. Provisional rows have status=draft and no business code until promoted by first Save.';
COMMENT ON COLUMN document.commitment.draft_expires_at IS
    'Expiry target for abandoned provisional drafts. Cleanup applies only with safety predicates: is_provisional=true, status=draft, code empty.';
COMMENT ON COLUMN document.commitment.draft_started_by IS
    'Principal that initiated the provisional draft; used to enforce one active provisional per tenant/entity/user.';


-- ============================================================================
-- §4.1  document.commitment_procurement — 1:1 procurement extension
-- ============================================================================
-- Procurement-commercial child of document.commitment. One row per PO-type
-- commitment. Holds supplier, terms, running total caches.

COMMENT ON COLUMN document.commitment.fx_rate_snapshot IS
    'Explains how exchange_rate was resolved by fx.resolve_rate: identity, spot, commitment_fixed, reference_document, or manual_override.';
COMMENT ON COLUMN document.commitment.fx_policy IS
    'FX policy for downstream P2P documents: spot_on_event, fixed_at_commitment, or manual_contract_rate.';



-- ============================================================================
-- §4.2  document.commitment_line — PO / contract line items
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.commitment_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    company_code_id         uuid            NOT NULL,

    -- Parent commitment
    commitment_id           uuid            NOT NULL,
    line_no                 smallint        NOT NULL,

    -- Source line links
    requisition_line_id     uuid,
    parent_contract_line_id uuid,

    -- Item / classification
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

    -- Delivery tolerance
    over_delivery_tolerance  numeric(5,2)   DEFAULT 0,
    under_delivery_tolerance numeric(5,2)   DEFAULT 0,

    -- Tax determination
    tax_group_id            uuid,
    withholding_tax_group_id uuid,
    to_tax_jurisdiction_id  uuid,
    from_tax_jurisdiction_id uuid,

    -- Delivery / address bundle
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

    -- Derived operational caches
    received_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    invoiced_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    released_quantity       numeric(18,4)   NOT NULL DEFAULT 0,
    released_amount         numeric(18,4)   NOT NULL DEFAULT 0,

    -- Lifecycle
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
    CONSTRAINT cl_tax_nonneg        CHECK (tax_amount >= 0),
    CONSTRAINT cl_wht_nonneg        CHECK (withholding_tax_amount >= 0),
    CONSTRAINT cl_proc_type_chk     CHECK (procurement_type IN ('goods','services')),
    CONSTRAINT cl_line_type_chk     CHECK (line_type IN ('contract','catalog','marketplace','noncatalog')),
    CONSTRAINT cl_status_chk        CHECK (status IN (
        'open','partially_received','fully_received',
        'partially_invoiced','fully_invoiced','closed','cancelled')),
    CONSTRAINT cl_received_nonneg   CHECK (received_quantity >= 0),
    CONSTRAINT cl_invoiced_nonneg   CHECK (invoiced_quantity >= 0),
    CONSTRAINT cl_released_nonneg   CHECK (released_quantity >= 0),
    CONSTRAINT cl_released_amt_nonneg CHECK (released_amount >= 0),
    CONSTRAINT cl_tolerance_chk     CHECK (
        (over_delivery_tolerance IS NULL OR over_delivery_tolerance >= 0)
        AND (under_delivery_tolerance IS NULL OR under_delivery_tolerance >= 0)),
    CONSTRAINT cl_no_self_parent    CHECK (parent_contract_line_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.commitment_line IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Commitment origination line items. Phase 1 reset keeps classification and item-nature here, moves legal addresses to line scope, and drops legacy line metadata/version columns.';


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
