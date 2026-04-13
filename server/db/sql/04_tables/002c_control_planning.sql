-- 04_tables/002c_control_planning.sql
-- Depends on: 002a_control_core.sql, 002b_control_accounting.sql, 01_schemas, 03_bootstrap_functions (shared.uuidv7)
-- Control schema tables (Part C): planning engine, bank format rules, payment methods, and asset class book policies.

-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Control tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §PL1  control.forecast_line — scenario line items
-- ============================================================================
-- Each line = one account + dimension combination for a period range.
-- variance_amount = GENERATED (total - prior_year). Driver-linked lines
-- are recalculated when assumptions change.
-- ============================================================================
CREATE TABLE IF NOT EXISTS control.forecast_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent scenario
    scenario_id             uuid            NOT NULL,

    -- Line sequencing
    line_no                 smallint        NOT NULL,

    -- Account
    gl_account_id           uuid,
    spend_category_id       uuid,
    intent_id               uuid,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    budget_allocation_id    uuid,
    dimension_set_id        uuid,

    -- Organisational
    company_code_id         uuid,

    -- Period scope
    fiscal_year             smallint        NOT NULL,
    period_from             smallint        NOT NULL DEFAULT 1,
    period_to               smallint        NOT NULL DEFAULT 12,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,
    period_amounts          jsonb,          -- per-period breakdown: {"1": amount, "2": amount, ...}

    -- Spread method
    spread_method           text            NOT NULL DEFAULT 'EVEN',

    -- Driver linkage (optional)
    driver_id               uuid,
    planning_driver_assumption_id    uuid,
    is_driver_calculated    boolean         NOT NULL DEFAULT false,

    -- Comparison
    prior_year_amount       numeric(18,4),
    variance_amount         numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - COALESCE(prior_year_amount, 0)
                            ) STORED,
    variance_pct            numeric(8,4),

    -- Confidence
    confidence              numeric(3,2)    NOT NULL DEFAULT 1.00,
    probability_weight      numeric(5,4)    NOT NULL DEFAULT 1.0000,

    -- Narrative
    description             text,
    justification           text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT fl_pkey                  PRIMARY KEY (id),
    CONSTRAINT fl_scenario_line_uq      UNIQUE (tenant_id, scenario_id, line_no),
    CONSTRAINT fl_status_chk            CHECK (status IN ('active','excluded','superseded')),
    CONSTRAINT fl_spread_chk            CHECK (spread_method IN (
        'EVEN','FRONT_LOADED','BACK_LOADED','SEASONAL','STEP','CUSTOM')),
    CONSTRAINT fl_period_range_chk      CHECK (
        period_from BETWEEN 1 AND 16
        AND period_to BETWEEN 1 AND 16
        AND period_from <= period_to),
    CONSTRAINT fl_confidence_chk        CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT fl_probability_chk       CHECK (probability_weight BETWEEN 0 AND 1)
);

COMMENT ON TABLE control.forecast_line IS
    'Individual forecast line within a scenario. One line = one account + dimension '
    'combination for a period range. period_amounts JSONB for per-period breakdown. '
    'variance_amount = GENERATED (total - prior_year). '
    'Driver-linked lines (is_driver_calculated) are recalculated when assumptions change. '
    'budget_allocation_id narrows to a specific fund center.';


-- ============================================================================
-- §PL2  control.planning_driver — driver definitions for planning models
-- ============================================================================
-- Named, reusable business metric feeding planning model calculations.
-- Input drivers: user-entered. Derived drivers: formula-calculated.
-- depends_on_drivers[] tracks topological order for recalculation.
-- NOTE: uuid[] has no DB-level referential integrity; enforced at service layer.
-- ============================================================================
CREATE TABLE IF NOT EXISTS control.planning_driver (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,

    -- Parent model
    planning_model_id       uuid            NOT NULL,

    -- Classification
    description             text,
    driver_type             text            NOT NULL DEFAULT 'QUANTITY',
    driver_category         text,
    data_type               text            NOT NULL DEFAULT 'NUMERIC',
    uom_code                text,

    -- Behaviour
    aggregation_method      text            NOT NULL DEFAULT 'SUM',
    time_allocation         text            NOT NULL DEFAULT 'PERIOD_END',
    is_input                boolean         NOT NULL DEFAULT true,
    is_derived              boolean         NOT NULL DEFAULT false,

    -- Defaults / bounds
    default_value           numeric(18,4),
    min_value               numeric(18,4),
    max_value               numeric(18,4),

    -- Dependency graph (topological ordering; no DB FK — enforced at service layer)
    depends_on_drivers      uuid[]          NOT NULL DEFAULT '{}',

    -- Versioning
    version                 integer         NOT NULL DEFAULT 1,

    -- Display
    sort_order              smallint        NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pd_pkey                  PRIMARY KEY (id),
    CONSTRAINT pd_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT pd_model_code_ver_uq     UNIQUE (tenant_id, planning_model_id, code, version),
    CONSTRAINT pd_code_nonempty         CHECK (btrim(code) <> ''),
    CONSTRAINT pd_name_nonempty         CHECK (btrim(name) <> ''),
    CONSTRAINT pd_status_chk            CHECK (status IN ('active','deprecated','draft')),
    CONSTRAINT pd_type_chk              CHECK (driver_type IN (
        'QUANTITY','RATE','PERCENTAGE','CURRENCY','INDEX','RATIO','HEADCOUNT','GROWTH_RATE')),
    CONSTRAINT pd_data_type_chk         CHECK (data_type IN (
        'NUMERIC','INTEGER','PERCENTAGE','CURRENCY','BOOLEAN')),
    CONSTRAINT pd_aggregation_chk       CHECK (aggregation_method IN (
        'SUM','AVERAGE','WEIGHTED_AVG','LAST','FIRST','MIN','MAX','COUNT')),
    CONSTRAINT pd_time_alloc_chk        CHECK (time_allocation IN (
        'PERIOD_END','PERIOD_START','PERIOD_AVG','POINT_IN_TIME')),
    CONSTRAINT pd_version_chk           CHECK (version >= 1),
    CONSTRAINT pd_min_max_chk           CHECK (max_value IS NULL OR min_value IS NULL
                                               OR min_value <= max_value),
    CONSTRAINT pd_derived_input_excl    CHECK (NOT (is_input AND is_derived))
);

COMMENT ON TABLE control.planning_driver IS
    'Named business metric feeding planning model calculations: headcount, cost/unit, '
    'inflation, occupancy, etc. Input drivers are user-entered; derived drivers are '
    'formula-calculated (see control.planning_driver_formula). '
    'depends_on_drivers[] tracks topological ordering for recalculation. '
    'NOTE: uuid[] FK integrity is enforced at the service layer, not the DB.';


-- ============================================================================
-- §PL3  control.planning_driver_formula — formula / expression per driver
-- ============================================================================
-- Calculation formula for derived drivers. Versioned + effective-dated.
-- Formula must have expression OR formula_json (or both).
-- ============================================================================
CREATE TABLE IF NOT EXISTS control.planning_driver_formula (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent driver
    driver_id               uuid            NOT NULL,

    -- Formula definition
    formula_type            text            NOT NULL DEFAULT 'EXPRESSION',
    expression              text,           -- arithmetic string referencing driver codes
    formula_json            jsonb,          -- lookup table or conditional rule set

    -- Inputs
    input_driver_ids        uuid[]          NOT NULL DEFAULT '{}',

    -- Rounding
    rounding_mode           text            NOT NULL DEFAULT 'HALF_UP',
    decimal_places          smallint        NOT NULL DEFAULT 2,

    -- Conditional guard
    condition_expression    text,
    fallback_value          numeric(18,4),

    -- Versioning + effective dating
    version                 integer         NOT NULL DEFAULT 1,
    effective_from          date            NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pdf_pkey                 PRIMARY KEY (id),
    CONSTRAINT pdf_driver_ver_uq        UNIQUE (driver_id, version),
    CONSTRAINT pdf_status_chk           CHECK (status IN ('active','deprecated','draft')),
    CONSTRAINT pdf_type_chk             CHECK (formula_type IN (
        'EXPRESSION','LOOKUP_TABLE','CONDITIONAL','RULE_SET','SCRIPT')),
    CONSTRAINT pdf_rounding_chk         CHECK (rounding_mode IN (
        'HALF_UP','HALF_DOWN','HALF_EVEN','CEILING','FLOOR','TRUNCATE')),
    CONSTRAINT pdf_decimal_chk          CHECK (decimal_places BETWEEN 0 AND 8),
    CONSTRAINT pdf_version_chk          CHECK (version >= 1),
    CONSTRAINT pdf_effective_chk        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT pdf_formula_present_chk  CHECK (expression IS NOT NULL OR formula_json IS NOT NULL)
);

COMMENT ON TABLE control.planning_driver_formula IS
    'Calculation formula for derived planning drivers. '
    'EXPRESSION = arithmetic string referencing driver codes. '
    'LOOKUP_TABLE = interpolation via formula_json. '
    'CONDITIONAL = expression with condition guard. '
    'Versioned (driver_id, version) + effective-dated.';


-- ============================================================================
-- §PL4  control.planning_driver_assumption — concrete values for input drivers
-- ============================================================================
-- Actual numbers used in a planning cycle. Multiple assumptions per driver
-- enable scenario modelling. Optional dimensional scope narrows applicability.
-- ============================================================================
CREATE TABLE IF NOT EXISTS control.planning_driver_assumption (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent driver
    driver_id               uuid            NOT NULL,

    -- Scenario linkage (NULL = global / default assumption)
    scenario_id             uuid,

    -- Assumption identity
    assumption_name         text            NOT NULL,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_from             smallint        NOT NULL DEFAULT 1,
    period_to               smallint        NOT NULL DEFAULT 12,

    -- Value
    assumption_value        numeric(18,4)   NOT NULL,
    period_values           jsonb,          -- per-period override: {"1": val, "2": val, ...}

    -- Dimensional scope (NULL = all)
    company_code_id         uuid,
    cost_center_id          uuid,
    project_id              uuid,

    -- Growth / change modelling
    growth_rate             numeric(8,4),
    growth_method           text,

    -- Confidence
    confidence              numeric(3,2)    NOT NULL DEFAULT 1.00,
    source                  text            NOT NULL DEFAULT 'MANUAL',

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT da_pkey                  PRIMARY KEY (id),
    CONSTRAINT da_status_chk            CHECK (status IN ('active','superseded','draft','excluded')),
    CONSTRAINT da_confidence_chk        CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT da_source_chk            CHECK (source IN (
        'MANUAL','HISTORICAL','STATISTICAL','EXTERNAL','MODEL_OUTPUT','IMPORTED')),
    CONSTRAINT da_period_range_chk      CHECK (
        period_from BETWEEN 1 AND 16
        AND period_to BETWEEN 1 AND 16
        AND period_from <= period_to),
    CONSTRAINT da_growth_method_chk     CHECK (growth_method IS NULL OR growth_method IN (
        'COMPOUND','LINEAR','STEP','SEASONAL','CUSTOM'))
);

COMMENT ON TABLE control.planning_driver_assumption IS
    'Concrete value assumptions for input planning drivers. E.g. headcount = 150, '
    'inflation = 3.5%. scenario_id links to document.forecast_scenario for what-if '
    'modelling (NULL = global/default). Dimensional scope narrows applicability.';


-- ============================================================================
-- §PL5  control.planning_driver_version — versioned snapshot of driver assumptions
-- ============================================================================
-- Immutable point-in-time snapshot of all assumptions for a driver.
-- Enables audit trail and rollback during planning cycles. Insert-only.
-- ============================================================================
CREATE TABLE IF NOT EXISTS control.planning_driver_version (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent driver
    driver_id               uuid            NOT NULL,

    -- Version
    version_number          integer         NOT NULL,
    version_label           text,

    -- Snapshot (immutable — captured at version time)
    assumptions_snapshot    jsonb           NOT NULL,
    computed_output         jsonb,

    -- Provenance
    snapshot_reason         text            NOT NULL DEFAULT 'MANUAL',
    triggered_by            text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit (no updated_at — immutable)
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,

    CONSTRAINT pdv_pkey                 PRIMARY KEY (id),
    CONSTRAINT pdv_driver_version_uq    UNIQUE (driver_id, version_number),
    CONSTRAINT pdv_version_chk          CHECK (version_number >= 1),
    CONSTRAINT pdv_reason_chk           CHECK (snapshot_reason IN (
        'MANUAL','APPROVAL','PERIOD_CLOSE','REFORECAST','IMPORT','ROLLBACK'))
);

COMMENT ON TABLE control.planning_driver_version IS
    'IMMUTABLE (insert-only) point-in-time snapshot of driver assumptions. '
    'Used for audit trail, comparison, and rollback during planning cycles. '
    'log.trg_prevent_mutation() should be applied to enforce immutability.';


-- ============================================================================
-- §BK5  control.bank_format_rule — country + rail validation policy
-- ============================================================================
-- Platform default + tenant override. tenant_id IS NULL = global default.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.bank_format_rule (
    -- Identity
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,

    -- Rule identity
    code                        text            NOT NULL,
    name                        text            NOT NULL,
    description                 text,

    -- Applicability
    country_code                character(2)    NOT NULL,
    payment_network             text            NOT NULL,
    direction                   text            NOT NULL DEFAULT 'BOTH',
    currency_code               character(3),

    -- Required identifier policy
    account_id_type             text            NOT NULL,
    bank_id_type                text            NOT NULL,
    is_account_id_required      boolean         NOT NULL DEFAULT true,
    is_bank_id_required         boolean         NOT NULL DEFAULT true,
    is_bic_allowed              boolean         NOT NULL DEFAULT true,
    is_bic_required             boolean         NOT NULL DEFAULT false,
    is_branch_code_required     boolean         NOT NULL DEFAULT false,
    is_national_bank_code_required boolean      NOT NULL DEFAULT false,

    -- Validation patterns
    account_pattern             text,
    bank_id_pattern             text,
    branch_code_pattern         text,
    iban_country_prefix         character(2),
    is_checksum_validated       boolean         NOT NULL DEFAULT false,
    validation_schema           jsonb,

    -- Behavior
    priority                    smallint        NOT NULL DEFAULT 0,

    -- Metadata
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                      text            NOT NULL DEFAULT 'active',
    is_active                   boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,

    -- Audit
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT bank_format_rule_pkey            PRIMARY KEY (id),
    CONSTRAINT bfr_code_nonempty                CHECK (btrim(code) <> ''),
    CONSTRAINT bfr_name_nonempty                CHECK (btrim(name) <> ''),
    CONSTRAINT bfr_country_upper_chk            CHECK (country_code = upper(country_code)),
    CONSTRAINT bfr_currency_upper_chk           CHECK (
        currency_code IS NULL OR currency_code = upper(currency_code)
    ),
    CONSTRAINT bfr_iban_prefix_chk              CHECK (
        iban_country_prefix IS NULL OR iban_country_prefix = upper(iban_country_prefix)
    ),
    CONSTRAINT bfr_priority_chk                 CHECK (priority >= 0),
    CONSTRAINT bfr_bic_logic_chk                CHECK (
        NOT is_bic_required OR is_bic_allowed
    ),
    CONSTRAINT bfr_validation_schema_chk        CHECK (
        validation_schema IS NULL OR jsonb_typeof(validation_schema) = 'object'
    )
);

COMMENT ON TABLE control.bank_format_rule IS
    'Country + payment rail validation policy for bank account identifiers. '
    'Platform default (tenant_id IS NULL) + tenant override. '
    'Determines required fields, patterns, and validation for each country/rail combo.';


-- ============================================================================
-- §PM2  control.payment_method_company_policy — eligibility + defaulting
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.payment_method_company_policy (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Scope
    company_code_id         uuid            NOT NULL,
    payment_method_id       uuid            NOT NULL,
    direction               text            NOT NULL DEFAULT 'OUTBOUND',
    currency_code           character(3),

    -- Preferred house bank
    bank_account_link_id    uuid,

    -- Amount controls
    min_amount              numeric(18,4),
    max_amount              numeric(18,4),

    -- Defaults and controls
    is_default              boolean         NOT NULL DEFAULT false,
    is_manual_allowed       boolean         NOT NULL DEFAULT true,
    is_file_allowed         boolean         NOT NULL DEFAULT true,
    is_api_allowed          boolean         NOT NULL DEFAULT false,
    requires_dual_approval  boolean         NOT NULL DEFAULT false,

    -- Cutoff
    cutoff_time_local       time,
    timezone_code           text,

    -- Priority
    priority                smallint        NOT NULL DEFAULT 0,

    -- Temporal
    effective_from          date            NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pmcp_pkey                    PRIMARY KEY (id),
    CONSTRAINT pmcp_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT pmcp_effective_chk           CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT pmcp_amount_chk              CHECK (
        min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount
    ),
    CONSTRAINT pmcp_amount_nonneg           CHECK (
        (min_amount IS NULL OR min_amount >= 0) AND
        (max_amount IS NULL OR max_amount >= 0)
    ),
    CONSTRAINT pmcp_priority_chk            CHECK (priority >= 0),
    CONSTRAINT pmcp_cutoff_tz_pair_chk      CHECK (
        (cutoff_time_local IS NULL AND timezone_code IS NULL)
        OR (cutoff_time_local IS NOT NULL AND timezone_code IS NOT NULL)
    )
);

COMMENT ON TABLE control.payment_method_company_policy IS
    'Runtime eligibility and defaulting per company + method + direction. '
    'Answers: is this method allowed? For which currency/amount range? '
    'Which house bank? File or manual? Cutoff time?';

COMMENT ON COLUMN control.payment_method_company_policy.bank_account_link_id IS
    'Preferred/forced house-bank link for this policy. FK to '
    'master.bank_account_link. When set, must belong to the same '
    'company_code_id (validated by trigger).';


-- ============================================================================
-- §PM3  control.bank_interface_profile — remittance / bank integration
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.bank_interface_profile (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,
    description             text,

    -- Interface classification
    interface_type          text            NOT NULL,
    payment_network         text,
    file_format_code        text,
    provider_code           text,
    message_version         text,

    -- Provider configuration (encrypt at app layer)
    config                  jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Capabilities
    supports_remittance_advice  boolean     NOT NULL DEFAULT false,
    supports_acknowledgement    boolean     NOT NULL DEFAULT false,
    supports_status_pull        boolean     NOT NULL DEFAULT false,
    supports_return_file        boolean     NOT NULL DEFAULT false,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT bip_pkey                     PRIMARY KEY (id),
    CONSTRAINT bip_tenant_id_uq             UNIQUE (tenant_id, id),
    CONSTRAINT bip_tenant_code_uq           UNIQUE (tenant_id, code),
    CONSTRAINT bip_code_nonempty            CHECK (btrim(code) <> ''),
    CONSTRAINT bip_name_nonempty            CHECK (btrim(name) <> '')
);

COMMENT ON TABLE control.bank_interface_profile IS
    'Describes HOW a payment message is produced: file format, API provider, '
    'message version, capabilities. config jsonb holds provider credentials — '
    'application layer must encrypt sensitive values at rest.';

COMMENT ON COLUMN control.bank_interface_profile.interface_type IS
    'Delivery mechanism. Lookup: control.bank_interface_profile_type. '
    'FILE, API, CHECK_PRINT, MANUAL.';
COMMENT ON COLUMN control.bank_interface_profile.payment_network IS
    'Payment rail. Reuses control.bank_format_rule_payment_network vocabulary.';
COMMENT ON COLUMN control.bank_interface_profile.file_format_code IS
    'File/message format. Lookup: control.bank_interface_file_format. '
    'PAIN_001, NACHA_CCD, NACHA_PPD, MT101, etc.';
COMMENT ON COLUMN control.bank_interface_profile.provider_code IS
    'Execution provider identifier. Examples: WISE_API, STRIPE_API, HDFC_H2H.';
COMMENT ON COLUMN control.bank_interface_profile.config IS
    'SENSITIVE — provider credentials, API keys, endpoints. '
    'Application layer MUST encrypt at rest.';


-- ============================================================================
-- §PM4  control.payment_method_interface_binding — method → interface routing
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.payment_method_interface_binding (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Applicability
    company_code_id         uuid,
    payment_method_id       uuid            NOT NULL,
    bank_account_link_id    uuid,
    currency_code           character(3),
    direction               text            NOT NULL DEFAULT 'OUTBOUND',
    counterparty_country_code character(2),
    payment_network         text,

    -- Target
    bank_interface_profile_id uuid          NOT NULL,

    -- Priority (highest wins when multiple match)
    priority                smallint        NOT NULL DEFAULT 0,

    -- Temporal
    effective_from          date            NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pmib_pkey                    PRIMARY KEY (id),
    CONSTRAINT pmib_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT pmib_effective_chk           CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT pmib_priority_chk            CHECK (priority >= 0),
    CONSTRAINT pmib_country_upper_chk       CHECK (
        counterparty_country_code IS NULL
        OR counterparty_country_code = upper(counterparty_country_code)
    ),
    CONSTRAINT pmib_currency_upper_chk      CHECK (
        currency_code IS NULL OR currency_code = upper(currency_code)
    )
);

COMMENT ON TABLE control.payment_method_interface_binding IS
    'Bridges payment method to bank_interface_profile. Routes the same method '
    'to different interfaces by company, bank, currency, direction, '
    'counterparty country, and payment network. Priority-based resolution.';


-- ============================================================================
-- §PM5  control.payment_settlement_rule — posting-role-based accounting
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.payment_settlement_rule (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Scope
    company_code_id         uuid            NOT NULL,
    payment_method_id       uuid            NOT NULL,
    direction               text            NOT NULL DEFAULT 'OUTBOUND',
    book_code               text            NOT NULL DEFAULT 'statutory',

    -- Posting roles
    clearing_posting_role_code      text    NOT NULL,
    settlement_posting_role_code    text    NOT NULL,
    bank_fee_posting_role_code      text,
    discount_posting_role_code      text,
    fx_gain_posting_role_code       text,
    fx_loss_posting_role_code       text,
    chargeback_posting_role_code    text,
    suspense_posting_role_code      text,

    -- Temporal
    effective_from          date            NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT psr_pkey                     PRIMARY KEY (id),
    CONSTRAINT psr_tenant_id_uq             UNIQUE (tenant_id, id),
    CONSTRAINT psr_effective_chk            CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT psr_clearing_nonempty        CHECK (btrim(clearing_posting_role_code) <> ''),
    CONSTRAINT psr_settlement_nonempty      CHECK (btrim(settlement_posting_role_code) <> ''),
    CONSTRAINT psr_book_nonempty            CHECK (btrim(book_code) <> '')
);

COMMENT ON TABLE control.payment_settlement_rule IS
    'Posting-role-based settlement accounting for payment execution. '
    'Outputs role codes, NOT GL accounts — the existing accounting engine '
    '(resolve_posting_role_account) handles role → GL resolution per company/book.';


-- ══════════════════════════════════════════════════════════════════════════════
-- ASSET ENGINE — Control tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §ACP1  control.asset_class_book_policy — effective-dated policy
-- ============================================================================
-- Normalizes GL posting roles and depreciation parameters out of the jsonb
-- columns on master.asset_class into a proper relational table with:
--   • Effective-dating (effective_from/to) for versioned policy
--   • Per-book scope (book_code references master.ledger_book.code)
--   • Posting role codes (resolved to GL accounts at runtime)
-- book_code = actual master.ledger_book.code (e.g. 'ATHQ-BOOK-STAT'),
-- validated by trigger. UNIQUE includes effective_from for true versioning.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.asset_class_book_policy (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Company + class scope
    company_code_id  uuid         NOT NULL,
    asset_class_id   uuid         NOT NULL,
    book_code        text         NOT NULL,

    -- Priority & effective-dating
    priority         smallint     NOT NULL DEFAULT 50,
    effective_from   date         NOT NULL DEFAULT CURRENT_DATE,
    effective_to     date,

    -- Depreciation parameters
    is_depreciable               boolean  NOT NULL DEFAULT true,
    depreciation_method          text,
    useful_life_months           integer,
    residual_value_mode          text     NOT NULL DEFAULT 'zero',
    residual_value_amount        numeric(18,4),
    residual_value_pct           numeric(9,4),
    convention                   text,
    prorate_basis                text     NOT NULL DEFAULT 'monthly',
    depreciation_start_rule      text     NOT NULL DEFAULT 'in_service_date',
    method_params                jsonb    NOT NULL DEFAULT '{}'::jsonb,

    -- Override permissions
    allow_manual_life_override      boolean NOT NULL DEFAULT false,
    allow_manual_residual_override  boolean NOT NULL DEFAULT false,
    allow_manual_method_override    boolean NOT NULL DEFAULT false,

    -- Posting role codes (resolved to GL accounts at runtime)
    acquisition_posting_role_code       text,
    accum_depr_posting_role_code        text,
    depr_expense_posting_role_code      text,
    gain_loss_posting_role_code         text,
    impairment_expense_posting_role_code   text,
    impairment_reserve_posting_role_code   text,
    revaluation_surplus_posting_role_code  text,
    revaluation_loss_posting_role_code     text,
    cwip_posting_role_code                 text,

    -- Event codes
    capitalization_event_code    text NOT NULL DEFAULT 'CAPITALIZE',
    disposal_event_code          text NOT NULL DEFAULT 'DISPOSE',
    depreciation_event_code      text NOT NULL DEFAULT 'DEPRECIATE',
    impairment_event_code        text NOT NULL DEFAULT 'IMPAIR',
    revaluation_event_code       text NOT NULL DEFAULT 'REVALUE',

    -- Tags & Metadata
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

    CONSTRAINT acbp_pkey PRIMARY KEY (id),
    CONSTRAINT acbp_tenant_id_uq UNIQUE (tenant_id, id),

    -- True effective-dating: same scope can have multiple rows at different
    -- effective_from dates. Resolver picks best match.
    CONSTRAINT acbp_class_book_eff_uq
        UNIQUE (tenant_id, company_code_id, asset_class_id, book_code, effective_from),

    CONSTRAINT acbp_effective_chk CHECK (
        effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT acbp_depr_method_chk CHECK (
        NOT is_depreciable OR depreciation_method IS NOT NULL),
    CONSTRAINT acbp_depr_life_chk CHECK (
        NOT is_depreciable OR depreciation_method = 'no_depreciation'
        OR useful_life_months IS NOT NULL),
    CONSTRAINT acbp_nodepr_life_chk CHECK (
        depreciation_method IS NULL OR depreciation_method != 'no_depreciation'
        OR useful_life_months IS NULL),
    CONSTRAINT acbp_useful_life_pos CHECK (
        useful_life_months IS NULL OR useful_life_months > 0),
    CONSTRAINT acbp_residual_mode_chk CHECK (
        residual_value_mode IN ('amount','percent','zero')),
    CONSTRAINT acbp_residual_amount_chk CHECK (
        residual_value_mode != 'amount'
        OR (residual_value_amount IS NOT NULL AND residual_value_amount >= 0)),
    CONSTRAINT acbp_residual_pct_chk CHECK (
        residual_value_mode != 'percent'
        OR (residual_value_pct IS NOT NULL AND residual_value_pct BETWEEN 0 AND 100)),
    CONSTRAINT acbp_residual_zero_chk CHECK (
        residual_value_mode != 'zero'
        OR (residual_value_amount IS NULL AND residual_value_pct IS NULL)),
    CONSTRAINT acbp_start_rule_chk CHECK (
        depreciation_start_rule IN ('in_service_date','capitalization_date','next_period')),
    CONSTRAINT acbp_depr_roles_chk CHECK (
        NOT is_depreciable OR depreciation_method IS NULL
        OR depreciation_method = 'no_depreciation'
        OR (acquisition_posting_role_code IS NOT NULL
            AND accum_depr_posting_role_code IS NOT NULL
            AND depr_expense_posting_role_code IS NOT NULL)),
    CONSTRAINT acbp_acq_role_chk CHECK (
        acquisition_posting_role_code IS NOT NULL
        OR cwip_posting_role_code IS NOT NULL),
    CONSTRAINT acbp_status_chk CHECK (status IN ('active','inactive','superseded')),
    CONSTRAINT acbp_book_nonempty CHECK (btrim(book_code) <> '')
);

COMMENT ON TABLE control.asset_class_book_policy IS
    'Effective-dated depreciation + posting-role policy per (asset_class, book). '
    'book_code = actual ledger_book.code, validated by trigger. '
    'UNIQUE on (..., effective_from) enables true versioning. '
    'Resolved via control.resolve_asset_class_book_policy() at asset_book creation.';
