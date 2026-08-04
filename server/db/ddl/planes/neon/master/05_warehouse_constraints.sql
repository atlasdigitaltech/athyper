ALTER TABLE master.warehouse
    ADD CONSTRAINT warehouse_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT warehouse_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id),
    ADD CONSTRAINT warehouse_manager_fk FOREIGN KEY (tenant_id, manager_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT warehouse_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT warehouse_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT warehouse_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);
