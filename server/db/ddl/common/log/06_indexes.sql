CREATE INDEX notification_delivery_attempt_delivery_idx ON log.notification_delivery_attempt (tenant_id, delivery_id, created_at DESC);
CREATE INDEX notification_delivery_attempt_purge_idx ON log.notification_delivery_attempt (purge_after) WHERE purge_after IS NOT NULL;
CREATE INDEX notification_dlq_open_idx ON log.notification_dlq (tenant_id, queue_name, created_at DESC) WHERE retried_at IS NULL;
