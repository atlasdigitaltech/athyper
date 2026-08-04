CREATE INDEX comment_flag_comment_idx ON event.comment_flag (tenant_id, comment_id, status);
CREATE INDEX notification_message_dispatch_idx ON event.notification_message (tenant_id, status, created_at) WHERE status IN ('pending','planning','processing','delivering');
CREATE INDEX notification_message_entity_idx ON event.notification_message (tenant_id, entity_type, entity_id, created_at DESC) WHERE entity_id IS NOT NULL;
CREATE INDEX notification_delivery_dispatch_idx ON event.notification_delivery (tenant_id, status, next_retry_at) WHERE status IN ('pending','queued','failed');
CREATE INDEX notification_delivery_provider_idx ON event.notification_delivery (provider_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX notification_delivery_idempotency_uq ON event.notification_delivery (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX notification_inbox_state_unread_idx ON event.notification_inbox_state (tenant_id, principal_id, channel_code, created_at DESC) WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX notification_inbox_state_active_idx ON event.notification_inbox_state (tenant_id, principal_id, created_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX notification_inbox_state_message_idx ON event.notification_inbox_state (tenant_id, message_id);
CREATE INDEX outbox_dispatch_idx ON event.outbox (topic, available_at, created_at) WHERE status IN ('pending','failed');
CREATE UNIQUE INDEX outbox_event_key_uq ON event.outbox (tenant_id, event_key) WHERE event_key IS NOT NULL;
CREATE INDEX outbox_aggregate_idx ON event.outbox (tenant_id, aggregate_type, aggregate_id, created_at);
CREATE INDEX outbox_locked_idx ON event.outbox (locked_until) WHERE status = 'processing';
CREATE INDEX outbox_completed_purge_idx ON event.outbox (processed_at) WHERE status = 'completed';
CREATE INDEX channel_consent_event_subject_idx ON event.channel_consent_event (tenant_id, subject_type, subject_id, channel_code, occurred_at DESC);
CREATE INDEX command_execution_status_idx
    ON event.command_execution (tenant_id, status, received_at);

CREATE INDEX command_execution_expiry_idx
    ON event.command_execution (expires_at)
    WHERE status IN ('succeeded','failed','cancelled','expired');

CREATE INDEX command_execution_actor_idx
    ON event.command_execution (tenant_id, actor_principal_id, received_at DESC)
    WHERE actor_principal_id IS NOT NULL;

CREATE INDEX command_execution_correlation_idx
    ON event.command_execution (correlation_id)
    WHERE correlation_id IS NOT NULL;
