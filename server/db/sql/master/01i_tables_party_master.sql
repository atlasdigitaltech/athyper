-- ============================================================================
-- master/01i_tables_party_master.sql
-- Three-party master architecture — structural refinements + new qualification tables
--
-- Part A: party_tax_profile
--         Rename master.supplier_tax_profile → master.party_tax_profile
--         Add polymorphic owner_type/owner_id; drop supplier_id
-- Part B: party_contact_person
--         Strip inline phone/fax/address columns; channels → contact_link/address_link
-- Part C: master.customer — add extended business profile columns
-- Part D: master.legal_entity — add statutory profile columns + extended status CHECK
-- Part E: master.supplier_qualification — onboarding, procurement, risk, performance
-- Part F: master.customer_qualification — credit, KYC/AML, AR risk, collections
--
-- All statements are idempotent: IF NOT EXISTS / IF EXISTS / DO $$ guards.
-- Depends on: 01h_tables_supplier_master.sql
-- ============================================================================


-- ── Part A: party_tax_profile ─────────────────────────────────────────────────
-- Rename supplier_tax_profile → party_tax_profile, then add polymorphic columns.
-- Idempotent: checks pg_tables before renaming.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'master' AND tablename = 'supplier_tax_profile'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'master' AND tablename = 'party_tax_profile'
  ) THEN
    EXECUTE 'ALTER TABLE master.supplier_tax_profile RENAME TO party_tax_profile';
  END IF;
END $$;

ALTER TABLE master.party_tax_profile
    ADD COLUMN IF NOT EXISTS owner_type text,
    ADD COLUMN IF NOT EXISTS owner_id   uuid;

UPDATE master.party_tax_profile
   SET owner_type = 'supplier', owner_id = supplier_id
 WHERE owner_type IS NULL AND supplier_id IS NOT NULL;

DO $$ BEGIN
  BEGIN ALTER TABLE master.party_tax_profile ALTER COLUMN owner_type SET NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE master.party_tax_profile ALTER COLUMN owner_id   SET NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

ALTER TABLE master.party_tax_profile
    DROP CONSTRAINT IF EXISTS stp_supplier_country_uq;

DO $$ BEGIN
  BEGIN
    ALTER TABLE master.party_tax_profile
        ADD CONSTRAINT ptp_owner_country_uq UNIQUE (tenant_id, owner_type, owner_id, country_code);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Rename pkey / tenant_uq / status_chk constraints to ptp_ prefix
DO $$ BEGIN
  BEGIN ALTER TABLE master.party_tax_profile RENAME CONSTRAINT stp_pkey       TO ptp_pkey;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER TABLE master.party_tax_profile RENAME CONSTRAINT stp_tenant_uq  TO ptp_tenant_uq;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER TABLE master.party_tax_profile RENAME CONSTRAINT stp_status_chk TO ptp_status_chk;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER TABLE master.party_tax_profile RENAME CONSTRAINT stp_country_fmt_chk TO ptp_country_fmt_chk;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER TABLE master.party_tax_profile RENAME CONSTRAINT stp_gln_fmt_chk     TO ptp_gln_fmt_chk;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER TABLE master.party_tax_profile RENAME CONSTRAINT stp_clearance_num_chk TO ptp_clearance_num_chk;
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

ALTER TABLE master.party_tax_profile DROP COLUMN IF EXISTS supplier_id;

DROP INDEX IF EXISTS master.stp_supplier_idx;
DROP INDEX IF EXISTS master.stp_country_idx;
DROP INDEX IF EXISTS master.stp_clearance_expiry_idx;

CREATE INDEX IF NOT EXISTS ptp_owner_idx
    ON master.party_tax_profile (tenant_id, owner_type, owner_id);
CREATE INDEX IF NOT EXISTS ptp_country_idx
    ON master.party_tax_profile (tenant_id, country_code);
CREATE INDEX IF NOT EXISTS ptp_clearance_expiry_idx
    ON master.party_tax_profile (tenant_id, tax_clearance_expiry_date)
    WHERE has_tax_clearance = true AND tax_clearance_expiry_date IS NOT NULL;

COMMENT ON TABLE master.party_tax_profile IS
    'ARCHETYPE=B;SCOPE=T. Country-specific tax registration per party (supplier | customer | legal_entity). '
    'Unique per (owner_type, owner_id, country). Primary tax identity cached on root party row for fast display.';
COMMENT ON COLUMN master.party_tax_profile.owner_type IS
    'Polymorphic party type: supplier | customer | legal_entity.';
COMMENT ON COLUMN master.party_tax_profile.owner_id IS
    'UUID of the root party (master.supplier.id / master.customer.id / master.legal_entity.id).';


-- ── Part B: party_contact_person — strip inline contact/address columns ────────
-- Channel contacts → master.contact_link (owner_type = ''party_contact_person'').
-- Addresses       → master.address_link  (owner_type = ''party_contact_person'').
-- email kept at application layer if desired via contact_link; not stored inline.

ALTER TABLE master.party_contact_person
    DROP COLUMN IF EXISTS email,
    DROP COLUMN IF EXISTS phone_calling_code,
    DROP COLUMN IF EXISTS phone_area,
    DROP COLUMN IF EXISTS phone_number,
    DROP COLUMN IF EXISTS phone_extension,
    DROP COLUMN IF EXISTS fax_calling_code,
    DROP COLUMN IF EXISTS fax_area,
    DROP COLUMN IF EXISTS fax_number,
    DROP COLUMN IF EXISTS fax_extension,
    DROP COLUMN IF EXISTS address_line1,
    DROP COLUMN IF EXISTS address_line2,
    DROP COLUMN IF EXISTS city,
    DROP COLUMN IF EXISTS state_region,
    DROP COLUMN IF EXISTS postal_code,
    DROP COLUMN IF EXISTS address_country_code;

COMMENT ON TABLE master.party_contact_person IS
    'ARCHETYPE=B;SCOPE=T. Named contact person (individual) for any party. '
    'party_type: supplier | customer | legal_entity | company_code. '
    'Channel contacts (email/phone/fax) → master.contact_link (owner_type=party_contact_person). '
    'Addresses → master.address_link (owner_type=party_contact_person). '
    'Roles → master.party_contact_role.';


-- ── Part C: master.customer — extended business profile columns ────────────────
-- Mirrors the 7 extended profile columns added to master.supplier in 01b_tables_finance.sql.

ALTER TABLE master.customer
    ADD COLUMN IF NOT EXISTS long_description       text,
    ADD COLUMN IF NOT EXISTS aliases                text[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS business_types         text[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS legal_form             text,
    ADD COLUMN IF NOT EXISTS founded_year           smallint,
    ADD COLUMN IF NOT EXISTS employee_count_band    text,
    ADD COLUMN IF NOT EXISTS annual_revenue_band    text;

DO $$ BEGIN
  BEGIN
    ALTER TABLE master.customer
        ADD CONSTRAINT customer_founded_year_chk
            CHECK (founded_year IS NULL OR (founded_year BETWEEN 1800 AND 2200));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ── Part D: master.legal_entity — statutory profile extensions ─────────────────

ALTER TABLE master.legal_entity
    ADD COLUMN IF NOT EXISTS display_name                  text,
    ADD COLUMN IF NOT EXISTS legal_name                    text,
    ADD COLUMN IF NOT EXISTS legal_form                    text,
    ADD COLUMN IF NOT EXISTS website_url                   text,
    ADD COLUMN IF NOT EXISTS external_ref                  text,
    ADD COLUMN IF NOT EXISTS aliases                       text[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS business_types                text[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS founded_year                  smallint,
    ADD COLUMN IF NOT EXISTS employee_count_band           text,
    ADD COLUMN IF NOT EXISTS annual_revenue_band           text,
    ADD COLUMN IF NOT EXISTS tags                          jsonb    NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS tax_residence_country_code    char(2),
    ADD COLUMN IF NOT EXISTS effective_from                date,
    ADD COLUMN IF NOT EXISTS effective_until               date;

-- Extended statutory lifecycle: add dormant/in_liquidation/dissolved/archived
ALTER TABLE master.legal_entity
    DROP CONSTRAINT IF EXISTS legal_entity_status_chk;
DO $$ BEGIN
  BEGIN
    ALTER TABLE master.legal_entity
        ADD CONSTRAINT legal_entity_status_chk
            CHECK (status IN ('draft', 'active', 'dormant', 'in_liquidation', 'dissolved', 'archived'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  BEGIN ALTER TABLE master.legal_entity
        ADD CONSTRAINT legal_entity_founded_year_chk
            CHECK (founded_year IS NULL OR (founded_year BETWEEN 1800 AND 2200));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN ALTER TABLE master.legal_entity
        ADD CONSTRAINT legal_entity_effective_order_chk
            CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN ALTER TABLE master.legal_entity
        ADD CONSTRAINT legal_entity_tax_country_fmt_chk
            CHECK (tax_residence_country_code IS NULL OR tax_residence_country_code ~ '^[A-Z]{2}$');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

COMMENT ON COLUMN master.legal_entity.tax_residence_country_code IS
    'Country of primary tax residence (may differ from country_code of incorporation). '
    'ISO 3166-1 alpha-2.';
COMMENT ON COLUMN master.legal_entity.effective_from IS
    'Date the legal entity became effective / operational. NULL = from inception.';
COMMENT ON COLUMN master.legal_entity.effective_until IS
    'Date the legal entity ceased to be effective (dissolution, merger). NULL = still active.';


-- ── Part E: master.supplier_qualification ─────────────────────────────────────
-- One row per (tenant, supplier). Onboarding, procurement approval, KYC/AML, performance.

CREATE TABLE IF NOT EXISTS master.supplier_qualification (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    supplier_id     uuid        NOT NULL,

    -- Onboarding
    onboarding_status           text        NOT NULL DEFAULT 'pending',
    profile_completeness_pct    smallint,
    onboarding_approved_at      timestamptz,
    onboarding_approved_by      uuid,

    -- Procurement classification
    is_approved_supplier        boolean     NOT NULL DEFAULT false,
    is_preferred_supplier       boolean     NOT NULL DEFAULT false,
    is_blocked                  boolean     NOT NULL DEFAULT false,
    block_reason                text,
    block_start_date            date,

    -- Risk & Compliance
    risk_tier                   text,
    sanctions_status            text        NOT NULL DEFAULT 'not_checked',
    aml_kyc_status              text        NOT NULL DEFAULT 'not_started',
    sanctions_check_date        date,
    kyc_expiry_date             date,

    -- Sourcing metrics (denormalized counters)
    sourcing_event_count        integer     NOT NULL DEFAULT 0,
    bid_count                   integer     NOT NULL DEFAULT 0,
    awarded_count               integer     NOT NULL DEFAULT 0,

    -- Performance scores (0.00–100.00)
    delivery_score              numeric(5,2),
    quality_score               numeric(5,2),
    sla_score                   numeric(5,2),
    score_period_start          date,
    score_period_end            date,

    -- Review cycle
    last_review_date            date,
    next_review_date            date,
    reviewed_by                 uuid,

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

    CONSTRAINT sq_pkey                  PRIMARY KEY (id),
    CONSTRAINT sq_tenant_uq             UNIQUE (tenant_id, id),
    CONSTRAINT sq_supplier_uq           UNIQUE (tenant_id, supplier_id),
    CONSTRAINT sq_completeness_chk      CHECK (profile_completeness_pct IS NULL
                                            OR profile_completeness_pct BETWEEN 0 AND 100),
    CONSTRAINT sq_delivery_score_chk    CHECK (delivery_score IS NULL OR delivery_score BETWEEN 0 AND 100),
    CONSTRAINT sq_quality_score_chk     CHECK (quality_score  IS NULL OR quality_score  BETWEEN 0 AND 100),
    CONSTRAINT sq_sla_score_chk         CHECK (sla_score      IS NULL OR sla_score      BETWEEN 0 AND 100),
    CONSTRAINT sq_counts_chk            CHECK (sourcing_event_count >= 0 AND bid_count >= 0 AND awarded_count >= 0),
    CONSTRAINT sq_block_reason_chk      CHECK (NOT is_blocked OR block_reason IS NOT NULL),
    CONSTRAINT sq_onboarding_status_chk CHECK (onboarding_status IN (
                                            'pending','in_progress','under_review','approved','rejected')),
    CONSTRAINT sq_sanctions_status_chk  CHECK (sanctions_status IN (
                                            'not_checked','clear','flagged','blocked')),
    CONSTRAINT sq_aml_kyc_status_chk    CHECK (aml_kyc_status IN (
                                            'not_started','in_progress','passed','failed','expired')),
    CONSTRAINT sq_risk_tier_chk         CHECK (risk_tier IS NULL OR risk_tier IN (
                                            'low','medium','high','critical')),
    CONSTRAINT sq_status_chk            CHECK (status IN ('active','inactive'))
);

CREATE INDEX IF NOT EXISTS sq_supplier_idx
    ON master.supplier_qualification (tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS sq_onboarding_idx
    ON master.supplier_qualification (tenant_id, onboarding_status);
CREATE INDEX IF NOT EXISTS sq_blocked_pidx
    ON master.supplier_qualification (tenant_id)
    WHERE is_blocked = true AND is_active = true;

COMMENT ON TABLE master.supplier_qualification IS
    'ARCHETYPE=B;SCOPE=T. Supplier qualification, risk, and performance record. '
    'One row per (tenant, supplier). Covers onboarding, procurement approval, KYC/AML, performance scores. '
    'is_blocked = true gates supplier from appearing on new purchase orders.';
COMMENT ON COLUMN master.supplier_qualification.profile_completeness_pct IS
    'Computed percentage of required onboarding fields completed (0–100). Updated by onboarding workflow.';
COMMENT ON COLUMN master.supplier_qualification.is_blocked IS
    'Hard procurement block. block_reason IS NOT NULL required when is_blocked = true.';


-- ── Part F: master.customer_qualification ─────────────────────────────────────
-- One row per (tenant, customer). Credit, KYC/AML, AR risk, collections eligibility.

CREATE TABLE IF NOT EXISTS master.customer_qualification (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    customer_id     uuid        NOT NULL,

    -- Credit assessment
    credit_status               text        NOT NULL DEFAULT 'not_assessed',
    credit_limit_band           text,
    credit_score                integer,
    credit_rating               text,

    -- AR risk (denormalized for fast access)
    dso_days                    smallint,
    payment_behavior            text,
    has_overdue_history         boolean     NOT NULL DEFAULT false,

    -- KYC / AML
    kyc_status                  text        NOT NULL DEFAULT 'not_started',
    aml_sanctions_status        text        NOT NULL DEFAULT 'not_checked',
    beneficial_owner_check_status text,
    kyc_check_date              date,
    kyc_expiry_date             date,

    -- Collections eligibility
    is_dunning_eligible         boolean     NOT NULL DEFAULT true,
    is_statement_eligible       boolean     NOT NULL DEFAULT true,
    dunning_hold_reason         text,

    -- Credit review cycle
    last_credit_review_date     date,
    next_credit_review_date     date,
    reviewer_id                 uuid,

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

    CONSTRAINT cq_pkey                  PRIMARY KEY (id),
    CONSTRAINT cq_tenant_uq             UNIQUE (tenant_id, id),
    CONSTRAINT cq_customer_uq           UNIQUE (tenant_id, customer_id),
    CONSTRAINT cq_credit_score_chk      CHECK (credit_score IS NULL OR (credit_score BETWEEN 0 AND 1000)),
    CONSTRAINT cq_dso_chk               CHECK (dso_days IS NULL OR dso_days >= 0),
    CONSTRAINT cq_credit_status_chk     CHECK (credit_status IN (
                                            'not_assessed','approved','conditional','on_hold','blocked')),
    CONSTRAINT cq_kyc_status_chk        CHECK (kyc_status IN (
                                            'not_started','in_progress','passed','failed','expired')),
    CONSTRAINT cq_aml_status_chk        CHECK (aml_sanctions_status IN (
                                            'not_checked','clear','flagged','blocked')),
    CONSTRAINT cq_payment_behavior_chk  CHECK (payment_behavior IS NULL OR payment_behavior IN (
                                            'excellent','good','average','poor','bad')),
    CONSTRAINT cq_dunning_hold_chk      CHECK (is_dunning_eligible OR dunning_hold_reason IS NOT NULL),
    CONSTRAINT cq_status_chk            CHECK (status IN ('active','inactive'))
);

CREATE INDEX IF NOT EXISTS cq_customer_idx
    ON master.customer_qualification (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS cq_credit_status_idx
    ON master.customer_qualification (tenant_id, credit_status);
CREATE INDEX IF NOT EXISTS cq_blocked_pidx
    ON master.customer_qualification (tenant_id)
    WHERE credit_status = 'blocked' AND is_active = true;

COMMENT ON TABLE master.customer_qualification IS
    'ARCHETYPE=B;SCOPE=T. Customer credit, KYC/AML, and AR risk qualification. '
    'One row per (tenant, customer). Core AR finance control gate. '
    'credit_status=blocked prevents new credit exposure. '
    'dso_days/payment_behavior denormalized from AR aging worker for fast access.';
COMMENT ON COLUMN master.customer_qualification.credit_status IS
    'Credit decision gate: not_assessed | approved | conditional | on_hold | blocked.';
COMMENT ON COLUMN master.customer_qualification.dso_days IS
    'Days Sales Outstanding — recomputed by AR analytics worker from ledger aging.';
