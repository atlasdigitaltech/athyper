-- ============================================================================
-- Meta Entity Contract M3 indexes and idempotency keys.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ect_request_key_uq
    ON control.entity_contract_transition (entity_id, transition, request_key)
    WHERE request_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ect_version_timeline_idx
    ON control.entity_contract_transition (entity_version_id, occurred_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS epc_version_plane_uq
    ON snapshot.entity_plane_compiled (entity_version_id, plane_key);

CREATE INDEX IF NOT EXISTS epc_hash_lookup_idx
    ON snapshot.entity_plane_compiled (compiled_hash);

