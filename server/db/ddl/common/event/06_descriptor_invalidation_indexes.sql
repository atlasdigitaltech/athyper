CREATE INDEX descriptor_invalidation_outbox_claim_idx
    ON event.descriptor_invalidation_outbox (available_at, created_at, id)
    WHERE status IN ('pending','failed');

CREATE INDEX descriptor_invalidation_outbox_lease_idx
    ON event.descriptor_invalidation_outbox (locked_until, id)
    WHERE status = 'processing';

CREATE INDEX descriptor_invalidation_outbox_scope_idx
    ON event.descriptor_invalidation_outbox
       (tenant_id, plane_key, entity_code, created_at DESC);

CREATE INDEX descriptor_invalidation_outbox_purge_idx
    ON event.descriptor_invalidation_outbox (processed_at)
    WHERE status = 'completed';
