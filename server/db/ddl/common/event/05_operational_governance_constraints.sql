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
