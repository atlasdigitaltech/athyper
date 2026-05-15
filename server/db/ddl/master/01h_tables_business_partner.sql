-- ============================================================================
-- master/01h_tables_business_partner.sql
-- Concept: Business Partner master — BP-first identity spine
-- Depends on: 01b_tables_finance.sql (master.company_code, master.spend_category)
--             01_tables_identity.sql (master.principal)
--
-- Design rule:
--   master.business_partner = canonical commercial identity (WHO)
--   master.customer         = AR role of a BP (WHAT we can do: receivables)
--   master.supplier         = AP role of a BP (WHAT we can do: payables)
--   company_code_*_profile  = HOW we transact per company code
--
-- Tables:
--   §BP1  master.business_partner              — root identity + legal fields
--   §BP2  master.customer                      — thin AR role
--   §BP3  master.supplier                      — thin AP role
--   §BP4  master.company_code_customer_profile — AR settings per company (SAP KNB1)
--   §BP5  master.company_code_supplier_profile — AP settings per company (SAP LFB1)
--
-- FKs       → 03_constraints.sql
-- Indexes   → 04_indexes.sql
-- Triggers  → 06_triggers.sql
-- RLS       → 08_rls.sql
-- ============================================================================


-- ============================================================================
-- Drop guards — reverse dependency order so re-runs start clean.
-- Safe in dev/from-scratch mode; CASCADE removes FKs from child tables.
-- ============================================================================
DROP TABLE IF EXISTS master.company_code_supplier_posting_override CASCADE;
DROP TABLE IF EXISTS master.company_code_supplier_intent_policy CASCADE;
DROP TABLE IF EXISTS master.company_code_supplier_spend_policy CASCADE;
DROP TABLE IF EXISTS master.company_code_supplier_profile CASCADE;
DROP TABLE IF EXISTS master.company_code_customer_profile CASCADE;
DROP TABLE IF EXISTS master.supplier                       CASCADE;
DROP TABLE IF EXISTS master.customer                       CASCADE;
DROP TABLE IF EXISTS master.business_partner               CASCADE;


-- ============================================================================
-- §BP1  master.business_partner — canonical commercial identity
-- Any organization or individual we do business with.
-- Legal/registration fields live here. Customer/Supplier are role tables.
-- ============================================================================

CREATE TABLE master.business_partner (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,
    display_name     text,

    -- Commercial classification
    partner_category text         NOT NULL DEFAULT 'organization',
        -- 'organization' | 'individual' | 'government' | 'internal'

    -- Statutory identity (lives here, not on customer/supplier role)
    legal_name                    text,
    legal_form                    text,
    registration_no               text,
    registration_country_code     char(2),
    tax_residence_country_code    char(2),
    website_url                   text,

    -- Group hierarchy (BP-level, not role-level)
    parent_business_partner_id    uuid,

    -- Extended profile
    description                   text,
    long_description              text,
    aliases                       text[]   NOT NULL DEFAULT '{}',
    tags                          jsonb    NOT NULL DEFAULT '[]'::jsonb,
    business_types                text[]   NOT NULL DEFAULT '{}',
    founded_year                  smallint,
    employee_count_band           text,
    annual_revenue_band           text,
    incorporation_date            date,

    -- Temporal validity (commercial / contractual window)
    effective_from                date,
    effective_until               date,

    -- Reference
    -- NOTE: prefer master.party_identifier (scheme='duns'/'lei'/'crn') for structured
    --       external identifiers; external_ref is for legacy ERP import codes only.
    external_ref                  text,
    metadata                      jsonb    NOT NULL DEFAULT '{}'::jsonb,

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

    CONSTRAINT bpart_pkey                    PRIMARY KEY (id),
    CONSTRAINT bpart_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT bpart_tenant_code_uq          UNIQUE (tenant_id, code),
    CONSTRAINT bpart_code_nonempty           CHECK (btrim(code) <> ''),
    CONSTRAINT bpart_name_nonempty           CHECK (btrim(name) <> ''),
    CONSTRAINT bpart_no_self_parent          CHECK (parent_business_partner_id IS DISTINCT FROM id),
    CONSTRAINT bpart_partner_category_chk    CHECK (partner_category IN (
                                              'organization', 'individual',
                                              'government', 'internal')),
    CONSTRAINT bpart_status_chk              CHECK (status IN (
                                              'prospect', 'active', 'on_hold',
                                              'inactive', 'blocked', 'archived')),
    CONSTRAINT bpart_founded_year_chk        CHECK (founded_year IS NULL
                                                 OR (founded_year BETWEEN 1800 AND 2200)),
    CONSTRAINT bpart_reg_country_fmt_chk     CHECK (registration_country_code IS NULL
                                                 OR registration_country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT bpart_tax_country_fmt_chk     CHECK (tax_residence_country_code IS NULL
                                                 OR tax_residence_country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT bpart_website_fmt_chk         CHECK (website_url IS NULL
                                                 OR website_url ~ '^https?://'),
    CONSTRAINT bpart_effective_order_chk     CHECK (effective_until IS NULL
                                                 OR effective_from  IS NULL
                                                 OR effective_until >= effective_from)
);

CREATE INDEX IF NOT EXISTS bpart_tenant_idx
    ON master.business_partner (tenant_id);
CREATE INDEX IF NOT EXISTS bpart_active_pidx
    ON master.business_partner (tenant_id, code)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS bpart_category_idx
    ON master.business_partner (tenant_id, partner_category);
CREATE INDEX IF NOT EXISTS bpart_parent_idx
    ON master.business_partner (tenant_id, parent_business_partner_id)
    WHERE parent_business_partner_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bpart_external_ref_uidx
    ON master.business_partner (tenant_id, external_ref)
    WHERE external_ref IS NOT NULL;

COMMENT ON TABLE master.business_partner IS
    'ARCHETYPE=B;SCOPE=T. Canonical commercial identity — any party we do business with. '
    'Legal/registration/profile fields live here. '
    'Customer and Supplier are role tables: see master.customer, master.supplier. '
    'Network account linking: master.business_partner_network_link. '
    'Addresses via address_link (owner_type=''business_partner''). '
    'Identifiers via party_identifier (owner_type=''business_partner'').';
COMMENT ON COLUMN master.business_partner.partner_category IS
    'Commercial classification: organization | individual | government | internal. '
    'Governs which tabs and workflows are available in the UI.';
COMMENT ON COLUMN master.business_partner.legal_name IS
    'Full registered legal name. Used on invoices, contracts, tax certificates. '
    'May differ from trading name in business_partner.name.';
COMMENT ON COLUMN master.business_partner.registration_no IS
    'Company registration / incorporation number. Free text — format varies by jurisdiction.';
COMMENT ON COLUMN master.business_partner.parent_business_partner_id IS
    'Self-referential group hierarchy for multi-entity corporate groups. NULL = top-level.';


-- ============================================================================
-- §BP2  master.customer — AR role of a business partner
-- Thin role table. Identity/legal fields on business_partner.
-- Company-specific AR settings (payment terms, credit limit, GL) in company_code_customer_profile.
-- ============================================================================

CREATE TABLE master.customer (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- BP link (role anchor)
    business_partner_id  uuid     NOT NULL,

    -- Role code (serial per tenant, format: CUS-{CC}-{seq})
    customer_code        text     NOT NULL,

    -- AR role attributes
    customer_type        text     NOT NULL DEFAULT 'corporate',
        -- 'corporate' | 'individual' | 'government' | 'intercompany'
    account_manager_id   uuid,
    is_key_account       boolean  NOT NULL DEFAULT false,
    risk_rating          text,

    -- Metadata
    metadata             jsonb    NOT NULL DEFAULT '{}'::jsonb,

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

    CONSTRAINT customer_pkey              PRIMARY KEY (id),
    CONSTRAINT customer_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT customer_tenant_code_uq    UNIQUE (tenant_id, customer_code),
    CONSTRAINT customer_bp_uq            UNIQUE (tenant_id, business_partner_id),
    CONSTRAINT customer_code_nonempty     CHECK (btrim(customer_code) <> ''),
    CONSTRAINT customer_type_chk          CHECK (customer_type IN (
                                              'corporate', 'individual',
                                              'government', 'intercompany')),
    CONSTRAINT customer_status_chk        CHECK (status IN (
                                              'prospect', 'active', 'on_hold',
                                              'credit_hold', 'inactive', 'archived'))
);

CREATE INDEX IF NOT EXISTS cust_tenant_idx
    ON master.customer (tenant_id);
CREATE INDEX IF NOT EXISTS cust_bp_idx
    ON master.customer (tenant_id, business_partner_id);
CREATE INDEX IF NOT EXISTS cust_active_pidx
    ON master.customer (tenant_id, customer_code)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS cust_type_idx
    ON master.customer (tenant_id, customer_type);

COMMENT ON TABLE master.customer IS
    'ARCHETYPE=B;SCOPE=T. AR role of a business partner. Thin role table — '
    'legal/identity fields on master.business_partner. '
    'Company-specific AR settings (credit, payment, GL) in company_code_customer_profile. '
    'Classifications via commodity_classification bridge.';
COMMENT ON COLUMN master.customer.business_partner_id IS
    'Parent business partner (identity anchor). 1:1 per tenant (one BP can have one customer role).';
COMMENT ON COLUMN master.customer.customer_code IS
    'AR-facing serial code. Format: CUS-{CC}-{seq}. Unique per tenant.';


-- ============================================================================
-- §BP3  master.supplier — AP role of a business partner
-- Thin role table. Identity/legal fields on business_partner.
-- Company-specific AP settings (payment terms, banking, GL) in company_code_supplier_profile.
-- ============================================================================

CREATE TABLE master.supplier (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- BP link (role anchor)
    business_partner_id  uuid     NOT NULL,

    -- Role code (serial per tenant, format: SUP-{CC}-{seq})
    supplier_code        text     NOT NULL,

    -- AP role attributes
    supplier_type        text     NOT NULL DEFAULT 'general',
        -- 'general' | 'contractor' | 'manufacturer' | 'service' | 'utility' | 'intercompany'
    account_manager_id   uuid,
    spend_category_id    uuid,
    payment_term_id      uuid,
    payment_method_id    uuid,
    is_payment_ready         boolean  NOT NULL DEFAULT false,
    payment_ready_at         timestamptz,
    payment_ready_by         uuid,
    payment_ready_reason     text,
    anticipated_risk_tier    text,

    -- Metadata
    metadata             jsonb    NOT NULL DEFAULT '{}'::jsonb,

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

    CONSTRAINT supplier_pkey              PRIMARY KEY (id),
    CONSTRAINT supplier_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT supplier_tenant_code_uq    UNIQUE (tenant_id, supplier_code),
    CONSTRAINT supplier_bp_uq            UNIQUE (tenant_id, business_partner_id),
    CONSTRAINT supplier_code_nonempty     CHECK (btrim(supplier_code) <> ''),
    CONSTRAINT supplier_type_chk          CHECK (supplier_type IN (
                                              'general', 'contractor', 'manufacturer',
                                              'service', 'utility', 'intercompany')),
    CONSTRAINT supplier_status_chk        CHECK (status IN (
                                              'onboarding', 'active', 'on_hold',
                                              'suspended', 'inactive', 'archived'))
);

CREATE INDEX IF NOT EXISTS supp_tenant_idx
    ON master.supplier (tenant_id);
CREATE INDEX IF NOT EXISTS supp_bp_idx
    ON master.supplier (tenant_id, business_partner_id);
CREATE INDEX IF NOT EXISTS supp_active_pidx
    ON master.supplier (tenant_id, supplier_code)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS supp_type_idx
    ON master.supplier (tenant_id, supplier_type);

COMMENT ON TABLE master.supplier IS
    'ARCHETYPE=B;SCOPE=T. AP role of a business partner. Thin role table — '
    'legal/identity fields on master.business_partner. '
    'Company-specific AP settings (payment, banking, GL) in company_code_supplier_profile. '
    'Classifications via commodity_classification bridge.';
COMMENT ON COLUMN master.supplier.business_partner_id IS
    'Parent business partner (identity anchor). 1:1 per tenant (one BP can have one supplier role).';
COMMENT ON COLUMN master.supplier.supplier_code IS
    'AP-facing serial code. Format: SUP-{CC}-{seq}. Unique per tenant.';
COMMENT ON COLUMN master.supplier.payment_term_id IS
    'Default payment term for AP invoices. Can be overridden per company_code_supplier_profile.';
COMMENT ON COLUMN master.supplier.payment_method_id IS
    'Default payment method. Can be overridden per company_code_supplier_profile.';


-- ============================================================================
-- §BP4  master.company_code_customer_profile — company-specific AR settings per customer
-- One row per (customer, company_code). SAP KNB1 equivalent.
-- ============================================================================

CREATE TABLE master.company_code_customer_profile (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Parent references
    customer_id      uuid         NOT NULL,
    company_code_id  uuid         NOT NULL,

    -- AR settings
    credit_limit               numeric(18,4),
    credit_limit_currency_code char(3),
    credit_rating              text,
    is_blocked                 boolean  NOT NULL DEFAULT false,
    block_reason               text,

    -- AR accounting
    default_accounting_profile_id  uuid,
    tax_group_id                   uuid,
    default_receipt_method_id      uuid,
    default_dimension_set_id       uuid,

    -- AR workflow
    payment_term_id                uuid,
    currency_code                  char(3),
    statement_cycle_code           text,
    dunning_policy_id              uuid,

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

    CONSTRAINT ccp_pkey                            PRIMARY KEY (id),
    CONSTRAINT ccp_tenant_id_uq                    UNIQUE (tenant_id, id),
    CONSTRAINT ccp_customer_company_uq             UNIQUE (tenant_id, customer_id, company_code_id),
    CONSTRAINT ccp_credit_nonneg                   CHECK (credit_limit IS NULL OR credit_limit >= 0),
    CONSTRAINT ccp_block_reason_chk                CHECK (NOT is_blocked OR block_reason IS NOT NULL),
    CONSTRAINT ccp_status_chk                      CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT ccp_credit_limit_currency_fmt_chk   CHECK (credit_limit_currency_code IS NULL
                                                          OR credit_limit_currency_code ~ '^[A-Z]{3}$'),
    CONSTRAINT ccp_credit_limit_currency_req_chk   CHECK (credit_limit IS NULL
                                                          OR credit_limit_currency_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ccp_customer_idx
    ON master.company_code_customer_profile (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS ccp_company_idx
    ON master.company_code_customer_profile (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS ccp_active_pidx
    ON master.company_code_customer_profile (tenant_id, company_code_id)
    WHERE is_active = true;

COMMENT ON TABLE master.company_code_customer_profile IS
    'ARCHETYPE=B;SCOPE=T. Company-specific AR settings per customer. '
    'One customer can have different credit limits, payment terms, and GL accounts per company_code. '
    'SAP KNB1 equivalent.';
COMMENT ON COLUMN master.company_code_customer_profile.default_accounting_profile_id IS
    'FK to master.accounting_profile. AP postings resolve via posting roles. '
    'Supersedes ar_gl_account_id.';
COMMENT ON COLUMN master.company_code_customer_profile.default_receipt_method_id IS
    'Default collection/receipt method. Direction must be INBOUND or BOTH.';


-- ============================================================================
-- §BP5  master.company_code_supplier_profile — company-specific AP settings per supplier
-- One row per (supplier, company_code). SAP LFB1 equivalent.
-- ============================================================================

CREATE TABLE master.company_code_supplier_profile (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Parent references
    supplier_id      uuid         NOT NULL,
    company_code_id  uuid         NOT NULL,

    -- AP settings
    is_blocked       boolean      NOT NULL DEFAULT false,
    block_reason     text,
    currency_code    char(3),

    -- AP accounting
    default_accounting_profile_id      uuid,
    payment_term_id                    uuid,
    payment_method_id                  uuid,
    preferred_remittance_bank_link_id  uuid,
    tax_group_id                       uuid,
    default_wht_tax_group_id           uuid,
    default_dimension_set_id           uuid,

    -- AP workflow anchors
    invoice_hold_policy_id             uuid,

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

    CONSTRAINT scp_pkey                    PRIMARY KEY (id),
    CONSTRAINT scp_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT scp_supplier_company_uq     UNIQUE (tenant_id, supplier_id, company_code_id),
    CONSTRAINT scp_block_reason_chk        CHECK (NOT is_blocked OR block_reason IS NOT NULL),
    CONSTRAINT scp_status_chk              CHECK (status IN ('active', 'inactive', 'archived'))
);

CREATE INDEX IF NOT EXISTS scp_supplier_idx
    ON master.company_code_supplier_profile (tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS scp_company_idx
    ON master.company_code_supplier_profile (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS scp_active_pidx
    ON master.company_code_supplier_profile (tenant_id, company_code_id)
    WHERE is_active = true;

COMMENT ON TABLE master.company_code_supplier_profile IS
    'ARCHETYPE=B;SCOPE=T. Company-specific AP settings per supplier. '
    'One supplier can have different payment terms, methods, tax defaults, accounting profile, and control gates per company_code. '
    'SAP LFB1 equivalent.';
COMMENT ON COLUMN master.company_code_supplier_profile.default_accounting_profile_id IS
    'FK to master.accounting_profile. AP postings resolve via posting roles. '
    'Supplier-specific GL exceptions live in company_code_supplier_posting_override.';
COMMENT ON COLUMN master.company_code_supplier_profile.payment_method_id IS
    'FK to master.payment_method. Direction must be OUTBOUND or BOTH.';
COMMENT ON COLUMN master.company_code_supplier_profile.preferred_remittance_bank_link_id IS
    'FK to master.bank_account_link. Must belong to same supplier and compatible company scope.';
COMMENT ON COLUMN master.company_code_supplier_profile.default_wht_tax_group_id IS
    'FK to control.tax_group. Group should contain WHT components only.';


-- ============================================================================
-- BP6  master.company_code_supplier_spend_policy
-- Per-spend-category sourcing, qualification, PO, and invoice eligibility for a
-- supplier inside one company-code extension.
-- ============================================================================

CREATE TABLE master.company_code_supplier_spend_policy (
    -- Identity
    id                    uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid         NOT NULL,

    -- Scope
    supplier_profile_id   uuid         NOT NULL,
    spend_category_id     uuid         NOT NULL,

    -- Eligibility controls
    mapping_mode          text         NOT NULL DEFAULT 'ALLOW',
    sourcing_status       text         NOT NULL DEFAULT 'allowed',
    qualification_status  text         NOT NULL DEFAULT 'pending',
    po_status             text         NOT NULL DEFAULT 'allowed',
    invoice_status        text         NOT NULL DEFAULT 'allowed',

    -- Validity and limits
    valid_from            date,
    valid_until           date,
    max_po_amount         numeric(18,4),
    max_po_currency_code  char(3),

    -- Preference
    is_preferred_supplier boolean      NOT NULL DEFAULT false,
    notes                 text,

    -- Metadata
    metadata              jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                text         NOT NULL DEFAULT 'active',
    is_active             boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,

    -- Audit
    created_at            timestamptz  NOT NULL DEFAULT now(),
    created_by            uuid         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT csspo_pkey                   PRIMARY KEY (id),
    CONSTRAINT csspo_tenant_id_uq           UNIQUE (tenant_id, id),
    CONSTRAINT csspo_profile_category_uq    UNIQUE (tenant_id, supplier_profile_id, spend_category_id),
    CONSTRAINT csspo_mapping_mode_chk       CHECK (mapping_mode IN ('ALLOW', 'DENY')),
    CONSTRAINT csspo_sourcing_chk           CHECK (sourcing_status IN ('allowed', 'restricted', 'blocked')),
    CONSTRAINT csspo_po_chk                 CHECK (po_status IN ('allowed', 'restricted', 'blocked')),
    CONSTRAINT csspo_invoice_chk            CHECK (invoice_status IN ('allowed', 'restricted', 'blocked')),
    CONSTRAINT csspo_qual_chk               CHECK (qualification_status IN ('qualified', 'pending', 'expired', 'waived')),
    CONSTRAINT csspo_max_po_nonneg          CHECK (max_po_amount IS NULL OR max_po_amount >= 0),
    CONSTRAINT csspo_max_po_currency_req    CHECK (max_po_amount IS NULL OR max_po_currency_code IS NOT NULL),
    CONSTRAINT csspo_validity_chk           CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT csspo_status_chk             CHECK (status IN ('active', 'inactive', 'archived'))
);

COMMENT ON TABLE master.company_code_supplier_spend_policy IS
    'ARCHETYPE=B;SCOPE=T. Per-spend-category sourcing + PO + invoice eligibility for a supplier within a company code. '
    'mapping_mode=DENY blocks regardless of parent ALLOW. '
    'Resolution: company_code_spend_policy -> company_code_supplier_spend_policy -> transaction validation.';


-- ============================================================================
-- BP7  master.company_code_supplier_intent_policy
-- Per-business-intent sourcing, PO, and invoice eligibility for a supplier
-- inside one company-code extension.
-- ============================================================================

CREATE TABLE master.company_code_supplier_intent_policy (
    -- Identity
    id                    uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid         NOT NULL,

    -- Scope
    supplier_profile_id   uuid         NOT NULL,
    business_intent_id    uuid         NOT NULL,

    -- Eligibility controls
    mapping_mode          text         NOT NULL DEFAULT 'ALLOW',
    is_default            boolean      NOT NULL DEFAULT false,
    is_sourcing_allowed   boolean      NOT NULL DEFAULT true,
    is_po_allowed         boolean      NOT NULL DEFAULT true,
    is_invoice_allowed    boolean      NOT NULL DEFAULT true,

    -- Metadata
    metadata              jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                text         NOT NULL DEFAULT 'active',
    is_active             boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,

    -- Audit
    created_at            timestamptz  NOT NULL DEFAULT now(),
    created_by            uuid         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT csip_pkey                   PRIMARY KEY (id),
    CONSTRAINT csip_tenant_id_uq           UNIQUE (tenant_id, id),
    CONSTRAINT csip_profile_intent_uq      UNIQUE (tenant_id, supplier_profile_id, business_intent_id),
    CONSTRAINT csip_mapping_mode_chk       CHECK (mapping_mode IN ('ALLOW', 'DENY')),
    CONSTRAINT csip_deny_not_default_chk   CHECK (mapping_mode <> 'DENY' OR is_default = false),
    CONSTRAINT csip_status_chk             CHECK (status IN ('active', 'inactive', 'archived'))
);

COMMENT ON TABLE master.company_code_supplier_intent_policy IS
    'ARCHETYPE=B;SCOPE=T. Per-business-intent invoice, PO, and sourcing eligibility for a supplier within a company code. '
    'Sits below company_code_intent_policy in the resolution stack. DENY overrides all.';


-- ============================================================================
-- BP8  master.company_code_supplier_posting_override
-- Exceptional GL overrides for specific posting roles at supplier-company level.
-- ============================================================================

CREATE TABLE master.company_code_supplier_posting_override (
    -- Identity
    id                    uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid         NOT NULL,

    -- Scope
    supplier_profile_id   uuid         NOT NULL,

    -- Posting role override
    posting_role_code     text         NOT NULL,
    gl_account_id         uuid         NOT NULL,
    book_code             text         NOT NULL DEFAULT 'PRIMARY',

    -- Effective dating
    effective_from        date         NOT NULL DEFAULT CURRENT_DATE,
    effective_to          date,

    -- Explanation
    reason                text,

    -- Metadata
    metadata              jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                text         NOT NULL DEFAULT 'active',
    is_active             boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,

    -- Audit
    created_at            timestamptz  NOT NULL DEFAULT now(),
    created_by            uuid         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT cspo_pkey                  PRIMARY KEY (id),
    CONSTRAINT cspo_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT cspo_posting_role_nonempty CHECK (btrim(posting_role_code) <> ''),
    CONSTRAINT cspo_book_code_nonempty    CHECK (btrim(book_code) <> ''),
    CONSTRAINT cspo_validity_chk          CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT cspo_status_chk            CHECK (status IN ('active', 'inactive', 'archived'))
);

ALTER TABLE master.company_code_supplier_posting_override
    DROP CONSTRAINT IF EXISTS cspo_profile_role_book_temporal_excl;

ALTER TABLE master.company_code_supplier_posting_override
    ADD CONSTRAINT cspo_profile_role_book_temporal_excl
    EXCLUDE USING gist (
        tenant_id           WITH =,
        supplier_profile_id WITH =,
        posting_role_code   WITH =,
        book_code           WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
    ) WHERE (is_active = true);

COMMENT ON TABLE master.company_code_supplier_posting_override IS
    'ARCHETYPE=B;SCOPE=T. Exceptional GL overrides for specific AP posting roles per supplier-company intersection. '
    'Resolution: supplier override -> company posting-role map -> accounting profile entry template fallback. '
    'Only used for non-standard AP account assignments.';
