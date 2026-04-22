-- ============================================================================
-- master/01c_tables_extended.sql
-- Concept: Extended Master — assets, dimensions, budgets, bank accounts
-- Depends on: 04_tables/003b_master_finance.sql
-- Master schema tables (Part C): asset management, dimensions, business intent, tax, FX rates, budgets, banking, and payments.
-- Seed principal: systemadmin (id = '00000000-0000-0000-0000-000000000000').
-- ============================================================================


-- =============================================================================
-- =============================================================================
-- §AM  ASSET MANAGEMENT MODULE
-- =============================================================================
-- =============================================================================
-- Full-lifecycle fixed asset management: acquisition → capitalization →
-- depreciation → revaluation / impairment → transfer → retirement / disposal.
-- IAS 16 / IFRS compliant multi-book asset accounting.


-- =============================================================================
-- §AM1  master.asset_class — hierarchical asset classification
-- =============================================================================
-- Per-book-type GL account mapping defaults and depreciation parameter defaults.
-- gl_account_defaults JSONB: { "statutory": { "acquisition_account": "1510", ... } }
-- depreciation_defaults JSONB: { "statutory": { "method": "straight_line", ... } }

CREATE TABLE IF NOT EXISTS master.asset_class (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Table-specific (hierarchy)
    description              text,
    parent_id                uuid,
    level_no                 smallint     NOT NULL DEFAULT 1,
    path                     text,
    is_leaf                  boolean      NOT NULL DEFAULT true,

    -- Table-specific (capitalization)
    capitalization_threshold  numeric(18,4) NOT NULL DEFAULT 0,
    capitalization_currency   character(3),
    currency_code             character(3)  NOT NULL DEFAULT 'USD',

    -- Table-specific (asset engine — GL/depreciation defaults moved to control.asset_class_book_policy)
    gl_account_defaults      jsonb        NOT NULL DEFAULT '{}'::jsonb,
    depreciation_defaults    jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Table-specific (asset engine v3 — classification & governance)
    asset_nature                     text    NOT NULL DEFAULT 'tangible',
    is_depreciable                   boolean NOT NULL DEFAULT true,
    is_componentization_required     boolean NOT NULL DEFAULT false,
    is_asset_tag_required            boolean NOT NULL DEFAULT true,
    is_serial_tracking_required      boolean NOT NULL DEFAULT false,
    is_location_tracking_required    boolean NOT NULL DEFAULT true,
    default_uom_code                 text,
    useful_life_override_policy      text    NOT NULL DEFAULT 'allow',
    disposal_requires_approval       boolean NOT NULL DEFAULT true,
    transfer_requires_approval       boolean NOT NULL DEFAULT false,
    revaluation_allowed              boolean NOT NULL DEFAULT false,
    impairment_tracking_required     boolean NOT NULL DEFAULT true,

    -- Table-specific (display)
    sort_order               smallint     NOT NULL DEFAULT 0,

    -- Tags & Metadata
    tags             jsonb        NOT NULL DEFAULT '[]'::jsonb,
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

    CONSTRAINT asset_class_pkey                    PRIMARY KEY (id),
    CONSTRAINT asset_class_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT asset_class_tenant_company_code_uq  UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT asset_class_no_self_ref             CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT asset_class_threshold_pos           CHECK (capitalization_threshold >= 0),
    CONSTRAINT asset_class_code_nonempty           CHECK (btrim(code) <> ''),
    CONSTRAINT asset_class_name_nonempty           CHECK (btrim(name) <> ''),
    CONSTRAINT asset_class_nature_chk              CHECK (asset_nature IN (
        'tangible','intangible','land','cwip','rou','leasehold_improvement')),
    CONSTRAINT asset_class_life_policy_chk         CHECK (useful_life_override_policy IN ('allow','require','forbid')),
    CONSTRAINT asset_class_threshold_currency_chk  CHECK (capitalization_threshold = 0 OR capitalization_currency IS NOT NULL),
    CONSTRAINT asset_class_depr_nature_chk         CHECK (asset_nature NOT IN ('land','cwip') OR is_depreciable = false)
);

COMMENT ON TABLE master.asset_class IS
    'ARCHETYPE=B;SCOPE=T. Hierarchical asset classification — identity, hierarchy, and governance only. '
    'GL mappings and depreciation parameters live in control.asset_class_book_policy. '
    'code is bare (PLANT, not ATHQ-AC-PLANT) — company scope via UQ constraint.';


-- =============================================================================
-- §AM2  master.asset — core fixed asset register
-- =============================================================================
-- One row per physical/intangible asset. Multi-tenant, multi-entity.
-- Component relationships modeled solely in master.asset_component.
-- All cross-table FKs are tenant-scoped composites.

CREATE TABLE IF NOT EXISTS master.asset (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,


    -- Table-specific (classification)
    description              text,
    asset_class_id           uuid         NOT NULL,

    -- Table-specific (acquisition)
    acquisition_date         date         NOT NULL,
    in_service_date          date,
    acquisition_cost         numeric(18,4) NOT NULL,
    currency_code            character(3) NOT NULL DEFAULT 'USD',
    residual_value           numeric(18,4) NOT NULL DEFAULT 0,
    useful_life_months       integer      NOT NULL,

    -- Table-specific (assignment)
    cost_center_id           uuid,
    profit_center_id         uuid,
    project_id               uuid,
    site_id                  uuid,
    location_description     text,
    custodian_id             uuid,
    vendor_id                uuid,
    commitment_id            uuid,

    -- Table-specific (physical tracking)
    barcode                  text,
    serial_number            text,

    -- Table-specific (retirement/disposal)
    retired_at               timestamptz,
    retirement_type          text,
    disposal_proceeds        numeric(18,4),
    disposal_currency_code   character(3),

    -- Table-specific (WIP tracking)
    is_capitalized_from_wip  boolean      NOT NULL DEFAULT false,
    capitalized_at           timestamptz,

    -- Table-specific (warranty & insurance)
    warranty_expiry_date     date,
    insured_value            numeric(18,4),
    insurance_policy_ref     text,

    -- Tags & Metadata
    tags             jsonb        NOT NULL DEFAULT '[]'::jsonb,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status IN ('draft', 'active', 'suspended')) STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT asset_pkey                    PRIMARY KEY (id),
    CONSTRAINT asset_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT asset_tenant_company_code_uq  UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT asset_acquisition_cost_pos    CHECK (acquisition_cost >= 0),
    CONSTRAINT asset_useful_life_pos         CHECK (useful_life_months > 0),
    CONSTRAINT asset_residual_value_pos      CHECK (residual_value >= 0),
    CONSTRAINT asset_disposal_proceeds_pos   CHECK (disposal_proceeds IS NULL OR disposal_proceeds >= 0),
    CONSTRAINT asset_in_service_after_acq    CHECK (in_service_date IS NULL
                                                    OR in_service_date >= acquisition_date),
    CONSTRAINT asset_code_nonempty           CHECK (btrim(code) <> ''),
    CONSTRAINT asset_name_nonempty           CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.asset IS
    'ARCHETYPE=B;SCOPE=T. Core fixed asset register. One row per physical/intangible asset. '
    'Multi-tenant, multi-entity. Component relationships modeled solely '
    'in master.asset_component (no parent_asset_id on this table). '
    'All FKs to external tables (OU, cost center, supplier) are tenant-scoped composites. '
    'Non-standard active-set: is_active GENERATED AS (status IN (''draft'', ''active'', ''suspended'')).';


-- =============================================================================
-- §AM3  master.asset_book — per-book depreciation profile
-- =============================================================================
-- One row per (asset, book_type). carrying_amount is the authoritative
-- generated column: cost_basis + cumulative_revaluation - cumulative_impairment
-- - accumulated_depreciation. depreciated_cost is the narrower
-- (cost_basis - accumulated_depreciation). Over-depreciation guard included.

CREATE TABLE IF NOT EXISTS master.asset_book (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL DEFAULT '',
    name             text         NOT NULL DEFAULT '',

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,


    -- Table-specific (asset + book linkage)
    asset_id                     uuid         NOT NULL,
    book_type                    text         NOT NULL,
    book_id                      uuid,

    -- Table-specific (depreciation parameters)
    depreciation_method          text         NOT NULL,
    useful_life_months           integer      NOT NULL,
    residual_value               numeric(18,4) NOT NULL DEFAULT 0,
    cost_basis                   numeric(18,4) NOT NULL,
    accumulated_depreciation     numeric(18,4) NOT NULL DEFAULT 0,

    -- Table-specific (generated values)
    depreciated_cost             numeric(18,4) GENERATED ALWAYS AS
                                     (cost_basis - accumulated_depreciation) STORED,

    -- Table-specific (revaluation & impairment accumulators)
    cumulative_revaluation       numeric(18,4) NOT NULL DEFAULT 0,
    cumulative_impairment        numeric(18,4) NOT NULL DEFAULT 0,

    -- Table-specific (authoritative carrying amount)
    carrying_amount              numeric(18,4) GENERATED ALWAYS AS
                                     (cost_basis + cumulative_revaluation
                                      - cumulative_impairment
                                      - accumulated_depreciation) STORED,

    -- Table-specific (date tracking)
    depreciation_start_date      date,
    last_depreciation_date       date,
    next_depreciation_date       date,
    last_revaluation_date        date,
    last_impairment_date         date,
    recoverable_amount           numeric(18,4),

    -- Table-specific (Phase 2 tax extension points)
    convention                   text,
    bonus_depreciation_pct       numeric(5,2) DEFAULT 0,
    prorate_basis                text         NOT NULL DEFAULT 'monthly',

    -- Table-specific (operational)
    salvage_value_locked         boolean      NOT NULL DEFAULT false,
    last_run_id                  uuid,
    currency_code                character(3) NOT NULL DEFAULT 'USD',
    posted_at                    timestamptz,
    posted_by                    uuid,

    -- Table-specific (GL account overrides — NULL = inherit from asset_class)
    override_acquisition_account text,
    override_accum_depr_account  text,
    override_depr_expense_account text,
    override_gain_loss_account   text,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status IN ('draft', 'active', 'suspended')) STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT asset_book_pkey                PRIMARY KEY (id),
    CONSTRAINT asset_book_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT asset_book_tenant_id_asset_uq  UNIQUE (tenant_id, id, asset_id),
    CONSTRAINT asset_book_asset_type_uq       UNIQUE (tenant_id, asset_id, book_type),
    CONSTRAINT asset_book_useful_life_pos     CHECK (useful_life_months > 0),
    CONSTRAINT asset_book_cost_basis_pos      CHECK (cost_basis >= 0),
    CONSTRAINT asset_book_residual_pos        CHECK (residual_value >= 0),
    CONSTRAINT asset_book_accum_depr_pos      CHECK (accumulated_depreciation >= 0),
    CONSTRAINT asset_book_impairment_pos      CHECK (cumulative_impairment >= 0),
    CONSTRAINT asset_book_bonus_pct_chk       CHECK (bonus_depreciation_pct >= 0
                                                     AND bonus_depreciation_pct <= 100),
    CONSTRAINT asset_book_no_over_depr        CHECK (
        accumulated_depreciation <= (cost_basis + cumulative_revaluation
                                     - cumulative_impairment - residual_value)
    )
);

COMMENT ON TABLE master.asset_book IS
    'ARCHETYPE=B;SCOPE=T. Per-book depreciation profile. One row per (asset, book_type). '
    'carrying_amount is the authoritative generated column: '
    'cost_basis + cumulative_revaluation - cumulative_impairment - accumulated_depreciation. '
    'depreciated_cost is the narrower (cost_basis - accumulated_depreciation). '
    'Over-depreciation guard prevents accumulated_depreciation from exceeding depreciable base. '
    'Non-standard active-set: is_active GENERATED AS (status IN (''draft'', ''active'', ''suspended'')).';


-- =============================================================================
-- §AM4  master.asset_component — IAS 16 componentization
-- =============================================================================
-- SOLE authority for parent-child component relationships.
-- master.asset carries no parent_asset_id to avoid dual-source drift.

CREATE TABLE IF NOT EXISTS master.asset_component (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,


    -- Table-specific (component linkage)
    parent_asset_id          uuid         NOT NULL,
    component_asset_id       uuid         NOT NULL,
    component_type           text         NOT NULL,

    -- Table-specific (allocation)
    pct_of_parent            numeric(7,4) NOT NULL,
    allocated_cost           numeric(18,4) NOT NULL,
    currency_code            character(3) NOT NULL DEFAULT 'USD',
    useful_life_months       integer      NOT NULL,

    -- Table-specific (temporal)
    description              text,
    effective_from           date         NOT NULL DEFAULT CURRENT_DATE,
    effective_to             date,

    -- Table-specific (display)
    sort_order               smallint     NOT NULL DEFAULT 0,

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

    CONSTRAINT asset_component_pkey              PRIMARY KEY (id),
    CONSTRAINT asset_component_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT asset_component_parent_child_uq   UNIQUE (tenant_id, parent_asset_id, component_asset_id),
    CONSTRAINT asset_component_no_self_ref       CHECK (parent_asset_id IS DISTINCT FROM component_asset_id),
    CONSTRAINT asset_component_pct_chk           CHECK (pct_of_parent > 0 AND pct_of_parent <= 100),
    CONSTRAINT asset_component_cost_pos          CHECK (allocated_cost >= 0),
    CONSTRAINT asset_component_life_pos          CHECK (useful_life_months > 0),
    CONSTRAINT asset_component_dates_chk         CHECK (effective_to IS NULL
                                                        OR effective_from <= effective_to),
    CONSTRAINT asset_component_code_nonempty     CHECK (btrim(code) <> ''),
    CONSTRAINT asset_component_name_nonempty     CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.asset_component IS
    'ARCHETYPE=B;SCOPE=T. IAS 16 component decomposition. SOLE authority for parent-child asset '
    'relationships — master.asset carries no parent_asset_id to avoid drift.';


-- =============================================================================
-- §AM5  master.asset_assignment_history — custodian/location/cost center timeline
-- =============================================================================
-- Tracks every change to an asset''s custodian, location, cost center,
-- operating unit, or any assignable dimension. Effective-dated.

CREATE TABLE IF NOT EXISTS master.asset_assignment_history (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,


    -- Table-specific
    asset_id                 uuid         NOT NULL,
    assignment_type          text         NOT NULL,

    -- Table-specific (from/to values)
    from_value_id            uuid,
    from_value_code          text,
    to_value_id              uuid,
    to_value_code            text,

    -- Table-specific (effective dating)
    effective_from           date         NOT NULL DEFAULT CURRENT_DATE,
    effective_to             date,

    -- Table-specific (context)
    reason                   text,
    reference_doc_id         uuid,
    reference_doc_type       text,

    -- Table-specific (actor)
    assigned_by              uuid         NOT NULL,
    assigned_at              timestamptz  NOT NULL DEFAULT now(),

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT asset_assign_hist_pkey PRIMARY KEY (id),
    CONSTRAINT asset_assign_hist_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT asset_assign_hist_dates_chk CHECK (
        effective_to IS NULL OR effective_from <= effective_to
    )
);

COMMENT ON TABLE master.asset_assignment_history IS
    'ARCHETYPE=C;SCOPE=T. Full timeline of asset assignment changes: custodian, location, cost center, '
    'operating unit. Effective-dated with from/to values for audit trail. '
    'No status lifecycle — mutable history/timeline table.';


-- =============================================================================
-- DIMENSION FRAMEWORK
-- Tables: dimension_type, dimension_value, dimension_set_item
-- Indexes  → 07_indexes/003_master.sql
-- FK refs  → 06_constraints/003_master.sql
-- Functions→ 08_functions/003_master.sql  (5 trigger fns + resolve_dimension_set)
-- Triggers → 09_triggers/003_master.sql
-- Seeds    → 900_seed_data/002_control/LookupDomain/master/dimension_*.sql
-- Note: master.dimension_set (parent) already defined above (§F13).
-- =============================================================================

-- ── §DIM1  master.dimension_type — dimension catalog (tenant-global) ──────────
-- No company_code_id — types are tenant concepts.
-- SYSTEM types map to first-class master tables (cost_center, profit_center, project).
-- STANDARD/CUSTOM types resolve through dimension_set + dimension_value.
CREATE TABLE IF NOT EXISTS master.dimension_type (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Natural key
    code                        text        NOT NULL,
    name                        text        NOT NULL,
    description                 text,

    -- Classification
    category                    text        NOT NULL DEFAULT 'CUSTOM',
    -- SYSTEM   = first-class (cost_center, profit_center, project)
    -- STANDARD = platform-defined reusable (department, region, channel)
    -- CUSTOM   = tenant-created (campaign, grant, fund, product_line)

    -- Hierarchy capability
    is_hierarchical             boolean     NOT NULL DEFAULT false,
    max_depth                   smallint,
    is_balanced                 boolean     NOT NULL DEFAULT false,
    -- balanced trees require is_hierarchical = true (enforced by constraint)

    -- Behavior flags
    is_multi_allowed            boolean     NOT NULL DEFAULT false,
    -- true = a single JE line can carry multiple values of this type
    is_company_scoped_allowed   boolean     NOT NULL DEFAULT false,
    -- true = dimension_value rows may be scoped to a specific company_code_id
    requires_effective_dating   boolean     NOT NULL DEFAULT false,
    -- true = dimension_value.effective_from/to are enforced at posting time

    -- Source binding (for SYSTEM types backed by existing master tables)
    source_entity_name          text,
    -- entity framework name: 'cost_center', 'profit_center', 'project'
    source_table                text,
    -- fully qualified: 'master.cost_center'
    source_code_column          text        DEFAULT 'code',
    source_name_column          text        DEFAULT 'name',

    -- Display
    icon                        text,
    sort_order                  smallint    NOT NULL DEFAULT 0,

    -- Metadata
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                      shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active                   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT dt_pkey          PRIMARY KEY (id),
    CONSTRAINT dt_tenant_id_uq  UNIQUE (tenant_id, id),
    CONSTRAINT dt_code_uq       UNIQUE (tenant_id, code),
    CONSTRAINT dt_code_chk      CHECK (btrim(code) <> ''),
    CONSTRAINT dt_name_chk      CHECK (btrim(name) <> ''),
    CONSTRAINT dt_category_chk  CHECK (category IN ('SYSTEM','STANDARD','CUSTOM')),
    CONSTRAINT dt_depth_chk     CHECK (max_depth IS NULL OR max_depth > 0),
    CONSTRAINT dt_balanced_chk  CHECK (NOT is_balanced OR is_hierarchical),
    CONSTRAINT dt_source_chk    CHECK (
        category <> 'SYSTEM'
        OR (source_entity_name IS NOT NULL AND source_table IS NOT NULL)
    )
    -- SYSTEM types must declare their source table binding
);

COMMENT ON TABLE master.dimension_type IS
    'ARCHETYPE=B;SCOPE=T. Dimension catalog. Tenant-global — no company scoping. '
    'SYSTEM types map to dedicated master tables (cost_center, profit_center, project). '
    'STANDARD/CUSTOM types carry values in master.dimension_value. '
    'Hierarchy flags control tree structure capability. '
    'is_company_scoped_allowed gates per-company values at the value level.';


-- ── §DIM2  master.dimension_value — typed dimension values ───────────────────
-- company_code_id nullable: NULL = tenant-global, non-NULL = company-specific.
-- Dual uniqueness: separate partial indexes (not table-level UNIQUE) in 07_indexes.
-- Hierarchy: parent_id, level_no, path_key.
-- Effective-dating: enforced only when dimension_type.requires_effective_dating = true.
CREATE TABLE IF NOT EXISTS master.dimension_value (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Natural key
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,

    -- Type reference
    dimension_type_id       uuid        NOT NULL,

    -- Company scope (optional)
    company_code_id         uuid,
    -- NULL = tenant-global (available to all companies)
    -- non-NULL = company-specific value; requires dimension_type.is_company_scoped_allowed = true

    -- Hierarchy
    parent_id               uuid,
    level_no                smallint    NOT NULL DEFAULT 1,
    path_key                text,
    -- Materialized path: 'ROOT/PARENT/SELF' for ltree-style queries

    -- Effective dates
    effective_from          date,
    effective_to            date,

    -- Posting control
    is_posting_allowed      boolean     NOT NULL DEFAULT true,
    is_budgeting_allowed    boolean     NOT NULL DEFAULT true,
    is_planning_allowed     boolean     NOT NULL DEFAULT true,

    -- Source binding (for values synced from master tables)
    source_entity_name      text,
    source_record_id        uuid,

    -- Display
    sort_order              smallint    NOT NULL DEFAULT 0,
    tags                    text[],

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT dv_pkey          PRIMARY KEY (id),
    CONSTRAINT dv_tenant_id_uq  UNIQUE (tenant_id, id),
    -- Composite FK pattern for child tables (dimension_set_item)
    CONSTRAINT dv_code_chk      CHECK (btrim(code) <> ''),
    CONSTRAINT dv_name_chk      CHECK (btrim(name) <> ''),
    CONSTRAINT dv_status_chk    CHECK (status IN ('active','inactive','blocked','archived')),
    CONSTRAINT dv_no_self_ref   CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT dv_dates_chk     CHECK (
        effective_from IS NULL OR effective_to IS NULL
        OR effective_from <= effective_to),
    CONSTRAINT dv_level_chk     CHECK (level_no >= 1),
    CONSTRAINT dv_blocked_chk   CHECK (status <> 'blocked' OR is_posting_allowed = false)
    -- Blocked values must not allow posting
);

COMMENT ON TABLE master.dimension_value IS
    'ARCHETYPE=B;SCOPE=T. Typed dimension values. One value per type per code (per company if scoped). '
    'NULL company_code_id = tenant-global. non-NULL = company-specific. '
    'Dual uniqueness enforced via partial indexes in 07_indexes (global vs company-scoped). '
    'Hierarchy via parent_id + level_no + path_key. '
    'Effective-dating enforced by policy when type.requires_effective_dating = true.';


-- ── §DIM3  master.dimension_set_item — component pairs of a dimension set ────
-- Immutable after creation (enforced by triggers in 09_triggers).
-- One value per type per set: UNIQUE (dimension_set_id, dimension_type_id).
-- Value must belong to the declared type: enforced by trigger in 09_triggers.
CREATE TABLE IF NOT EXISTS master.dimension_set_item (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Parent set
    dimension_set_id    uuid        NOT NULL,

    -- Dimension pair
    dimension_type_id   uuid        NOT NULL,
    dimension_value_id  uuid        NOT NULL,

    -- Ordering
    ordinal             smallint    NOT NULL,

    -- Audit (creation only — immutable)
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT dsi_pkey             PRIMARY KEY (id),
    CONSTRAINT dsi_set_type_uq      UNIQUE (dimension_set_id, dimension_type_id),
    -- One value per type per set
    CONSTRAINT dsi_set_ordinal_uq   UNIQUE (dimension_set_id, ordinal),
    -- No ordinal collisions within a set
    CONSTRAINT dsi_ordinal_chk      CHECK (ordinal > 0)
);

COMMENT ON TABLE master.dimension_set_item IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Component pairs of a dimension set. IMMUTABLE after creation — '
    'UPDATE and DELETE blocked by triggers. One value per type per set. '
    'Validate at usage time that values are compatible with the transaction '
    'company_code_id (global values or same company).';


-- =============================================================================
-- INTENT + CLASSIFICATION ENGINE
-- Tables: business_intent, company_code_intent_policy, company_code_dimension_default
-- Depends on: master.tenant, master.operating_unit, master.gl_account,
--             master.dimension_type, master.dimension_value
-- spend_category.default_intent_id added inline in §P7 above (forward FK)
-- FK refs   → 06_constraints/003_master.sql
-- Indexes   → 07_indexes/003_master.sql
-- Functions → 08_functions/003_master.sql
-- Triggers  → 09_triggers/003_master.sql
-- =============================================================================


-- =============================================================================
-- §BI  master.business_intent — intent ontology
-- =============================================================================
-- Hierarchical, tenant-scoped intent tree. Domain must be consistent within
-- a subtree (enforced by trg_bi_parent_guard in 09_triggers).
-- No default_accounting_profile_id — Engine 4.13 resolves profiles exclusively
-- via intent_to_accounting_profile_rule + intent_profile_override.
-- =============================================================================

CREATE TABLE IF NOT EXISTS master.business_intent (
    -- Identity
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,

    -- Natural key
    code                            text        NOT NULL,
    name                            text        NOT NULL,
    description                     text,

    -- Domain classification
    domain                          text        NOT NULL,
    subtype                         text,

    -- Hierarchy
    parent_id                       uuid,
    path                            text,
    depth                           smallint    NOT NULL DEFAULT 0,

    -- Financial defaults (last-resort; Engine 4.13 rules take precedence)
    default_gl_account_id           uuid,
    default_tax_code                text,
    default_tax_group_id            uuid,       -- FK → control.tax_group (tenant-composite)
    -- default_accounting_profile_id intentionally omitted.
    -- Profile resolution is fully owned by:
    --   control.intent_to_accounting_profile_rule (rule-based)
    --   control.intent_profile_override        (governance-gated)
    default_asset_profile_code      text,

    -- Approval control
    is_approval_required            boolean     NOT NULL DEFAULT true,
    max_auto_approve_amount         numeric(18,4),
    max_auto_approve_currency       character(3),

    -- Commodity affinities
    commodity_domain_affinities     text[],

    -- Visibility
    visibility                      text        NOT NULL DEFAULT 'STANDARD',

    -- Display
    sort_order                      smallint    NOT NULL DEFAULT 0,

    -- Metadata
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                          shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active                       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,

    -- Audit
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT bi_pkey               PRIMARY KEY (id),
    CONSTRAINT bi_tenant_id_uq       UNIQUE (tenant_id, id),
    -- Required for tenant-composite parent FK below
    CONSTRAINT bi_code_uq            UNIQUE (tenant_id, code),
    CONSTRAINT bi_code_chk           CHECK (btrim(code) <> ''),
    CONSTRAINT bi_name_chk           CHECK (btrim(name) <> ''),
    CONSTRAINT bi_domain_chk         CHECK (domain IN (
        'OPEX','CAPEX','REVENUE','COST_OF_SALES',
        'TRANSFER','REGULATORY','ADMIN','DEFERRED_REVENUE')),
    CONSTRAINT bi_visibility_chk     CHECK (visibility IN (
        'STANDARD','RESTRICTED','CONFIDENTIAL')),
    CONSTRAINT bi_no_self_ref        CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT bi_depth_chk          CHECK (depth >= 0),
    CONSTRAINT bi_auto_approve_chk   CHECK (
        max_auto_approve_amount IS NULL OR max_auto_approve_amount >= 0),
    CONSTRAINT bi_auto_approve_curr_chk CHECK (
        max_auto_approve_amount IS NULL OR max_auto_approve_currency IS NOT NULL)
);

COMMENT ON TABLE master.business_intent IS
    'ARCHETYPE=B;SCOPE=T. Business intent ontology. Tenant-scoped hierarchical tree. '
    'domain must be consistent within a subtree — enforced by trg_bi_parent_guard. '
    'default_accounting_profile_id intentionally absent: Engine 4.13 owns '
    'profile resolution via intent_to_accounting_profile_rule + intent_profile_override. '
    'UNIQUE(tenant_id, id) enables tenant-composite parent FK.';


-- =============================================================================
-- §OIM  master.company_code_intent_policy — company code × intent availability
-- =============================================================================
-- ALLOW = intent is available to this company code.
-- DENY  = intent is explicitly blocked (only meaningful for STANDARD visibility).
-- STANDARD visibility intents available to all company codes unless a DENY row exists.
-- RESTRICTED visibility intents require an explicit ALLOW row to be visible.
-- Dimension overrides: use master.company_code_dimension_default.
-- =============================================================================

CREATE TABLE IF NOT EXISTS master.company_code_intent_policy (
    -- Identity
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,

    -- Mapping
    company_code_id                 uuid        NOT NULL,
    intent_id                       uuid        NOT NULL,

    -- Allow / deny
    mapping_mode                    text        NOT NULL DEFAULT 'ALLOW',

    -- Flags
    is_default                      boolean     NOT NULL DEFAULT false,

    -- Company-code-level overrides (NULL = inherit from intent)
    -- Dimension overrides intentionally omitted — use master.company_code_dimension_default.
    override_gl_account_id          uuid,
    override_fp_id                  uuid,
    override_approval_template_id   uuid,
    override_compliance_checks      text[],

    -- Notes
    notes                           text,

    -- Metadata
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                          shared.active_inactive_d NOT NULL DEFAULT 'active',
    is_active                       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,

    -- Audit
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT ccip_pkey              PRIMARY KEY (id),
    CONSTRAINT ccip_cc_intent_uq      UNIQUE (tenant_id, company_code_id, intent_id),
    CONSTRAINT ccip_mode_chk          CHECK (mapping_mode IN ('ALLOW','DENY')),
    CONSTRAINT ccip_deny_not_default  CHECK (mapping_mode <> 'DENY' OR is_default = false)
);

COMMENT ON TABLE master.company_code_intent_policy IS
    'ARCHETYPE=B;SCOPE=T. Company Code × Intent availability. mapping_mode ALLOW | DENY. '
    'STANDARD intents visible to all company codes unless a DENY row exists. '
    'RESTRICTED intents require an explicit ALLOW row. '
    'Dimension overrides intentionally absent — use master.company_code_dimension_default.';


-- =============================================================================
-- §CCDD  master.company_code_dimension_default — company-code default dimension values (temporal)
-- =============================================================================
-- Truly temporal: EXCLUDE constraint prevents overlapping active defaults for
-- the same (company_code, dimension_type) pair. Multiple rows per (cc, type) allowed
-- for historical records and future scheduling.
-- Requires btree_gist — loaded in 00_extensions/001_extensions.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS master.company_code_dimension_default (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Company code reference
    company_code_id         uuid        NOT NULL,

    -- Dimension pair
    dimension_type_id       uuid        NOT NULL,
    dimension_value_id      uuid        NOT NULL,

    -- Behavior
    is_mandatory            boolean     NOT NULL DEFAULT false,
    allow_override          boolean     NOT NULL DEFAULT true,

    -- Effective dating
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  shared.active_inactive_d NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ccdd_pkey             PRIMARY KEY (id),
    -- No plain UNIQUE on (tenant, cc, type) — that blocks temporal history rows.
    -- Non-overlap enforced by EXCLUDE constraint below.
    CONSTRAINT ccdd_override_chk    CHECK (allow_override OR is_mandatory),
    CONSTRAINT ccdd_effective_chk   CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Temporal non-overlap: no two active defaults for the same (company_code, dimension_type)
-- may overlap in time. Uses daterange with open-ended effective_to as infinity.
ALTER TABLE master.company_code_dimension_default
    DROP CONSTRAINT IF EXISTS ccdd_cc_type_temporal_excl;

ALTER TABLE master.company_code_dimension_default
    ADD CONSTRAINT ccdd_cc_type_temporal_excl
    EXCLUDE USING gist (
        tenant_id           WITH =,
        company_code_id     WITH =,
        dimension_type_id   WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
    ) WHERE (is_active = true);

COMMENT ON TABLE master.company_code_dimension_default IS
    'ARCHETYPE=B;SCOPE=T. Company code dimension defaults. Temporal: EXCLUDE prevents overlapping active defaults '
    'for the same (company_code, dimension_type). Multiple rows allowed for history + future. '
    'Full company_code_id match validated at runtime by '
    'master.validate_dimension_company_scope() during posting.';


-- ============================================================================
-- TAX + FX ENGINE — Master schema tables
-- ============================================================================

-- ── master.tax_jurisdiction ──────────────────────────────────────────────────
-- Tax authority hierarchy: COUNTRY→STATE→CITY. Treaty jurisdictions for WHT.
-- Referenced by company_code.tax_jurisdiction_id (FK added in 06_constraints/003_master.sql).
CREATE TABLE IF NOT EXISTS master.tax_jurisdiction (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Table-specific
    code                    text            NOT NULL,
    name                    text            NOT NULL,
    description             text,
    country_code            character(2)    NOT NULL,
    state_region_code       text,
    city_code               text,
    jurisdiction_type       text            NOT NULL,
    parent_id               uuid,
    level_no                smallint        NOT NULL DEFAULT 1,
    authority_name          text,
    registration_required   boolean         NOT NULL DEFAULT false,
    filing_frequency        text,
    currency_code           character(3),
    sort_order              smallint        NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tj_pkey              PRIMARY KEY (id),
    CONSTRAINT tj_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT tj_code_uq           UNIQUE (tenant_id, code),
    CONSTRAINT tj_code_chk          CHECK (btrim(code) <> ''),
    CONSTRAINT tj_name_chk          CHECK (btrim(name) <> ''),
    CONSTRAINT tj_type_chk          CHECK (jurisdiction_type IN (
        'COUNTRY','STATE','PROVINCE','CITY','DISTRICT','SPECIAL_ZONE','TREATY')),
    CONSTRAINT tj_no_self_ref       CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT tj_level_chk         CHECK (level_no >= 1),
    CONSTRAINT tj_filing_chk        CHECK (filing_frequency IS NULL OR filing_frequency IN (
        'MONTHLY','QUARTERLY','ANNUAL','BIMONTHLY','SEMI_ANNUAL'))
);
COMMENT ON TABLE master.tax_jurisdiction IS
    'ARCHETYPE=B;SCOPE=T. Tax authority hierarchy: COUNTRY→STATE→CITY. Multinational support. '
    'Treaty jurisdictions for WHT. parent_id enables multi-level inheritance. '
    'Referenced by company_code.tax_jurisdiction_id.';


-- ── master.tax_type ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master.tax_type (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Table-specific
    code                    text            NOT NULL,
    name                    text            NOT NULL,
    description             text,
    category                text            NOT NULL,
    is_recoverable          boolean         NOT NULL DEFAULT false,
    is_deducted_at_source   boolean         NOT NULL DEFAULT false,
    is_included_in_price    boolean         NOT NULL DEFAULT false,
    is_compound_eligible    boolean         NOT NULL DEFAULT false,
    sort_order              smallint        NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  shared.active_inactive_d NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tt_pkey              PRIMARY KEY (id),
    CONSTRAINT tt_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT tt_code_uq           UNIQUE (tenant_id, code),
    CONSTRAINT tt_code_chk          CHECK (btrim(code) <> ''),
    CONSTRAINT tt_category_chk      CHECK (category IN (
        'INDIRECT','WITHHOLDING','CUSTOMS_DUTY','SURCHARGE')),
    CONSTRAINT tt_recoverable_chk   CHECK (NOT is_recoverable OR category = 'INDIRECT'),
    CONSTRAINT tt_deducted_chk      CHECK (NOT is_deducted_at_source OR category = 'WITHHOLDING')
);
COMMENT ON TABLE master.tax_type IS
    'ARCHETYPE=B;SCOPE=T. Tax type catalog: INDIRECT (recoverable VAT/GST), WITHHOLDING (deducted at source), '
    'CUSTOMS_DUTY (import/export), SURCHARGE (cess, levies).';


-- ── master.fx_rate ───────────────────────────────────────────────────────────
-- Exchange rate store. inverse_rate GENERATED. Triangulation via master.get_fx_rate().
CREATE TABLE IF NOT EXISTS master.fx_rate (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Table-specific
    from_currency       character(3)    NOT NULL,
    to_currency         character(3)    NOT NULL,
    rate                numeric(18,10)  NOT NULL,
    inverse_rate        numeric(18,10)  GENERATED ALWAYS AS (
                            CASE WHEN rate > 0 THEN ROUND(1.0 / rate, 10) ELSE NULL END
                        ) STORED,
    rate_type           text            NOT NULL,
    effective_date      date            NOT NULL,
    effective_time      time,
    source              text            NOT NULL DEFAULT 'MANUAL',
    source_reference    text,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text            NOT NULL DEFAULT 'active',
    is_active           boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT fxr_pkey                 PRIMARY KEY (id),
    CONSTRAINT fxr_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT fxr_rate_positive        CHECK (rate > 0),
    CONSTRAINT fxr_no_same_currency     CHECK (from_currency <> to_currency),
    CONSTRAINT fxr_rate_type_chk        CHECK (rate_type IN (
        'SPOT','PERIOD_AVG','PERIOD_END','BUDGET','CONTRACTED','HISTORICAL')),
    CONSTRAINT fxr_source_chk           CHECK (source IN (
        'ECB','REUTERS','BLOOMBERG','CENTRAL_BANK','MANUAL','CUSTOM','API')),
    CONSTRAINT fxr_status_chk           CHECK (status IN ('active','superseded'))
);
COMMENT ON TABLE master.fx_rate IS
    'ARCHETYPE=B;SCOPE=T. Exchange rate store. inverse_rate GENERATED. Triangulation via master.get_fx_rate(). '
    'Rate types: SPOT (intraday), PERIOD_AVG/END (closing), BUDGET, CONTRACTED, HISTORICAL.';




-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Master tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §BP1  master.budget_profile — approved budget envelope
-- ============================================================================
-- Top-level authority from which budget_allocation rows are carved.
-- multi_year_strategy controls cross-year commitment reservation:
--   CURRENT_YEAR_ONLY — reserve only in current fiscal year.
--   HORIZON_SPREAD    — spread proportionally across all affected years.
--   FULL_RESERVE      — reserve full value immediately against current budget.
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.budget_profile (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,

    -- Company scope
    company_code_id         uuid            NOT NULL,

    -- Classification
    description             text,
    fund_type               text            NOT NULL DEFAULT 'OPERATING',
    fund_source             text            NOT NULL DEFAULT 'INTERNAL',
    fund_category           text,

    -- Ownership
    responsible_person_id   uuid,

    -- Currency
    currency_code           character(3)    NOT NULL,

    -- Budget envelope totals (maintained by trigger / service-level aggregation)
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,
    reserved_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    consumed_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    available_amount        numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - reserved_amount - consumed_amount
                            ) STORED,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    is_multi_year           boolean         NOT NULL DEFAULT false,
    valid_from              date,
    valid_to                date,

    -- Multi-year commitment strategy
    -- CURRENT_YEAR_ONLY | HORIZON_SPREAD | FULL_RESERVE
    multi_year_strategy     text            NOT NULL DEFAULT 'CURRENT_YEAR_ONLY',

    -- Replenishment
    is_replenishable        boolean         NOT NULL DEFAULT false,
    replenish_method        text,
    replenish_frequency     text,

    -- Controls
    overspend_policy        text            NOT NULL DEFAULT 'BLOCK',
    tolerance_pct           numeric(5,2)    NOT NULL DEFAULT 0.00,
    requires_approval       boolean         NOT NULL DEFAULT true,
    approval_threshold      numeric(18,4),

    -- Hierarchy
    parent_profile_id       uuid,

    -- Display
    sort_order              smallint        NOT NULL DEFAULT 0,
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT bp_pkey                  PRIMARY KEY (id),
    CONSTRAINT bp_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT bp_tenant_code_uq        UNIQUE (tenant_id, code),
    CONSTRAINT bp_code_nonempty         CHECK (btrim(code) <> ''),
    CONSTRAINT bp_name_nonempty         CHECK (btrim(name) <> ''),
    CONSTRAINT bp_status_chk            CHECK (status IN (
        'draft','active','suspended','closed','cancelled')),
    CONSTRAINT bp_type_chk              CHECK (fund_type IN (
        'OPERATING','CAPITAL','GRANT','PROJECT','RESERVE','CONTINGENCY','REVOLVING')),
    CONSTRAINT bp_source_chk            CHECK (fund_source IN (
        'INTERNAL','EXTERNAL','GRANT','DONATION','LOAN','MIXED')),
    CONSTRAINT bp_overspend_chk         CHECK (overspend_policy IN (
        'BLOCK','WARN','ALLOW','ESCALATE')),
    CONSTRAINT bp_strategy_chk          CHECK (multi_year_strategy IN (
        'CURRENT_YEAR_ONLY','HORIZON_SPREAD','FULL_RESERVE')),
    CONSTRAINT bp_amount_nonneg         CHECK (total_amount >= 0),
    CONSTRAINT bp_reserved_nonneg       CHECK (reserved_amount >= 0),
    CONSTRAINT bp_consumed_nonneg       CHECK (consumed_amount >= 0),
    CONSTRAINT bp_reserved_lte_total    CHECK (reserved_amount <= total_amount),
    CONSTRAINT bp_consumed_lte_total    CHECK (consumed_amount <= total_amount),
    CONSTRAINT bp_tolerance_chk         CHECK (tolerance_pct BETWEEN 0 AND 100),
    CONSTRAINT bp_valid_chk             CHECK (
        valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to),
    CONSTRAINT bp_no_self_parent        CHECK (parent_profile_id IS DISTINCT FROM id)
);

COMMENT ON TABLE master.budget_profile IS
    'ARCHETYPE=B;SCOPE=T. Approved budget envelope: operating budgets, capital programmes, grants, project funds. '
    'Top-level authority from which master.budget_allocation rows are carved per fund center. '
    'available_amount = GENERATED (total - reserved - consumed). '
    'reserved_amount/consumed_amount are aggregated upward from budget_allocation via trigger/service. '
    'multi_year_strategy: CURRENT_YEAR_ONLY | HORIZON_SPREAD | FULL_RESERVE. '
    'Status lifecycle: draft → active → suspended → closed | cancelled.';

COMMENT ON COLUMN master.budget_profile.multi_year_strategy IS
    'Controls how commitments straddling fiscal-year boundaries reserve budget. '
    'CURRENT_YEAR_ONLY: reserve only in current year; cross-year reserved when year opens. '
    'HORIZON_SPREAD: spread proportionally across all affected fiscal years. '
    'FULL_RESERVE: reserve full value immediately against current budget.';


-- ============================================================================
-- §BP2  master.budget_allocation — fund center authority
-- ============================================================================
-- Carves a slice of the parent budget_profile down to a specific fund center.
-- This is the authority row that ledger tables and document.commitment draw against.
-- multi_year_strategy: NULL = inherit from budget_profile.
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.budget_allocation (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,

    -- Parent envelope
    budget_profile_id       uuid            NOT NULL,

    -- Company scope
    company_code_id         uuid            NOT NULL,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    currency_code           character(3)    NOT NULL,

    -- Fund center (at least one must be set — balloc_fund_center_present enforces)
    cost_center_id          uuid,
    project_id              uuid,
    gl_account_id           uuid,
    profit_center_id        uuid,
    dimension_set_id        uuid,

    -- Ownership
    responsible_person_id   uuid,

    -- Allocated amounts (maintained by trigger / service)
    allocated_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    reserved_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    consumed_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    released_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    available_amount        numeric(18,4)   GENERATED ALWAYS AS (
                                allocated_amount - reserved_amount - consumed_amount + released_amount
                            ) STORED,

    -- Strategy override (NULL = inherit from budget_profile)
    multi_year_strategy     text,

    -- Controls (may override profile-level)
    overspend_policy        text            NOT NULL DEFAULT 'BLOCK',
    tolerance_pct           numeric(5,2)    NOT NULL DEFAULT 0.00,
    requires_approval       boolean         NOT NULL DEFAULT true,
    approval_threshold      numeric(18,4),

    -- Carry-forward
    is_carry_forward        boolean         NOT NULL DEFAULT false,
    carry_forward_from_id   uuid,

    -- Display
    sort_order              smallint        NOT NULL DEFAULT 0,
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT balloc_pkey                  PRIMARY KEY (id),
    CONSTRAINT balloc_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT balloc_tenant_code_uq        UNIQUE (tenant_id, budget_profile_id, code),
    CONSTRAINT balloc_code_nonempty         CHECK (btrim(code) <> ''),
    CONSTRAINT balloc_name_nonempty         CHECK (btrim(name) <> ''),
    CONSTRAINT balloc_status_chk            CHECK (status IN (
        'draft','active','suspended','exhausted','closed','cancelled')),
    CONSTRAINT balloc_overspend_chk         CHECK (overspend_policy IN (
        'BLOCK','WARN','ALLOW','ESCALATE')),
    CONSTRAINT balloc_strategy_chk          CHECK (multi_year_strategy IS NULL OR multi_year_strategy IN (
        'CURRENT_YEAR_ONLY','HORIZON_SPREAD','FULL_RESERVE')),
    CONSTRAINT balloc_allocated_nonneg      CHECK (allocated_amount >= 0),
    CONSTRAINT balloc_reserved_nonneg       CHECK (reserved_amount >= 0),
    CONSTRAINT balloc_consumed_nonneg       CHECK (consumed_amount >= 0),
    CONSTRAINT balloc_released_nonneg       CHECK (released_amount >= 0),
    CONSTRAINT balloc_tolerance_chk         CHECK (tolerance_pct BETWEEN 0 AND 100),
    CONSTRAINT balloc_no_self_carry         CHECK (carry_forward_from_id IS DISTINCT FROM id),
    CONSTRAINT balloc_fund_center_present   CHECK (
        cost_center_id IS NOT NULL
        OR project_id IS NOT NULL
        OR gl_account_id IS NOT NULL)
);

COMMENT ON TABLE master.budget_allocation IS
    'ARCHETYPE=B;SCOPE=T. Fund center authority: carves a slice of master.budget_profile to a specific '
    'cost center / project combination. This is the row that ledger.budget_balance, '
    'ledger.budget_transaction, and document.commitment draw against. '
    'available_amount = GENERATED (allocated - reserved - consumed + released). '
    'Effective overspend_policy = COALESCE(allocation.policy, profile.policy). '
    'multi_year_strategy NULL = inherit from budget_profile. '
    'Status lifecycle: draft → active → suspended → exhausted → closed | cancelled.';

COMMENT ON COLUMN master.budget_allocation.multi_year_strategy IS
    'Allocation-level override of budget_profile.multi_year_strategy. '
    'NULL = inherit from parent profile. Values: CURRENT_YEAR_ONLY | HORIZON_SPREAD | FULL_RESERVE.';


-- ============================================================================
-- §BP3  master.planning_model — planning model definition
-- ============================================================================
-- Versioned planning methodology: top-down, bottom-up, driver-based, zero-based.
-- Aggregates planning_driver (control) → outputs (ledger.planning_output).
-- ============================================================================
CREATE TABLE IF NOT EXISTS master.planning_model (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,

    -- Company scope
    company_code_id         uuid            NOT NULL,

    -- Classification
    description             text,
    model_type              text            NOT NULL DEFAULT 'DRIVER_BASED',
    planning_horizon        text            NOT NULL DEFAULT 'ANNUAL',
    granularity             text            NOT NULL DEFAULT 'MONTHLY',
    base_currency_code      character(3)    NOT NULL,

    -- Fiscal scope
    fiscal_year_from        smallint        NOT NULL,
    fiscal_year_to          smallint        NOT NULL,

    -- Ownership
    responsible_person_id   uuid,

    -- Versioning
    version                 integer         NOT NULL DEFAULT 1,
    is_current              boolean         NOT NULL DEFAULT true,
    based_on_model_id       uuid,

    -- Behaviour
    auto_recalculate        boolean         NOT NULL DEFAULT false,
    lock_on_approval        boolean         NOT NULL DEFAULT true,
    allows_overrides        boolean         NOT NULL DEFAULT true,

    -- Approval
    approved_at             timestamptz,
    approved_by             uuid,

    -- Display
    sort_order              smallint        NOT NULL DEFAULT 0,
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','active','in_review')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pm_pkey                  PRIMARY KEY (id),
    CONSTRAINT pm_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT pm_tenant_code_ver_uq    UNIQUE (tenant_id, code, version),
    CONSTRAINT pm_code_nonempty         CHECK (btrim(code) <> ''),
    CONSTRAINT pm_name_nonempty         CHECK (btrim(name) <> ''),
    CONSTRAINT pm_status_chk            CHECK (status IN (
        'draft','active','in_review','approved','locked','archived','cancelled')),
    CONSTRAINT pm_type_chk              CHECK (model_type IN (
        'TOP_DOWN','BOTTOM_UP','DRIVER_BASED','ZERO_BASED','ROLLING','HYBRID')),
    CONSTRAINT pm_horizon_chk           CHECK (planning_horizon IN (
        'ANNUAL','MULTI_YEAR','ROLLING_12','ROLLING_18','QUARTERLY')),
    CONSTRAINT pm_granularity_chk       CHECK (granularity IN (
        'MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL','WEEKLY')),
    CONSTRAINT pm_fiscal_range_chk      CHECK (fiscal_year_to >= fiscal_year_from),
    CONSTRAINT pm_version_chk           CHECK (version >= 1),
    CONSTRAINT pm_no_self_base          CHECK (based_on_model_id IS DISTINCT FROM id)
);

COMMENT ON TABLE master.planning_model IS
    'ARCHETYPE=B;SCOPE=T. Planning model definition: driver-based, top-down, bottom-up, or zero-based. '
    'Versioned per (tenant, code). is_current flags the active version. '
    'Aggregates drivers (control.planning_driver) → outputs (ledger.planning_output). '
    'Status lifecycle: draft → active → in_review → approved → locked → archived. '
    'Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''active'',''in_review'')).';


-- ============================================================================
-- §BK1  bank_party — bank institution / branch registry
-- ============================================================================
-- Tenant-scoped, NOT company-scoped. Address via address_link
-- (owner_type = 'bank_party'). Contact via contact_link.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.bank_party (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,

    -- Institution identity
    country_code            character(2)    NOT NULL,
    institution_type        text            NOT NULL DEFAULT 'BANK',
    bic                     text,
    national_bank_code_type text,
    national_bank_code      text,
    branch_code             text,
    branch_name             text,

    -- Operational capability flags
    supports_swift          boolean         NOT NULL DEFAULT false,
    supports_local_clearing boolean         NOT NULL DEFAULT false,
    supports_sepa           boolean         NOT NULL DEFAULT false,
    supports_ach            boolean         NOT NULL DEFAULT false,

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

    CONSTRAINT bank_party_pkey              PRIMARY KEY (id),
    CONSTRAINT bank_party_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT bank_party_tenant_code_uq    UNIQUE (tenant_id, code),
    CONSTRAINT bank_party_code_nonempty     CHECK (btrim(code) <> ''),
    CONSTRAINT bank_party_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT bank_party_country_upper_chk CHECK (country_code = upper(country_code)),
    CONSTRAINT bank_party_bic_fmt_chk       CHECK (
        bic IS NULL
        OR bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'
    ),
    CONSTRAINT bank_party_nat_code_pair_chk CHECK (
        (national_bank_code_type IS NULL AND national_bank_code IS NULL)
        OR (national_bank_code_type IS NOT NULL AND national_bank_code IS NOT NULL)
    )
);

COMMENT ON TABLE master.bank_party IS
    'ARCHETYPE=B;SCOPE=T. Bank institution / branch registry. Reusable anchor for bank routing '
    'identity. Tenant-scoped, NOT company-scoped — one bank can serve multiple '
    'company codes. Address via address_link (owner_type=''bank_party''). '
    'SAP BNKA equivalent.';


-- ============================================================================
-- §BK2  bank_account — unified bank account record
-- ============================================================================
-- Pure record — NO owner column. Like master.address.
-- Ownership expressed by master.bank_account_link rows.
-- One physical bank account = one row, regardless of how many entities use it.
-- Verification lives here (once per account, not per link).
-- Fintech columns (account_nature, provider_account_ref,
-- correspondent_bank_party_id) integrated from bank_engine_fintech_ext.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.bank_account (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text,
    name                    text,

    -- Bank reference
    bank_party_id           uuid,

    -- Account identity
    account_holder_name     text            NOT NULL,
    account_id_type         text            NOT NULL,
    account_id_value        text            NOT NULL,
    account_last4           text,
    currency_code           character(3)    NOT NULL,

    -- Supplementary routing (when bank_party is not registered)
    bic_override            text,
    bank_name_override      text,
    bank_country_override   character(2),

    -- Account nature (fintech / digital wallet support)
    account_nature          text            NOT NULL DEFAULT 'DIRECT',
    provider_account_ref    text,
    correspondent_bank_party_id uuid,

    -- Verification (lives on account — one verification per physical account)
    is_verified             boolean         NOT NULL DEFAULT false,
    verified_at             timestamptz,
    verified_by             uuid,
    verification_method     text,

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

    CONSTRAINT bank_account_pkey                PRIMARY KEY (id),
    CONSTRAINT bank_account_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT bank_account_holder_nonempty     CHECK (btrim(account_holder_name) <> ''),
    CONSTRAINT bank_account_acct_id_nonempty    CHECK (btrim(account_id_value) <> ''),
    CONSTRAINT bank_account_last4_chk           CHECK (
        account_last4 IS NULL OR account_last4 ~ '^[A-Z0-9]{4}$'
    ),
    CONSTRAINT bank_account_bic_fmt_chk         CHECK (
        bic_override IS NULL
        OR bic_override ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'
    ),
    CONSTRAINT bank_account_currency_upper_chk  CHECK (currency_code = upper(currency_code)),
    CONSTRAINT bank_account_bank_country_chk    CHECK (
        bank_country_override IS NULL OR bank_country_override = upper(bank_country_override)
    ),
    CONSTRAINT bank_account_verified_at_chk     CHECK (
        is_verified = false OR verified_at IS NOT NULL
    ),
    CONSTRAINT bank_account_bank_identity_chk   CHECK (
        bank_party_id IS NOT NULL
        OR (bank_name_override IS NOT NULL AND bank_country_override IS NOT NULL)
    ),
    CONSTRAINT bank_account_code_fmt_chk        CHECK (
        code IS NULL OR code ~ '^[a-z][a-z0-9_-]*$'
    ),
    CONSTRAINT bank_account_correspondent_not_self_chk CHECK (
        correspondent_bank_party_id IS NULL
        OR correspondent_bank_party_id <> bank_party_id
    )
);

COMMENT ON TABLE master.bank_account IS
    'ARCHETYPE=B;SCOPE=T. Unified bank account record — NO owner. Like master.address. '
    'One row per physical bank account. Ownership expressed by '
    'master.bank_account_link rows. Verification lives here (once per '
    'account, not duplicated per owner). Bank identity via bank_party_id '
    'or override fields for unregistered banks.';

COMMENT ON COLUMN master.bank_account.bank_party_id IS
    'Reference to registered bank institution. When present, routing details '
    '(BIC, national code) resolved from bank_party. When NULL, use overrides.';
COMMENT ON COLUMN master.bank_account.account_id_type IS
    'Canonical account identifier type. IBAN or LOCAL.';
COMMENT ON COLUMN master.bank_account.account_id_value IS
    'Canonical account identifier value. IBAN number or local account number.';
COMMENT ON COLUMN master.bank_account.account_last4 IS
    'Last 4 characters of account identifier for display masking. '
    'Alphanumeric (A-Z, 0-9) to support IBAN-derived and local formats.';
COMMENT ON COLUMN master.bank_account.verification_method IS
    'How the bank details were verified. '
    'MICRO_DEPOSIT, BANK_LETTER, CANCELLED_CHEQUE, VENDOR_PORTAL, MANUAL, API_VALIDATION.';
COMMENT ON COLUMN master.bank_account.account_nature IS
    'Nature of the account. Lookup: master.bank_account_nature. '
    'DIRECT = real account at the institution (DEFAULT for new rows). '
    'VIRTUAL = virtual identifier routed through provider pooled account. '
    'COLLECTION = virtual inbound-only account (Instarem pattern). '
    'SUB_ACCOUNT = sub-account under a master (some banks offer this).';
COMMENT ON COLUMN master.bank_account.provider_account_ref IS
    'Provider-side account/wallet reference that groups multiple currency '
    'balances under one relationship. Examples: Wise profile ID (P-12345678), '
    'Instarem collection account ID, Payoneer account number. '
    'NULL for traditional bank accounts.';
COMMENT ON COLUMN master.bank_account.correspondent_bank_party_id IS
    'The actual custodian bank behind a payment provider or aggregator. '
    'When bank_party_id = Wise and the USD balance is physically held at '
    'Community Federal Savings Bank, this FK points to the CFSB bank_party row. '
    'NULL when bank_party IS the custodian (traditional bank accounts).';


-- ============================================================================
-- §BK3  bank_account_link — polymorphic ownership bridge
-- ============================================================================
-- Same pattern as master.address_link.
-- Links any entity (company_code, supplier, customer, employee) to a
-- bank_account with purpose, primary election, and temporal validity.
-- btree_gist EXCLUDE prevents overlapping primaries per owner+purpose.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.bank_account_link (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Polymorphic ownership
    owner_type              text            NOT NULL,
    owner_id                uuid            NOT NULL,

    -- Bank account reference
    bank_account_id         uuid            NOT NULL,

    -- Company-code scope (optional — NULL = valid for all company codes)
    company_code_id         uuid,

    -- Classification
    purpose                 text            NOT NULL DEFAULT 'default',

    -- Primary election
    is_primary              boolean         NOT NULL DEFAULT false,

    -- Temporal validity
    effective_from          date            NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT bank_account_link_pkey           PRIMARY KEY (id),
    CONSTRAINT bank_account_link_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT bal_temporal_chk                 CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),

    -- Temporal primary exclusion: at most one is_primary=true per
    -- (tenant, owner, purpose, company_code) at any point in time.
    CONSTRAINT bal_one_primary_excl
        EXCLUDE USING gist (
            tenant_id   WITH =,
            owner_type  WITH =,
            owner_id    WITH =,
            purpose     WITH =,
            COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
            daterange(effective_from, COALESCE(effective_until, '9999-12-31'::date), '[)') WITH &&
        )
        WHERE (is_primary = true)
);

COMMENT ON TABLE master.bank_account_link IS
    'ARCHETYPE=C;SCOPE=T. Polymorphic M:N bridge: owner → bank_account with business purpose and '
    'temporal validity. Same pattern as master.address_link. '
    'One bank_account record can be shared by multiple owners without '
    'duplication. purpose conceptually correlates with address_link.purpose. '
    'No status lifecycle — temporal bridge; validity expressed via effective_from/effective_until.';

COMMENT ON COLUMN master.bank_account_link.owner_type IS
    'Polymorphic discriminator. FK to master.owner_type.code. '
    'Values: ''company_code'', ''supplier'', ''customer'', ''employee''.';
COMMENT ON COLUMN master.bank_account_link.company_code_id IS
    'Optional company-code scope. NULL = valid for all company codes. '
    'When set, this link is jurisdiction-specific. SAP LFB1 scoping.';
COMMENT ON COLUMN master.bank_account_link.purpose IS
    'Business purpose of this link. Lookup: master.bank_account_link_purpose. '
    'default, disbursement, collection, payroll, refund, reimbursement, etc.';
COMMENT ON COLUMN master.bank_account_link.is_primary IS
    'Canonical link when multiple exist for same owner+purpose. '
    'Enforced: at most one is_primary=true per owner+purpose per time period.';
COMMENT ON COLUMN master.bank_account_link.effective_from IS
    'Inclusive start date of validity. DEFAULT CURRENT_DATE.';
COMMENT ON COLUMN master.bank_account_link.effective_until IS
    'Exclusive end date. NULL = open-ended (currently active).';


-- ============================================================================
-- §BK4  bank_account_house_config — house-bank operational extension
-- ============================================================================
-- 1:1 extension of bank_account_link for company_code owners.
-- Same pattern as contact_email extends contact_link.
-- Only exists when the bank account is used as a house bank.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.bank_account_house_config (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Link reference (1:1 with bank_account_link)
    bank_account_link_id    uuid            NOT NULL,

    -- Finance linkage (required for house banks)
    gl_account_id           uuid            NOT NULL,

    -- Account classification
    local_account_type      text,
    account_nickname        text,

    -- Usage and defaults
    usage_type              text            NOT NULL DEFAULT 'DISBURSEMENT',
    is_disbursement_enabled boolean         NOT NULL DEFAULT true,
    is_collection_enabled   boolean         NOT NULL DEFAULT false,
    is_default_disbursement boolean         NOT NULL DEFAULT false,
    is_default_collection   boolean         NOT NULL DEFAULT false,
    priority                smallint        NOT NULL DEFAULT 0,

    -- Operational controls
    is_manual_payment_allowed  boolean      NOT NULL DEFAULT true,
    is_payment_file_allowed    boolean      NOT NULL DEFAULT true,
    reconciliation_mode     text            NOT NULL DEFAULT 'MANUAL',

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

    CONSTRAINT bahc_pkey                    PRIMARY KEY (id),
    CONSTRAINT bahc_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT bahc_link_uq                 UNIQUE (tenant_id, bank_account_link_id),
    CONSTRAINT bahc_priority_chk            CHECK (priority >= 0),
    CONSTRAINT bahc_default_disb_chk        CHECK (
        NOT is_default_disbursement OR is_disbursement_enabled
    ),
    CONSTRAINT bahc_default_coll_chk        CHECK (
        NOT is_default_collection OR is_collection_enabled
    )
);

COMMENT ON TABLE master.bank_account_house_config IS
    'ARCHETYPE=B;SCOPE=T. 1:1 extension of bank_account_link for house-bank operational config. '
    'Same pattern as contact_email extends contact_link. Only exists for '
    'links where owner_type = ''company_code''. Holds GL linkage, usage type, '
    'disbursement/collection flags, reconciliation mode — fields that are '
    'operationally irrelevant for supplier/customer/employee bank accounts. '
    'SAP T012K equivalent.';

COMMENT ON COLUMN master.bank_account_house_config.gl_account_id IS
    'Link to the cash GL account (e.g. IFRS-A-CASH-USD). NOT NULL — every '
    'house bank must map to a postable cash GL. Validated by trigger against '
    'mv_company_postable_account.';
COMMENT ON COLUMN master.bank_account_house_config.usage_type IS
    'Primary usage classification. DISBURSEMENT, COLLECTION, PAYROLL, '
    'TREASURY, ESCROW, PETTY_CASH.';
COMMENT ON COLUMN master.bank_account_house_config.reconciliation_mode IS
    'How bank statement lines are matched. MANUAL, AUTO, SEMI_AUTO.';


-- ============================================================================
-- §PM1  payment_method — user-facing method catalog
-- ============================================================================
-- Stable reference/master data. What the business/user selects.
-- Each row describes a logical payment instrument with its capability flags.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.payment_method (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,
    description             text,

    -- Classification
    direction               text            NOT NULL DEFAULT 'BOTH',
    instrument_mode         text            NOT NULL,

    -- Capability flags
    requires_bank_account           boolean NOT NULL DEFAULT true,
    requires_counterparty_bank      boolean NOT NULL DEFAULT true,
    requires_bank_interface         boolean NOT NULL DEFAULT true,
    requires_reference_number       boolean NOT NULL DEFAULT false,
    supports_batch                  boolean NOT NULL DEFAULT true,
    supports_partial                boolean NOT NULL DEFAULT false,
    supports_reversal               boolean NOT NULL DEFAULT true,
    supports_file_generation        boolean NOT NULL DEFAULT true,
    supports_real_time_api          boolean NOT NULL DEFAULT false,

    -- Ordering
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

    CONSTRAINT payment_method_pkey              PRIMARY KEY (id),
    CONSTRAINT payment_method_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT payment_method_tenant_code_uq    UNIQUE (tenant_id, code),
    CONSTRAINT payment_method_code_nonempty     CHECK (btrim(code) <> ''),
    CONSTRAINT payment_method_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT payment_method_sort_chk          CHECK (sort_order >= 0),
    CONSTRAINT payment_method_status_chk        CHECK (status IN ('active', 'inactive', 'archived'))
);

COMMENT ON TABLE master.payment_method IS
    'ARCHETYPE=B;SCOPE=T. User-facing payment method catalog. Stable reference data describing '
    'logical payment instruments with capability flags. Each row answers: '
    '"what can this method do?" Not "is it allowed here?" (that is company policy) '
    'or "how is it executed?" (that is bank_interface_profile).';

COMMENT ON COLUMN master.payment_method.direction IS
    'Payment direction scope. Lookup: master.payment_method_direction. '
    'OUTBOUND (disbursement), INBOUND (collection), BOTH.';
COMMENT ON COLUMN master.payment_method.instrument_mode IS
    'Instrument classification. Lookup: master.payment_method_instrument_mode. '
    'BANK_TRANSFER, CHECK, CASH, CARD, GATEWAY, DIRECT_DEBIT, NETTING, '
    'OFFSET, UPI, WALLET_TRANSFER.';


-- =============================================================================
-- master.print_profile — named render output presets (Module 8)
-- =============================================================================
-- A print_profile bundles all renderer knobs (paper size, colour mode, DPI,
-- compression, watermark, encryption, post-render actions) into a named preset
-- that can be referenced by render_output.manifest_json["print_profile_id"].
--
-- Exactly one active default per tenant is enforced by the partial unique index
-- master_print_profile_default_uq (07_indexes/003_master.sql) and the
-- fn_enforce_single_default() trigger (09_triggers/003_master.sql).
--
-- Status lifecycle: active → archived
-- No soft-delete — profiles are archived, not deleted, to preserve render_output
-- manifest_json references.
-- FKs → 06_constraints/003_master.sql | Seed → 900_seed_data/.../009_print_profiles.sql

CREATE TABLE IF NOT EXISTS master.print_profile (
    -- ── Identity ──────────────────────────────────────────────────────────────
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,

    -- ── Natural key ───────────────────────────────────────────────────────────
    code            text            NOT NULL,
    name            text            NOT NULL,

    -- ── Paper & orientation ───────────────────────────────────────────────────
    paper_size      text            NOT NULL DEFAULT 'A4',
    orientation     text            NOT NULL DEFAULT 'portrait',

    -- ── Colour & quality ──────────────────────────────────────────────────────
    color_mode      text            NOT NULL DEFAULT 'color',
    quality_dpi     integer         NOT NULL DEFAULT 300,

    -- ── Output format & duplex ────────────────────────────────────────────────
    output_format   text            NOT NULL DEFAULT 'pdf',
    duplex          text            NOT NULL DEFAULT 'none',

    -- ── Page layout ───────────────────────────────────────────────────────────
    margins         text            NOT NULL DEFAULT 'normal',
    compression     text            NOT NULL DEFAULT 'medium',

    -- ── Page decoration ───────────────────────────────────────────────────────
    header_footer           boolean NOT NULL DEFAULT true,
    background_graphics     boolean NOT NULL DEFAULT true,

    -- ── Watermark ─────────────────────────────────────────────────────────────
    watermark_enabled   boolean     NOT NULL DEFAULT false,
    watermark_text      text,

    -- ── PDF security ──────────────────────────────────────────────────────────
    encrypt_pdf         boolean     NOT NULL DEFAULT false,

    -- ── Post-render actions ───────────────────────────────────────────────────
    archive_after_render    boolean NOT NULL DEFAULT true,
    email_after_render      boolean NOT NULL DEFAULT false,

    -- ── Flags ─────────────────────────────────────────────────────────────────
    is_default          boolean     NOT NULL DEFAULT false,

    -- ── Metadata ──────────────────────────────────────────────────────────────
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- ── Lifecycle ─────────────────────────────────────────────────────────────
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- ── Audit ─────────────────────────────────────────────────────────────────
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    -- ── Constraints ───────────────────────────────────────────────────────────
    CONSTRAINT pp_pkey                  PRIMARY KEY (id),
    CONSTRAINT pp_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT pp_tenant_code_uq        UNIQUE (tenant_id, code),
    CONSTRAINT pp_code_nonempty         CHECK (btrim(code) <> ''),
    CONSTRAINT pp_name_nonempty         CHECK (btrim(name) <> ''),
    CONSTRAINT pp_paper_size_chk        CHECK (paper_size IN (
        'A3', 'A4', 'A5', 'B4', 'Letter', 'Legal'
    )),
    CONSTRAINT pp_orientation_chk       CHECK (orientation IN (
        'portrait', 'landscape'
    )),
    CONSTRAINT pp_color_mode_chk        CHECK (color_mode IN (
        'color', 'bw', 'grayscale'
    )),
    CONSTRAINT pp_output_format_chk     CHECK (output_format IN (
        'pdf', 'html', 'png'
    )),
    CONSTRAINT pp_duplex_chk            CHECK (duplex IN (
        'none', 'long', 'short'
    )),
    CONSTRAINT pp_margins_chk           CHECK (margins IN (
        'normal', 'narrow', 'wide', 'none'
    )),
    CONSTRAINT pp_compression_chk       CHECK (compression IN (
        'none', 'low', 'medium', 'high'
    )),
    CONSTRAINT pp_dpi_pos               CHECK (quality_dpi > 0),
    CONSTRAINT pp_status_chk            CHECK (status IN (
        'active', 'archived'
    )),
    CONSTRAINT pp_watermark_text_chk    CHECK (
        watermark_enabled = false
        OR watermark_text IS NOT NULL
    )
    -- Partial unique index for single default per tenant:
    --   UNIQUE (tenant_id) WHERE is_default = true AND status = 'active'
    --   → 07_indexes/003_master.sql: master_print_profile_default_uq
);

COMMENT ON TABLE  master.print_profile IS
    'ARCHETYPE=B;SCOPE=T. Named render output preset. Bundles paper, DPI, colour, compression, and '
    'post-render action settings for reference in render_output.manifest_json. '
    'Exactly one active default per tenant enforced by '
    'master_print_profile_default_uq partial index + fn_enforce_single_default(). '
    'Module 8 — PDF/HTML Generation & Print Services.';

COMMENT ON COLUMN master.print_profile.paper_size IS
    'ISO/ANSI paper size: A3, A4, A5, B4, Letter, Legal.';
COMMENT ON COLUMN master.print_profile.color_mode IS
    'Renderer colour mode: color (full CMYK), grayscale, bw (true black-and-white).';
COMMENT ON COLUMN master.print_profile.quality_dpi IS
    'Render resolution in dots per inch. Common values: 72 (screen), 150 (draft), 300 (print), 600 (high-quality).';
COMMENT ON COLUMN master.print_profile.output_format IS
    'Primary output: pdf (default), html (email/web), png (thumbnail/preview).';
COMMENT ON COLUMN master.print_profile.duplex IS
    'Printer duplex binding: none (simplex), long (long-edge bind), short (short-edge bind).';
COMMENT ON COLUMN master.print_profile.compression IS
    'PDF stream compression level: none → low → medium → high.';
COMMENT ON COLUMN master.print_profile.watermark_enabled IS
    'When true, watermark_text must not be NULL (enforced by pp_watermark_text_chk).';
COMMENT ON COLUMN master.print_profile.encrypt_pdf IS
    'Encrypt output PDF with AES-256. Decryption key managed by vault.';
COMMENT ON COLUMN master.print_profile.archive_after_render IS
    'Write rendered output to object storage after successful render.';
COMMENT ON COLUMN master.print_profile.email_after_render IS
    'Send rendered output to the document''s primary email recipient after delivery.';
COMMENT ON COLUMN master.print_profile.is_default IS
    'Partial unique index ensures at most one active default per tenant.';
COMMENT ON COLUMN master.print_profile.metadata IS
    'Freeform extension payload for tenant-specific renderer hints.';
