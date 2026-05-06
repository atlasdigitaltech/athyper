-- ============================================================================
-- master/01b_tables_finance.sql
-- Concept: Finance Master — legal entities, company codes, COA, GL accounts, parties
-- Depends on: 04_tables/003a_master_identity.sql
-- Master schema tables (Part B): legal entities, company codes, GL, cost/profit centers, projects, parties, and products.
-- Seed principal: systemadmin (id = '00000000-0000-0000-0000-000000000000').
-- ============================================================================

-- §F1  master.legal_entity — statutory / registered body
-- IAM: IdP org membership maps here via master.legal_entity_identity_binding.
-- Address: via master.address_link (owner_type='legal_entity')
-- Contact: via master.contact_link (owner_type='legal_entity')
CREATE TABLE IF NOT EXISTS master.legal_entity (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,
    display_name     text,

    -- Statutory identity
    legal_name                    text,
    legal_form                    text,
    registration_no               text,
    registration_country_code     char(2),
    tax_registration_number       text,
    tax_residence_country_code    char(2),
    incorporation_date            date,
    website_url                   text,

    -- Group structure
    entity_type              text          NOT NULL,
    parent_entity_id         uuid,
    consolidation_method     text          NOT NULL DEFAULT 'full',
    ownership_pct            numeric(5,2),
    regulatory_framework     text,

    -- Finance scope
    country_code             char(2)       NOT NULL,
    functional_currency      char(3)       NOT NULL,
    reporting_currency       char(3)       NOT NULL,

    -- Temporal validity
    effective_from           date,
    effective_until          date,

    -- Extended profile
    description              text,
    long_description         text,
    aliases                  text[]        NOT NULL DEFAULT '{}',
    tags                     jsonb         NOT NULL DEFAULT '[]'::jsonb,
    business_types           text[]        NOT NULL DEFAULT '{}',
    founded_year             smallint,
    employee_count_band      text,
    annual_revenue_band      text,

    -- Reference
    external_ref             text,
    metadata                 jsonb         NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT legal_entity_pkey                PRIMARY KEY (id),
    CONSTRAINT legal_entity_tenant_code_uq      UNIQUE (tenant_id, code),
    CONSTRAINT legal_entity_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT legal_entity_no_self_ref         CHECK (parent_entity_id IS DISTINCT FROM id),
    CONSTRAINT legal_entity_ownership_chk       CHECK (ownership_pct IS NULL
                                                       OR (ownership_pct > 0 AND ownership_pct <= 100)),
    CONSTRAINT legal_entity_code_nonempty       CHECK (btrim(code) <> ''),
    CONSTRAINT legal_entity_name_nonempty       CHECK (btrim(name) <> ''),
    CONSTRAINT legal_entity_status_chk          CHECK (status IN (
                                                    'draft', 'active', 'dormant',
                                                    'in_liquidation', 'dissolved', 'archived')),
    CONSTRAINT legal_entity_effective_order_chk CHECK (effective_until IS NULL
                                                       OR effective_from IS NULL
                                                       OR effective_until >= effective_from),
    CONSTRAINT legal_entity_founded_year_chk    CHECK (founded_year IS NULL
                                                       OR (founded_year BETWEEN 1800 AND 2200)),
    CONSTRAINT legal_entity_reg_country_fmt_chk CHECK (registration_country_code IS NULL
                                                       OR registration_country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT legal_entity_tax_country_fmt_chk CHECK (tax_residence_country_code IS NULL
                                                       OR tax_residence_country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT legal_entity_website_fmt_chk     CHECK (website_url IS NULL
                                                       OR website_url ~ '^https?://')
);

COMMENT ON TABLE master.legal_entity IS
  'ARCHETYPE=B;SCOPE=T. Statutory / registered body. IAM org membership boundary: '
  'IdP org maps here via master.legal_entity_identity_binding. '
  'Group structure with consolidation hierarchy. '
  'Addresses via master.address_link (owner_type=''legal_entity'').';


-- §F2  master.company_code — accounting / posting / balancing unit
-- Address: via master.address_link (owner_type='company_code')
-- Contact: via master.contact_link (owner_type='company_code')
CREATE TABLE IF NOT EXISTS master.company_code (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,
    display_name     text,

    -- Link to statutory body
    legal_entity_id          uuid         NOT NULL,

    -- Accounting boundary
    description              text,
    functional_currency      char(3)       NOT NULL,
    country_code             char(2),
    fiscal_year_start_month  smallint      NOT NULL DEFAULT 1,
    fiscal_year_variant      text          DEFAULT 'calendar',
    default_ledger_book_id   uuid,
    regulatory_framework     text,
    timezone_code            text,

    -- Tax
    tax_registration_number  text,
    tax_jurisdiction_id      uuid,

    -- Operational
    is_intercompany_enabled  boolean      NOT NULL DEFAULT false,

    -- Reference
    external_ref             text,
    tags                     jsonb        NOT NULL DEFAULT '[]'::jsonb,
    metadata                 jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT company_code_pkey              PRIMARY KEY (id),
    CONSTRAINT company_code_tenant_code_uq    UNIQUE (tenant_id, code),
    CONSTRAINT company_code_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT company_code_fy_start_chk      CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    CONSTRAINT company_code_code_nonempty     CHECK (btrim(code) <> ''),
    CONSTRAINT company_code_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT company_code_status_chk        CHECK (status IN (
                                                  'draft', 'active', 'inactive', 'archived')),
    CONSTRAINT company_code_country_fmt_chk   CHECK (country_code IS NULL
                                                     OR country_code ~ '^[A-Z]{2}$')
);

COMMENT ON TABLE master.company_code IS
  'ARCHETYPE=B;SCOPE=T. Accounting / posting / balancing unit within a legal entity. '
  'Addresses via master.address_link (owner_type=''company_code''). '
  'Contacts via master.contact_link (owner_type=''company_code'').';


-- §F3  master.cost_center — responsibility center for cost tracking
CREATE TABLE IF NOT EXISTS master.cost_center (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific (company ownership — Tier 1 UUID)
    company_code_id          uuid         NOT NULL,

    -- Table-specific (hierarchy)
    parent_id                uuid,
    level_no                 smallint     NOT NULL DEFAULT 1,
    path                     text,
    node_type                text         NOT NULL DEFAULT 'posting',

    -- Table-specific (classification)
    description              text,
    cost_center_category     text         NOT NULL DEFAULT 'admin',

    -- Table-specific (cross-references)
    profit_center_id         uuid,
    responsible_person_id    uuid,
    site_id                  uuid,

    -- Table-specific (posting controls)
    currency_code            character(3),
    is_statistical           boolean      NOT NULL DEFAULT false,
    valid_from               date,
    valid_to                 date,

    -- Table-specific (display)
    sort_order               smallint     NOT NULL DEFAULT 0,

    -- Metadata
    metadata                 jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT cost_center_pkey             PRIMARY KEY (id),
    CONSTRAINT cost_center_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT cost_center_company_code_uq  UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT cost_center_no_self_ref      CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT cost_center_dates_chk        CHECK (valid_to IS NULL OR valid_from IS NULL
                                                   OR valid_from <= valid_to),
    CONSTRAINT cost_center_code_nonempty    CHECK (btrim(code) <> ''),
    CONSTRAINT cost_center_name_nonempty    CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.cost_center IS
  'ARCHETYPE=B;SCOPE=T. Responsibility center for cost tracking. Hierarchical tree scoped to a company_code.';


-- §F4  master.profit_center — responsibility center for P&L
CREATE TABLE IF NOT EXISTS master.profit_center (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific (company ownership)
    company_code_id          uuid         NOT NULL,

    -- Table-specific (hierarchy)
    parent_id                uuid,
    level_no                 smallint     NOT NULL DEFAULT 1,
    path                     text,
    node_type                text         NOT NULL DEFAULT 'posting',

    -- Table-specific (classification)
    description              text,
    profit_center_type       text         NOT NULL DEFAULT 'revenue',
    segment_code             text,

    -- Table-specific (management)
    responsible_person_id    uuid,
    currency_code            character(3),
    valid_from               date,
    valid_to                 date,

    -- Table-specific (display)
    sort_order               smallint     NOT NULL DEFAULT 0,

    -- Metadata
    metadata                 jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT profit_center_pkey             PRIMARY KEY (id),
    CONSTRAINT profit_center_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT profit_center_company_code_uq  UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT profit_center_no_self_ref      CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT profit_center_dates_chk        CHECK (valid_to IS NULL OR valid_from IS NULL
                                                     OR valid_from <= valid_to),
    CONSTRAINT profit_center_code_nonempty    CHECK (btrim(code) <> ''),
    CONSTRAINT profit_center_name_nonempty    CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.profit_center IS
  'ARCHETYPE=B;SCOPE=T. Responsibility center for P&L. Hierarchical tree scoped to a company_code.';


-- §F5  master.site — physical location
-- Address: via master.address_link (owner_type='site')
-- Contact: via master.contact_link (owner_type='site')
-- NO inline address columns — all address data in master.address
-- country_code retained as operational field (tax jurisdiction, timezone)
CREATE TABLE IF NOT EXISTS master.site (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific (company ownership)
    company_code_id  uuid         NOT NULL,

    -- Table-specific (classification)
    description      text,
    site_type        text         NOT NULL,

    -- Table-specific (hierarchy)
    parent_site_id   uuid,
    level_no         smallint     NOT NULL DEFAULT 1,
    sort_order       smallint     NOT NULL DEFAULT 0,

    -- Table-specific (operational location context — NOT address data)
    country_code     character(2) NOT NULL,
    timezone_code    text,

    -- Table-specific (management)
    manager_id       uuid,
    capacity_uom     text,
    capacity_value   numeric(12,2),

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT site_pkey           PRIMARY KEY (id),
    CONSTRAINT site_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT site_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT site_no_self_ref    CHECK (parent_site_id IS DISTINCT FROM id),
    CONSTRAINT site_code_nonempty  CHECK (btrim(code) <> ''),
    CONSTRAINT site_name_nonempty  CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.site IS
  'ARCHETYPE=B;SCOPE=T. Physical location (plant, office, store, branch, yard, depot). '
  'Address data via master.address_link, not inline columns. '
  'country_code is operational context for tax/timezone, not postal.';


-- §F6  master.warehouse — inventory storage within site
-- Address: inherited from parent site via address_link
CREATE TABLE IF NOT EXISTS master.warehouse (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific
    site_id                      uuid         NOT NULL,
    description                  text,
    warehouse_type               text         NOT NULL DEFAULT 'finished_goods',
    manager_id                   uuid,
    is_negative_stock_allowed    boolean      NOT NULL DEFAULT false,

    -- Metadata
    metadata                     jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT warehouse_pkey         PRIMARY KEY (id),
    CONSTRAINT warehouse_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT warehouse_site_code_uq UNIQUE (tenant_id, site_id, code),
    CONSTRAINT warehouse_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT warehouse_name_nonempty CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.warehouse IS
  'ARCHETYPE=B;SCOPE=T. Inventory storage location within a site. Address inherited from parent site.';


-- §F7  master.chart_of_account — shared accounting structure header
CREATE TABLE IF NOT EXISTS master.chart_of_account (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific
    description      text,
    framework        text,
    country_code     character(2),
    account_range    text         DEFAULT '1000-9999',
    version          integer      NOT NULL DEFAULT 1,
    is_locked        boolean      NOT NULL DEFAULT false,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT chart_of_account_pkey            PRIMARY KEY (id),
    CONSTRAINT chart_of_account_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT chart_of_account_tenant_code_uq  UNIQUE (tenant_id, code),
    CONSTRAINT chart_of_account_code_nonempty   CHECK (btrim(code) <> ''),
    CONSTRAINT chart_of_account_name_nonempty   CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.chart_of_account IS
  'ARCHETYPE=B;SCOPE=T. Shared accounting structure header. Contains GL accounts as hierarchical children.';


-- §F8  master.gl_account — natural account (hierarchical tree under chart)
CREATE TABLE IF NOT EXISTS master.gl_account (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific (chart membership)
    chart_of_account_id  uuid         NOT NULL,
    parent_id            uuid,
    level_no             smallint     NOT NULL DEFAULT 1,
    path                 text,

    -- Table-specific (classification)
    description          text,
    account_class        text         NOT NULL,
    node_type            text         NOT NULL DEFAULT 'posting',
    normal_balance       text         NOT NULL,
    subledger_type       text,

    -- Table-specific (posting)
    currency_code        character(3),

    -- Table-specific (display)
    sort_order           smallint     NOT NULL DEFAULT 0,
    tags                 jsonb        NOT NULL DEFAULT '[]'::jsonb,

    -- Metadata
    metadata             jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT gl_account_pkey          PRIMARY KEY (id),
    CONSTRAINT gl_account_tenant_id_uq  UNIQUE (tenant_id, id),
    CONSTRAINT gl_account_chart_code_uq UNIQUE (tenant_id, chart_of_account_id, code),
    CONSTRAINT gl_account_no_self_ref   CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT gl_account_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT gl_account_name_nonempty CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.gl_account IS
  'ARCHETYPE=B;SCOPE=T. Natural account within a chart_of_account. Hierarchical tree with account_class grouping. '
  'Trigger enforces parent-child account_class consistency.';


-- §F9  master.company_code_chart_assignment — bridge: company ↔ chart
CREATE TABLE IF NOT EXISTS master.company_code_chart_assignment (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL DEFAULT '',
    name             text         NOT NULL DEFAULT '',

    -- Table-specific
    company_code_id      uuid         NOT NULL,
    chart_of_account_id  uuid         NOT NULL,
    assignment_type      text         NOT NULL DEFAULT 'operating',
    is_primary           boolean      NOT NULL DEFAULT false,
    effective_from       date,
    effective_to         date,

    -- Metadata
    metadata             jsonb        NOT NULL DEFAULT '{}'::jsonb,

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

    CONSTRAINT ccca_pkey          PRIMARY KEY (id),
    CONSTRAINT ccca_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT ccca_unique       UNIQUE (tenant_id, company_code_id, chart_of_account_id, assignment_type),
    CONSTRAINT ccca_dates  CHECK (effective_to IS NULL OR effective_from IS NULL
                                  OR effective_from <= effective_to)
);

COMMENT ON TABLE master.company_code_chart_assignment IS
  'ARCHETYPE=B;SCOPE=T. Bridge table linking company_code to chart_of_account with assignment type (operating/local/group).';


-- §F10  master.company_code_gl_account — bridge: company ↔ account controls
CREATE TABLE IF NOT EXISTS master.company_code_gl_account (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL DEFAULT '',
    name             text         NOT NULL DEFAULT '',

    -- Table-specific (link)
    company_code_id        uuid    NOT NULL,
    gl_account_id          uuid    NOT NULL,

    -- Table-specific (posting controls)
    posting_allowed        boolean NOT NULL DEFAULT true,
    blocked_for_manual     boolean NOT NULL DEFAULT false,
    blocked_for_auto       boolean NOT NULL DEFAULT false,
    requires_cost_center   boolean NOT NULL DEFAULT false,
    requires_profit_center boolean NOT NULL DEFAULT false,
    requires_project       boolean NOT NULL DEFAULT false,

    -- Table-specific (defaults)
    default_cost_center_id uuid,
    default_site_id        uuid,

    -- Table-specific (classification)
    tax_category           text,
    reconciliation_type    text,

    -- Metadata
    metadata               jsonb   NOT NULL DEFAULT '{}'::jsonb,

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

    CONSTRAINT ccga_pkey          PRIMARY KEY (id),
    CONSTRAINT ccga_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT ccga_unique       UNIQUE (tenant_id, company_code_id, gl_account_id)
);

COMMENT ON TABLE master.company_code_gl_account IS
  'ARCHETYPE=B;SCOPE=T. Per-company posting controls for GL accounts. Controls posting permissions, '
  'dimension requirements, and default assignments.';


-- §F11  master.project — project header
CREATE TABLE IF NOT EXISTS master.project (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific (company ownership)
    company_code_id        uuid         NOT NULL,

    -- Table-specific (classification)
    description            text,
    project_type           text         NOT NULL,

    -- Table-specific (hierarchy)
    parent_project_id      uuid,
    level_no               smallint     NOT NULL DEFAULT 1,
    path                   text,

    -- Table-specific (management)
    responsible_person_id  uuid,
    is_cross_company       boolean      NOT NULL DEFAULT false,
    funding_profile_id     uuid,
    default_cost_center_id uuid,

    -- Table-specific (financials)
    planned_cost           numeric(18,4),
    actual_cost            numeric(18,4) NOT NULL DEFAULT 0,
    currency_code          character(3)  NOT NULL,

    -- Table-specific (schedule)
    planned_start          date,
    planned_end            date,
    actual_start           date,
    actual_end             date,

    -- Table-specific (settlement)
    settlement_type        text          DEFAULT 'cost_center',
    settlement_target_id   uuid,

    -- Table-specific (validity)
    valid_from             date,
    valid_to               date,

    -- Table-specific (display)
    sort_order             smallint     NOT NULL DEFAULT 0,
    tags                   jsonb        NOT NULL DEFAULT '[]'::jsonb,

    -- Metadata
    metadata               jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT project_pkey           PRIMARY KEY (id),
    CONSTRAINT project_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT project_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT project_no_self_ref    CHECK (parent_project_id IS DISTINCT FROM id),
    CONSTRAINT project_dates_chk      CHECK (planned_end IS NULL OR planned_start IS NULL
                                             OR planned_end >= planned_start),
    CONSTRAINT project_valid_chk      CHECK (valid_to IS NULL OR valid_from IS NULL
                                             OR valid_from <= valid_to),
    CONSTRAINT project_code_nonempty  CHECK (btrim(code) <> ''),
    CONSTRAINT project_name_nonempty  CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.project IS
  'ARCHETYPE=B;SCOPE=T. Project header with hierarchical structure. Scoped to company_code.';


-- §F12  master.project_item — WBS: phase / task / milestone
CREATE TABLE IF NOT EXISTS master.project_item (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific (link)
    project_id             uuid         NOT NULL,
    company_code_id        uuid         NOT NULL,

    -- Table-specific (hierarchy)
    parent_item_id         uuid,
    level_no               smallint     NOT NULL DEFAULT 1,
    path                   text,
    sort_order             smallint     NOT NULL DEFAULT 0,

    -- Table-specific (classification)
    description            text,
    item_type              text         NOT NULL,

    -- Table-specific (cost capture flags)
    allow_time_entry       boolean      NOT NULL DEFAULT false,
    allow_expense_claim    boolean      NOT NULL DEFAULT false,
    allow_supplier_cost    boolean      NOT NULL DEFAULT false,
    allow_material_usage   boolean      NOT NULL DEFAULT false,
    allow_billable         boolean      NOT NULL DEFAULT false,
    capitalizable_default  boolean      NOT NULL DEFAULT false,

    -- Table-specific (financials)
    planned_cost           numeric(18,4),
    actual_cost            numeric(18,4) NOT NULL DEFAULT 0,
    currency_code          character(3),
    default_cost_center_id uuid,

    -- Table-specific (schedule)
    planned_start          date,
    planned_end            date,
    actual_start           date,
    actual_end             date,
    completion_pct         numeric(5,2) NOT NULL DEFAULT 0,

    -- Table-specific (milestone)
    milestone_date         date,
    is_milestone_reached   boolean      NOT NULL DEFAULT false,
    milestone_reached_at   timestamptz,
    milestone_reached_by   uuid,

    -- Table-specific (management)
    responsible_person_id  uuid,

    -- Metadata
    metadata               jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT project_item_pkey         PRIMARY KEY (id),
    CONSTRAINT project_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_item_proj_code_uq UNIQUE (tenant_id, project_id, code),
    CONSTRAINT project_item_no_self_ref  CHECK (parent_item_id IS DISTINCT FROM id),
    CONSTRAINT project_item_dates_chk    CHECK (planned_end IS NULL OR planned_start IS NULL
                                                OR planned_end >= planned_start),
    CONSTRAINT project_item_pct_chk      CHECK (completion_pct >= 0 AND completion_pct <= 100),
    CONSTRAINT project_item_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT project_item_name_nonempty CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.project_item IS
  'ARCHETYPE=B;SCOPE=T. WBS element (phase / task / milestone) within a project. '
  'Trigger enforces company_code_id consistency with parent project.';


-- §F13  master.dimension_set — composite dimension key for GL balance
CREATE TABLE IF NOT EXISTS master.dimension_set (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL DEFAULT '',
    name             text         NOT NULL DEFAULT '',

    -- Content hash
    set_hash         text         NOT NULL,
    signature        text         NOT NULL,
    dimension_count  smallint     NOT NULL,
    display_label    text,

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

    CONSTRAINT dimension_set_pkey PRIMARY KEY (id),
    CONSTRAINT dimension_set_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT dimension_set_hash_uq UNIQUE (tenant_id, set_hash),
    CONSTRAINT dimension_set_count_chk CHECK (dimension_count > 0)
);

COMMENT ON TABLE master.dimension_set IS
    'ARCHETYPE=B;SCOPE=T. Content-addressed dimension combination cache. Keyed by SHA-256 hash '
    'of sorted (type_id:value_id) pairs. Immutable after creation. '
    'One row per unique combination — deduplication via hash lookup.';


-- §F14  master.fiscal_period — period gate per company_code
-- Period 0 = opening balance (year-end close carry-forward)
-- Periods 1–12 = normal months
-- Periods 13–16 = adjustment (year-end audit, tax, final close)
CREATE TABLE IF NOT EXISTS master.fiscal_period (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Period identity
    fiscal_year      smallint     NOT NULL,
    period_number    smallint     NOT NULL,
    period_type      text         NOT NULL DEFAULT 'normal',

    -- Date range
    start_date       date         NOT NULL,
    end_date         date         NOT NULL,

    -- Computed
    is_adjustment    boolean      GENERATED ALWAYS AS (period_number > 12) STORED,

    -- Close timestamps
    opened_at        timestamptz,
    opened_by        uuid,
    soft_closed_at   timestamptz,
    soft_closed_by   uuid,
    hard_closed_at   timestamptz,
    hard_closed_by   uuid,

    -- Display
    sort_order       smallint     NOT NULL DEFAULT 0,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'future',
    is_active        boolean      GENERATED ALWAYS AS (status IN ('open', 'soft_close')) STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT fiscal_period_pkey PRIMARY KEY (id),
    CONSTRAINT fiscal_period_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fiscal_period_company_year_period_uq
        UNIQUE (tenant_id, company_code_id, fiscal_year, period_number),
    CONSTRAINT fiscal_period_dates_chk CHECK (start_date <= end_date),
    CONSTRAINT fiscal_period_period_range_chk CHECK (period_number BETWEEN 0 AND 16),
    CONSTRAINT fiscal_period_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT fiscal_period_name_nonempty CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.fiscal_period IS
    'ARCHETYPE=B;SCOPE=T. Fiscal period gate per company_code. Period 0 = opening balance, 1-12 = normal, '
    '13-16 = adjustment. Status lifecycle: future -> open -> soft_close -> hard_close. '
    'Non-standard active-set: is_active GENERATED AS (status IN (''open'', ''soft_close'')).';


-- §F15  master.ledger_book — book definition (tenant-level)
CREATE TABLE IF NOT EXISTS master.ledger_book (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Classification
    description      text,
    category         text         NOT NULL DEFAULT 'statutory',
    reporting_standard text,
    base_currency_code character(3) NOT NULL DEFAULT 'USD',

    -- Behavior flags
    is_primary              boolean NOT NULL DEFAULT false,
    is_auto_post            boolean NOT NULL DEFAULT true,
    is_approval_required    boolean NOT NULL DEFAULT false,
    is_manual_je_allowed    boolean NOT NULL DEFAULT true,
    is_reversal_allowed     boolean NOT NULL DEFAULT true,

    -- Close mode
    close_mode       text         NOT NULL DEFAULT 'unified',

    -- Display
    sort_order       smallint     NOT NULL DEFAULT 0,
    color_code       text,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT ledger_book_pkey PRIMARY KEY (id),
    CONSTRAINT ledger_book_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT ledger_book_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT ledger_book_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT ledger_book_name_nonempty CHECK (btrim(name) <> '')
);

COMMENT ON TABLE master.ledger_book IS
    'ARCHETYPE=B;SCOPE=T. Ledger book definition. Tenant-level (not company-scoped). '
    'Assigned to company_codes via master.company_code_book_assignment.';


-- §F16  master.company_code_book_assignment — company_code ↔ book bridge
CREATE TABLE IF NOT EXISTS master.company_code_book_assignment (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Book reference
    book_id          uuid         NOT NULL,

    -- Overrides
    alternate_coa_prefix text,
    override_currency_code character(3),

    -- Temporal
    effective_from   date         NOT NULL DEFAULT CURRENT_DATE,
    effective_to     date,

    -- Conflict resolution
    priority         smallint     NOT NULL DEFAULT 0,
    conflict_strategy text        NOT NULL DEFAULT 'highest_priority',

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

    CONSTRAINT ba_pkey PRIMARY KEY (id),
    CONSTRAINT ba_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT ba_company_book_uq
        UNIQUE (tenant_id, company_code_id, book_id),
    CONSTRAINT ba_dates_chk
        CHECK (effective_to IS NULL OR effective_from <= effective_to)
);

COMMENT ON TABLE master.company_code_book_assignment IS
    'ARCHETYPE=B;SCOPE=T. Bridge: which books each company_code uses. Controls which ledger books '
    'receive journal entries for a given company. Temporal with effective dates.';


-- =============================================================================
-- MODULE 400 — Party, Product, and Classification Bridge
-- Depends on: §F1–F16 (Core Finance Master), shared.commodity_code, shared.industry_code
-- =============================================================================

-- §P1/§P2  master.business_partner + master.customer + master.supplier
-- Moved to 01h_tables_business_partner.sql (BP-first design)

-- §P3  master.employee — internal workforce, links to principal
CREATE TABLE IF NOT EXISTS master.employee (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific (identity link)
    principal_id     uuid,
    employee_number  text         NOT NULL,

    -- Table-specific (personal)
    first_name       text         NOT NULL,
    last_name        text         NOT NULL,
    display_name     text,
    email            text,
    phone            text,

    -- Table-specific (organization)
    employment_type  text         NOT NULL DEFAULT 'full_time',
    department       text,
    title            text,
    manager_id       uuid,
    company_code_id  uuid,

    -- Table-specific (dates)
    hire_date        date,
    termination_date date,
    -- NOTE: is_terminated computed in v_employee view (CURRENT_DATE cannot be GENERATED STORED safely)

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
    tags             jsonb        NOT NULL DEFAULT '[]'::jsonb,

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

    CONSTRAINT employee_pkey              PRIMARY KEY (id),
    CONSTRAINT employee_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT employee_tenant_code_uq    UNIQUE (tenant_id, code),
    CONSTRAINT employee_tenant_empno_uq   UNIQUE (tenant_id, employee_number),
    CONSTRAINT employee_code_nonempty     CHECK (btrim(code) <> ''),
    CONSTRAINT employee_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT employee_empno_nonempty    CHECK (btrim(employee_number) <> ''),
    CONSTRAINT employee_no_self_manager   CHECK (manager_id IS DISTINCT FROM id),
    CONSTRAINT employee_dates_chk         CHECK (termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date),
    CONSTRAINT employee_email_norm_chk    CHECK (email IS NULL OR email = lower(trim(email)))
);

-- Backfill: company_code_id added after initial deploy — idempotent ALTER
ALTER TABLE master.employee ADD COLUMN IF NOT EXISTS company_code_id uuid;

COMMENT ON TABLE master.employee IS
    'ARCHETYPE=B;SCOPE=T. Internal workforce. principal_id links to login identity (1:1 optional). '
    'Party for expense claims, payroll, advances. manager_id = self-ref hierarchy.';


-- §P4  master.item_category — hierarchical product taxonomy
CREATE TABLE IF NOT EXISTS master.item_category (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific
    description      text,
    parent_id        uuid,
    level_no         smallint,
    sort_order       smallint     NOT NULL DEFAULT 0,

    -- Tax default (FK → control.tax_group)
    default_tax_group_id uuid,

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

    CONSTRAINT item_category_pkey           PRIMARY KEY (id),
    CONSTRAINT item_category_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT item_category_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT item_category_code_nonempty  CHECK (btrim(code) <> ''),
    CONSTRAINT item_category_name_nonempty  CHECK (btrim(name) <> ''),
    CONSTRAINT item_category_no_self_parent CHECK (parent_id IS DISTINCT FROM id)
);

COMMENT ON TABLE master.item_category IS
    'ARCHETYPE=B;SCOPE=T. Hierarchical product taxonomy. Self-referential tree via parent_id. '
    'Classifications via commodity_classification bridge.';
COMMENT ON COLUMN master.item_category.default_tax_group_id IS
    'FK → control.tax_group (tenant-composite). Category-level fallback tax group.';


-- §P5  master.product — tenant-level catalog item (SKU, pricing, tax)
CREATE TABLE IF NOT EXISTS master.product (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific
    description      text,
    sku              text,
    category_id      uuid,
    spend_category_id uuid,
    product_type     text         NOT NULL DEFAULT 'physical',
    unit_of_measure  text,
    base_price       numeric(18,4),
    currency_code    character(3),
    is_taxable       boolean      NOT NULL DEFAULT true,
    tax_code         text,

    -- Tax default (FK → control.tax_group)
    default_tax_group_id uuid,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
    tags             jsonb        NOT NULL DEFAULT '[]'::jsonb,

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

    CONSTRAINT product_pkey           PRIMARY KEY (id),
    CONSTRAINT product_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT product_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT product_code_nonempty  CHECK (btrim(code) <> ''),
    CONSTRAINT product_name_nonempty  CHECK (btrim(name) <> ''),
    CONSTRAINT product_price_nonneg   CHECK (base_price IS NULL OR base_price >= 0)
);

COMMENT ON TABLE master.product IS
    'ARCHETYPE=B;SCOPE=T. Tenant-level catalog item. Sellable/purchasable. SKU optional (partial unique). '
    'category_id → item_category, spend_category_id → spend_category. '
    'Classifications via commodity_classification bridge.';
COMMENT ON COLUMN master.product.default_tax_group_id IS
    'FK → control.tax_group (tenant-composite). Replaces free-text tax_code. '
    'Resolution order: product → item_category → spend_category → scoped tax_rate_schedule.';


-- §P6  master.item — company-level inventory config (dual-path entry)
--
-- Two paths into item:
--   Path A (product-centric): Retail, manufacturing, distribution
--     item_category → product → item
--     product_id NOT NULL, category_id optional (inherit from product)
--   Path B (item-centric): Utilities, MRO, facilities, government
--     item_category → item
--     product_id NULL, category_id NOT NULL (direct classification)
CREATE TABLE IF NOT EXISTS master.item (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Table-specific (scope)
    company_code_id  uuid         NOT NULL,

    -- Table-specific (dual-path entry)
    product_id       uuid,                    -- Path A: product-centric (nullable)
    category_id      uuid,                    -- Path B: item-centric (direct FK → item_category)

    -- Table-specific (valuation)
    valuation_method text         NOT NULL,
    standard_cost    numeric(18,4),

    -- Table-specific (procurement)
    spend_category_id uuid,

    -- Table-specific (inventory)
    reorder_point    numeric(18,4),
    reorder_qty      numeric(18,4),
    safety_stock     numeric(18,4),
    has_lot_tracking    boolean   NOT NULL DEFAULT false,
    has_serial_tracking boolean   NOT NULL DEFAULT false,
    uom_code         text         NOT NULL,

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

    CONSTRAINT im_pkey              PRIMARY KEY (id),
    CONSTRAINT im_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT im_company_code_uq   UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT im_code_nonempty     CHECK (btrim(code) <> ''),
    CONSTRAINT im_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT im_standard_cost_chk          CHECK (valuation_method != 'standard_cost' OR standard_cost IS NOT NULL),
    CONSTRAINT im_classification_chk         CHECK (product_id IS NOT NULL OR category_id IS NOT NULL)
);

-- Partial unique: one item per product per company (Path A only)
CREATE UNIQUE INDEX IF NOT EXISTS im_company_product_uq
    ON master.item (tenant_id, company_code_id, product_id)
    WHERE product_id IS NOT NULL;

COMMENT ON TABLE master.item IS
    'ARCHETYPE=B;SCOPE=T. Company-level inventory configuration. Dual-path entry: '
    'Path A (product-centric): product_id set, category inherited from product. '
    'Path B (item-centric): category_id set, no product (MRO, utilities, facilities). '
    'Both paths may coexist (product with explicit category override). '
    'UNIQUE(tenant, company, code) universal; partial UNIQUE(tenant, company, product) for Path A.';


-- §P7  master.spend_category — "What is this category?" Pure definition.
-- Operational defaults (GL, tax, capex, asset routing) live on
-- master.company_code_spend_policy; fall back to spend_category base.
CREATE TABLE IF NOT EXISTS master.spend_category (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,

    -- Hierarchy
    description      text,
    parent_id        uuid,

    -- Classification
    root_category_id      uuid         NOT NULL,   -- trigger-maintained → tree root
    allowed_domains       jsonb        NOT NULL DEFAULT '[]'::jsonb,

    -- Nature
    procurement_type      text         NOT NULL DEFAULT 'goods',

    -- Governance (base defaults — OU mapping may override)
    visibility                   text    NOT NULL DEFAULT 'standard',
    is_classification_required   boolean NOT NULL DEFAULT false,
    is_hs_required               boolean NOT NULL DEFAULT false,
    is_regulated                 boolean NOT NULL DEFAULT false,

    -- Intent default (base-level; OU mapping may override)
    default_intent_id            uuid,

    -- Display
    sort_order       smallint     NOT NULL DEFAULT 0,

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

    CONSTRAINT spend_category_pkey           PRIMARY KEY (id),
    CONSTRAINT spend_category_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT spend_category_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT spend_category_code_nonempty  CHECK (btrim(code) <> ''),
    CONSTRAINT spend_category_name_nonempty  CHECK (btrim(name) <> ''),
    CONSTRAINT spend_category_no_self_parent CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT spend_category_root_is_self   CHECK (parent_id IS NOT NULL OR root_category_id = id)
);

COMMENT ON TABLE master.spend_category IS
    'ARCHETYPE=B;SCOPE=T. Procurement spend taxonomy — pure definition only. '
    'Hierarchical via parent_id; root_category_id is trigger-maintained '
    'denormalization pointing to the tree root. '
    'Classifications via commodity_classification bridge. '
    'default_intent_id = base-level intent fallback; company-code overrides via '
    'master.company_code_spend_policy (direct lookup, no hierarchy). '
    'Operational defaults (GL, tax, capex) live on company_code_spend_policy.';


-- =============================================================================
-- §P7b  master.company_code_spend_policy — "How does this category behave in this company code?"
-- =============================================================================
-- Resolution order: company code → tenant → spend_category base governance.
--                   NULL = inherit from parent level.
CREATE TABLE IF NOT EXISTS master.company_code_spend_policy (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Scope
    company_code_id  uuid         NOT NULL,             -- FK → company_code
    spend_category_id uuid        NOT NULL,             -- FK → spend_category

    -- Access control
    mapping_mode     text         NOT NULL DEFAULT 'ALLOW',  -- ALLOW | DENY

    -- Financial defaults (NULL = inherit from parent level)
    default_gl_account_id    uuid,                      -- FK → gl_account
    default_tax_group_id     uuid,                      -- FK → control.tax_group
    default_intent_id        uuid,                      -- FK → business_intent (deferred)

    -- Asset routing (typically company level)
    asset_class_id           uuid,                      -- FK → asset_class

    -- Capex screening (NULL = inherit)
    capex_screening_threshold    numeric(18,4),
    capex_screening_currency     character(3),           -- FK → shared.currency
    is_asset_tagging_required    boolean,                -- NULL = inherit

    -- Governance overrides (NULL = inherit from spend_category base)
    override_visibility                  text,           -- lookup: master.spend_visibility
    override_is_classification_required  boolean,
    override_is_hs_required              boolean,
    override_is_regulated                boolean,

    -- Priority
    is_default       boolean      NOT NULL DEFAULT false,
    priority         smallint     NOT NULL DEFAULT 0,

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

    CONSTRAINT sccp_pkey                    PRIMARY KEY (id),
    CONSTRAINT sccp_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT sccp_tenant_cc_category_uq   UNIQUE (tenant_id, company_code_id, spend_category_id),
    CONSTRAINT sccp_mapping_mode_ck         CHECK (mapping_mode IN ('ALLOW', 'DENY')),
    CONSTRAINT sccp_cap_nonneg              CHECK (capex_screening_threshold IS NULL OR capex_screening_threshold >= 0),
    CONSTRAINT sccp_priority_nonneg         CHECK (priority >= 0)
);

COMMENT ON TABLE master.company_code_spend_policy IS
    'ARCHETYPE=B;SCOPE=T. Company-code-scoped operational defaults and overrides for spend categories. '
    'Resolution: company code → tenant → spend_category base governance. '
    'NULL columns inherit from parent level. DENY mapping_mode overrides parent ALLOW.';


-- §P8  master.commodity_classification — unified M:N bridge (entity → system code)
CREATE TABLE IF NOT EXISTS master.commodity_classification (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Table-specific (owner — polymorphic)
    owner_type       text         NOT NULL,
    owner_id         uuid         NOT NULL,

    -- Table-specific (classification — polymorphic)
    classification_type text      NOT NULL,
    domain_code      text         NOT NULL,
    code_id          uuid         NOT NULL,

    -- Table-specific (mapping metadata)
    mapping_type     text         NOT NULL DEFAULT 'exact',
    confidence       numeric(5,2),
    provenance       text         NOT NULL DEFAULT 'manual',
    is_primary       boolean      NOT NULL DEFAULT false,
    description      text,

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

    CONSTRAINT commodity_classification_pkey PRIMARY KEY (id),
    CONSTRAINT cc_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cc_owner_code_uq
        UNIQUE (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id),
    CONSTRAINT cc_confidence_range
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),
    -- At most ONE primary per (entity, classification_type, domain)
    CONSTRAINT cc_one_primary_per_domain
        EXCLUDE USING btree (
            tenant_id           WITH =,
            owner_type          WITH =,
            owner_id            WITH =,
            classification_type WITH =,
            domain_code         WITH =
        ) WHERE (is_primary = true)
);

COMMENT ON TABLE master.commodity_classification IS
    'ARCHETYPE=B;SCOPE=T. Unified M:N bridge mapping any tenant entity to any system classification code '
    'in any domain (UNSPSC, HS, NAICS, ISIC, GICS, SITC). Polymorphic owner_type + '
    'owner_id → entity, polymorphic classification_type → commodity_code or industry_code. '
    'EXCLUDE constraint ensures at most one primary per (entity, type, domain).';


-- §P9 / §P10  company_code_customer_profile + company_code_supplier_profile
-- Moved to 01h_tables_business_partner.sql alongside business_partner, customer, supplier.
-- ============================================================================
-- END: party tables moved. See 01h_tables_business_partner.sql for full DDL.
-- ============================================================================


-- §F99  master.legal_entity_business_partner_link — identity bridge
-- Maps a legal entity to its own Business Partner identity (self_bp) or to a
-- known external network identity. Covers identity only — NOT operational AP/AR
-- control, which belongs in master.intercompany_trading_pair (01j).
-- FK to business_partner added in 03_constraints.sql (load-order safe).
CREATE TABLE IF NOT EXISTS master.legal_entity_business_partner_link (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid        NOT NULL,
    legal_entity_id      uuid        NOT NULL,
    business_partner_id  uuid        NOT NULL,

    -- Nature of the link
    relationship_type    text        NOT NULL,
        -- 'self_bp'        — the legal entity's canonical internal BP identity;
        --                    the linked BP must have partner_category = 'internal'.
        --                    Validated by trigger trg_lebpl_self_bp_guard.
        -- 'network_identity' — external portal / EDI / e-invoice network identity.
        --                    Use business_partner_network_link for per-network details.

    -- Lifecycle
    status               text        NOT NULL DEFAULT 'active',
    is_active            boolean     GENERATED ALWAYS AS (status = 'active') STORED,

    notes                text,

    -- Audit
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT lebpl_pkey                    PRIMARY KEY (id),
    CONSTRAINT lebpl_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT lebpl_le_bp_type_uq           UNIQUE (tenant_id, legal_entity_id, business_partner_id, relationship_type),
    CONSTRAINT lebpl_relationship_type_chk   CHECK (relationship_type IN (
                                                 'self_bp', 'network_identity')),
    CONSTRAINT lebpl_status_chk              CHECK (status IN ('active', 'inactive', 'archived'))
);

-- Drop constraint carried over from a prior schema version (same reason as ictp).
ALTER TABLE IF EXISTS master.legal_entity_business_partner_link
    DROP CONSTRAINT IF EXISTS lebpl_audit_pair_chk;

-- Additive guard: existing DBs built before is_active was added to the DDL.
ALTER TABLE master.legal_entity_business_partner_link
    ADD COLUMN IF NOT EXISTS is_active boolean GENERATED ALWAYS AS (status = 'active') STORED;

-- One active self_bp per legal entity — enforced at DB level.
CREATE UNIQUE INDEX IF NOT EXISTS lebpl_one_active_self_bp_uidx
    ON master.legal_entity_business_partner_link (tenant_id, legal_entity_id)
    WHERE relationship_type = 'self_bp' AND status = 'active';

CREATE INDEX IF NOT EXISTS lebpl_legal_entity_idx
    ON master.legal_entity_business_partner_link (tenant_id, legal_entity_id);
CREATE INDEX IF NOT EXISTS lebpl_business_partner_idx
    ON master.legal_entity_business_partner_link (tenant_id, business_partner_id);

COMMENT ON TABLE master.legal_entity_business_partner_link IS
    'ARCHETYPE=B;SCOPE=T. Identity bridge between a statutory legal entity and a '
    'business_partner record. Primary use: self_bp — maps each LE to its own internal '
    'BP so it can appear as a transacting party. Intercompany AP/AR control is in '
    'master.intercompany_trading_pair. Normal external-supplier flows do not need this table.';
COMMENT ON COLUMN master.legal_entity_business_partner_link.relationship_type IS
    'self_bp: LE''s own canonical BP identity (partner_category must be ''internal''). '
    'network_identity: external portal / EDI / e-invoicing identity.';
COMMENT ON COLUMN master.legal_entity_business_partner_link.is_active IS
    'Generated: status = ''active''. At most one active self_bp per legal entity (partial unique index).';
COMMENT ON COLUMN master.legal_entity_business_partner_link.business_partner_id IS
    'FK to master.business_partner(tenant_id, id). Added in 03_constraints.sql (load-order safe).';
