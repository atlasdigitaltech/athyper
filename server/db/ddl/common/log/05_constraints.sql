ALTER TABLE log.notification_delivery_attempt
    ADD CONSTRAINT notification_delivery_attempt_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT notification_delivery_attempt_delivery_fk FOREIGN KEY (tenant_id, delivery_id) REFERENCES event.notification_delivery(tenant_id, id),
    ADD CONSTRAINT notification_delivery_attempt_subscription_fk FOREIGN KEY (tenant_id, subscription_id) REFERENCES event.webhook_subscription(tenant_id, id);

ALTER TABLE log.notification_dlq
    ADD CONSTRAINT notification_dlq_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
