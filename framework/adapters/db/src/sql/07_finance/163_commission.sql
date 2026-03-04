-- 163_commission.sql
-- Commission Engine tables (Phase 2)
-- Schema: fin

-- Ensure fin schema exists
CREATE SCHEMA IF NOT EXISTS fin;

-- =============================================================================
-- fin.commission_plan
-- Defines commission plan structures: flat rate, tiered, percentage, or formula
-- =============================================================================
CREATE TABLE IF NOT EXISTS fin.commission_plan (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(50) NOT NULL,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    plan_type       VARCHAR(20) NOT NULL CHECK (plan_type IN ('FLAT_RATE', 'TIERED', 'PERCENTAGE', 'FORMULA')),
    base_metric     VARCHAR(20) NOT NULL CHECK (base_metric IN ('REVENUE', 'GROSS_MARGIN', 'NET_PROFIT', 'QUANTITY')),
    tiers           JSONB,
    formula         TEXT,
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    clawback_window_days INTEGER NOT NULL DEFAULT 0,
    clawback_triggers TEXT[],
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_commission_plan_tenant_entity_code UNIQUE (tenant_id, entity_code, code)
);

CREATE INDEX IF NOT EXISTS idx_commission_plan_tenant
    ON fin.commission_plan (tenant_id, entity_code);

CREATE INDEX IF NOT EXISTS idx_commission_plan_active
    ON fin.commission_plan (tenant_id, is_active)
    WHERE is_active = TRUE;

COMMENT ON TABLE fin.commission_plan IS 'Commission plan definitions supporting flat-rate, tiered, percentage, and formula-based calculations';

-- =============================================================================
-- fin.commission_assignment
-- Links partners (employees, agents, resellers, affiliates) to commission plans
-- =============================================================================
CREATE TABLE IF NOT EXISTS fin.commission_assignment (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(50) NOT NULL,
    partner_id      UUID NOT NULL,
    partner_type    VARCHAR(20) NOT NULL CHECK (partner_type IN ('EMPLOYEE', 'AGENT', 'RESELLER', 'AFFILIATE')),
    plan_id         UUID NOT NULL REFERENCES fin.commission_plan(id),
    split_pct       DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_commission_assignment_partner_plan_period UNIQUE (tenant_id, partner_id, plan_id, effective_from),
    CONSTRAINT chk_split_pct_range CHECK (split_pct > 0 AND split_pct <= 100.00)
);

CREATE INDEX IF NOT EXISTS idx_commission_assignment_partner
    ON fin.commission_assignment (tenant_id, partner_id);

CREATE INDEX IF NOT EXISTS idx_commission_assignment_plan
    ON fin.commission_assignment (plan_id);

COMMENT ON TABLE fin.commission_assignment IS 'Assigns commission plans to partners with optional split percentages and effective date ranges';

-- =============================================================================
-- fin.commission_calculation
-- Individual commission calculation records tied to transactions/documents
-- =============================================================================
CREATE TABLE IF NOT EXISTS fin.commission_calculation (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(50) NOT NULL,
    partner_id          UUID NOT NULL,
    plan_id             UUID NOT NULL REFERENCES fin.commission_plan(id),
    txn_id              UUID,
    doc_id              UUID,
    base_amount         DECIMAL(18,4) NOT NULL,
    commission_rate     DECIMAL(8,4) NOT NULL,
    commission_amount   DECIMAL(18,4) NOT NULL,
    currency_code       VARCHAR(3) NOT NULL DEFAULT 'USD',
    split_pct           DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    status              VARCHAR(20) NOT NULL DEFAULT 'CALCULATED'
                        CHECK (status IN ('CALCULATED', 'ACCRUED', 'APPROVED', 'SETTLED', 'CLAWED_BACK')),
    accrual_je_id       UUID,       -- FK added in 190_posting.sql (forward dependency)
    settlement_je_id    UUID,       -- FK added in 190_posting.sql (forward dependency)
    clawback_je_id      UUID,       -- FK added in 190_posting.sql (forward dependency)
    clawback_reason     TEXT,
    calculated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    accrued_at          TIMESTAMPTZ,
    approved_at         TIMESTAMPTZ,
    settled_at          TIMESTAMPTZ,
    clawed_back_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_calculation_partner
    ON fin.commission_calculation (tenant_id, partner_id);

CREATE INDEX IF NOT EXISTS idx_commission_calculation_plan
    ON fin.commission_calculation (plan_id);

CREATE INDEX IF NOT EXISTS idx_commission_calculation_status
    ON fin.commission_calculation (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_commission_calculation_txn
    ON fin.commission_calculation (txn_id)
    WHERE txn_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_calculation_doc
    ON fin.commission_calculation (doc_id)
    WHERE doc_id IS NOT NULL;

COMMENT ON TABLE fin.commission_calculation IS 'Individual commission calculations linked to transactions or documents, tracking full lifecycle from calculation through settlement or clawback';

-- =============================================================================
-- fin.commission_statement
-- Periodic commission statements aggregating calculations for a partner
-- =============================================================================
CREATE TABLE IF NOT EXISTS fin.commission_statement (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(50) NOT NULL,
    partner_id          UUID NOT NULL,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    total_calculated    DECIMAL(18,4) NOT NULL DEFAULT 0,
    total_accrued       DECIMAL(18,4) NOT NULL DEFAULT 0,
    total_settled       DECIMAL(18,4) NOT NULL DEFAULT 0,
    total_clawed_back   DECIMAL(18,4) NOT NULL DEFAULT 0,
    net_payable         DECIMAL(18,4) NOT NULL DEFAULT 0,
    currency_code       VARCHAR(3) NOT NULL DEFAULT 'USD',
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT', 'GENERATED', 'APPROVED', 'PAID')),
    generated_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_statement_partner
    ON fin.commission_statement (tenant_id, partner_id);

CREATE INDEX IF NOT EXISTS idx_commission_statement_period
    ON fin.commission_statement (tenant_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_commission_statement_status
    ON fin.commission_statement (tenant_id, status);

COMMENT ON TABLE fin.commission_statement IS 'Periodic commission statements summarising calculated, accrued, settled, and clawed-back amounts per partner';
