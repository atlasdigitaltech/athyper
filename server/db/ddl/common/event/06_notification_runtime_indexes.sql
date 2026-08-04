CREATE INDEX notification_delivery_claim_expiry_idx ON event.notification_delivery_claim (expires_at) WHERE completed_at IS NULL;
CREATE INDEX digest_staging_pending_idx ON event.digest_staging (tenant_id, recipient_id, channel, frequency, staged_at) WHERE delivered_at IS NULL;
CREATE INDEX push_subscription_active_idx ON event.push_subscription (tenant_id, principal_id, plane_key, platform) WHERE is_active;
CREATE INDEX whatsapp_consent_current_idx ON event.whatsapp_consent (tenant_id, principal_id, consent_status);
CREATE INDEX webhook_subscription_topic_idx ON event.webhook_subscription USING gin (topics) WHERE is_active;
