CREATE INDEX authorization_invalidation_outbox_claim_idx
    ON event.authorization_invalidation_outbox (available_at, created_at, id)
    WHERE status IN ('pending', 'failed');
CREATE INDEX authorization_invalidation_outbox_lease_idx
    ON event.authorization_invalidation_outbox (locked_until, id) WHERE status = 'processing';
CREATE INDEX authorization_invalidation_outbox_scope_idx
    ON event.authorization_invalidation_outbox (scope_kind, tenant_id, plane_code, global_epoch, tenant_epoch, plane_epoch);
CREATE INDEX authorization_invalidation_outbox_source_idx
    ON event.authorization_invalidation_outbox (authority_table, effective_at, available_at);
