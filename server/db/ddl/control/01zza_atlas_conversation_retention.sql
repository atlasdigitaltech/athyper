-- Tenant retention overrides for Atlas transcripts. The request client never
-- supplies a retention value; this table is the sole tenant-level source.

CREATE TABLE IF NOT EXISTS control.atlas_conversation_retention_policy (
    tenant_id       uuid        NOT NULL,
    retention_days  integer     NOT NULL,
    revision        integer     NOT NULL DEFAULT 1,
    status          text        NOT NULL DEFAULT 'active',
    effective_from  timestamptz NOT NULL DEFAULT now(),
    effective_to    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT atlas_conversation_retention_policy_pkey PRIMARY KEY (tenant_id),
    CONSTRAINT atlas_conversation_retention_days_chk
        CHECK (retention_days BETWEEN 1 AND 3650),
    CONSTRAINT atlas_conversation_retention_revision_chk
        CHECK (revision >= 1),
    CONSTRAINT atlas_conversation_retention_status_chk
        CHECK (status IN ('active', 'disabled')),
    CONSTRAINT atlas_conversation_retention_effective_chk
        CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE control.atlas_conversation_retention_policy IS
    'ARCHETYPE=C;SCOPE=T. Server-resolved tenant retention override for Atlas transcripts. '
    'The runtime additionally enforces the platform minimum and maximum.';
