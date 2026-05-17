-- ============================================================================
-- master/01m_bp_core_hardening.sql
-- BP Core Hardening — 26 findings from comprehensive design review (May 2026)
--
-- Depends on (must run after):
--   01b_tables_finance.sql      (legal_entity, company_code, ledger_book, ccba)
--   01h_tables_business_partner.sql (business_partner, customer, supplier, profiles)
--   01h_tables_supplier_master.sql  (party_identifier, certification, supplier_block,
--                                    party_governance_relation)
--   01i_tables_party_master.sql     (supplier_qualification, business_partner_network_link,
--                                    legal_entity_business_partner_link)
--   01j_tables_intercompany.sql     (intercompany_trading_pair)
--
-- Finding codes:
--   C1–C6  : Critical
--   H1–H12 : High
--   M1–M7  : Medium
--   N1–N3  : Network integration
-- ============================================================================


-- ============================================================================
-- SECTION A — ALTER TABLE: additive columns & constraint fixes
-- ============================================================================

-- ─── C3: legal_entity — consolidation_method/ownership_pct cross-field guard ──
-- equity_method / proportional consolidation requires an ownership percentage.
DO $$ BEGIN
    ALTER TABLE master.legal_entity
        ADD CONSTRAINT legal_entity_consolidation_ownership_chk
        CHECK (consolidation_method = 'full' OR ownership_pct IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── C5: company_code — add reporting_currency + group_currency ───────────────
-- reporting_currency: NULL = inherit from legal_entity.reporting_currency
-- group_currency    : hard currency for parallel valuation (e.g. USD peg); NULL = N/A
ALTER TABLE master.company_code
    ADD COLUMN IF NOT EXISTS reporting_currency char(3),
    ADD COLUMN IF NOT EXISTS group_currency     char(3);

COMMENT ON COLUMN master.company_code.reporting_currency IS
    'Group / consolidation reporting currency. NULL = inherit from legal_entity.reporting_currency. '
    'Explicit value required for company codes that report in a currency different from their LE.';
COMMENT ON COLUMN master.company_code.group_currency IS
    'Hard currency for parallel valuation (e.g. USD peg for HK subsidiaries). NULL = not applicable.';

-- ─── H3: legal_entity — add materialized path + level for hierarchy traversal ──
ALTER TABLE master.legal_entity
    ADD COLUMN IF NOT EXISTS level_no smallint NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS path     text;

COMMENT ON COLUMN master.legal_entity.level_no IS
    'Depth in the consolidation hierarchy (1 = root / top-level entity). '
    'Maintained by trigger trg_le_hierarchy_path_sync.';
COMMENT ON COLUMN master.legal_entity.path IS
    'Materialized ancestor path: ''/root-id/parent-id/self-id''. '
    'Enables O(1) subtree queries. Maintained by trigger trg_le_hierarchy_path_sync.';

-- ─── H3: business_partner — add materialized path + level for group hierarchy ──
ALTER TABLE master.business_partner
    ADD COLUMN IF NOT EXISTS level_no smallint NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS path     text;

COMMENT ON COLUMN master.business_partner.level_no IS
    'Depth in the corporate group hierarchy (1 = root / holding). '
    'Maintained by trigger trg_bp_hierarchy_path_sync.';
COMMENT ON COLUMN master.business_partner.path IS
    'Materialized ancestor path: ''/root-id/parent-id/self-id''. '
    'Maintained by trigger trg_bp_hierarchy_path_sync.';

-- ─── H4: party_identifier — DB-level format checks for known schemes ──────────
-- These complement the trigger-based validation and survive trigger bypass.
DO $$ BEGIN
    ALTER TABLE master.party_identifier
        ADD CONSTRAINT pi_duns_fmt_chk
            CHECK (scheme <> 'duns'      OR value ~ '^\d{9}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.party_identifier
        ADD CONSTRAINT pi_lei_fmt_chk
            CHECK (scheme <> 'lei'       OR (length(value) = 20 AND value ~ '^[A-Z0-9]{20}$'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.party_identifier
        ADD CONSTRAINT pi_gln_fmt_chk
            CHECK (scheme <> 'gln'       OR value ~ '^\d{13}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.party_identifier
        ADD CONSTRAINT pi_peppol_fmt_chk
            CHECK (scheme <> 'peppol_id' OR value ~ '^\d{4}:.+$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── M2: certification — add FK-level scope columns ─────────────────────────
-- Allows a certificate to be scoped to a specific company_code or physical site.
-- NULL = certificate applies to the entire owner entity (existing behaviour).
ALTER TABLE master.certification
    ADD COLUMN IF NOT EXISTS company_code_id uuid,
    ADD COLUMN IF NOT EXISTS site_id         uuid;

COMMENT ON COLUMN master.certification.company_code_id IS
    'Optional: restricts certificate scope to one company code. '
    'NULL = applies to the entire owner party.';
COMMENT ON COLUMN master.certification.site_id IS
    'Optional: restricts certificate scope to one physical site (e.g. ISO 9001 for Jakarta plant). '
    'NULL = applies to the entire owner party.';

-- ─── H12: company_code_customer_profile — drop deprecated ar_gl_account_id ───
-- Column is removed from CREATE TABLE in 01h (fresh installs). For existing DBs:
ALTER TABLE master.company_code_customer_profile
    DROP COLUMN IF EXISTS ar_gl_account_id;

-- ─── C1: business_partner_network_link — fix global uniqueness on network account
-- The original UNIQUE(provider_code, network_account_id) was NOT tenant-scoped,
-- blocking two tenants from linking to the same external Peppol/Ariba account.
-- Replace with: cross-tenant uniqueness only for VERIFIED accounts (prevents
-- identity hijacking while allowing multiple unverified tenant links).
ALTER TABLE master.business_partner_network_link
    DROP CONSTRAINT IF EXISTS bpnl_provider_account_uq;

CREATE UNIQUE INDEX IF NOT EXISTS bpnl_verified_account_uidx
    ON master.business_partner_network_link (provider_code, network_account_id)
    WHERE verification_status = 'verified';

-- ─── M7: business_partner_network_link — drop audit_pair_chk ─────────────────
-- trg_set_updated_at() sets updated_by to NULL in seed context, making this
-- constraint un-enforceable (same root cause as ictp_audit_pair_chk removal).
ALTER TABLE master.business_partner_network_link
    DROP CONSTRAINT IF EXISTS bpnl_audit_pair_chk;

-- ─── N2: business_partner_network_link — add invitation tracking fields ───────
-- Required for the athyper_network invite-to-connect flow.
ALTER TABLE master.business_partner_network_link
    ADD COLUMN IF NOT EXISTS invitation_token      text,
    ADD COLUMN IF NOT EXISTS invitation_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS invitation_message    text;

COMMENT ON COLUMN master.business_partner_network_link.invitation_token IS
    'One-time token sent to the invitee. Cleared when connection_status transitions '
    'to ''connected'' or ''suspended'' by trigger trg_network_connect_validation.';
COMMENT ON COLUMN master.business_partner_network_link.invitation_expires_at IS
    'Expiry timestamp for the invitation token. Application must reject stale tokens.';


-- ============================================================================
-- SECTION B — New tables
-- ============================================================================

-- ─── H6: master.network_provider — extensible provider registry ───────────────
-- Replaces hardcoded CHECK enum on business_partner_network_link.provider_code.
-- Platform-seeded codes match the existing CHECK values; FK added below.
CREATE TABLE IF NOT EXISTS master.network_provider (
    code             text        NOT NULL,
    name             text        NOT NULL,
    network_type     text        NOT NULL DEFAULT 'b2b_portal',
        -- 'b2b_portal' | 'e_invoicing' | 'procurement_network' | 'payment_network' | 'custom'
    is_platform      boolean     NOT NULL DEFAULT false,
    participant_id_pattern text,           -- regex for network_account_id format validation
    website_url      text,
    description      text,

    -- Audit
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT np_pkey             PRIMARY KEY (code),
    CONSTRAINT np_code_nonempty    CHECK (btrim(code) <> ''),
    CONSTRAINT np_name_nonempty    CHECK (btrim(name) <> ''),
    CONSTRAINT np_network_type_chk CHECK (network_type IN (
                                       'b2b_portal', 'e_invoicing',
                                       'procurement_network', 'payment_network', 'custom'))
);

-- Migrate existing hardcoded provider values into the registry.
-- ON CONFLICT DO NOTHING makes this idempotent.
INSERT INTO master.network_provider (code, name, network_type, is_platform, participant_id_pattern) VALUES
    ('athyper_network', 'Athyper Business Network',        'b2b_portal',          true,  NULL),
    ('peppol',          'Peppol e-Invoicing Network',      'e_invoicing',         true,  '^\d{4}:.+$'),
    ('ariba',           'SAP Business Network (Ariba)',    'procurement_network', true,  NULL),
    ('tradeshift',      'Tradeshift Network',              'b2b_portal',          true,  NULL),
    ('edi_x12',         'EDI X12 (ANSI ASC X12)',          'b2b_portal',          true,  NULL),
    ('custom',          'Custom / Other Network',          'custom',              false, NULL)
ON CONFLICT (code) DO NOTHING;

-- Drop the hardcoded CHECK now that the FK to network_provider will enforce values.
ALTER TABLE master.business_partner_network_link
    DROP CONSTRAINT IF EXISTS bpnl_provider_code_chk;

COMMENT ON TABLE master.network_provider IS
    'ARCHETYPE=A;SCOPE=P. Extensible registry of B2B network providers. '
    'Platform-seeded (is_platform=true): athyper_network, peppol, ariba, tradeshift, custom. '
    'Tenant-added providers: INSERT a new row (is_platform=false). '
    'Replaces hardcoded CHECK constraint on business_partner_network_link.provider_code.';


-- ─── H1: master.customer_block — temporal block history for customers ─────────
-- Mirrors master.supplier_block. Source of truth for customer credit/AR blocks.
-- is_active is computed: true while lifted_at IS NULL (block still in effect).
CREATE TABLE IF NOT EXISTS master.customer_block (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    customer_id     uuid        NOT NULL,

    -- Block details
    block_type      text        NOT NULL,
        -- 'credit' | 'invoice' | 'collection' | 'delivery' | 'all'
    block_reason    text        NOT NULL,
    blocked_at      timestamptz NOT NULL DEFAULT now(),
    blocked_by      uuid,

    -- Lift (set when block is removed)
    lifted_at       timestamptz,
    lifted_by       uuid,
    lift_reason     text,

    -- Computed active flag
    is_active       boolean     GENERATED ALWAYS AS (lifted_at IS NULL) STORED,

    -- Metadata
    notes           text,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'active',
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT cb_pkey              PRIMARY KEY (id),
    CONSTRAINT cb_tenant_uq         UNIQUE (tenant_id, id),
    CONSTRAINT cb_reason_nonempty   CHECK (btrim(block_reason) <> ''),
    CONSTRAINT cb_block_type_chk    CHECK (block_type IN ('credit', 'invoice', 'collection', 'delivery', 'all')),
    CONSTRAINT cb_lift_order_chk    CHECK (lifted_at IS NULL OR lifted_at >= blocked_at),
    CONSTRAINT cb_lift_reason_chk   CHECK (lifted_at IS NULL OR lift_reason IS NOT NULL),
    CONSTRAINT cb_status_chk        CHECK (status IN ('active', 'lifted'))
);

CREATE INDEX IF NOT EXISTS cb_customer_idx
    ON master.customer_block (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS cb_active_idx
    ON master.customer_block (tenant_id, customer_id)
    WHERE is_active = true;

COMMENT ON TABLE master.customer_block IS
    'ARCHETYPE=B;SCOPE=T. Credit / AR blocks placed on a customer. '
    'block_type: credit | invoice | collection | delivery | all. '
    'is_active=true while lifted_at IS NULL. Mirrors master.supplier_block pattern. '
    'Source of truth for company_code_customer_profile.is_blocked sync (trigger).';
COMMENT ON COLUMN master.customer_block.is_active IS
    'Computed: true while lifted_at IS NULL. Lift = set lifted_at + lifted_by + lift_reason.';


-- H7: legacy role tax profiles -> master.party_tax_profile
-- Tax registrations are BP-owned in master.party_tax_profile. Supplier and
-- customer roles read that table through their parent business_partner_id.
DO $$
DECLARE
    v_unmapped_count integer;
BEGIN
    IF to_regclass('master.supplier_tax_profile') IS NOT NULL THEN
        EXECUTE $migrate_supplier_tax$
            INSERT INTO master.party_tax_profile (
                id,
                tenant_id,
                owner_type,
                owner_id,
                country_code,
                penalty_information,
                discount_information,
                global_location_number,
                tax_classification,
                taxation_type,
                tax_id,
                state_tax_id,
                sales_tax_id,
                service_tax_id,
                regional_tax_id,
                vat_id,
                vat_registered,
                vat_registration_doc_id,
                has_tax_clearance,
                tax_clearance_number,
                tax_clearance_doc_id,
                tax_clearance_expiry_date,
                metadata,
                status,
                status_changed_at,
                status_changed_by,
                created_at,
                created_by,
                updated_at,
                updated_by
            )
            SELECT
                stp.id,
                stp.tenant_id,
                'business_partner',
                s.business_partner_id,
                stp.country_code,
                stp.penalty_information,
                stp.discount_information,
                stp.global_location_number,
                stp.tax_classification,
                stp.taxation_type,
                stp.tax_id,
                stp.state_tax_id,
                stp.sales_tax_id,
                stp.service_tax_id,
                stp.regional_tax_id,
                stp.vat_id,
                stp.vat_registered,
                stp.vat_registration_doc_id,
                stp.has_tax_clearance,
                stp.tax_clearance_number,
                stp.tax_clearance_doc_id,
                stp.tax_clearance_expiry_date,
                COALESCE(stp.metadata, '{}'::jsonb),
                stp.status,
                stp.status_changed_at,
                stp.status_changed_by,
                stp.created_at,
                stp.created_by,
                stp.updated_at,
                stp.updated_by
            FROM master.supplier_tax_profile stp
            JOIN master.supplier s
              ON s.tenant_id = stp.tenant_id
             AND s.id        = stp.supplier_id
            WHERE s.business_partner_id IS NOT NULL
            ON CONFLICT DO NOTHING
        $migrate_supplier_tax$;

        EXECUTE $count_supplier_tax$
            SELECT count(*)
            FROM master.supplier_tax_profile stp
            LEFT JOIN master.supplier s
              ON s.tenant_id = stp.tenant_id
             AND s.id        = stp.supplier_id
            WHERE s.business_partner_id IS NULL
        $count_supplier_tax$
        INTO v_unmapped_count;

        IF v_unmapped_count = 0 THEN
            EXECUTE 'DROP TABLE IF EXISTS master.supplier_tax_profile CASCADE';
        ELSE
            RAISE WARNING
                'Keeping master.supplier_tax_profile: % row(s) could not be mapped to business_partner_id.',
                v_unmapped_count;
        END IF;
    END IF;

    IF to_regclass('master.customer_tax_profile') IS NOT NULL THEN
        EXECUTE $migrate_customer_tax$
            INSERT INTO master.party_tax_profile (
                id,
                tenant_id,
                owner_type,
                owner_id,
                country_code,
                penalty_information,
                discount_information,
                global_location_number,
                tax_classification,
                taxation_type,
                tax_id,
                state_tax_id,
                sales_tax_id,
                service_tax_id,
                regional_tax_id,
                vat_id,
                vat_registered,
                vat_registration_doc_id,
                has_tax_clearance,
                tax_clearance_number,
                tax_clearance_doc_id,
                tax_clearance_expiry_date,
                metadata,
                status,
                status_changed_at,
                status_changed_by,
                created_at,
                created_by,
                updated_at,
                updated_by
            )
            SELECT
                ctp.id,
                ctp.tenant_id,
                'business_partner',
                c.business_partner_id,
                ctp.country_code,
                ctp.penalty_information,
                ctp.discount_information,
                ctp.global_location_number,
                ctp.tax_classification,
                ctp.taxation_type,
                ctp.tax_id,
                ctp.state_tax_id,
                ctp.sales_tax_id,
                ctp.service_tax_id,
                ctp.regional_tax_id,
                ctp.vat_id,
                ctp.vat_registered,
                ctp.vat_registration_doc_id,
                ctp.has_tax_clearance,
                ctp.tax_clearance_number,
                ctp.tax_clearance_doc_id,
                ctp.tax_clearance_expiry_date,
                COALESCE(ctp.metadata, '{}'::jsonb),
                ctp.status,
                ctp.status_changed_at,
                ctp.status_changed_by,
                ctp.created_at,
                ctp.created_by,
                ctp.updated_at,
                ctp.updated_by
            FROM master.customer_tax_profile ctp
            JOIN master.customer c
              ON c.tenant_id = ctp.tenant_id
             AND c.id        = ctp.customer_id
            WHERE c.business_partner_id IS NOT NULL
            ON CONFLICT DO NOTHING
        $migrate_customer_tax$;

        EXECUTE $count_customer_tax$
            SELECT count(*)
            FROM master.customer_tax_profile ctp
            LEFT JOIN master.customer c
              ON c.tenant_id = ctp.tenant_id
             AND c.id        = ctp.customer_id
            WHERE c.business_partner_id IS NULL
        $count_customer_tax$
        INTO v_unmapped_count;

        IF v_unmapped_count = 0 THEN
            EXECUTE 'DROP TABLE IF EXISTS master.customer_tax_profile CASCADE';
        ELSE
            RAISE WARNING
                'Keeping master.customer_tax_profile: % row(s) could not be mapped to business_partner_id.',
                v_unmapped_count;
        END IF;
    END IF;
END $$;

-- ─── H11 retired: BP service coverage moved to Business Network ──────────────
-- Geographic/service coverage is no longer part of the BP master profile.
-- Future coverage/capability modelling belongs under network/provider capability.
DROP TABLE IF EXISTS master.party_service_coverage CASCADE;
DROP TABLE IF EXISTS master.supplier_service_coverage CASCADE;

-- M1: master.business_partner_relation - general commercial relationships
-- Covers distributor/agent/JV/consortium links that intercompany_trading_pair
-- does not address (no company-code-level routing needed).
CREATE TABLE IF NOT EXISTS master.business_partner_relation (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Directional pair
    from_bp_id      uuid        NOT NULL,   -- FK → business_partner
    to_bp_id        uuid        NOT NULL,   -- FK → business_partner

    -- Relation type
    relation_type   text        NOT NULL,
        -- 'distributor_of' | 'agent_of' | 'subsidiary_of' | 'consortium_member_of'
        -- | 'reseller_of' | 'jv_partner_of' | 'custom'
    custom_type     text,                   -- required when relation_type = 'custom'
    direction       text        NOT NULL DEFAULT 'directional',
        -- 'directional' (A → B) | 'bidirectional' (A ↔ B)

    -- Scope
    country_scope   char(2)[],              -- NULL = global; array of ISO-3166 alpha-2
    product_scope   text,                   -- free-text category / product line scope

    -- Validity
    effective_from  date,
    effective_until date,

    notes           text,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT bpr_pkey                 PRIMARY KEY (id),
    CONSTRAINT bpr_tenant_uq            UNIQUE (tenant_id, id),
    CONSTRAINT bpr_from_to_type_uq      UNIQUE (tenant_id, from_bp_id, to_bp_id, relation_type),
    CONSTRAINT bpr_no_self_relation     CHECK (from_bp_id IS DISTINCT FROM to_bp_id),
    CONSTRAINT bpr_relation_type_chk    CHECK (relation_type IN (
                                            'distributor_of', 'agent_of', 'subsidiary_of',
                                            'consortium_member_of', 'reseller_of',
                                            'jv_partner_of', 'custom')),
    CONSTRAINT bpr_custom_type_req      CHECK (relation_type <> 'custom' OR custom_type IS NOT NULL),
    CONSTRAINT bpr_direction_chk        CHECK (direction IN ('directional', 'bidirectional')),
    CONSTRAINT bpr_effective_order_chk  CHECK (effective_until IS NULL
                                            OR effective_from IS NULL
                                            OR effective_until >= effective_from),
    CONSTRAINT bpr_status_chk          CHECK (status IN (
                                            'active', 'inactive', 'expired', 'terminated'))
);

CREATE INDEX IF NOT EXISTS bpr_from_bp_idx
    ON master.business_partner_relation (tenant_id, from_bp_id);
CREATE INDEX IF NOT EXISTS bpr_to_bp_idx
    ON master.business_partner_relation (tenant_id, to_bp_id);
CREATE INDEX IF NOT EXISTS bpr_type_idx
    ON master.business_partner_relation (tenant_id, relation_type);
CREATE INDEX IF NOT EXISTS bpr_active_pidx
    ON master.business_partner_relation (tenant_id, from_bp_id, to_bp_id)
    WHERE is_active = true;

COMMENT ON TABLE master.business_partner_relation IS
    'ARCHETYPE=B;SCOPE=T. General commercial relationship between two business partners. '
    'Covers distributor/agent/JV/consortium/reseller links not handled by '
    'master.intercompany_trading_pair (which requires company-code routing). '
    'direction=bidirectional means one row covers both directions (A ↔ B). '
    'country_scope=NULL means global coverage.';


-- ─── M4: master.supplier_spend_category — multi-category bridge per supplier ──
-- supplier.commodity_category_id holds the primary / dominant category.
-- This table allows a supplier to be approved for multiple commodity categories
-- at the tenant level, before company-code-specific eligibility (company_code_supplier_spend_policy).
CREATE TABLE IF NOT EXISTS master.supplier_spend_category (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    supplier_id       uuid        NOT NULL,   -- FK → master.supplier
    commodity_category_id uuid    NOT NULL,   -- FK → master.commodity_category
    is_primary        boolean     NOT NULL DEFAULT false,
    effective_from    date,
    effective_until   date,
    notes             text,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT sscat_pkey                   PRIMARY KEY (id),
    CONSTRAINT sscat_tenant_uq              UNIQUE (tenant_id, id),
    CONSTRAINT sscat_supplier_category_uq   UNIQUE (tenant_id, supplier_id, commodity_category_id),
    CONSTRAINT sscat_effective_order_chk    CHECK (effective_until IS NULL
                                                OR effective_from IS NULL
                                                OR effective_until >= effective_from),
    CONSTRAINT sscat_status_chk             CHECK (status IN ('active', 'inactive'))
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'master' AND table_name = 'supplier_spend_category'
          AND column_name = 'spend_category_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'master' AND table_name = 'supplier_spend_category'
          AND column_name = 'commodity_category_id'
    ) THEN
        ALTER TABLE master.supplier_spend_category RENAME COLUMN spend_category_id TO commodity_category_id;
    END IF;
END $$;

-- At most one primary category per supplier (active only).
CREATE UNIQUE INDEX IF NOT EXISTS sscat_one_primary_uidx
    ON master.supplier_spend_category (tenant_id, supplier_id)
    WHERE is_primary = true AND status = 'active';

CREATE INDEX IF NOT EXISTS sscat_supplier_idx
    ON master.supplier_spend_category (tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS sscat_category_idx
    ON master.supplier_spend_category (tenant_id, commodity_category_id);

COMMENT ON TABLE master.supplier_spend_category IS
    'ARCHETYPE=B;SCOPE=T. Tenant-level commodity category memberships per supplier. '
    'Allows a supplier to be approved for multiple commodity categories before '
    'company-code eligibility is configured via company_code_supplier_spend_policy. '
    'is_primary: matches supplier.commodity_category_id (the dominant category). '
    'Enforced at most one active primary per supplier.';


-- ─── N3: master.business_partner_network_capability — e-invoice routing profiles
-- Records which document types and BIS profiles a network participant supports.
-- Required for Peppol 4-corner routing and e-invoicing mandate compliance.
CREATE TABLE IF NOT EXISTS master.business_partner_network_capability (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    business_partner_id     uuid        NOT NULL,   -- FK → business_partner
    provider_code           text        NOT NULL,   -- FK → network_provider.code

    -- Document capability
    document_type_id        text        NOT NULL,
        -- 'invoice' | 'credit_note' | 'order' | 'order_response'
        -- | 'despatch_advice' | 'statement' | 'remittance' | 'custom'
    document_direction      text        NOT NULL DEFAULT 'both',
        -- 'send' | 'receive' | 'both'

    -- BIS / UBL profile
    profile_id              text,       -- e.g. 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'
    profile_version         text,

    -- Status
    is_supported            boolean     NOT NULL DEFAULT true,
    verified_at             timestamptz,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT bpnc_pkey                        PRIMARY KEY (id),
    CONSTRAINT bpnc_tenant_uq                   UNIQUE (tenant_id, id),
    CONSTRAINT bpnc_bp_provider_doctype_dir_uq  UNIQUE (tenant_id, business_partner_id,
                                                        provider_code, document_type_id,
                                                        document_direction),
    CONSTRAINT bpnc_doc_type_chk                CHECK (document_type_id IN (
                                                    'invoice', 'credit_note', 'order',
                                                    'order_response', 'despatch_advice',
                                                    'statement', 'remittance', 'custom')),
    CONSTRAINT bpnc_direction_chk               CHECK (document_direction IN (
                                                    'send', 'receive', 'both'))
);

CREATE INDEX IF NOT EXISTS bpnc_bp_idx
    ON master.business_partner_network_capability (tenant_id, business_partner_id);
CREATE INDEX IF NOT EXISTS bpnc_provider_idx
    ON master.business_partner_network_capability (tenant_id, provider_code);

COMMENT ON TABLE master.business_partner_network_capability IS
    'ARCHETYPE=B;SCOPE=T. Document-type routing capabilities per BP network account. '
    'One row per (BP, provider, document_type, direction). '
    'Required for Peppol 4-corner routing (send/receive capability per document type). '
    'profile_id holds the BIS / UBL profile URN for the supported specification.';


-- ============================================================================
-- SECTION C — FK constraints for new tables
-- ============================================================================

-- customer_block → customer (composite tenant FK)
-- Purge orphaned rows first: if this migration is re-run (--force or after a
-- partial apply), customer_block may contain rows whose customer_id no longer
-- exists in master.customer. ALTER TABLE ADD CONSTRAINT validates all existing
-- rows and raises foreign_key_violation (23503) — not caught by duplicate_object.
DELETE FROM master.customer_block cb
WHERE NOT EXISTS (
    SELECT 1 FROM master.customer c
    WHERE c.tenant_id = cb.tenant_id AND c.id = cb.customer_id
);

DO $$ BEGIN
    ALTER TABLE master.customer_block
        ADD CONSTRAINT cb_customer_fk
        FOREIGN KEY (tenant_id, customer_id)
        REFERENCES master.customer (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- customer_tax_profile retired; tax registrations are enforced on master.party_tax_profile.

-- BP service coverage retired; future coverage/capability belongs to Business Network.

-- business_partner_relation → business_partner (both directions)
-- Purge orphaned rows: master.business_partner is dropped and recreated by 01h.
DELETE FROM master.business_partner_relation bpr
WHERE NOT EXISTS (
    SELECT 1 FROM master.business_partner bp
    WHERE bp.tenant_id = bpr.tenant_id AND bp.id = bpr.from_bp_id
);
DO $$ BEGIN
    ALTER TABLE master.business_partner_relation
        ADD CONSTRAINT bpr_from_bp_fk
        FOREIGN KEY (tenant_id, from_bp_id)
        REFERENCES master.business_partner (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.business_partner_relation
        ADD CONSTRAINT bpr_to_bp_fk
        FOREIGN KEY (tenant_id, to_bp_id)
        REFERENCES master.business_partner (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- supplier_spend_category → supplier
-- Purge orphaned rows: master.supplier is dropped and recreated by 01h.
DELETE FROM master.supplier_spend_category sscat
WHERE NOT EXISTS (
    SELECT 1 FROM master.supplier s
    WHERE s.tenant_id = sscat.tenant_id AND s.id = sscat.supplier_id
);
DO $$ BEGIN
    ALTER TABLE master.supplier_spend_category
        ADD CONSTRAINT sscat_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES master.supplier (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- supplier_spend_category → commodity_category
DO $$ BEGIN
    ALTER TABLE master.supplier_spend_category
        DROP CONSTRAINT IF EXISTS sscat_category_fk;
    ALTER TABLE master.supplier_spend_category
        ADD CONSTRAINT sscat_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- business_partner_network_capability → business_partner
-- Purge orphaned rows: master.business_partner is dropped and recreated by 01h.
DELETE FROM master.business_partner_network_capability bpnc
WHERE NOT EXISTS (
    SELECT 1 FROM master.business_partner bp
    WHERE bp.tenant_id = bpnc.tenant_id AND bp.id = bpnc.business_partner_id
);
DO $$ BEGIN
    ALTER TABLE master.business_partner_network_capability
        ADD CONSTRAINT bpnc_bp_fk
        FOREIGN KEY (tenant_id, business_partner_id)
        REFERENCES master.business_partner (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- business_partner_network_capability → network_provider (no tenant — platform table)
DO $$ BEGIN
    ALTER TABLE master.business_partner_network_capability
        ADD CONSTRAINT bpnc_provider_fk
        FOREIGN KEY (provider_code)
        REFERENCES master.network_provider (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- business_partner_network_link → network_provider (replaces the CHECK enum)
DO $$ BEGIN
    ALTER TABLE master.business_partner_network_link
        ADD CONSTRAINT bpnl_provider_fk
        FOREIGN KEY (provider_code)
        REFERENCES master.network_provider (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- certification → company_code (optional scope)
DO $$ BEGIN
    ALTER TABLE master.certification
        ADD CONSTRAINT cert_company_code_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- certification → site (optional scope)
DO $$ BEGIN
    ALTER TABLE master.certification
        ADD CONSTRAINT cert_site_fk
        FOREIGN KEY (tenant_id, site_id)
        REFERENCES master.site (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION D — Trigger functions
-- ============================================================================

-- ─── C2: BP role category consistency guard ──────────────────────────────────
-- Fires BEFORE INSERT OR UPDATE on customer / supplier.
-- Enforces that partner_category aligns with customer_type / supplier_type.

CREATE OR REPLACE FUNCTION master.fn_customer_category_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_category text;
BEGIN
    SELECT partner_category INTO v_category
    FROM master.business_partner
    WHERE tenant_id = NEW.tenant_id AND id = NEW.business_partner_id;

    CASE v_category
        WHEN 'internal' THEN
            IF NEW.customer_type <> 'intercompany' THEN
                RAISE EXCEPTION
                    'BP partner_category=''internal'' requires customer_type=''intercompany'' '
                    '(got ''%''). Update customer_type or change partner_category.',
                    NEW.customer_type;
            END IF;
        WHEN 'individual' THEN
            IF NEW.customer_type <> 'individual' THEN
                RAISE EXCEPTION
                    'BP partner_category=''individual'' requires customer_type=''individual'' '
                    '(got ''%'').',
                    NEW.customer_type;
            END IF;
        WHEN 'government' THEN
            IF NEW.customer_type <> 'government' THEN
                RAISE EXCEPTION
                    'BP partner_category=''government'' requires customer_type=''government'' '
                    '(got ''%'').',
                    NEW.customer_type;
            END IF;
        ELSE
            NULL; -- 'organization' → any customer_type is valid
    END CASE;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_category_guard ON master.customer;
CREATE TRIGGER trg_customer_category_guard
    BEFORE INSERT OR UPDATE OF customer_type, business_partner_id
    ON master.customer
    FOR EACH ROW EXECUTE FUNCTION master.fn_customer_category_guard();

-- ── supplier side ──
CREATE OR REPLACE FUNCTION master.fn_supplier_category_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_category text;
BEGIN
    SELECT partner_category INTO v_category
    FROM master.business_partner
    WHERE tenant_id = NEW.tenant_id AND id = NEW.business_partner_id;

    IF v_category = 'internal' AND NEW.supplier_type <> 'intercompany' THEN
        RAISE EXCEPTION
            'BP partner_category=''internal'' requires supplier_type=''intercompany'' '
            '(got ''%''). Update supplier_type or change partner_category.',
            NEW.supplier_type;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_category_guard ON master.supplier;
CREATE TRIGGER trg_supplier_category_guard
    BEFORE INSERT OR UPDATE OF supplier_type, business_partner_id
    ON master.supplier
    FOR EACH ROW EXECUTE FUNCTION master.fn_supplier_category_guard();


-- ─── C4: supplier_block → supplier_qualification.is_blocked sync ─────────────
-- supplier_block is the source of truth; supplier_qualification.is_blocked
-- is a materialized denormalization for fast PO validation lookups.
CREATE OR REPLACE FUNCTION master.fn_supplier_block_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_tenant_id  uuid;
    v_supplier_id uuid;
BEGIN
    v_tenant_id   := COALESCE(NEW.tenant_id,   OLD.tenant_id);
    v_supplier_id := COALESCE(NEW.supplier_id, OLD.supplier_id);

    UPDATE master.supplier_qualification sq
    SET is_blocked = EXISTS (
        SELECT 1
        FROM master.supplier_block sb
        WHERE sb.tenant_id   = v_tenant_id
          AND sb.supplier_id = v_supplier_id
          AND sb.block_type  IN ('procurement', 'all')
          AND sb.is_active   = true
    )
    WHERE sq.tenant_id   = v_tenant_id
      AND sq.supplier_id = v_supplier_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_block_sync ON master.supplier_block;
CREATE TRIGGER trg_supplier_block_sync
    AFTER INSERT OR UPDATE OR DELETE ON master.supplier_block
    FOR EACH ROW EXECUTE FUNCTION master.fn_supplier_block_sync();


-- ─── C6: intercompany_trading_pair profile gate ───────────────────────────────
-- An IC pair cannot be activated without the counterparty AP supplier profile.
CREATE OR REPLACE FUNCTION master.fn_ictp_profile_gate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'active' AND NEW.counterparty_supplier_profile_id IS NULL THEN
        RAISE EXCEPTION
            'intercompany_trading_pair (%) cannot be set to active: '
            'counterparty_supplier_profile_id IS NULL. '
            'Create the company_code_supplier_profile for the counterparty first.',
            NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ictp_profile_gate ON master.intercompany_trading_pair;
CREATE TRIGGER trg_ictp_profile_gate
    BEFORE INSERT OR UPDATE OF status, counterparty_supplier_profile_id
    ON master.intercompany_trading_pair
    FOR EACH ROW EXECUTE FUNCTION master.fn_ictp_profile_gate();


-- ─── H2: company_code_book_assignment → company_code.default_ledger_book_id sync
-- Keeps the convenience denormalization in sync with the highest-priority assignment.
CREATE OR REPLACE FUNCTION master.fn_sync_default_ledger_book()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_tenant_id uuid;
    v_cc_id     uuid;
    v_top_book  uuid;
BEGIN
    v_tenant_id := COALESCE(NEW.tenant_id,        OLD.tenant_id);
    v_cc_id     := COALESCE(NEW.company_code_id,  OLD.company_code_id);

    SELECT book_id INTO v_top_book
    FROM master.company_code_book_assignment
    WHERE tenant_id       = v_tenant_id
      AND company_code_id = v_cc_id
      AND status          = 'active'
    ORDER BY priority DESC
    LIMIT 1;

    UPDATE master.company_code
    SET default_ledger_book_id = v_top_book
    WHERE tenant_id = v_tenant_id
      AND id        = v_cc_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_default_ledger_book ON master.company_code_book_assignment;
CREATE TRIGGER trg_sync_default_ledger_book
    AFTER INSERT OR UPDATE OR DELETE ON master.company_code_book_assignment
    FOR EACH ROW EXECUTE FUNCTION master.fn_sync_default_ledger_book();


-- ─── H3a: legal_entity hierarchy cycle guard + path maintenance ───────────────
CREATE OR REPLACE FUNCTION master.fn_le_hierarchy_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_ancestor   uuid;
    v_parent_path text;
    v_parent_level smallint;
BEGIN
    IF NEW.parent_entity_id IS NULL THEN
        NEW.level_no := 1;
        NEW.path     := '/' || NEW.id::text;
        RETURN NEW;
    END IF;

    -- Cycle detection: walk the ancestor chain of the proposed parent.
    v_ancestor := NEW.parent_entity_id;
    WHILE v_ancestor IS NOT NULL LOOP
        IF v_ancestor = NEW.id THEN
            RAISE EXCEPTION
                'Cycle detected in legal_entity hierarchy: entity % would become '
                'its own ancestor via parent %.',
                NEW.id, NEW.parent_entity_id;
        END IF;
        SELECT parent_entity_id INTO v_ancestor
        FROM master.legal_entity
        WHERE tenant_id = NEW.tenant_id AND id = v_ancestor;
    END LOOP;

    -- Compute level and path from parent.
    SELECT level_no, path INTO v_parent_level, v_parent_path
    FROM master.legal_entity
    WHERE tenant_id = NEW.tenant_id AND id = NEW.parent_entity_id;

    NEW.level_no := COALESCE(v_parent_level, 0) + 1;
    NEW.path     := COALESCE(v_parent_path, '') || '/' || NEW.id::text;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_le_hierarchy_sync ON master.legal_entity;
CREATE TRIGGER trg_le_hierarchy_sync
    BEFORE INSERT OR UPDATE OF parent_entity_id
    ON master.legal_entity
    FOR EACH ROW EXECUTE FUNCTION master.fn_le_hierarchy_sync();


-- ─── H3b: business_partner hierarchy cycle guard + path maintenance ───────────
CREATE OR REPLACE FUNCTION master.fn_bp_hierarchy_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_ancestor    uuid;
    v_parent_path text;
    v_parent_level smallint;
BEGIN
    IF NEW.parent_business_partner_id IS NULL THEN
        NEW.level_no := 1;
        NEW.path     := '/' || NEW.id::text;
        RETURN NEW;
    END IF;

    -- Cycle detection.
    v_ancestor := NEW.parent_business_partner_id;
    WHILE v_ancestor IS NOT NULL LOOP
        IF v_ancestor = NEW.id THEN
            RAISE EXCEPTION
                'Cycle detected in business_partner hierarchy: BP % would become '
                'its own ancestor via parent %.',
                NEW.id, NEW.parent_business_partner_id;
        END IF;
        SELECT parent_business_partner_id INTO v_ancestor
        FROM master.business_partner
        WHERE tenant_id = NEW.tenant_id AND id = v_ancestor;
    END LOOP;

    SELECT level_no, path INTO v_parent_level, v_parent_path
    FROM master.business_partner
    WHERE tenant_id = NEW.tenant_id AND id = NEW.parent_business_partner_id;

    NEW.level_no := COALESCE(v_parent_level, 0) + 1;
    NEW.path     := COALESCE(v_parent_path, '') || '/' || NEW.id::text;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bp_hierarchy_sync ON master.business_partner;
CREATE TRIGGER trg_bp_hierarchy_sync
    BEFORE INSERT OR UPDATE OF parent_business_partner_id
    ON master.business_partner
    FOR EACH ROW EXECUTE FUNCTION master.fn_bp_hierarchy_sync();


-- ─── H8: party_governance_relation ownership_pct aggregate guard ──────────────
-- Prevents total shareholder / UBO ownership exceeding 100 % per party.
CREATE OR REPLACE FUNCTION master.fn_ownership_pct_aggregate_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_existing_total numeric;
BEGIN
    IF NEW.relation_type NOT IN ('shareholder', 'ubo') THEN
        RETURN NEW;
    END IF;
    IF NEW.ownership_pct IS NULL THEN
        RETURN NEW;
    END IF;

    -- Sum all OTHER active rows for the same (party, relation_type).
    SELECT COALESCE(SUM(ownership_pct), 0) INTO v_existing_total
    FROM master.party_governance_relation
    WHERE tenant_id    = NEW.tenant_id
      AND party_type   = NEW.party_type
      AND party_id     = NEW.party_id
      AND relation_type = NEW.relation_type
      AND is_active    = true
      AND id           IS DISTINCT FROM NEW.id;  -- exclude self on UPDATE

    IF v_existing_total + NEW.ownership_pct > 100 THEN
        RAISE EXCEPTION
            'Total % ownership_pct for party % (%) would exceed 100%% '
            '(existing: %, adding: %)',
            NEW.relation_type, NEW.party_id, NEW.party_type,
            v_existing_total, NEW.ownership_pct;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ownership_pct_aggregate_guard ON master.party_governance_relation;
CREATE TRIGGER trg_ownership_pct_aggregate_guard
    BEFORE INSERT OR UPDATE ON master.party_governance_relation
    FOR EACH ROW EXECUTE FUNCTION master.fn_ownership_pct_aggregate_guard();


-- ─── H10: legal_entity_business_partner_link — self_bp registration guard ─────
-- Warns when legal_entity.registration_no ≠ business_partner.registration_no
-- for a self_bp link. Also enforces partner_category='internal' (complements
-- any existing trg_lebpl_self_bp_guard on the triggers file).
CREATE OR REPLACE FUNCTION master.fn_self_bp_registration_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_le_regno text;
    v_bp_regno text;
    v_bp_category text;
BEGIN
    IF NEW.relationship_type <> 'self_bp' THEN
        RETURN NEW;
    END IF;

    SELECT registration_no INTO v_le_regno
    FROM master.legal_entity
    WHERE tenant_id = NEW.tenant_id AND id = NEW.legal_entity_id;

    SELECT registration_no, partner_category INTO v_bp_regno, v_bp_category
    FROM master.business_partner
    WHERE tenant_id = NEW.tenant_id AND id = NEW.business_partner_id;

    -- Hard error: self_bp BP must be internal.
    IF v_bp_category IS DISTINCT FROM 'internal' THEN
        RAISE EXCEPTION
            'self_bp link requires business_partner.partner_category=''internal''. '
            'BP % has partner_category=''%''.',
            NEW.business_partner_id, v_bp_category;
    END IF;

    -- Soft warning: registration number mismatch (could be legitimate name change etc.).
    IF v_le_regno IS NOT NULL
       AND v_bp_regno IS NOT NULL
       AND v_le_regno <> v_bp_regno THEN
        RAISE WARNING
            'self_bp registration_no mismatch: legal_entity % has ''%'', '
            'business_partner % has ''%''. Verify statutory records are consistent.',
            NEW.legal_entity_id, v_le_regno,
            NEW.business_partner_id, v_bp_regno;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_bp_registration_guard ON master.legal_entity_business_partner_link;
CREATE TRIGGER trg_self_bp_registration_guard
    BEFORE INSERT OR UPDATE OF relationship_type, business_partner_id
    ON master.legal_entity_business_partner_link
    FOR EACH ROW EXECUTE FUNCTION master.fn_self_bp_registration_guard();


-- ─── N1: business_partner_network_link — athyper_network connection validation ─
-- Enforces that remote_tenant_id and remote_business_partner_id are both set
-- before a connection is marked 'connected'. Clears invitation token on connect.
CREATE OR REPLACE FUNCTION master.fn_network_connect_validation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- Remote peer references required for platform network connections.
    IF NEW.provider_code = 'athyper_network'
       AND NEW.connection_status = 'connected' THEN
        IF NEW.remote_tenant_id IS NULL THEN
            RAISE EXCEPTION
                'athyper_network connection_status=''connected'' requires '
                'remote_tenant_id to be set.';
        END IF;
        IF NEW.remote_business_partner_id IS NULL THEN
            RAISE EXCEPTION
                'athyper_network connection_status=''connected'' requires '
                'remote_business_partner_id to be set.';
        END IF;
    END IF;

    -- Clear pending invitation token once connection is resolved.
    IF NEW.connection_status IN ('connected', 'suspended') THEN
        NEW.invitation_token      := NULL;
        NEW.invitation_expires_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_network_connect_validation ON master.business_partner_network_link;
CREATE TRIGGER trg_network_connect_validation
    BEFORE INSERT OR UPDATE OF connection_status,
                               remote_tenant_id,
                               remote_business_partner_id
    ON master.business_partner_network_link
    FOR EACH ROW EXECUTE FUNCTION master.fn_network_connect_validation();


-- ============================================================================
-- SECTION E — Backfill path/level for existing hierarchy rows
-- ============================================================================

-- Backfill legal_entity hierarchy path for existing root rows (no parent).
UPDATE master.legal_entity
SET level_no = 1,
    path     = '/' || id::text
WHERE parent_entity_id IS NULL
  AND path IS NULL;

-- Backfill business_partner hierarchy path for existing root rows.
UPDATE master.business_partner
SET level_no = 1,
    path     = '/' || id::text
WHERE parent_business_partner_id IS NULL
  AND path IS NULL;

-- ============================================================================
-- END: master/01m_bp_core_hardening.sql
-- ============================================================================
