-- ============================================================================
-- log/01c_descriptor_cache_invalidation.sql
-- Concept: Append-only audit of descriptor-cache invalidation events.
-- Depends on: log/00_bootstrap.sql, shared/01_tables.sql (shared.uuidv7)
-- Scope:
--   Every cache-busting event (satellite write, version publish, persona/grant/
--   plan change, binding revoke, emergency override, manual purge) writes one
--   row here. Doubles as poller-fallback queue: when the pg_notify LISTEN
--   connection drops, the 30s poller scans WHERE processed_at IS NULL and
--   replays the invalidations into Redis.
-- Reference: docs/local/architecture/three-plane-permission-stack.md  D10
-- ============================================================================

CREATE TABLE IF NOT EXISTS log.descriptor_cache_invalidation (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    log_type            text        NOT NULL
                        GENERATED ALWAYS AS ('system') STORED,

    -- What was invalidated (any/all may be NULL for broad invalidations)
    tenant_id           uuid,
    entity_code         text,
    plane_key           text,

    -- Why
    reason              text        NOT NULL,
    triggered_by_table  text,                                       -- TG_TABLE_NAME of source trigger
    triggered_by_id     uuid,                                       -- source row id

    -- Listener bookkeeping
    processed_at        timestamptz,
    processed_by        text,                                       -- listener instance id (host:pid:uuid)
    redis_keys_deleted  integer,                                    -- count for ops visibility

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT dci_pkey         PRIMARY KEY (id, created_at),
    CONSTRAINT dci_reason_chk   CHECK (reason IN (
        'satellite_write','version_publish','persona_change',
        'grant_change','plan_change','binding_revoke',
        'emergency_override','manual'
    )),
    CONSTRAINT dci_plane_chk    CHECK (plane_key IS NULL
                                       OR plane_key IN ('neon','admin','mesh'))
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE log.descriptor_cache_invalidation IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Descriptor cache invalidation events. '
    'Source of truth for cache busting; pg_notify fans out the same event to the Node listener. '
    'Partitioned monthly. processed_at IS NULL rows are the poller-fallback work queue.';

COMMENT ON COLUMN log.descriptor_cache_invalidation.processed_at IS
    'Set by listener after Redis DEL succeeds. The 30s poller treats NULL rows as work to do.';

CREATE TABLE IF NOT EXISTS log.descriptor_cache_invalidation_default
    PARTITION OF log.descriptor_cache_invalidation DEFAULT;

CREATE INDEX IF NOT EXISTS dci_unprocessed_idx
    ON log.descriptor_cache_invalidation (created_at)
    WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS dci_tenant_entity_idx
    ON log.descriptor_cache_invalidation (tenant_id, entity_code, created_at DESC);
