-- ============================================================================
-- master/01t_tables_change_reason_code.sql
-- Concept: master.change_reason_code — controlled reason lookup for high-risk
--          audit-log entries (manual GL override, posting adjustment, restore
--          from snapshot, etc.).
-- Depends on: master/00_bootstrap.sql
-- Spec: docs/specs/lifecycle-snapshot-audit-model.md  (Phase 3 of the
--       lifecycle-vs-snapshot-vs-audit plan)
--
-- Why this exists:
--   The audit log currently carries free-text `change_reason` payload on a
--   handful of paths. To answer "why was this changed?" reliably for the
--   high-risk paths (account override, posting adjustment, snapshot restore,
--   etc.) the reason must come from a controlled list, not free text.
--   log.audit_log.reason_code FKs to this table.
--
-- Scope model:
--   • System-seeded base set: is_system=true, tenant_id IS NULL
--   • Tenant-custom additions: is_system=false, tenant_id NOT NULL
--   • Unique per (tenant_id, code) — system rows use the same NULL tenant slot
--
-- Severity model:
--   normal    — informational, no workflow impact
--   elevated  — surfaces in compliance reports and approver dashboards
--   critical  — triggers re-approval / period-close override workflow
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.change_reason_code (
    -- Identity
    id                  uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid,                       -- NULL for system rows

    -- Field identity
    code                text          NOT NULL,
    name                text          NOT NULL,
    description         text,

    -- Classification — which kind of change this reason applies to
    -- workflow    : amend / revision / approver correction
    -- accounting  : GL override, account profile bypass
    -- financial   : posting adjustment, tax recalculation, FX correction
    -- snapshot    : restore-from-snapshot / discard-session
    category            text          NOT NULL,

    -- Compliance signal — drives downstream surfacing (dashboards, reports)
    severity            text          NOT NULL DEFAULT 'normal',

    -- Scope marker (system vs tenant)
    is_system           boolean       NOT NULL DEFAULT false,

    -- Display
    sort_order          smallint      NOT NULL DEFAULT 100,

    -- Lifecycle (standard envelope)
    status              text          NOT NULL DEFAULT 'active',
    is_active           boolean       GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Tags & Metadata
    tags                jsonb         NOT NULL DEFAULT '[]'::jsonb,
    metadata            jsonb         NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at          timestamptz   NOT NULL DEFAULT now(),
    created_by          uuid          NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT change_reason_code_pkey         PRIMARY KEY (id),
    CONSTRAINT change_reason_code_tenant_uq    UNIQUE (tenant_id, id),
    CONSTRAINT change_reason_code_code_uq      UNIQUE (tenant_id, code),
    CONSTRAINT change_reason_code_category_chk CHECK (category IN (
        'workflow', 'accounting', 'financial', 'snapshot')),
    CONSTRAINT change_reason_code_severity_chk CHECK (severity IN (
        'normal', 'elevated', 'critical')),
    CONSTRAINT change_reason_code_status_chk   CHECK (status IN (
        'active', 'inactive', 'archived')),
    CONSTRAINT change_reason_code_code_fmt_chk CHECK (
        btrim(code) <> '' AND code = lower(code))
);

COMMENT ON TABLE  master.change_reason_code IS
    'ARCHETYPE=L;SCOPE=T. Controlled reason lookup for high-risk audit-log entries. '
    'log.audit_log.reason_code FKs here. System-seeded base set ships with the '
    'platform; tenants may add their own reasons (is_system=false).';
COMMENT ON COLUMN master.change_reason_code.code IS
    'Stable identifier used by code paths to require/select a reason. Lowercase, no spaces.';
COMMENT ON COLUMN master.change_reason_code.category IS
    'Which kind of mutation this reason explains: workflow / accounting / financial / snapshot.';
COMMENT ON COLUMN master.change_reason_code.severity IS
    'normal | elevated | critical — drives downstream surfacing (compliance reports, dashboards, re-approval gates).';
