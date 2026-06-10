-- ============================================================================
-- control/01z_three_plane_tables.sql
-- Concept: Three-plane permission stack — DDL extensions to control.*
-- Depends on: control/01_tables.sql (entity, entity_operation, entity_version),
--             shared/01_tables.sql (shared.permission)
-- Scope:
--   1. Plane-eligibility tags on entity catalog + per-operation override
--   2. control.entity_lifecycle_state_mask  — the 5th capability gate
--   3. control.permission_alias              — edit/update migration table
--   4. control.entity_version lock columns   — EFFECTIVE immutability + emergency override
-- Reference: docs/local/architecture/three-plane-permission-stack.md  D8/D9/D14
-- ============================================================================


-- ----------------------------------------------------------------------------
-- §1  Plane tags on control.entity
-- ----------------------------------------------------------------------------
ALTER TABLE control.entity
    ADD COLUMN IF NOT EXISTS plane_eligibility text[] NOT NULL DEFAULT ARRAY['neon'];

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'entity_plane_eligibility_chk'
          AND conrelid = 'control.entity'::regclass
    ) THEN
        ALTER TABLE control.entity
            ADD CONSTRAINT entity_plane_eligibility_chk
            CHECK (cardinality(plane_eligibility) > 0
                   AND plane_eligibility <@ ARRAY['neon','admin','mesh']);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS entity_plane_eligibility_gin
    ON control.entity USING GIN (plane_eligibility);

COMMENT ON COLUMN control.entity.plane_eligibility IS
    'Which product planes (neon|admin|mesh) may compile a descriptor for this entity. '
    'Defaults to neon. Admin meta-entities tag [''admin'']; mesh-facing entities add ''mesh''.';


-- ----------------------------------------------------------------------------
-- §2  Per-operation plane filter (overrides parent entity scope)
-- ----------------------------------------------------------------------------
ALTER TABLE control.entity_operation
    ADD COLUMN IF NOT EXISTS plane_filter text[];

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'eo_plane_filter_chk'
          AND conrelid = 'control.entity_operation'::regclass
    ) THEN
        ALTER TABLE control.entity_operation
            ADD CONSTRAINT eo_plane_filter_chk
            CHECK (plane_filter IS NULL
                   OR plane_filter <@ ARRAY['neon','admin','mesh']);
    END IF;
END $$;

COMMENT ON COLUMN control.entity_operation.plane_filter IS
    'Per-operation override of entity.plane_eligibility. NULL = inherit parent. '
    'Use when an entity surfaces in multiple planes but specific operations are plane-bound.';


-- ----------------------------------------------------------------------------
-- §3  control.entity_lifecycle_state_mask — 5th capability gate
-- ----------------------------------------------------------------------------
-- For (tenant, entity, record_status) declare which actions remain available.
-- Replaces the hardcoded EDITABLE_STATUSES Set in line-items-surface.tsx.
-- Resolved during descriptor compile; emits disabled_reason when blocked.

CREATE TABLE IF NOT EXISTS control.entity_lifecycle_state_mask (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid,                                       -- NULL = platform default
    entity_name         text        NOT NULL,
    record_status       text        NOT NULL,

    -- Capability gates
    can_edit            boolean     NOT NULL DEFAULT true,
    can_delete          boolean     NOT NULL DEFAULT true,
    can_transition_to   text[],                                     -- explicit allowed lifecycle targets

    -- UX
    disabled_reason     text,                                       -- 'posted_locked', 'archived_immutable', ...
    applies_to_planes   text[]      NOT NULL DEFAULT ARRAY['neon','admin','mesh'],

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT elsm_pkey               PRIMARY KEY (id),
    CONSTRAINT elsm_binding_uq         UNIQUE NULLS NOT DISTINCT (tenant_id, entity_name, record_status),
    CONSTRAINT elsm_entity_chk         CHECK (btrim(entity_name) <> ''),
    CONSTRAINT elsm_status_chk         CHECK (btrim(record_status) <> ''),
    CONSTRAINT elsm_planes_chk         CHECK (cardinality(applies_to_planes) > 0
                                              AND applies_to_planes <@ ARRAY['neon','admin','mesh']),
    CONSTRAINT elsm_reason_chk         CHECK (disabled_reason IS NULL OR btrim(disabled_reason) <> '')
);

CREATE INDEX IF NOT EXISTS elsm_lookup_idx
    ON control.entity_lifecycle_state_mask (entity_name, record_status, tenant_id);

COMMENT ON TABLE control.entity_lifecycle_state_mask IS
    'ARCHETYPE=C;SCOPE=B. Per-status capability mask — the 5th authorization gate after '
    'permission/operation/policy/plan. Resolved during descriptor compile. '
    'Replaces hardcoded EDITABLE_STATUSES constant in runtime-canvas. '
    'NULL tenant_id = platform default; tenant override wins when both present.';


-- ----------------------------------------------------------------------------
-- §4  control.permission_alias — update/edit migration table
-- ----------------------------------------------------------------------------
-- Resolver maps alias_code → canonical_code at lookup time. Warn-first phase
-- keeps alias_code rows in shared.permission active for backwards compat.
-- Hard-fail phase (set hard_fail_after) will reject any entity_operation row
-- still referencing the alias_code.

CREATE TABLE IF NOT EXISTS control.permission_alias (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    canonical_code      text        NOT NULL,                       -- FK to shared.permission.code (deferred)
    alias_code          text        NOT NULL,                       -- the deprecated synonym
    deprecated_at       timestamptz NOT NULL DEFAULT now(),
    hard_fail_after     timestamptz,                                -- NULL = warn-only; after this, CI fails on alias use
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT pa_pkey                 PRIMARY KEY (id),
    CONSTRAINT pa_alias_uq             UNIQUE (alias_code),
    CONSTRAINT pa_self_chk             CHECK (canonical_code <> alias_code),
    CONSTRAINT pa_canonical_chk        CHECK (btrim(canonical_code) <> ''),
    CONSTRAINT pa_alias_chk            CHECK (btrim(alias_code) <> '')
);

CREATE INDEX IF NOT EXISTS pa_canonical_idx
    ON control.permission_alias (canonical_code);

COMMENT ON TABLE control.permission_alias IS
    'Permission code aliases for D6 (update vs edit) migration. '
    'Resolver consults this table; alias_code rows in shared.permission remain active during warn phase. '
    'When hard_fail_after passes, server/scripts/verify/permission-aliases.ts fails CI on alias use.';


-- ----------------------------------------------------------------------------
-- §5  control.entity_version EFFECTIVE-immutability + emergency override
-- ----------------------------------------------------------------------------

ALTER TABLE control.entity_version
    ADD COLUMN IF NOT EXISTS locked_after_effective    boolean     NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS emergency_override_at     timestamptz,
    ADD COLUMN IF NOT EXISTS emergency_override_by     uuid,
    ADD COLUMN IF NOT EXISTS emergency_override_reason text,
    ADD COLUMN IF NOT EXISTS emergency_override_ticket text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ev_override_quorum_chk'
          AND conrelid = 'control.entity_version'::regclass
    ) THEN
        ALTER TABLE control.entity_version
            ADD CONSTRAINT ev_override_quorum_chk
            CHECK (
                emergency_override_at IS NULL
                OR (
                    emergency_override_by     IS NOT NULL
                AND emergency_override_reason IS NOT NULL
                AND btrim(emergency_override_reason) <> ''
                AND emergency_override_ticket IS NOT NULL
                AND btrim(emergency_override_ticket) <> ''
                )
            );
    END IF;
END $$;

COMMENT ON COLUMN control.entity_version.locked_after_effective IS
    'D14. When true (default) and status=EFFECTIVE, the trg_ev_block_mutation trigger '
    'rejects UPDATE/DELETE unless the emergency_override_* fields are populated with a CAB ticket.';

COMMENT ON COLUMN control.entity_version.emergency_override_ticket IS
    'CAB or incident ticket reference. Mandatory whenever emergency_override_at is set. '
    'Audited via log.descriptor_cache_invalidation with reason=''emergency_override''.';
