ALTER TABLE event.notification_delivery_claim
    ADD CONSTRAINT notification_delivery_claim_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT notification_delivery_claim_message_fk FOREIGN KEY (tenant_id, message_id) REFERENCES event.notification_message(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT notification_delivery_claim_recipient_fk FOREIGN KEY (tenant_id, recipient_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE event.digest_staging
    ADD CONSTRAINT digest_staging_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT digest_staging_message_fk FOREIGN KEY (tenant_id, message_id) REFERENCES event.notification_message(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT digest_staging_recipient_fk FOREIGN KEY (tenant_id, recipient_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE event.push_subscription
    ADD CONSTRAINT push_subscription_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT push_subscription_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE event.whatsapp_consent
    ADD CONSTRAINT whatsapp_consent_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT whatsapp_consent_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE event.webhook_subscription
    ADD CONSTRAINT webhook_subscription_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE event.notification_delivery
    ADD CONSTRAINT notification_delivery_subscription_fk FOREIGN KEY (tenant_id, subscription_id) REFERENCES event.webhook_subscription(tenant_id, id) ON DELETE SET NULL;
