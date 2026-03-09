-- ============================================================================
-- 214_cfo_action_workspace.sql
--
-- Phase 12: Generic tables for CFO Action Workspace & Commentary Loop.
--   fin.action_item     — polymorphic, reusable attention/action tracking
--   fin.decision_log    — immutable, append-only decision capture
--   fin.followup_link   — cross-period carry-forward linking
--
-- Design principles:
--   1. Generic & reusable — not CFO-specific
--   2. Polymorphic target_kind — works across modules
--   3. Append-only where appropriate (decision_log)
-- ============================================================================

-- ============================================================================
-- fin.action_item — Generic action/attention item tracker
-- ============================================================================
-- Reusable across CFO workspace, audit, compliance, operations.
-- Supports assignment, severity classification, lifecycle tracking.

CREATE TABLE IF NOT EXISTS fin.action_item (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    -- Polymorphic target
    target_kind     VARCHAR(30) NOT NULL
                    CHECK (target_kind IN (
                        'period_close',
                        'pack_instance',
                        'statement',
                        'release',
                        'entity'
                    )),
    target_id       UUID,                   -- nullable for entity-level items

    -- Content
    title           VARCHAR(300) NOT NULL,
    detail          TEXT,
    severity        VARCHAR(15) NOT NULL DEFAULT 'medium'
                    CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    priority        SMALLINT,
    category        VARCHAR(50),            -- e.g. 'sla_breach', 'certification_gap', 'override_risk'

    -- Assignment
    assigned_to     UUID,
    assigned_role   VARCHAR(50),
    assigned_at     TIMESTAMPTZ,
    due_at          TIMESTAMPTZ,

    -- Lifecycle
    status          VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'dismissed')),
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID,
    resolution_note TEXT,

    -- Source tracking (manual vs system-generated vs carry-forward)
    source          VARCHAR(20) NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'system', 'carryforward')),
    source_ref      VARCHAR(100),           -- originating ID for carry-forward

    -- Period context
    fiscal_year     SMALLINT,
    period_number   SMALLINT,

    -- Extensible payload
    structured_data JSONB,

    -- Audit
    created_by      UUID,
    created_by_name VARCHAR(200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_action_item_target
    ON fin.action_item(tenant_id, entity_code, target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_fin_action_item_open
    ON fin.action_item(tenant_id, entity_code, status)
    WHERE status NOT IN ('resolved', 'dismissed');
CREATE INDEX IF NOT EXISTS idx_fin_action_item_period
    ON fin.action_item(tenant_id, entity_code, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_fin_action_item_assigned
    ON fin.action_item(assigned_to) WHERE assigned_to IS NOT NULL;


-- ============================================================================
-- fin.decision_log — Immutable, append-only decision capture
-- ============================================================================
-- Generic decision recording across all finance modules.
-- Same pattern as fin.release_decision_log but polymorphic target.

CREATE TABLE IF NOT EXISTS fin.decision_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    -- Polymorphic target
    target_kind     VARCHAR(30) NOT NULL
                    CHECK (target_kind IN (
                        'period_close',
                        'pack_instance',
                        'action_item',
                        'release',
                        'statement',
                        'entity'
                    )),
    target_id       UUID,

    -- Decision content
    decision_type   VARCHAR(20) NOT NULL
                    CHECK (decision_type IN (
                        'approve', 'reject', 'override',
                        'escalate', 'defer', 'note', 'waive'
                    )),
    title           VARCHAR(300) NOT NULL,
    rationale       TEXT,

    -- Context snapshot at decision time (immutable)
    context_snapshot JSONB,

    -- Optional link to an action_item being decided on
    related_item_id UUID REFERENCES fin.action_item(id),

    -- Period context
    fiscal_year     SMALLINT,
    period_number   SMALLINT,

    -- Audit (immutable — decided_at is the record timestamp)
    decided_by      UUID NOT NULL,
    decided_by_name VARCHAR(200),
    decided_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No UPDATE or DELETE expected — append-only by convention
CREATE INDEX IF NOT EXISTS idx_fin_decision_log_target
    ON fin.decision_log(tenant_id, entity_code, target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_fin_decision_log_period
    ON fin.decision_log(tenant_id, entity_code, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_fin_decision_log_item
    ON fin.decision_log(related_item_id)
    WHERE related_item_id IS NOT NULL;


-- ============================================================================
-- fin.followup_link — Cross-period carry-forward linking
-- ============================================================================
-- Lightweight table that links unresolved items across periods.
-- Reusable for action_items, decisions, exceptions, overrides.

CREATE TABLE IF NOT EXISTS fin.followup_link (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    -- Source (where it came from)
    source_kind     VARCHAR(30) NOT NULL
                    CHECK (source_kind IN (
                        'action_item', 'decision', 'exception', 'override'
                    )),
    source_id       UUID NOT NULL,
    source_period   SMALLINT NOT NULL,
    source_fy       SMALLINT NOT NULL,

    -- Target (where it carries to)
    target_period   SMALLINT NOT NULL,
    target_fy       SMALLINT NOT NULL,

    -- Carry-forward metadata
    reason          VARCHAR(30) NOT NULL
                    CHECK (reason IN ('unresolved', 'recurring', 'deferred', 'escalated')),
    carry_note      TEXT,

    -- Resolution in target period
    resolved        BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at     TIMESTAMPTZ,
    resolved_ref    UUID,                   -- action_item or decision that resolved it

    -- Audit
    created_by      UUID,
    created_by_name VARCHAR(200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_followup_source
    ON fin.followup_link(tenant_id, entity_code, source_fy, source_period);
CREATE INDEX IF NOT EXISTS idx_fin_followup_target
    ON fin.followup_link(tenant_id, entity_code, target_fy, target_period)
    WHERE NOT resolved;
