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

CREATE INDEX authorization_invalidation_outbox_claim_idx
    ON event.authorization_invalidation_outbox (available_at, created_at, id)
    WHERE status IN ('pending', 'failed');
CREATE INDEX authorization_invalidation_outbox_lease_idx
    ON event.authorization_invalidation_outbox (locked_until, id) WHERE status = 'processing';
CREATE INDEX authorization_invalidation_outbox_scope_idx
    ON event.authorization_invalidation_outbox (scope_kind, tenant_id, plane_code, global_epoch, tenant_epoch, plane_epoch);
CREATE INDEX authorization_invalidation_outbox_source_idx
    ON event.authorization_invalidation_outbox (authority_table, effective_at, available_at);

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

CREATE INDEX notification_delivery_claim_expiry_idx ON event.notification_delivery_claim (expires_at) WHERE completed_at IS NULL;
CREATE INDEX digest_staging_pending_idx ON event.digest_staging (tenant_id, recipient_id, channel, frequency, staged_at) WHERE delivered_at IS NULL;
CREATE INDEX push_subscription_active_idx ON event.push_subscription (tenant_id, principal_id, plane_key, platform) WHERE is_active;
CREATE INDEX whatsapp_consent_current_idx ON event.whatsapp_consent (tenant_id, principal_id, consent_status);
CREATE INDEX webhook_subscription_topic_idx ON event.webhook_subscription USING gin (topics) WHERE is_active;
