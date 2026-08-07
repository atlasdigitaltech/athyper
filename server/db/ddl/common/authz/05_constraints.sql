ALTER TABLE authz.application_projection ADD CONSTRAINT application_projection_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE authz.projection_provider ADD CONSTRAINT projection_provider_projection_fk FOREIGN KEY(tenant_id,projection_id) REFERENCES authz.application_projection(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE authz.projection_scope ADD CONSTRAINT projection_scope_projection_fk FOREIGN KEY(tenant_id,projection_id) REFERENCES authz.application_projection(tenant_id,id) ON DELETE RESTRICT,ADD CONSTRAINT projection_scope_target_fk FOREIGN KEY(tenant_id,scope_target_id) REFERENCES authz.scope_target(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE authz.entity_operation_scope_binding
    ADD CONSTRAINT entity_operation_scope_binding_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_scope_binding_permission_fk
        FOREIGN KEY (permission_id) REFERENCES authz.permission (id) ON DELETE RESTRICT;
