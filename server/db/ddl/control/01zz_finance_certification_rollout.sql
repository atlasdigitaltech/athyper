-- Finance Setup Phase 2, Stage F: explicit posting-gate rollout policy.
-- The feature flag enables the gate capability; this policy decides whether a
-- tenant/company is observation-only or enforcement-active.

CREATE TABLE IF NOT EXISTS control.finance_posting_rollout_policy (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    company_code_id     uuid,
    rollout_mode        text        NOT NULL DEFAULT 'observe',
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    reason              text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT fprp_pkey PRIMARY KEY (id),
    CONSTRAINT fprp_tenant_id_uq UNIQUE (tenant_id,id),
    CONSTRAINT fprp_scope_uq UNIQUE NULLS NOT DISTINCT (tenant_id,company_code_id),
    CONSTRAINT fprp_mode_chk CHECK (rollout_mode IN ('observe','enforce')),
    CONSTRAINT fprp_status_chk CHECK (status IN ('active','inactive'))
);

COMMENT ON TABLE control.finance_posting_rollout_policy IS
  'Stage F rollout control. Company policy overrides tenant policy. Existing tenants default to observe; enforce blocks production posting without current four-domain finance certification.';

