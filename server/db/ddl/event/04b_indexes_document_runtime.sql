-- ============================================================================
-- event/04b_indexes_document_runtime.sql
-- Concept: Access paths for document runtime correctness primitives
-- ============================================================================

-- Claim/replay and lease recovery.
CREATE INDEX IF NOT EXISTS dri_in_progress_lease_idx
    ON event.document_runtime_idempotency (lease_expires_at)
    WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS dri_expiry_idx
    ON event.document_runtime_idempotency (expires_at);
CREATE INDEX IF NOT EXISTS dri_document_idx
    ON event.document_runtime_idempotency (tenant_id, entity_code, document_id, created_at DESC)
    WHERE document_id IS NOT NULL;

-- OPEN/HYDRATE reads obtain all current versions for one document in two bounded lookups.
CREATE INDEX IF NOT EXISTS drnv_document_idx
    ON event.document_runtime_node_version (tenant_id, entity_code, document_id, node_key);

-- Resume uses the signed workspace scope plus a cursor. Retention cleanup is bounded.
CREATE INDEX IF NOT EXISTS dre_document_cursor_idx
    ON event.document_runtime_event (tenant_id, entity_code, document_id, cursor);
CREATE INDEX IF NOT EXISTS dre_retention_idx
    ON event.document_runtime_event (retained_until);
