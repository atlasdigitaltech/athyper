ALTER TABLE authz.entity_operation_scope_binding
    ADD CONSTRAINT entity_operation_scope_binding_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_scope_binding_permission_fk
        FOREIGN KEY (permission_id) REFERENCES authz.permission (id) ON DELETE RESTRICT;

