-- ============================================================================
-- master/01h_tables_supplier_master.sql
-- Concept: Supplier Master Extension â€” repeatable, polymorphic, jurisdiction-aware
-- Depends on: 01b_tables_finance.sql (master.supplier), 01_tables_identity.sql (master.address)
-- Tables:
--   master.party_identifier          â€” external IDs (DUNS, LEI, GLN, Ariba, PEPPOL, ...)
--   master.party_tax_profile         - BP-owned per-country tax registration and clearance
--   master.certification_type        â€” certification standard registry
--   master.certification             â€” polymorphic certification records
--   master.party_contact_person      â€” named contact persons linked to any party
--   master.party_contact_role        â€” role assignments per contact person
--   master.party_governance_relation â€” shareholders, UBOs, directors, board, signatories
-- Design rule:
--   master.supplier = stable identity + primary profile (WHO)
--   These tables = repeatable / jurisdictional / polymorphic facts (DETAILS)
--   master.company_code_supplier_profile = AP/finance behaviour per company code (HOW)
-- FKs â†’ 03_constraints.sql
-- Indexes â†’ 04_indexes.sql (inline below for self-contained deployment)
-- Triggers â†’ 06_triggers.sql
-- RLS â†’ 08_rls.sql
-- Seed principal: systemadmin (id = '00000000-0000-0000-0000-000000000000').
-- ============================================================================


-- ============================================================================
-- 1. master.party_identifier
-- External / third-party identifier for any party (supplier, customer, legal entity).
-- Covers: DUNS, LEI, GLN, Ariba ANID, PEPPOL ID, SSM/UEN/CRN national IDs, etc.
-- Polymorphic: owner_type = 'business_partner' | 'supplier' | 'customer' | 'legal_entity' | 'company_code'
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_identifier (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Polymorphic ownership
    owner_type      text        NOT NULL,   -- 'business_partner', 'supplier', 'customer', 'legal_entity', 'company_code'
    owner_id        uuid        NOT NULL,

    -- Identifier
    scheme          text        NOT NULL,   -- lookup: master.party_identifier_scheme
                                            -- 'duns' | 'lei' | 'gln' | 'ariba_anid' |
                                            -- 'peppol_id' | 'uen' | 'ssm_no' | 'crn' | 'custom'
    value           text        NOT NULL,

    -- Source / verification
    issuing_authority   text,               -- e.g. 'Dun & Bradstreet', 'GLEIF', 'GS1'
    issued_at           date,
    valid_until         date,
    is_verified         boolean     NOT NULL DEFAULT false,
    verified_at         timestamptz,
    is_primary          boolean     NOT NULL DEFAULT false,

    -- Metadata
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

    CONSTRAINT pi_pkey              PRIMARY KEY (id),
    CONSTRAINT pi_tenant_uq         UNIQUE (tenant_id, id),
    CONSTRAINT pi_owner_scheme_uq   UNIQUE (tenant_id, owner_type, owner_id, scheme, value),
    CONSTRAINT pi_value_nonempty    CHECK (btrim(value) <> ''),
    CONSTRAINT pi_scheme_nonempty   CHECK (btrim(scheme) <> ''),
    CONSTRAINT pi_owner_nonempty    CHECK (btrim(owner_type) <> ''),
    CONSTRAINT pi_validity_chk      CHECK (
        valid_until IS NULL OR issued_at IS NULL OR valid_until >= issued_at),
    CONSTRAINT pi_verified_at_chk   CHECK (is_verified = false OR verified_at IS NOT NULL),
    CONSTRAINT pi_status_chk        CHECK (status IN ('active', 'superseded', 'revoked'))
);

CREATE INDEX IF NOT EXISTS pi_owner_idx
    ON master.party_identifier (tenant_id, owner_type, owner_id);
CREATE INDEX IF NOT EXISTS pi_scheme_value_idx
    ON master.party_identifier (tenant_id, scheme, value);
CREATE INDEX IF NOT EXISTS pi_unverified_pidx
    ON master.party_identifier (tenant_id, owner_type, owner_id)
    WHERE is_verified = false AND status = 'active';

COMMENT ON TABLE master.party_identifier IS
    'ARCHETYPE=B;SCOPE=T. External / third-party identifiers for any party. '
    'Polymorphic: owner_type = business_partner | supplier | customer | legal_entity | company_code. '
    'Schemes: duns, lei, gln, ariba_anid, peppol_id, uen, ssm_no, crn, custom.';
COMMENT ON COLUMN master.party_identifier.scheme IS
    'Identifier scheme code (lookup: master.party_identifier_scheme). '
    'Governs format validation applied by trigger.';
COMMENT ON COLUMN master.party_identifier.is_primary IS
    'At most one primary per (owner, scheme). Enforced by partial unique index.';


-- ============================================================================
-- 2. master.supplier_service_coverage (retired)
-- Supplier/BP coverage is no longer part of Business Partner Management.
-- Coverage/capability belongs to Business Network. The retirement/drop is
-- handled in 01m_bp_core_hardening.sql.
-- ============================================================================


-- ============================================================================
-- 3. master.party_tax_profile
-- Country-specific tax registration, classification, and clearance per business partner.
-- One row per (party x country). Supplier/customer pages consume this through
-- their parent business_partner_id rather than duplicating role-level tax data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_tax_profile (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    owner_type      text        NOT NULL DEFAULT 'business_partner',
    owner_id        uuid        NOT NULL,   -- FK -> master.business_partner when owner_type='business_partner'
    country_code    char(2)     NOT NULL,   -- ISO 3166-1 alpha-2

    -- Financial Information (Ariba / procurement portal fields)
    penalty_information     text,
    discount_information    text,
    global_location_number  text,           -- GS1 GLN, 13-digit numeric

    -- Tax Classification
    tax_classification      text,           -- lookup: master.supplier_tax_classification
    taxation_type           text,           -- lookup: master.supplier_taxation_type

    -- Tax Identifiers (all country-specific)
    tax_id                  text,           -- primary national TIN / corporate tax no
    state_tax_id            text,
    sales_tax_id            text,
    service_tax_id          text,
    regional_tax_id         text,

    -- VAT / GST
    vat_id                  text,
    vat_registered          boolean     NOT NULL DEFAULT false,
    vat_registration_doc_id uuid,           -- FK -> master.attachment

    -- Tax Clearance
    has_tax_clearance           boolean NOT NULL DEFAULT false,
    tax_clearance_number        text,
    tax_clearance_doc_id        uuid,       -- FK -> master.attachment
    tax_clearance_expiry_date   date,

    -- Metadata
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

    CONSTRAINT ptp_pkey                 PRIMARY KEY (id),
    CONSTRAINT ptp_tenant_uq            UNIQUE (tenant_id, id),
    CONSTRAINT ptp_owner_country_uq     UNIQUE (tenant_id, owner_type, owner_id, country_code),
    CONSTRAINT ptp_owner_type_chk       CHECK (owner_type IN ('business_partner')),
    CONSTRAINT ptp_country_fmt_chk      CHECK (country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT ptp_gln_fmt_chk          CHECK (
        global_location_number IS NULL OR global_location_number ~ '^\d{13}$'),
    CONSTRAINT ptp_clearance_num_chk    CHECK (
        NOT has_tax_clearance OR tax_clearance_number IS NOT NULL),
    CONSTRAINT ptp_status_chk           CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS ptp_owner_idx
    ON master.party_tax_profile (tenant_id, owner_type, owner_id);
CREATE INDEX IF NOT EXISTS ptp_country_idx
    ON master.party_tax_profile (tenant_id, country_code);
CREATE INDEX IF NOT EXISTS ptp_clearance_expiry_idx
    ON master.party_tax_profile (tenant_id, tax_clearance_expiry_date)
    WHERE has_tax_clearance = true AND tax_clearance_expiry_date IS NOT NULL;

COMMENT ON TABLE master.party_tax_profile IS
    'ARCHETYPE=B;SCOPE=T. Country-specific tax registration per business partner. '
    'Unique per (owner_type, owner_id, country). Supplier and customer roles read '
    'this through their parent business_partner_id.';
COMMENT ON COLUMN master.party_tax_profile.global_location_number IS
    'GS1 Global Location Number (GLN). 13-digit numeric string. '
    'Identifies a physical or legal location in the GS1 system.';
COMMENT ON COLUMN master.party_tax_profile.vat_registration_doc_id IS
    'FK -> master.attachment. Uploaded VAT/GST registration certificate document.';
COMMENT ON COLUMN master.party_tax_profile.tax_clearance_doc_id IS
    'FK -> master.attachment. Official tax clearance certificate document.';


-- 4. master.certification_type
-- Registry of known certification standards (platform-seeded) and tenant custom types.
-- NULL tenant_id = platform-wide standard (ISO 9001, ISO 27001, Halal, etc.)
-- Tenant-scoped = custom types created by the tenant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.certification_type (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,                   -- NULL = platform standard; UUID = tenant custom
    code            text        NOT NULL,
    name            text        NOT NULL,
    issuing_body    text,                   -- e.g. 'ISO', 'BSI', 'SIRIM', 'TÃœV SÃœD'
    category        text,                   -- lookup: master.certification_category
                                            -- 'quality' | 'safety' | 'esg' | 'halal' |
                                            -- 'financial' | 'information_security' | 'food_safety'
    description     text,
    is_custom       boolean     NOT NULL DEFAULT false,

    -- Metadata
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT ctype_pkey           PRIMARY KEY (id),
    CONSTRAINT ctype_name_nonempty  CHECK (btrim(name) <> ''),
    CONSTRAINT ctype_code_fmt       CHECK (code ~ '^[a-z][a-z0-9_-]*$'),
    CONSTRAINT ctype_status_chk     CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT ctype_custom_tenant  CHECK (NOT is_custom OR tenant_id IS NOT NULL)
);

-- Unique code per tenant scope (NULL tenant = platform, UUID = tenant)
CREATE UNIQUE INDEX IF NOT EXISTS ctype_code_scope_uq
    ON master.certification_type (
        COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        code
    );

CREATE INDEX IF NOT EXISTS ctype_tenant_idx
    ON master.certification_type (tenant_id)
    WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ctype_category_idx
    ON master.certification_type (category)
    WHERE category IS NOT NULL;

COMMENT ON TABLE master.certification_type IS
    'ARCHETYPE=A;SCOPE=P+T. Certification type registry. '
    'Platform-seeded (tenant_id IS NULL): ISO, HALAL, ESG standards. '
    'Tenant-custom (tenant_id IS NOT NULL, is_custom = true): tenant-specific types.';
COMMENT ON COLUMN master.certification_type.tenant_id IS
    'NULL = platform-wide standard available to all tenants. '
    'UUID = tenant-scoped custom type.';


-- ============================================================================
-- 5. master.certification
-- Polymorphic certification record. Linked to any certifiable party or entity.
-- owner_type: 'business_partner' | 'supplier' | 'customer' | 'company_code' | 'employee' | 'product'
-- Certificate type is either a registered type (certification_type_id) or a
-- custom freetext name â€” enforced by XOR constraint.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.certification (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Polymorphic ownership
    owner_type      text        NOT NULL,
    owner_id        uuid        NOT NULL,

    -- Certificate type: registered or custom (exactly one must be set)
    certification_type_id   uuid,           -- FK â†’ master.certification_type
    custom_name             text,           -- populated when type_id IS NULL

    -- Certificate details
    certificate_number  text,
    certified_by        text,               -- certifying body / organization name
    certified_location  text,               -- location scope of the certification
    additional_info     text,

    -- Document
    document_attachment_id  uuid,           -- FK â†’ master.attachment

    -- Validity window
    effective_from      date,
    effective_until     date,

    -- Metadata
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

    CONSTRAINT cert_pkey            PRIMARY KEY (id),
    CONSTRAINT cert_tenant_uq       UNIQUE (tenant_id, id),
    CONSTRAINT cert_owner_nonempty  CHECK (btrim(owner_type) <> ''),
    -- Exactly one of type_id or custom_name must be set
    CONSTRAINT cert_type_xor_custom CHECK (
        (certification_type_id IS NOT NULL AND custom_name IS NULL)
        OR (certification_type_id IS NULL  AND custom_name IS NOT NULL)
    ),
    CONSTRAINT cert_validity_order  CHECK (
        effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from),
    CONSTRAINT cert_status_chk      CHECK (status IN ('active', 'expired', 'revoked', 'superseded'))
);

CREATE INDEX IF NOT EXISTS cert_owner_idx
    ON master.certification (tenant_id, owner_type, owner_id);
CREATE INDEX IF NOT EXISTS cert_type_idx
    ON master.certification (tenant_id, certification_type_id)
    WHERE certification_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cert_expiry_idx
    ON master.certification (tenant_id, effective_until)
    WHERE effective_until IS NOT NULL AND status = 'active';

COMMENT ON TABLE master.certification IS
    'ARCHETYPE=B;SCOPE=T. Polymorphic certification record for any party or entity. '
    'owner_type: business_partner | supplier | customer | company_code | employee | product. '
    'Distinct from document.wht_certificate (financial WHT instrument, not compliance cert).';
COMMENT ON COLUMN master.certification.certification_type_id IS
    'Registered certification type FK. Exactly one of certification_type_id or custom_name must be set '
    '(enforced by cert_type_xor_custom CHECK). NULL when supplier uses the "not in list" freetext path.';
COMMENT ON COLUMN master.certification.document_attachment_id IS
    'FK â†’ master.attachment. The uploaded certificate document (PDF, JPG, PNG).';


-- ============================================================================
-- 6. master.party_contact_person
-- Named contact person linked to a party (supplier, customer, company_code).
-- Covers: sales rep, AP contact, support contact, account manager.
-- Company-level channel contacts (email/phone for the supplier entity itself)
-- remain in master.contact_link with owner_type='supplier'.
-- This table is for NAMED INDIVIDUALS representing the party.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_contact_person (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Polymorphic party link
    party_type      text        NOT NULL,   -- 'business_partner' | 'supplier' | 'customer' | 'company_code'
    party_id        uuid        NOT NULL,

    -- Scope to a specific operating entity (optional â€” NULL = all company codes)
    company_code_id uuid,                   -- FK â†’ master.company_code

    -- Identity
    contact_name    text        NOT NULL,
    business_title  text,
    contact_role    text,                   -- lookup: master.contact_role (billing, legal, escalationâ€¦)

    -- Primary flag (at most one primary per party)
    is_primary      boolean     NOT NULL DEFAULT false,

    -- Metadata
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

    CONSTRAINT pcp_pkey             PRIMARY KEY (id),
    CONSTRAINT pcp_tenant_uq        UNIQUE (tenant_id, id),
    CONSTRAINT pcp_name_nonempty    CHECK (btrim(contact_name) <> ''),
    CONSTRAINT pcp_party_nonempty   CHECK (btrim(party_type) <> ''),
    CONSTRAINT pcp_status_chk       CHECK (status IN ('active', 'inactive', 'departed'))
);

-- Idempotent backfill â€” adds contact_role when the table already exists without it.
ALTER TABLE master.party_contact_person
    ADD COLUMN IF NOT EXISTS contact_role text;

CREATE INDEX IF NOT EXISTS pcp_party_idx
    ON master.party_contact_person (tenant_id, party_type, party_id);
CREATE INDEX IF NOT EXISTS pcp_primary_pidx
    ON master.party_contact_person (tenant_id, party_type, party_id)
    WHERE is_primary = true AND is_active = true;

COMMENT ON TABLE master.party_contact_person IS
    'ARCHETYPE=B;SCOPE=T. Named contact person (individual) for any party. '
    'party_type: business_partner | supplier | customer | company_code. '
    'Company-level channel contacts (email/phone) remain in master.contact_link. '
    'Roles assigned via master.party_contact_role.';
COMMENT ON COLUMN master.party_contact_person.company_code_id IS
    'Optional scope â€” NULL means contact applies to all company codes of this party. '
    'Set when a contact is specific to one operating entity in a supplier group.';


-- ============================================================================
-- 7. master.party_contact_role
-- Role assignments for a named contact person (multi-role per person).
-- role_code references lookup: master.party_contact_role
-- e.g. main_contact, bid_proposal_manager, logistics, it, finance_manager
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_contact_role (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    party_contact_person_id uuid        NOT NULL,   -- FK â†’ master.party_contact_person
    role_code               text        NOT NULL,   -- lookup: master.party_contact_role

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT pcr_pkey             PRIMARY KEY (id),
    CONSTRAINT pcr_tenant_uq        UNIQUE (tenant_id, id),
    CONSTRAINT pcr_contact_role_uq  UNIQUE (tenant_id, party_contact_person_id, role_code),
    CONSTRAINT pcr_role_nonempty    CHECK (btrim(role_code) <> '')
);

CREATE INDEX IF NOT EXISTS pcr_contact_idx
    ON master.party_contact_role (tenant_id, party_contact_person_id);
CREATE INDEX IF NOT EXISTS pcr_role_idx
    ON master.party_contact_role (tenant_id, role_code);

COMMENT ON TABLE master.party_contact_role IS
    'ARCHETYPE=B;SCOPE=T. Role assignments for a named contact person. '
    'Multi-role: one person can have main_contact + logistics + it simultaneously. '
    'role_code lookup: master.party_contact_role.';


-- ============================================================================
-- 8. master.party_governance_relation
-- Governance structure for a party: shareholders, UBOs, directors, board members,
-- signatories, company secretary, auditor.
-- Covers both individuals (member_type=individual) and corporate entities (member_type=company).
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_governance_relation (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Polymorphic party (the company this governance relation belongs to)
    party_type      text        NOT NULL,   -- 'business_partner' | 'supplier' | 'customer' | 'legal_entity'
    party_id        uuid        NOT NULL,

    -- Relation type (lookup: master.party_governance_role)
    relation_type   text        NOT NULL,
        -- 'shareholder' | 'ubo' | 'director' | 'board_member' |
        -- 'signatory' | 'company_secretary' | 'auditor'

    -- Member identity
    member_name     text        NOT NULL,
    member_type     text        NOT NULL DEFAULT 'individual',
        -- 'individual' | 'company' | 'external'
    company_name    text,                   -- populated when member_type = 'company'
    member_business_partner_id uuid,         -- optional FK -> master.business_partner
    member_country_code char(2),

    -- Role details
    business_title  text,                   -- e.g. 'Chief Executive Officer', 'Non-Executive Director'

    -- Ownership (shareholders / UBO)
    ownership_pct   numeric(7,4),           -- 0.0000â€“100.0000; NULL for non-ownership roles
    share_class     text,                   -- 'ordinary' | 'preference' | 'restricted' | NULL
    voting_pct      numeric(7,4),
    beneficial_ownership_pct numeric(7,4),
    directness      text,                   -- direct | indirect | both | unknown
    control_nature  text,                   -- equity | voting | appointment | poa | contractual | other

    -- Authority / mandate
    authority_scope text,
    authority_limit_amount numeric(18,4),
    authority_limit_currency_code char(3),

    -- Term
    appointed_date  date,
    end_of_term     date,                   -- NULL = currently active / no fixed term

    -- Compliance and evidence
    kyc_status       text        NOT NULL DEFAULT 'not_started',
    sanctions_status text        NOT NULL DEFAULT 'not_checked',
    pep_status       text        NOT NULL DEFAULT 'unknown',
    last_screened_at timestamptz,
    evidence_status  text        NOT NULL DEFAULT 'missing',
    evidence_attachment_id uuid,
    source_of_wealth text,

    -- Review cycle
    last_reviewed_at timestamptz,
    next_review_at   date,
    reviewed_by      uuid,

    notes           text,

    -- Metadata
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

    CONSTRAINT pgr_pkey                 PRIMARY KEY (id),
    CONSTRAINT pgr_tenant_uq            UNIQUE (tenant_id, id),
    CONSTRAINT pgr_member_nonempty      CHECK (btrim(member_name) <> ''),
    CONSTRAINT pgr_party_nonempty       CHECK (btrim(party_type) <> ''),
    CONSTRAINT pgr_relation_nonempty    CHECK (btrim(relation_type) <> ''),
    CONSTRAINT pgr_member_type_chk      CHECK (member_type IN (
                                             'individual', 'organization', 'company',
                                             'trust', 'public_float', 'external')),
    CONSTRAINT pgr_company_name_chk     CHECK (member_type NOT IN ('company', 'organization', 'trust')
                                             OR company_name IS NOT NULL),
    CONSTRAINT pgr_ownership_range_chk  CHECK (
        ownership_pct IS NULL OR (ownership_pct >= 0 AND ownership_pct <= 100)),
    CONSTRAINT pgr_pct_ranges_chk       CHECK (
        (voting_pct IS NULL OR (voting_pct >= 0 AND voting_pct <= 100))
        AND (beneficial_ownership_pct IS NULL OR (beneficial_ownership_pct >= 0 AND beneficial_ownership_pct <= 100))),
    CONSTRAINT pgr_country_fmt_chk      CHECK (
        member_country_code IS NULL OR member_country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT pgr_directness_chk       CHECK (
        directness IS NULL OR directness IN ('direct', 'indirect', 'both', 'unknown')),
    CONSTRAINT pgr_control_nature_chk   CHECK (
        control_nature IS NULL OR control_nature IN (
            'equity', 'voting', 'appointment', 'poa', 'contractual', 'other')),
    CONSTRAINT pgr_role_ownership_chk   CHECK (
        relation_type NOT IN ('shareholder', 'ubo')
        OR ownership_pct IS NOT NULL
        OR beneficial_ownership_pct IS NOT NULL),
    CONSTRAINT pgr_authority_currency_chk CHECK (
        authority_limit_amount IS NULL OR authority_limit_currency_code IS NOT NULL),
    CONSTRAINT pgr_authority_currency_fmt_chk CHECK (
        authority_limit_currency_code IS NULL OR authority_limit_currency_code ~ '^[A-Z]{3}$'),
    CONSTRAINT pgr_kyc_status_chk       CHECK (kyc_status IN (
                                             'not_started', 'in_progress', 'verified', 'passed', 'failed', 'expired')),
    CONSTRAINT pgr_sanctions_status_chk CHECK (sanctions_status IN (
                                             'not_checked', 'clear', 'flagged', 'blocked')),
    CONSTRAINT pgr_pep_status_chk       CHECK (pep_status IN (
                                             'unknown', 'no_pep', 'pep', 'not_applicable')),
    CONSTRAINT pgr_evidence_status_chk  CHECK (evidence_status IN (
                                             'missing', 'received', 'verified', 'expired', 'waived')),
    CONSTRAINT pgr_term_order_chk       CHECK (
        end_of_term IS NULL OR appointed_date IS NULL OR end_of_term >= appointed_date),
    CONSTRAINT pgr_status_chk           CHECK (status IN ('active', 'resigned', 'terminated'))
);

-- Governance v2: additive columns for BP 360 audit posture.
ALTER TABLE master.party_governance_relation
    ADD COLUMN IF NOT EXISTS member_business_partner_id uuid,
    ADD COLUMN IF NOT EXISTS member_country_code char(2),
    ADD COLUMN IF NOT EXISTS voting_pct numeric(7,4),
    ADD COLUMN IF NOT EXISTS beneficial_ownership_pct numeric(7,4),
    ADD COLUMN IF NOT EXISTS directness text,
    ADD COLUMN IF NOT EXISTS control_nature text,
    ADD COLUMN IF NOT EXISTS authority_scope text,
    ADD COLUMN IF NOT EXISTS authority_limit_amount numeric(18,4),
    ADD COLUMN IF NOT EXISTS authority_limit_currency_code char(3),
    ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS sanctions_status text NOT NULL DEFAULT 'not_checked',
    ADD COLUMN IF NOT EXISTS pep_status text NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS last_screened_at timestamptz,
    ADD COLUMN IF NOT EXISTS evidence_status text NOT NULL DEFAULT 'missing',
    ADD COLUMN IF NOT EXISTS evidence_attachment_id uuid,
    ADD COLUMN IF NOT EXISTS source_of_wealth text,
    ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS next_review_at date,
    ADD COLUMN IF NOT EXISTS reviewed_by uuid;

ALTER TABLE master.party_governance_relation DROP CONSTRAINT IF EXISTS pgr_member_type_chk;
DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_member_type_chk
    CHECK (member_type IN ('individual', 'organization', 'company', 'trust', 'public_float', 'external'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.party_governance_relation DROP CONSTRAINT IF EXISTS pgr_company_name_chk;
DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_company_name_chk
    CHECK (member_type NOT IN ('company', 'organization', 'trust') OR company_name IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_pct_ranges_chk
    CHECK (
        (voting_pct IS NULL OR (voting_pct >= 0 AND voting_pct <= 100))
        AND (beneficial_ownership_pct IS NULL OR (beneficial_ownership_pct >= 0 AND beneficial_ownership_pct <= 100))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_country_fmt_chk
    CHECK (member_country_code IS NULL OR member_country_code ~ '^[A-Z]{2}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_directness_chk
    CHECK (directness IS NULL OR directness IN ('direct', 'indirect', 'both', 'unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_control_nature_chk
    CHECK (control_nature IS NULL OR control_nature IN ('equity', 'voting', 'appointment', 'poa', 'contractual', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_role_ownership_chk
    CHECK (
        relation_type NOT IN ('shareholder', 'ubo')
        OR ownership_pct IS NOT NULL
        OR beneficial_ownership_pct IS NOT NULL
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_authority_currency_chk
    CHECK (authority_limit_amount IS NULL OR authority_limit_currency_code IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_authority_currency_fmt_chk
    CHECK (authority_limit_currency_code IS NULL OR authority_limit_currency_code ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_kyc_status_chk
    CHECK (kyc_status IN ('not_started', 'in_progress', 'verified', 'passed', 'failed', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_sanctions_status_chk
    CHECK (sanctions_status IN ('not_checked', 'clear', 'flagged', 'blocked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_pep_status_chk
    CHECK (pep_status IN ('unknown', 'no_pep', 'pep', 'not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_evidence_status_chk
    CHECK (evidence_status IN ('missing', 'received', 'verified', 'expired', 'waived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS pgr_party_idx
    ON master.party_governance_relation (tenant_id, party_type, party_id);
CREATE INDEX IF NOT EXISTS pgr_relation_type_idx
    ON master.party_governance_relation (tenant_id, party_type, party_id, relation_type);
CREATE INDEX IF NOT EXISTS pgr_active_shareholders_pidx
    ON master.party_governance_relation (tenant_id, party_type, party_id)
    WHERE relation_type = 'shareholder' AND is_active = true;
CREATE INDEX IF NOT EXISTS pgr_member_bp_idx
    ON master.party_governance_relation (tenant_id, member_business_partner_id)
    WHERE member_business_partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pgr_review_due_idx
    ON master.party_governance_relation (tenant_id, next_review_at)
    WHERE is_active = true AND next_review_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS pgr_compliance_idx
    ON master.party_governance_relation (tenant_id, kyc_status, sanctions_status, pep_status)
    WHERE is_active = true;

COMMENT ON TABLE master.party_governance_relation IS
    'ARCHETYPE=B;SCOPE=T. Governance structure for any party. '
    'party_type: business_partner | supplier | customer | legal_entity. '
    'relation_type covers ownership, beneficial ownership, leadership, authority, audit, and advisory roles. '
    'Covers individuals, organizations, trusts, public float, and external parties.';
COMMENT ON COLUMN master.party_governance_relation.ownership_pct IS
    'Ownership percentage (0.0000-100.0000). Populated for relation_type = shareholder | ubo. '
    'NULL for non-ownership roles (director, signatory, etc.).';
COMMENT ON COLUMN master.party_governance_relation.beneficial_ownership_pct IS
    'Ultimate beneficial ownership percentage when different from direct legal ownership.';
COMMENT ON COLUMN master.party_governance_relation.voting_pct IS
    'Voting control percentage, which can differ from economic ownership.';
COMMENT ON COLUMN master.party_governance_relation.member_business_partner_id IS
    'Optional link to an existing business partner when the governance member is modeled in BP master.';
COMMENT ON COLUMN master.party_governance_relation.next_review_at IS
    'Next scheduled governance/KYC review date for BP 360 governance monitoring.';
COMMENT ON COLUMN master.party_governance_relation.end_of_term IS
    'NULL = currently serving / no fixed end date. '
    'Populated when resigned, term expired, or replaced.';


-- ============================================================================
-- 9. master.supplier_block
-- Procurement / invoice / payment blocks placed on a supplier.
-- A block represents an explicit administrative hold; lifting is logged separately.
-- is_active is computed: true while lifted_at IS NULL (block still in effect).
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.supplier_block (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    supplier_id     uuid        NOT NULL,   -- FK â†’ master.supplier

    -- Block details
    block_type      text        NOT NULL,
        -- 'procurement' | 'invoice' | 'payment' | 'all'
    block_reason    text        NOT NULL,
    blocked_at      timestamptz NOT NULL DEFAULT now(),
    blocked_by      uuid,

    -- Lift (if block has been removed)
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

    CONSTRAINT sb_pkey              PRIMARY KEY (id),
    CONSTRAINT sb_tenant_uq         UNIQUE (tenant_id, id),
    CONSTRAINT sb_reason_nonempty   CHECK (btrim(block_reason) <> ''),
    CONSTRAINT sb_block_type_chk    CHECK (block_type IN ('procurement', 'invoice', 'payment', 'all')),
    CONSTRAINT sb_lift_order_chk    CHECK (lifted_at IS NULL OR lifted_at >= blocked_at),
    CONSTRAINT sb_lift_reason_chk   CHECK (lifted_at IS NULL OR lift_reason IS NOT NULL),
    CONSTRAINT sb_status_chk        CHECK (status IN ('active', 'lifted'))
);

CREATE INDEX IF NOT EXISTS sb_supplier_idx
    ON master.supplier_block (tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS sb_active_idx
    ON master.supplier_block (tenant_id, supplier_id)
    WHERE is_active = true;

COMMENT ON TABLE master.supplier_block IS
    'ARCHETYPE=B;SCOPE=T. Procurement/invoice/payment blocks placed on a supplier. '
    'block_type: procurement | invoice | payment | all. '
    'is_active=true while lifted_at IS NULL. Lifting is an update (set lifted_at/by/reason).';
COMMENT ON COLUMN master.supplier_block.is_active IS
    'Computed: true while lifted_at IS NULL (block still in effect). '
    'When a block is lifted, set lifted_at, lifted_by, and lift_reason.';
COMMENT ON COLUMN master.supplier_block.block_type IS
    'Scope of the block: procurement=PO creation blocked, invoice=invoice receipt blocked, '
    'payment=payment run blocked, all=all operations blocked.';
