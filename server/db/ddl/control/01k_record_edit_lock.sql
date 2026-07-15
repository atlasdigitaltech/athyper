-- ============================================================================
-- control/01k_record_edit_lock.sql
-- Concept: Pessimistic document edit locks for aggregate-root records
-- Depends on: control/01_tables.sql (shared.uuidv7, control schema)
-- Scope: One active lock per (tenant_id, aggregate_entity_name, aggregate_record_id).
--        Lock is acquired on Edit, renewed by heartbeat, released on Save/Cancel.
--        Stale locks (expires_at < now()) are evicted by the stale-lock-cleanup job
--        and opportunistically by the acquire transaction.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.record_edit_lock (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Aggregate root identity (entity_code + record UUID)
    aggregate_entity_name   text        NOT NULL,
    aggregate_record_id     uuid        NOT NULL,

    -- Lock holder
    locked_by               uuid        NOT NULL,   -- master.principal_id of the lock holder
    lock_token              text        NOT NULL,   -- opaque UUID token; client must present on save/heartbeat/release
    session_id              text,                   -- optional browser tab identifier (diagnostics only, not access control)

    -- Timing — all set by DB to avoid app-server clock drift
    acquired_at             timestamptz NOT NULL DEFAULT now(),
    expires_at              timestamptz NOT NULL,
    last_heartbeat_at       timestamptz NOT NULL DEFAULT now(),

    -- Optional context
    lock_reason             text,
    metadata                jsonb       NOT NULL DEFAULT '{}',

    CONSTRAINT rel_pkey             PRIMARY KEY (id),
    CONSTRAINT rel_one_lock_per_doc UNIQUE (tenant_id, aggregate_entity_name, aggregate_record_id),
    CONSTRAINT rel_token_nonempty   CHECK (btrim(lock_token) <> ''),
    CONSTRAINT rel_expiry_after_acq CHECK (expires_at > acquired_at)
);

-- Stale-lock eviction sweep (indexed by expiry for DELETE WHERE expires_at < now())
CREATE INDEX IF NOT EXISTS idx_rel_expires_at
    ON control.record_edit_lock (expires_at);

-- Tenant admin listing and lock lookup
CREATE INDEX IF NOT EXISTS idx_rel_tenant_entity
    ON control.record_edit_lock (tenant_id, aggregate_entity_name);

-- ── Add concurrency_policy JSON column to control.entity ──────────────────────
-- Stores per-entity concurrency strategy and rollout mode.
-- Example:
--   {"strategy":"lease_plus_version","rollout":"optional",
--    "version_column":"row_version","lock_ttl_seconds":300,"heartbeat_seconds":30}
-- strategy: none | version_only | lease_plus_version
-- rollout:  observe (log only) | optional (enforce only if token sent) | enforced (always require)

ALTER TABLE control.entity
    ADD COLUMN IF NOT EXISTS concurrency_policy jsonb NOT NULL DEFAULT '{}';

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE control.record_edit_lock IS
    'SCOPE=T. Pessimistic document edit lock — one active lock per aggregate root. '
    'Acquired on Edit (POST /api/records/:entity/:id/lock), renewed every 30 s by heartbeat, '
    'released on Save or Cancel. Stale locks are evicted by jobs-stale-lock sweep. '
    'RLS: tenant_read + tenant_write/update/delete; admin full access via athyperadmin.';

COMMENT ON COLUMN control.record_edit_lock.lock_token IS
    'Opaque random UUID issued to the client on acquire. '
    'Must be presented on save, heartbeat, and release calls. '
    'Prevents one principal from stealing another session''s lock.';

COMMENT ON COLUMN control.record_edit_lock.session_id IS
    'Optional browser tab/session identifier stored for admin diagnostics. '
    'Not used for access control — the lock_token is the authoritative credential.';

COMMENT ON COLUMN control.record_edit_lock.expires_at IS
    'Wall-clock expiry derived from now() + interval at acquire/renew time. '
    'Always set by the DB (not app server) to avoid clock drift across API pods.';

COMMENT ON COLUMN control.entity.concurrency_policy IS
    'Concurrency strategy for this entity. '
    'Example: {"strategy":"lease_plus_version","rollout":"optional","version_column":"row_version","lock_ttl_seconds":300,"heartbeat_seconds":30} '
    'strategy: none | version_only | lease_plus_version. '
    'rollout: observe (log, never block) | optional (enforce only when client sends token) | enforced (always require token + version). '
    'children: array of child entity_codes that share this aggregate''s lock. '
    'references_excluded: master records referenced but not owned by this aggregate (supplier, etc.).';
