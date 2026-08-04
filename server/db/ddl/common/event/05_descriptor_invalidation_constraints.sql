ALTER TABLE event.descriptor_invalidation_outbox
    ADD CONSTRAINT descriptor_invalidation_outbox_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT descriptor_invalidation_outbox_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
