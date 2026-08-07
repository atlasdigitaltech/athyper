ALTER TABLE event.comment_flag
    ADD CONSTRAINT comment_flag_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT comment_flag_comment_fk FOREIGN KEY (tenant_id, comment_id) REFERENCES document.comment(tenant_id, id),
    ADD CONSTRAINT comment_flag_reporter_fk FOREIGN KEY (tenant_id, reporter_principal_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT comment_flag_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT comment_flag_resolved_by_fk FOREIGN KEY (tenant_id, resolved_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE event.notification_message
    ADD CONSTRAINT notification_message_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT notification_message_rule_fk FOREIGN KEY (rule_id) REFERENCES control.notification_routing_rule(id);

ALTER TABLE event.notification_delivery
    ADD CONSTRAINT notification_delivery_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT notification_delivery_message_fk FOREIGN KEY (tenant_id, message_id) REFERENCES event.notification_message(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT notification_delivery_recipient_fk FOREIGN KEY (tenant_id, recipient_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT notification_delivery_provider_fk FOREIGN KEY (provider_id) REFERENCES control.notification_provider(id),
    ADD CONSTRAINT notification_delivery_outbox_fk FOREIGN KEY (tenant_id, outbox_id) REFERENCES event.outbox(tenant_id, id);

ALTER TABLE event.notification_inbox_state
    ADD CONSTRAINT notification_inbox_state_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT notification_inbox_state_message_fk FOREIGN KEY (tenant_id, message_id) REFERENCES event.notification_message(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT notification_inbox_state_delivery_fk FOREIGN KEY (tenant_id, delivery_id) REFERENCES event.notification_delivery(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT notification_inbox_state_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT notification_inbox_state_read_by_fk FOREIGN KEY (tenant_id, read_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT notification_inbox_state_dismissed_by_fk FOREIGN KEY (tenant_id, dismissed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE event.outbox
    ADD CONSTRAINT outbox_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id);

ALTER TABLE event.channel_consent_event
    ADD CONSTRAINT channel_consent_event_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT channel_consent_event_actor_fk FOREIGN KEY (tenant_id, actor_principal_id) REFERENCES master.principal(tenant_id, id);

ALTER TABLE event.command_execution
    ADD CONSTRAINT command_execution_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT command_execution_actor_fk
        FOREIGN KEY (tenant_id, actor_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT command_execution_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT command_execution_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT command_execution_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE event.authorization_invalidation_outbox
    ADD CONSTRAINT authorization_invalidation_outbox_scope_chk CHECK (
        (scope_kind = 'global' AND tenant_id IS NULL AND plane_code IS NULL)
        OR (scope_kind = 'tenant' AND tenant_id IS NOT NULL AND plane_code IS NULL)
        OR (scope_kind = 'plane' AND tenant_id IS NOT NULL AND plane_code IN ('athyper', 'neon', 'mesh'))
    ),
    ADD CONSTRAINT authorization_invalidation_outbox_epoch_chk CHECK (
        (epoch_applied_at IS NULL AND global_epoch IS NULL AND tenant_epoch IS NULL AND plane_epoch IS NULL)
        OR (epoch_applied_at IS NOT NULL AND global_epoch IS NOT NULL AND global_epoch >= 0
            AND (scope_kind = 'global' AND tenant_epoch IS NULL AND plane_epoch IS NULL
                OR scope_kind = 'tenant' AND tenant_epoch IS NOT NULL AND tenant_epoch > 0 AND plane_epoch IS NULL
                OR scope_kind = 'plane' AND tenant_epoch IS NOT NULL AND tenant_epoch >= 0 AND plane_epoch IS NOT NULL AND plane_epoch > 0))
    ),
    ADD CONSTRAINT authorization_invalidation_outbox_source_chk CHECK (
        authority_schema = 'authz' AND authority_table ~ '^[a-z][a-z0-9_]*$'
        AND authority_operation IN ('I', 'U', 'D')
        AND jsonb_typeof(source_row_key) = 'object' AND source_row_key <> '{}'::jsonb
    ),
    ADD CONSTRAINT authorization_invalidation_outbox_status_chk CHECK (status IN ('pending','processing','completed','failed','dead_letter','superseded')),
    ADD CONSTRAINT authorization_invalidation_outbox_attempt_chk CHECK (attempts >= 0 AND max_attempts > 0),
    ADD CONSTRAINT authorization_invalidation_outbox_lease_chk CHECK (
        (locked_at IS NULL AND locked_by IS NULL AND locked_until IS NULL)
        OR (locked_at IS NOT NULL AND locked_by IS NOT NULL AND locked_until > locked_at)
    ),
    ADD CONSTRAINT authorization_invalidation_outbox_processed_chk CHECK (
        (status = 'completed' AND processed_at IS NOT NULL) OR (status <> 'completed' AND processed_at IS NULL)
    ),
    ADD CONSTRAINT authorization_invalidation_outbox_time_chk CHECK (available_at >= effective_at AND available_at >= created_at),
    ADD CONSTRAINT authorization_invalidation_outbox_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE event.descriptor_invalidation_outbox
    ADD CONSTRAINT descriptor_invalidation_outbox_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT descriptor_invalidation_outbox_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

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
