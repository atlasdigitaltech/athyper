-- ============================================================================
-- master/01i_tables_party_master.sql
-- Concept: Party qualification, network links, and IdP identity bindings
-- Depends on: 01h_tables_business_partner.sql (master.supplier, master.customer)
--             01b_tables_finance.sql (master.legal_entity)
--
-- Tables:
--   §PQ1  master.supplier_qualification       — onboarding, risk, performance (role-specific)
--   §PQ2  master.customer_qualification       — credit, KYC/AML, AR risk (role-specific)
--   §PQ3  master.business_partner_network_link — external network account links (BP-level)
--   §PQ4  master.legal_entity_identity_binding — IdP org to legal entity binding
--
-- FKs       → 03_constraints.sql
-- Indexes   → 04_indexes.sql (inline below for inline deployment)
-- Triggers  → 06_triggers.sql
-- RLS       → 08_rls.sql
-- ============================================================================


-- ============================================================================
-- §PQ1  master.supplier_qualification — supplier standing, risk, and performance
-- One row per (tenant, supplier). Role-specific — supplier_id FK.
-- ============================================================================

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

    -- Risk & compliance
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
    CONSTRAINT sq_counts_chk            CHECK (sourcing_event_count >= 0
                                            AND bid_count >= 0
                                            AND awarded_count >= 0),
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
    'is_blocked=true gates supplier from appearing on new purchase orders.';
COMMENT ON COLUMN master.supplier_qualification.profile_completeness_pct IS
    'Computed percentage of required onboarding fields completed (0–100). Updated by onboarding workflow.';
COMMENT ON COLUMN master.supplier_qualification.is_blocked IS
    'Hard procurement block. block_reason IS NOT NULL required when is_blocked=true.';


-- ============================================================================
-- §PQ2  master.customer_qualification — customer credit, KYC/AML, AR risk
-- One row per (tenant, customer). Role-specific — customer_id FK.
-- ============================================================================

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
    'credit_status=blocked prevents new credit exposure.';
COMMENT ON COLUMN master.customer_qualification.credit_status IS
    'Credit decision gate: not_assessed | approved | conditional | on_hold | blocked.';
COMMENT ON COLUMN master.customer_qualification.dso_days IS
    'Days Sales Outstanding — recomputed by AR analytics worker from ledger aging.';


-- ============================================================================
-- §PQ3  master.business_partner_network_link — external network account links
-- One row per (BP, network provider). Future network platform anchor.
-- Connection/sync state tracked here; actual sync records in the events outbox.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.business_partner_network_link (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    business_partner_id     uuid        NOT NULL,

    -- Network provider identity
    provider_code           text        NOT NULL,
        -- 'athyper_network' | 'ariba' | 'peppol' | 'tradeshift' | 'custom'
    network_account_id      text        NOT NULL,
    external_party_id       text,

    -- Peer platform (same-platform tenant network)
    remote_tenant_id        uuid,
    remote_business_partner_id uuid,

    -- Connection state
    connection_status       text        NOT NULL DEFAULT 'not_linked',
        -- 'not_linked' | 'invited' | 'connected' | 'suspended'
    verification_status     text        NOT NULL DEFAULT 'unverified',
        -- 'unverified' | 'matched' | 'verified' | 'conflict'
    match_confidence        numeric(5,2),

    -- Sync state
    sync_status             text        NOT NULL DEFAULT 'pending',
        -- 'pending' | 'synced' | 'drift' | 'error'
    last_synced_at          timestamptz,

    -- Timeline
    invited_at              timestamptz,
    connected_at            timestamptz,

    -- Raw provider data
    network_snapshot        jsonb,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT bpnl_pkey                    PRIMARY KEY (id),
    CONSTRAINT bpnl_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT bpnl_bp_provider_uq          UNIQUE (tenant_id, business_partner_id, provider_code),
    CONSTRAINT bpnl_provider_account_uq     UNIQUE (provider_code, network_account_id),
    CONSTRAINT bpnl_network_account_nonempty CHECK (btrim(network_account_id) <> ''),
    CONSTRAINT bpnl_provider_code_chk       CHECK (provider_code IN (
                                                 'athyper_network', 'ariba', 'peppol',
                                                 'tradeshift', 'custom')),
    CONSTRAINT bpnl_connection_status_chk   CHECK (connection_status IN (
                                                 'not_linked', 'invited',
                                                 'connected', 'suspended')),
    CONSTRAINT bpnl_verification_status_chk CHECK (verification_status IN (
                                                 'unverified', 'matched',
                                                 'verified', 'conflict')),
    CONSTRAINT bpnl_sync_status_chk         CHECK (sync_status IN (
                                                 'pending', 'synced', 'drift', 'error')),
    CONSTRAINT bpnl_match_confidence_chk    CHECK (match_confidence IS NULL
                                                   OR (match_confidence >= 0 AND match_confidence <= 100)),
    CONSTRAINT bpnl_audit_pair_chk          CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE INDEX IF NOT EXISTS bpnl_bp_idx
    ON master.business_partner_network_link (tenant_id, business_partner_id);
CREATE INDEX IF NOT EXISTS bpnl_provider_idx
    ON master.business_partner_network_link (provider_code, network_account_id);
CREATE INDEX IF NOT EXISTS bpnl_sync_pidx
    ON master.business_partner_network_link (tenant_id, sync_status)
    WHERE sync_status IN ('pending', 'drift', 'error');

COMMENT ON TABLE master.business_partner_network_link IS
    'ARCHETYPE=B;SCOPE=T. External network account links for a business partner. '
    'One row per (BP, provider). Tracks connection, verification, and sync state. '
    'Full sync logs and network snapshots belong in the Network tab/drawer, not headers.';
COMMENT ON COLUMN master.business_partner_network_link.provider_code IS
    'Network provider: athyper_network | ariba | peppol | tradeshift | custom.';
COMMENT ON COLUMN master.business_partner_network_link.remote_tenant_id IS
    'Same-platform peer tenant. Populated only when provider_code=athyper_network.';
COMMENT ON COLUMN master.business_partner_network_link.connection_status IS
    'Header state: not_linked | invited | connected | suspended. '
    'This is what the UI badge shows. Full sync details are in Network tab.';


-- ============================================================================
-- §PQ4  master.legal_entity_identity_binding — IdP org to legal entity binding
-- One row per (legal_entity, provider). Multi-IdP ready.
-- Mirrors master.principal_identity_binding pattern (without user-specific fields).
-- Keycloak Org maps to master.legal_entity through this table.
-- Design: no 'keycloak' in table/column names; provider_code values may reference providers.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.legal_entity_identity_binding (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    legal_entity_id     uuid        NOT NULL,

    -- Provider identity (sealed protocol vocabulary)
    provider_code       text        NOT NULL,
        -- 'keycloak' | 'azure_ad' | 'okta' | 'google' | 'saml_generic' | 'oidc_generic'
    realm_key           text        NOT NULL,

    -- External IdP org identity
    subject_id          text        NOT NULL,   -- IdP org UUID / org ID
    org_alias           text        NOT NULL,   -- e.g. athyper--ATHQ-LE
    org_name            text,
    org_path            text,

    -- Sync health
    synced_at           timestamptz,
    sync_status         text        NOT NULL DEFAULT 'pending',
    sync_error_message  text,
    sync_retry_count    smallint    NOT NULL DEFAULT 0,

    -- Raw IdP data
    idp_snapshot        jsonb,
    provider_attributes jsonb,

    -- IdP lifecycle
    idp_enabled         boolean     NOT NULL DEFAULT true,

    -- Metadata
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT leib_pkey                    PRIMARY KEY (id),
    CONSTRAINT leib_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT leib_legal_entity_provider_uq UNIQUE (tenant_id, legal_entity_id, provider_code),
    CONSTRAINT leib_subject_provider_uq     UNIQUE (provider_code, realm_key, subject_id),
    CONSTRAINT leib_alias_provider_uq       UNIQUE (provider_code, realm_key, org_alias),
    CONSTRAINT leib_provider_code_chk       CHECK (provider_code IN (
                                                'keycloak', 'azure_ad', 'okta', 'google',
                                                'saml_generic', 'oidc_generic')),
    CONSTRAINT leib_sync_status_chk         CHECK (sync_status IN (
                                                'pending', 'synced', 'drift', 'error', 'disabled')),
    CONSTRAINT leib_subject_nonempty        CHECK (btrim(subject_id) <> ''),
    CONSTRAINT leib_org_alias_nonempty      CHECK (btrim(org_alias) <> ''),
    CONSTRAINT leib_realm_key_nonempty      CHECK (btrim(realm_key) <> ''),
    CONSTRAINT leib_sync_retry_chk          CHECK (sync_retry_count >= 0),
    CONSTRAINT leib_audit_pair_chk          CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE INDEX IF NOT EXISTS leib_legal_entity_idx
    ON master.legal_entity_identity_binding (tenant_id, legal_entity_id);
CREATE INDEX IF NOT EXISTS leib_sync_pidx
    ON master.legal_entity_identity_binding (tenant_id, sync_status)
    WHERE sync_status IN ('pending', 'drift', 'error');

COMMENT ON TABLE master.legal_entity_identity_binding IS
    'ARCHETYPE=B;SCOPE=T. IAM / IdP organisation to legal entity binding. '
    'One row per (legal_entity, provider). Supports multiple IdP providers '
    '(Keycloak, Azure AD, Okta, Google, SAML, OIDC). '
    'X-Org header: tenant_code--legal_entity_code. '
    'Mirrors principal_identity_binding pattern — no user-specific fields. '
    'sync_status tracks IdP sync health only, not business lifecycle.';
COMMENT ON COLUMN master.legal_entity_identity_binding.subject_id IS
    'IdP organisation UUID / org ID. Unique per (provider, realm). Provider-neutral naming.';
COMMENT ON COLUMN master.legal_entity_identity_binding.org_alias IS
    'Organisation alias from the IdP (e.g. athyper--ATHQ-LE). Unique per (provider, realm).';
COMMENT ON COLUMN master.legal_entity_identity_binding.sync_status IS
    'IdP sync health: pending | synced | drift | error | disabled. '
    'Not a business lifecycle — master.legal_entity.status governs business state.';
