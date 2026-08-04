ALTER TABLE runtime_meta.authorization_epoch
    ADD CONSTRAINT authorization_epoch_scope_chk CHECK (
        (scope_kind = 'global' AND tenant_id IS NULL AND plane_code IS NULL)
        OR (scope_kind = 'tenant' AND tenant_id IS NOT NULL AND plane_code IS NULL)
        OR (scope_kind = 'plane' AND tenant_id IS NOT NULL AND plane_code IN ('athyper', 'neon', 'mesh'))
    ),
    ADD CONSTRAINT authorization_epoch_value_chk CHECK (epoch >= 0),
    ADD CONSTRAINT authorization_epoch_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON UPDATE RESTRICT ON DELETE CASCADE;
