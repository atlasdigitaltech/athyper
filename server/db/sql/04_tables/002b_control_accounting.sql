-- 04_tables/002b_control_accounting.sql
-- Depends on: 002a_control_core.sql, 01_schemas, 03_bootstrap_functions (shared.uuidv7)
-- Control schema tables (Part B): accounting profiles, book posting rules, dimension policies, document sequences, and tax configuration.

-- ============================================================================
-- §BPR  control.book_posting_rule — cross-book cascade rules
-- ============================================================================
-- When a JE posts to source_book, these rules auto-derive JEs for target_book.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.book_posting_rule (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Rule identity
    rule_code        text         NOT NULL,
    rule_name        text         NOT NULL,
    description      text,

    -- Source → Target
    source_book_id   uuid         NOT NULL,
    target_book_id   uuid         NOT NULL,

    -- Scope filters (optional — narrow which JEs trigger this rule)
    scope_doc_type        text,
    scope_intent_code     text,
    scope_account_class   text,
    scope_subledger_type  text,

    -- Account strategy
    account_strategy text         NOT NULL DEFAULT 'same',
    account_mapping  jsonb,
    target_profile_id uuid,

    -- Amount strategy
    amount_strategy  text         NOT NULL DEFAULT 'mirror',
    amount_multiplier numeric(10,6) DEFAULT 1.0,
    amount_formula   jsonb,

    -- Recognition timing
    recognition_timing text       NOT NULL DEFAULT 'simultaneous',
    recognition_lag_periods smallint DEFAULT 0,

    -- Control
    priority         smallint     NOT NULL DEFAULT 0,
    version          smallint     NOT NULL DEFAULT 1,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'active',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT book_posting_rule_pkey PRIMARY KEY (id),
    CONSTRAINT book_posting_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT book_posting_rule_company_code_uq
        UNIQUE (tenant_id, company_code_id, rule_code),
    CONSTRAINT bpr_diff_books_chk CHECK (source_book_id != target_book_id),
    CONSTRAINT bpr_formula_chk CHECK (amount_strategy != 'formula' OR amount_formula IS NOT NULL),
    CONSTRAINT bpr_multiplier_chk CHECK (amount_strategy != 'multiply' OR amount_multiplier IS NOT NULL),
    CONSTRAINT bpr_map_chk CHECK (account_strategy != 'map' OR account_mapping IS NOT NULL),
    CONSTRAINT bpr_profile_chk CHECK (account_strategy != 'profile' OR target_profile_id IS NOT NULL),
    CONSTRAINT bpr_lag_chk CHECK (recognition_timing != 'deferred' OR recognition_lag_periods > 0),
    CONSTRAINT bpr_code_nonempty CHECK (btrim(rule_code) <> ''),
    CONSTRAINT bpr_name_nonempty CHECK (btrim(rule_name) <> '')
);

COMMENT ON TABLE control.book_posting_rule IS
    'Cross-book derivation rules. When a JE posts to source_book, these rules '
    'auto-derive JEs for target_book. Strategies: same/map/profile for accounts, '
    'mirror/multiply/formula/suppress for amounts, simultaneous/deferred/on_close for timing.';

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- §1  transaction_flow_template — canonical lifecycle events per transaction flow
--     tenant_id IS NULL = platform-global row; tenant_id = UUID = tenant override.
--     Uniqueness on (tenant_id, flow_code, event_code) enforced by partial index
--     tft_flow_event_uq in 07_indexes (handles nullable tenant_id via COALESCE).
CREATE TABLE IF NOT EXISTS control.transaction_flow_template (
    -- Identity
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid,                   -- NULL = platform-global

    -- Table-specific
    flow_code         text        NOT NULL,
    direction         text        NOT NULL,
    event_code        text        NOT NULL,
    event_name        text        NOT NULL,
    event_seq         smallint    NOT NULL,
    is_mandatory      boolean     NOT NULL DEFAULT true,
    creates_je        boolean     NOT NULL DEFAULT true,
    reverses_prior    text,
    commitment_action text        NOT NULL DEFAULT 'NONE',
    description       text,

    -- Metadata
    metadata          jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d        NOT NULL DEFAULT 'active',
    is_active         boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT tft_pkey            PRIMARY KEY (id),
    CONSTRAINT tft_direction_chk   CHECK (direction IN ('INBOUND','OUTBOUND','BILATERAL')),
    CONSTRAINT tft_commitment_chk  CHECK (commitment_action IN (
        'NONE','CREATE','INCREASE','RELEASE_PARTIAL','RELEASE_FULL','CANCEL')),
    CONSTRAINT tft_seq_positive    CHECK (event_seq > 0),
    CONSTRAINT tft_flow_nonempty   CHECK (btrim(flow_code) <> ''),
    CONSTRAINT tft_event_nonempty  CHECK (btrim(event_code) <> '')
);

COMMENT ON TABLE control.transaction_flow_template IS
    'Engine 4.13: canonical lifecycle events per transaction flow. '
    'System-seeded (tenant_id IS NULL), tenant-overridable (tenant_id = UUID). '
    '15 flows, 38 event codes. Uniqueness enforced by tft_flow_event_uq partial index.';


-- §2  acct_profile_config — core profile configuration (1:1 with accounting_profile)
--     UNIQUE (tenant_id, id) is required: child tables (§3-§9) use composite FK
--     (profile_config_id, tenant_id) → (id, tenant_id) for row-level tenant scoping.
CREATE TABLE IF NOT EXISTS control.acct_profile_config (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    accounting_profile_id   uuid        NOT NULL,

    -- Classification
    direction               text        NOT NULL DEFAULT 'INBOUND',
    profile_type            text        NOT NULL DEFAULT 'STANDARD',
    subledger_type          text        NOT NULL DEFAULT 'AP',
    applicable_flow_codes   text[]      NOT NULL DEFAULT '{NON_PO}',
    applicable_doc_types    text[]      NOT NULL DEFAULT '{}',

    -- Recognition
    recognition_timing      text        NOT NULL DEFAULT 'IMMEDIATE',
    deferral_schedule_type  text,
    deferral_periods        smallint,
    auto_reverse            boolean     NOT NULL DEFAULT false,
    reversal_period_offset  smallint    NOT NULL DEFAULT 1,

    -- Tax
    tax_treatment           text        NOT NULL DEFAULT 'STANDARD',
    default_tax_code        text,
    is_reverse_charge       boolean     NOT NULL DEFAULT false,

    -- Matching
    matching_type           text        NOT NULL DEFAULT 'NONE',

    -- Versioning
    version                 integer     NOT NULL DEFAULT 1,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    supersedes_id           uuid,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            text             NOT NULL DEFAULT 'draft',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apc_pkey              PRIMARY KEY (id),
    CONSTRAINT apc_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT apc_profile_version_uq UNIQUE (accounting_profile_id, version),
    CONSTRAINT apc_status_chk        CHECK (status IN ('draft','active','superseded','inactive')),
    CONSTRAINT apc_direction_chk     CHECK (direction IN ('INBOUND','OUTBOUND','BILATERAL')),
    CONSTRAINT apc_type_chk          CHECK (profile_type IN (
        'STANDARD','ACCRUAL','PREPAYMENT','CAPITALIZATION','RECLASS','INTERCOMPANY',
        'FX_REVALUATION','REVERSAL','STATISTICAL','COMMITMENT','ENCUMBRANCE',
        'MILESTONE','LEASE','REVENUE_POINT','REVENUE_OVER_TIME','DEFERRED_REVENUE','COGS')),
    CONSTRAINT apc_subledger_chk     CHECK (subledger_type IN (
        'AP','AR','ASSET','INVENTORY','WIP','COMMISSION','NONE')),
    CONSTRAINT apc_timing_chk        CHECK (recognition_timing IN (
        'IMMEDIATE','DEFERRED','SCHEDULED','EVENT_DRIVEN')),
    CONSTRAINT apc_matching_chk      CHECK (matching_type IN (
        'NONE','TWO_WAY','THREE_WAY','FOUR_WAY')),
    CONSTRAINT apc_effective_chk     CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT apc_deferral_chk      CHECK (deferral_periods IS NULL OR deferral_periods > 0)
);

COMMENT ON TABLE control.acct_profile_config IS
    'Engine 4.13: core profile configuration; 1:1 extension of master.accounting_profile. '
    'Versioned + effective-dated. status: draft → active → superseded | inactive. '
    'UNIQUE (tenant_id, id) required: children use composite FK for row-level tenant scoping.';


-- §3  acct_profile_commitment_config — commitment behaviour (optional 1:1 child of §2)
CREATE TABLE IF NOT EXISTS control.acct_profile_commitment_config (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    profile_config_id       uuid        NOT NULL,

    -- Commitment behaviour
    creates_commitment      boolean     NOT NULL DEFAULT true,
    commitment_type         text        NOT NULL DEFAULT 'ONE_TIME',
    releases_commitment_on  text,
    encumbrance_behavior    text        NOT NULL DEFAULT 'STANDARD',
    multi_year_strategy     text        NOT NULL DEFAULT 'CURRENT_YEAR_ONLY',

    -- Advance / Retention
    advance_pct             numeric(5,2),
    advance_recovery_method text,
    retention_pct           numeric(5,2),
    retention_release_event text,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apcc_pkey             PRIMARY KEY (id),
    CONSTRAINT apcc_config_uq        UNIQUE (profile_config_id),
    CONSTRAINT apcc_type_chk         CHECK (commitment_type IN (
        'ONE_TIME','FIXED_RECURRING','MILESTONE','USAGE_BASED','ESCALATING','RETENTION_RELEASE')),
    CONSTRAINT apcc_encumbrance_chk  CHECK (encumbrance_behavior IN (
        'NONE','STANDARD','STATISTICAL_ONLY')),
    CONSTRAINT apcc_multiyear_chk    CHECK (multi_year_strategy IN (
        'CURRENT_YEAR_ONLY','HORIZON_SPREAD','FULL_RESERVE')),
    CONSTRAINT apcc_advance_pct_chk  CHECK (advance_pct IS NULL OR (advance_pct BETWEEN 0 AND 100)),
    CONSTRAINT apcc_retention_pct_chk CHECK (retention_pct IS NULL OR (retention_pct BETWEEN 0 AND 100))
);

COMMENT ON TABLE control.acct_profile_commitment_config IS
    'Engine 4.13: commitment behaviour for profiles that create encumbrances. '
    'Optional 1:1 child of acct_profile_config. Includes advance/retention percentages.';


-- §4  acct_profile_revenue_config — revenue recognition (optional 1:1 child of §2)
CREATE TABLE IF NOT EXISTS control.acct_profile_revenue_config (
    -- Identity
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,
    profile_config_id               uuid        NOT NULL,

    -- Revenue recognition
    revenue_recognition_method      text        NOT NULL DEFAULT 'POINT_IN_TIME',
    variable_consideration          text,
    standalone_selling_price_method text,

    -- COGS pairing
    paired_profile_id               uuid,
    fires_paired_on_event           text        NOT NULL DEFAULT 'FULFILLMENT',

    -- Accounts
    deferral_account_code           text,
    unbilled_ar_account_code        text,

    -- Metadata
    metadata                        jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d                      NOT NULL DEFAULT 'active',
    is_active         boolean                   GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT aprc_pkey        PRIMARY KEY (id),
    CONSTRAINT aprc_config_uq   UNIQUE (profile_config_id),
    CONSTRAINT aprc_method_chk  CHECK (revenue_recognition_method IN (
        'POINT_IN_TIME','OVER_TIME','PCT_COMPLETION','INPUT_METHOD','OUTPUT_METHOD'))
);

COMMENT ON TABLE control.acct_profile_revenue_config IS
    'Engine 4.13: revenue recognition config for OUTBOUND profiles. '
    'Includes COGS pairing via paired_profile_id → master.accounting_profile. '
    'fires_paired_on_event gates COGS entry generation.';


-- §5  acct_profile_settlement_config — settlement + dynamic discounting (optional 1:1 child of §2)
CREATE TABLE IF NOT EXISTS control.acct_profile_settlement_config (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    profile_config_id       uuid        NOT NULL,

    -- Settlement
    settlement_method       text        NOT NULL DEFAULT 'PAYMENT',
    settlement_tolerance    numeric(5,2) NOT NULL DEFAULT 0.00,

    -- Dynamic discount
    discount_model          text,
    discount_curve_type     text,
    discount_apr            numeric(8,4),
    discount_min_days       smallint,
    discount_min_amount     numeric(18,4),

    -- Supply chain finance
    scf_financier_id        uuid,
    scf_split_pct           numeric(5,2),

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apsc_pkey             PRIMARY KEY (id),
    CONSTRAINT apsc_config_uq        UNIQUE (profile_config_id),
    CONSTRAINT apsc_settle_chk       CHECK (settlement_method IN (
        'PAYMENT','COLLECTION','NETTING','OFFSET','WRITE_OFF','PREPAID','SCF_FINANCED','NONE')),
    CONSTRAINT apsc_discount_chk     CHECK (discount_model IS NULL OR discount_model IN (
        'BUYER_FUNDED','SCF_SPLIT','SUPPLIER_INITIATED')),
    CONSTRAINT apsc_tolerance_chk    CHECK (settlement_tolerance BETWEEN 0 AND 100),
    CONSTRAINT apsc_scf_pct_chk      CHECK (scf_split_pct IS NULL OR scf_split_pct BETWEEN 0 AND 100),
    CONSTRAINT apsc_apr_chk          CHECK (discount_apr IS NULL OR discount_apr >= 0),
    CONSTRAINT apsc_min_amt_chk      CHECK (discount_min_amount IS NULL OR discount_min_amount >= 0)
);

COMMENT ON TABLE control.acct_profile_settlement_config IS
    'Engine 4.13: settlement + dynamic discounting for profiles with special payment terms. '
    'Only exists for non-standard settlement. Includes SCF financing config.';


-- §6  acct_profile_event — profile × lifecycle event bridge
--     UNIQUE (tenant_id, id) required: acct_profile_entry_template uses composite FK
--     (profile_event_id, tenant_id) → (id, tenant_id) for row-level tenant scoping.
CREATE TABLE IF NOT EXISTS control.acct_profile_event (
    -- Identity
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    profile_config_id        uuid        NOT NULL,

    -- Event definition
    event_code               text        NOT NULL,
    event_name               text        NOT NULL,
    creates_je               boolean     NOT NULL DEFAULT true,
    reverses_event           text,
    is_auto_reverse          boolean     NOT NULL DEFAULT false,
    auto_reverse_offset      smallint    NOT NULL DEFAULT 1,

    -- Commitment interaction
    commitment_action        text        NOT NULL DEFAULT 'NONE',
    commitment_amount_source text,

    -- Paired profile
    fires_paired_profile     boolean     NOT NULL DEFAULT false,

    event_seq                smallint    NOT NULL DEFAULT 0,

    -- Metadata
    metadata                 jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d              NOT NULL DEFAULT 'active',
    is_active         boolean           GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT ape_pkey            PRIMARY KEY (id),
    CONSTRAINT ape_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT ape_config_event_uq UNIQUE (profile_config_id, event_code),
    CONSTRAINT ape_commitment_chk  CHECK (commitment_action IN (
        'NONE','CREATE','INCREASE','RELEASE_PARTIAL','RELEASE_FULL','CANCEL')),
    CONSTRAINT ape_event_nonempty  CHECK (btrim(event_code) <> '')
);

COMMENT ON TABLE control.acct_profile_event IS
    'Engine 4.13: profile × lifecycle event bridge. '
    'fires_paired_profile=true triggers COGS entry generation via acct_profile_revenue_config. '
    'UNIQUE (tenant_id, id) required: acct_profile_entry_template uses composite FK.';


-- §7  acct_profile_entry_template — Dr/Cr line templates per event
CREATE TABLE IF NOT EXISTS control.acct_profile_entry_template (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    profile_event_id        uuid        NOT NULL,

    -- Template definition
    line_seq                smallint    NOT NULL,
    description             text        NOT NULL,
    posting_side            text        NOT NULL,
    account_source          text        NOT NULL DEFAULT 'FIXED',
    account_code            text,
    account_lookup_key      text,
    account_fallback        text,
    amount_source           text        NOT NULL DEFAULT 'DOCUMENT_TOTAL',
    amount_formula          text,
    amount_percentage       numeric(8,4),
    is_balancing_line       boolean     NOT NULL DEFAULT false,

    -- Dimension overrides
    override_cost_center    text,
    override_profit_center  text,
    override_dimension_set_id uuid,

    -- Conditional
    applies_to_doc_types    text[],
    sort_order              smallint    NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apet_pkey          PRIMARY KEY (id),
    CONSTRAINT apet_event_seq_uq  UNIQUE (profile_event_id, line_seq),
    CONSTRAINT apet_side_chk      CHECK (posting_side IN ('DEBIT','CREDIT')),
    CONSTRAINT apet_source_chk    CHECK (account_source IN ('FIXED','FROM_INTENT','FROM_CATEGORY','POSTING_ROLE')),
    CONSTRAINT apet_source_key_chk CHECK (account_source <> 'POSTING_ROLE' OR account_lookup_key IS NOT NULL),
    CONSTRAINT apet_amount_chk    CHECK (amount_source IN (
        'DOCUMENT_TOTAL','LINE_AMOUNT','TAX_AMOUNT','CALCULATED','REMAINDER',
        'COMMITMENT_AMOUNT','MILESTONE_AMOUNT','FULFILLED_AMOUNT',
        'REVENUE_AMOUNT','COGS_AMOUNT','DISCOUNT_AMOUNT',
        'ADVANCE_AMOUNT','ADVANCE_RECOVERY',
        'RETENTION_AMOUNT','RETENTION_BALANCE','PENALTY_AMOUNT','REBATE_AMOUNT',
        'NET_PAYABLE','DISCOUNT_EARNED','NET_AFTER_DISCOUNT','SCF_FINANCIER_AMOUNT')),
    CONSTRAINT apet_pct_chk       CHECK (amount_percentage IS NULL OR amount_percentage BETWEEN 0 AND 100),
    CONSTRAINT apet_desc_nonempty CHECK (btrim(description) <> '')
);

COMMENT ON TABLE control.acct_profile_entry_template IS
    'Engine 4.13: Dr/Cr line templates per event. 21 amount_source values. '
    'is_balancing_line=true: line aggregates split AP/AR accounting lines. '
    'account_source: FIXED | FROM_INTENT | FROM_CATEGORY | POSTING_ROLE. '
    'POSTING_ROLE requires account_lookup_key (carries posting_role_code).';


-- §8  acct_profile_book_rule — per-book posting behaviour
CREATE TABLE IF NOT EXISTS control.acct_profile_book_rule (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    profile_config_id       uuid        NOT NULL,

    -- Rule definition
    book_code               text        NOT NULL,
    posting_method          text        NOT NULL DEFAULT 'MIRROR',
    account_mapping         jsonb       NOT NULL DEFAULT '{}',
    applies_to_events       text[],

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apbr_pkey             PRIMARY KEY (id),
    CONSTRAINT apbr_config_book_uq   UNIQUE (profile_config_id, book_code),
    CONSTRAINT apbr_method_chk       CHECK (posting_method IN ('MIRROR','EXCLUDE','REMAP')),
    CONSTRAINT apbr_book_nonempty    CHECK (btrim(book_code) <> '')
);

COMMENT ON TABLE control.acct_profile_book_rule IS
    'Engine 4.13: per-book posting behaviour. '
    'MIRROR = same entries as primary; EXCLUDE = skip book entirely; '
    'REMAP = substitute accounts via account_mapping JSONB.';


-- §9  acct_profile_dimension_rule — dimension derivation per profile
CREATE TABLE IF NOT EXISTS control.acct_profile_dimension_rule (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    profile_config_id       uuid        NOT NULL,

    -- Rule definition
    dimension_type_id       uuid        NOT NULL,
    derive_source           text        NOT NULL,
    fixed_value_id          uuid,
    fallback_source         text,
    fallback_value_id       uuid,
    behavior                text        NOT NULL DEFAULT 'DERIVE_IF_MISSING',
    is_required             boolean     NOT NULL DEFAULT false,
    applies_to_events       text[],
    applies_to_books        text[],
    priority                smallint    NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apdr_pkey         PRIMARY KEY (id),
    CONSTRAINT apdr_source_chk   CHECK (derive_source IN (
        'FROM_DOCUMENT','FROM_LINE','FROM_OU','FROM_INTENT','FROM_COMMITMENT',
        'FROM_CONTRACT','FROM_CUSTOMER','FROM_PRODUCT','FIXED','INHERIT')),
    CONSTRAINT apdr_behavior_chk CHECK (behavior IN (
        'REQUIRED','OPTIONAL','DERIVE_IF_MISSING','FIXED_VALUE','FORBIDDEN'))
);

COMMENT ON TABLE control.acct_profile_dimension_rule IS
    'Engine 4.13: dimension derivation rules per profile. '
    'Controls how dimensions are stamped on JE lines. '
    'Priority determines evaluation order when multiple rules apply.';


-- §10  classification_to_intent_rule — classification → intent resolution
CREATE TABLE IF NOT EXISTS control.classification_to_intent_rule (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Classification scope
    classification_source   text        NOT NULL DEFAULT 'SPEND_CATEGORY',
    classification_id       uuid        NOT NULL,
    direction               text,

    -- Rule definition
    condition_type          text        NOT NULL,
    condition_config        jsonb       NOT NULL DEFAULT '{}',
    applies_to_flows        text[],

    -- Resolution result
    resolved_intent_id      uuid        NOT NULL,
    resolved_domain         text,
    explanation_template    text        NOT NULL,
    confidence              numeric(3,2) NOT NULL DEFAULT 1.00,
    priority                integer     NOT NULL DEFAULT 50,

    -- Effectivity
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cir_pkey           PRIMARY KEY (id),
    CONSTRAINT cir_source_chk     CHECK (classification_source IN (
        'SPEND_CATEGORY','PRODUCT','SERVICE','ITEM_GROUP','REVENUE_TYPE')),
    CONSTRAINT cir_condition_chk  CHECK (condition_type IN (
        'AMOUNT_ABOVE','AMOUNT_BELOW','IS_RECURRING','IS_ONE_TIME','COMPANY_MATCH',
        'PROCUREMENT_METHOD','CROSS_BORDER','DOC_TYPE_MATCH','COMMODITY_MATCH',
        'SUPPLIER_MATCH','CUSTOMER_MATCH','CUSTOMER_TIER','CONTRACT_TYPE_MATCH',
        'FLOW_MATCH','CHANNEL_MATCH','FALLBACK')),
    CONSTRAINT cir_domain_chk     CHECK (resolved_domain IS NULL OR resolved_domain IN (
        'OPEX','CAPEX','REVENUE','COST_OF_SALES','TRANSFER','REGULATORY','ADMIN','DEFERRED_REVENUE')),
    CONSTRAINT cir_confidence_chk CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT cir_effective_chk  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE control.classification_to_intent_rule IS
    'Engine 4.13: classification → intent resolution. All 16 condition types runtime-implemented. '
    'Does NOT modify existing category_intent_rule. Effective-dated for auditability.';


-- §11  intent_to_accounting_profile_rule — intent + context → profile matching
--      All predicates are nullable = wildcard. First match by ascending priority wins.
CREATE TABLE IF NOT EXISTS control.intent_to_accounting_profile_rule (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Predicates (all nullable = wildcard)
    direction                   text,
    intent_id                   uuid,
    intent_domain               text,
    flow_code                   text,
    company_code_id             uuid,
    doc_type                    text,
    currency_code               text,
    min_amount                  numeric(18,4),
    max_amount                  numeric(18,4),
    is_cross_border             boolean,
    is_intercompany             boolean,
    commodity_domain            text,
    commitment_type             text,
    counterparty_tier           text,
    contract_value_min          numeric(18,4),
    contract_value_max          numeric(18,4),
    revenue_type                text,

    -- Resolution result
    resolved_profile_config_id  uuid        NOT NULL,
    explanation_template        text        NOT NULL,
    confidence                  numeric(3,2) NOT NULL DEFAULT 1.00,
    priority                    integer     NOT NULL DEFAULT 50,

    -- Effectivity
    effective_from              date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                date,

    -- Metadata
    metadata                    jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d                  NOT NULL DEFAULT 'active',
    is_active         boolean               GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT iprr_pkey            PRIMARY KEY (id),
    CONSTRAINT iprr_confidence_chk  CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT iprr_amount_chk      CHECK (min_amount IS NULL OR max_amount IS NULL
                                        OR min_amount <= max_amount),
    CONSTRAINT iprr_contract_chk    CHECK (contract_value_min IS NULL OR contract_value_max IS NULL
                                        OR contract_value_min <= contract_value_max),
    CONSTRAINT iprr_effective_chk   CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE control.intent_to_accounting_profile_rule IS
    'Engine 4.13: multi-predicate profile matching. NULL predicate = wildcard. '
    'First match by ascending priority wins. Effective-dated. '
    'resolved_profile_config_id → control.acct_profile_config (composite FK in 06_constraints).';


-- §12  intent_profile_override — standing regulatory overrides (IFRS/ASC)
CREATE TABLE IF NOT EXISTS control.intent_profile_override (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Scope
    company_code_id             uuid,
    intent_id                   uuid        NOT NULL,
    direction                   text,
    flow_code                   text,

    -- Override target
    override_profile_config_id  uuid        NOT NULL,
    reason                      text        NOT NULL,
    regulatory_reference        text,

    -- Governance
    approved_by                 uuid,
    approved_at                 timestamptz,

    -- Effectivity
    effective_from              date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                date,

    -- Metadata
    metadata                    jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            text                  NOT NULL DEFAULT 'pending_approval',
    is_active         boolean               GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ipo_pkey             PRIMARY KEY (id),
    CONSTRAINT ipo_status_chk       CHECK (status IN (
        'pending_approval','active','inactive','revoked')),
    CONSTRAINT ipo_effective_chk    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ipo_reason_nonempty  CHECK (btrim(reason) <> '')
);

COMMENT ON TABLE control.intent_profile_override IS
    'Engine 4.13: standing regulatory overrides (IFRS/ASC references). '
    'Governance-gated: status=active only after approved_by is set. '
    'Takes precedence over intent_to_accounting_profile_rule at runtime.';


-- =============================================================================
-- DIMENSION POLICY + DOCUMENT SEQUENCE
-- Tables: dimension_policy, dimension_policy_allowed_value,
--         document_sequence_config, document_sequence_counter
-- Indexes  → 07_indexes/002_control.sql
-- FK refs  → 06_constraints/002_control.sql
-- Functions→ 08_functions/002_control.sql  (next_document_number)
-- Triggers → 09_triggers/002_control.sql
-- Seeds    → 900_seed_data/002_control/LookupDomain/control/dimension_*.sql
--            900_seed_data/002_control/LookupDomain/control/document_sequence_*.sql
-- =============================================================================

-- ── §DP1  control.dimension_policy — validation / governance rules ────────────
-- Purpose: "Department is REQUIRED on Expense accounts."
-- NOT derivation — derivation stays in control.acct_profile_dimension_rule.
-- Precedence: company-specific → tenant-global → no rule.
-- Allowed values listed in child table dimension_policy_allowed_value.
CREATE TABLE IF NOT EXISTS control.dimension_policy (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Policy identity
    policy_code             text        NOT NULL,
    policy_version          smallint    NOT NULL DEFAULT 1,
    description             text,

    -- Dimension target
    dimension_type_id       uuid        NOT NULL,

    -- Company scope (NULL = tenant-global policy)
    company_code_id         uuid,

    -- Scope filters (all nullable — NULL = applies to everything in scope)
    scope_account_class     text,
    -- 'asset','liability','equity','income','expense'
    scope_account_id        uuid,
    -- specific GL account
    scope_subledger_type    text,
    -- 'AP','AR','ASSET','INVENTORY','WIP','COMMISSION','NONE'
    scope_book_id           uuid,
    -- specific ledger book
    scope_doc_type          text,
    -- 'PURCHASE_INVOICE','SALES_INVOICE','JE', etc.

    -- Policy rule
    behavior                text        NOT NULL DEFAULT 'OPTIONAL',
    fixed_value_id          uuid,
    -- required when behavior = 'FIXED_VALUE'
    derive_source           text,
    -- required when behavior = 'DERIVE_IF_MISSING'

    -- Dependencies
    depends_on_type_id      uuid,
    -- This dimension only applies if another type is present on the line
    mutually_exclusive_with uuid,
    -- Cannot coexist with another dimension type on the same line

    -- Priority (higher wins on conflict between matching policies)
    priority                smallint    NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  shared.active_inactive_d        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT dp_pkey          PRIMARY KEY (id),
    CONSTRAINT dp_tenant_id_uq  UNIQUE (tenant_id, id),
    CONSTRAINT dp_code_ver_uq   UNIQUE (tenant_id, policy_code, policy_version),
    CONSTRAINT dp_code_chk      CHECK (btrim(policy_code) <> ''),
    CONSTRAINT dp_behavior_chk  CHECK (behavior IN (
        'REQUIRED','OPTIONAL','FORBIDDEN',
        'DERIVE_IF_MISSING','INHERIT_FROM_HEADER','FIXED_VALUE')),
    CONSTRAINT dp_fixed_chk     CHECK (behavior <> 'FIXED_VALUE' OR fixed_value_id IS NOT NULL),
    CONSTRAINT dp_derive_chk    CHECK (behavior <> 'DERIVE_IF_MISSING' OR derive_source IS NOT NULL),
    CONSTRAINT dp_acct_class_chk CHECK (scope_account_class IS NULL
        OR scope_account_class IN ('asset','liability','equity','income','expense')),
    CONSTRAINT dp_subledger_chk CHECK (scope_subledger_type IS NULL
        OR scope_subledger_type IN ('AP','AR','ASSET','INVENTORY','WIP','COMMISSION','NONE'))
);

COMMENT ON TABLE control.dimension_policy IS
    'Dimension validation / governance rules. '
    'Purpose: "Department is REQUIRED on Expense accounts." '
    'Evaluated at posting time to enforce dimension completeness. '
    'Does NOT derive values — derivation lives in acct_profile_dimension_rule. '
    'Precedence: exact company match → tenant-global → no rule. '
    'Allowed values listed in child table dimension_policy_allowed_value.';


-- ── §DP2  control.dimension_policy_allowed_value — indexable allowed-value list
-- Replaces uuid[] allowed_values on dimension_policy.
-- Separate table: indexable, auditable, FK-validated.
-- Cascade deletes on policy removal.
CREATE TABLE IF NOT EXISTS control.dimension_policy_allowed_value (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    policy_id           uuid        NOT NULL,
    dimension_value_id  uuid        NOT NULL,

    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT dpav_pkey            PRIMARY KEY (id),
    CONSTRAINT dpav_policy_value_uq UNIQUE (policy_id, dimension_value_id)
);

COMMENT ON TABLE control.dimension_policy_allowed_value IS
    'Allowed dimension values for a policy. Replaces uuid[] column on dimension_policy. '
    'Indexable and FK-validated. Cascade deletes when parent policy is removed.';


-- ── §DS1  control.document_sequence_config — numbering configuration (cold) ───
-- Split design: config (cold, rarely changes) + counter (hot, increments per txn).
-- Avoids contention and noisy audit trails on config rows.
CREATE TABLE IF NOT EXISTS control.document_sequence_config (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Scope
    company_code_id     uuid        NOT NULL,
    doc_type            text        NOT NULL,
    -- Controlled via lookup: 'control.document_sequence_doc_type'

    -- Format
    prefix              text        NOT NULL,
    -- e.g. 'INV', 'PI', 'JE', 'CN', 'SO'
    separator           text        NOT NULL DEFAULT '-',
    -- e.g. '-' → 'INV-2026-00001', '/' → 'INV/2026/00001'
    pad_width           smallint    NOT NULL DEFAULT 5,
    -- Zero-pad digits: 5 → 00001, 6 → 000001
    format_template     text,
    -- Optional override: '{prefix}{sep}{year}{sep}{seq}'
    -- NULL = default pattern: prefix + sep + year + sep + padded_seq

    -- Reset strategy
    reset_strategy      text        NOT NULL DEFAULT 'YEARLY',
    -- NONE = continuous; YEARLY = reset per fiscal year; MONTHLY = per period

    -- Metadata
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              shared.active_inactive_d        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT dsc_pkey             PRIMARY KEY (id),
    CONSTRAINT dsc_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT dsc_natural_uq       UNIQUE (tenant_id, company_code_id, doc_type),
    CONSTRAINT dsc_prefix_chk       CHECK (btrim(prefix) <> ''),
    CONSTRAINT dsc_doc_type_chk     CHECK (btrim(doc_type) <> ''),
    CONSTRAINT dsc_pad_width_chk    CHECK (pad_width BETWEEN 3 AND 10),
    CONSTRAINT dsc_reset_chk        CHECK (reset_strategy IN ('NONE','YEARLY','MONTHLY'))
);

COMMENT ON TABLE control.document_sequence_config IS
    'Document numbering configuration. Cold table — rarely modified. '
    'One config per (company, doc_type). Format: prefix + separator + year + padded_seq. '
    'Actual counter state lives in document_sequence_counter (hot table).';


-- ── §DS2  control.document_sequence_counter — mutable counter state (hot) ────
-- Separated from config to avoid lock contention on config rows.
-- One row per (config, fiscal_year) or (config, fiscal_year, period)
-- depending on reset_strategy. Atomic increment via next_document_number().
CREATE TABLE IF NOT EXISTS control.document_sequence_counter (
    -- Natural composite PK — no surrogate uuid needed for hot counters
    tenant_id           uuid        NOT NULL,
    config_id           uuid        NOT NULL,

    -- Period scope
    fiscal_year         smallint    NOT NULL,
    period_number       smallint    NOT NULL DEFAULT 0,
    -- 0  = YEARLY or NONE strategy (single counter per year)
    -- 1-12 = MONTHLY strategy (counter per period)

    -- Counter
    last_value          integer     NOT NULL DEFAULT 0,

    -- Audit (minimal — updated on every document creation)
    updated_at          timestamptz NOT NULL DEFAULT now(),
    updated_by          uuid,

    CONSTRAINT dscc_pkey        PRIMARY KEY (tenant_id, config_id, fiscal_year, period_number),
    CONSTRAINT dscc_value_chk   CHECK (last_value >= 0),
    CONSTRAINT dscc_year_chk    CHECK (fiscal_year BETWEEN 2000 AND 2099),
    CONSTRAINT dscc_period_chk  CHECK (period_number BETWEEN 0 AND 16)
);

COMMENT ON TABLE control.document_sequence_counter IS
    'Mutable counter state for document numbering. Hot table — updated every txn. '
    'Natural composite PK (tenant, config, year, period) for efficient upsert. '
    'period_number = 0 for YEARLY/NONE strategies. '
    'Atomic increment via control.next_document_number().';


-- =============================================================================
-- §13  control.classification_config — per-tenant AI classification preferences
-- =============================================================================
-- Singleton per tenant (PK = tenant_id). Phase 2 note: add company_code_id to
-- support company-specific overrides (NULL = tenant default).
-- FK → master.tenant → 06_constraints/002_control.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS control.classification_config (
    -- Identity
    tenant_id                       uuid        NOT NULL,

    -- Commodity classification
    primary_commodity_domain        text,
    trade_commodity_domain          text,
    is_commodity_code_required      boolean     NOT NULL DEFAULT false,
    is_trade_code_required          boolean     NOT NULL DEFAULT false,
    require_for_capex_above         numeric(18,4),
    require_for_capex_currency      character(3),
    is_required_for_regulated       boolean     NOT NULL DEFAULT true,

    -- Industry classification
    primary_industry_domain         text,

    -- AI automation
    is_auto_classify_enabled        boolean     NOT NULL DEFAULT true,
    is_auto_crosswalk_enabled       boolean     NOT NULL DEFAULT true,
    min_confidence_auto             numeric(5,2) NOT NULL DEFAULT 90.00,
    min_confidence_suggest          numeric(5,2) NOT NULL DEFAULT 60.00,
    crosswalk_strategy              text        NOT NULL DEFAULT 'BEST_MATCH',

    -- Cross-border rules
    cross_border_triggers           jsonb       NOT NULL
        DEFAULT '["SUPPLIER_COUNTRY_MISMATCH","SHIP_TO_MISMATCH","IMPORT_TAX","CUSTOMS_REQUIRED"]'::jsonb,

    -- Metadata
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT clscfg_pkey           PRIMARY KEY (tenant_id),
    -- Phase 2: PK will expand to (tenant_id, COALESCE(company_code_id, sentinel))
    CONSTRAINT clscfg_strategy_chk   CHECK (crosswalk_strategy IN (
        'EXACT_ONLY','BEST_MATCH','AI_ASSISTED')),
    CONSTRAINT clscfg_conf_auto_chk  CHECK (
        min_confidence_auto  >= 0 AND min_confidence_auto  <= 100),
    CONSTRAINT clscfg_conf_sugg_chk  CHECK (
        min_confidence_suggest >= 0 AND min_confidence_suggest <= 100),
    CONSTRAINT clscfg_conf_order_chk CHECK (
        min_confidence_auto >= min_confidence_suggest),
    CONSTRAINT clscfg_capex_chk      CHECK (
        require_for_capex_above IS NULL OR require_for_capex_above >= 0),
    CONSTRAINT clscfg_capex_curr_chk CHECK (
        require_for_capex_above IS NULL OR require_for_capex_currency IS NOT NULL)
);

COMMENT ON TABLE control.classification_config IS
    'Per-tenant AI classification preferences. Singleton (PK = tenant_id). '
    'Phase 2: add company_code_id for company-specific overrides; '
    'precedence: company row → tenant row → platform defaults. '
    'crosswalk_strategy: EXACT_ONLY | BEST_MATCH | AI_ASSISTED.';


-- =============================================================================
-- §14  control.commodity_to_spend_category_rule — code → spend_category routing
-- =============================================================================
-- Answers: "Given incoming UNSPSC code 43211503, route to spend_category X."
-- Reverse direction of master.commodity_classification.
-- Range-based: code_from..code_to for subtree matching. Exact = code_to IS NULL.
-- Deterministic routing: UNIQUE(tenant, domain, code_from, priority) WHERE active.
-- FKs → 06_constraints/002_control.sql
-- Indexes → 07_indexes/002_control.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS control.commodity_to_spend_category_rule (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Matching criteria (incoming code)
    commodity_domain_code   text        NOT NULL,
    match_mode              text        NOT NULL DEFAULT 'RANGE',
    -- Routing match strategy: EXACT, RANGE (default), PREFIX, CROSSWALK.
    code_from               text        NOT NULL,
    -- Inclusive range start. For EXACT match, set code_to = NULL.
    code_to                 text,
    -- Inclusive range end. NULL with match_mode=EXACT → exact match on code_from only.
    code_level              smallint,
    -- If set, match only at this hierarchy level (e.g. level=2 → UNSPSC segment).

    -- Resolution target
    spend_category_id       uuid        NOT NULL,

    -- Match priority + confidence
    priority                smallint    NOT NULL DEFAULT 0,
    -- Higher wins when multiple rules match. UNIQUE index prevents ties at same priority.
    confidence              numeric(5,2) NOT NULL DEFAULT 100.00,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  shared.active_inactive_d        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ccrr_pkey            PRIMARY KEY (id),
    CONSTRAINT ccrr_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT ccrr_code_chk        CHECK (btrim(code_from) <> ''),
    CONSTRAINT ccrr_match_mode_chk   CHECK (match_mode IN ('EXACT','RANGE','PREFIX','CROSSWALK')),
    CONSTRAINT ccrr_range_chk       CHECK (code_to IS NULL OR code_to >= code_from),
    CONSTRAINT ccrr_confidence_chk  CHECK (confidence >= 0 AND confidence <= 100),
    CONSTRAINT ccrr_priority_chk    CHECK (priority >= 0)
);

COMMENT ON TABLE control.commodity_to_spend_category_rule IS
    'Code → spend_category reverse-routing. match_mode governs strategy: '
    'EXACT, RANGE (default), PREFIX, CROSSWALK. '
    'Deterministic: UNIQUE(tenant, domain, code_from, priority) WHERE active '
    'prevents same-priority collisions. Tie-break: highest priority → exact over '
    'range → narrowest range → newest created_at. '
    'Replaces legacy spend_category_commodity_map.';

COMMENT ON COLUMN control.commodity_to_spend_category_rule.match_mode IS
    'Routing match strategy. Runtime resolver MUST implement all 4 modes: '
    'EXACT: code_from only, code_to must be NULL. Direct equality. '
    'RANGE: code_from..code_to inclusive lexical range (default). '
    'PREFIX: code_from is a prefix → match WHERE input LIKE code_from || ''%''. '
    'CROSSWALK: resolve input via shared.commodity_crosswalk first, then re-match. '
    'Priority: EXACT > PREFIX > RANGE > CROSSWALK. '
    'Resolver implementation: application layer.';


-- ============================================================================
-- TAX + FX ENGINE — Control schema tables
-- ============================================================================

-- ── control.rounding_rule ────────────────────────────────────────────────────
-- precision_digits NULL = derive from shared.currency.minor_units at runtime.
-- Explicit value overrides currency default (0 for JPY, 3 for KWD).
CREATE TABLE IF NOT EXISTS control.rounding_rule (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Table-specific
    code                text            NOT NULL,
    name                text            NOT NULL,
    method              text            NOT NULL DEFAULT 'ROUND_HALF_UP',
    precision_digits    smallint,
    minimum_unit        numeric(18,6),

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              shared.active_inactive_d            NOT NULL DEFAULT 'active',
    is_active           boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT rr_pkey              PRIMARY KEY (id),
    CONSTRAINT rr_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT rr_code_uq           UNIQUE (tenant_id, code),
    CONSTRAINT rr_code_chk          CHECK (btrim(code) <> ''),
    CONSTRAINT rr_method_chk        CHECK (method IN (
        'ROUND_HALF_UP','ROUND_HALF_EVEN','ROUND_DOWN','ROUND_UP')),
    CONSTRAINT rr_precision_chk     CHECK (precision_digits IS NULL OR precision_digits BETWEEN 0 AND 6),
    CONSTRAINT rr_min_unit_chk      CHECK (minimum_unit IS NULL OR minimum_unit > 0)
);
COMMENT ON TABLE control.rounding_rule IS
    'Rounding configuration per tenant. precision_digits NULL = runtime reads '
    'shared.currency.minor_units. Explicit value overrides currency default. '
    'minimum_unit for coinage gaps (CHF 0.05).';


-- ── control.tax_rate_schedule ─────────────────────────────────────────────────
-- Unified rate table. tax_code ELIMINATED: identity is structured
-- (jurisdiction + type + direction + component + scopes + priority + effectivity).
-- trs_tenant_id_uq enables tenant-composite FK from tax_group_component and tax_calculation.
CREATE TABLE IF NOT EXISTS control.tax_rate_schedule (
    -- Identity
    id                              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid            NOT NULL,

    -- Core identity (replaces traditional tax_code)
    jurisdiction_id                 uuid            NOT NULL,
    tax_type_id                     uuid            NOT NULL,

    -- Direction + component
    tax_direction                   text            NOT NULL,
    component_code                  text,

    -- Rate
    rate_kind                       text            NOT NULL DEFAULT 'PERCENT',
    rate_value                      numeric(18,6)   NOT NULL,
    rate_currency                   character(3),

    -- Recoverability
    recoverability_mode             text            NOT NULL DEFAULT 'NONE',
    recoverability_percent          numeric(5,2),

    -- Reverse charge
    reverse_charge_mode             text            NOT NULL DEFAULT 'NONE',

    -- Calculation
    calculation_basis               text            NOT NULL DEFAULT 'LINE_NET',

    -- Rounding
    rounding_stage                  text            NOT NULL DEFAULT 'LINE',
    rounding_rule_id                uuid,

    -- WHT-specific
    wht_basis                       text,
    wht_certificate_required        boolean         NOT NULL DEFAULT false,
    treaty_country_code             character(2),
    treaty_rate_value               numeric(18,6),

    -- Scope filters (NULL = wildcard)
    scope_company_code_id           uuid,
    scope_spend_category_id         uuid,
    scope_commodity_domain_code     text,
    scope_commodity_code            text,
    scope_industry_domain_code      text,
    scope_industry_code             text,
    scope_counterparty_country      character(2),
    scope_counterparty_tax_status   text,
    scope_doc_type                  text,

    -- Resolution
    priority                        smallint        NOT NULL DEFAULT 0,
    description                     text,

    -- Effectivity
    effective_from                  date            NOT NULL,
    effective_to                    date,

    -- Metadata
    metadata                        jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                          shared.active_inactive_d            NOT NULL DEFAULT 'active',
    is_active                       boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,

    -- Audit
    created_at                      timestamptz     NOT NULL DEFAULT now(),
    created_by                      uuid            NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT trs_pkey                 PRIMARY KEY (id),
    CONSTRAINT trs_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT trs_direction_chk        CHECK (tax_direction IN (
        'PURCHASE','SALE','PAYMENT','IMPORT','EXPORT','BOTH')),
    CONSTRAINT trs_rate_kind_chk        CHECK (rate_kind IN ('PERCENT','FIXED','PER_UNIT')),
    CONSTRAINT trs_rate_chk             CHECK (
        (rate_kind = 'PERCENT' AND rate_value >= 0 AND rate_value <= 100)
        OR (rate_kind IN ('FIXED','PER_UNIT') AND rate_value >= 0)),
    CONSTRAINT trs_rate_currency_chk    CHECK (rate_kind = 'PERCENT' OR rate_currency IS NOT NULL),
    CONSTRAINT trs_effective_chk        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT trs_recover_chk          CHECK (recoverability_mode IN ('FULL','PARTIAL','NONE','CONDITIONAL')),
    CONSTRAINT trs_recover_pct_chk      CHECK (recoverability_mode <> 'PARTIAL' OR recoverability_percent IS NOT NULL),
    CONSTRAINT trs_recover_range        CHECK (recoverability_percent IS NULL
        OR (recoverability_percent >= 0 AND recoverability_percent <= 100)),
    CONSTRAINT trs_reverse_chk          CHECK (reverse_charge_mode IN ('NONE','SELF_ASSESS','FULL')),
    CONSTRAINT trs_basis_chk            CHECK (calculation_basis IN (
        'LINE_NET','LINE_GROSS','DOCUMENT_NET','DOCUMENT_GROSS','PAYMENT_AMOUNT')),
    CONSTRAINT trs_round_stage_chk      CHECK (rounding_stage IN (
        'LINE','COMPONENT','DOCUMENT','JURISDICTION_BUCKET')),
    CONSTRAINT trs_wht_basis_chk        CHECK (wht_basis IS NULL
        OR wht_basis IN ('GROSS','NET_OF_INDIRECT_TAX','PAYMENT_ONLY')),
    CONSTRAINT trs_treaty_rate_chk      CHECK (
        treaty_rate_value IS NULL
        OR (treaty_country_code IS NOT NULL AND treaty_rate_value >= 0
            AND (rate_kind <> 'PERCENT' OR treaty_rate_value <= rate_value))),
    CONSTRAINT trs_cp_status_chk        CHECK (
        scope_counterparty_tax_status IS NULL
        OR scope_counterparty_tax_status IN (
            'REGISTERED','UNREGISTERED','EXEMPT','FOREIGN','TREATY'))
);
COMMENT ON TABLE control.tax_rate_schedule IS
    'Unified tax rate table. tax_code eliminated — identity is structured: '
    '(jurisdiction + tax_type + direction + component + scopes + priority + effective dates). '
    'trs_tenant_id_uq enables tenant-composite FK from tax_group_component and tax_calculation. '
    'Temporal EXCLUDE prevents overlapping active rules with same scope + priority.';

-- Temporal non-overlap: two active rules with identical scope + priority cannot overlap in time.
ALTER TABLE control.tax_rate_schedule DROP CONSTRAINT IF EXISTS trs_temporal_excl;
ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_temporal_excl
    EXCLUDE USING gist (
        tenant_id                                                                       WITH =,
        jurisdiction_id                                                                 WITH =,
        tax_type_id                                                                     WITH =,
        tax_direction                                                                   WITH =,
        COALESCE(component_code, '')                                                    WITH =,
        priority                                                                        WITH =,
        COALESCE(scope_company_code_id,         '00000000-0000-0000-0000-000000000000') WITH =,
        COALESCE(scope_spend_category_id,       '00000000-0000-0000-0000-000000000000') WITH =,
        COALESCE(scope_commodity_domain_code,   '')                                     WITH =,
        COALESCE(scope_commodity_code,          '')                                     WITH =,
        COALESCE(scope_industry_domain_code,    '')                                     WITH =,
        COALESCE(scope_industry_code,           '')                                     WITH =,
        COALESCE(scope_counterparty_country,    '__')                                   WITH =,
        COALESCE(scope_counterparty_tax_status, '')                                     WITH =,
        COALESCE(scope_doc_type,                '')                                     WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]')     WITH &&
    ) WHERE (is_active = true);


-- ── control.tax_group ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS control.tax_group (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Table-specific
    code                text            NOT NULL,
    name                text            NOT NULL,
    description         text,
    is_compound         boolean         NOT NULL DEFAULT false,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              shared.active_inactive_d            NOT NULL DEFAULT 'active',
    is_active           boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT tg_pkey              PRIMARY KEY (id),
    CONSTRAINT tg_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT tg_code_uq           UNIQUE (tenant_id, code),
    CONSTRAINT tg_code_chk          CHECK (btrim(code) <> '')
);
COMMENT ON TABLE control.tax_group IS
    'Named collection of tax rate schedules applied as a unit to documents. '
    'is_compound=true: components apply sequentially (each base = previous subtotal).';


-- ── control.tax_group_component ──────────────────────────────────────────────
-- FK to tax_rate_schedule uses tenant-composite (tenant_id, tax_rate_schedule_id)
-- consistent with platform tenant-isolation conventions.
CREATE TABLE IF NOT EXISTS control.tax_group_component (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Table-specific
    tax_group_id            uuid            NOT NULL,
    tax_rate_schedule_id    uuid            NOT NULL,
    calculation_seq         smallint        NOT NULL,
    rate_override           numeric(18,6),

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  shared.active_inactive_d            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tgc_pkey             PRIMARY KEY (id),
    CONSTRAINT tgc_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT tgc_group_seq_uq     UNIQUE (tax_group_id, calculation_seq),
    CONSTRAINT tgc_group_rate_uq    UNIQUE (tax_group_id, tax_rate_schedule_id),
    CONSTRAINT tgc_seq_chk          CHECK (calculation_seq > 0),
    CONSTRAINT tgc_override_chk     CHECK (rate_override IS NULL OR rate_override >= 0)
);
COMMENT ON TABLE control.tax_group_component IS
    'Bridge: tax_group → tax_rate_schedule. calculation_seq orders evaluation. '
    'rate_override allows group-level rate substitution without touching the global schedule. '
    'FK to tax_rate_schedule uses tenant-composite for cross-tenant isolation.';


-- ── ALTER control.acct_profile_config — add default_tax_group_id ─────────────
DO $$ BEGIN
    ALTER TABLE control.acct_profile_config ADD COLUMN IF NOT EXISTS default_tax_group_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
COMMENT ON COLUMN control.acct_profile_config.default_tax_group_id IS
    'FK → control.tax_group (tenant-composite). Replaces free-text default_tax_code. '
    'Fallback tax group when no scoped tax_rate_schedule matches.';


