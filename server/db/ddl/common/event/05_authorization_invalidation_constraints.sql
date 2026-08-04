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
